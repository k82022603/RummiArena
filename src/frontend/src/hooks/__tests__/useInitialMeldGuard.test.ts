/**
 * useInitialMeldGuard 테스트 — Phase 2 L2 hook
 *
 * SSOT 매핑:
 *   - V-13a: hasInitialMeld 재배치 권한 판정 SSOT
 *   - 58 §2 F-04/F-17: 7지점 통합 단일 소스
 *   - W2-A: effectiveHasInitialMeld 분산 참조 해소
 */

import { act, renderHook } from "@testing-library/react";
import { useInitialMeldGuard } from "../useInitialMeldGuard";
import { useGameStore } from "@/store/gameStore";
import { usePendingStore } from "@/store/pendingStore";
import type { TileCode, TableGroup } from "@/types/tile";

// ---------------------------------------------------------------------------
// 헬퍼
// ---------------------------------------------------------------------------

function makeGroup(id: string, tiles: TileCode[]): TableGroup {
  return { id, tiles, type: "run" };
}

function setupPlayer(hasInitialMeld: boolean) {
  act(() => {
    useGameStore.setState({
      mySeat: 0,
      hasInitialMeld,
      players: [
        {
          seat: 0,
          type: "HUMAN" as const,
          userId: "u0",
          displayName: "P0",
          tileCount: 5,
          hasInitialMeld,
          status: "CONNECTED" as const,
        },
      ],
    });
  });
}

// ---------------------------------------------------------------------------
// 초기화
// ---------------------------------------------------------------------------

beforeEach(() => {
  act(() => {
    usePendingStore.getState().reset();
    useGameStore.setState({
      mySeat: 0,
      hasInitialMeld: false,
      players: [],
      myTiles: [],
    });
  });
});

// ---------------------------------------------------------------------------
// 1. hasInitialMeld = false 시 effectiveHasInitialMeld = false
// ---------------------------------------------------------------------------

test("effectiveHasInitialMeld = false when players[mySeat].hasInitialMeld = false", () => {
  setupPlayer(false);

  const { result } = renderHook(() => useInitialMeldGuard());

  expect(result.current.effectiveHasInitialMeld).toBe(false);
  expect(result.current.hasInitialMeld).toBe(false);
});

// ---------------------------------------------------------------------------
// 2. hasInitialMeld = true 시 effectiveHasInitialMeld = true
// ---------------------------------------------------------------------------

test("effectiveHasInitialMeld = true when players[mySeat].hasInitialMeld = true", () => {
  setupPlayer(true);

  const { result } = renderHook(() => useInitialMeldGuard());

  expect(result.current.effectiveHasInitialMeld).toBe(true);
  expect(result.current.hasInitialMeld).toBe(true);
});

// ---------------------------------------------------------------------------
// 3. pendingPlacementScore 계산 — pending 그룹 없으면 0
// ---------------------------------------------------------------------------

test("pendingPlacementScore = 0 when no pending groups", () => {
  setupPlayer(false);

  const { result } = renderHook(() => useInitialMeldGuard());

  expect(result.current.pendingPlacementScore).toBe(0);
});

// ---------------------------------------------------------------------------
// 4. pendingPlacementScore 계산 — pending 그룹 있으면 합산
// ---------------------------------------------------------------------------

test("pendingPlacementScore = 18 for [R5a, R6a, R7a] pending group", () => {
  setupPlayer(false);

  // pending 드래프트 설정
  act(() => {
    usePendingStore.getState().saveTurnStartSnapshot(
      ["R5a", "R6a", "R7a"] as TileCode[],
      []
    );
    usePendingStore.getState().applyMutation({
      nextTableGroups: [makeGroup("pending-1", ["R5a", "R6a", "R7a"])],
      nextMyTiles: [] as TileCode[],
      nextPendingGroupIds: new Set(["pending-1"]),
      nextPendingRecoveredJokers: [],
      nextPendingGroupSeq: 1,
      branch: "test",
    });
  });

  const { result } = renderHook(() => useInitialMeldGuard());

  // R5 + R6 + R7 = 18
  expect(result.current.pendingPlacementScore).toBe(18);
});

// ---------------------------------------------------------------------------
// 5. gameStore.hasInitialMeld = false 이지만 players에 true → effectiveMeld = true
// ---------------------------------------------------------------------------

test("effectiveHasInitialMeld uses players array over gameStore.hasInitialMeld root flag", () => {
  // gameStore.hasInitialMeld = false, 하지만 players[0].hasInitialMeld = true
  act(() => {
    useGameStore.setState({
      mySeat: 0,
      hasInitialMeld: false, // 루트 플래그는 false
      players: [
        {
          seat: 0,
          type: "HUMAN" as const,
          userId: "u0",
          displayName: "P0",
          tileCount: 5,
          hasInitialMeld: true, // players 배열은 true
          status: "CONNECTED" as const,
        },
      ],
    });
  });

  const { result } = renderHook(() => useInitialMeldGuard());

  // effectiveHasInitialMeld는 players 배열 기준 (더 신뢰할 수 있는 값)
  expect(result.current.effectiveHasInitialMeld).toBe(true);
  // hasInitialMeld는 둘 중 하나라도 true면 true (OR)
  expect(result.current.hasInitialMeld).toBe(true);
});
