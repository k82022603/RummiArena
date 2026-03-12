/**
 * 타일 색상
 * R=Red, B=Blue, Y=Yellow, K=Black
 */
export type TileColor = "R" | "B" | "Y" | "K";

/**
 * 타일 번호 (1~13)
 */
export type TileNumber = 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10 | 11 | 12 | 13;

/**
 * 타일 세트 구분자 (동일 타일 2개 구분)
 */
export type TileSet = "a" | "b";

/**
 * 일반 타일 코드: {Color}{Number}{Set}
 * 예: R7a, B13b, K1a
 */
export type RegularTileCode = `${TileColor}${TileNumber}${TileSet}`;

/**
 * 조커 타일 코드
 */
export type JokerTileCode = "JK1" | "JK2";

/**
 * 모든 타일 코드
 */
export type TileCode = RegularTileCode | JokerTileCode;

/**
 * 타일 객체 (UI에서 사용)
 */
export interface Tile {
  code: TileCode;
  color: TileColor | "joker";
  number: TileNumber | null;
  set: TileSet | null;
  isJoker: boolean;
}

/**
 * 테이블 그룹 (세트 또는 런)
 * group: 같은 숫자, 다른 색상 3~4개
 * run: 같은 색상, 연속 숫자 3개 이상
 */
export type GroupType = "group" | "run";

export interface TableGroup {
  id: string;
  tiles: TileCode[];
  type: GroupType;
}

/**
 * 타일 코드 파싱
 */
export function parseTileCode(code: TileCode): Tile {
  if (code === "JK1" || code === "JK2") {
    return { code, color: "joker", number: null, set: null, isJoker: true };
  }
  const color = code[0] as TileColor;
  const set = code[code.length - 1] as TileSet;
  const numberStr = code.slice(1, -1);
  const number = parseInt(numberStr, 10) as TileNumber;
  return { code, color, number, set, isJoker: false };
}

/**
 * 타일 색상 → TailwindCSS 클래스 매핑
 */
export const TILE_COLOR_CLASS: Record<TileColor | "joker", string> = {
  R: "bg-tile-red text-white",
  B: "bg-tile-blue text-white",
  Y: "bg-tile-yellow text-gray-900",
  K: "bg-tile-black text-white",
  joker: "bg-gradient-to-br from-purple-400 via-pink-400 to-yellow-400 text-white",
};

/**
 * 색약 접근성 보조 심볼
 */
export const TILE_ACCESSIBILITY_SYMBOL: Record<TileColor | "joker", string> = {
  R: "◆",
  B: "●",
  Y: "▲",
  K: "■",
  joker: "★",
};
