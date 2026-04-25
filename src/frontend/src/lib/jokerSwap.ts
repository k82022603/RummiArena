/**
 * tryJokerSwap — 조커 교체 순수 함수 SSOT (L3)
 *
 * SSOT 매핑:
 *   - V-07: 회수한 조커는 같은 턴 내 반드시 재사용
 *   - V-13e: 조커 교체(Joker Swap) 재배치 유형 4
 *   - 56b S10: JOKER_RECOVERED_PENDING 상태 진입
 *
 * 금지: store, WS, DOM import 불가 (L3 계층 규칙)
 *
 * 이전 중복 정의 위치:
 *   - dragEndReducer.ts:46~102 (폐기 → 본 파일로 통합 RDX-05)
 *   - GameClient.tsx:내부 (폐기 예정)
 */

import type { TileCode, TileNumber } from "@/types/tile";
import { parseTileCode } from "@/types/tile";

/**
 * 조커 교체 결과
 */
export interface JokerSwapResult {
  /** 교체 후 그룹 타일 배열 (조커 대신 rackTile, 위치 유지) */
  nextTiles: TileCode[];
  /** 랙으로 회수된 조커 코드 */
  recoveredJoker: TileCode;
}

/**
 * 그룹 내 조커를 랙 타일로 교체 시도한다 (V-13e, V-07).
 *
 * 교체 가능 조건:
 *   1. groupTiles에 조커(JK1 또는 JK2)가 1개 이상 있어야 한다.
 *   2. rackTile이 조커가 아닌 일반 타일이어야 한다.
 *   3. 교체 후 그룹이 여전히 유효한 세트여야 한다:
 *      - 조커가 그룹에서 대체하던 위치에 rackTile을 넣어도 세트 유효성 유지
 *      - 구체적으로: 조커 제거 후 나머지 타일들이 rackTile과 함께
 *        그룹(같은 숫자) 또는 런(같은 색·연속) 을 이룰 수 있어야 한다.
 *
 * 구현 전략:
 *   조커를 하나씩 제거하고 rackTile로 대체해본다. 결과 배열이
 *   유효한 그룹 또는 런을 이루는지 검사한다.
 *   첫 번째 성공한 교체를 반환한다.
 *
 * @param groupTiles 그룹의 현재 타일 배열
 * @param rackTile 교체할 랙 타일
 * @returns 교체 성공 시 JokerSwapResult, 불가능하면 null
 */
export function tryJokerSwap(
  groupTiles: TileCode[],
  rackTile: TileCode,
): JokerSwapResult | null {
  // rackTile이 조커면 교체 불가
  const rackParsed = parseTileCode(rackTile);
  if (rackParsed.isJoker) return null;

  const jokerCodes: TileCode[] = ["JK1", "JK2"];

  for (const jokerCode of jokerCodes) {
    const jokerIndex = groupTiles.indexOf(jokerCode);
    if (jokerIndex < 0) continue;

    // 조커를 rackTile로 교체
    const candidate = [...groupTiles];
    candidate[jokerIndex] = rackTile;

    // 교체 후 그룹 유효성 검사
    if (isValidSetAfterSwap(candidate)) {
      return {
        nextTiles: candidate,
        recoveredJoker: jokerCode,
      };
    }
  }

  return null;
}

/**
 * 조커 교체 후 세트 유효성 검사 (내부 헬퍼)
 *
 * 기준:
 *   - 모두 조커가 아닌 일반 타일이어야 함 (교체 후 상태)
 *   - 그룹 조건: 모든 타일의 숫자가 같고, 색상이 모두 다름
 *   - 런 조건: 모든 타일의 색상이 같고, 숫자가 연속 (1~13 범위, 중복 없음)
 *   - 단, 여전히 조커가 있는 경우 (조커 2개인 그룹에서 1개만 교체)엔 조커 wildcard 허용
 */
function isValidSetAfterSwap(tiles: TileCode[]): boolean {
  if (tiles.length < 3) return false;

  const jokers = tiles.filter((t) => t === "JK1" || t === "JK2");
  const regular = tiles.filter((t) => t !== "JK1" && t !== "JK2");

  if (regular.length === 0) return false;

  const parsed = regular.map((t) => parseTileCode(t));
  const numbers = parsed.map((t) => t.number).filter((n): n is TileNumber => n !== null);
  const colors = new Set(parsed.map((t) => t.color));

  // 그룹 검사: 같은 숫자, 서로 다른 색상, 최대 4장
  if (tiles.length <= 4 && numbers.every((n) => n === numbers[0])) {
    const colorSet = new Set(parsed.map((t) => t.color));
    // 조커 없으면 색상 중복 금지
    if (jokers.length === 0 && colorSet.size === regular.length) return true;
    // 조커 있으면 색상 중복만 없으면 됨
    if (jokers.length > 0 && colorSet.size === regular.length) return true;
  }

  // 런 검사: 같은 색상, 연속 숫자
  if (colors.size === 1 && numbers.length === regular.length) {
    const sorted = [...numbers].sort((a, b) => a - b);
    // 중복 없음 검사
    const numSet = new Set(sorted);
    if (numSet.size !== sorted.length) return false;
    // 연속성 검사 (조커로 공백 허용)
    const min = sorted[0];
    const max = sorted[sorted.length - 1];
    const span = max - min + 1;
    if (sorted.length + jokers.length >= span && min >= 1 && max <= 13) return true;
  }

  return false;
}
