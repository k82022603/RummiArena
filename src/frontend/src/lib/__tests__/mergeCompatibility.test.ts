/**
 * mergeCompatibility 단위 테스트
 *
 * B-NEW 회귀 방지: 단일 타일 pending 그룹에 같은 색 연속 숫자 드롭 시
 * isCompatibleWithGroup 이 "unknown" 분류로 both-path(그룹+런) 호환성을
 * 정상 검사해야 한다.
 *
 * B-1 관련: isCompatibleWithGroup 함수 자체의 정확성 검증.
 */

import {
  isCompatibleWithGroup,
  computeValidMergeGroups,
} from "@/lib/mergeCompatibility";
import type { TableGroup, TileCode } from "@/types/tile";

// ---------------------------------------------------------------------------
// 헬퍼: 테이블 그룹 생성
// ---------------------------------------------------------------------------
function makeGroup(tiles: TileCode[], type: "group" | "run", id = "g1"): TableGroup {
  return { id, tiles, type };
}

// ===========================================================================
// B-NEW: 단일 타일 그룹에 같은 색 연속 숫자 호환성 검증
// ===========================================================================

describe("B-NEW: 단일 타일 그룹 → 런 확장 호환성", () => {
  // K12 단일 타일 그룹 (classifySetType 이 이전에 "group"을 반환해 K13을 거부하던 케이스)
  const k12GroupSingle = makeGroup(["K12a"] as TileCode[], "run");

  it("[happy] K12 단일 그룹에 K13 드롭 → 호환됨 (런 확장)", () => {
    expect(isCompatibleWithGroup("K13a" as TileCode, k12GroupSingle)).toBe(true);
  });

  it("[happy] K12 단일 그룹에 K11 드롭 → 호환됨 (런 확장)", () => {
    expect(isCompatibleWithGroup("K11a" as TileCode, k12GroupSingle)).toBe(true);
  });

  it("[happy] K12 단일 그룹에 B12 드롭 → 호환됨 (그룹 확장: 같은 숫자, 다른 색)", () => {
    // K12 단일 타일은 classifyKind → "unknown" → isCompatibleAsGroup 도 검사
    // isCompatibleAsGroup: groupNumber=12, B12.number=12 일치, B색 미중복 → true
    expect(isCompatibleWithGroup("B12a" as TileCode, k12GroupSingle)).toBe(true);
  });

  it("[edge] K12 단일 그룹에 K12 자신 드롭 → 불가 (동일 코드)", () => {
    // group.tiles.includes(tile) → false 반환
    expect(isCompatibleWithGroup("K12a" as TileCode, k12GroupSingle)).toBe(false);
  });

  it("[edge] K12 단일 그룹에 Y5 드롭 → 불가 (색도 숫자도 불일치)", () => {
    expect(isCompatibleWithGroup("Y5a" as TileCode, k12GroupSingle)).toBe(false);
  });
});

// ===========================================================================
// B-NEW: 조커 포함 런 확장 호환성 (K11(JK)-K12-K13 시나리오)
// ===========================================================================

describe("B-NEW: 조커 포함 런 그룹 확장", () => {
  // K12, K13 이 있고 조커가 앞에 있는 상태 (K11 역할)
  const runWithJoker = makeGroup(["JK1", "K12a", "K13a"] as TileCode[], "run");

  it("[happy] JK+K12+K13 런에 K11 드롭 → 가능 (regular minNum=12, 12-1=11)", () => {
    // isCompatibleAsRun: regular=[K12,K13], minNum=12, maxNum=13
    // K11: n=11, n === 12-1=11 ✓ → true
    expect(isCompatibleWithGroup("K11a" as TileCode, runWithJoker)).toBe(true);
  });

  it("[edge] JK+K12+K13 런에 K10 드롭 → 불가 (regular minNum=12, 12-1=11 이므로 K10은 범위 초과)", () => {
    // isCompatibleAsRun: regular=[K12,K13], minNum=12
    // K10: n=10, n !== 12-1=11, n !== 13+1=14 → false
    // (joker 포지션인 K11은 regular 계산에 미포함)
    expect(isCompatibleWithGroup("K10a" as TileCode, runWithJoker)).toBe(false);
  });

  it("[happy] JK+K12+K13 런에 조커 드롭 → 가능 (런 끝 확장 여지 있음)", () => {
    // 조커로 조커를 대체하는 건 tryJokerSwap 에서 막고,
    // isCompatibleAsRun 에서는 범위 확인만 → min=12, max=13, min-1=11>=1 → 가능
    // 단, group.tiles 에 JK1 이 이미 있으므로 JK2 드롭 가능 여부
    expect(isCompatibleWithGroup("JK2" as TileCode, runWithJoker)).toBe(true);
  });
});

// ===========================================================================
// 기존 동작 회귀: 2개 이상 타일 그룹의 종류별 호환성
// ===========================================================================

describe("isCompatibleWithGroup: 기존 그룹 타입별 정상 동작", () => {
  describe("그룹(group) 타입 — 같은 숫자, 다른 색", () => {
    const group7 = makeGroup(["R7a", "B7a"] as TileCode[], "group");

    it("[happy] Y7 드롭 → 호환 (같은 숫자 7, 다른 색)", () => {
      expect(isCompatibleWithGroup("Y7a" as TileCode, group7)).toBe(true);
    });

    it("[happy] K7 드롭 → 호환 (4번째 색)", () => {
      expect(isCompatibleWithGroup("K7a" as TileCode, group7)).toBe(true);
    });

    it("[edge] R7b 드롭 → 불가 (R색 중복)", () => {
      expect(isCompatibleWithGroup("R7b" as TileCode, group7)).toBe(false);
    });

    it("[edge] R8 드롭 → 불가 (다른 숫자)", () => {
      expect(isCompatibleWithGroup("R8a" as TileCode, group7)).toBe(false);
    });

    it("[edge] 4색 완성 후 5번째 드롭 불가 (MAX_GROUP_SIZE=4)", () => {
      const fullGroup = makeGroup(["R7a", "B7a", "Y7a", "K7a"] as TileCode[], "group");
      expect(isCompatibleWithGroup("R7b" as TileCode, fullGroup)).toBe(false);
    });
  });

  describe("런(run) 타입 — 같은 색, 연속 숫자", () => {
    const run345 = makeGroup(["R3a", "R4a", "R5a"] as TileCode[], "run");

    it("[happy] R2 드롭 → 호환 (앞 확장)", () => {
      expect(isCompatibleWithGroup("R2a" as TileCode, run345)).toBe(true);
    });

    it("[happy] R6 드롭 → 호환 (뒤 확장)", () => {
      expect(isCompatibleWithGroup("R6a" as TileCode, run345)).toBe(true);
    });

    it("[edge] B3 드롭 → 불가 (다른 색)", () => {
      expect(isCompatibleWithGroup("B3a" as TileCode, run345)).toBe(false);
    });

    it("[edge] R7 드롭 → 불가 (비연속: 5+2=7, 간격 2)", () => {
      expect(isCompatibleWithGroup("R7a" as TileCode, run345)).toBe(false);
    });
  });
});

// ===========================================================================
// computeValidMergeGroups: 드래그 중 호환 그룹 집합 계산
// ===========================================================================

describe("computeValidMergeGroups", () => {
  it("[happy] K13 드래그 시 K12 단일 그룹 → 호환 집합에 포함", () => {
    const groups: TableGroup[] = [
      makeGroup(["K12a"] as TileCode[], "run", "g-k12"),
      makeGroup(["R3a", "R4a", "R5a"] as TileCode[], "run", "g-run"),
      makeGroup(["B7a", "Y7a"] as TileCode[], "group", "g-group"),
    ];
    const result = computeValidMergeGroups("K13a" as TileCode, groups);
    expect(result.has("g-k12")).toBe(true);
    expect(result.has("g-run")).toBe(false); // 다른 색
    expect(result.has("g-group")).toBe(false); // 다른 숫자
  });

  it("[happy] JK1 드래그 시 런 그룹 → 호환 집합에 포함", () => {
    const groups: TableGroup[] = [
      makeGroup(["R3a", "R4a", "R5a"] as TileCode[], "run", "g-run"),
    ];
    const result = computeValidMergeGroups("JK1", groups);
    expect(result.has("g-run")).toBe(true);
  });
});
