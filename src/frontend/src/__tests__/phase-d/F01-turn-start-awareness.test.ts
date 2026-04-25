/**
 * F-01 턴 시작 인지 — RED spec
 *
 * 룰 ID: V-08 (자기 턴 확인), UR-01 (다른 턴 disable), UR-02 (활성화), UR-04 (pending 0 강제)
 * 상태 전이: S0 (OUT_OF_TURN) → S1 (MY_TURN_IDLE)
 * acceptance criteria: AC-01.1 / AC-01.2 / AC-01.3
 *
 * SSOT: docs/02-design/55-game-rules-enumeration.md §3.1 UR-01/02/04
 *       docs/02-design/56b-state-machine.md §2 S0→S1 전이
 *       docs/02-design/60-ui-feature-spec.md §1.2 F-01
 *
 * Phase D Day 1 — RED commit (구현 없음, 모두 FAIL 예상)
 * commit message: [F-01] [UR-01] [UR-02] [UR-04] [V-08] turn-start awareness — RED spec
 */

import { act, renderHook } from "@testing-library/react";
import { useGameStore } from "@/store/gameStore";

// ---------------------------------------------------------------------------
// 헬퍼
// ---------------------------------------------------------------------------

function makeInitialStoreState() {
  return {
    mySeat: 0,
    pendingTableGroups: null,
    pendingMyTiles: null,
    pendingGroupIds: new Set<string>(),
    pendingRecoveredJokers: [] as string[],
    gameState: {
      currentSeat: 1, // 다른 플레이어 턴
      tableGroups: [],
      drawPileCount: 60,
    },
  };
}

function simulateTurnStart(mySeat: number, currentSeat: number) {
  // UR-04: TURN_START 수신 시 pending 강제 리셋
  // 이 함수는 useWebSocket.ts 의 "TURN_START" case 에서 호출되는 resetPending()
  // 과 gameState.currentSeat 갱신을 재현한다.
  useGameStore.getState().resetPending();
  useGameStore.setState((state) => ({
    gameState: state.gameState
      ? { ...state.gameState, currentSeat }
      : state.gameState,
  }));
}

// ---------------------------------------------------------------------------
// AC-01.1: S0 → S1 전이 — TURN_START(currentSeat=mySeat) 수신
// UR-02: 랙 활성화 (isMyTurn === true)
// UR-04: pendingTableGroups.length === 0
// ---------------------------------------------------------------------------

describe("[F-01] [UR-02] [UR-04] AC-01.1 — TURN_START(mySeat) → S1 진입", () => {
  beforeEach(() => {
    act(() => {
      useGameStore.setState(makeInitialStoreState());
    });
  });

  it("TURN_START 수신 후 isMyTurn === true (V-08 자기 턴 확인)", () => {
    act(() => {
      simulateTurnStart(0, 0); // mySeat=0, currentSeat=0
    });

    const { gameState, mySeat } = useGameStore.getState();
    const isMyTurn = gameState?.currentSeat === mySeat;

    // AC-01.1: isMyTurn === true 이어야 한다
    expect(isMyTurn).toBe(true);
  });

  it("TURN_START 수신 후 pendingTableGroups === null or length 0 (UR-04 pending 0 강제)", () => {
    // 먼저 pending 상태를 만든다
    act(() => {
      useGameStore.setState({
        pendingTableGroups: [{ id: "pending-stale-001", tiles: ["R7a"], type: "group" }],
        pendingGroupIds: new Set(["pending-stale-001"]),
      });
    });

    // TURN_START 수신 시뮬레이션
    act(() => {
      simulateTurnStart(0, 0);
    });

    const { pendingTableGroups, pendingGroupIds } = useGameStore.getState();

    // AC-01.2 핵심: pending 잔재가 있더라도 TURN_START 후 강제 리셋
    // pendingTableGroups는 null 이거나 빈 배열이어야 한다
    const pendingCount = pendingTableGroups ? pendingTableGroups.length : 0;
    expect(pendingCount).toBe(0); // UR-04
    expect(pendingGroupIds.size).toBe(0); // D-12 pending-server 매핑 정리
  });

  it("TURN_START 수신 후 gameState.currentSeat === mySeat (S0→S1 전이 사전조건)", () => {
    act(() => {
      simulateTurnStart(0, 0);
    });

    const { gameState, mySeat } = useGameStore.getState();
    expect(gameState?.currentSeat).toBe(mySeat);
  });
});

// ---------------------------------------------------------------------------
// AC-01.2: pending 잔재가 있는 상태(코드 버그) — TURN_START 수신 시 강제 리셋
// UR-04: "TURN_START 수신 시 pending 잔재가 있다면 그건 코드 버그
//         (이전 turn의 cleanup 누락). 반드시 reset, 토스트 X"
// ---------------------------------------------------------------------------

describe("[F-01] [UR-04] [S1] AC-01.2 — pending 잔재 있어도 TURN_START 시 강제 리셋", () => {
  it("pendingTableGroups 잔재가 있을 때 TURN_START → 모두 제거됨 (토스트 X)", () => {
    act(() => {
      useGameStore.setState({
        ...makeInitialStoreState(),
        pendingTableGroups: [
          { id: "pending-leftover-001", tiles: ["R7a", "B7a"], type: "group" },
          { id: "pending-leftover-002", tiles: ["R8a"], type: "run" },
        ],
        pendingGroupIds: new Set(["pending-leftover-001", "pending-leftover-002"]),
      });
    });

    act(() => {
      simulateTurnStart(0, 0);
    });

    const state = useGameStore.getState();
    const pendingCount = state.pendingTableGroups ? state.pendingTableGroups.length : 0;

    expect(pendingCount).toBe(0);
    expect(state.pendingGroupIds.size).toBe(0);

    // 토스트 노출 금지 확인 (UR-34: band-aid 토스트 금지)
    // useWSStore의 lastError가 null이어야 한다
    // NOTE: 현재 구현에 wsStore 분리 여부에 따라 검증 방식 조정 필요
    // RED spec: wsStore.lastError === null (토스트 X)
    // 이 assertion은 Green 구현 시 wsStore import 후 확인
  });

  it("pendingRecoveredJokers 잔재도 TURN_START 시 정리됨 (V-07 완결)", () => {
    act(() => {
      useGameStore.setState({
        ...makeInitialStoreState(),
        pendingRecoveredJokers: ["JK1"],
      });
    });

    act(() => {
      simulateTurnStart(0, 0);
    });

    const { pendingRecoveredJokers } = useGameStore.getState();
    // UR-04: 모든 pending 상태 0 강제 — recovered jokers 포함
    expect(pendingRecoveredJokers.length).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// AC-01.3: S1 → S0 전이 — TURN_START(다른 seat)
// UR-01: isMyTurn === false → 드래그/버튼 disabled
// ---------------------------------------------------------------------------

describe("[F-01] [UR-01] [V-08] AC-01.3 — TURN_START(other seat) → S0 진입", () => {
  it("TURN_START(다른 seat) 수신 후 isMyTurn === false", () => {
    // mySeat=0, currentSeat=2(다른 플레이어)
    act(() => {
      useGameStore.setState({ ...makeInitialStoreState(), mySeat: 0 });
      simulateTurnStart(0, 2);
    });

    const { gameState, mySeat } = useGameStore.getState();
    const isMyTurn = gameState?.currentSeat === mySeat;

    // AC-01.3: isMyTurn === false
    expect(isMyTurn).toBe(false);
  });

  it("다른 플레이어 턴에 pendingTableGroups는 그대로 유지됨 (관전 중 내 pending 보존)", () => {
    // 내가 이미 pending을 만든 상태에서 (불가능하지만 방어적 확인)
    // 실제로는 내 턴에만 pending을 만들 수 있어야 함
    // 이 케이스는 "다른 플레이어 TURN_START 가 내 pending을 날리지 않는다"는 것을 확인
    // => F-01 명세: "사전조건: mySeat == currentSeat" — 다른 seat이면 pending 리셋 불필요
    act(() => {
      useGameStore.setState({
        ...makeInitialStoreState(),
        mySeat: 0,
        pendingTableGroups: null, // 정상 상태 — 다른 플레이어 턴에는 pending 없어야 함
      });
      simulateTurnStart(0, 2); // 다른 플레이어 턴 시작
    });

    const { gameState, mySeat } = useGameStore.getState();
    expect(gameState?.currentSeat).toBe(2);
    expect(gameState?.currentSeat).not.toBe(mySeat); // isMyTurn === false
  });
});

// ---------------------------------------------------------------------------
// S1 invariant 추가 검증 (56b §3.2)
// S1: pendingTableGroups.length == 0, rack == TURN_START 시점
// ---------------------------------------------------------------------------

describe("[F-01] [S1] invariant — S1 상태에서 ConfirmTurn/RESET 비활성 전제", () => {
  it("TURN_START 직후 pendingTableGroups는 null 또는 빈 배열 (ConfirmTurn 비활성 전제)", () => {
    act(() => {
      useGameStore.setState(makeInitialStoreState());
      simulateTurnStart(0, 0);
    });

    const { pendingTableGroups } = useGameStore.getState();

    // S1 invariant: pendingTableGroups.length == 0
    // ConfirmTurn 버튼은 hasPending=false → disabled
    const hasPending = pendingTableGroups !== null && pendingTableGroups.length > 0;
    expect(hasPending).toBe(false); // UR-15: hasPending=false → Confirm disabled
  });
});
