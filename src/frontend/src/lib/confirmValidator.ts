/**
 * confirmValidator — ConfirmTurn 사전검증 SSOT (L3 순수 함수)
 *
 * SSOT 매핑:
 *   - V-01: 세트 유효성 (그룹 또는 런)
 *   - V-02: 세트 크기 (3장 이상)
 *   - V-03: 랙에서 최소 1장 추가
 *   - V-04: 초기 등록 30점 이상
 *   - V-14: 그룹 동색 중복 불가
 *   - V-15: 런 숫자 연속 (1↔13 순환 금지)
 *   - UR-36: ConfirmTurn 사전검증은 위 6가지 클라 미러만. 임의 게이트 추가 금지.
 *
 * 금지:
 *   - store, WS, DOM import 불가 (L3 계층 규칙)
 *   - UR-36: 위 V-* 외 추가 검증 게이트 절대 추가 금지 (band-aid)
 *
 * 주의: 이 함수는 서버 최종 검증의 클라이언트 미러일 뿐이다.
 * false positive로 사용자 액션을 차단하지 않도록 보수적으로 검사한다.
 */

import type { TileCode, TableGroup, TileColor, TileNumber } from "@/types/tile";
import { parseTileCode } from "@/types/tile";

// ---------------------------------------------------------------------------
// 결과 타입
// ---------------------------------------------------------------------------

export interface ValidationResult {
  valid: boolean;
  /** 검증 실패한 그룹 ID */
  errorGroupId?: string;
  /**
   * 에러 코드 (서버 ERR_* 미러)
   * "ERR_SET_SIZE" | "ERR_INVALID_SET" | "ERR_NO_RACK_TILE" |
   * "ERR_INITIAL_MELD_SCORE" | "ERR_GROUP_COLOR_DUP" | "ERR_RUN_SEQUENCE"
   */
  errorCode?: string;
}

// ---------------------------------------------------------------------------
// 내부 헬퍼
// ---------------------------------------------------------------------------

function isJoker(code: TileCode): boolean {
  return code === "JK1" || code === "JK2";
}

/**
 * V-02: 세트 크기 검사 (3장 이상)
 */
function checkSetSize(group: TableGroup): boolean {
  return group.tiles.length >= 3;
}

/**
 * V-14: 그룹 동색 중복 불가
 * 조커를 제외한 일반 타일 중 같은 색이 2번 이상 나오면 거절.
 */
function checkGroupColorDuplicate(group: TableGroup): boolean {
  const regular = group.tiles.filter((t) => !isJoker(t));
  const parsed = regular.map((t) => parseTileCode(t));
  const colors = parsed.map((t) => t.color as TileColor);
  return new Set(colors).size === colors.length;
}

/**
 * V-15: 런 숫자 연속 (1~13 범위, 1↔13 순환 금지, 중복 금지)
 */
function checkRunSequence(group: TableGroup): boolean {
  const regular = group.tiles.filter((t) => !isJoker(t));
  if (regular.length === 0) return true;

  const parsed = regular.map((t) => parseTileCode(t));
  const numbers = parsed
    .map((t) => t.number)
    .filter((n): n is TileNumber => n !== null);

  if (numbers.length === 0) return true;

  // 중복 검사
  if (new Set(numbers).size !== numbers.length) return false;

  const sorted = [...numbers].sort((a, b) => a - b);
  const min = sorted[0];
  const max = sorted[sorted.length - 1];

  // 범위 검사 (1~13)
  if (min < 1 || max > 13) return false;

  // 연속성 검사: 조커 수만큼 공백 허용
  const jokerCount = group.tiles.filter((t) => isJoker(t)).length;
  const span = max - min + 1;
  if (span > sorted.length + jokerCount) return false;

  // 1↔13 순환 금지: max - min < 12 이어야 함 (전체 범위 = 12)
  // 예: [12,13,1] → sorted=[1,12,13] → span=13 > 3+0 → 이미 위에서 차단됨

  return true;
}

/**
 * V-01: 세트 유효성 — 그룹 또는 런 둘 중 하나를 이루어야 한다.
 *
 * 판정:
 *   - 일반 타일 숫자 모두 같음 → 그룹 후보 → V-14 검사
 *   - 일반 타일 색상 모두 같음 → 런 후보 → V-15 검사
 *   - 조커만 있으면 → 유효 (서버 판정에 위임)
 *   - 그 외 → 무효
 */
function checkSetValidity(group: TableGroup): { valid: boolean; errorCode?: string } {
  const regular = group.tiles.filter((t) => !isJoker(t));

  // 조커만 있거나 비어있으면 서버에 위임
  if (regular.length === 0) return { valid: true };

  const parsed = regular.map((t) => parseTileCode(t));
  const numbers = new Set(parsed.map((t) => t.number));
  const colors = new Set(parsed.map((t) => t.color));

  const isGroupCandidate = numbers.size === 1;
  const isRunCandidate = colors.size === 1;

  if (isGroupCandidate) {
    // V-14: 동색 중복
    if (!checkGroupColorDuplicate(group)) {
      return { valid: false, errorCode: "ERR_GROUP_COLOR_DUP" };
    }
    return { valid: true };
  }

  if (isRunCandidate) {
    // V-15: 런 연속성
    if (!checkRunSequence(group)) {
      return { valid: false, errorCode: "ERR_RUN_SEQUENCE" };
    }
    return { valid: true };
  }

  // 그룹도 런도 아님
  return { valid: false, errorCode: "ERR_INVALID_SET" };
}

// ---------------------------------------------------------------------------
// 메인 검증 함수
// ---------------------------------------------------------------------------

/**
 * ConfirmTurn 사전검증 (V-01/02/03/04/14/15 클라이언트 미러)
 *
 * UR-36: 이 함수 외에 임의 게이트 추가 절대 금지.
 *
 * @param pendingOnlyGroups pending 전용 그룹 배열 (pending- prefix ID 그룹만)
 * @param hasInitialMeld 초기 등록 완료 여부
 * @param pendingPlacementScore pending 그룹 점수 합계 (computePendingScore 결과)
 * @param tilesAdded 랙에서 보드로 옮긴 타일 수 (computeTilesAdded 결과)
 * @returns ValidationResult
 */
export function validateTurnPreCheck(
  pendingOnlyGroups: TableGroup[],
  hasInitialMeld: boolean,
  pendingPlacementScore: number,
  tilesAdded: number,
): ValidationResult {
  // V-03: 랙에서 최소 1장 추가
  if (tilesAdded < 1) {
    return { valid: false, errorCode: "ERR_NO_RACK_TILE" };
  }

  // V-04: 초기 등록 전이면 30점 이상
  if (!hasInitialMeld && pendingPlacementScore < 30) {
    return { valid: false, errorCode: "ERR_INITIAL_MELD_SCORE" };
  }

  // V-02: 각 그룹 크기 검사 + V-01/V-14/V-15: 세트 유효성
  for (const group of pendingOnlyGroups) {
    // V-02: 3장 이상
    if (!checkSetSize(group)) {
      return {
        valid: false,
        errorGroupId: group.id,
        errorCode: "ERR_SET_SIZE",
      };
    }

    // V-01, V-14, V-15 통합 검사
    const validity = checkSetValidity(group);
    if (!validity.valid) {
      return {
        valid: false,
        errorGroupId: group.id,
        errorCode: validity.errorCode,
      };
    }
  }

  return { valid: true };
}
