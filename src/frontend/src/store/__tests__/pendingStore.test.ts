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
    usePendingStore.setState({ draft: null });
  });
});

// ---------------------------------------------------------------------------
// 1. 초기 상태 테스트
// ---------------------------------------------------------------------------

describe("초기 상태", () => {
  it("초기 draft는 null", () => {
    expect(getStore().draft).toBeNull();
  });

  it("reset 후 turnStartTableGroups 로 복원", () => {
    act(() => {
      usePendingStore.getState().saveTurnStartSnapshot(["R7a"], []);
    });
    act(() => {
      usePendingStore.getState().reset();
    });
    const draft = getStore().draft;
    expect(draft).not.toBeNull();
    expect(draft!.groups).toEqual([]);
    expect(draft!.myTiles).toEqual(["R7a"]);
    expect(draft!.pendingGroupIds.size).toBe(0);
    expect(draft!.recoveredJokers).toEqual([]);
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

  // ---------------------------------------------------------------------------
  // 2026-04-29 P0 회귀 방지 (BUG-DRAW-001):
  //   자기 차례 시작 시 useGameSync.TURN_START 핸들러가
  //   saveTurnStartSnapshot(myTiles, tableGroups)을 호출한다.
  //   이때 tableGroups는 서버 보드의 모든 그룹(다른 플레이어가 만든 것 포함).
  //   saveTurnStartSnapshot 구현(prev=null 시 groups: tableGroups로 초기화)
  //   때문에 draft.groups는 서버 그룹들로 채워지지만, pendingGroupIds는 빈 Set.
  //
  //   selectHasPending이 draft.groups.length만 검사하면 → true → drawEnabled=false.
  //   사용자가 자기 차례에 드로우 버튼 못 누르는 회귀 발생.
  //
  //   RCA: drawEnabled = isMyTurn && !hasPending (UR-22). hasPending은 "내가 이번 턴에
  //        직접 마킹한 pending 그룹"을 의미해야 한다 (pendingGroupIds.size > 0).
  //        draft.groups에는 서버 보드 그룹도 포함되므로 이를 기준으로 삼으면 안 됨.
  // ---------------------------------------------------------------------------
  it("BUG-DRAW-001: saveTurnStartSnapshot 직후 pendingGroupIds 빈 Set이면 false (UR-22)", () => {
    // 시나리오: 다른 플레이어가 멜드를 만들어 보드에 그룹이 있는 상태에서
    //          자기 차례가 시작된다. useGameSync.TURN_START가 saveTurnStartSnapshot을
    //          호출하고, pendingGroupIds는 비어있어야 한다.
    const serverGroup = makeGroup("srv-meld-1", ["R7a", "R8a", "R9a"]);
    act(() => {
      usePendingStore.getState().saveTurnStartSnapshot(["B5b", "K3a"], [serverGroup]);
    });

    // draft는 존재하고 turnStartTableGroups에 서버 그룹이 보존되어야 한다.
    const draft = getStore().draft;
    expect(draft).not.toBeNull();
    expect(draft!.turnStartTableGroups).toEqual([serverGroup]);
    expect(draft!.pendingGroupIds.size).toBe(0);

    // 그러나 사용자가 아무 드래그도 안 했으므로 hasPending = false.
    // drawEnabled = isMyTurn && !hasPending = true 가 되어 드로우 가능해야 한다.
    expect(selectHasPending(getStore())).toBe(false);
  });

  it("BUG-DRAW-001: applyMutation 후 pendingGroupIds 채워지면 true", () => {
    // 자기 차례 시작
    act(() => {
      usePendingStore.getState().saveTurnStartSnapshot(["R7a", "B7b", "K7a"], []);
    });
    expect(selectHasPending(getStore())).toBe(false);

    // 사용자가 새 멜드 드래그
    act(() => {
      usePendingStore.getState().applyMutation(makeDragOutput({
        nextTableGroups: [makeGroup("pending-1", ["R7a", "B7b", "K7a"])],
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

// ---------------------------------------------------------------------------
// BUG-CONFIRM-001 — confirmBusy 영구 잠금 회귀 방지
//
// 컨텍스트:
//   GameClient.useEffect 의 confirmBusy 해제 조건이
//     수정 전: !draftPendingTableGroups && confirmBusy   (영구 잠금)
//     수정 후: draftPendingGroupIds.size === 0 && confirmBusy  (정상 해제)
//   의 의미를 store-level 계약으로 고정한다.
//
// 룰 매핑:
//   - V-01 (유효한 배치), V-13a/V-13d (런 확장), D-08 (조커 gap 채움)
//   - UR-04 (턴 시작/종료 시 pending 초기화)
// ---------------------------------------------------------------------------

describe("BUG-CONFIRM-001: confirmBusy 해제 조건 계약", () => {
  it("saveTurnStartSnapshot 후 draft.groups 는 비-null (구 조건이 영구 잠금되는 이유)", () => {
    // T+0: TURN_START 수신 — 서버 그룹이 비어 있지 않은 상태
    const serverGroups: TableGroup[] = [
      makeGroup("srv-1", ["R1a", "R2a", "R3a"]),
    ];
    act(() => {
      usePendingStore
        .getState()
        .saveTurnStartSnapshot(["B5a", "Y7a"], serverGroups);
    });

    const draft = getStore().draft;

    // 핵심: draft.groups 는 서버 그룹으로 채워져 있어 절대 null 이 아니다
    // → 구 조건 !draftPendingTableGroups 은 false → confirmBusy 해제 불가 = 영구 잠금
    expect(draft).not.toBeNull();
    expect(draft!.groups).not.toBeNull();
    expect(draft!.groups.length).toBeGreaterThan(0);

    // 신 조건: pendingGroupIds 는 빈 Set 이어야 정상 해제 가능
    expect(draft!.pendingGroupIds.size).toBe(0);
  });

  it("초기 등록 성공 → applyMutation → reset 사이클에서 pendingGroupIds.size 가 정상 추적된다", () => {
    // T+0: TURN_START
    act(() => {
      usePendingStore
        .getState()
        .saveTurnStartSnapshot(
          ["R7a", "R8a", "R9a"],
          [makeGroup("srv-1", ["B1a", "B2a", "B3a"])]
        );
    });

    // 초기 상태: pendingGroupIds 비어 있음 → confirmBusy 해제 가능
    expect(getStore().draft!.pendingGroupIds.size).toBe(0);

    // T+1: 사용자 드래그 → 새 pending 그룹 생성 (초기 등록 30점 런)
    const newGroupId = "pending-1";
    act(() => {
      usePendingStore.getState().applyMutation(
        makeDragOutput({
          nextTableGroups: [
            makeGroup("srv-1", ["B1a", "B2a", "B3a"]),
            makeGroup(newGroupId, ["R7a", "R8a", "R9a"]),
          ],
          nextMyTiles: [],
          nextPendingGroupIds: new Set([newGroupId]),
          nextPendingGroupSeq: 1,
          branch: "rack→new-group",
        })
      );
    });

    // pendingGroupIds 증가 → confirmBusy 가 true 로 진입했다고 가정해도 해제 안 됨 (정상)
    expect(getStore().draft!.pendingGroupIds.size).toBe(1);

    // T+2: CONFIRM_TURN 전송 후 서버 TURN_START 응답 → reset()
    act(() => {
      usePendingStore.getState().reset();
    });

    // 신 조건이 충족되어야 한다: pendingGroupIds.size === 0 → confirmBusy 정상 해제
    const draft = getStore().draft;
    expect(draft).not.toBeNull();
    expect(draft!.pendingGroupIds.size).toBe(0);

    // 회귀 가드: draft.groups 는 여전히 비-null 이므로
    // 구 조건 !draftPendingTableGroups 만으로는 절대 해제되지 않는다는 사실을 명시
    expect(draft!.groups).not.toBeNull();
  });

  it("rollbackToServerSnapshot 후에도 pendingGroupIds.size === 0 으로 confirmBusy 해제 가능 (INVALID_MOVE 경로)", () => {
    act(() => {
      usePendingStore
        .getState()
        .saveTurnStartSnapshot(
          ["R7a"],
          [makeGroup("srv-1", ["B1a", "B2a", "B3a"])]
        );
    });

    // 무효한 pending 변경 시도
    act(() => {
      usePendingStore.getState().applyMutation(
        makeDragOutput({
          nextTableGroups: [
            makeGroup("srv-1", ["B1a", "B2a", "B3a"]),
            makeGroup("pending-bad", ["R7a"]),
          ],
          nextMyTiles: [],
          nextPendingGroupIds: new Set(["pending-bad"]),
          branch: "test-invalid",
        })
      );
    });
    expect(getStore().draft!.pendingGroupIds.size).toBe(1);

    // 서버에서 INVALID_MOVE 응답 → rollback
    act(() => {
      usePendingStore.getState().rollbackToServerSnapshot();
    });

    // 해제 조건 충족
    expect(getStore().draft!.pendingGroupIds.size).toBe(0);
  });
});
