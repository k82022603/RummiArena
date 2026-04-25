/**
 * confirmValidator.ts 단위 테스트
 *
 * SSOT: V-01/02/03/04/14/15 클라이언트 미러, UR-36 (추가 게이트 금지)
 */

import { validateTurnPreCheck } from "@/lib/confirmValidator";
import type { TableGroup, TileCode } from "@/types/tile";

const makeGroup = (id: string, tiles: TileCode[]): TableGroup => ({
  id,
  tiles,
  type: "group",
});

// ---------------------------------------------------------------------------
// V-03: tilesAdded >= 1
// ---------------------------------------------------------------------------

describe("[confirmValidator] V-03 랙에서 최소 1장 추가", () => {
  it("tilesAdded === 0 → valid: false, ERR_NO_RACK_TILE", () => {
    const result = validateTurnPreCheck([], true, 0, 0);
    expect(result.valid).toBe(false);
    expect(result.errorCode).toBe("ERR_NO_RACK_TILE");
  });

  it("tilesAdded === 1 → V-03 통과", () => {
    const groups = [makeGroup("p1", ["R7a", "B7a", "Y7a"])];
    const result = validateTurnPreCheck(groups, true, 21, 1);
    expect(result.valid).toBe(true);
  });

  it("tilesAdded === 3 → V-03 통과 (여러 장)", () => {
    const groups = [makeGroup("p1", ["R10a", "B10a", "Y10a"])];
    const result = validateTurnPreCheck(groups, true, 30, 3);
    expect(result.valid).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// V-04: 초기 등록 30점 이상
// ---------------------------------------------------------------------------

describe("[confirmValidator] V-04 초기 등록 30점", () => {
  it("hasInitialMeld=false, 점수 < 30 → ERR_INITIAL_MELD_SCORE", () => {
    const groups = [makeGroup("p1", ["R5a", "B5a", "Y5a"])];
    const result = validateTurnPreCheck(groups, false, 15, 1);
    expect(result.valid).toBe(false);
    expect(result.errorCode).toBe("ERR_INITIAL_MELD_SCORE");
  });

  it("hasInitialMeld=false, 점수 === 30 → 통과", () => {
    const groups = [makeGroup("p1", ["R10a", "B10a", "Y10a"])];
    const result = validateTurnPreCheck(groups, false, 30, 3);
    expect(result.valid).toBe(true);
  });

  it("hasInitialMeld=true, 점수 < 30 → V-04 면제, 다른 검사만", () => {
    const groups = [makeGroup("p1", ["R7a", "B7a", "Y7a"])];
    const result = validateTurnPreCheck(groups, true, 5, 1);
    expect(result.valid).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// V-02: 세트 크기 3장 이상
// ---------------------------------------------------------------------------

describe("[confirmValidator] V-02 세트 크기 3장", () => {
  it("2장 그룹 → ERR_SET_SIZE", () => {
    const groups = [makeGroup("p1", ["R7a", "B7a"])];
    const result = validateTurnPreCheck(groups, true, 14, 2);
    expect(result.valid).toBe(false);
    expect(result.errorCode).toBe("ERR_SET_SIZE");
    expect(result.errorGroupId).toBe("p1");
  });

  it("3장 그룹 → V-02 통과", () => {
    const groups = [makeGroup("p1", ["R7a", "B7a", "Y7a"])];
    const result = validateTurnPreCheck(groups, true, 21, 3);
    expect(result.valid).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// V-14: 그룹 동색 중복 불가
// ---------------------------------------------------------------------------

describe("[confirmValidator] V-14 그룹 동색 중복", () => {
  it("[R7a, R7b, B7a] 같은 색(R) 중복 → ERR_GROUP_COLOR_DUP", () => {
    const groups = [makeGroup("p1", ["R7a", "R7b", "B7a"])];
    const result = validateTurnPreCheck(groups, true, 21, 1);
    expect(result.valid).toBe(false);
    expect(result.errorCode).toBe("ERR_GROUP_COLOR_DUP");
  });

  it("[R7a, B7a, Y7a] 서로 다른 색 → 통과", () => {
    const groups = [makeGroup("p1", ["R7a", "B7a", "Y7a"])];
    const result = validateTurnPreCheck(groups, true, 21, 1);
    expect(result.valid).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// V-15: 런 숫자 연속
// ---------------------------------------------------------------------------

describe("[confirmValidator] V-15 런 연속성", () => {
  it("[R5a, R7a, R8a] 비연속 런 → ERR_RUN_SEQUENCE", () => {
    const group: TableGroup = { id: "p1", tiles: ["R5a", "R7a", "R8a"], type: "run" };
    const result = validateTurnPreCheck([group], true, 20, 1);
    expect(result.valid).toBe(false);
    expect(result.errorCode).toBe("ERR_RUN_SEQUENCE");
  });

  it("[R5a, R6a, R7a] 연속 런 → 통과", () => {
    const group: TableGroup = { id: "p1", tiles: ["R5a", "R6a", "R7a"], type: "run" };
    const result = validateTurnPreCheck([group], true, 18, 3);
    expect(result.valid).toBe(true);
  });

  it("[R11a, R12a, R13a] 최대 숫자 런 → 통과", () => {
    const group: TableGroup = { id: "p1", tiles: ["R11a", "R12a", "R13a"], type: "run" };
    const result = validateTurnPreCheck([group], true, 36, 3);
    expect(result.valid).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// 복합 시나리오
// ---------------------------------------------------------------------------

describe("[confirmValidator] 복합 시나리오", () => {
  it("여러 그룹 모두 유효 → valid: true", () => {
    const groups: TableGroup[] = [
      makeGroup("p1", ["R10a", "B10a", "Y10a"]),
      { id: "p2", tiles: ["K5a", "K6a", "K7a"], type: "run" },
    ];
    const result = validateTurnPreCheck(groups, false, 45, 6);
    expect(result.valid).toBe(true);
  });

  it("첫 번째 그룹 무효 → 첫 번째 그룹 ID 반환", () => {
    const groups: TableGroup[] = [
      makeGroup("p1", ["R7a", "B7a"]), // 2장 → ERR_SET_SIZE
      makeGroup("p2", ["R10a", "B10a", "Y10a"]),
    ];
    const result = validateTurnPreCheck(groups, true, 44, 5);
    expect(result.valid).toBe(false);
    expect(result.errorGroupId).toBe("p1");
  });
});
