"use client";

/**
 * useGameSync — WS S2C 메시지 → store dispatch 연동 hook (L2)
 *
 * SSOT 매핑:
 *   - 58 §5.1 S2C 이벤트 매핑
 *   - A18~A21: 서버 이벤트 수신 후 상태 전이
 *   - F-01: TURN_START 수신 → pendingStore 스냅샷 저장
 *   - F-13: INVALID_MOVE 수신 → rollback + INVALID 전이
 *   - F-16: GAME_OVER 수신 → GAME_OVER 전이
 *
 * 구현 방식:
 *   gameStore의 상태 변화를 subscribeWithSelector로 구독하여 파생 동작 실행.
 *   useWebSocket.ts를 직접 수정하지 않고 별도 hook으로 추가 연동만 작성 (Phase 3에서 점진 위임).
 *
 * 계층 규칙: L2 store만 import. L3 순수 함수 호출 가능. L1/L4 import 금지.
 */

import { useEffect } from "react";
import { useGameStore } from "@/store/gameStore";
import { usePendingStore } from "@/store/pendingStore";
import { useTurnStateStore } from "@/store/turnStateStore";
import { useWSStore } from "@/store/wsStore";
import { computeIsMyTurn } from "@/lib/turnUtils";
import type { TileCode, TableGroup } from "@/types/tile";

// ---------------------------------------------------------------------------
// Hook 구현
// ---------------------------------------------------------------------------

/**
 * 서버 S2C 이벤트를 감지하여 pendingStore / turnStateStore를 갱신한다.
 *
 * useWebSocket.ts의 핸들러에서 이미 gameStore를 업데이트하고 있으므로,
 * 이 hook은 gameStore 변화를 구독하여 새 store 구조에 맞는 파생 동작을 추가한다.
 *
 * TURN_START 감지: gameState.currentSeat 변경 + mySeat 비교
 * TURN_END 감지: turnNumber 변경 (TURN_END 후 nextTurnNumber 갱신됨)
 * INVALID_MOVE 감지: wsStore.lastError 변화 감지 (useWebSocket이 resetPending 호출 후)
 * GAME_OVER 감지: gameEnded 플래그 변화
 *
 * @param roomId 게임 룸 ID (구독 범위 제한)
 */
export function useGameSync(_roomId: string): void {
  // store 객체 전체를 reactive하게 구독하면 React 19에서 매 렌더마다 새 참조를 반환해 무한 루프 유발.
  // subscribe 콜백 내부에서만 .getState()로 최신 값을 읽도록 한다 — deps에서 제거.

  // ---------------------------------------------------------------------------
  // TURN_START 감지 — gameState.currentSeat + turnNumber 변화 + mySeat 비교
  // ---------------------------------------------------------------------------
  useEffect(() => {
    const unsubscribe = useGameStore.subscribe(
      // selector: 턴 전환을 감지하는 데 필요한 최소 상태
      (state) => ({
        currentSeat: state.gameState?.currentSeat ?? null,
        mySeat: state.mySeat,
        myTiles: state.myTiles,
        tableGroups: state.gameState?.tableGroups ?? [],
        turnNumber: state.turnNumber,
      }),
      (next, prev) => {
        // turnNumber가 증가하거나 currentSeat이 변경되면 TURN_START로 간주
        const seatChanged = next.currentSeat !== prev.currentSeat;
        const turnNumberChanged = next.turnNumber !== prev.turnNumber;

        if (!seatChanged && !turnNumberChanged) return;
        if (next.currentSeat === null) return;

        // -------------------------------------------------------------------
        // BUG-GHOST-002 v2: TURN_START race 보강 — myTilesEmpty 단독 판정
        //
        // 기존: isFirstEntry(prev.currentSeat===null) && myTilesEmpty 이중 조건.
        //   → 첫 진입이 아닌 케이스(prev.currentSeat !== null)에서 myTiles가
        //     비어있어도 race window로 처리되지 않아 빈 스냅샷이 저장되는 문제.
        //
        // v2: myTilesEmpty 단독 판정.
        //   - next.myTiles.length === 0 이면 항상 스냅샷 저장 스킵.
        //   - 백필 effect(하단)가 myTilesRef 교체를 감지하여 스냅샷을 저장한다.
        //   - 정상 종료(마지막 타일 0장 배치 승리)는 GAME_OVER 이벤트로 처리되므로
        //     TURN_START 콜백에서 0장 케이스를 별도 처리할 필요 없음.
        // -------------------------------------------------------------------
        const myTilesEmpty = next.myTiles.length === 0;
        if (myTilesEmpty) {
          // race window 또는 타일 소진: stale groups가 남지 않도록 draft 초기화.
          // 백필 effect가 myTilesRef 교체를 감지 후 스냅샷을 저장한다.
          usePendingStore.setState({ draft: null });
          const isMyTurn = computeIsMyTurn(next.currentSeat, next.mySeat);
          useTurnStateStore.getState().transition("TURN_START", { isMyTurn });
          return;
        }

        const isMyTurn = computeIsMyTurn(next.currentSeat, next.mySeat);

        // pendingStore 초기화 + 스냅샷 저장 (UR-04, F-01)
        const pending = usePendingStore.getState();
        pending.reset();
        pending.saveTurnStartSnapshot(next.myTiles, next.tableGroups);

        // turnStateStore 전이 (S0/S1)
        useTurnStateStore.getState().transition("TURN_START", { isMyTurn });
      },
      { equalityFn: shallowEqualTurnState }
    );

    return unsubscribe;
  }, []);

  // ---------------------------------------------------------------------------
  // BUG-GHOST-002 v2: 백필 effect — myTilesRef 변경 기반 게이트 완화
  //
  //   기존 게이트 (prev.myTilesLength === 0 → next.myTilesLength > 0) 는
  //   "빈 → 채워짐" 전이 1회만 트리거하여, 동일 길이로 myTiles 배열 참조가
  //   교체되는 케이스(턴 교체 후 동일 장수 지급 등)를 처리하지 못했다.
  //
  //   v2 게이트: myTilesRef(배열 참조)가 실제로 교체될 때마다 트리거.
  //     - next.myTilesLength === 0 이면 스킵 (타일 없는 상태는 스냅샷 불필요)
  //     - prev.myTilesRef === next.myTilesRef 이면 스킵 (참조 동일 = 변화 없음)
  //     - pendingGroupIds.size > 0 이면 스킵 (드래그 진행 중 덮어쓰기 방지)
  //
  //   equalityFn에 myTilesRef 비교를 추가하여 zustand subscribeWithSelector가
  //   참조 변경 시마다 콜백을 발동시키도록 한다.
  // ---------------------------------------------------------------------------
  useEffect(() => {
    const unsubscribe = useGameStore.subscribe(
      (state) => ({
        myTilesLength: state.myTiles.length,
        myTilesRef: state.myTiles,
        currentSeat: state.gameState?.currentSeat ?? null,
        tableGroups: state.gameState?.tableGroups ?? [],
      }),
      (next, prev) => {
        // BUG-GHOST-002 v2: myTilesRef 변경 시 백필 (race 게이트 완화)
        if (next.myTilesLength === 0) return;
        if (next.currentSeat === null) return;
        if (prev.myTilesRef === next.myTilesRef) return;

        const pending = usePendingStore.getState();
        // draft가 이미 존재하면 덮어쓰지 않음 (드래그 시작 후 사용자 상태 보존)
        if (pending.draft !== null) return;

        pending.saveTurnStartSnapshot(
          next.myTilesRef as TileCode[],
          next.tableGroups as TableGroup[]
        );
      },
      {
        equalityFn: (a, b) =>
          a.myTilesLength === b.myTilesLength &&
          a.myTilesRef === b.myTilesRef &&
          a.currentSeat === b.currentSeat &&
          a.tableGroups.length === b.tableGroups.length,
      }
    );
    return unsubscribe;
  }, []);

  // ---------------------------------------------------------------------------
  // GAME_OVER 감지 — gameEnded 플래그 변화
  // ---------------------------------------------------------------------------
  useEffect(() => {
    const unsubscribe = useGameStore.subscribe(
      (state) => state.gameEnded,
      (gameEnded, prevGameEnded) => {
        if (gameEnded && !prevGameEnded) {
          // pendingStore 초기화 후 GAME_OVER 전이
          usePendingStore.getState().reset();
          useTurnStateStore.getState().transition("GAME_OVER");
        }
      }
    );

    return unsubscribe;
  }, []);

  // ---------------------------------------------------------------------------
  // INVALID_MOVE 감지 — wsStore.lastError 변화
  // ---------------------------------------------------------------------------
  // INVALID_MOVE 핸들링: useWebSocket.ts가 이미 gameStore.resetPending()을 호출한다.
  // 이 hook에서는 pendingStore rollback + turnStateStore INVALID 전이를 추가한다.
  // 양쪽은 서로 다른 store를 초기화하므로 중복이 아니라 보완 관계:
  //   - useWebSocket.ts resetPending() → gameStore deprecated pending 필드 초기화
  //   - 이 hook rollbackToServerSnapshot() → pendingStore.draft 롤백
  // wsStore.lastError 값이 설정되는 시점 = INVALID_MOVE 수신 시점으로 간주한다.
  // Phase 3에서 wsStore에 explicit INVALID_MOVE 이벤트 필드를 추가할 예정.
  useEffect(() => {
    // useWSStore는 subscribeWithSelector 미들웨어 없음 — (state, prevState) 단일 콜백 형식 사용
    const unsubscribe = useWSStore.subscribe((state, prevState) => {
      const lastError = state.lastError;
      const prevLastError = prevState.lastError;
      if (lastError && lastError !== prevLastError) {
        // INVALID_MOVE 수신 시 rollback + INVALID 전이 (F-13)
        usePendingStore.getState().rollbackToServerSnapshot();
        useTurnStateStore.getState().transition("INVALID");
      }
    });

    return unsubscribe;
  }, []);
}

// ---------------------------------------------------------------------------
// 내부 헬퍼
// ---------------------------------------------------------------------------

interface TurnStateSnapshot {
  currentSeat: number | null;
  mySeat: number;
  myTiles: unknown[];
  tableGroups: unknown[];
  turnNumber: number;
}

function shallowEqualTurnState(
  a: TurnStateSnapshot,
  b: TurnStateSnapshot
): boolean {
  return (
    a.currentSeat === b.currentSeat &&
    a.mySeat === b.mySeat &&
    a.turnNumber === b.turnNumber &&
    a.myTiles.length === b.myTiles.length &&
    a.tableGroups.length === b.tableGroups.length
  );
}
