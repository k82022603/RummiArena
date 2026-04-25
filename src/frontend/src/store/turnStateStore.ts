"use client";

/**
 * turnStateStore — UI 턴 상태 머신 (L2 store)
 *
 * SSOT 매핑:
 *   - 56b §1 S0~S10 상태 12개
 *   - 56b §2 전이 다이어그램 24개
 *   - 58 §4.2 TurnStateStore 타입 정의
 *   - 58 §4.4 selector 정의
 *
 * 계층 규칙: L3 stateMachineGuard (순수 함수)만 import. L1 컴포넌트/L4 WS import 금지.
 */

import { create } from "zustand";
import {
  nextState,
  type TurnState,
  type TurnAction,
  type TransitionContext,
} from "@/lib/stateMachineGuard";

// ---------------------------------------------------------------------------
// 인터페이스 정의
// ---------------------------------------------------------------------------

interface TurnStateStore {
  /** 현재 FSM 상태 (S0~S10) */
  state: TurnState;

  /**
   * 상태 전이를 수행한다.
   * stateMachineGuard.nextState를 호출하여 56b 전이 규칙을 따른다.
   * null 반환 시 (허용되지 않는 전이) — 무시하고 현재 상태 유지.
   */
  transition(action: TurnAction, context?: TransitionContext): void;

  /** 전체 초기화 (게임 종료 / 방 이탈 시) */
  reset(): void;
}

// ---------------------------------------------------------------------------
// Store 구현
// ---------------------------------------------------------------------------

export const useTurnStateStore = create<TurnStateStore>()((set, get) => ({
  state: "OUT_OF_TURN",

  transition(action, context = {}) {
    const current = get().state;
    const next = nextState(current, action, context);
    if (next !== null && next !== current) {
      set({ state: next });
    }
  },

  reset() {
    set({ state: "OUT_OF_TURN" });
  },
}));

// ---------------------------------------------------------------------------
// Selectors (58 §4.4)
// ---------------------------------------------------------------------------

/**
 * 드래그 가능 여부: S1/S5/S6/S8에서만 true [56b §3.2]
 */
export function selectCanDrag(state: TurnStateStore): boolean {
  return (
    state.state === "MY_TURN_IDLE" ||
    state.state === "PENDING_BUILDING" ||
    state.state === "PENDING_READY" ||
    state.state === "INVALID_RECOVER"
  );
}

/**
 * ConfirmTurn 버튼 활성 여부: S6에서만 true [56b §3.2 S6 invariant]
 */
export function selectCanConfirm(state: TurnStateStore): boolean {
  return state.state === "PENDING_READY";
}

/**
 * DRAW 버튼 활성 여부: S1에서만 true [56b §3.2 S1 invariant]
 */
export function selectCanDraw(state: TurnStateStore): boolean {
  return state.state === "MY_TURN_IDLE";
}

/**
 * RESET 버튼 활성 여부: S5/S6/S8/S10에서만 true [56b TurnAction.RESET]
 */
export function selectCanReset(state: TurnStateStore): boolean {
  return (
    state.state === "PENDING_BUILDING" ||
    state.state === "PENDING_READY" ||
    state.state === "INVALID_RECOVER" ||
    state.state === "JOKER_RECOVERED"
  );
}

// ---------------------------------------------------------------------------
// 타입 재export (외부에서 사용 편의)
// ---------------------------------------------------------------------------

export type { TurnState, TurnAction, TransitionContext };
