/**
 * 타일 코드 파싱/분류 유틸리티.
 *
 * 타일 인코딩 규칙 (CLAUDE.md Tile Encoding):
 *   {Color}{Number}{Set}
 *   Color: R | B | Y | K
 *   Number: 1~13
 *   Set: a | b
 *   조커: JK1 | JK2
 *
 * 이 모듈은 ContextShaper 계층(JokerHinterShaper, PairWarmupShaper)에서
 * 공통으로 사용하는 순수 함수만 포함한다. 외부 상태 접근 없음.
 */

import { ReadonlyTileGroup } from './shapers/shaper.types';

// ---------------------------------------------------------------------------
// 상수
// ---------------------------------------------------------------------------

export const VALID_COLORS = ['R', 'B', 'Y', 'K'] as const;
export type TileColor = (typeof VALID_COLORS)[number];

export const JOKER_TILES = new Set(['JK1', 'JK2']);

// ---------------------------------------------------------------------------
// 파싱된 타일
// ---------------------------------------------------------------------------

export interface Tile {
  /** 원본 타일 코드 (예: R7a, B13b, JK1) */
  readonly code: string;
  /** 색상 */
  readonly color: TileColor;
  /** 숫자 (1~13) */
  readonly number: number;
  /** 세트 구분자 (a | b) */
  readonly set: 'a' | 'b';
}

/**
 * 타일 코드를 파싱하여 Tile 객체로 반환한다.
 * 조커(JK1/JK2)는 parseTile 에 전달하지 않는다.
 *
 * @throws Error 유효하지 않은 타일 코드인 경우
 */
export function parseTile(code: string): Tile {
  // 정규식: {Color(1)}{Number(1-2)}{Set(1)}
  const match = /^([RBYK])(\d{1,2})([ab])$/.exec(code);
  if (!match) {
    throw new Error(`Invalid tile code: "${code}"`);
  }
  const color = match[1] as TileColor;
  const number = parseInt(match[2], 10);
  const set = match[3] as 'a' | 'b';

  if (number < 1 || number > 13) {
    throw new Error(`Tile number out of range [1-13]: "${code}"`);
  }

  return { code, color, number, set };
}

/**
 * 타일 코드를 조커 여부와 관계없이 안전하게 파싱한다.
 * 조커이면 null 반환.
 */
export function parseTileSafe(code: string): Tile | null {
  if (JOKER_TILES.has(code)) return null;
  try {
    return parseTile(code);
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// 그룹 분류
// ---------------------------------------------------------------------------

/**
 * 타일 코드 목록이 유효한 Set (같은 숫자, 다른 색) 인지 검사한다.
 * 조커는 와일드카드로 간주하여 허용.
 *
 * @param tiles 타일 코드 배열 (3~4장)
 */
export function isSet(tiles: readonly string[]): boolean {
  if (tiles.length < 3 || tiles.length > 4) return false;

  const nonJokers = tiles.filter((t) => !JOKER_TILES.has(t));
  if (nonJokers.length === 0) return false;

  const parsed = nonJokers
    .map((t) => parseTileSafe(t))
    .filter((t) => t !== null) as Tile[];
  if (parsed.length === 0) return false;

  const number = parsed[0].number;
  const allSameNumber = parsed.every((t) => t.number === number);
  if (!allSameNumber) return false;

  // 색상 중복 없어야 함
  const colors = parsed.map((t) => t.color);
  return new Set(colors).size === colors.length;
}

/**
 * 타일 코드 목록이 유효한 Run (같은 색, 연속 번호) 인지 검사한다.
 * 조커는 와일드카드로 간주하여 허용.
 *
 * @param tiles 타일 코드 배열 (3장 이상)
 */
export function isRun(tiles: readonly string[]): boolean {
  if (tiles.length < 3) return false;

  const nonJokers = tiles.filter((t) => !JOKER_TILES.has(t));
  if (nonJokers.length === 0) return false;

  const parsed = nonJokers
    .map((t) => parseTileSafe(t))
    .filter((t) => t !== null) as Tile[];
  if (parsed.length === 0) return false;

  const color = parsed[0].color;
  const allSameColor = parsed.every((t) => t.color === color);
  if (!allSameColor) return false;

  // 숫자 정렬 후 연속성 확인 (조커 슬롯 허용)
  const numbers = parsed.map((t) => t.number).sort((a, b) => a - b);
  const minNum = numbers[0];
  const maxNum = numbers[numbers.length - 1];

  // 실제 스팬 = max - min + 1
  // 조커 포함 총 길이 = tiles.length
  // 스팬이 tiles.length 와 같아야 연속 (조커가 빈 슬롯 채움)
  if (maxNum - minNum + 1 !== tiles.length) return false;
  if (maxNum > 13) return false;

  return true;
}

/**
 * 그룹의 타일에서 동일한 색상을 추출한다.
 * 조커 포함 시 null 반환 (색상 불명).
 */
export function getRunColor(tiles: readonly string[]): TileColor | null {
  const nonJokers = tiles.filter((t) => !JOKER_TILES.has(t));
  if (nonJokers.length === 0) return null;

  const parsed = nonJokers
    .map((t) => parseTileSafe(t))
    .filter((t) => t !== null) as Tile[];
  if (parsed.length === 0) return null;

  const firstColor = parsed[0].color;
  const allSame = parsed.every((t) => t.color === firstColor);
  return allSame ? firstColor : null;
}

/**
 * Run 그룹에서 최소/최대 숫자를 반환한다.
 * 조커 포함 시 실제 타일 기준으로 계산.
 */
export function getRunRange(
  tiles: readonly string[],
): { min: number; max: number } | null {
  const nonJokers = tiles.filter((t) => !JOKER_TILES.has(t));
  const parsed = nonJokers
    .map((t) => parseTileSafe(t))
    .filter((t) => t !== null) as Tile[];
  if (parsed.length === 0) return null;

  const numbers = parsed.map((t) => t.number);
  return { min: Math.min(...numbers), max: Math.max(...numbers) };
}

/**
 * Set 그룹에서 숫자를 반환한다.
 * 조커 포함 시 실제 타일 기준.
 */
export function getSetNumber(tiles: readonly string[]): number | null {
  const nonJokers = tiles.filter((t) => !JOKER_TILES.has(t));
  const parsed = nonJokers
    .map((t) => parseTileSafe(t))
    .filter((t) => t !== null) as Tile[];
  if (parsed.length === 0) return null;

  const number = parsed[0].number;
  return parsed.every((t) => t.number === number) ? number : null;
}

// ---------------------------------------------------------------------------
// 그룹 분류 헬퍼 (Board 분석용)
// ---------------------------------------------------------------------------

export interface ClassifiedGroup {
  readonly index: number;
  readonly tiles: readonly string[];
  readonly type: 'set' | 'run' | 'unknown';
  /** Set 이면 숫자, Run 이면 null */
  readonly setNumber: number | null;
  /** Run 이면 색상, Set 이면 null */
  readonly runColor: TileColor | null;
  /** Run 이면 범위, Set 이면 null */
  readonly runRange: { min: number; max: number } | null;
}

/**
 * Board 그룹 목록을 분류된 구조로 변환한다.
 */
export function classifyGroups(
  board: readonly ReadonlyTileGroup[],
): ClassifiedGroup[] {
  return board.map((group, index) => {
    const tiles = group.tiles;

    if (isSet(tiles)) {
      return {
        index,
        tiles,
        type: 'set' as const,
        setNumber: getSetNumber(tiles),
        runColor: null,
        runRange: null,
      };
    }

    if (isRun(tiles)) {
      return {
        index,
        tiles,
        type: 'run' as const,
        setNumber: null,
        runColor: getRunColor(tiles),
        runRange: getRunRange(tiles),
      };
    }

    return {
      index,
      tiles,
      type: 'unknown' as const,
      setNumber: null,
      runColor: null,
      runRange: null,
    };
  });
}
