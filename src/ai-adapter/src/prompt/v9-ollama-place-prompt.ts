/**
 * V9 Ollama Place Pre-computed Prompt — qwen2.5:3b 전용.
 *
 * v8 대비 변경점:
 *   - scoreSetWithJoker: 조커를 30점 고정이 아닌 대체 위치 숫자로 계산 (서버 group/runScore 이식)
 *   - findValidRunsV9: 조커 갭 채우기 + 양끝 확장 완전 지원
 *   - findOptimalInitialMeld: DFS + 최다 타일 우선 (findMeldFor30 대체)
 *   - findNewRackSets: 초기 등록 완료 후 랙 전용 신규 세트
 *   - findAllExtensions: 다중 확장 (v8 단일 확장 대체)
 *   - findRunSplits: P0 V-03 5조건 게이트 적용
 *   - findJokerExchange: V-06/V-07 검증, 런 조커 v9 미지원
 *   - findOptimalPostMeldMove: 5전략 조합 후 최다 타일 선택
 *
 * game-analyst P0 이슈 6가지 모두 반영.
 */

// =============================================================================
// 1) 타일 파서 (v8 그대로 복사)
// =============================================================================

export interface ParsedTile {
  color: string;
  number: number;
  isJoker: boolean;
}

const VALID_COLORS = new Set(['R', 'B', 'Y', 'K']);

/**
 * 타일 코드를 파싱한다.
 * - 정상 타일: "R7a" → { color:"R", number:7, isJoker:false }
 * - 조커: "JK1"/"JK2" → { color:"*", number:0, isJoker:true }
 * - 잘못된 형식: null 반환
 */
export function parseTile(code: string): ParsedTile | null {
  if (!code || typeof code !== 'string') return null;

  if (code === 'JK1' || code === 'JK2') {
    return { color: '*', number: 0, isJoker: true };
  }

  const m = code.match(/^([RBYK])(\d{1,2})([ab])$/);
  if (!m) return null;

  const color = m[1];
  const number = parseInt(m[2], 10);
  if (!VALID_COLORS.has(color)) return null;
  if (number < 1 || number > 13) return null;

  return { color, number, isJoker: false };
}

// =============================================================================
// 2) 중복 타일 검사 (v8 그대로 복사)
// =============================================================================

export function hasOverlap(a: string[], b: string[]): boolean {
  const set = new Set(a);
  for (const t of b) {
    if (set.has(t)) return true;
  }
  return false;
}

// =============================================================================
// 3) 점수 계산 — 조커를 대체 위치 숫자로 계산 (서버 group/runScore 이식)
// =============================================================================

/**
 * 세트 점수 계산. 조커는 대체하는 위치 숫자.
 *
 * 그룹 (같은 숫자, 다른 색): 조커도 sharedNumber.
 * 런 (같은 색, 연속): 서버 runScore 알고리즘 이식.
 *   - 내부 갭 → 조커 배치
 *   - 남은 조커 → maxNum 이후 우선, 그다음 minNum 이전
 */
export function scoreSetWithJoker(tiles: string[]): number {
  const parsed = tiles.map(parseTile).filter(Boolean) as ParsedTile[];
  const jokers = parsed.filter((p) => p.isJoker);
  const normals = parsed.filter((p) => !p.isJoker);

  if (normals.length === 0) return 0; // 조커만인 경우

  // 그룹 판별: 비조커가 모두 같은 숫자
  const numbers = new Set(normals.map((p) => p.number));
  if (numbers.size === 1) {
    // 그룹: 조커도 sharedNumber (group.go 이식)
    const sharedNumber = normals[0].number;
    return tiles.length * sharedNumber;
  }

  // 런 판별: 색상 1개
  const colors = new Set(normals.map((p) => p.color));
  if (colors.size === 1) {
    // 런: 서버 runScore 알고리즘 이식 (run.go:109-153)
    const sortedNums = normals.map((p) => p.number).sort((a, b) => a - b);
    const minNum = sortedNums[0];
    const maxNum = sortedNums[sortedNums.length - 1];
    const jokerCount = jokers.length;

    // 내부 갭 계산
    const gapsInside = maxNum - minNum + 1 - sortedNums.length;
    const remaining = Math.max(0, jokerCount - gapsInside);

    // 남은 조커: maxNum 이후 우선 (13 상한)
    let jokersAfter = remaining;
    if (maxNum + jokersAfter > 13) {
      jokersAfter = 13 - maxNum;
    }
    const jokersBefore = Math.max(0, remaining - jokersAfter);

    let start = minNum - jokersBefore;
    if (start < 1) start = 1;

    let sum = 0;
    for (let i = 0; i < tiles.length; i++) {
      sum += start + i;
    }
    return sum;
  }

  // 판별 불가: 비조커 평균 * 전체 장수
  const avg = normals.reduce((sum, p) => sum + p.number, 0) / normals.length;
  return Math.round(avg * tiles.length);
}

// =============================================================================
// 4) 유효 그룹 탐색 (v8 그대로 복사)
// =============================================================================

export function findValidGroups(tiles: string[]): string[][] {
  const groups: string[][] = [];

  const byNumber = new Map<number, Map<string, string>>();
  const jokers: string[] = [];

  for (const code of tiles) {
    const t = parseTile(code);
    if (!t) continue;
    if (t.isJoker) {
      jokers.push(code);
      continue;
    }
    if (!byNumber.has(t.number)) {
      byNumber.set(t.number, new Map<string, string>());
    }
    const colorMap = byNumber.get(t.number)!;
    if (!colorMap.has(t.color)) {
      colorMap.set(t.color, code);
    }
  }

  for (const [, colorMap] of byNumber) {
    const colorTiles = Array.from(colorMap.values());
    const distinctColors = colorTiles.length;
    const usableJokers = jokers.length;

    if (distinctColors >= 3) {
      for (let i = 0; i < colorTiles.length; i++) {
        for (let j = i + 1; j < colorTiles.length; j++) {
          for (let k = j + 1; k < colorTiles.length; k++) {
            groups.push([colorTiles[i], colorTiles[j], colorTiles[k]]);
          }
        }
      }
    } else if (distinctColors === 2 && usableJokers >= 1) {
      groups.push([colorTiles[0], colorTiles[1], jokers[0]]);
    } else if (distinctColors === 1 && usableJokers >= 2) {
      groups.push([colorTiles[0], jokers[0], jokers[1]]);
    }

    if (distinctColors === 4) {
      groups.push([
        colorMap.get('R')!,
        colorMap.get('B')!,
        colorMap.get('Y')!,
        colorMap.get('K')!,
      ]);
    }
  }

  return groups;
}

// =============================================================================
// 5) 유효 런 탐색 (v8 findValidRuns 내부 로직을 순수 런으로 분리)
// =============================================================================

/** 조커 없는 순수 런. v8 findValidRuns와 동일 로직. */
function findPureRuns(tiles: string[]): string[][] {
  const runs: string[][] = [];
  const byColor = new Map<string, Map<number, string>>();

  for (const code of tiles) {
    const t = parseTile(code);
    if (!t || t.isJoker) continue;
    if (!byColor.has(t.color)) {
      byColor.set(t.color, new Map<number, string>());
    }
    const numMap = byColor.get(t.color)!;
    if (!numMap.has(t.number)) {
      numMap.set(t.number, code);
    }
  }

  for (const [, numMap] of byColor) {
    const sortedNums = Array.from(numMap.keys()).sort((a, b) => a - b);
    if (sortedNums.length < 3) continue;

    let runStart = 0;
    for (let i = 1; i <= sortedNums.length; i++) {
      const isBreak =
        i === sortedNums.length || sortedNums[i] !== sortedNums[i - 1] + 1;
      if (isBreak) {
        const segLen = i - runStart;
        if (segLen >= 3) {
          for (let len = 3; len <= segLen; len++) {
            for (let start = runStart; start + len <= i; start++) {
              const segment: string[] = [];
              for (let k = start; k < start + len; k++) {
                segment.push(numMap.get(sortedNums[k])!);
              }
              runs.push(segment);
            }
          }
        }
        runStart = i;
      }
    }
  }

  return runs;
}

/**
 * 조커 완전 지원 런 탐색 (v9 신규).
 * - 조커 없음: v8 순수 런 그대로
 * - 조커 1장: 갭 채우기 + 양끝 확장
 * - 순환 방지: maxNum+1 <= 13, minNum-1 >= 1
 */
export function findValidRunsV9(tiles: string[]): string[][] {
  const pureRuns = findPureRuns(tiles);

  const jokers = tiles.filter((t) => t === 'JK1' || t === 'JK2');
  if (jokers.length === 0) return pureRuns;

  const jokerRuns: string[][] = [];
  const byColor = new Map<string, Map<number, string>>();

  for (const code of tiles) {
    const t = parseTile(code);
    if (!t || t.isJoker) continue;
    if (!byColor.has(t.color)) byColor.set(t.color, new Map());
    const numMap = byColor.get(t.color)!;
    if (!numMap.has(t.number)) numMap.set(t.number, code);
  }

  for (const [, numMap] of byColor) {
    const sortedNums = Array.from(numMap.keys()).sort((a, b) => a - b);

    // 갭=1 채우기: [a, JK, b] where b = a+2
    // TODO(v10): 갭>=2 또는 두 분리 세그먼트 다리 (조커 2장 활용)
    if (jokers.length >= 1) {
      for (let i = 0; i < sortedNums.length - 1; i++) {
        if (sortedNums[i + 1] - sortedNums[i] === 2) {
          const run = [numMap.get(sortedNums[i])!, jokers[0], numMap.get(sortedNums[i + 1])!];
          jokerRuns.push(run);
        }
      }
    }

    // 연속 구간에 조커 양끝 확장
    if (jokers.length >= 1) {
      let segStart = 0;
      for (let i = 1; i <= sortedNums.length; i++) {
        const isBreak =
          i === sortedNums.length || sortedNums[i] !== sortedNums[i - 1] + 1;
        if (isBreak) {
          const segNums = sortedNums.slice(segStart, i);
          if (segNums.length >= 2) {
            const segTiles = segNums.map((n) => numMap.get(n)!);
            const minN = segNums[0];
            const maxN = segNums[segNums.length - 1];

            // 왼쪽 확장 (minN-1 >= 1 순환 방지)
            if (minN - 1 >= 1) {
              const run = [jokers[0], ...segTiles];
              if (run.length >= 3) jokerRuns.push(run);
            }
            // 오른쪽 확장 (maxN+1 <= 13 순환 방지)
            if (maxN + 1 <= 13) {
              const run = [...segTiles, jokers[0]];
              if (run.length >= 3) jokerRuns.push(run);
            }
          }
          segStart = i;
        }
      }
    }
  }

  return [...pureRuns, ...jokerRuns];
}

// =============================================================================
// 6) 초기 등록 멜드 탐색 — DFS + 최다 타일 우선 (game-analyst P0 반영)
// =============================================================================

/**
 * 30점 이상 초기 등록 멜드를 찾는다.
 * 단독 세트 -> 다중 세트 DFS (최대 5세트, 500ms 타임아웃).
 * 조건 달성 시 최다 타일 배치 우선, 동률이면 점수 우선.
 */
export function findOptimalInitialMeld(myTiles: string[]): string[][] | null {
  const groups = findValidGroups(myTiles);
  const runs = findValidRunsV9(myTiles);
  const candidates = [...groups, ...runs].sort(
    (a, b) => b.length - a.length || scoreSetWithJoker(b) - scoreSetWithJoker(a),
  );

  if (candidates.length === 0) return null;

  let best: { sets: string[][]; tileCount: number; score: number } | null = null;
  const startTime = Date.now();

  /** 가지치기: 남은 후보의 최대 기대 점수 */
  function estimateMax(fromIdx: number, used: Set<string>): number {
    let total = 0;
    const tmp = new Set(used);
    for (let i = fromIdx; i < candidates.length; i++) {
      if (!candidates[i].some((t) => tmp.has(t))) {
        total += scoreSetWithJoker(candidates[i]);
        candidates[i].forEach((t) => tmp.add(t));
      }
    }
    return total;
  }

  function dfs(
    setIdx: number,
    usedTiles: Set<string>,
    chosen: string[][],
    score: number,
  ): void {
    if (Date.now() - startTime > 500) return; // 500ms 타임아웃

    if (score >= 30) {
      const tileCount = usedTiles.size;
      if (
        !best ||
        tileCount > best.tileCount ||
        (tileCount === best.tileCount && score > best.score)
      ) {
        best = { sets: chosen.map((s) => [...s]), tileCount, score };
      }
    }

    if (chosen.length >= 5) return; // 최대 5세트

    for (let i = setIdx; i < candidates.length; i++) {
      const c = candidates[i];
      if (c.some((t) => usedTiles.has(t))) continue;

      const newScore = score + scoreSetWithJoker(c);
      // 가지치기: 지금까지 0점이면서 최대 기대치도 30 미만이면 skip
      if (chosen.length === 0 && newScore + estimateMax(i + 1, usedTiles) < 30) continue;

      c.forEach((t) => usedTiles.add(t));
      chosen.push(c);
      dfs(i + 1, usedTiles, chosen, newScore);
      chosen.pop();
      c.forEach((t) => usedTiles.delete(t));
    }
  }

  dfs(0, new Set(), [], 0);
  if (best === null) return null;
  return (best as { sets: string[][]; tileCount: number; score: number }).sets;
}

// =============================================================================
// 7) 초기 등록 완료 후 — 랙 전용 신규 세트
// =============================================================================

/**
 * initialMeldDone 상태에서 랙 타일만으로 만들 수 있는 유효 세트를 찾는다.
 * guard(initialMeldDone)는 호출자가 보장 — 이 함수 자체는 순수.
 */
export function findNewRackSets(myTiles: string[]): string[][] {
  const candidates = [
    ...findValidGroups(myTiles),
    ...findValidRunsV9(myTiles),
  ].sort((a, b) => b.length - a.length);

  const chosen: string[][] = [];
  const usedTiles = new Set<string>();

  for (const c of candidates) {
    if (c.some((t) => usedTiles.has(t))) continue;
    chosen.push(c);
    c.forEach((t) => usedTiles.add(t));
    if (chosen.length >= 4) break; // 한 턴 최대 4세트
  }

  return chosen;
}

// =============================================================================
// 8) 다중 테이블 확장
// =============================================================================

export interface MultiExtResult {
  newTableGroups: { tiles: string[] }[];
  tilesFromRack: string[];
}

/**
 * 테이블 그룹 전체를 순회하며 랙 타일로 확장 가능한 모든 그룹을 확장한다.
 * P0: 조커 포함 그룹/런은 보수적 스킵 (game-analyst 권고).
 */
export function findAllExtensions(
  myTiles: string[],
  tableGroups: { tiles: string[] }[],
): MultiExtResult | null {
  const usedTiles = new Set<string>();
  const newGroups = tableGroups.map((g) => ({ tiles: [...g.tiles] }));
  let changed = false;

  for (let gi = 0; gi < tableGroups.length; gi++) {
    const group = tableGroups[gi].tiles;
    const parsed = group.map((t) => parseTile(t)).filter(Boolean) as ParsedTile[];
    const nonJokers = parsed.filter((p) => !p.isJoker);

    // P0: 조커 포함 그룹/런 스킵
    if (parsed.some((p) => p.isJoker)) continue;

    const numbers = new Set(nonJokers.map((p) => p.number));
    const colors = new Set(nonJokers.map((p) => p.color));
    const isGroup = numbers.size === 1 && colors.size === nonJokers.length;
    const isRun = colors.size === 1 && nonJokers.length >= 2;

    if (isGroup && group.length < 4) {
      const num = nonJokers[0].number;
      const missingColors = ['R', 'B', 'Y', 'K'].filter((c) => !colors.has(c));
      let extendedGroup = [...group];
      for (const missingColor of missingColors) {
        if (extendedGroup.length >= 4) break;
        const code = myTiles.find((c) => {
          if (usedTiles.has(c)) return false;
          const t = parseTile(c);
          return t && !t.isJoker && t.number === num && t.color === missingColor;
        });
        if (code) {
          usedTiles.add(code);
          extendedGroup = [...extendedGroup, code];
          changed = true;
        }
      }
      newGroups[gi].tiles = extendedGroup;
    } else if (isRun) {
      const color = nonJokers[0].color;
      const nums = nonJokers.map((p) => p.number);
      let currentGroup = [...group];
      let currentMax = Math.max(...nums);
      let currentMin = Math.min(...nums);

      // 오른쪽 반복 확장 (maxNum+1, +2, ... 까지)
      while (currentMax < 13) {
        const next = myTiles.find((code) => {
          if (usedTiles.has(code)) return false;
          const t = parseTile(code);
          return t && !t.isJoker && t.color === color && t.number === currentMax + 1;
        });
        if (!next) break;
        usedTiles.add(next);
        currentGroup = [...currentGroup, next];
        currentMax++;
        changed = true;
      }

      // 왼쪽 반복 확장 (minNum-1, -2, ... 까지)
      while (currentMin > 1) {
        const prev = myTiles.find((code) => {
          if (usedTiles.has(code)) return false;
          const t = parseTile(code);
          return t && !t.isJoker && t.color === color && t.number === currentMin - 1;
        });
        if (!prev) break;
        usedTiles.add(prev);
        currentGroup = [prev, ...currentGroup];
        currentMin--;
        changed = true;
      }

      newGroups[gi].tiles = currentGroup;
    }
  }

  if (!changed) return null;
  return {
    newTableGroups: newGroups,
    tilesFromRack: Array.from(usedTiles),
  };
}

// =============================================================================
// 9) 런 분할 (P0 V-03 5조건 게이트)
// =============================================================================

export interface SplitResult {
  newTableGroups: { tiles: string[] }[];
  tilesFromRack: string[];
}

/**
 * 6장 이상 런을 분할해 랙 타일 1장을 끝에 붙인다.
 * P0 5조건: 1)조커 없는 런, 2)6장 이상, 3)양쪽 >=3장, 4)V-15 연속, 5)V-03 랙 삽입 가능.
 * P0: 조커 포함 런 분할 v9 미지원 (TODO(v10): joker-aware split).
 */
export function findRunSplits(
  myTiles: string[],
  tableGroups: { tiles: string[] }[],
): SplitResult | null {
  for (let gi = 0; gi < tableGroups.length; gi++) {
    const group = tableGroups[gi].tiles;
    const parsed = group.map((t) => parseTile(t)).filter(Boolean) as ParsedTile[];

    // 1)조커 포함 런 v9 미지원
    if (parsed.some((p) => p.isJoker)) continue;

    const colors = new Set(parsed.map((p) => p.color));
    // 런 판별
    if (colors.size !== 1) continue;
    // 2)6장 미만 스킵
    if (group.length < 6) continue;

    const color = parsed[0].color;
    const nums = parsed.map((p) => p.number).sort((a, b) => a - b);

    for (let splitAt = 3; splitAt <= group.length - 3; splitAt++) {
      const leftNums = nums.slice(0, splitAt);
      const rightNums = nums.slice(splitAt);

      // 3)양쪽 >= 3장
      if (leftNums.length < 3 || rightNums.length < 3) continue;

      // 4)V-15 연속 검증
      const leftContinuous = leftNums.every(
        (n, i) => i === 0 || n === leftNums[i - 1] + 1,
      );
      const rightContinuous = rightNums.every(
        (n, i) => i === 0 || n === rightNums[i - 1] + 1,
      );
      if (!leftContinuous || !rightContinuous) continue;

      const leftMaxNum = leftNums[leftNums.length - 1];
      const rightMinNum = rightNums[0];
      const rightMaxNum = rightNums[rightNums.length - 1];

      // 5)V-03: 랙 타일 삽입 가능성 검증
      let insertTile: string | null = null;
      let attachSide: 'left' | 'right' | null = null;

      for (const code of myTiles) {
        const t = parseTile(code);
        if (!t || t.isJoker || t.color !== color) continue;
        // 왼쪽 런 왼쪽 끝 확장
        if (t.number === leftNums[0] - 1 && leftNums[0] - 1 >= 1) {
          insertTile = code;
          attachSide = 'left';
          break;
        }
        // 오른쪽 런 오른쪽 끝 확장
        if (t.number === rightMaxNum + 1 && rightMaxNum + 1 <= 13) {
          insertTile = code;
          attachSide = 'right';
          break;
        }
        // 왼쪽 런 오른쪽 끝 확장 (분할점 간격이 있을 때)
        if (
          t.number === leftMaxNum + 1 &&
          leftMaxNum + 1 < rightMinNum &&
          leftMaxNum + 1 <= 13
        ) {
          insertTile = code;
          attachSide = 'left';
          break;
        }
        // 오른쪽 런 왼쪽 끝 확장 (분할점 간격이 있을 때)
        if (
          t.number === rightMinNum - 1 &&
          rightMinNum - 1 > leftMaxNum &&
          rightMinNum - 1 >= 1
        ) {
          insertTile = code;
          attachSide = 'right';
          break;
        }
      }

      if (!insertTile || !attachSide) continue; // 5)조건 미충족

      // 분할 실행: 타일 코드 복원
      function getTilesForNums(targetNums: number[]): string[] {
        return targetNums.map((n) => {
          const found = group.find((code) => {
            const t = parseTile(code);
            return t && !t.isJoker && t.color === color && t.number === n;
          });
          return found!;
        });
      }

      const leftTiles = getTilesForNums(leftNums);
      const rightTiles = getTilesForNums(rightNums);

      let finalLeftTiles = leftTiles;
      let finalRightTiles = rightTiles;
      const insertParsed = parseTile(insertTile)!;

      if (attachSide === 'left') {
        if (insertParsed.number < leftNums[0]) {
          finalLeftTiles = [insertTile, ...leftTiles];
        } else {
          finalLeftTiles = [...leftTiles, insertTile];
        }
      } else {
        if (insertParsed.number < rightNums[0]) {
          finalRightTiles = [insertTile, ...rightTiles];
        } else {
          finalRightTiles = [...rightTiles, insertTile];
        }
      }

      // V-06: 원본 타일 모두 보존 검증
      const resultTiles = [...finalLeftTiles, ...finalRightTiles];
      const allOriginalPresent = group.every((t) => resultTiles.includes(t));
      if (!allOriginalPresent) continue;

      const newTableGroups = [
        ...tableGroups.slice(0, gi),
        { tiles: finalLeftTiles },
        { tiles: finalRightTiles },
        ...tableGroups.slice(gi + 1),
      ];

      return { newTableGroups, tilesFromRack: [insertTile] };
    }
  }
  return null;
}

// =============================================================================
// 10) 조커 교체 (그룹 내 조커만, V-06/V-07 검증)
// =============================================================================

export interface JokerExchangeResult {
  newTableGroups: { tiles: string[] }[];
  tilesFromRack: string[];
  jokerReturnedCodes: string[]; // P0 V-06/V-07 필수
}

/**
 * 테이블 그룹의 조커를 랙 타일로 교체하고, 회수한 조커로 새 세트를 만든다.
 * P0: 그룹 내 조커만 처리. 런 내 조커 v9 미지원 (TODO(v10): 런 조커 ADR 필요).
 */
export function findJokerExchange(
  myTiles: string[],
  tableGroups: { tiles: string[] }[],
): JokerExchangeResult | null {
  for (let gi = 0; gi < tableGroups.length; gi++) {
    const group = tableGroups[gi].tiles;
    const jokerInGroup = group.find((t) => t === 'JK1' || t === 'JK2');
    if (!jokerInGroup) continue;

    const nonJokerParsed = group
      .filter((t) => t !== 'JK1' && t !== 'JK2')
      .map((t) => parseTile(t))
      .filter(Boolean) as ParsedTile[];

    const colors = new Set(nonJokerParsed.map((p) => p.color));
    const numbers = new Set(nonJokerParsed.map((p) => p.number));
    const isGroup = numbers.size === 1 && colors.size === nonJokerParsed.length;
    // TODO(v10): 런 내 조커 처리 — ADR 필요
    if (!isGroup) continue;

    const num = nonJokerParsed[0].number;
    const missingColors = ['R', 'B', 'Y', 'K'].filter((c) => !colors.has(c));

    for (const missingColor of missingColors) {
      const replaceTile = myTiles.find((code) => {
        const t = parseTile(code);
        return t && !t.isJoker && t.color === missingColor && t.number === num;
      });
      if (!replaceTile) continue;

      // V-07: 회수한 조커로 새 세트 만들기 가능해야 교체 허용
      const remainingRack = myTiles.filter((t) => t !== replaceTile);
      const jokerSet = tryMakeSetWithJoker(jokerInGroup, remainingRack);
      if (!jokerSet) continue;

      // 교체 실행
      const newGroupTiles = group.map((t) => (t === jokerInGroup ? replaceTile : t));
      const jokerSetRackTiles = jokerSet.filter((t) => t !== jokerInGroup);

      const newTableGroups = [
        ...tableGroups.map((g, i) => (i === gi ? { tiles: newGroupTiles } : g)),
        { tiles: jokerSet },
      ];

      return {
        newTableGroups,
        tilesFromRack: [replaceTile, ...jokerSetRackTiles],
        jokerReturnedCodes: [jokerInGroup], // P0 V-06/V-07
      };
    }
  }
  return null;
}

function tryMakeSetWithJoker(joker: string, rack: string[]): string[] | null {
  const withJoker = [...rack, joker];
  const groups = findValidGroups(withJoker).filter((s) => s.includes(joker));
  const runs = findValidRunsV9(withJoker).filter((s) => s.includes(joker));
  return [...groups, ...runs][0] ?? null;
}

// =============================================================================
// 11) 초기 등록 완료 후 최적 이동 결정 (5전략 조합)
// =============================================================================

interface PostMeldMove {
  tableGroups: { tiles: string[] }[];
  tilesFromRack: string[];
  reasoning: string;
}

/**
 * 초기 등록 완료 후 최적 이동을 결정한다.
 * 전략 우선순위: 최다 타일 배치 우선.
 * 종반(drawPile=0 또는 상대 <=3장): 런 분할 + 조커 교체 전략 추가.
 */
export function findOptimalPostMeldMove(
  myTiles: string[],
  tableGroups: { tiles: string[] }[],
  gameState: V9GameState,
): PostMeldMove | null {
  const isEndgame =
    gameState.drawPileCount === 0 ||
    gameState.opponents.some((o) => o.remainingTiles <= 3);

  const candidates: Array<{ move: PostMeldMove; tilesPlaced: number }> = [];

  // 전략 1: 랙 전용 신규 세트
  const newSets = findNewRackSets(myTiles);
  if (newSets.length > 0) {
    const tilesFromRack = newSets.flat();
    candidates.push({
      tilesPlaced: tilesFromRack.length,
      move: {
        tableGroups: [...tableGroups, ...newSets.map((tiles) => ({ tiles }))],
        tilesFromRack,
        reasoning: `New rack sets: ${newSets.length} sets, ${tilesFromRack.length} tiles`,
      },
    });
  }

  // 전략 2: 테이블 다중 확장
  const ext = findAllExtensions(myTiles, tableGroups);
  if (ext) {
    candidates.push({
      tilesPlaced: ext.tilesFromRack.length,
      move: {
        tableGroups: ext.newTableGroups,
        tilesFromRack: ext.tilesFromRack,
        reasoning: `Multi-extend: ${ext.tilesFromRack.length} tiles added`,
      },
    });
  }

  // 전략 3: 전략 1 + 2 조합 (타일 중복 없을 때)
  if (newSets.length > 0 && ext) {
    const newSetTiles = new Set(newSets.flat());
    if (!ext.tilesFromRack.some((t) => newSetTiles.has(t))) {
      const combined: PostMeldMove = {
        tableGroups: [...ext.newTableGroups, ...newSets.map((tiles) => ({ tiles }))],
        tilesFromRack: [...ext.tilesFromRack, ...newSets.flat()],
        reasoning: `Combined: sets + extensions, ${ext.tilesFromRack.length + newSets.flat().length} tiles`,
      };
      candidates.push({ tilesPlaced: combined.tilesFromRack.length, move: combined });
    }
  }

  // 전략 4: 런 분할 (종반 또는 배치 불가 시)
  if (isEndgame || candidates.length === 0) {
    const split = findRunSplits(myTiles, tableGroups);
    if (split) {
      candidates.push({
        tilesPlaced: split.tilesFromRack.length,
        move: {
          tableGroups: split.newTableGroups,
          tilesFromRack: split.tilesFromRack,
          reasoning: `Run split: ${split.tilesFromRack.length} tiles`,
        },
      });
    }
  }

  // 전략 5: 조커 교체 (종반에만)
  if (isEndgame) {
    const jokerEx = findJokerExchange(myTiles, tableGroups);
    if (jokerEx) {
      candidates.push({
        tilesPlaced: jokerEx.tilesFromRack.length,
        move: {
          tableGroups: jokerEx.newTableGroups,
          tilesFromRack: jokerEx.tilesFromRack,
          reasoning: `Joker exchange: ${jokerEx.tilesFromRack.length} tiles`,
        },
      });
    }
  }

  if (candidates.length === 0) return null;

  // 최다 타일 배치 선택
  return candidates.sort((a, b) => b.tilesPlaced - a.tilesPlaced)[0].move;
}

// =============================================================================
// 12) System Prompt (v8 동일)
// =============================================================================

export const V9_OLLAMA_PLACE_SYSTEM_PROMPT = `You are a Rummikub move formatter. YOUR MOVE HAS BEEN CALCULATED FOR YOU. Just output the JSON shown to you.

# OUTPUT RULES
- Output ONLY a single JSON object. No prose, no markdown, no explanation.
- Do not invent moves. Copy the exact JSON the user message tells you to output.

# JSON FORMATS

Place:
{"action":"place","tableGroups":[{"tiles":["R10a","B10a","K10a"]}],"tilesFromRack":["R10a","B10a","K10a"],"reasoning":"<short>"}

Draw:
{"action":"draw","reasoning":"<short>"}

Output raw JSON only. No markdown fences, no comments, no extra text.`;

// =============================================================================
// 13) GameState 타입 (v8 V8GameState와 동일, 이름만 변경)
// =============================================================================

export type V9GameState = {
  tableGroups: { tiles: string[] }[];
  myTiles: string[];
  turnNumber: number;
  drawPileCount: number;
  initialMeldDone: boolean;
  opponents: { playerId: string; remainingTiles: number }[];
};

// =============================================================================
// 14) User Prompt Builder
// =============================================================================

/**
 * v9 사전 계산 user prompt.
 * initialMeldDone guard: 호출자(variant)가 gameState.initialMeldDone 확인 후 라우팅.
 */
export function buildV9OllamaPlaceUserPrompt(gameState: V9GameState): string {
  const lines: string[] = [];
  lines.push('MOVE CALCULATION COMPLETE:');
  lines.push(`Your rack: [${gameState.myTiles.join(', ')}]`);

  if (!gameState.initialMeldDone) {
    // 초기 등록 미완: findOptimalInitialMeld 사용
    const meld = findOptimalInitialMeld(gameState.myTiles);
    if (meld) {
      const totalScore = meld.reduce((sum, set) => sum + scoreSetWithJoker(set), 0);
      const tilesFromRack = meld.flat();
      const placeJson = JSON.stringify({
        action: 'place',
        tableGroups: [...gameState.tableGroups, ...meld.map((tiles) => ({ tiles }))],
        tilesFromRack,
        reasoning: `Initial meld: ${meld.length} sets, ${tilesFromRack.length} tiles, ${totalScore} pts`,
      });
      lines.push(`Valid initial meld (${totalScore} pts, ${tilesFromRack.length} tiles)`);
      lines.push('');
      lines.push('Output this JSON exactly:');
      lines.push(placeJson);
      return lines.join('\n');
    }

    lines.push('No valid initial meld found.');
    lines.push('');
    lines.push('Output this JSON exactly:');
    lines.push(
      JSON.stringify({
        action: 'draw',
        reasoning: 'no valid meld for initial meld (30+ pts required)',
      }),
    );
    return lines.join('\n');
  }

  // 초기 등록 완료: findOptimalPostMeldMove 사용
  const move = findOptimalPostMeldMove(gameState.myTiles, gameState.tableGroups, gameState);
  if (move) {
    const placeJson = JSON.stringify({
      action: 'place',
      tableGroups: move.tableGroups,
      tilesFromRack: move.tilesFromRack,
      reasoning: move.reasoning,
    });
    lines.push(`Post-meld move: ${move.reasoning}`);
    lines.push('');
    lines.push('Output this JSON exactly:');
    lines.push(placeJson);
    return lines.join('\n');
  }

  lines.push('No placement possible.');
  lines.push('');
  lines.push('Output this JSON exactly:');
  lines.push(
    JSON.stringify({
      action: 'draw',
      reasoning: 'no rack tile can extend table or form new sets',
    }),
  );
  return lines.join('\n');
}

// =============================================================================
// 15) Retry Prompt (v8 패턴 그대로, 함수명만 변경)
// =============================================================================

export function buildV9OllamaPlaceRetryPrompt(
  gameState: V9GameState,
  errorReason: string,
  attemptNumber: number,
): string {
  const basePrompt = buildV9OllamaPlaceUserPrompt(gameState);
  return (
    basePrompt +
    `\n\n# RETRY ${attemptNumber + 1}\n` +
    `Previous error: ${errorReason}\n` +
    `Copy the JSON above exactly. Do not modify it. Do not add any text.\n` +
    `If the JSON above is wrong somehow, output {"action":"draw","reasoning":"retry fallback"}.`
  );
}
