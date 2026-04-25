/**
 * F-21 호환 드롭존 시각 강조 — RED spec
 *
 * 룰 ID: UR-10 (호환 드롭존 강조), UR-14 (호환 검사), UR-18 (--drop-compatible),
 *         UR-19 (--drop-incompatible), UR-34/UR-35 (band-aid 토스트 금지)
 * 상태 전이: S1/S5 → S2/S3/S4 (onDragStart)
 * acceptance criteria: AC-21.1 / AC-21.2 / AC-21.3
 *
 * SSOT: docs/02-design/55-game-rules-enumeration.md §3.4 UR-18/UR-19
 *       docs/02-design/56-action-state-matrix.md §3.2~§3.4 드래그 시작
 *       docs/02-design/60-ui-feature-spec.md §1.2 F-21
 *
 * Phase D Day 1 — RED commit (구현 없음, 모두 FAIL 예상)
 * commit message: [F-21] [UR-10] [UR-14] [UR-18] [UR-19] compatible dropzone highlight — RED spec
 */

import type { TileCode, TableGroup } from "@/types/tile";
import {
  computeValidMergeGroups,
  isCompatibleWithGroup,
} from "@/lib/mergeCompatibility";

// ---------------------------------------------------------------------------
// 픽스처
// ---------------------------------------------------------------------------

function G(id: string, tiles: TileCode[]): TableGroup {
  const regular = tiles.filter((t) => t !== "JK1" && t !== "JK2");
  // 같은 숫자면 group, 같은 색이면 run
  const numbers = new Set(regular.map((t) => t.replace(/[a-b]$/, "").replace(/^[RBYK]/, "")));
  const colors = new Set(regular.map((t) => t[0]));
  let type: "group" | "run" = "group";
  if (colors.size === 1) type = "run";
  if (numbers.size === 1) type = "group";
  return { id, tiles, type };
}

// ---------------------------------------------------------------------------
// AC-21.1: onDragStart(R7a) → 7-그룹 + R-런 드롭존 = --drop-compatible (UR-18)
// computeValidMergeGroups가 올바른 호환 그룹 집합을 반환하는지 검증
// ---------------------------------------------------------------------------

describe("[F-21] [UR-10] [UR-18] AC-21.1 — onDragStart(R7a) 호환 드롭존 계산", () => {
  const R7a: TileCode = "R7a";

  it("같은 숫자(7) 그룹에 R7a를 추가 가능한지 — UR-14 호환 검사", () => {
    // [B7a, K7a, Y7a] 그룹에 R7a 추가 = 4색 그룹 완성 → COMPAT
    const group7 = G("srv-001", ["B7a", "K7a", "Y7a"] as TileCode[]);
    const result = isCompatibleWithGroup(R7a, group7);
    // AC-21.1: R7a는 7-그룹에 호환되어야 한다
    expect(result).toBe(true); // UR-18: --drop-compatible 표시 대상
  });

  it("같은 색(R) 런에 R7a를 추가 가능한지 — R5a,R6a 런에 R7a append", () => {
    // [R5a, R6a] 런에 R7a = 연속 런 → COMPAT
    const runR = G("srv-002", ["R5a", "R6a"] as TileCode[]);
    const result = isCompatibleWithGroup(R7a, runR);
    // AC-21.1: R7a는 R-런에 호환되어야 한다
    expect(result).toBe(true); // UR-18: --drop-compatible 표시 대상
  });

  it("computeValidMergeGroups가 호환 그룹 집합을 올바르게 반환 (UR-10)", () => {
    const group7 = G("srv-001", ["B7a", "K7a", "Y7a"] as TileCode[]);
    const runR = G("srv-002", ["R5a", "R6a"] as TileCode[]);
    const group8 = G("srv-003", ["B8a", "K8a", "Y8a"] as TileCode[]); // 8그룹 — R7a 비호환

    const allGroups: TableGroup[] = [group7, runR, group8];
    const compatible = computeValidMergeGroups(R7a, allGroups);

    // AC-21.1: 호환 집합에 7그룹과 R런이 포함되어야 함
    expect(compatible.has("srv-001")).toBe(true); // 7-그룹 COMPAT
    expect(compatible.has("srv-002")).toBe(true); // R-런 COMPAT
    // 8그룹은 포함되지 않아야 함
    expect(compatible.has("srv-003")).toBe(false); // 비호환
  });
});

// ---------------------------------------------------------------------------
// AC-21.2: onDragStart(R7a) → 8-그룹 드롭존 = --drop-incompatible (UR-19)
// ---------------------------------------------------------------------------

describe("[F-21] [UR-19] AC-21.2 — onDragStart(R7a) 비호환 드롭존", () => {
  const R7a: TileCode = "R7a";

  it("8그룹에 R7a 드롭 시도 = 비호환 (UR-19 --drop-incompatible)", () => {
    const group8 = G("srv-003", ["B8a", "K8a", "Y8a"] as TileCode[]);
    const result = isCompatibleWithGroup(R7a, group8);
    // AC-21.2: R7a는 8-그룹에 비호환
    expect(result).toBe(false); // UR-19: --drop-incompatible 표시
  });

  it("다른 색 런에 R7a 드롭 시도 = 비호환 — B5a,B6a 런에 R7a", () => {
    // B5a, B6a 런 (파랑색 런) 에 R7a(빨강) = 색 불일치 → 비호환
    const runB = G("srv-004", ["B5a", "B6a"] as TileCode[]);
    const result = isCompatibleWithGroup(R7a, runB);
    // R색이 B런에 추가 불가
    expect(result).toBe(false);
  });

  it("같은 색 같은 숫자 중복 — R7b가 있는 그룹에 R7a 추가 불가 (V-14)", () => {
    // R7b가 있는 그룹에 R7a 추가 = 같은 색 중복 (V-14 위반)
    const groupWithR7b = G("srv-005", ["R7b", "B7a", "K7a"] as TileCode[]);
    const result = isCompatibleWithGroup(R7a, groupWithR7b);
    expect(result).toBe(false); // V-14: 그룹 동색 중복 불가
  });
});

// ---------------------------------------------------------------------------
// AC-21.3: F-21 진행 중 토스트 0건 (UR-34/UR-35 — band-aid 토스트 금지)
// 호환/비호환 판단은 시각 강조(색상)로만 전달. 토스트 절대 없음.
// ---------------------------------------------------------------------------

describe("[F-21] [UR-34] [UR-35] AC-21.3 — F-21 진행 중 토스트 0건", () => {
  it("computeValidMergeGroups 호출 시 어떠한 부작용(토스트/에러) 없음 — 순수 함수 검증", () => {
    const R7a: TileCode = "R7a";
    const groups: TableGroup[] = [
      G("grp-001", ["B7a", "K7a", "Y7a"] as TileCode[]),
      G("grp-002", ["R5a", "R6a"] as TileCode[]),
    ];

    // 순수 함수: 부작용 없어야 함
    // console.error 또는 throw 없이 완료되어야 한다
    expect(() => {
      const result = computeValidMergeGroups(R7a, groups);
      expect(result instanceof Set).toBe(true);
    }).not.toThrow();
  });

  it("isCompatibleWithGroup 호출 시 토스트/에러 없음 — 순수 함수 검증", () => {
    const R7a: TileCode = "R7a";
    const group = G("grp-001", ["B8a", "K8a"] as TileCode[]);

    // 비호환 케이스에서도 throw 없음 (UR-35: false positive 차단 금지)
    expect(() => {
      const result = isCompatibleWithGroup(R7a, group);
      // 결과는 boolean만 반환
      expect(typeof result).toBe("boolean");
    }).not.toThrow();
  });

  it("조커 타일이 포함된 그룹 호환성 체크 — D-09 (color enum R/B/Y/K만 허용)", () => {
    // D-09: existingColors.has("joker") 금지. 조커 색상 비교 시 R/B/Y/K만 사용
    const R7a: TileCode = "R7a";
    const groupWithJoker = G("grp-jk", ["JK1", "B7a"] as TileCode[]);

    // V-16 D-09: "joker" 문자열 색상 비교 없이 처리되어야 함
    expect(() => {
      const result = isCompatibleWithGroup(R7a, groupWithJoker);
      expect(typeof result).toBe("boolean");
    }).not.toThrow();
  });
});

// ---------------------------------------------------------------------------
// F-21 추가: 호환 드롭존 강조가 PRE_MELD / POST_MELD 구분 없이 동작
// (V-13a 차단은 드래그 시작 단계에서 처리, F-21 자체는 색상만 결정)
// ---------------------------------------------------------------------------

describe("[F-21] [V-13a] 드롭존 강조는 PRE/POST_MELD 구분 없이 색상 계산", () => {
  it("PRE_MELD 상태에서도 computeValidMergeGroups는 올바른 결과 반환", () => {
    // V-13a 차단은 DroppableGroupWrapper의 isDropBlocked 에서 처리
    // computeValidMergeGroups 자체는 meld 상태를 알 필요 없음
    const R7a: TileCode = "R7a";
    const group7 = G("srv-001", ["B7a", "K7a", "Y7a"] as TileCode[]);

    const compatible = computeValidMergeGroups(R7a, [group7]);
    // 호환성 계산 결과는 meld 상태와 무관
    expect(compatible.has("srv-001")).toBe(true);
  });
});
