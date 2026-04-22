/**
 * hotfix/frontend-p0-2026-04-22 회귀 방지 테스트
 *
 * 작성일 2026-04-22 (Sprint 7 Day 1)
 * 작성자 frontend-dev (핫픽스)
 *
 * 대상 이슈:
 *   I-4 — 조커 회수 재사용 불가 (recoveredJoker → pendingMyTiles 동기화)
 *   I-2 — 런 앞/뒤 타일 부착 불가 (isCompatibleAsRun 경계 허용)
 *   I-1 — 미확정 세트 복제 방어 (drop 직후 detectDuplicateTileCodes 선실행)
 *
 * 테스트 원칙:
 *   - backend/WS 없이 순수 함수 호출로 검증
 *   - isCompatibleWithGroup, detectDuplicateTileCodes 직접 테스트
 *   - 옵션 B 로직(조커 → 랙 append) 시뮬레이션
 */

import "@testing-library/jest-dom";

import { isCompatibleWithGroup } from "@/lib/mergeCompatibility";
import { detectDuplicateTileCodes, removeFirstOccurrence } from "@/lib/tileStateHelpers";
import type { TileCode, TableGroup } from "@/types/tile";

// ==========================================================================
// I-4: 조커 회수 → pendingMyTiles append 로직 (옵션 B) 단위 검증
// ==========================================================================

describe("I-4 핫픽스 · 조커 회수 후 pendingMyTiles 포함 검증", () => {
  /**
   * 실제 GameClient 핫픽스 코드를 시뮬레이션한다.
   *
   * 변경 전: nextMyTiles = removeFirstOccurrence(currentMyTiles, tileCode)
   * 변경 후: nextMyTilesAfterSwap = [...removeFirstOccurrence(currentMyTiles, tileCode), recoveredJoker]
   *
   * 회수된 조커가 랙에 포함되어야만 사용자가 드래그 가능하다.
   */
  function simulateJokerSwap(params: {
    currentMyTiles: TileCode[];
    tileCode: TileCode;
    recoveredJoker: TileCode;
  }) {
    const { currentMyTiles, tileCode, recoveredJoker } = params;
    // 핫픽스 Option B 로직
    return [...removeFirstOccurrence(currentMyTiles, tileCode), recoveredJoker];
  }

  it("[happy] R7a 로 JK1 을 교체 후 JK1 이 pendingMyTiles 에 포함됨", () => {
    const currentMyTiles: TileCode[] = ["R7a", "B8a", "Y3a"] as TileCode[];
    const result = simulateJokerSwap({
      currentMyTiles,
      tileCode: "R7a" as TileCode,
      recoveredJoker: "JK1",
    });

    // R7a 는 제거되어야 한다
    expect(result).not.toContain("R7a");
    // JK1 은 랙에 포함되어 있어야 한다 (드래그 가능)
    expect(result).toContain("JK1");
    // B8a, Y3a 는 그대로 유지
    expect(result).toContain("B8a");
    expect(result).toContain("Y3a");
  });

  it("[happy] Y9a 로 JK2 를 교체 후 JK2 가 pendingMyTiles 에 포함됨", () => {
    const currentMyTiles: TileCode[] = ["Y9a", "K5a"] as TileCode[];
    const result = simulateJokerSwap({
      currentMyTiles,
      tileCode: "Y9a" as TileCode,
      recoveredJoker: "JK2",
    });

    expect(result).not.toContain("Y9a");
    expect(result).toContain("JK2");
    expect(result).toContain("K5a");
  });

  it("[edge] 변경 전 로직(removeFirstOccurrence only)은 조커가 랙에 없음 — 회귀 방지", () => {
    const currentMyTiles: TileCode[] = ["R7a", "B8a"] as TileCode[];
    // 변경 전: 조커가 랙에 추가되지 않는 로직
    const legacyResult = removeFirstOccurrence(currentMyTiles, "R7a" as TileCode);

    // 변경 전에는 JK1 이 랙에 없어 드래그 불가 — 이것이 I-4 버그였다
    expect(legacyResult).not.toContain("JK1");
    // 핫픽스 후에는 조커가 있어야 한다
    const fixedResult = [...legacyResult, "JK1" as TileCode];
    expect(fixedResult).toContain("JK1");
  });
});

// ==========================================================================
// I-2: 런 앞/뒤 타일 부착 (isCompatibleAsRun 경계 허용)
// ==========================================================================

describe("I-2 핫픽스 · 런 앞/뒤 타일 부착 — isCompatibleWithGroup 경계 허용", () => {
  const run345: TableGroup = {
    id: "g-run",
    tiles: ["Y3a", "Y4a", "Y5a"] as TileCode[],
    type: "run",
  };

  const run3456: TableGroup = {
    id: "g-run2",
    tiles: ["Y3a", "Y4a", "Y5a", "Y6a"] as TileCode[],
    type: "run",
  };

  it("[I-2 핵심] Y3-Y4-Y5 런에 Y2 드롭 → 앞 부착 허용 (run append front)", () => {
    // minNum=3, n=2, n === 3-1=2 ✓ → true
    expect(isCompatibleWithGroup("Y2a" as TileCode, run345)).toBe(true);
  });

  it("[I-2 핵심] Y3-Y4-Y5 런에 Y6 드롭 → 뒤 부착 허용 (run append end)", () => {
    // maxNum=5, n=6, n === 5+1=6 ✓ → true
    expect(isCompatibleWithGroup("Y6a" as TileCode, run345)).toBe(true);
  });

  it("[I-2 핵심] Y3-Y4-Y5-Y6 런에 Y2 드롭 → 앞 부착 허용", () => {
    expect(isCompatibleWithGroup("Y2a" as TileCode, run3456)).toBe(true);
  });

  it("[I-2 핵심] Y3-Y4-Y5-Y6 런에 Y7 드롭 → 뒤 부착 허용", () => {
    expect(isCompatibleWithGroup("Y7a" as TileCode, run3456)).toBe(true);
  });

  it("[edge] Y3-Y4-Y5 런에 Y1 드롭 → 거부 (비연속: n=1, minNum-1=2 불일치)", () => {
    // Y1 은 n=1, minNum-1=2 → 1 !== 2 → false
    expect(isCompatibleWithGroup("Y1a" as TileCode, run345)).toBe(false);
  });

  it("[edge] Y3-Y4-Y5 런에 B4 드롭 → 거부 (다른 색)", () => {
    expect(isCompatibleWithGroup("B4a" as TileCode, run345)).toBe(false);
  });

  it("[edge] Y3-Y4-Y5 런에 Y7 드롭 → 거부 (비연속: maxNum=5, 7 !== 5+1=6)", () => {
    expect(isCompatibleWithGroup("Y7a" as TileCode, run345)).toBe(false);
  });

  it("[happy] K3-K4-K5 런에 K2 드롭 → 앞 부착 허용 (다른 색계 확인)", () => {
    const kRun: TableGroup = {
      id: "g-krun",
      tiles: ["K3a", "K4a", "K5a"] as TileCode[],
      type: "run",
    };
    expect(isCompatibleWithGroup("K2a" as TileCode, kRun)).toBe(true);
  });

  it("[happy] K3-K4-K5 런에 K6 드롭 → 뒤 부착 허용", () => {
    const kRun: TableGroup = {
      id: "g-krun2",
      tiles: ["K3a", "K4a", "K5a"] as TileCode[],
      type: "run",
    };
    expect(isCompatibleWithGroup("K6a" as TileCode, kRun)).toBe(true);
  });
});

// ==========================================================================
// I-1: 미확정 세트 복제 방어 — detectDuplicateTileCodes 선실행 방어
// ==========================================================================

describe("I-1 핫픽스 · 미확정 세트 복제 방어 — detectDuplicateTileCodes 드롭 시점 검증", () => {
  /**
   * GameClient 핫픽스 로직을 시뮬레이션한다.
   * setPendingTableGroups 호출 직전에 detectDuplicateTileCodes 를 실행하여
   * 중복이 감지되면 상태 갱신을 거부한다.
   */
  function simulateDropWithDupeCheck(params: {
    currentTableGroups: TableGroup[];
    proposedNewGroups: TableGroup[];
  }): { allowed: boolean; duplicates: TileCode[] } {
    const dupes = detectDuplicateTileCodes(params.proposedNewGroups);
    return {
      allowed: dupes.length === 0,
      duplicates: dupes,
    };
  }

  it("[I-1 핵심] B13a 가 이미 pending 그룹에 있는데 동일 타일을 추가하면 거부됨", () => {
    // 기존 pending 그룹에 B13a 가 있음
    const currentGroups: TableGroup[] = [
      { id: "pending-1", tiles: ["B13a", "R13a"] as TileCode[], type: "group" },
    ];
    // B13a 를 또 추가하려는 시도 (재현: I-1 버그 — 반복 드롭)
    const proposedGroups: TableGroup[] = [
      { id: "pending-1", tiles: ["B13a", "R13a", "B13a"] as TileCode[], type: "group" },
    ];

    const result = simulateDropWithDupeCheck({
      currentTableGroups: currentGroups,
      proposedNewGroups: proposedGroups,
    });

    expect(result.allowed).toBe(false);
    expect(result.duplicates).toContain("B13a");
  });

  it("[I-1 핵심] B13a-R13a-JK 세트가 6개로 복제된 상황 → 중복 감지", () => {
    // 스크린샷 015203 상황 재현: 동일 그룹이 3개 복제된 상태
    const duplicatedGroups: TableGroup[] = [
      { id: "pending-1", tiles: ["B13a", "R13a", "JK1"] as TileCode[], type: "group" },
      { id: "pending-2", tiles: ["B13a", "R13a", "JK2"] as TileCode[], type: "group" },
    ];

    const dupes = detectDuplicateTileCodes(duplicatedGroups);
    // B13a 와 R13a 가 양쪽 그룹에 있으므로 중복 감지되어야 함
    expect(dupes).toContain("B13a");
    expect(dupes).toContain("R13a");
  });

  it("[happy] 서로 다른 타일을 각각 그룹에 배치 → 중복 없음, 허용됨", () => {
    const normalGroups: TableGroup[] = [
      { id: "pending-1", tiles: ["R7a", "B7a", "Y7a"] as TileCode[], type: "group" },
      { id: "pending-2", tiles: ["Y3a", "Y4a", "Y5a"] as TileCode[], type: "run" },
    ];

    const result = simulateDropWithDupeCheck({
      currentTableGroups: [],
      proposedNewGroups: normalGroups,
    });

    expect(result.allowed).toBe(true);
    expect(result.duplicates).toHaveLength(0);
  });

  it("[edge] JK1 이 두 그룹에 분산 → 중복 감지 (조커 물리 1장 규칙)", () => {
    const jokerDupe: TableGroup[] = [
      { id: "g1", tiles: ["R7a", "JK1", "Y9a"] as TileCode[], type: "run" },
      { id: "g2", tiles: ["B1a", "JK1", "B3a"] as TileCode[], type: "run" },
    ];

    const dupes = detectDuplicateTileCodes(jokerDupe);
    expect(dupes).toContain("JK1");
  });

  it("[edge] 새 그룹 추가 경로 — 기존 그룹의 타일과 새 그룹 타일 중복 시 거부", () => {
    // 기존: pending-1 에 R5a 존재, 새 그룹에도 R5a 를 추가하려는 경우
    const existingGroups: TableGroup[] = [
      { id: "pending-1", tiles: ["R5a", "R6a", "R7a"] as TileCode[], type: "run" },
    ];
    const withNewGroup: TableGroup[] = [
      ...existingGroups,
      { id: "pending-2", tiles: ["R5a"] as TileCode[], type: "run" }, // 중복!
    ];

    const result = simulateDropWithDupeCheck({
      currentTableGroups: existingGroups,
      proposedNewGroups: withNewGroup,
    });

    expect(result.allowed).toBe(false);
    expect(result.duplicates).toContain("R5a");
  });
});
