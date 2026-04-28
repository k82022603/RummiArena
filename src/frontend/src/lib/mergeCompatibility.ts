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
  //
  // BUG-NEW-002 수정: group.type이 "run"으로 표시되더라도 실제 타일 색상이
  // 모두 같지 않으면 런으로 신뢰하지 않는다. classifySetType이 기본값으로
  // "run"을 반환했을 때 [Y11,K12,B13] 같은 혼색 세트가 "런"으로 오분류되어
  // isCompatibleAsRun만 호출되는 문제를 방지한다. 색상이 섞인 경우 "unknown"을
  // 반환하여 그룹/런 양쪽 호환성을 모두 검사한다.
  const regular = group.tiles.filter((t) => !isJoker(t));
  if (regular.length < 2) return "unknown";
  const parsed = regular.map((t) => parseTileCode(t));
  const numbers = new Set(parsed.map((t) => t.number));
  const colors = new Set(parsed.map((t) => t.color));
  // group.type 힌트를 사용하되 실제 타일 내용으로 검증한다
  if (group.type === "run") {
    // 런 조건: 모든 타일이 같은 색상이어야 한다. 그렇지 않으면 unknown으로 강등.
    if (colors.size === 1) return "run";
    // 색상이 섞인 경우 — type 힌트를 무시하고 그룹 가능성도 확인
    if (numbers.size === 1) return "group";
    return "unknown";
  }
  if (group.type === "group") {
    // 그룹 조건: 모든 타일이 같은 숫자이어야 한다. 그렇지 않으면 unknown으로 강등.
    if (numbers.size === 1) return "group";
    // 숫자가 다른 경우 — type 힌트를 무시하고 런 가능성도 확인
    if (colors.size === 1) return "run";
    return "unknown";
  }
  // type 힌트 없이 직접 분류
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

  const jokerCount = group.tiles.filter((t) => isJoker(t)).length;
  const numbers = regular.map((r) => r.number as number).sort((a, b) => a - b);
  const minNum = numbers[0];
  const maxNum = numbers[numbers.length - 1];

  // 조커가 regular 타일 사이의 내부 빈자리를 채운 뒤 남는 잔여 조커 수 계산.
  // 잔여 조커는 런의 양쪽 끝을 확장하는 데 사용될 수 있다.
  // 예: [JK1, R9, R10] → 내부 gap = (10-9+1) - 2 = 0, 잔여 = 1 → effectiveMin = 8
  const internalGap = (maxNum - minNum + 1) - regular.length;
  const surplusJokers = Math.max(0, jokerCount - internalGap);

  // 잔여 조커가 양쪽 끝에 분배될 수 있으므로
  // 실제 런 범위: [minNum - surplusJokers, maxNum + surplusJokers]
  const effectiveMin = Math.max(MIN_NUMBER, minNum - surplusJokers);
  const effectiveMax = Math.min(MAX_NUMBER, maxNum + surplusJokers);

  if (tileIsJoker) {
    return effectiveMin - 1 >= MIN_NUMBER || effectiveMax + 1 <= MAX_NUMBER;
  }

  if (tileColor !== runColor) return false;
  if (tileNumber === null) return false;

  // I4: 일반 타일 추가 시, 기존 regular 숫자 + 새 타일을 합쳐서
  // 전체가 조커를 사용해 유효한 연속 런을 이룰 수 있는지 직접 검사.
  // 새 타일의 숫자가 기존에 이미 있으면 중복이므로 불가.
  const n = tileNumber as number;
  if (numbers.includes(n)) return false;

  const allNums = [...numbers, n].sort((a, b) => a - b);
  const newMin = allNums[0];
  const newMax = allNums[allNums.length - 1];
  const span = newMax - newMin + 1;

  // 연속 런에 필요한 빈칸 수 = span - regular 수 (새 타일 포함)
  // 조커로 채울 수 있어야 하고, 범위가 1~13 이내여야 함.
  const gaps = span - allNums.length;
  if (gaps < 0) return false;
  if (gaps > jokerCount) return false;
  if (newMin < MIN_NUMBER || newMax > MAX_NUMBER) return false;

  return true;
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
