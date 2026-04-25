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
  // INVALID_MOVE 핸들링: useWebSocket.ts가 이미 resetPending()을 호출한다.
  // 이 hook에서는 pendingStore rollback + turnStateStore INVALID 전이를 추가한다.
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
