import type { TileCode, TableGroup, TileColor, TileNumber } from "@/types/tile";
import { parseTileCode } from "@/types/tile";

const MAX_GROUP_SIZE = 4;
const MIN_NUMBER = 1;
const MAX_NUMBER = 13;

function isJoker(code: TileCode): boolean {
  return code === "JK1" || code === "JK2";
}

type ClassifiedKind = "group" | "run" | "unknown";

function classifyKind(group: TableGroup): ClassifiedKind {
  // B-NEW 수정: group.type が "group"/"run" であっても、実際のタイル数が 2 枚未満なら
  // 判断不能 ("unknown") として扱い、両方の互換チェックを実行させる。
  // classifySetType は单一タイル に対して "run" を返すが、
  // 以前は "group" を返していたため、K12 一枚グループに K13 をドロップすると
  // isCompatibleAsGroup のみ実行されて拒否されていた (B-NEW バグ根本原因)。
  //
  // B-NEW fix: even if group.type is "group"/"run", treat groups with fewer than
  // 2 regular tiles as "unknown" so both group and run compatibility are checked.
  const regular = group.tiles.filter((t) => !isJoker(t));
  if (regular.length < 2) return "unknown";
  if (group.type === "group" || group.type === "run") return group.type;
  const parsed = regular.map((t) => parseTileCode(t));
  const numbers = new Set(parsed.map((t) => t.number));
  const colors = new Set(parsed.map((t) => t.color));
  if (numbers.size === 1 && colors.size === regular.length) return "group";
  if (colors.size === 1) return "run";
  return "unknown";
}

function isCompatibleAsGroup(
  tileColor: TileColor | "joker",
  tileNumber: TileNumber | null,
  group: TableGroup,
  tileIsJoker: boolean,
): boolean {
  if (group.tiles.length >= MAX_GROUP_SIZE) return false;
  if (tileIsJoker) return true;

  const regular = group.tiles.filter((t) => !isJoker(t)).map((t) => parseTileCode(t));
  if (regular.length === 0) return true;

  const groupNumber = regular[0].number;
  for (const r of regular) {
    if (r.number !== groupNumber) return false;
  }
  if (tileNumber !== groupNumber) return false;

  const existingColors = new Set(regular.map((r) => r.color));
  if (existingColors.has(tileColor as TileColor)) return false;

  return true;
}

function isCompatibleAsRun(
  tileColor: TileColor | "joker",
  tileNumber: TileNumber | null,
  group: TableGroup,
  tileIsJoker: boolean,
): boolean {
  const regular = group.tiles.filter((t) => !isJoker(t)).map((t) => parseTileCode(t));
  if (regular.length === 0) return true;

  const runColor = regular[0].color;
  for (const r of regular) {
    if (r.color !== runColor) return false;
  }

  if (tileIsJoker) {
    const minNum = Math.min(...regular.map((r) => r.number as number));
    const maxNum = Math.max(...regular.map((r) => r.number as number));
    return minNum - 1 >= MIN_NUMBER || maxNum + 1 <= MAX_NUMBER;
  }

  if (tileColor !== runColor) return false;
  if (tileNumber === null) return false;

  const numbers = regular.map((r) => r.number as number).sort((a, b) => a - b);
  const minNum = numbers[0];
  const maxNum = numbers[numbers.length - 1];

  const n = tileNumber as number;
  if (n === minNum - 1 && n >= MIN_NUMBER) return true;
  if (n === maxNum + 1 && n <= MAX_NUMBER) return true;

  return false;
}

export function isCompatibleWithGroup(tile: TileCode, group: TableGroup): boolean {
  if (group.tiles.includes(tile)) return false;

  const parsed = parseTileCode(tile);
  const tileIsJoker = parsed.isJoker;
  const kind = classifyKind(group);

  if (kind === "group") {
    return isCompatibleAsGroup(parsed.color, parsed.number, group, tileIsJoker);
  }
  if (kind === "run") {
    return isCompatibleAsRun(parsed.color, parsed.number, group, tileIsJoker);
  }
  return (
    isCompatibleAsGroup(parsed.color, parsed.number, group, tileIsJoker) ||
    isCompatibleAsRun(parsed.color, parsed.number, group, tileIsJoker)
  );
}

export function computeValidMergeGroups(
  tile: TileCode,
  groups: TableGroup[],
): Set<string> {
  const result = new Set<string>();
  for (const g of groups) {
    if (isCompatibleWithGroup(tile, g)) result.add(g.id);
  }
  return result;
}
