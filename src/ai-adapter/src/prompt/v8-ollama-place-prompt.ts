/**
 * V8 Ollama Place Pre-computed Prompt — qwen2.5:3b 전용.
 *
 * 배경 (Sprint 7+ hotfix):
 *   v7 (`v7-ollama-meld-prompt.ts`) 는 4-STEP 절차를 모델에게 직접 추론하도록
 *   요청했으나, qwen2.5:3b (3B 파라미터) 는 14 ~ 20 장의 랙 타일에서 30점 이상
 *   유효 세트를 찾는 조합 추론을 안정적으로 수행하지 못해 결국 항상 DRAW 를
 *   선택했다 (place rate 0%).
 *
 * 새 전략:
 *   "프롬프트 빌더(TypeScript) 가 유효한 멜드를 사전 계산해서 모델에게
 *    직접 알려준다. 모델은 계산하지 않고 이미 정해진 답을 JSON 으로 포맷팅만 한다."
 *
 *   - findValidGroups / findValidRuns 로 후보 세트 전수 열거
 *   - findMeldFor30 으로 30점 이상 조합을 1~3개 단위까지 탐색
 *   - 발견되면 user prompt 에 "Output this JSON exactly: {...}" 로 박제
 *   - 발견되지 않으면 user prompt 가 직접 DRAW JSON 박제
 *
 * 모델 입장:
 *   - 추론 부담 0 — 그저 system prompt 의 포맷 규칙대로 user prompt 에 박힌
 *     JSON 을 그대로 echo
 *   - 200 토큰 이내 system prompt 로 포맷 집중도 극대화
 *
 * 핵심 비영향:
 *   - per-model override 동작 규칙은 변경되지 않음
 *     (OLLAMA_PROMPT_VARIANT=v8-ollama-place 로 명시 opt-in 시에만 사용)
 *   - GPT / Claude / DeepSeek 어댑터 / Engine 검증 / 게임룰 변동 없음
 *   - recommendedModels=['ollama'] — 다른 모델 적용 시 warn
 *
 * 설계 문서: docs/02-design/42-prompt-variant-standard.md §3 표 A (v8 행 추가 예정)
 */

// =============================================================================
// 1) 타일 파서
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
 * - 잘못된 형식: null 반환 (호출자가 무시)
 */
export function parseTile(code: string): ParsedTile | null {
  if (!code || typeof code !== 'string') return null;

  if (code === 'JK1' || code === 'JK2') {
    return { color: '*', number: 0, isJoker: true };
  }

  // {Color}{Number}{Set} 형식. Set 은 a/b 뿐이므로 마지막 1글자.
  const m = code.match(/^([RBYK])(\d{1,2})([ab])$/);
  if (!m) return null;

  const color = m[1];
  const number = parseInt(m[2], 10);
  if (!VALID_COLORS.has(color)) return null;
  if (number < 1 || number > 13) return null;

  return { color, number, isJoker: false };
}

// =============================================================================
// 2) 점수 계산
// =============================================================================

/**
 * 세트 점수 = 각 타일의 숫자 합. 조커는 30점.
 * (실제 게임 룰: 조커는 대체하는 타일 점수. 여기서는 단순화 — 30점 가정.
 *  서버가 검증하므로 잘못된 추정은 재시도/드로우로 폴백된다.)
 */
export function scoreSet(tiles: string[]): number {
  let total = 0;
  for (const code of tiles) {
    const t = parseTile(code);
    if (!t) continue;
    if (t.isJoker) {
      total += 30;
    } else {
      total += t.number;
    }
  }
  return total;
}

// =============================================================================
// 3) 유효 그룹 탐색
//   - 같은 숫자, 서로 다른 색상, 3 ~ 4 장
//   - 색상 중복 불가 (예: R7a, R7b → 같은 R 색상 → 무효)
//   - Set 첨자(a/b) 차이는 의미 없으나 동일 색상이면 둘 중 하나만 사용
//   - 조커는 와일드카드로 한 장당 한 색상을 대체. 단순화: 조커는 빈 색상 슬롯 채움.
// =============================================================================

export function findValidGroups(tiles: string[]): string[][] {
  const groups: string[][] = [];

  // 숫자별 → 색상별 → 첫 타일 코드만 저장 (R7a, R7b 동시 보유여도 그룹용 1장만 사용)
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

    // 3장 그룹 (조커 0~1)
    if (distinctColors >= 3) {
      // 모든 3-조합 (서로 다른 색상)
      for (let i = 0; i < colorTiles.length; i++) {
        for (let j = i + 1; j < colorTiles.length; j++) {
          for (let k = j + 1; k < colorTiles.length; k++) {
            groups.push([colorTiles[i], colorTiles[j], colorTiles[k]]);
          }
        }
      }
    } else if (distinctColors === 2 && usableJokers >= 1) {
      // 2색 + 조커 1
      groups.push([colorTiles[0], colorTiles[1], jokers[0]]);
    } else if (distinctColors === 1 && usableJokers >= 2) {
      // 1색 + 조커 2 (소형 모델용 단순화)
      groups.push([colorTiles[0], jokers[0], jokers[1]]);
    }

    // 4장 그룹 (4가지 색상 모두 보유 시)
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
// 4) 유효 런 탐색
//   - 같은 색상, 연속 숫자, 3 장 이상
//   - 13 → 1 wrap-around 금지
//   - 조커 보조는 단순화: 한 장의 갭을 메우는 형태만 부분 지원 (3B 모델 한계)
// =============================================================================

export function findValidRuns(tiles: string[]): string[][] {
  const runs: string[][] = [];
  const byColor = new Map<string, Map<number, string>>();

  for (const code of tiles) {
    const t = parseTile(code);
    if (!t || t.isJoker) continue;
    if (!byColor.has(t.color)) {
      byColor.set(t.color, new Map<number, string>());
    }
    const numMap = byColor.get(t.color)!;
    // 같은 색상, 같은 숫자가 두 장이면 한 장만 런에 사용 (a 우선)
    if (!numMap.has(t.number)) {
      numMap.set(t.number, code);
    }
  }

  for (const [, numMap] of byColor) {
    const sortedNums = Array.from(numMap.keys()).sort((a, b) => a - b);
    if (sortedNums.length < 3) continue;

    // 연속 구간을 모두 추출
    let runStart = 0;
    for (let i = 1; i <= sortedNums.length; i++) {
      const isBreak =
        i === sortedNums.length || sortedNums[i] !== sortedNums[i - 1] + 1;
      if (isBreak) {
        const segLen = i - runStart;
        if (segLen >= 3) {
          // segLen >= 3 인 모든 부분 런(3장 이상)을 후보로 추가
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

// =============================================================================
// 5) 30점 이상 멜드 찾기 (핵심 알고리즘)
// =============================================================================

/**
 * 랙 타일에서 30점 이상 초기 등록 멜드를 찾는다.
 *
 * 단계:
 *   1) 모든 유효 그룹 + 모든 유효 런을 수집한다.
 *   2) 단독 30+ 점 세트가 있으면 그 중 점수 최고 / 타일 적은 1개를 반환.
 *   3) 없으면 2개 조합을 시도 (타일 중복 없이 합 30+).
 *   4) 없으면 3개 조합을 시도.
 *   5) 모두 없으면 null.
 *
 * 반환: 그룹 배열 (예: [["R10a","B10a","K10a"]] 또는 [["R7a","B7a","K7a"],["B3a","B4a","B5a"]])
 *       3B 모델이 그대로 JSON 에 박을 수 있는 형태.
 */
export function findMeldFor30(tiles: string[]): string[][] | null {
  const groups = findValidGroups(tiles);
  const runs = findValidRuns(tiles);
  const candidates: string[][] = [...groups, ...runs];

  if (candidates.length === 0) return null;

  // 1) 단독 30+
  let best: { sets: string[][]; score: number; tileCount: number } | null = null;
  for (const c of candidates) {
    const s = scoreSet(c);
    if (s >= 30) {
      const cand = { sets: [c], score: s, tileCount: c.length };
      if (
        !best ||
        cand.tileCount < best.tileCount ||
        (cand.tileCount === best.tileCount && cand.score > best.score)
      ) {
        best = cand;
      }
    }
  }
  if (best) return best.sets;

  // 2) 2개 조합
  for (let i = 0; i < candidates.length; i++) {
    for (let j = i + 1; j < candidates.length; j++) {
      const a = candidates[i];
      const b = candidates[j];
      if (hasOverlap(a, b)) continue;
      const total = scoreSet(a) + scoreSet(b);
      if (total >= 30) return [a, b];
    }
  }

  // 3) 3개 조합
  for (let i = 0; i < candidates.length; i++) {
    for (let j = i + 1; j < candidates.length; j++) {
      if (hasOverlap(candidates[i], candidates[j])) continue;
      for (let k = j + 1; k < candidates.length; k++) {
        if (hasOverlap(candidates[i], candidates[k])) continue;
        if (hasOverlap(candidates[j], candidates[k])) continue;
        const total =
          scoreSet(candidates[i]) +
          scoreSet(candidates[j]) +
          scoreSet(candidates[k]);
        if (total >= 30) return [candidates[i], candidates[j], candidates[k]];
      }
    }
  }

  return null;
}

function hasOverlap(a: string[], b: string[]): boolean {
  const set = new Set(a);
  for (const t of b) {
    if (set.has(t)) return true;
  }
  return false;
}

// =============================================================================
// 6) 초기 등록 완료 후 — 테이블 그룹 확장 후보 탐색
// =============================================================================

/**
 * 테이블 그룹의 끝에 붙일 수 있는 단일 타일을 랙에서 찾는다.
 *   - 런(같은 색상 연속): 양 끝에 +1 / -1 인 같은 색상 타일 매칭
 *   - 그룹(같은 숫자 다른 색상): 빠진 색상 매칭, 단 4장 미만일 때
 *
 * 반환:
 *   - { groupIdx, tile, extendedTiles } : 확장 가능 시
 *   - null : 확장 가능한 타일 없음
 *
 * 단순화: 첫 번째 발견된 확장만 반환 (소형 모델 부담 최소)
 */
export interface ExtensionMove {
  groupIdx: number;
  tile: string;
  extendedTiles: string[]; // 원본 그룹 + 추가 타일 (정렬됨)
}

export function findTableExtension(
  tableGroups: { tiles: string[] }[],
  rack: string[],
): ExtensionMove | null {
  for (let gi = 0; gi < tableGroups.length; gi++) {
    const group = tableGroups[gi].tiles;
    const parsed = group
      .map((t) => parseTile(t))
      .filter((t): t is ParsedTile => t !== null);

    // 그룹(같은 숫자, 다른 색상) 판정
    const numbers = new Set(parsed.filter((p) => !p.isJoker).map((p) => p.number));
    const colors = new Set(parsed.filter((p) => !p.isJoker).map((p) => p.color));

    const isGroup = numbers.size === 1 && colors.size === parsed.filter((p) => !p.isJoker).length;
    const isRun = colors.size === 1 && parsed.filter((p) => !p.isJoker).length >= 2;

    if (isGroup && group.length < 4) {
      // 빠진 색상의 같은 숫자 타일을 랙에서 찾는다
      const num = parsed.find((p) => !p.isJoker)!.number;
      const missingColors = ['R', 'B', 'Y', 'K'].filter((c) => !colors.has(c));
      for (const code of rack) {
        const t = parseTile(code);
        if (!t || t.isJoker) continue;
        if (t.number === num && missingColors.includes(t.color)) {
          return {
            groupIdx: gi,
            tile: code,
            extendedTiles: [...group, code],
          };
        }
      }
    } else if (isRun) {
      const color = parsed.find((p) => !p.isJoker)!.color;
      const nums = parsed.filter((p) => !p.isJoker).map((p) => p.number);
      const minNum = Math.min(...nums);
      const maxNum = Math.max(...nums);

      for (const code of rack) {
        const t = parseTile(code);
        if (!t || t.isJoker) continue;
        if (t.color !== color) continue;
        if (t.number === maxNum + 1 && maxNum + 1 <= 13) {
          return {
            groupIdx: gi,
            tile: code,
            extendedTiles: [...group, code],
          };
        }
        if (t.number === minNum - 1 && minNum - 1 >= 1) {
          return {
            groupIdx: gi,
            tile: code,
            extendedTiles: [code, ...group],
          };
        }
      }
    }
  }
  return null;
}

// =============================================================================
// 7) System Prompt — 매우 짧게, 포맷 집중
// =============================================================================

export const V8_OLLAMA_PLACE_SYSTEM_PROMPT = `You are a Rummikub move formatter. YOUR MOVE HAS BEEN CALCULATED FOR YOU. Just output the JSON shown to you.

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
// 8) User Prompt Builder — 사전 계산 결과를 박제
// =============================================================================

export interface V8GameState {
  tableGroups: { tiles: string[] }[];
  myTiles: string[];
  turnNumber: number;
  drawPileCount: number;
  initialMeldDone: boolean;
  opponents: { playerId: string; remainingTiles: number }[];
}

/**
 * 사전 계산된 멜드 정보를 user prompt 에 박는다.
 *
 * 모델에게는 두 가지 case 만 보여준다:
 *   A) PLACE 가 가능 — "Output this JSON exactly: {...}"
 *   B) DRAW — "Output this JSON exactly: {...}"
 *
 * 양쪽 모두 모델은 추론 없이 "복사" 만 하면 된다.
 */
export function buildV8OllamaPlaceUserPrompt(gameState: V8GameState): string {
  const lines: string[] = [];
  lines.push('MOVE CALCULATION COMPLETE:');
  lines.push(`Your rack: [${gameState.myTiles.join(', ')}]`);

  if (!gameState.initialMeldDone) {
    // Case 1/2 — 초기 등록 미완
    const meld = findMeldFor30(gameState.myTiles);
    if (meld) {
      const totalScore = meld.reduce((sum, set) => sum + scoreSet(set), 0);
      const tilesFromRack = meld.flat();
      const description = describeMeld(meld);
      const reasoning = `${description} (${totalScore} pts) for initial meld`;

      const placeJson = JSON.stringify({
        action: 'place',
        tableGroups: meld.map((tiles) => ({ tiles })),
        tilesFromRack,
        reasoning,
      });

      lines.push(`Valid meld found (${totalScore} pts): ${description}`);
      lines.push('');
      lines.push('Output this JSON exactly:');
      lines.push(placeJson);
      return lines.join('\n');
    }

    // 멜드 없음 → DRAW 박제
    const drawJson = JSON.stringify({
      action: 'draw',
      reasoning: 'no valid meld for initial meld (30+ pts required)',
    });
    lines.push('No valid meld found (best < 30 pts).');
    lines.push('');
    lines.push('Output this JSON exactly:');
    lines.push(drawJson);
    return lines.join('\n');
  }

  // Case 3 — 초기 등록 완료. 테이블 확장 시도.
  lines.push('You have placed your initial meld. Try to extend table groups.');

  if (gameState.tableGroups.length === 0) {
    const drawJson = JSON.stringify({
      action: 'draw',
      reasoning: 'table is empty, nothing to extend',
    });
    lines.push('Table is empty.');
    lines.push('');
    lines.push('Output this JSON exactly:');
    lines.push(drawJson);
    return lines.join('\n');
  }

  const ext = findTableExtension(gameState.tableGroups, gameState.myTiles);
  if (ext) {
    // 확장한 그룹 + 변경되지 않은 다른 그룹들을 모두 포함
    const newGroups = gameState.tableGroups.map((g, i) =>
      i === ext.groupIdx ? { tiles: ext.extendedTiles } : g,
    );
    const placeJson = JSON.stringify({
      action: 'place',
      tableGroups: newGroups,
      tilesFromRack: [ext.tile],
      reasoning: `Extend table group ${ext.groupIdx + 1} with ${ext.tile}`,
    });
    lines.push(
      `Extension found: add ${ext.tile} to group ${ext.groupIdx + 1} = [${ext.extendedTiles.join(', ')}]`,
    );
    lines.push('');
    lines.push('Output this JSON exactly:');
    lines.push(placeJson);
    return lines.join('\n');
  }

  // 확장 불가 → DRAW
  const drawJson = JSON.stringify({
    action: 'draw',
    reasoning: 'no rack tile can extend any table group',
  });
  lines.push('No rack tile extends any existing table group.');
  lines.push('');
  lines.push('Output this JSON exactly:');
  lines.push(drawJson);
  return lines.join('\n');
}

/** 사람이 읽는 간단한 멜드 설명 — reasoning 필드용 */
function describeMeld(meld: string[][]): string {
  const parts = meld.map((set) => {
    if (set.length === 0) return '';
    const sample = parseTile(set[0]);
    if (!sample) return `Set [${set.join(',')}]`;
    // 색상이 모두 같으면 Run, 숫자가 모두 같으면 Group
    const parsed = set
      .map((t) => parseTile(t))
      .filter((p): p is ParsedTile => p !== null && !p.isJoker);
    if (parsed.length === 0) return `Set [${set.join(',')}]`;
    const sameColor = parsed.every((p) => p.color === parsed[0].color);
    const sameNumber = parsed.every((p) => p.number === parsed[0].number);
    if (sameNumber) return `Group of ${parsed[0].number}s`;
    if (sameColor) {
      const nums = parsed.map((p) => p.number).sort((a, b) => a - b);
      return `${parsed[0].color} run ${nums[0]}-${nums[nums.length - 1]}`;
    }
    return `Set [${set.join(',')}]`;
  });
  return parts.join(' + ');
}

// =============================================================================
// 9) Retry Prompt
// =============================================================================

/**
 * 재시도. 소형 모델이 사전 계산된 JSON 을 그대로 echo 하지 못한 경우.
 * 한 줄 지시 + 원본 user prompt 재첨부.
 */
export function buildV8OllamaPlaceRetryPrompt(
  gameState: V8GameState,
  errorReason: string,
  attemptNumber: number,
): string {
  const basePrompt = buildV8OllamaPlaceUserPrompt(gameState);
  return (
    basePrompt +
    `\n\n# RETRY ${attemptNumber + 1}\n` +
    `Previous error: ${errorReason}\n` +
    `Copy the JSON above exactly. Do not modify it. Do not add any text.\n` +
    `If the JSON above is wrong somehow, output {"action":"draw","reasoning":"retry fallback"}.`
  );
}
