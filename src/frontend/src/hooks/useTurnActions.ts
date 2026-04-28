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
import {
  usePendingStore,
  selectTilesAdded,
  selectPendingPlacementScore,
  selectAllGroupsValid,
  selectHasPending,
} from "@/store/pendingStore";
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

  // ---------------------------------------------------------------------------
  // [2026-04-28 Phase B] pendingStore.draft 기반 SSOT 전환 (재전환)
  //
  // 배경:
  //   P0(2026-04-28 오전): pendingStore.draft가 TURN_START 스냅샷에 고착되는 문제로
  //   임시로 gameStore.pending* 필드 기반으로 전환했었음.
  //
  //   Phase A(2026-04-28 오후): GameClient.handleDragEnd의 9개 inline 분기에
  //   pendingStore.applyMutation dual-write가 추가되어 pendingStore.draft가
  //   최신 값을 가지게 되었음. 또한 useGameSync가 TURN_START 시
  //   pendingStore.saveTurnStartSnapshot()을 호출해 turnStartRack 기준점을 갱신.
  //
  // 현재(Phase B):
  //   pendingStore.draft + selectors를 직접 사용한다 (58 §4.4).
  //   - hasPending: selectHasPending(state)
  //   - tilesAdded: selectTilesAdded(state)  // turnStartRack 기준
  //   - allGroupsValid: selectAllGroupsValid(state)
  //   - pendingPlacementScore: selectPendingPlacementScore(state)
  // ---------------------------------------------------------------------------

  // pendingStore selectors — getState 기반 단발 호출이 아닌 reactive 구독으로 사용
  const hasPending = usePendingStore((s) => selectHasPending(s));
  const tilesAdded = usePendingStore((s) => selectTilesAdded(s));
  const allGroupsValid = usePendingStore((s) => selectAllGroupsValid(s));
  const pendingPlacementScore = usePendingStore((s) => selectPendingPlacementScore(s));

  const hasInitialMeld = computeEffectiveMeld(players, mySeat);

  // isMyTurn: gameState.currentSeat vs mySeat (ActionBar fallback과 동일한 출처)
  const isMyTurn = computeIsMyTurn(gameState?.currentSeat ?? -1, mySeat);

  // confirmEnabled: ActionBar fallback과 동등 + 초기 등록 미완료 시 30점 게이트 (UR-15)
  const confirmEnabled =
    isMyTurn &&
    hasPending &&
    tilesAdded >= 1 &&
    allGroupsValid &&
    (hasInitialMeld || pendingPlacementScore >= 30);

  // RESET 활성 조건: pending이 있으면 초기화 가능 (ActionBar fallback: hasPending)
  const resetEnabled = hasPending;

  // DRAW 활성 조건 (UR-22): 내 턴 && pending 없음
  const drawEnabled = isMyTurn && !hasPending;

  // ---------------------------------------------------------------------------
  // handleConfirm — pendingStore.draft 기반 (Phase B)
  // ---------------------------------------------------------------------------
  const handleConfirm = useCallback(() => {
    // 최신 상태로 재확인 (stale closure 방지)
    const gs = useGameStore.getState();
    const ps = usePendingStore.getState();
    const draft = ps.draft;

    // pending 없으면 확정 불가
    if (draft === null || draft.groups.length === 0) return;

    const currentPlayers = gs.players;
    const currentMySeat = gs.mySeat;
    const currentGameState = gs.gameState;
    const currentHasInitialMeld = computeEffectiveMeld(currentPlayers, currentMySeat);

    // isMyTurn gate (UR-22 확장: 내 턴이 아니면 확정 불가)
    const currentIsMyTurn = computeIsMyTurn(currentGameState?.currentSeat ?? -1, currentMySeat);
    if (!currentIsMyTurn) return;

    // pending 전용 그룹: pendingGroupIds에 포함된 그룹만 검증 대상
    const pendingOnlyGroups = draft.groups.filter((g) => draft.pendingGroupIds.has(g.id));

    // tilesAdded: turnStartRack 기준
    const currentTilesAdded = selectTilesAdded(ps);
    const score = computePendingScore(pendingOnlyGroups);

    // UR-15 종합 조건 재확인
    const currentAllGroupsValid =
      pendingOnlyGroups.length > 0 && pendingOnlyGroups.every((g) => g.tiles.length >= 3);
    if (
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
    // tilesFromRack: 턴 시작 랙(turnStartRack)에서 현재 랙(myTiles)에 없는 타일
    const tilesFromRack = draft.turnStartRack.filter((t) => !draft.myTiles.includes(t));

    const payload: ConfirmTurnPayload = { tableGroups: draft.groups, tilesFromRack };
    wsSend("CONFIRM_TURN", payload);
  }, []);

  // ---------------------------------------------------------------------------
  // handleUndo — pendingStore.reset 기반 (Phase B)
  // ---------------------------------------------------------------------------
  const handleUndo = useCallback(() => {
    const ps = usePendingStore.getState();
    if (ps.draft === null) return;

    // pending 초기화 (UR-04) — pendingStore.reset()
    ps.reset();
    // gameStore deprecated 필드도 동기화 (Phase C에서 제거 예정)
    useGameStore.getState().resetPending();
  }, []);

  // ---------------------------------------------------------------------------
  // handleDraw — pendingStore 기반 (Phase B)
  // ---------------------------------------------------------------------------
  const handleDraw = useCallback(() => {
    const gs = useGameStore.getState();
    const ps = usePendingStore.getState();
    const currentIsMyTurn = computeIsMyTurn(gs.gameState?.currentSeat ?? -1, gs.mySeat);
    const currentHasPending = selectHasPending(ps);

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
