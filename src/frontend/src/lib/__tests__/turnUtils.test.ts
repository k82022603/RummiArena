/**
 * turnUtils.ts 단위 테스트
 *
 * SSOT: V-08 (자기 턴), V-13a (initialMeld), V-03 (tilesAdded), V-04 (30점)
 */

import {
  computeIsMyTurn,
  computeEffectiveMeld,
  computeTilesAdded,
  computePendingScore,
} from "@/lib/turnUtils";
import type { Player } from "@/types/game";
import type { TileCode, TableGroup } from "@/types/tile";

// ---------------------------------------------------------------------------
// computeIsMyTurn — V-08
// ---------------------------------------------------------------------------

describe("[turnUtils] computeIsMyTurn (V-08)", () => {
  it("currentSeat === mySeat → true (내 턴)", () => {
    expect(computeIsMyTurn(2, 2)).toBe(true);
  });

  it("currentSeat !== mySeat → false (상대 턴)", () => {
    expect(computeIsMyTurn(1, 2)).toBe(false);
  });

  it("seat 0 기준 동일 → true", () => {
    expect(computeIsMyTurn(0, 0)).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// computeEffectiveMeld — V-13a
// ---------------------------------------------------------------------------

const makePlayer = (seat: number, hasInitialMeld: boolean | undefined): Player => ({
  seat,
  type: "HUMAN",
  userId: `user-${seat}`,
  displayName: `Player ${seat}`,
  status: "CONNECTED",
  hasInitialMeld,
});

describe("[turnUtils] computeEffectiveMeld (V-13a)", () => {
  it("해당 플레이어의 hasInitialMeld가 true → true", () => {
    const players: Player[] = [makePlayer(0, false), makePlayer(1, true)];
    expect(computeEffectiveMeld(players, 1)).toBe(true);
  });

  it("해당 플레이어의 hasInitialMeld가 false → false", () => {
    const players: Player[] = [makePlayer(0, false), makePlayer(1, false)];
    expect(computeEffectiveMeld(players, 1)).toBe(false);
  });

  it("해당 플레이어가 없으면 false", () => {
    const players: Player[] = [makePlayer(0, true)];
    expect(computeEffectiveMeld(players, 99)).toBe(false);
  });

  it("hasInitialMeld가 undefined이면 false", () => {
    const players: Player[] = [makePlayer(0, undefined)];
    expect(computeEffectiveMeld(players, 0)).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// computeTilesAdded — V-03
// ---------------------------------------------------------------------------

describe("[turnUtils] computeTilesAdded (V-03)", () => {
  it("랙에서 2장 제거 → 2 반환", () => {
    const start: TileCode[] = ["R7a", "B5a", "Y8a", "K1a"];
    const current: TileCode[] = ["R7a", "B5a"];
    expect(computeTilesAdded(start, current)).toBe(2);
  });

  it("랙 변화 없음 → 0 반환", () => {
    const rack: TileCode[] = ["R7a", "B5a"];
    expect(computeTilesAdded(rack, rack)).toBe(0);
  });

  it("드로우로 랙이 늘어난 경우 → 0 (음수 클램프)", () => {
    const start: TileCode[] = ["R7a"];
    const current: TileCode[] = ["R7a", "B5a"];
    expect(computeTilesAdded(start, current)).toBe(0);
  });

  it("랙 전부 비움 → 전체 수 반환", () => {
    const start: TileCode[] = ["R1a", "B2a", "Y3a"];
    expect(computeTilesAdded(start, [])).toBe(3);
  });
});

// ---------------------------------------------------------------------------
// computePendingScore — V-04
// ---------------------------------------------------------------------------

const makeGroup = (id: string, tiles: TileCode[]): TableGroup => ({
  id,
  tiles,
  type: "run",
});

describe("[turnUtils] computePendingScore (V-04)", () => {
  it("일반 타일 합산 — R7+B5+Y8 = 20점", () => {
    const groups: TableGroup[] = [makeGroup("p1", ["R7a", "B5a", "Y8a"])];
    expect(computePendingScore(groups)).toBe(20);
  });

  it("조커는 0점 처리", () => {
    const groups: TableGroup[] = [makeGroup("p1", ["JK1", "B5a", "Y8a"])];
    expect(computePendingScore(groups)).toBe(13); // 5+8=13
  });

  it("여러 그룹 합산", () => {
    const groups: TableGroup[] = [
      makeGroup("p1", ["R10a", "B10a", "Y10a"]),
      makeGroup("p2", ["K1a", "K2a", "K3a"]),
    ];
    expect(computePendingScore(groups)).toBe(36); // 30+6
  });

  it("빈 배열 → 0점", () => {
    expect(computePendingScore([])).toBe(0);
  });

  it("30점 이상 체크 — 10+10+10 = 30", () => {
    const groups: TableGroup[] = [makeGroup("p1", ["R10a", "B10a", "Y10a"])];
    expect(computePendingScore(groups)).toBeGreaterThanOrEqual(30);
  });
});
