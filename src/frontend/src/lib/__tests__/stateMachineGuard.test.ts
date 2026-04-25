/**
 * stateMachineGuard.ts 단위 테스트
 *
 * SSOT: 56b 전이 24개, canTransition, nextState
 */

import { nextState, canTransition } from "@/lib/stateMachineGuard";
import type { TurnState, TurnAction } from "@/lib/stateMachineGuard";

// ---------------------------------------------------------------------------
// S0: OUT_OF_TURN
// ---------------------------------------------------------------------------

describe("[stateMachineGuard] S0 OUT_OF_TURN", () => {
  it("TURN_START + isMyTurn=true → MY_TURN_IDLE (S1)", () => {
    expect(nextState("OUT_OF_TURN", "TURN_START", { isMyTurn: true })).toBe("MY_TURN_IDLE");
  });

  it("TURN_START + isMyTurn=false → OUT_OF_TURN (S0 유지)", () => {
    expect(nextState("OUT_OF_TURN", "TURN_START", { isMyTurn: false })).toBe("OUT_OF_TURN");
  });

  it("DRAG_START_RACK → null (허용 안 됨)", () => {
    expect(nextState("OUT_OF_TURN", "DRAG_START_RACK")).toBeNull();
  });

  it("CONFIRM → null", () => {
    expect(nextState("OUT_OF_TURN", "CONFIRM")).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// S1: MY_TURN_IDLE
// ---------------------------------------------------------------------------

describe("[stateMachineGuard] S1 MY_TURN_IDLE", () => {
  it("DRAG_START_RACK → DRAGGING_FROM_RACK (S2)", () => {
    expect(nextState("MY_TURN_IDLE", "DRAG_START_RACK")).toBe("DRAGGING_FROM_RACK");
  });

  it("DRAW → DRAWING (S9)", () => {
    expect(nextState("MY_TURN_IDLE", "DRAW")).toBe("DRAWING");
  });

  it("TURN_START + isMyTurn=false → OUT_OF_TURN", () => {
    expect(nextState("MY_TURN_IDLE", "TURN_START", { isMyTurn: false })).toBe("OUT_OF_TURN");
  });

  it("CONFIRM → null (pending 없을 때 불허)", () => {
    expect(nextState("MY_TURN_IDLE", "CONFIRM")).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// S2: DRAGGING_FROM_RACK
// ---------------------------------------------------------------------------

describe("[stateMachineGuard] S2 DRAGGING_FROM_RACK", () => {
  it("DROP_OK → PENDING_BUILDING (S5)", () => {
    expect(nextState("DRAGGING_FROM_RACK", "DROP_OK")).toBe("PENDING_BUILDING");
  });

  it("DRAG_CANCEL → MY_TURN_IDLE (S1, pending 없음 기본)", () => {
    expect(nextState("DRAGGING_FROM_RACK", "DRAG_CANCEL")).toBe("MY_TURN_IDLE");
  });

  it("CONFIRM → null", () => {
    expect(nextState("DRAGGING_FROM_RACK", "CONFIRM")).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// S5: PENDING_BUILDING
// ---------------------------------------------------------------------------

describe("[stateMachineGuard] S5 PENDING_BUILDING", () => {
  it("DRAG_START_RACK → DRAGGING_FROM_RACK (S2)", () => {
    expect(nextState("PENDING_BUILDING", "DRAG_START_RACK")).toBe("DRAGGING_FROM_RACK");
  });

  it("DRAG_START_PENDING → DRAGGING_FROM_PENDING (S3)", () => {
    expect(nextState("PENDING_BUILDING", "DRAG_START_PENDING")).toBe("DRAGGING_FROM_PENDING");
  });

  it("DRAG_START_SERVER + hasInitialMeld=true → DRAGGING_FROM_SERVER (S4)", () => {
    expect(nextState("PENDING_BUILDING", "DRAG_START_SERVER", { hasInitialMeld: true })).toBe(
      "DRAGGING_FROM_SERVER",
    );
  });

  it("DRAG_START_SERVER + hasInitialMeld=false → null (V-13a 차단)", () => {
    expect(nextState("PENDING_BUILDING", "DRAG_START_SERVER", { hasInitialMeld: false })).toBeNull();
  });

  it("PRE_CHECK_PASS → PENDING_READY (S6)", () => {
    expect(nextState("PENDING_BUILDING", "PRE_CHECK_PASS")).toBe("PENDING_READY");
  });

  it("RESET → MY_TURN_IDLE (S1)", () => {
    expect(nextState("PENDING_BUILDING", "RESET")).toBe("MY_TURN_IDLE");
  });
});

// ---------------------------------------------------------------------------
// S6: PENDING_READY
// ---------------------------------------------------------------------------

describe("[stateMachineGuard] S6 PENDING_READY", () => {
  it("CONFIRM → COMMITTING (S7)", () => {
    expect(nextState("PENDING_READY", "CONFIRM")).toBe("COMMITTING");
  });

  it("PRE_CHECK_FAIL → PENDING_BUILDING (S5)", () => {
    expect(nextState("PENDING_READY", "PRE_CHECK_FAIL")).toBe("PENDING_BUILDING");
  });

  it("RESET → MY_TURN_IDLE (S1)", () => {
    expect(nextState("PENDING_READY", "RESET")).toBe("MY_TURN_IDLE");
  });
});

// ---------------------------------------------------------------------------
// S7: COMMITTING
// ---------------------------------------------------------------------------

describe("[stateMachineGuard] S7 COMMITTING", () => {
  it("TURN_END_OK → OUT_OF_TURN (S0)", () => {
    expect(nextState("COMMITTING", "TURN_END_OK")).toBe("OUT_OF_TURN");
  });

  it("INVALID → INVALID_RECOVER (S8)", () => {
    expect(nextState("COMMITTING", "INVALID")).toBe("INVALID_RECOVER");
  });

  it("CONFIRM → null (이미 커밋 중)", () => {
    expect(nextState("COMMITTING", "CONFIRM")).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// S8: INVALID_RECOVER
// ---------------------------------------------------------------------------

describe("[stateMachineGuard] S8 INVALID_RECOVER", () => {
  it("RESET → MY_TURN_IDLE (S1)", () => {
    expect(nextState("INVALID_RECOVER", "RESET")).toBe("MY_TURN_IDLE");
  });

  it("DROP_OK → PENDING_BUILDING (재시도 가능)", () => {
    expect(nextState("INVALID_RECOVER", "DROP_OK")).toBe("PENDING_BUILDING");
  });
});

// ---------------------------------------------------------------------------
// S4: DRAGGING_FROM_SERVER → JOKER_SWAP
// ---------------------------------------------------------------------------

describe("[stateMachineGuard] S4 DRAGGING_FROM_SERVER", () => {
  it("JOKER_SWAP → JOKER_RECOVERED (S10)", () => {
    expect(nextState("DRAGGING_FROM_SERVER", "JOKER_SWAP")).toBe("JOKER_RECOVERED");
  });

  it("DROP_OK → PENDING_BUILDING", () => {
    expect(nextState("DRAGGING_FROM_SERVER", "DROP_OK")).toBe("PENDING_BUILDING");
  });
});

// ---------------------------------------------------------------------------
// S10: JOKER_RECOVERED
// ---------------------------------------------------------------------------

describe("[stateMachineGuard] S10 JOKER_RECOVERED", () => {
  it("JOKER_PLACED → PENDING_BUILDING (S5)", () => {
    expect(nextState("JOKER_RECOVERED", "JOKER_PLACED")).toBe("PENDING_BUILDING");
  });

  it("RESET → MY_TURN_IDLE (S1)", () => {
    expect(nextState("JOKER_RECOVERED", "RESET")).toBe("MY_TURN_IDLE");
  });
});

// ---------------------------------------------------------------------------
// GAME_OVER — 모든 상태에서 S0으로
// ---------------------------------------------------------------------------

describe("[stateMachineGuard] GAME_OVER 전역 전이", () => {
  const allStates: TurnState[] = [
    "OUT_OF_TURN",
    "MY_TURN_IDLE",
    "DRAGGING_FROM_RACK",
    "DRAGGING_FROM_PENDING",
    "DRAGGING_FROM_SERVER",
    "PENDING_BUILDING",
    "PENDING_READY",
    "COMMITTING",
    "INVALID_RECOVER",
    "DRAWING",
    "JOKER_RECOVERED",
  ];

  allStates.forEach((state) => {
    it(`${state} + GAME_OVER → OUT_OF_TURN`, () => {
      expect(nextState(state, "GAME_OVER")).toBe("OUT_OF_TURN");
    });
  });
});

// ---------------------------------------------------------------------------
// canTransition 헬퍼
// ---------------------------------------------------------------------------

describe("[stateMachineGuard] canTransition", () => {
  it("허용된 전이 → true", () => {
    expect(canTransition("MY_TURN_IDLE", "DRAG_START_RACK")).toBe(true);
  });

  it("불허된 전이 → false", () => {
    expect(canTransition("OUT_OF_TURN", "CONFIRM")).toBe(false);
  });

  it("컨텍스트 필요 전이 — 조건 미충족 → false", () => {
    expect(canTransition("PENDING_BUILDING", "DRAG_START_SERVER", { hasInitialMeld: false })).toBe(
      false,
    );
  });
});
