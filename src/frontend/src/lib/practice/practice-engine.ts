/**
 * 연습 모드 게임 로직
 *
 * 루미큐브 세트 유효성 검사:
 *   - 그룹(Group): 같은 숫자, 서로 다른 색상 3~4개 타일. 조커 허용.
 *   - 런(Run):   같은 색상, 연속 숫자 3개 이상. 조커 허용.
 *
 * 조커 처리:
 *   - 조커는 어떤 위치의 어떤 타일로도 대체 가능.
 *   - 유효성 검사 시 조커를 제외한 나머지 타일로 먼저 판단하고,
 *     조커로 빈 자리를 채울 수 있으면 유효 처리.
 */

import { parseTileCode } from "@/types/tile";
import type { TileCode, TileColor, TableGroup } from "@/types/tile";

// ------------------------------------------------------------------
// 타입
// ------------------------------------------------------------------

export type ValidationResult =
  | { valid: true }
  | { valid: false; reason: string };

// ------------------------------------------------------------------
// 내부 헬퍼
// ------------------------------------------------------------------

function separateJokers(tiles: TileCode[]): {
  jokerCount: number;
  regular: TileCode[];
} {
  const jokerCount = tiles.filter((t) => t === "JK1" || t === "JK2").length;
  const regular = tiles.filter((t) => t !== "JK1" && t !== "JK2");
  return { jokerCount, regular };
}

// ------------------------------------------------------------------
// 그룹 유효성 검사
// ------------------------------------------------------------------

/**
 * 그룹 유효성 검사
 *
 * 조건:
 * 1. 전체 타일 수(조커 포함) 3~4개
 * 2. 일반 타일들은 모두 같은 숫자
 * 3. 일반 타일들 사이에 중복 색상 없음
 * 4. 조커 개수 <= 전체 타일 수 - 1 (조커만으로 구성 불가)
 */
export function validateGroup(tiles: TileCode[]): ValidationResult {
  if (tiles.length < 3) {
    return { valid: false, reason: "그룹은 타일이 3개 이상이어야 합니다." };
  }
  if (tiles.length > 4) {
    return { valid: false, reason: "그룹은 타일이 최대 4개까지입니다." };
  }

  const { jokerCount, regular } = separateJokers(tiles);

  // 일반 타일이 최소 1개는 있어야 함
  if (regular.length === 0) {
    return { valid: false, reason: "일반 타일이 최소 1개는 필요합니다." };
  }

  const parsed = regular.map((t) => parseTileCode(t));

  // 모두 같은 숫자인지 확인
  const numbers = new Set(parsed.map((t) => t.number));
  if (numbers.size !== 1) {
    return {
      valid: false,
      reason: "그룹의 모든 타일은 같은 숫자여야 합니다.",
    };
  }

  // 중복 색상 없는지 확인
  const colors = parsed.map((t) => t.color as TileColor);
  const colorSet = new Set(colors);
  if (colorSet.size !== colors.length) {
    return { valid: false, reason: "그룹 내에 같은 색상 타일이 중복됩니다." };
  }

  // 조커가 남는 자리를 채울 수 있는지:
  // 전체 슬롯 = tiles.length, 일반 타일이 채운 슬롯 = regular.length
  // 빈 슬롯 = jokerCount (이미 tiles.length === regular.length + jokerCount)
  // 빈 슬롯에 다른 색상이 들어갈 수 있는지는 체크 불필요 (3~4개 제한으로 충분)
  void jokerCount; // 조커는 자유롭게 빈 자리를 채움

  return { valid: true };
}

// ------------------------------------------------------------------
// 런 유효성 검사
// ------------------------------------------------------------------

/**
 * 런 유효성 검사
 *
 * 조건:
 * 1. 전체 타일 수(조커 포함) 3개 이상
 * 2. 일반 타일들은 모두 같은 색상
 * 3. 일반 타일 숫자는 1~13 범위 안에서 연속 가능해야 함
 * 4. 조커로 빈 자리(gap)를 메울 수 있어야 함
 */
export function validateRun(tiles: TileCode[]): ValidationResult {
  if (tiles.length < 3) {
    return { valid: false, reason: "런은 타일이 3개 이상이어야 합니다." };
  }

  const { jokerCount, regular } = separateJokers(tiles);

  if (regular.length === 0) {
    return { valid: false, reason: "일반 타일이 최소 1개는 필요합니다." };
  }

  const parsed = regular.map((t) => parseTileCode(t));

  // 모두 같은 색상인지 확인
  const colors = new Set(parsed.map((t) => t.color));
  if (colors.size !== 1) {
    return {
      valid: false,
      reason: "런의 모든 타일은 같은 색상이어야 합니다.",
    };
  }

  // 숫자 정렬
  const nums = parsed.map((t) => t.number as number).sort((a, b) => a - b);

  // 중복 숫자 없는지 확인
  const numSet = new Set(nums);
  if (numSet.size !== nums.length) {
    return { valid: false, reason: "런 내에 같은 숫자 타일이 중복됩니다." };
  }

  const min = nums[0];
  const max = nums[nums.length - 1];
  const span = max - min + 1; // 일반 타일 숫자 범위

  // 일반 타일 범위가 전체 타일 수보다 크면 조커 부족
  if (span > tiles.length) {
    return {
      valid: false,
      reason: `숫자 순서가 맞지 않습니다. 조커가 ${span - tiles.length}개 더 필요합니다.`,
    };
  }

  // 범위 내 빈 자리: 조커로 채울 수 있어야 함
  // span < tiles.length 는 허용 (나머지 조커가 양 끝에 위치)
  const gaps = span - regular.length;
  if (gaps > jokerCount) {
    return {
      valid: false,
      reason: "조커 수와 빠진 숫자 자리가 일치하지 않습니다.",
    };
  }

  // 범위 경계 확인: 런 전체가 1~13 안에 위치해야 함
  // 남은 조커(양 끝 배치용) = jokerCount - gaps
  if (min < 1 || max > 13) {
    return {
      valid: false,
      reason: "타일 숫자는 1~13 범위 안에 있어야 합니다.",
    };
  }
  const jokerAtEnds = jokerCount - gaps;
  const possibleStart = Math.max(1, min - jokerAtEnds);
  if (possibleStart + tiles.length - 1 > 13) {
    return {
      valid: false,
      reason: "타일 숫자는 1~13 범위 안에 있어야 합니다.",
    };
  }

  return { valid: true };
}

// ------------------------------------------------------------------
// 보드 상태 유효성 검사 (배치된 그룹들 전체)
// ------------------------------------------------------------------

/**
 * 보드 위 그룹 배열 전체를 검사한다.
 * 각 그룹은 validateGroup 또는 validateRun으로 검사하며,
 * 그룹 타입이 "group"이면 validateGroup, "run"이면 validateRun 사용.
 */
export function validateBoard(groups: TableGroup[]): {
  allValid: boolean;
  invalidGroupIds: string[];
  reasons: Record<string, string>;
} {
  const invalidGroupIds: string[] = [];
  const reasons: Record<string, string> = {};

  for (const group of groups) {
    // 선언된 타입으로 먼저 검사, 실패하면 반대 타입으로도 시도
    // (연습 모드에서 사용자가 타입을 잘못 설정한 경우 자동 보정)
    const primary =
      group.type === "group"
        ? validateGroup(group.tiles)
        : validateRun(group.tiles);
    const result = primary.valid
      ? primary
      : group.type === "group"
      ? validateRun(group.tiles)
      : validateGroup(group.tiles);

    if (!result.valid) {
      invalidGroupIds.push(group.id);
      // 선언 타입 기준 에러 메시지 우선 표시 (primary가 실패한 경우)
      reasons[group.id] = primary.valid ? result.reason : primary.reason;
    }
  }

  return {
    allValid: invalidGroupIds.length === 0,
    invalidGroupIds,
    reasons,
  };
}

// ------------------------------------------------------------------
// 힌트 생성
// ------------------------------------------------------------------

/**
 * 현재 핸드와 보드 상태를 분석해 힌트 문자열을 반환한다.
 *
 * 우선순위:
 * 1. 보드 위 그룹이 유효하지 않으면 첫 번째 오류 이유를 반환
 * 2. 핸드에 조커가 있으면 조커 활용 힌트
 * 3. 같은 숫자 3개 이상이 있으면 그룹 힌트
 * 4. 같은 색상 연속 3개 이상이 있으면 런 힌트
 * 5. 기본 힌트
 */
export function getHint(board: TableGroup[], hand: TileCode[]): string {
  // 1. 보드 오류
  const { allValid, reasons } = validateBoard(board);
  if (!allValid) {
    const firstReason = Object.values(reasons)[0];
    return firstReason ?? "배치된 세트가 유효하지 않습니다.";
  }

  // 2. 조커 힌트
  const hasJoker = hand.some((t) => t === "JK1" || t === "JK2");
  if (hasJoker) {
    return "조커를 빠진 타일 자리에 배치하면 세트가 완성됩니다.";
  }

  // 3. 같은 숫자 그룹 후보 탐색
  const parsed = hand.map((t) => parseTileCode(t));
  const byNumber = new Map<number, typeof parsed>();
  for (const tile of parsed) {
    if (tile.isJoker || tile.number === null) continue;
    const list = byNumber.get(tile.number) ?? [];
    list.push(tile);
    byNumber.set(tile.number, list);
  }
  for (const [num, tiles] of byNumber.entries()) {
    const uniqueColors = new Set(tiles.map((t) => t.color));
    if (uniqueColors.size >= 3) {
      return `숫자 ${num}짜리 타일이 ${uniqueColors.size}가지 색상 있습니다. 그룹을 만들어 보세요!`;
    }
  }

  // 4. 같은 색상 연속 런 후보 탐색
  const byColor = new Map<string, number[]>();
  for (const tile of parsed) {
    if (tile.isJoker || tile.number === null) continue;
    const list = byColor.get(tile.color as string) ?? [];
    list.push(tile.number);
    byColor.set(tile.color as string, list);
  }
  for (const [color, nums] of byColor.entries()) {
    const sorted = [...new Set(nums)].sort((a, b) => a - b);
    // 연속 구간 길이 탐색
    let maxRun = 1;
    let cur = 1;
    for (let i = 1; i < sorted.length; i++) {
      if (sorted[i] === sorted[i - 1] + 1) {
        cur++;
        if (cur > maxRun) maxRun = cur;
      } else {
        cur = 1;
      }
    }
    if (maxRun >= 3) {
      const colorLabel: Record<string, string> = {
        R: "빨강",
        B: "파랑",
        Y: "노랑",
        K: "검정",
      };
      return `${colorLabel[color] ?? color} 타일로 연속 런이 가능합니다. 숫자 순서대로 배치해 보세요!`;
    }
  }

  return "랙에서 타일을 보드로 드래그하여 세트를 만들어 보세요.";
}

// ------------------------------------------------------------------
// 점수 계산
// ------------------------------------------------------------------

/**
 * 배치된 그룹들의 타일 숫자 합산 (조커 = 30점 고정)
 */
export function calculateScore(groups: TableGroup[]): number {
  let total = 0;
  for (const group of groups) {
    for (const code of group.tiles) {
      if (code === "JK1" || code === "JK2") {
        total += 30;
      } else {
        const tile = parseTileCode(code);
        total += tile.number ?? 0;
      }
    }
  }
  return total;
}

// ------------------------------------------------------------------
// 스테이지 클리어 판정
// ------------------------------------------------------------------

/**
 * 스테이지 목표(goal)에 따라 클리어 여부를 판정한다.
 *
 * - "group":  유효한 그룹 1개 이상
 * - "run":    유효한 런 1개 이상
 * - "joker":  조커를 포함하고 유효한 세트 1개 이상
 * - "multi":  유효한 세트 2개 이상 (그룹 1개 + 런 1개 이상 포함)
 * - "master": 유효한 세트의 타일 합산 수 12개 이상
 */
export function isStageClear(
  groups: TableGroup[],
  goal: "group" | "run" | "joker" | "multi" | "master"
): boolean {
  if (groups.length === 0) return false;

  switch (goal) {
    case "group":
      return groups.some((g) => validateGroup(g.tiles).valid);

    case "run":
      return groups.some((g) => validateRun(g.tiles).valid);

    case "joker":
      return groups.some((g) => {
        const hasJoker = g.tiles.some((t) => t === "JK1" || t === "JK2");
        if (!hasJoker) return false;
        return validateGroup(g.tiles).valid || validateRun(g.tiles).valid;
      });

    case "multi": {
      // 유효한 세트가 2개 이상이며, 그룹 1개 + 런 1개 이상 포함해야 클리어
      const validGroups = groups.filter((g) => validateGroup(g.tiles).valid);
      const validRuns = groups.filter((g) => validateRun(g.tiles).valid);
      return validGroups.length >= 1 && validRuns.length >= 1;
    }

    case "master": {
      // 유효한 세트에 포함된 타일 수 합산 12개 이상
      let tileCount = 0;
      for (const g of groups) {
        const isValidGroup = validateGroup(g.tiles).valid;
        const isValidRun = validateRun(g.tiles).valid;
        if (isValidGroup || isValidRun) {
          tileCount += g.tiles.length;
        }
      }
      return tileCount >= 12;
    }
  }
}
