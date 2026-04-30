/**
 * useDragHandlers 테스트 — Phase 2 L2 hook
 *
 * SSOT 매핑:
 *   - 58 §2 F-02~F-06: 드래그 유형별 처리
 *   - UR-17: 드래그 취소 시 상태 변경 없음
 *   - A1~A12: dragEndReducer 행동 결과 → pendingStore 적용
 */

import { act, renderHook } from "@testing-library/react";
import { useDragHandlers } from "../useDragHandlers";
import { usePendingStore } from "@/store/pendingStore";
import { useTurnStateStore } from "@/store/turnStateStore";
import { useDragStateStore } from "@/store/dragStateStore";
import { useGameStore } from "@/store/gameStore";
import type { TableGroup, TileCode } from "@/types/tile";
import type { DragStartEvent, DragEndEvent } from "@dnd-kit/core";

// ---------------------------------------------------------------------------
// 헬퍼
// ---------------------------------------------------------------------------

function makeGroup(id: string, tiles: TileCode[]): TableGroup {
  return { id, tiles, type: "group" };
}

function makeDragStartEvent(overrides: {
  tileCode: TileCode;
  sourceKind: string;
  groupId?: string;
  index?: number;
}): DragStartEvent {
  return {
    active: {
      id: "active-tile",
      data: {
        current: {
          tileCode: overrides.tileCode,
          sourceKind: overrides.sourceKind,
          groupId: overrides.groupId,
          index: overrides.index,
        },
      },
      rect: { current: { initial: null, translated: null } },
    },
    activatorEvent: new Event("pointerdown"),
  } as unknown as DragStartEvent;
}

function makeDragEndEvent(overrides: {
  tileCode: TileCode;
  sourceKind: string;
  overId: string;
  groupId?: string;
  index?: number;
}): DragEndEvent {
  return {
    active: {
      id: "active-tile",
      data: {
        current: {
          tileCode: overrides.tileCode,
          sourceKind: overrides.sourceKind,
          groupId: overrides.groupId,
          index: overrides.index,
        },
      },
      rect: { current: { initial: null, translated: null } },
    },
    over: {
      id: overrides.overId,
      data: { current: {} },
      rect: null as unknown as DOMRect,
      disabled: false,
    },
    activatorEvent: new Event("pointerdown"),
    collisions: [],
    delta: { x: 0, y: 0 },
  } as unknown as DragEndEvent;
}

// ---------------------------------------------------------------------------
// 초기화
// ---------------------------------------------------------------------------

beforeEach(() => {
  act(() => {
    usePendingStore.setState({ draft: null });
    useTurnStateStore.getState().reset();
    useDragStateStore.getState().clearActive();
    useGameStore.setState({
      mySeat: 0,
      hasInitialMeld: true,
      myTiles: ["R7a", "B3a", "Y5b"] as TileCode[],
      players: [{
        seat: 0,
        type: "HUMAN" as const,
        userId: "user-0",
        displayName: "P0",
        tileCount: 3,
        hasInitialMeld: true,
        status: "CONNECTED" as const,
      }],
      gameState: {
        currentSeat: 0,
        tableGroups: [],
        drawPileCount: 50,
        turnTimeoutSec: 60,
        turnStartedAt: new Date().toISOString(),
      },
    });
    // MY_TURN_IDLE 상태로 설정
    useTurnStateStore.getState().transition("TURN_START", { isMyTurn: true });
  });
});

// ---------------------------------------------------------------------------
// 1. handleDragStart(rack) → dragStateStore에 activeTile 설정
// ---------------------------------------------------------------------------

test("handleDragStart(rack) → dragStateStore에 activeTile 설정", () => {
  const { result } = renderHook(() => useDragHandlers());
  const event = makeDragStartEvent({ tileCode: "R7a", sourceKind: "rack" });

  act(() => {
    result.current.handleDragStart(event);
  });

  expect(useDragStateStore.getState().activeTile).toBe("R7a");
  expect(useDragStateStore.getState().activeSource).toEqual({ kind: "rack" });
  // DRAG_START_RACK → DRAGGING_FROM_RACK
  expect(useTurnStateStore.getState().state).toBe("DRAGGING_FROM_RACK");
});

// ---------------------------------------------------------------------------
// 2. handleDragEnd(rack→new-group) → pendingStore에 새 그룹 추가
// ---------------------------------------------------------------------------

test("handleDragEnd(rack→new-group) → pendingStore에 새 그룹 추가", () => {
  act(() => {
    usePendingStore.getState().saveTurnStartSnapshot(
      ["R7a", "B3a", "Y5b"] as TileCode[],
      []
    );
  });

  const { result } = renderHook(() => useDragHandlers());

  act(() => {
    result.current.handleDragStart(
      makeDragStartEvent({ tileCode: "R7a", sourceKind: "rack" })
    );
    result.current.handleDragEnd(
      makeDragEndEvent({
        tileCode: "R7a",
        sourceKind: "rack",
        overId: "game-board-new-group",
      })
    );
  });

  const draft = usePendingStore.getState().draft;
  expect(draft).not.toBeNull();
  expect(draft!.groups.length).toBeGreaterThan(0);
  expect(draft!.groups.some((g) => g.tiles.includes("R7a"))).toBe(true);
  // DROP_OK → PENDING_BUILDING
  expect(useTurnStateStore.getState().state).toBe("PENDING_BUILDING");
});

// ---------------------------------------------------------------------------
// 3. handleDragEnd(no-over) → dragStateStore 초기화, pendingStore 변경 없음
// ---------------------------------------------------------------------------

test("handleDragEnd(no-over) → dragStateStore 초기화, pendingStore 변경 없음", () => {
  const { result } = renderHook(() => useDragHandlers());

  act(() => {
    result.current.handleDragStart(
      makeDragStartEvent({ tileCode: "R7a", sourceKind: "rack" })
    );
  });

  // over 없는 DragEndEvent (드롭 타겟 없음)
  const noOverEvent = {
    active: {
      id: "active-tile",
      data: { current: { tileCode: "R7a", sourceKind: "rack" } },
      rect: { current: { initial: null, translated: null } },
    },
    over: null,
    activatorEvent: new Event("pointerdown"),
    collisions: [],
    delta: { x: 0, y: 0 },
  } as unknown as DragEndEvent;

  act(() => {
    result.current.handleDragEnd(noOverEvent);
  });

  expect(useDragStateStore.getState().activeTile).toBeNull();
  expect(usePendingStore.getState().draft).toBeNull();
});

// ---------------------------------------------------------------------------
// 4. handleDragCancel → dragStateStore 초기화, S2→S1 전이 (UR-17)
// ---------------------------------------------------------------------------

test("handleDragCancel → dragStateStore 초기화, turnState MY_TURN_IDLE 복귀", () => {
  const { result } = renderHook(() => useDragHandlers());

  act(() => {
    result.current.handleDragStart(
      makeDragStartEvent({ tileCode: "B3a", sourceKind: "rack" })
    );
  });

  expect(useTurnStateStore.getState().state).toBe("DRAGGING_FROM_RACK");

  act(() => {
    result.current.handleDragCancel();
  });

  expect(useDragStateStore.getState().activeTile).toBeNull();
  expect(useDragStateStore.getState().activeSource).toBeNull();
  // DRAG_CANCEL (S2→S1)
  expect(useTurnStateStore.getState().state).toBe("MY_TURN_IDLE");
});

// ---------------------------------------------------------------------------
// 5. handleDragEnd(rack→existing-pending-group) → pendingStore 그룹에 타일 추가
// ---------------------------------------------------------------------------

test("handleDragEnd(rack→existing-pending-group) → 그룹에 타일 추가", () => {
  act(() => {
    usePendingStore.getState().saveTurnStartSnapshot(
      ["R7a", "B3a"] as TileCode[],
      []
    );
    // 기존 pending 그룹 설정: R5a, R6a (런 — R7a 추가 가능)
    usePendingStore.getState().applyMutation({
      nextTableGroups: [makeGroup("pending-111-0", ["R5a", "R6a"] as TileCode[])],
      nextMyTiles: ["R7a", "B3a"] as TileCode[],
      nextPendingGroupIds: new Set(["pending-111-0"]),
      nextPendingRecoveredJokers: [],
      nextPendingGroupSeq: 1,
      branch: "test-setup",
    });
    // PENDING_BUILDING 상태로 진입
    useTurnStateStore.getState().transition("DRAG_START_RACK");
    useTurnStateStore.getState().transition("DROP_OK");
    // 그룹 타입을 run으로 업데이트 (호환성 검사를 위해)
    usePendingStore.getState().applyMutation({
      nextTableGroups: [{ id: "pending-111-0", tiles: ["R5a", "R6a"] as TileCode[], type: "run" }],
      nextMyTiles: ["R7a", "B3a"] as TileCode[],
      nextPendingGroupIds: new Set(["pending-111-0"]),
      nextPendingRecoveredJokers: [],
      nextPendingGroupSeq: 1,
      branch: "test-setup-2",
    });
  });

  const { result } = renderHook(() => useDragHandlers());

  act(() => {
    result.current.handleDragStart(
      makeDragStartEvent({ tileCode: "R7a", sourceKind: "rack" })
    );
    result.current.handleDragEnd(
      makeDragEndEvent({
        tileCode: "R7a",
        sourceKind: "rack",
        overId: "pending-111-0",
      })
    );
  });

  const draft = usePendingStore.getState().draft;
  expect(draft).not.toBeNull();
  const group = draft!.groups.find((g) => g.id === "pending-111-0");
  expect(group).toBeDefined();
  expect(group!.tiles).toContain("R7a");
});

// ---------------------------------------------------------------------------
// 6. Bug 1 회귀 방지: players[mySeat].hasInitialMeld=false + rootStore.hasInitialMeld=true
//    → freshHasInitialMeld=true → 서버 그룹 드롭 시 새 pending 그룹이 아닌 서버 그룹 append
// ---------------------------------------------------------------------------

test("Bug1-회귀: players hasInitialMeld=false지만 루트 hasInitialMeld=true이면 서버그룹 append", () => {
  const serverGroupId = "server-group-uuid-001";
  act(() => {
    // players[0].hasInitialMeld=false, 루트 hasInitialMeld=true (불일치 상황)
    useGameStore.setState({
      mySeat: 0,
      hasInitialMeld: true,
      myTiles: ["Y9a"] as TileCode[],
      players: [{
        seat: 0,
        type: "HUMAN" as const,
        userId: "user-0",
        displayName: "P0",
        tileCount: 1,
        hasInitialMeld: false, // 서버 스냅샷 갱신 누락 시뮬레이션
        status: "CONNECTED" as const,
      }],
      gameState: {
        currentSeat: 0,
        tableGroups: [makeGroup(serverGroupId, ["Y10a", "Y11a", "Y12a"] as TileCode[])],
        drawPileCount: 50,
        turnTimeoutSec: 60,
        turnStartedAt: new Date().toISOString(),
      },
    });
    usePendingStore.getState().saveTurnStartSnapshot(
      ["Y9a"] as TileCode[],
      [makeGroup(serverGroupId, ["Y10a", "Y11a", "Y12a"] as TileCode[])]
    );
    useTurnStateStore.getState().transition("TURN_START", { isMyTurn: true });
  });

  const { result } = renderHook(() => useDragHandlers());

  act(() => {
    result.current.handleDragStart(
      makeDragStartEvent({ tileCode: "Y9a", sourceKind: "rack" })
    );
    result.current.handleDragEnd(
      makeDragEndEvent({
        tileCode: "Y9a",
        sourceKind: "rack",
        overId: serverGroupId,
      })
    );
  });

  const draft = usePendingStore.getState().draft;
  expect(draft).not.toBeNull();
  // 서버 그룹에 Y9a가 append 되어야 함 (새 1장 그룹이 생성되면 Bug 1 재현)
  const serverGroup = draft!.groups.find((g) => g.id === serverGroupId);
  expect(serverGroup).toBeDefined();
  expect(serverGroup!.tiles).toContain("Y9a");
  // pendingGroupIds에 서버 그룹 ID가 등록되어야 함
  expect(draft!.pendingGroupIds.has(serverGroupId)).toBe(true);
  // 새 pending- 그룹이 생성되지 않아야 함 (1장짜리 고아 그룹 차단)
  const orphanGroup = draft!.groups.find(
    (g) => g.id !== serverGroupId && g.tiles.includes("Y9a")
  );
  expect(orphanGroup).toBeUndefined();
});

// ---------------------------------------------------------------------------
// 7. Bug 2 회귀 방지: 서버 그룹에 Y9 추가 후 랙으로 되돌리면 drawEnabled 복원
//    selectHasPending=false → drawEnabled=true 가 되어야 함
// ---------------------------------------------------------------------------

test("Bug2-회귀: 서버그룹 append 후 랙으로 되돌리면 pendingGroupIds에서 서버그룹 제거", () => {
  const serverGroupId = "server-group-uuid-002";
  act(() => {
    useGameStore.setState({
      mySeat: 0,
      hasInitialMeld: true,
      myTiles: ["Y9a"] as TileCode[],
      players: [{
        seat: 0,
        type: "HUMAN" as const,
        userId: "user-0",
        displayName: "P0",
        tileCount: 1,
        hasInitialMeld: true,
        status: "CONNECTED" as const,
      }],
      gameState: {
        currentSeat: 0,
        tableGroups: [
          makeGroup(serverGroupId, ["Y10a", "Y11a", "Y12a", "Y9a"] as TileCode[])
        ],
        drawPileCount: 50,
        turnTimeoutSec: 60,
        turnStartedAt: new Date().toISOString(),
      },
    });
    // 서버 그룹에 Y9a가 이미 append된 상태 설정
    usePendingStore.getState().saveTurnStartSnapshot(
      [] as TileCode[], // Y9a를 이미 드롭한 후이므로 랙은 빔
      [makeGroup(serverGroupId, ["Y10a", "Y11a", "Y12a"] as TileCode[])] // turnStart 원본
    );
    usePendingStore.getState().applyMutation({
      nextTableGroups: [
        makeGroup(serverGroupId, ["Y10a", "Y11a", "Y12a", "Y9a"] as TileCode[])
      ],
      nextMyTiles: [] as TileCode[],
      nextPendingGroupIds: new Set([serverGroupId]),
      nextPendingRecoveredJokers: [],
      nextPendingGroupSeq: 0,
      branch: "test-setup-server-append",
    });
    useTurnStateStore.getState().transition("TURN_START", { isMyTurn: true });
    useTurnStateStore.getState().transition("DROP_OK");
  });

  const { result } = renderHook(() => useDragHandlers());

  // Y9a를 서버 그룹(index=3)에서 랙으로 되돌리기
  act(() => {
    result.current.handleDragStart(
      makeDragStartEvent({
        tileCode: "Y9a",
        sourceKind: "table",
        groupId: serverGroupId,
        index: 3,
      })
    );
    result.current.handleDragEnd(
      makeDragEndEvent({
        tileCode: "Y9a",
        sourceKind: "table",
        overId: "player-rack",
        groupId: serverGroupId,
        index: 3,
      })
    );
  });

  const draft = usePendingStore.getState().draft;
  // 서버 그룹이 원상복귀되었으면 pendingGroupIds에서 제거되어야 함
  const hasPendingAfter = draft !== null && draft.pendingGroupIds.size > 0;
  expect(hasPendingAfter).toBe(false);
});
