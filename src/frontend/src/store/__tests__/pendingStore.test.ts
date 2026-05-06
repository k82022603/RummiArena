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
  selectAllGroupsValid,
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

// ---------------------------------------------------------------------------
// 8. Draft 생성 → 확정 → Draft 클리어 전체 사이클
//
// 시나리오: 사용자가 드래그로 pending 그룹을 만들고 확정 후 reset()이 호출된다.
//   확정 전 confirmEnabled=true, reset 후 pendingGroupIds.size=0 → 다시 확정 가능한 상태.
//
// 룰 매핑:
//   - UR-04: 턴 시작/종료 시 pending 초기화
//   - UR-15: ConfirmTurn 활성화 조건
// ---------------------------------------------------------------------------

describe("Draft 생성 → 확정 → Draft 클리어 전체 사이클", () => {
  it("draft 생성 시 confirmEnabled=true, reset 후 pendingGroupIds.size=0으로 재확정 가능 상태", () => {
    // T+0: TURN_START — 랙 3장, 보드 비어있음
    const startRack: TileCode[] = ["R7a", "B7b", "K7a"];
    act(() => {
      usePendingStore.getState().saveTurnStartSnapshot(startRack, []);
    });

    // confirmEnabled는 pending이 없으므로 false
    expect(selectConfirmEnabled(getStore(), true)).toBe(false);

    // T+1: 사용자 드래그 — 3장 그룹 생성 (7+7+7 = 21점, hasInitialMeld=true이므로 30점 조건 불필요)
    act(() => {
      usePendingStore.getState().applyMutation(
        makeDragOutput({
          nextTableGroups: [makeGroup("pending-1", ["R7a", "B7b", "K7a"])],
          nextMyTiles: [],
          nextPendingGroupIds: new Set(["pending-1"]),
          branch: "rack→board:new-group",
        })
      );
    });

    // confirmEnabled = true (tilesAdded=3, 유효 그룹 1개, hasInitialMeld=true)
    expect(selectConfirmEnabled(getStore(), true)).toBe(true);
    expect(getStore().draft!.pendingGroupIds.size).toBe(1);

    // T+2: CONFIRM_TURN 전송 후 서버로부터 다음 TURN_START 수신 → reset()
    act(() => {
      usePendingStore.getState().reset();
    });

    // reset 후: pendingGroupIds.size=0 → confirmBusy 해제 가능
    const draft = getStore().draft;
    expect(draft).not.toBeNull();
    expect(draft!.pendingGroupIds.size).toBe(0);

    // reset 후 confirmEnabled = false (pending 없음)
    expect(selectConfirmEnabled(getStore(), true)).toBe(false);
  });

  it("사이클을 2회 반복해도 상태가 깨끗하게 초기화된다", () => {
    // 1회차
    act(() => {
      usePendingStore.getState().saveTurnStartSnapshot(["R7a", "B7b", "K7a"], []);
    });
    act(() => {
      usePendingStore.getState().applyMutation(
        makeDragOutput({
          nextTableGroups: [makeGroup("pending-1", ["R7a", "B7b", "K7a"])],
          nextMyTiles: [],
          nextPendingGroupIds: new Set(["pending-1"]),
        })
      );
    });
    expect(getStore().draft!.pendingGroupIds.size).toBe(1);
    act(() => {
      usePendingStore.getState().reset();
    });
    expect(getStore().draft!.pendingGroupIds.size).toBe(0);

    // 2회차: 새 TURN_START 스냅샷 저장
    act(() => {
      usePendingStore.getState().saveTurnStartSnapshot(["R10a", "B10b", "K10a"], []);
    });
    act(() => {
      usePendingStore.getState().applyMutation(
        makeDragOutput({
          nextTableGroups: [makeGroup("pending-2", ["R10a", "B10b", "K10a"])],
          nextMyTiles: [],
          nextPendingGroupIds: new Set(["pending-2"]),
        })
      );
    });
    expect(getStore().draft!.pendingGroupIds.size).toBe(1);
    act(() => {
      usePendingStore.getState().reset();
    });
    expect(getStore().draft!.pendingGroupIds.size).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// 9. 빈 Draft에서 확정 시도 방어
//
// 시나리오: 사용자가 아무 드래그도 하지 않은 상태(pendingGroupIds 빈 Set)에서
//   확정 버튼을 누른다. selectConfirmEnabled가 false를 반환하여 전송 차단.
//   draft가 null이거나 pendingGroupIds.size=0이면 조용히 false.
//
// 룰 매핑:
//   - UR-15: ConfirmTurn 활성화 조건 — pending 없으면 비활성
// ---------------------------------------------------------------------------

describe("빈 Draft에서 확정 시도 방어 (UR-15)", () => {
  it("draft=null 상태에서 selectConfirmEnabled는 false를 반환한다", () => {
    // draft가 null인 초기 상태
    expect(getStore().draft).toBeNull();
    expect(selectConfirmEnabled(getStore(), true)).toBe(false);
    expect(selectConfirmEnabled(getStore(), false)).toBe(false);
  });

  it("saveTurnStartSnapshot만 호출한 상태 (드래그 없음)에서 selectConfirmEnabled는 false", () => {
    // TURN_START 수신 후 아무 드래그 안 함
    act(() => {
      usePendingStore.getState().saveTurnStartSnapshot(["R7a", "B5b", "K3a"], []);
    });

    // pendingGroupIds 빈 Set → hasPending=false → confirmEnabled=false
    expect(selectHasPending(getStore())).toBe(false);
    expect(selectConfirmEnabled(getStore(), true)).toBe(false);
  });

  it("빈 pendingGroupIds에서 rollback 호출해도 에러 없이 처리된다", () => {
    // pendingGroupIds가 빈 Set인 상태에서 rollback
    act(() => {
      usePendingStore.getState().saveTurnStartSnapshot(["R7a"], []);
    });
    expect(getStore().draft!.pendingGroupIds.size).toBe(0);

    // 예외 없이 실행 완료, 상태 불변
    expect(() => {
      act(() => {
        usePendingStore.getState().rollbackToServerSnapshot();
      });
    }).not.toThrow();

    expect(getStore().draft!.pendingGroupIds.size).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// 10. Draft 있는 상태에서 턴 종료 → Draft 클리어
//
// 시나리오: 드래그 후 pending이 생긴 상태에서 TURN_END/TURN_START(다음 플레이어)로
//   인해 reset()이 호출된다. draft 내 pendingGroupIds가 빈 Set으로 초기화되고
//   turnStartTableGroups로 groups가 복원된다.
//
// 룰 매핑:
//   - UR-04: 턴 시작/종료 시 pending 초기화
// ---------------------------------------------------------------------------

describe("Draft 있는 상태에서 턴 종료 → Draft 클리어 (UR-04)", () => {
  it("pending 그룹이 있는 상태에서 reset() 호출 시 pendingGroupIds가 빈 Set이 된다", () => {
    const startTableGroups: TableGroup[] = [makeGroup("srv-1", ["B1a", "B2a", "B3a"])];
    act(() => {
      usePendingStore.getState().saveTurnStartSnapshot(["R7a", "B7b"], startTableGroups);
    });

    // 드래그로 pending 생성
    act(() => {
      usePendingStore.getState().applyMutation(
        makeDragOutput({
          nextTableGroups: [
            makeGroup("srv-1", ["B1a", "B2a", "B3a"]),
            makeGroup("pending-1", ["R7a", "B7b"]),
          ],
          nextMyTiles: [],
          nextPendingGroupIds: new Set(["pending-1"]),
          branch: "rack→board:new-group",
        })
      );
    });

    expect(getStore().draft!.pendingGroupIds.size).toBe(1);
    expect(selectHasPending(getStore())).toBe(true);

    // 턴 종료 — 다음 TURN_START 이벤트가 reset()을 유발한다고 가정
    act(() => {
      usePendingStore.getState().reset();
    });

    const draft = getStore().draft;
    // pendingGroupIds가 빈 Set으로 초기화됨
    expect(draft!.pendingGroupIds.size).toBe(0);
    // groups가 turnStartTableGroups로 복원됨
    expect(draft!.groups).toEqual(startTableGroups);
    // myTiles가 turnStartRack으로 복원됨
    expect(draft!.myTiles).toEqual(["R7a", "B7b"]);
    // recoveredJokers 초기화
    expect(draft!.recoveredJokers).toHaveLength(0);
    // selectHasPending = false (드로우 버튼 다시 활성화 가능)
    expect(selectHasPending(getStore())).toBe(false);
  });

  it("reset 후 groups는 null이 아니라 turnStartTableGroups 배열이다", () => {
    // 시나리오: draft=null 상태에서 reset() 호출 → draft=null 그대로
    act(() => {
      usePendingStore.getState().reset();
    });
    expect(getStore().draft).toBeNull();

    // 시나리오: saveTurnStartSnapshot 후 reset() → draft 유지, groups=turnStartTableGroups
    act(() => {
      usePendingStore.getState().saveTurnStartSnapshot([], [makeGroup("srv-2", ["R1a", "R2a", "R3a"])]);
    });
    act(() => {
      usePendingStore.getState().reset();
    });
    const draft = getStore().draft;
    expect(draft).not.toBeNull();
    expect(draft!.groups).toEqual([makeGroup("srv-2", ["R1a", "R2a", "R3a"])]);
  });
});

// ---------------------------------------------------------------------------
// 11. 여러 그룹 Draft 후 일부 제거 → 확정 가능 여부
//
// 시나리오: 3개 pending 그룹을 만든 뒤 2개를 제거하고 나머지 1개만 유효하면
//   selectConfirmEnabled = true.
//   pendingGroupIds.size > 0이고 모든 pending 그룹이 >= 3장이어야 한다.
//
// 룰 매핑:
//   - INV-G3: 빈 그룹 자동 제거
//   - UR-15: ConfirmTurn 활성화 조건
//   - V-02: 최소 3장 그룹
// ---------------------------------------------------------------------------

describe("여러 그룹 Draft 후 일부 제거 → 확정 가능 여부 (UR-15, V-02)", () => {
  it("3개 그룹 생성 후 2개 제거 → 나머지 1개로 확정 가능", () => {
    // 랙에 충분한 타일
    const rack: TileCode[] = ["R7a", "B7b", "K7a", "R8a", "B8b", "K8a", "R9a", "B9b", "K9a"];
    act(() => {
      usePendingStore.getState().saveTurnStartSnapshot(rack, []);
    });

    // 3개 그룹 생성
    act(() => {
      usePendingStore.getState().applyMutation(
        makeDragOutput({
          nextTableGroups: [
            makeGroup("pending-1", ["R7a", "B7b", "K7a"]),
            makeGroup("pending-2", ["R8a", "B8b", "K8a"]),
            makeGroup("pending-3", ["R9a", "B9b", "K9a"]),
          ],
          nextMyTiles: [],
          nextPendingGroupIds: new Set(["pending-1", "pending-2", "pending-3"]),
          branch: "rack→board:new-group",
        })
      );
    });

    expect(getStore().draft!.pendingGroupIds.size).toBe(3);
    expect(selectAllGroupsValid(getStore())).toBe(true);

    // pending-2, pending-3을 랙으로 돌려보냄 → pending-1만 남음
    act(() => {
      usePendingStore.getState().applyMutation(
        makeDragOutput({
          nextTableGroups: [makeGroup("pending-1", ["R7a", "B7b", "K7a"])],
          nextMyTiles: ["R8a", "B8b", "K8a", "R9a", "B9b", "K9a"],
          nextPendingGroupIds: new Set(["pending-1"]),
          branch: "pending→rack",
        })
      );
    });

    expect(getStore().draft!.pendingGroupIds.size).toBe(1);
    // pending-1 3장(유효) → selectAllGroupsValid=true
    expect(selectAllGroupsValid(getStore())).toBe(true);
    // tilesAdded=3 (랙 9장→6장), hasInitialMeld=true → confirmEnabled=true
    expect(selectConfirmEnabled(getStore(), true)).toBe(true);
  });

  it("3개 그룹 중 2개 제거 후 남은 1개가 2장(미달)이면 confirmEnabled=false", () => {
    const rack: TileCode[] = ["R7a", "B7b", "K7a", "R8a", "B8b", "K8a", "R9a", "B9b"];
    act(() => {
      usePendingStore.getState().saveTurnStartSnapshot(rack, []);
    });

    // 3개 그룹 생성 (마지막은 2장짜리 미달 그룹)
    act(() => {
      usePendingStore.getState().applyMutation(
        makeDragOutput({
          nextTableGroups: [
            makeGroup("pending-1", ["R7a", "B7b", "K7a"]),
            makeGroup("pending-2", ["R8a", "B8b", "K8a"]),
            makeGroup("pending-3", ["R9a", "B9b"]),  // 2장: 미달
          ],
          nextMyTiles: [],
          nextPendingGroupIds: new Set(["pending-1", "pending-2", "pending-3"]),
          branch: "rack→board:new-group",
        })
      );
    });

    // pending-1, pending-2 제거 → 미달 pending-3만 남음
    act(() => {
      usePendingStore.getState().applyMutation(
        makeDragOutput({
          nextTableGroups: [makeGroup("pending-3", ["R9a", "B9b"])],
          nextMyTiles: ["R7a", "B7b", "K7a", "R8a", "B8b", "K8a"],
          nextPendingGroupIds: new Set(["pending-3"]),
          branch: "pending→rack",
        })
      );
    });

    // selectAllGroupsValid = false (pending-3이 2장)
    expect(selectAllGroupsValid(getStore())).toBe(false);
    // confirmEnabled = false
    expect(selectConfirmEnabled(getStore(), true)).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// 12. confirmBusy 영구 잠금 방지 — draftPendingGroupIds.size === 0 체크 명시적 회귀 가드
//
// 배경:
//   수정 전 GameClient.useEffect 조건: !draftPendingTableGroups
//     → saveTurnStartSnapshot 후 draft.groups가 서버 그룹으로 채워져 truthy
//     → 조건 false → confirmBusy 영구 잠금
//   수정 후 조건: draftPendingGroupIds.size === 0
//     → 사용자가 아무 드래그도 안 해도 Set.size=0 → 조건 true → 정상 해제
//
// 이 테스트는 pendingStore.draft 의 두 가지 상태를 명시적으로 비교하여
//   "size===0 체크"가 "!groups 체크"보다 왜 안전한지 계약으로 고정한다.
//
// 룰 매핑:
//   - UR-04: 턴 시작/종료 시 pending 초기화
//   - BUG-CONFIRM-001 (2026-05-01)
// ---------------------------------------------------------------------------

describe("BUG-CONFIRM-001 확장: size===0 체크 vs !groups 체크 계약 (회귀 가드)", () => {
  it("서버 그룹이 존재해도 pendingGroupIds.size는 0 — !groups 조건이 잘못된 이유", () => {
    // 보드에 서버 그룹이 3개 있는 상황
    const serverGroups: TableGroup[] = [
      makeGroup("srv-meld-1", ["R1a", "R2a", "R3a"]),
      makeGroup("srv-meld-2", ["B4a", "B5a", "B6a"]),
      makeGroup("srv-meld-3", ["K7a", "K8a", "K9a"]),
    ];
    act(() => {
      usePendingStore.getState().saveTurnStartSnapshot(["Y10a"], serverGroups);
    });

    const draft = getStore().draft;

    // !groups 체크 방식 — truthy이므로 confirmBusy 해제 불가 (잘못된 조건)
    const falseConditionResult = !draft!.groups;
    expect(falseConditionResult).toBe(false);  // false → 해제 안 됨 = 버그

    // size===0 체크 방식 — pendingGroupIds가 빈 Set이면 confirmBusy 해제 가능 (올바른 조건)
    const correctConditionResult = draft!.pendingGroupIds.size === 0;
    expect(correctConditionResult).toBe(true);  // true → 해제 가능 = 정상
  });

  it("applyMutation 후 pendingGroupIds.size > 0 → confirmBusy 해제 차단 (잠금 유지)", () => {
    act(() => {
      usePendingStore.getState().saveTurnStartSnapshot(["R7a", "B7b", "K7a"], []);
    });

    // 드래그로 pending 그룹 생성
    act(() => {
      usePendingStore.getState().applyMutation(
        makeDragOutput({
          nextTableGroups: [makeGroup("pending-1", ["R7a", "B7b", "K7a"])],
          nextMyTiles: [],
          nextPendingGroupIds: new Set(["pending-1"]),
        })
      );
    });

    const draft = getStore().draft;

    // 확정 처리 중: pendingGroupIds.size > 0 → confirmBusy 해제하면 안 됨
    expect(draft!.pendingGroupIds.size).toBe(1);
    expect(draft!.pendingGroupIds.size === 0).toBe(false);  // 해제 조건 미충족
  });

  it("reset 후 pendingGroupIds.size===0 → confirmBusy 해제 조건 충족, Set 자체는 non-null", () => {
    act(() => {
      usePendingStore.getState().saveTurnStartSnapshot(["R7a", "B7b", "K7a"], []);
    });
    act(() => {
      usePendingStore.getState().applyMutation(
        makeDragOutput({
          nextTableGroups: [makeGroup("pending-1", ["R7a", "B7b", "K7a"])],
          nextMyTiles: [],
          nextPendingGroupIds: new Set(["pending-1"]),
        })
      );
    });
    act(() => {
      usePendingStore.getState().reset();
    });

    const draft = getStore().draft;

    // pendingGroupIds는 null/undefined가 아닌 빈 Set
    expect(draft!.pendingGroupIds).toBeInstanceOf(Set);
    // size===0 → confirmBusy 해제 가능
    expect(draft!.pendingGroupIds.size).toBe(0);
    expect(draft!.pendingGroupIds.size === 0).toBe(true);
    // groups는 여전히 non-null (구 조건이 잘못된 이유 재확인)
    expect(draft!.groups).not.toBeNull();
  });
});

// ---------------------------------------------------------------------------
// 13. BUG-GHOST-002 — saveTurnStartSnapshot groups 동기화 (F1/F3)
//
// 배경:
//   수정 전: saveTurnStartSnapshot이 ...prev spread만 수행하여
//     이전 reset()의 stale groups가 draft.groups에 남음.
//     다음 턴에 AI가 배치한 새 보드를 반영하지 못해 "좀비 그룹"이 표시됨.
//
//   수정 후: groups: filtered, pendingGroupIds: new Set(), recoveredJokers: []
//     명시적으로 새 서버 보드로 동기화 + 새 턴이므로 pending 초기화.
//
// 룰 매핑:
//   - F-01: TURN_START 수신 → pendingStore 스냅샷 저장
//   - UR-04: 턴 시작 시 pending 초기화
//   - INV-G3: 빈 그룹 자동 제거
// ---------------------------------------------------------------------------

describe("BUG-GHOST-002: saveTurnStartSnapshot groups 동기화 (F1/F3)", () => {
  it("F1: saveTurnStartSnapshot 후 draft.groups가 새 tableGroups와 일치한다", () => {
    // 1회차 턴: 보드에 그룹 A만 있음
    const groupA: TableGroup = makeGroup("srv-A", ["R1a", "R2a", "R3a"]);
    act(() => {
      usePendingStore.getState().saveTurnStartSnapshot(["R7a"], [groupA]);
    });

    // 드래그로 pending 그룹 생성 (groups에 pending 그룹이 추가됨)
    act(() => {
      usePendingStore.getState().applyMutation(
        makeDragOutput({
          nextTableGroups: [groupA, makeGroup("pending-1", ["R7a"])],
          nextMyTiles: [],
          nextPendingGroupIds: new Set(["pending-1"]),
          branch: "rack→board:new-group",
        })
      );
    });
    expect(getStore().draft!.groups).toHaveLength(2);

    // 2회차 턴 시작: 서버 보드가 groupA + groupB로 갱신됨 (AI 배치 확정)
    const groupB: TableGroup = makeGroup("srv-B", ["B4a", "B5a", "B6a"]);
    act(() => {
      usePendingStore.getState().saveTurnStartSnapshot(["R10a"], [groupA, groupB]);
    });

    const draft = getStore().draft;
    expect(draft).not.toBeNull();
    // F1 핵심: draft.groups가 새 서버 보드(groupA + groupB)로 동기화되어야 함
    expect(draft!.groups).toHaveLength(2);
    expect(draft!.groups.map((g) => g.id)).toContain("srv-A");
    expect(draft!.groups.map((g) => g.id)).toContain("srv-B");
    // pending은 새 턴 시작이므로 초기화
    expect(draft!.pendingGroupIds.size).toBe(0);
    expect(draft!.recoveredJokers).toHaveLength(0);
    // 랙도 새 값으로 갱신
    expect(draft!.myTiles).toEqual(["R10a"]);
    expect(draft!.turnStartRack).toEqual(["R10a"]);
    expect(draft!.turnStartTableGroups).toEqual([groupA, groupB]);
  });

  it("F3: saveTurnStartSnapshot에 빈 그룹이 포함되면 필터링된다", () => {
    // 빈 그룹이 포함된 tableGroups (비정상 서버 응답 방어)
    const emptyGroup: TableGroup = makeGroup("srv-empty", []);
    const validGroup: TableGroup = makeGroup("srv-valid", ["R1a", "R2a", "R3a"]);

    act(() => {
      usePendingStore.getState().saveTurnStartSnapshot(
        ["R7a"],
        [emptyGroup, validGroup]
      );
    });

    const draft = getStore().draft;
    expect(draft).not.toBeNull();
    // 빈 그룹 srv-empty는 제거, valid 그룹만 남아야 함
    expect(draft!.groups).toHaveLength(1);
    expect(draft!.groups[0].id).toBe("srv-valid");
    // turnStartTableGroups도 동일하게 필터링
    expect(draft!.turnStartTableGroups).toHaveLength(1);
    expect(draft!.turnStartTableGroups[0].id).toBe("srv-valid");
  });

  it("F1: 이전 pending 그룹이 새 turnStartSnapshot 후 draft.groups에 남지 않는다", () => {
    // 1회차: pending 그룹이 있는 상태
    act(() => {
      usePendingStore.getState().saveTurnStartSnapshot(["R7a", "B5b"], []);
    });
    act(() => {
      usePendingStore.getState().applyMutation(
        makeDragOutput({
          nextTableGroups: [makeGroup("pending-stale", ["R7a"])],
          nextMyTiles: ["B5b"],
          nextPendingGroupIds: new Set(["pending-stale"]),
          branch: "rack→board:new-group",
        })
      );
    });
    // stale pending 그룹이 draft.groups에 있음
    expect(
      getStore().draft!.groups.some((g) => g.id === "pending-stale")
    ).toBe(true);

    // 2회차 TURN_START: 새 서버 보드 (stale pending 그룹 없음)
    const freshGroup: TableGroup = makeGroup("srv-fresh", ["K1a", "K2a", "K3a"]);
    act(() => {
      usePendingStore.getState().saveTurnStartSnapshot(["Y8a"], [freshGroup]);
    });

    const draft = getStore().draft;
    // stale pending 그룹이 완전히 사라져야 함 (좀비 카드 제거)
    expect(
      draft!.groups.some((g) => g.id === "pending-stale")
    ).toBe(false);
    // 새 서버 그룹만 남아야 함
    expect(draft!.groups).toHaveLength(1);
    expect(draft!.groups[0].id).toBe("srv-fresh");
  });
});
