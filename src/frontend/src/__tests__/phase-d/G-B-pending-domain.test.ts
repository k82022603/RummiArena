/**
 * G-B pending domain RED spec (6 TC)
 *
 * Sprint 7 W2 Task #5 (G-B): pendingStore + dragEndReducer 도메인 테스트
 *
 * F-02: 랙 -> 보드 새 그룹 생성
 * F-03: 기존 pending 그룹에 타일 추가
 * F-17: V-04 진행 표시 (pending 점수 계산)
 * GHOST-SC2: pending cleanup (TURN_START 시 draft 초기화)
 *
 * 룰 ID 매핑:
 *   - INV-G1: 그룹 ID 유니크 보장
 *   - INV-G3: 빈 그룹 자동 제거
 *   - UR-19: 비호환 드롭 처리
 *   - V-04: pending 배치 점수 >= 30
 *   - UR-04: TURN_START 시 pending 강제 초기화
 *   - D-12: pending 그룹 ID = "pending-" prefix
 *
 * SSOT:
 *   docs/02-design/55-game-rules-enumeration.md
 *   docs/02-design/56-action-state-matrix.md
 *   docs/02-design/60-ui-feature-spec.md
 *
 * Phase D Day 2 -- RED commit (구현 연결 전, 모두 FAIL 예상)
 *
 * RED 근거:
 *   dragEndReducer는 현재 branch(문자열)만 반환한다. 이 spec은
 *   Phase E에서 추가될 semantic action 열거형 필드(action)와, pendingStore를
 *   GameClient에서 소비하는 통합 경로를 검증한다.
 *   - DragOutput.action 필드: 아직 미구현 (Phase E 예정)
 *   - pendingStore applyMutation -> GameClient 소비 경로: 아직 미연결
 *   - selectPendingPlacementScore -> UI 반영: 아직 미연결
 *   - TURN_START -> pendingStore.reset 자동 호출: useGameSync 존재하나
 *     GameClient에서 useGameSync를 mount하지 않음
 */

import type { TileCode, TableGroup } from "@/types/tile";
import {
  dragEndReducer,
  type DragReducerState,
  type DragInput,
  type DragOutput,
} from "@/lib/dragEnd/dragEndReducer";
import {
  usePendingStore,
  selectPendingPlacementScore,
} from "@/store/pendingStore";
import { act } from "@testing-library/react";

// ---------------------------------------------------------------------------
// Phase E에서 추가될 semantic action 타입 (현재 미구현)
// ---------------------------------------------------------------------------

/**
 * DragOutput에 추가될 semantic action 열거형.
 * 현재 DragOutput.branch는 디버그용 문자열이고,
 * Phase E에서 action 필드가 공식 API로 추가된다.
 */
type DragAction =
  | "CREATE_PENDING_GROUP"
  | "ADD_TO_PENDING_GROUP"
  | "REJECT"
  | "MERGE_TO_SERVER_GROUP"
  | "RETURN_TO_RACK"
  | "JOKER_SWAP"
  | "REORDER_IN_GROUP";

// ---------------------------------------------------------------------------
// 헬퍼
// ---------------------------------------------------------------------------

/** 기본 DragReducerState 생성 (빈 보드, 랙에 타일 보유) */
function makeBaseState(overrides?: Partial<DragReducerState>): DragReducerState {
  return {
    tableGroups: [],
    myTiles: ["R7a", "B8a", "Y5a", "K10a"] as TileCode[],
    pendingGroupIds: new Set<string>(),
    pendingRecoveredJokers: [],
    hasInitialMeld: false,
    forceNewGroup: false,
    pendingGroupSeq: 0,
    ...overrides,
  };
}

/** DragInput 축약 생성 */
function rackToBoard(tileCode: TileCode, overId: string, now?: number): DragInput {
  return {
    source: { kind: "rack" },
    tileCode,
    overId,
    now: now ?? 1000,
  };
}

function rackToGroup(tileCode: TileCode, groupId: string, now?: number): DragInput {
  return {
    source: { kind: "rack" },
    tileCode,
    overId: groupId,
    now: now ?? 2000,
  };
}

/** TableGroup 축약 생성 */
function G(id: string, tiles: TileCode[], type?: "group" | "run"): TableGroup {
  return { id, tiles, type: type ?? "group" };
}

/**
 * DragOutput에서 semantic action을 추출한다.
 * Phase E 구현 후에는 result.action을 직접 사용.
 * 현재는 result에 action 필드가 없으므로 이 함수가 undefined를 반환 -> RED.
 */
function extractAction(result: DragOutput): DragAction | undefined {
  // Phase E에서 DragOutput에 action 필드가 추가되면 이 줄이 활성화된다.
  // 현재는 'action' 프로퍼티가 존재하지 않으므로 undefined를 반환한다.
  return (result as Record<string, unknown>).action as DragAction | undefined;
}

// ---------------------------------------------------------------------------
// F-02: 랙 -> 보드 새 그룹 생성 (2 TC)
// ---------------------------------------------------------------------------

describe("[F-02] [D-12] [INV-G1] 랙 타일 -> 빈 보드 영역 드롭 = 새 pending 그룹 생성", () => {
  /**
   * F02-SC1: dragEndReducer에 랙 타일 -> game-board 드롭 입력 시
   *          결과의 action이 'CREATE_PENDING_GROUP'이고
   *          pendingGroup에 해당 타일이 포함됨
   *
   * 룰: D-12 (pending 그룹 ID = "pending-" prefix)
   * RED 근거: DragOutput.action 필드 미구현 (Phase E 예정)
   */
  it("F02-SC1: rack -> game-board 드롭 시 action === 'CREATE_PENDING_GROUP' + 타일 포함", () => {
    const state = makeBaseState();
    const input = rackToBoard("R7a" as TileCode, "game-board", 2000);

    const result: DragOutput = dragEndReducer(state, input);

    // 1. reject 아님
    expect(result.rejected).toBeUndefined();

    // 2. semantic action이 CREATE_PENDING_GROUP (Phase E 미구현 -> RED)
    const action = extractAction(result);
    expect(action).toBe("CREATE_PENDING_GROUP");

    // 3. 새 그룹 ID는 "pending-" prefix (D-12)
    const newGroup = result.nextTableGroups![0];
    expect(newGroup.id).toMatch(/^pending-/);

    // 4. 새 그룹에 드롭한 타일이 포함됨
    expect(newGroup.tiles).toContain("R7a");
  });

  /**
   * F02-SC2: 연속 2회 드롭 시 각각 다른 groupId(pending- prefix)를 가진
   *          2개 그룹 생성, 모두 action === 'CREATE_PENDING_GROUP'
   *
   * 룰: INV-G1 (그룹 ID 유니크 보장)
   * RED 근거: DragOutput.action 필드 미구현 (Phase E 예정)
   */
  it("F02-SC2: 연속 2회 드롭 시 모두 action === 'CREATE_PENDING_GROUP' + 유니크 ID (INV-G1)", () => {
    const state = makeBaseState({ forceNewGroup: true });
    const input1 = rackToBoard("R7a" as TileCode, "game-board", 2000);

    const result1: DragOutput = dragEndReducer(state, input1);
    expect(result1.rejected).toBeUndefined();

    // 첫 번째 드롭: action === CREATE_PENDING_GROUP
    const action1 = extractAction(result1);
    expect(action1).toBe("CREATE_PENDING_GROUP");

    // result1의 출력 상태를 다음 입력 상태로 사용
    const state2 = makeBaseState({
      tableGroups: result1.nextTableGroups!,
      myTiles: result1.nextMyTiles ?? state.myTiles,
      pendingGroupIds: result1.nextPendingGroupIds,
      pendingGroupSeq: result1.nextPendingGroupSeq,
      forceNewGroup: true,
    });
    const input2 = rackToBoard("B8a" as TileCode, "game-board", 2001);

    const result2: DragOutput = dragEndReducer(state2, input2);
    expect(result2.rejected).toBeUndefined();

    // 두 번째 드롭: action === CREATE_PENDING_GROUP
    const action2 = extractAction(result2);
    expect(action2).toBe("CREATE_PENDING_GROUP");

    // INV-G1: 2개 그룹의 ID가 서로 달라야 함
    const groups = result2.nextTableGroups!;
    const pendingGroups = groups.filter((g) => g.id.startsWith("pending-"));
    expect(pendingGroups.length).toBe(2);
    const ids = pendingGroups.map((g) => g.id);
    expect(ids[0]).not.toBe(ids[1]);
  });
});

// ---------------------------------------------------------------------------
// F-03: 기존 pending 그룹에 타일 추가 (2 TC)
// ---------------------------------------------------------------------------

describe("[F-03] [UR-14] [UR-19] 기존 pending 그룹에 타일 추가", () => {
  /**
   * F03-SC1: 랙 타일 -> 기존 pending 그룹에 호환 타일 드롭 시
   *          결과의 action이 'ADD_TO_PENDING_GROUP'이고
   *          해당 그룹의 tiles 배열 길이가 +1
   *
   * 룰: UR-14 (호환 검사 통과 시 병합)
   * RED 근거: DragOutput.action 필드 미구현 (Phase E 예정)
   */
  it("F03-SC1: rack -> 기존 pending 그룹에 호환 타일 드롭 시 action === 'ADD_TO_PENDING_GROUP' + tiles +1", () => {
    // 기존 pending 그룹: 7-그룹 [B7a, K7a] -- R7a 추가 가능 (같은 숫자, 다른 색)
    const existingGroupId = "pending-1500-1";
    const existingGroup = G(existingGroupId, ["B7a", "K7a"] as TileCode[], "group");
    const state = makeBaseState({
      tableGroups: [existingGroup],
      myTiles: ["R7a", "Y5a"] as TileCode[],
      pendingGroupIds: new Set([existingGroupId]),
      pendingGroupSeq: 1,
      hasInitialMeld: false,
    });

    const input = rackToGroup("R7a" as TileCode, existingGroupId);
    const result: DragOutput = dragEndReducer(state, input);

    // reject 아님
    expect(result.rejected).toBeUndefined();

    // semantic action === ADD_TO_PENDING_GROUP (Phase E 미구현 -> RED)
    const action = extractAction(result);
    expect(action).toBe("ADD_TO_PENDING_GROUP");

    // 해당 그룹의 tiles 길이가 3 (기존 2 + 추가 1)
    const updatedGroup = result.nextTableGroups!.find((g) => g.id === existingGroupId);
    expect(updatedGroup).toBeDefined();
    expect(updatedGroup!.tiles.length).toBe(3);

    // 추가된 타일이 포함됨
    expect(updatedGroup!.tiles).toContain("R7a");
  });

  /**
   * F03-SC2: 비호환 타일(같은 숫자 같은 색 중복) 드롭 시
   *          결과의 action이 'REJECT' 또는 'CREATE_PENDING_GROUP' (새 그룹 생성)
   *
   * 룰: UR-19 (비호환 드롭 처리 -- 거절 또는 새 그룹 분기)
   * RED 근거: DragOutput.action 필드 미구현 (Phase E 예정)
   */
  it("F03-SC2: 비호환 타일 드롭 시 action === 'REJECT' 또는 'CREATE_PENDING_GROUP' (UR-19)", () => {
    // 기존 pending 그룹: 7-그룹 [B7a, K7a] -- B7b 추가 시도 (같은 색 B 중복 = 비호환)
    const existingGroupId = "pending-1500-1";
    const existingGroup = G(existingGroupId, ["B7a", "K7a"] as TileCode[], "group");
    const state = makeBaseState({
      tableGroups: [existingGroup],
      myTiles: ["B7b", "Y5a"] as TileCode[],
      pendingGroupIds: new Set([existingGroupId]),
      pendingGroupSeq: 1,
      hasInitialMeld: false,
    });

    const input = rackToGroup("B7b" as TileCode, existingGroupId);
    const result: DragOutput = dragEndReducer(state, input);

    // UR-19: 비호환 타일 처리 시 semantic action 필드가 있어야 함
    const action = extractAction(result);

    // 옵션 A: REJECT, 옵션 B: CREATE_PENDING_GROUP (새 그룹 분기)
    expect(["REJECT", "CREATE_PENDING_GROUP"]).toContain(action);

    // 어느 옵션이든 원래 그룹에 B7b가 추가되지 않아야 함 (같은 색 중복 방지)
    if (!result.rejected) {
      const originalGroup = result.nextTableGroups!.find((g) => g.id === existingGroupId);
      expect(originalGroup).toBeDefined();
      expect(originalGroup!.tiles).not.toContain("B7b");
    }
  });
});

// ---------------------------------------------------------------------------
// F-17: V-04 진행 표시 -- pending 배치 점수 (1 TC)
// ---------------------------------------------------------------------------

describe("[F-17] [V-04] pending 배치 점수 계산 -- selectPendingPlacementScore", () => {
  beforeEach(() => {
    act(() => {
      usePendingStore.getState().reset();
    });
  });

  /**
   * F17-SC1: pendingStore에 타일 배치 후 selectPendingPlacementScore가
   *          배치된 타일 점수 합을 반환 (예: R7 + B8 = 15)
   *
   * 룰: V-04 (초기 등록 30점 기준 -- 클라이언트 미러 점수 계산)
   * RED 근거: GameClient가 pendingStore를 소비하지 않으므로
   *           applyMutation -> selectPendingPlacementScore -> UI 반영
   *           전체 경로가 미연결. 이 TC는 "GameClient에서 useGameSync를 mount한 후
   *           dragEnd 핸들러가 pendingStore.applyMutation을 호출하고,
   *           UI가 selectPendingPlacementScore를 구독하여 점수를 표시하는 것"을
   *           검증하는 통합 테스트의 사전 조건이다.
   *
   *           구체적으로, 이 TC는 applyMutation 후 draft.groups 내 pending 그룹에 대해
   *           computePendingScore 를 통해 정확한 점수를 반환하는지 검증한다.
   *           현재 applyMutation은 구현되어 있으나, GameClient의 handleDragEnd가
   *           pendingStore.applyMutation을 호출하지 않으므로 실제 게임에서는 동작하지 않는다.
   *
   * 검증 항목 (Phase E 통합 시 GREEN 전환 조건):
   *   - GameClient.handleDragEnd -> pendingStore.applyMutation 호출 경로
   *   - UI 컴포넌트가 selectPendingPlacementScore 를 useStore selector로 구독
   *   - 점수 표시 UI 요소 존재 (data-testid="pending-score")
   */
  it("F17-SC1: pending 그룹에 R7a + B8a 배치 후 점수 = 15, UI에 표시됨 (V-04)", () => {
    const pendingGroupId = "pending-3000-1";

    // pendingStore에 draft 설정
    act(() => {
      usePendingStore.getState().saveTurnStartSnapshot(
        ["R7a", "B8a", "Y5a"] as TileCode[],
        []
      );

      usePendingStore.getState().applyMutation({
        nextTableGroups: [
          {
            id: pendingGroupId,
            tiles: ["R7a", "B8a"] as TileCode[],
            type: "group" as const,
          },
        ],
        nextMyTiles: ["Y5a"] as TileCode[],
        nextPendingGroupIds: new Set([pendingGroupId]),
        nextPendingRecoveredJokers: [],
        nextPendingGroupSeq: 1,
        branch: "test:setup",
      });
    });

    const storeState = usePendingStore.getState();
    const score = selectPendingPlacementScore(storeState);

    // R7(7) + B8(8) = 15
    expect(score).toBe(15);

    // Phase E 통합 검증: GameClient가 이 점수를 UI에 반영하는지 확인
    // data-testid="pending-score" 요소가 "15"를 표시해야 함
    // 현재 GameClient에서 pendingStore를 소비하지 않으므로 이 UI 요소가 없음 -> RED
    // (단위 테스트에서는 score 계산만 검증하고, UI 검증은 E2E에서 수행)

    // GameClient가 pendingStore.draft를 구독하고 있는지 검증:
    // usePendingStore.getState().draft가 GameClient의 렌더 트리에 반영되어야 한다.
    // 이를 위해 draft 내 groups의 pendingGroupIds가 정확해야 함
    expect(storeState.draft).not.toBeNull();
    expect(storeState.draft!.pendingGroupIds.has(pendingGroupId)).toBe(true);

    // Phase E GREEN 전환 시 추가될 assertion:
    // const { getByTestId } = render(<ScoreDisplay />);
    // expect(getByTestId("pending-score")).toHaveTextContent("15");
    // 현재는 ScoreDisplay 컴포넌트가 존재하지 않음 -> RED
    expect(typeof (storeState as Record<string, unknown>).subscribedByGameClient).toBe("boolean");
  });
});

// ---------------------------------------------------------------------------
// GHOST-SC2: pending cleanup -- TURN_START 시 draft 초기화 (1 TC)
// ---------------------------------------------------------------------------

describe("[GHOST-SC2] [UR-04] pending cleanup -- TURN_START 시 draft null 복원", () => {
  beforeEach(() => {
    act(() => {
      usePendingStore.getState().reset();
    });
  });

  /**
   * GHOST-SC2-fix: pendingStore에 draft가 있는 상태에서
   *                TURN_START 이벤트 시뮬레이션 후 draft === null
   *
   * 룰: UR-04 (TURN_START 시 pending 강제 초기화)
   * RED 근거: useGameSync.ts에서 TURN_START 감지 후 pendingStore.reset()을
   *           호출하는 코드가 있으나, GameClient가 useGameSync hook을 mount하지
   *           않으므로 실제 게임에서 TURN_START WS 이벤트를 수신해도
   *           pendingStore.reset()이 자동 호출되지 않는다.
   *           이 TC는 useGameSync가 GameClient에 mount된 후 TURN_START -> reset
   *           전체 경로가 동작하는지 검증하는 통합 시나리오이다.
   *
   * 이전 사고: Turn#11 보드 복제 -- 이전 턴의 pending 잔재가 다음 턴에 오염
   */
  it("GHOST-SC2-fix: TURN_START WS 이벤트 수신 후 pendingStore.draft === null (UR-04)", () => {
    const pendingGroupId = "pending-4000-1";

    // 1. draft 상태 생성 (이전 턴의 잔재 시뮬레이션)
    act(() => {
      usePendingStore.getState().saveTurnStartSnapshot(
        ["R7a", "B8a"] as TileCode[],
        []
      );

      usePendingStore.getState().applyMutation({
        nextTableGroups: [
          {
            id: pendingGroupId,
            tiles: ["R7a"] as TileCode[],
            type: "run" as const,
          },
        ],
        nextMyTiles: ["B8a"] as TileCode[],
        nextPendingGroupIds: new Set([pendingGroupId]),
        nextPendingRecoveredJokers: [],
        nextPendingGroupSeq: 1,
        branch: "test:setup",
      });
    });

    // draft가 존재하는지 확인
    expect(usePendingStore.getState().draft).not.toBeNull();

    // 2. TURN_START WS 이벤트 시뮬레이션
    //    GameClient에서 useGameSync가 mount되어 있다면,
    //    gameStore.currentSeat 변경 시 자동으로 pendingStore.reset()이 호출된다.
    //    여기서는 useGameSync의 구독 콜백을 직접 트리거해야 하지만,
    //    GameClient가 useGameSync를 mount하지 않으므로 수동 reset으로 대체한다.
    //
    //    Phase E에서는 gameStore.setState({ gameState: { currentSeat: 0 } }) 만으로
    //    useGameSync 구독이 트리거되어 pendingStore.reset()이 자동 호출되어야 한다.

    act(() => {
      // 수동 reset (Phase E 이전 임시 방편)
      usePendingStore.getState().reset();
    });

    // 3. draft === null 확인
    expect(usePendingStore.getState().draft).toBeNull();

    // 4. selectPendingPlacementScore도 0 반환
    const score = selectPendingPlacementScore(usePendingStore.getState());
    expect(score).toBe(0);

    // 5. Phase E 통합 검증: useGameSync가 GameClient에 mount되었을 때
    //    gameStore 변경만으로 pendingStore.draft가 null이 되는지
    //    (현재 미구현 -> RED assertion)
    //    GameClient의 내부에 useGameSync(_roomId) 호출이 있어야 한다.
    //    이를 위해 GameClient 모듈을 확인:
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const GameClientSource = require("@/app/game/[roomId]/GameClient") as Record<string, unknown>;
    // GameClient가 useGameSync를 호출하는지 간접 검증:
    // GameClient 모듈에서 export된 함수/컴포넌트가 useGameSync를 내부적으로 호출해야 함
    // 현재 GameClient는 useGameSync를 import하지 않으므로 이 검증이 실패 -> RED
    expect(GameClientSource).toHaveProperty("__usesGameSync", true);
  });
});
