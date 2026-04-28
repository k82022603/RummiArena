/**
 * pendingStore — applyMutation, reset, rollback 테스트
 *
 * SSOT 매핑:
 *   - INV-G1: 그룹 ID 유니크
 *   - INV-G2: tile code 중복 방지
 *   - INV-G3: 빈 그룹 자동 제거
 *   - UR-04: 턴 시작/종료 시 pending 초기화
 *   - F-13: INVALID_MOVE rollback
 */

import { act } from "@testing-library/react";
import {
  usePendingStore,
  selectTilesAdded,
  selectPendingPlacementScore,
  selectHasPending,
  selectConfirmEnabled,
} from "@/store/pendingStore";
import type { DragOutput } from "@/lib/dragEnd/dragEndReducer";
import type { TableGroup, TileCode } from "@/types/tile";

// ---------------------------------------------------------------------------
// 헬퍼
// ---------------------------------------------------------------------------

function getStore() {
  return usePendingStore.getState();
}

function makeGroup(id: string, tiles: TileCode[]): TableGroup {
  return { id, tiles, type: "group" };
}

function makeDragOutput(
  partial: Partial<DragOutput>
): DragOutput {
  return {
    nextTableGroups: partial.nextTableGroups ?? [],
    nextMyTiles: partial.nextMyTiles ?? [],
    nextPendingGroupIds: partial.nextPendingGroupIds ?? new Set(),
    nextPendingRecoveredJokers: partial.nextPendingRecoveredJokers ?? [],
    nextPendingGroupSeq: partial.nextPendingGroupSeq ?? 0,
    branch: partial.branch ?? "test",
    ...partial,
  };
}

// ---------------------------------------------------------------------------
// 초기화
// ---------------------------------------------------------------------------

beforeEach(() => {
  act(() => {
    usePendingStore.getState().reset();
  });
});

// ---------------------------------------------------------------------------
// 1. 초기 상태 테스트
// ---------------------------------------------------------------------------

describe("초기 상태", () => {
  it("초기 draft는 null", () => {
    expect(getStore().draft).toBeNull();
  });

  it("reset 후 draft null 복귀", () => {
    act(() => {
      usePendingStore.getState().saveTurnStartSnapshot(["R7a"], []);
    });
    act(() => {
      usePendingStore.getState().reset();
    });
    expect(getStore().draft).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// 2. saveTurnStartSnapshot 테스트
// ---------------------------------------------------------------------------

describe("saveTurnStartSnapshot", () => {
  it("rack과 tableGroups를 스냅샷으로 저장한다", () => {
    const rack: TileCode[] = ["R7a", "B5b", "K3a"];
    const tableGroups: TableGroup[] = [makeGroup("srv-1", ["R1a", "R2a", "R3a"])];

    act(() => {
      usePendingStore.getState().saveTurnStartSnapshot(rack, tableGroups);
    });

    const draft = getStore().draft;
    expect(draft).not.toBeNull();
    expect(draft!.turnStartRack).toEqual(rack);
    expect(draft!.turnStartTableGroups).toEqual(tableGroups);
    expect(draft!.myTiles).toEqual(rack);
  });
});

// ---------------------------------------------------------------------------
// 3. applyMutation 테스트
// ---------------------------------------------------------------------------

describe("applyMutation", () => {
  it("정상 결과 적용 — groups와 myTiles 갱신", () => {
    act(() => {
      usePendingStore.getState().saveTurnStartSnapshot(["R7a", "B5b"], []);
    });

    const newGroup = makeGroup("pending-1", ["R7a"]);
    const output = makeDragOutput({
      nextTableGroups: [newGroup],
      nextMyTiles: ["B5b"],
      nextPendingGroupIds: new Set(["pending-1"]),
    });

    act(() => {
      usePendingStore.getState().applyMutation(output);
    });

    const draft = getStore().draft;
    expect(draft!.groups).toEqual([newGroup]);
    expect(draft!.myTiles).toEqual(["B5b"]);
    expect(draft!.pendingGroupIds.has("pending-1")).toBe(true);
  });

  it("reject된 결과 — 상태 변경 없음", () => {
    act(() => {
      usePendingStore.getState().saveTurnStartSnapshot(["R7a"], []);
    });

    const beforeDraft = getStore().draft;

    const rejected = makeDragOutput({
      rejected: "incompatible-merge",
    });

    act(() => {
      usePendingStore.getState().applyMutation(rejected);
    });

    // draft 구조는 유지되어야 함 (saveTurnStartSnapshot으로 만들어진 것)
    expect(getStore().draft?.myTiles).toEqual(beforeDraft?.myTiles);
  });

  it("INV-G3: 빈 그룹 자동 제거", () => {
    act(() => {
      usePendingStore.getState().saveTurnStartSnapshot(["R7a", "B5b"], []);
    });

    const output = makeDragOutput({
      nextTableGroups: [
        makeGroup("pending-1", []),   // 빈 그룹 — 자동 제거 대상
        makeGroup("pending-2", ["B5b"]),
      ],
      nextMyTiles: ["R7a"],
      nextPendingGroupIds: new Set(["pending-1", "pending-2"]),
    });

    act(() => {
      usePendingStore.getState().applyMutation(output);
    });

    const draft = getStore().draft;
    // 빈 그룹 "pending-1" 제거, "pending-2"만 남음
    expect(draft!.groups).toHaveLength(1);
    expect(draft!.groups[0].id).toBe("pending-2");
  });

  it("nextTableGroups=null → groups 초기화 (랙 복귀)", () => {
    act(() => {
      usePendingStore.getState().saveTurnStartSnapshot(["R7a", "B5b"], []);
    });

    // 먼저 그룹 추가
    act(() => {
      usePendingStore.getState().applyMutation(makeDragOutput({
        nextTableGroups: [makeGroup("pending-1", ["R7a"])],
        nextMyTiles: ["B5b"],
        nextPendingGroupIds: new Set(["pending-1"]),
      }));
    });

    expect(getStore().draft!.groups).toHaveLength(1);

    // null 적용 → groups 초기화
    act(() => {
      usePendingStore.getState().applyMutation(makeDragOutput({
        nextTableGroups: null,
        nextMyTiles: ["R7a", "B5b"],
        nextPendingGroupIds: new Set(),
      }));
    });

    const draft = getStore().draft;
    expect(draft!.groups).toHaveLength(0);
    expect(draft!.myTiles).toEqual(["R7a", "B5b"]);
  });
});

// ---------------------------------------------------------------------------
// 4. markServerGroupAsPending 테스트
// ---------------------------------------------------------------------------

describe("markServerGroupAsPending", () => {
  it("서버 그룹 ID를 pendingGroupIds에 추가한다 (D-01, V-17)", () => {
    act(() => {
      usePendingStore.getState().saveTurnStartSnapshot([], []);
    });

    act(() => {
      usePendingStore.getState().markServerGroupAsPending("server-uuid-abc");
    });

    expect(getStore().draft!.pendingGroupIds.has("server-uuid-abc")).toBe(true);
  });

  it("draft가 null이면 no-op", () => {
    act(() => {
      usePendingStore.getState().markServerGroupAsPending("server-uuid-abc");
    });
    expect(getStore().draft).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// 5. rollbackToServerSnapshot 테스트
// ---------------------------------------------------------------------------

describe("rollbackToServerSnapshot", () => {
  it("TURN_START 스냅샷으로 복원한다 — F-13", () => {
    const startRack: TileCode[] = ["R7a", "B5b", "K3a"];
    const startGroups: TableGroup[] = [makeGroup("srv-1", ["R1a", "R2a", "R3a"])];

    act(() => {
      usePendingStore.getState().saveTurnStartSnapshot(startRack, startGroups);
    });

    // 임시 변경
    act(() => {
      usePendingStore.getState().applyMutation(makeDragOutput({
        nextTableGroups: [makeGroup("pending-1", ["R7a"])],
        nextMyTiles: ["B5b", "K3a"],
        nextPendingGroupIds: new Set(["pending-1"]),
      }));
    });

    expect(getStore().draft!.myTiles).toEqual(["B5b", "K3a"]);

    // 롤백
    act(() => {
      usePendingStore.getState().rollbackToServerSnapshot();
    });

    const draft = getStore().draft;
    expect(draft!.myTiles).toEqual(startRack);
    expect(draft!.groups).toEqual(startGroups);
    expect(draft!.pendingGroupIds.size).toBe(0);
    expect(draft!.recoveredJokers).toHaveLength(0);
  });

  it("draft가 null이면 no-op", () => {
    act(() => {
      usePendingStore.getState().rollbackToServerSnapshot();
    });
    expect(getStore().draft).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// 6. Selector 테스트
// ---------------------------------------------------------------------------

describe("selectTilesAdded", () => {
  it("draft null → 0", () => {
    expect(selectTilesAdded(getStore())).toBe(0);
  });

  it("turnStartRack 3장, myTiles 2장 → tilesAdded = 1", () => {
    act(() => {
      usePendingStore.getState().saveTurnStartSnapshot(["R7a", "B5b", "K3a"], []);
    });

    act(() => {
      usePendingStore.getState().applyMutation(makeDragOutput({
        nextTableGroups: [makeGroup("pending-1", ["R7a"])],
        nextMyTiles: ["B5b", "K3a"],
        nextPendingGroupIds: new Set(["pending-1"]),
      }));
    });

    expect(selectTilesAdded(getStore())).toBe(1);
  });
});

describe("selectPendingPlacementScore", () => {
  it("draft null → 0점", () => {
    expect(selectPendingPlacementScore(getStore())).toBe(0);
  });

  it("pending 그룹 R7a + B5b + K3a → 7+5+3 = 15점", () => {
    act(() => {
      usePendingStore.getState().saveTurnStartSnapshot(["R7a", "B5b", "K3a"], []);
    });

    act(() => {
      usePendingStore.getState().applyMutation(makeDragOutput({
        nextTableGroups: [makeGroup("pending-1", ["R7a", "B5b", "K3a"])],
        nextMyTiles: [],
        nextPendingGroupIds: new Set(["pending-1"]),
      }));
    });

    expect(selectPendingPlacementScore(getStore())).toBe(15);
  });
});

describe("selectHasPending", () => {
  it("draft null → false", () => {
    expect(selectHasPending(getStore())).toBe(false);
  });

  it("그룹 있으면 true", () => {
    act(() => {
      usePendingStore.getState().saveTurnStartSnapshot(["R7a"], []);
    });
    act(() => {
      usePendingStore.getState().applyMutation(makeDragOutput({
        nextTableGroups: [makeGroup("pending-1", ["R7a"])],
        nextMyTiles: [],
        nextPendingGroupIds: new Set(["pending-1"]),
      }));
    });
    expect(selectHasPending(getStore())).toBe(true);
  });
});

describe("selectConfirmEnabled", () => {
  it("draft null → false", () => {
    expect(selectConfirmEnabled(getStore(), true)).toBe(false);
  });

  it("tilesAdded >= 1 + 유효 그룹 3장 + hasInitialMeld=true → true", () => {
    act(() => {
      usePendingStore.getState().saveTurnStartSnapshot(["R7a", "B7b", "K7a"], []);
    });
    act(() => {
      usePendingStore.getState().applyMutation(makeDragOutput({
        nextTableGroups: [makeGroup("pending-1", ["R7a", "B7b", "K7a"])],
        nextMyTiles: [],
        nextPendingGroupIds: new Set(["pending-1"]),
      }));
    });
    expect(selectConfirmEnabled(getStore(), true)).toBe(true);
  });

  it("hasInitialMeld=false + score < 30 → false (V-04)", () => {
    // 15점짜리 그룹 (7+5+3)
    act(() => {
      usePendingStore.getState().saveTurnStartSnapshot(["R7a", "B5b", "K3a"], []);
    });
    act(() => {
      usePendingStore.getState().applyMutation(makeDragOutput({
        nextTableGroups: [makeGroup("pending-1", ["R7a", "B5b", "K3a"])],
        nextMyTiles: [],
        nextPendingGroupIds: new Set(["pending-1"]),
      }));
    });
    expect(selectConfirmEnabled(getStore(), false)).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// 7. P2a dual-write 시나리오 테스트
// ---------------------------------------------------------------------------

describe("P2a dual-write — dragEndReducer 결과 applyMutation 경로", () => {
  it("dragEndReducer 결과를 applyMutation으로 적용하면 pendingStore가 동기화된다", () => {
    // saveTurnStartSnapshot으로 초기 스냅샷 설정
    act(() => {
      usePendingStore.getState().saveTurnStartSnapshot(["R7a", "B5b"], []);
    });

    // dragEndReducer가 반환할 법한 결과를 직접 구성 (rack→board:new-group 경로)
    const reducerResult = makeDragOutput({
      nextTableGroups: [makeGroup("pending-1001-1", ["R7a"])],
      nextMyTiles: ["B5b"],
      nextPendingGroupIds: new Set(["pending-1001-1"]),
      nextPendingRecoveredJokers: [],
      nextPendingGroupSeq: 1,
      branch: "rack→board:new-group",
    });

    // GameClient.handleDragEnd가 수행하는 dual-write 순서 재현:
    // 1) gameStore.setPending*  (이 테스트에서는 생략 — gameStore mock 불필요)
    // 2) pendingStore.applyMutation(result)
    act(() => {
      usePendingStore.getState().applyMutation(reducerResult);
    });

    const draft = getStore().draft;
    expect(draft).not.toBeNull();
    expect(draft!.groups).toHaveLength(1);
    expect(draft!.groups[0].id).toBe("pending-1001-1");
    expect(draft!.groups[0].tiles).toEqual(["R7a"]);
    expect(draft!.myTiles).toEqual(["B5b"]);
    expect(draft!.pendingGroupIds.has("pending-1001-1")).toBe(true);
  });

  it("rejected DragOutput은 pendingStore 상태를 변경하지 않는다", () => {
    act(() => {
      usePendingStore.getState().saveTurnStartSnapshot(["R7a"], []);
    });

    const before = getStore().draft;

    const rejectedResult = makeDragOutput({
      rejected: "incompatible-merge",
      branch: "table→table:reject",
    });

    act(() => {
      usePendingStore.getState().applyMutation(rejectedResult);
    });

    // pendingStore의 applyMutation은 rejected 시 early-return하므로 상태 불변
    expect(getStore().draft?.myTiles).toEqual(before?.myTiles);
  });

  it("tryJokerSwap inline DragOutput — nextPendingRecoveredJokers에 조커 추가", () => {
    act(() => {
      usePendingStore.getState().saveTurnStartSnapshot(["R7a", "B5b"], []);
    });

    const swapGroup = makeGroup("srv-abc", ["R7a", "R8a", "JK1"]);

    // tryJokerSwap 경로에서 GameClient가 구성하는 DragOutput
    const jokerSwapOutput = makeDragOutput({
      nextTableGroups: [{ ...swapGroup, tiles: ["R7a", "R8a", "B5b"] }],
      nextMyTiles: ["JK1"],
      nextPendingGroupIds: new Set(["srv-abc"]),
      nextPendingRecoveredJokers: ["JK1"],
      nextPendingGroupSeq: 0,
      addedJoker: "JK1",
      branch: "rack→joker-swap:gameclient-inline",
    });

    act(() => {
      usePendingStore.getState().applyMutation(jokerSwapOutput);
    });

    const draft = getStore().draft;
    expect(draft!.recoveredJokers).toContain("JK1");
    expect(draft!.pendingGroupIds.has("srv-abc")).toBe(true);
    expect(draft!.myTiles).toContain("JK1");
  });
});
