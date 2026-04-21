/**
 * tileStateHelpers 단위 테스트 (BUG-UI-006 / G-3 회귀 방지)
 *
 * 검증 대상: src/lib/tileStateHelpers.ts
 *   - removeFirstOccurrence: 배열에서 첫 번째 일치만 제거
 *   - detectDuplicateTileCodes: pendingTableGroups 내 중복 tile code 탐지
 *
 * 재현 시나리오:
 *   1. 사용자가 B1a를 보드에 드래그 → rack에서 제거됨
 *   2. B1a를 rack으로 되돌림 → 기존 코드는 filter()로 ALL 그룹에서 삭제
 *      → 고스트 잔존 OR 타일 소멸
 *   3. 다시 B1a를 드래그 → 이미 rack에 없으므로 ghost 생성
 *   4. 확정 시 pendingTableGroups에 B1a 2개 → 서버 V-03(중복) 위반 → PENALTY_DRAW
 */

import { removeFirstOccurrence, detectDuplicateTileCodes } from "@/lib/tileStateHelpers";
import type { TileCode, TableGroup } from "@/types/tile";

// -----------------------------------------------------------------------
// removeFirstOccurrence
// -----------------------------------------------------------------------
describe("removeFirstOccurrence", () => {
  it("단일 일치: 첫 번째 항목만 제거", () => {
    const arr: TileCode[] = ["R1a", "B2a", "Y3a"];
    expect(removeFirstOccurrence(arr, "R1a")).toEqual(["B2a", "Y3a"]);
  });

  it("중복 존재: 첫 번째만 제거하고 나머지 유지", () => {
    // 핵심 G-3 회귀 케이스: 동일 코드가 2개일 때 첫 번째만 삭제
    const arr: TileCode[] = ["B1a", "B2a", "B1a"];
    const result = removeFirstOccurrence(arr, "B1a");
    expect(result).toEqual(["B2a", "B1a"]);
    // 두 번째 B1a는 살아있어야 한다
    expect(result.filter((t) => t === "B1a")).toHaveLength(1);
  });

  it("일치 없음: 원본 배열 그대로 반환", () => {
    const arr: TileCode[] = ["R7a", "B8a"];
    expect(removeFirstOccurrence(arr, "Y9a")).toEqual(["R7a", "B8a"]);
  });

  it("빈 배열: 빈 배열 반환", () => {
    expect(removeFirstOccurrence([], "R1a")).toEqual([]);
  });

  it("원본 불변성: 새 배열 반환 (원본 변경 없음)", () => {
    const arr: TileCode[] = ["R1a", "B2a"];
    const result = removeFirstOccurrence(arr, "R1a");
    expect(result).not.toBe(arr); // 새 배열
    expect(arr).toEqual(["R1a", "B2a"]); // 원본 유지
  });

  it("조커 코드 정상 처리", () => {
    const arr: TileCode[] = ["JK1", "R5a", "JK1"];
    expect(removeFirstOccurrence(arr, "JK1")).toEqual(["R5a", "JK1"]);
  });
});

// -----------------------------------------------------------------------
// detectDuplicateTileCodes
// -----------------------------------------------------------------------
describe("detectDuplicateTileCodes", () => {
  it("중복 없음: 빈 배열 반환", () => {
    const groups: TableGroup[] = [
      { id: "g1", tiles: ["Y9a", "Y10a", "Y11a", "Y12a"], type: "run" },
      { id: "g2", tiles: ["B1a", "B2a", "B3a"], type: "run" },
    ];
    expect(detectDuplicateTileCodes(groups)).toEqual([]);
  });

  it("단일 그룹 내 중복: 해당 코드 반환 (G-3 고스트 케이스)", () => {
    // B1a가 같은 그룹에 2번 등장 — ghost state
    const groups: TableGroup[] = [
      { id: "g1", tiles: ["B1a", "B2a", "B1a"], type: "run" },
    ];
    const result = detectDuplicateTileCodes(groups);
    expect(result).toContain("B1a");
    expect(result).toHaveLength(1);
  });

  it("다른 그룹에 같은 코드 분산: 해당 코드 반환", () => {
    // B1a가 group 1과 group 2 양쪽에 존재 — cross-group ghost
    const groups: TableGroup[] = [
      { id: "g1", tiles: ["Y9a", "Y10a", "B1a"], type: "run" },
      { id: "g2", tiles: ["B1a", "B2a", "B3a"], type: "run" },
    ];
    const result = detectDuplicateTileCodes(groups);
    expect(result).toContain("B1a");
  });

  it("복수 중복 코드: 전부 반환", () => {
    const groups: TableGroup[] = [
      { id: "g1", tiles: ["R7a", "B8a", "R7a"], type: "run" },
      { id: "g2", tiles: ["B8a", "K9a", "Y10a"], type: "run" },
    ];
    const result = detectDuplicateTileCodes(groups);
    expect(result).toContain("R7a");
    expect(result).toContain("B8a");
    expect(result).toHaveLength(2);
  });

  it("빈 그룹 목록: 빈 배열 반환", () => {
    expect(detectDuplicateTileCodes([])).toEqual([]);
  });

  it("조커 중복도 탐지 (JK1 물리적으로 1장)", () => {
    const groups: TableGroup[] = [
      { id: "g1", tiles: ["R7a", "JK1", "Y9a"], type: "run" },
      { id: "g2", tiles: ["B1a", "JK1", "B3a"], type: "run" },
    ];
    const result = detectDuplicateTileCodes(groups);
    expect(result).toContain("JK1");
  });

  it("정상 Y9-12 런 + B1-3 런: 중복 없음 (qa 재현 시나리오 정상 케이스)", () => {
    // BUG-UI-006 배경: 이 조합이 PENALTY_DRAW를 받은 케이스
    // 정상 상태에서는 중복 없어야 한다
    const groups: TableGroup[] = [
      { id: "g1", tiles: ["Y9a", "Y10a", "Y11a", "Y12a"], type: "run" },
      { id: "g2", tiles: ["B1a", "B2a", "B3a"], type: "run" },
    ];
    expect(detectDuplicateTileCodes(groups)).toEqual([]);
  });
});
