/**
 * turnStateStore — S0~S10 전이 테스트
 *
 * SSOT 매핑:
 *   - 56b §2 전이 다이어그램 24개 중 핵심 경로 검증
 *   - 56b §3.2 상태별 invariant
 *   - 58 §4.4 selector 함수
 */

import { act } from "@testing-library/react";
import {
  useTurnStateStore,
  selectCanDrag,
  selectCanConfirm,
  selectCanDraw,
  selectCanReset,
  type TurnState,
  type TurnAction,
} from "@/store/turnStateStore";
import type { TransitionContext } from "@/lib/stateMachineGuard";

// ---------------------------------------------------------------------------
// 테스트 헬퍼
// ---------------------------------------------------------------------------

function getStore() {
  return useTurnStateStore.getState();
}

function forceState(state: TurnState) {
  act(() => {
    // Zustand setState는 함수형 업데이터를 사용하면 타입 에러 없이 적용 가능
    useTurnStateStore.setState((prev) => ({ ...prev, state }));
  });
}

function doTransition(action: TurnAction, context?: TransitionContext) {
  act(() => {
    useTurnStateStore.getState().transition(action, context);
  });
}

// ---------------------------------------------------------------------------
// 초기화
// ---------------------------------------------------------------------------

beforeEach(() => {
  act(() => {
    useTurnStateStore.getState().reset();
  });
});

// ---------------------------------------------------------------------------
// 1. 초기 상태 테스트
// ---------------------------------------------------------------------------

describe("초기 상태", () => {
  it("초기 상태는 OUT_OF_TURN(S0)", () => {
    expect(getStore().state).toBe("OUT_OF_TURN");
  });

  it("reset 후 OUT_OF_TURN 복귀", () => {
    forceState("MY_TURN_IDLE");
    act(() => {
      useTurnStateStore.getState().reset();
    });
    expect(getStore().state).toBe("OUT_OF_TURN");
  });
});

// ---------------------------------------------------------------------------
// 2. S0 (OUT_OF_TURN) 전이 테스트
// ---------------------------------------------------------------------------

describe("S0 OUT_OF_TURN 전이", () => {
  it("TURN_START + isMyTurn=true → S1 MY_TURN_IDLE", () => {
    doTransition("TURN_START", { isMyTurn: true });
    expect(getStore().state).toBe("MY_TURN_IDLE");
  });

  it("TURN_START + isMyTurn=false → S0 유지", () => {
    doTransition("TURN_START", { isMyTurn: false });
    expect(getStore().state).toBe("OUT_OF_TURN");
  });

  it("TURN_START 컨텍스트 없이 → S0 유지 (isMyTurn 기본값 false)", () => {
    doTransition("TURN_START");
    expect(getStore().state).toBe("OUT_OF_TURN");
  });

  it("S0에서 허용되지 않는 액션 → 상태 변경 없음", () => {
    doTransition("DRAG_START_RACK");
    expect(getStore().state).toBe("OUT_OF_TURN");
  });
});

// ---------------------------------------------------------------------------
// 3. S1 (MY_TURN_IDLE) 전이 테스트
// ---------------------------------------------------------------------------

describe("S1 MY_TURN_IDLE 전이", () => {
  beforeEach(() => {
    forceState("MY_TURN_IDLE");
  });

  it("DRAG_START_RACK → S2 DRAGGING_FROM_RACK", () => {
    doTransition("DRAG_START_RACK");
    expect(getStore().state).toBe("DRAGGING_FROM_RACK");
  });

  it("DRAW → S9 DRAWING", () => {
    doTransition("DRAW");
    expect(getStore().state).toBe("DRAWING");
  });

  it("TURN_START(other) → S0 OUT_OF_TURN", () => {
    doTransition("TURN_START", { isMyTurn: false });
    expect(getStore().state).toBe("OUT_OF_TURN");
  });

  it("S1에서 CONFIRM → 상태 변경 없음 (허용 안 됨)", () => {
    doTransition("CONFIRM");
    expect(getStore().state).toBe("MY_TURN_IDLE");
  });
});

// ---------------------------------------------------------------------------
// 4. S2 (DRAGGING_FROM_RACK) 전이 테스트
// ---------------------------------------------------------------------------

describe("S2 DRAGGING_FROM_RACK 전이", () => {
  beforeEach(() => {
    forceState("DRAGGING_FROM_RACK");
  });

  it("DROP_OK → S5 PENDING_BUILDING", () => {
    doTransition("DROP_OK");
    expect(getStore().state).toBe("PENDING_BUILDING");
  });

  it("DRAG_CANCEL → S1 MY_TURN_IDLE", () => {
    doTransition("DRAG_CANCEL");
    expect(getStore().state).toBe("MY_TURN_IDLE");
  });
});

// ---------------------------------------------------------------------------
// 5. S3/S4 전이 테스트
// ---------------------------------------------------------------------------

describe("S3 DRAGGING_FROM_PENDING 전이", () => {
  beforeEach(() => {
    forceState("DRAGGING_FROM_PENDING");
  });

  it("DROP_OK → S5 PENDING_BUILDING", () => {
    doTransition("DROP_OK");
    expect(getStore().state).toBe("PENDING_BUILDING");
  });

  it("DRAG_CANCEL → S5 PENDING_BUILDING", () => {
    doTransition("DRAG_CANCEL");
    expect(getStore().state).toBe("PENDING_BUILDING");
  });
});

describe("S4 DRAGGING_FROM_SERVER 전이", () => {
  beforeEach(() => {
    forceState("DRAGGING_FROM_SERVER");
  });

  it("DROP_OK → S5 PENDING_BUILDING", () => {
    doTransition("DROP_OK");
    expect(getStore().state).toBe("PENDING_BUILDING");
  });

  it("JOKER_SWAP → S10 JOKER_RECOVERED", () => {
    doTransition("JOKER_SWAP");
    expect(getStore().state).toBe("JOKER_RECOVERED");
  });
});

// ---------------------------------------------------------------------------
// 6. S5 (PENDING_BUILDING) 전이 테스트
// ---------------------------------------------------------------------------

describe("S5 PENDING_BUILDING 전이", () => {
  beforeEach(() => {
    forceState("PENDING_BUILDING");
  });

  it("PRE_CHECK_PASS → S6 PENDING_READY", () => {
    doTransition("PRE_CHECK_PASS");
    expect(getStore().state).toBe("PENDING_READY");
  });

  it("RESET → S1 MY_TURN_IDLE", () => {
    doTransition("RESET");
    expect(getStore().state).toBe("MY_TURN_IDLE");
  });

  it("DRAG_START_SERVER + hasInitialMeld=true → S4 DRAGGING_FROM_SERVER", () => {
    doTransition("DRAG_START_SERVER", { hasInitialMeld: true });
    expect(getStore().state).toBe("DRAGGING_FROM_SERVER");
  });

  it("DRAG_START_SERVER + hasInitialMeld=false → 상태 변경 없음 (V-13a)", () => {
    doTransition("DRAG_START_SERVER", { hasInitialMeld: false });
    expect(getStore().state).toBe("PENDING_BUILDING");
  });
});

// ---------------------------------------------------------------------------
// 7. S6 (PENDING_READY) 전이 테스트
// ---------------------------------------------------------------------------

describe("S6 PENDING_READY 전이", () => {
  beforeEach(() => {
    forceState("PENDING_READY");
  });

  it("CONFIRM → S7 COMMITTING", () => {
    doTransition("CONFIRM");
    expect(getStore().state).toBe("COMMITTING");
  });

  it("PRE_CHECK_FAIL → S5 PENDING_BUILDING", () => {
    doTransition("PRE_CHECK_FAIL");
    expect(getStore().state).toBe("PENDING_BUILDING");
  });

  it("RESET → S1 MY_TURN_IDLE", () => {
    doTransition("RESET");
    expect(getStore().state).toBe("MY_TURN_IDLE");
  });
});

// ---------------------------------------------------------------------------
// 8. S7 (COMMITTING) 전이 테스트
// ---------------------------------------------------------------------------

describe("S7 COMMITTING 전이", () => {
  beforeEach(() => {
    forceState("COMMITTING");
  });

  it("TURN_END_OK → S0 OUT_OF_TURN", () => {
    doTransition("TURN_END_OK");
    expect(getStore().state).toBe("OUT_OF_TURN");
  });

  it("INVALID → S8 INVALID_RECOVER", () => {
    doTransition("INVALID");
    expect(getStore().state).toBe("INVALID_RECOVER");
  });
});

// ---------------------------------------------------------------------------
// 9. S8/S9/S10 전이 테스트
// ---------------------------------------------------------------------------

describe("S8 INVALID_RECOVER 전이", () => {
  beforeEach(() => {
    forceState("INVALID_RECOVER");
  });

  it("RESET → S1 MY_TURN_IDLE", () => {
    doTransition("RESET");
    expect(getStore().state).toBe("MY_TURN_IDLE");
  });

  it("DROP_OK → S5 PENDING_BUILDING (재시도)", () => {
    doTransition("DROP_OK");
    expect(getStore().state).toBe("PENDING_BUILDING");
  });
});

describe("S9 DRAWING 전이", () => {
  beforeEach(() => {
    forceState("DRAWING");
  });

  it("DRAW_OK → S0 OUT_OF_TURN", () => {
    doTransition("DRAW_OK");
    expect(getStore().state).toBe("OUT_OF_TURN");
  });
});

describe("S10 JOKER_RECOVERED 전이", () => {
  beforeEach(() => {
    forceState("JOKER_RECOVERED");
  });

  it("JOKER_PLACED → S5 PENDING_BUILDING", () => {
    doTransition("JOKER_PLACED");
    expect(getStore().state).toBe("PENDING_BUILDING");
  });

  it("RESET → S1 MY_TURN_IDLE", () => {
    doTransition("RESET");
    expect(getStore().state).toBe("MY_TURN_IDLE");
  });
});

// ---------------------------------------------------------------------------
// 10. GAME_OVER — 모든 상태에서 S0
// ---------------------------------------------------------------------------

describe("GAME_OVER 전이 (모든 상태에서)", () => {
  const allStates: TurnState[] = [
    "OUT_OF_TURN",
    "MY_TURN_IDLE",
    "PENDING_BUILDING",
    "PENDING_READY",
    "COMMITTING",
    "DRAGGING_FROM_RACK",
    "DRAGGING_FROM_PENDING",
    "DRAGGING_FROM_SERVER",
    "INVALID_RECOVER",
    "DRAWING",
    "JOKER_RECOVERED",
  ];

  it.each(allStates)("%s 상태에서 GAME_OVER → OUT_OF_TURN", (state) => {
    forceState(state);
    doTransition("GAME_OVER");
    expect(getStore().state).toBe("OUT_OF_TURN");
  });
});

// ---------------------------------------------------------------------------
// 11. Selector 테스트
// ---------------------------------------------------------------------------

describe("selectCanDrag", () => {
  const cases: [TurnState, boolean][] = [
    ["MY_TURN_IDLE", true],
    ["PENDING_BUILDING", true],
    ["PENDING_READY", true],
    ["INVALID_RECOVER", true],
    ["OUT_OF_TURN", false],
    ["COMMITTING", false],
    ["DRAWING", false],
    ["DRAGGING_FROM_RACK", false],
  ];

  it.each(cases)("%s → %s", (state, expected) => {
    forceState(state);
    expect(selectCanDrag(getStore())).toBe(expected);
  });
});

describe("selectCanConfirm", () => {
  it("PENDING_READY → true", () => {
    forceState("PENDING_READY");
    expect(selectCanConfirm(getStore())).toBe(true);
  });

  it("PENDING_BUILDING → false", () => {
    forceState("PENDING_BUILDING");
    expect(selectCanConfirm(getStore())).toBe(false);
  });
});

describe("selectCanDraw", () => {
  it("MY_TURN_IDLE → true", () => {
    forceState("MY_TURN_IDLE");
    expect(selectCanDraw(getStore())).toBe(true);
  });

  it("PENDING_BUILDING → false", () => {
    forceState("PENDING_BUILDING");
    expect(selectCanDraw(getStore())).toBe(false);
  });
});

describe("selectCanReset", () => {
  const cases: [TurnState, boolean][] = [
    ["PENDING_BUILDING", true],
    ["PENDING_READY", true],
    ["INVALID_RECOVER", true],
    ["JOKER_RECOVERED", true],
    ["MY_TURN_IDLE", false],
    ["OUT_OF_TURN", false],
  ];

  it.each(cases)("%s → %s", (state, expected) => {
    forceState(state);
    expect(selectCanReset(getStore())).toBe(expected);
  });
});
