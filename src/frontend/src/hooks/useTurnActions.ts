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
  selectConfirmEnabled,
  selectTilesAdded,
  selectPendingPlacementScore,
} from "@/store/pendingStore";
import { useTurnStateStore } from "@/store/turnStateStore";
import { useGameStore } from "@/store/gameStore";
import { validateTurnPreCheck } from "@/lib/confirmValidator";
import { computeEffectiveMeld } from "@/lib/turnUtils";
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

  // turnStateStore selectors
  const turnState = useTurnStateStore((s) => s.state);

  // pendingStore selectors
  const draft = usePendingStore((s) => s.draft);

  // gameStore selectors (인라인 객체 selector 무한 루프 방지 — 필드별 개별 호출)
  const players = useGameStore((s) => s.players);
  const mySeat = useGameStore((s) => s.mySeat);

  // ---------------------------------------------------------------------------
  // Derived values
  // ---------------------------------------------------------------------------

  const hasInitialMeld = computeEffectiveMeld(players, mySeat);

  // ConfirmTurn 활성 조건 (UR-15): S6 && pending 유효 && tilesAdded >= 1 && score 충족
  // reactive selector로 derived value 계산
  const tilesAdded = usePendingStore((s) => {
    if (!s.draft) return 0;
    return Math.max(0, s.draft.turnStartRack.length - s.draft.myTiles.length);
  });
  const pendingPlacementScore = usePendingStore((s) => {
    if (!s.draft) return 0;
    const pendingOnlyGroups = s.draft.groups.filter((g) => s.draft!.pendingGroupIds.has(g.id));
    let total = 0;
    for (const group of pendingOnlyGroups) {
      for (const tile of group.tiles) {
        const parsed = tile.match(/^([RBYK])(\d+)[ab]$|^JK[12]$/);
        if (parsed && parsed[2]) total += parseInt(parsed[2], 10);
      }
    }
    return total;
  });
  const hasPending = usePendingStore((s) => s.draft !== null && s.draft.groups.length > 0);
  const allGroupsValid = usePendingStore((s) => {
    if (!s.draft) return false;
    const pendingGroups = s.draft.groups.filter((g) => s.draft!.pendingGroupIds.has(g.id));
    if (pendingGroups.length === 0) return false;
    return pendingGroups.every((g) => g.tiles.length >= 3);
  });

  const canConfirmState = turnState === "PENDING_READY";
  const confirmEnabled =
    canConfirmState &&
    hasPending &&
    tilesAdded >= 1 &&
    allGroupsValid &&
    (hasInitialMeld || pendingPlacementScore >= 30);

  // RESET 활성 조건
  const resetEnabled =
    turnState === "PENDING_BUILDING" ||
    turnState === "PENDING_READY" ||
    turnState === "INVALID_RECOVER" ||
    turnState === "JOKER_RECOVERED";

  // DRAW 활성 조건 (UR-22: MY_TURN_IDLE && pending 없음)
  const drawEnabled = turnState === "MY_TURN_IDLE" && draft === null;

  // ---------------------------------------------------------------------------
  // handleConfirm
  // ---------------------------------------------------------------------------
  const handleConfirm = useCallback(() => {
    // 최신 상태로 재확인 (stale closure 방지)
    const currentTurnState = useTurnStateStore.getState().state;
    const currentDraft = usePendingStore.getState().draft;
    const currentPlayers = useGameStore.getState().players;
    const currentMySeat = useGameStore.getState().mySeat;
    const currentHasInitialMeld = computeEffectiveMeld(currentPlayers, currentMySeat);

    if (currentTurnState !== "PENDING_READY") return;
    if (!currentDraft) return;

    const pendingOnlyGroups = currentDraft.groups.filter((g) =>
      currentDraft.pendingGroupIds.has(g.id)
    );
    const tilesAdded = selectTilesAdded(usePendingStore.getState());
    const score = selectPendingPlacementScore(usePendingStore.getState());

    if (!selectConfirmEnabled(usePendingStore.getState(), currentHasInitialMeld)) return;

    // V-01/02/03/04/14/15 클라이언트 미러 사전검증 (UR-36: 이 외 임의 게이트 금지)
    const validation = validateTurnPreCheck(
      pendingOnlyGroups,
      currentHasInitialMeld,
      score,
      tilesAdded
    );

    if (!validation.valid) {
      // 사전검증 실패: S6 → S5 (PRE_CHECK_FAIL)
      useTurnStateStore.getState().transition("PRE_CHECK_FAIL");
      return;
    }

    // S6 → S7 (COMMITTING)
    useTurnStateStore.getState().transition("CONFIRM");

    // CONFIRM_TURN C2S 발신
    const tableGroups = currentDraft.groups;
    const tilesFromRack = currentDraft.turnStartRack.filter(
      (t) => !currentDraft.myTiles.includes(t)
    );

    const payload: ConfirmTurnPayload = { tableGroups, tilesFromRack };
    wsSend("CONFIRM_TURN", payload);
  }, []);

  // ---------------------------------------------------------------------------
  // handleUndo
  // ---------------------------------------------------------------------------
  const handleUndo = useCallback(() => {
    const currentTurnState = useTurnStateStore.getState().state;
    const canReset =
      currentTurnState === "PENDING_BUILDING" ||
      currentTurnState === "PENDING_READY" ||
      currentTurnState === "INVALID_RECOVER" ||
      currentTurnState === "JOKER_RECOVERED";

    if (!canReset) return;

    // pending 초기화 (UR-04)
    usePendingStore.getState().reset();
    // S5/S6/S8/S10 → S1
    useTurnStateStore.getState().transition("RESET");
  }, []);

  // ---------------------------------------------------------------------------
  // handleDraw
  // ---------------------------------------------------------------------------
  const handleDraw = useCallback(() => {
    const currentTurnState = useTurnStateStore.getState().state;
    const currentDraft = usePendingStore.getState().draft;

    if (currentTurnState !== "MY_TURN_IDLE" || currentDraft !== null) return;

    // S1 → S9
    useTurnStateStore.getState().transition("DRAW");
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
