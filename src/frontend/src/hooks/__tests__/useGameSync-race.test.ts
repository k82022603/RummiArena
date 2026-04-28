/**
 * useGameSync — 2026-04-28 회귀 회귀 방지 테스트
 *
 * 증상: GAME_STATE 수신 시 setGameState → setMyTiles 순서 + zustand
 *   subscribeWithSelector 의 동기 발동 때문에, useGameSync 의 TURN_START
 *   감지 콜백이 myTiles 빈 배열 상태에서 saveTurnStartSnapshot 을 호출했다.
 *   결과적으로 pendingStore.draft.myTiles = [] 가 되어 GameClient 의
 *   `draftPendingMyTiles ?? myTiles` 우선순위 때문에 rack 이 0장으로 표시됐다.
 *
 * 핫픽스 검증:
 *   1) race window: prev.currentSeat===null + next.myTiles===[] 인 경우
 *      saveTurnStartSnapshot 을 건너뛴다.
 *   2) 백필: myTiles 가 빈 배열에서 채워질 때, draft 가 아직 null 이면
 *      saveTurnStartSnapshot 을 자동 호출한다.
 *   3) useWebSocket 핸들러 setMyTiles → setGameState 순서로 변경되어
 *      race window 자체가 닫힌다 (이중 안전장치).
 */

import { renderHook } from "@testing-library/react";
import { act } from "react";
import { useGameStore } from "@/store/gameStore";
import { usePendingStore } from "@/store/pendingStore";
import { useGameSync } from "@/hooks/useGameSync";
import type { TileCode } from "@/types/tile";

function resetAll() {
  useGameStore.getState().reset();
  usePendingStore.getState().reset();
}

describe("useGameSync — 2026-04-28 race window 회귀 방지", () => {
  beforeEach(() => {
    resetAll();
  });

  afterEach(() => {
    resetAll();
  });

  it("prev.currentSeat===null + myTiles 빈 배열 진입 시 빈 스냅샷을 만들지 않는다", () => {
    renderHook(() => useGameSync("test-room"));

    // 게임 시작 시뮬: setGameState 만 먼저 호출 (setMyTiles 전 race window)
    act(() => {
      useGameStore.setState({
        mySeat: 0,
        gameState: {
          currentSeat: 0,
          tableGroups: [],
          drawPileCount: 60,
          turnStartedAt: new Date().toISOString(),
          turnTimeoutSec: 60,
        },
      });
    });

    // race window 우회: draft 는 아직 null (스냅샷 저장 안됨)
    expect(usePendingStore.getState().draft).toBeNull();
  });

  it("setMyTiles 후 draft 가 null 이면 백필 effect 가 스냅샷을 저장한다", () => {
    renderHook(() => useGameSync("test-room"));

    // race window 진입
    act(() => {
      useGameStore.setState({
        mySeat: 0,
        gameState: {
          currentSeat: 0,
          tableGroups: [],
          drawPileCount: 60,
          turnStartedAt: new Date().toISOString(),
          turnTimeoutSec: 60,
        },
      });
    });
    expect(usePendingStore.getState().draft).toBeNull();

    // setMyTiles 시뮬 (실제 14장)
    const myRack: TileCode[] = [
      "R1a", "R2a", "R3a", "R4a", "R5a",
      "B1a", "B2a", "B3a", "B4a", "B5a",
      "Y1a", "Y2a", "K1a", "K2a",
    ];
    act(() => {
      useGameStore.getState().setMyTiles(myRack);
    });

    // 백필 effect가 saveTurnStartSnapshot을 호출했어야 함
    const draft = usePendingStore.getState().draft;
    expect(draft).not.toBeNull();
    expect(draft!.myTiles).toEqual(myRack);
    expect(draft!.turnStartRack).toEqual(myRack);
  });

  it("정상 turn 진행 중 currentSeat 변경 시 saveTurnStartSnapshot 정상 동작", () => {
    renderHook(() => useGameSync("test-room"));

    // 초기 게임 상태 (myTiles 채워진 상태로 시작)
    const initialRack: TileCode[] = ["R1a", "R2a", "R3a"];
    act(() => {
      useGameStore.setState({
        mySeat: 0,
        myTiles: initialRack,
        gameState: {
          currentSeat: 1, // 다른 플레이어 턴
          tableGroups: [],
          drawPileCount: 60,
          turnStartedAt: new Date().toISOString(),
          turnTimeoutSec: 60,
        },
      });
    });

    // 첫 번째 currentSeat 변경 (1 → 0): 정상 스냅샷 저장
    act(() => {
      useGameStore.setState((s) => ({
        gameState: s.gameState ? { ...s.gameState, currentSeat: 0 } : s.gameState,
      }));
    });

    const draft = usePendingStore.getState().draft;
    expect(draft).not.toBeNull();
    expect(draft!.myTiles).toEqual(initialRack);
  });

  it("드래그 시작으로 draft 생성 후에는 myTiles 변화에도 백필이 덮어쓰지 않는다", () => {
    renderHook(() => useGameSync("test-room"));

    // race window 진입
    act(() => {
      useGameStore.setState({
        mySeat: 0,
        gameState: {
          currentSeat: 0,
          tableGroups: [],
          drawPileCount: 60,
          turnStartedAt: new Date().toISOString(),
          turnTimeoutSec: 60,
        },
      });
    });

    // 사용자가 이미 드래그를 시작해 draft 가 만들어진 상태 (수동 주입)
    const draggedRack: TileCode[] = ["R1a", "R2a"]; // 1장 보드로 옮긴 상태
    act(() => {
      usePendingStore.setState({
        draft: {
          groups: [],
          pendingGroupIds: new Set(),
          myTiles: draggedRack,
          recoveredJokers: [],
          turnStartRack: ["R1a", "R2a", "R3a"],
          turnStartTableGroups: [],
        },
      });
    });

    // 그 후 setMyTiles 가 호출돼도 백필이 turnStartRack 을 덮어쓰면 안됨
    act(() => {
      useGameStore.getState().setMyTiles(["R1a", "R2a", "R3a"]);
    });

    const draft = usePendingStore.getState().draft;
    expect(draft).not.toBeNull();
    expect(draft!.myTiles).toEqual(draggedRack); // 사용자 드래그 상태 보존
    expect(draft!.turnStartRack).toEqual(["R1a", "R2a", "R3a"]);
  });
});
