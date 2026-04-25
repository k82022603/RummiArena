/**
 * useTurnActions 테스트 — Phase 2 L2 hook
 *
 * SSOT 매핑:
 *   - 58 §2 F-09: ConfirmTurn 사전검증 + WS 발신
 *   - 58 §2 F-11: DRAW 버튼 활성 조건
 *   - UR-15: confirmEnabled 종합 조건
 *   - UR-22: drawEnabled = MY_TURN_IDLE && pending 없음
 *   - UR-36: confirmValidator 외 임의 게이트 금지
 */

import { act, renderHook } from "@testing-library/react";
import {
  useTurnActions,
  registerWSSendBridge,
  unregisterWSSendBridge,
} from "../useTurnActions";
import { usePendingStore } from "@/store/pendingStore";
import { useTurnStateStore } from "@/store/turnStateStore";
import { useGameStore } from "@/store/gameStore";
import type { TableGroup, TileCode } from "@/types/tile";

// ---------------------------------------------------------------------------
// 헬퍼
// ---------------------------------------------------------------------------

function makeGroup(id: string, tiles: TileCode[]): TableGroup {
  return { id, tiles, type: "run" };
}

/**
 * 턴 상태 머신을 MY_TURN_IDLE(S1) 상태로 설정
 */
function setupMyTurnIdle(hasInitialMeld: boolean = false) {
  useGameStore.setState({
    mySeat: 0,
    hasInitialMeld,
    players: [{
      seat: 0,
      type: "HUMAN" as const,
      userId: "u0",
      displayName: "P0",
      tileCount: 5,
      hasInitialMeld,
      status: "CONNECTED" as const,
    }],
    myTiles: ["R5a", "R6a", "R7a", "R8a", "R9a"] as TileCode[],
  });
  // OUT_OF_TURN → MY_TURN_IDLE (TURN_START + isMyTurn=true)
  useTurnStateStore.getState().transition("TURN_START", { isMyTurn: true });
}

/**
 * 상태 머신을 PENDING_BUILDING(S5) 상태로 설정
 * (TURN_START → DRAG_START_RACK → DROP_OK 순서)
 */
function setupPendingBuilding(hasInitialMeld: boolean = true) {
  setupMyTurnIdle(hasInitialMeld);
  usePendingStore.getState().saveTurnStartSnapshot(
    ["R5a", "R6a", "R7a", "R8a", "R9a"] as TileCode[],
    []
  );
  // DRAG_START_RACK → DRAGGING_FROM_RACK
  useTurnStateStore.getState().transition("DRAG_START_RACK");
  // pending 적용
  usePendingStore.getState().applyMutation({
    nextTableGroups: [makeGroup("pending-x", ["R5a", "R6a", "R7a"])],
    nextMyTiles: ["R8a", "R9a"] as TileCode[],
    nextPendingGroupIds: new Set(["pending-x"]),
    nextPendingRecoveredJokers: [],
    nextPendingGroupSeq: 1,
    branch: "test",
  });
  // DROP_OK → PENDING_BUILDING
  useTurnStateStore.getState().transition("DROP_OK");
}

/**
 * 상태 머신을 PENDING_READY(S6) 상태로 설정
 * (PENDING_BUILDING + PRE_CHECK_PASS)
 */
function setupPendingReady(hasInitialMeld: boolean = true) {
  setupPendingBuilding(hasInitialMeld);
  useTurnStateStore.getState().transition("PRE_CHECK_PASS");
}

// ---------------------------------------------------------------------------
// 초기화
// ---------------------------------------------------------------------------

beforeEach(() => {
  act(() => {
    usePendingStore.getState().reset();
    useTurnStateStore.getState().reset();
    useGameStore.setState({
      mySeat: 0,
      hasInitialMeld: false,
      players: [],
      myTiles: [],
      gameState: null,
    });
  });
  unregisterWSSendBridge();
});

afterEach(() => {
  unregisterWSSendBridge();
});

// ---------------------------------------------------------------------------
// 1. confirmEnabled — pending 없을 때 false
// ---------------------------------------------------------------------------

test("confirmEnabled = false when draft is null (MY_TURN_IDLE)", () => {
  act(() => {
    setupMyTurnIdle(true);
  });

  const { result } = renderHook(() => useTurnActions());
  expect(result.current.confirmEnabled).toBe(false);
});

// ---------------------------------------------------------------------------
// 2. confirmEnabled — PENDING_READY + 유효한 세트 + hasInitialMeld=true → true
// ---------------------------------------------------------------------------

test("confirmEnabled = true when PENDING_READY, valid groups, hasInitialMeld=true", () => {
  act(() => {
    setupPendingReady(true);
  });

  const { result } = renderHook(() => useTurnActions());
  // PENDING_READY(S6) + hasPending + tilesAdded>=1 + allGroupsValid + hasInitialMeld
  expect(result.current.confirmEnabled).toBe(true);
});

// ---------------------------------------------------------------------------
// 3. drawEnabled — MY_TURN_IDLE && draft null → true
// ---------------------------------------------------------------------------

test("drawEnabled = true when MY_TURN_IDLE and no pending draft", () => {
  act(() => {
    setupMyTurnIdle(false);
  });

  const { result } = renderHook(() => useTurnActions());
  expect(result.current.drawEnabled).toBe(true);
});

// ---------------------------------------------------------------------------
// 4. drawEnabled — PENDING_BUILDING 상태 → false
// ---------------------------------------------------------------------------

test("drawEnabled = false when in PENDING_BUILDING state", () => {
  act(() => {
    setupPendingBuilding(true);
  });

  const { result } = renderHook(() => useTurnActions());
  expect(result.current.drawEnabled).toBe(false);
});

// ---------------------------------------------------------------------------
// 5. handleUndo — pendingStore 초기화 + turnState RESET 전이
// ---------------------------------------------------------------------------

test("handleUndo → pendingStore reset + turnState → MY_TURN_IDLE", () => {
  act(() => {
    setupPendingBuilding(true);
  });

  const { result } = renderHook(() => useTurnActions());
  expect(result.current.resetEnabled).toBe(true);

  act(() => {
    result.current.handleUndo();
  });

  expect(usePendingStore.getState().draft).toBeNull();
  expect(useTurnStateStore.getState().state).toBe("MY_TURN_IDLE");
});

// ---------------------------------------------------------------------------
// 6. handleDraw — WS 브릿지 호출 + DRAW 전이
// ---------------------------------------------------------------------------

test("handleDraw → WS DRAW_TILE 발신 + turnState DRAWING 전이", () => {
  act(() => {
    setupMyTurnIdle(false);
  });

  const sent: Array<{ type: string; payload: unknown }> = [];
  registerWSSendBridge((type, payload) => {
    sent.push({ type, payload });
  });

  const { result } = renderHook(() => useTurnActions());
  expect(result.current.drawEnabled).toBe(true);

  act(() => {
    result.current.handleDraw();
  });

  expect(useTurnStateStore.getState().state).toBe("DRAWING");
  expect(sent).toHaveLength(1);
  expect(sent[0].type).toBe("DRAW_TILE");
});

// ---------------------------------------------------------------------------
// 7. confirmEnabled — V-04 미충족 시 false (hasInitialMeld=false, score 18 < 30)
// ---------------------------------------------------------------------------

test("confirmEnabled = false when score < 30 and hasInitialMeld=false", () => {
  // PENDING_READY(S6)이지만 hasInitialMeld=false, score=18 (30점 미만)
  act(() => {
    setupPendingReady(false); // hasInitialMeld=false
  });

  const { result } = renderHook(() => useTurnActions());
  // score 5+6+7=18 < 30 이므로 false
  expect(result.current.confirmEnabled).toBe(false);
});
