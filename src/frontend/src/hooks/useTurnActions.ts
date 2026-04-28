"use client";

/**
 * useTurnActions — ConfirmTurn / RESET / DRAW 액션 hook (L2)
 *
 * SSOT 매핑:
 *   - 58 §2 F-09: ConfirmTurn (턴 확정)
 *   - 58 §2 F-11: DRAW / 자동 패스
 *   - A14~A16: 확정/초기화/드로우 행동
 *   - UR-15: confirmEnabled 사전조건
 *   - UR-22: drawEnabled = pendingCount === 0 && MY_TURN_IDLE
 *   - UR-36: confirmValidator 외 임의 게이트 추가 금지
 *
 * 계층 규칙: L2 store + L3 순수 함수만 import. L1/L4 import 금지.
 * WS 전송은 gameStore에 저장된 send 함수 ref를 통해 간접 호출.
 * WS는 useWebSocket에서 관리 — 이 hook은 직접 ref를 갖지 않는다.
 */

import { useCallback } from "react";
import { usePendingStore } from "@/store/pendingStore";
import { useGameStore } from "@/store/gameStore";
import { validateTurnPreCheck } from "@/lib/confirmValidator";
import {
  computeEffectiveMeld,
  computeIsMyTurn,
  computePendingScore,
} from "@/lib/turnUtils";
import type { ConfirmTurnPayload } from "@/types/websocket";

// ---------------------------------------------------------------------------
// WS 발신 브릿지 (싱글톤 ref 저장소)
// ---------------------------------------------------------------------------

/**
 * L2 hook이 WS를 직접 import하지 않기 위한 발신 브릿지.
 * useWebSocket이 마운트 시 이 ref를 설정한다.
 * useTurnActions는 이 ref를 통해 C2S 메시지를 발신한다.
 *
 * 의도: useWebSocket.ts를 이번 Phase에서 최소 수정하고,
 * Phase 3에서 wsStore.send로 점진 위임한다 (58 §5.2 설계 원칙).
 */
let _sendBridge: ((type: string, payload: unknown) => void) | null = null;

export function registerWSSendBridge(
  fn: (type: string, payload: unknown) => void
): void {
  _sendBridge = fn;
}

export function unregisterWSSendBridge(): void {
  _sendBridge = null;
}

function wsSend(type: string, payload: unknown): void {
  if (_sendBridge) {
    _sendBridge(type, payload);
  } else {
    console.warn("[useTurnActions] WS bridge not registered, dropping:", type);
  }
}

// ---------------------------------------------------------------------------
// Hook 인터페이스
// ---------------------------------------------------------------------------

export interface UseTurnActionsReturn {
  handleConfirm: () => void;
  handleUndo: () => void;
  handleDraw: () => void;
  confirmEnabled: boolean;
  resetEnabled: boolean;
  drawEnabled: boolean;
}

// ---------------------------------------------------------------------------
// Hook 구현
// ---------------------------------------------------------------------------

/**
 * ActionBar 버튼 3종(Confirm / Undo / Draw)의 핸들러와 활성 조건을 제공한다.
 *
 * 컴포넌트에서는 props로만 수신하고, 로직은 이 hook에 집중한다 (58 §2 F-09/F-11).
 *
 * 참고: usePendingStore() / useTurnStateStore() 전체 객체 구독은 React 19에서
 *       매 렌더마다 새 참조를 반환해 무한 루프를 유발한다.
 *       각 필드 / selector는 개별 호출로 분리한다.
 */
export function useTurnActions(): UseTurnActionsReturn {
  // ---------------------------------------------------------------------------
  // Reactive state — 개별 selector 구독
  // ---------------------------------------------------------------------------

  // gameStore selectors (인라인 객체 selector 무한 루프 방지 — 필드별 개별 호출)
  const players = useGameStore((s) => s.players);
  const mySeat = useGameStore((s) => s.mySeat);
  const gameState = useGameStore((s) => s.gameState);
  const myTiles = useGameStore((s) => s.myTiles);

  // ---------------------------------------------------------------------------
  // [2026-04-28] pendingStore.draft → gameStore pending 필드로 SSOT 전환
  //
  // 근본 원인:
  //   GameClient.handleDragEnd는 gameStore.setPendingTableGroups() 등을 업데이트하고
  //   pendingStore.draft는 TURN_START 스냅샷에 고착되어 있었다.
  //   따라서 pendingStore를 읽으면 confirmEnabled/drawEnabled/resetEnabled가
  //   항상 초기값(false/false/false)으로 잘못 계산됨.
  //
  // 수정:
  //   gameStore의 pendingTableGroups/pendingMyTiles/pendingGroupIds를 직접 읽는다.
  //   이 필드들이 @deprecated 마킹되어 있지만 현재 실제 SSOT이다.
  //   ActionBar fallback 로직(isMyTurn + hasPending + allGroupsValid)과 동등하게 맞춘다.
  //
  // pendingStore 전환 전제조건 (P2b):
  //   GameClient.handleDragEnd의 나머지 6개 inline 분기에
  //   pendingStore.applyMutation dual-write가 추가되어야 pendingStore.draft가 최신 값을 갖게 됨.
  //   현재는 dragEndReducer 경로(2곳) + jokerSwap(1곳)만 dual-write 중.
  //   gameStore.ts의 deprecated 주석 블록에 전체 로드맵 기재.
  // ---------------------------------------------------------------------------

  // @deprecated 필드이나 현재 SSOT — Phase 3 완전 제거 예정
  const pendingTableGroups = useGameStore((s) => s.pendingTableGroups);
  const pendingMyTiles = useGameStore((s) => s.pendingMyTiles);
  const pendingGroupIds = useGameStore((s) => s.pendingGroupIds);

  const hasInitialMeld = computeEffectiveMeld(players, mySeat);

  // isMyTurn: gameState.currentSeat vs mySeat (ActionBar fallback과 동일한 출처)
  const isMyTurn = computeIsMyTurn(gameState?.currentSeat ?? -1, mySeat);

  // hasPending: pendingTableGroups !== null (gameStore SSOT)
  const hasPending = pendingTableGroups !== null;

  // tilesAdded: 턴 시작 랙(myTiles) - 현재 랙(pendingMyTiles)
  // pendingMyTiles가 null이면 아직 보드에 타일을 옮기지 않은 상태 → tilesAdded = 0
  const tilesAdded = pendingMyTiles !== null
    ? Math.max(0, myTiles.length - pendingMyTiles.length)
    : 0;

  // allGroupsValid: pendingGroupIds에 속하는 그룹이 모두 3장 이상 (UR-15, V-02)
  const allGroupsValid = (() => {
    if (!pendingTableGroups || pendingGroupIds.size === 0) return false;
    const pendingGroups = pendingTableGroups.filter((g) => pendingGroupIds.has(g.id));
    if (pendingGroups.length === 0) return false;
    return pendingGroups.every((g) => g.tiles.length >= 3);
  })();

  // pendingPlacementScore: pending 전용 그룹 점수 합계 (V-04 클라이언트 미러)
  const pendingPlacementScore = (() => {
    if (!pendingTableGroups) return 0;
    const pendingOnlyGroups = pendingTableGroups.filter((g) => pendingGroupIds.has(g.id));
    return computePendingScore(pendingOnlyGroups);
  })();

  // confirmEnabled: ActionBar fallback과 동등 + 초기 등록 미완료 시 30점 게이트 (UR-15)
  const confirmEnabled =
    isMyTurn &&
    hasPending &&
    tilesAdded >= 1 &&
    allGroupsValid &&
    (hasInitialMeld || pendingPlacementScore >= 30);

  // RESET 활성 조건: pending이 있으면 초기화 가능 (ActionBar fallback: hasPending)
  const resetEnabled = hasPending;

  // DRAW 활성 조건 (UR-22): 내 턴 && pending 없음 (pendingTableGroups === null)
  const drawEnabled = isMyTurn && !hasPending;

  // ---------------------------------------------------------------------------
  // handleConfirm
  // ---------------------------------------------------------------------------
  const handleConfirm = useCallback(() => {
    // 최신 상태로 재확인 (stale closure 방지) — gameStore 기반 (2026-04-28 SSOT 전환)
    const gs = useGameStore.getState();
    const currentPendingTableGroups = gs.pendingTableGroups;
    const currentPendingMyTiles = gs.pendingMyTiles;
    const currentPendingGroupIds = gs.pendingGroupIds;
    const currentMyTiles = gs.myTiles;
    const currentPlayers = gs.players;
    const currentMySeat = gs.mySeat;
    const currentGameState = gs.gameState;
    const currentHasInitialMeld = computeEffectiveMeld(currentPlayers, currentMySeat);

    // pending 없으면 확정 불가
    if (!currentPendingTableGroups || !currentPendingMyTiles) return;

    // isMyTurn gate (UR-22 확장: 내 턴이 아니면 확정 불가)
    const currentIsMyTurn = computeIsMyTurn(currentGameState?.currentSeat ?? -1, currentMySeat);
    if (!currentIsMyTurn) return;

    const pendingOnlyGroups = currentPendingTableGroups.filter((g) =>
      currentPendingGroupIds.has(g.id)
    );

    // tilesAdded: 턴 시작 랙(myTiles) vs 현재 랙(pendingMyTiles)
    const currentTilesAdded = Math.max(0, currentMyTiles.length - currentPendingMyTiles.length);
    const score = computePendingScore(pendingOnlyGroups);

    // UR-15 종합 조건 재확인
    const currentHasPending = currentPendingTableGroups !== null;
    const currentAllGroupsValid =
      pendingOnlyGroups.length > 0 && pendingOnlyGroups.every((g) => g.tiles.length >= 3);
    if (
      !currentHasPending ||
      currentTilesAdded < 1 ||
      !currentAllGroupsValid ||
      (!currentHasInitialMeld && score < 30)
    ) return;

    // V-01/02/03/04/14/15 클라이언트 미러 사전검증 (UR-36: 이 외 임의 게이트 금지)
    const validation = validateTurnPreCheck(
      pendingOnlyGroups,
      currentHasInitialMeld,
      score,
      currentTilesAdded
    );

    if (!validation.valid) {
      return;
    }

    // CONFIRM_TURN C2S 발신
    // tilesFromRack: 턴 시작 랙(myTiles)에서 현재 랙(pendingMyTiles)에 없는 타일
    const tilesFromRack = currentMyTiles.filter((t) => !currentPendingMyTiles.includes(t));

    const payload: ConfirmTurnPayload = { tableGroups: currentPendingTableGroups, tilesFromRack };
    wsSend("CONFIRM_TURN", payload);
  }, []);

  // ---------------------------------------------------------------------------
  // handleUndo
  // ---------------------------------------------------------------------------
  const handleUndo = useCallback(() => {
    // [2026-04-28] gameStore 기반으로 전환: pendingTableGroups 유무로 pending 확인
    const currentPendingTableGroups = useGameStore.getState().pendingTableGroups;
    if (!currentPendingTableGroups) return;

    // pending 초기화 (UR-04) — gameStore.resetPending() 사용
    useGameStore.getState().resetPending();
    // pendingStore도 동기화 (pendingStore 구독자 호환성 유지)
    usePendingStore.getState().reset();
  }, []);

  // ---------------------------------------------------------------------------
  // handleDraw
  // ---------------------------------------------------------------------------
  const handleDraw = useCallback(() => {
    // [2026-04-28] gameStore 기반으로 전환: isMyTurn + pendingTableGroups === null
    const gs = useGameStore.getState();
    const currentIsMyTurn = computeIsMyTurn(gs.gameState?.currentSeat ?? -1, gs.mySeat);
    const currentHasPending = gs.pendingTableGroups !== null;

    if (!currentIsMyTurn || currentHasPending) return;

    // DRAW_TILE C2S 발신
    wsSend("DRAW_TILE", {});
  }, []);

  return {
    handleConfirm,
    handleUndo,
    handleDraw,
    confirmEnabled,
    resetEnabled,
    drawEnabled,
  };
}
