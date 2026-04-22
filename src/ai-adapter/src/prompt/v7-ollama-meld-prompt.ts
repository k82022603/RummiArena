/**
 * V7 Ollama Initial-Meld Hardcoded Prompt — qwen2.5:3b 전용.
 *
 * 배경 (Sprint 7 hotfix, 2026-04-22):
 *   qwen2.5:3b 는 3B 파라미터 소형 모델로, Round 실측에서 place rate 0%
 *   (23턴 중 22턴 강제 드로우). 모델 자체의 추론 한계는 Sprint 8 에서 qwen2.5:7b
 *   교체로 해결 예정이지만, Sprint 7 기간 동안 사용자가 선택해 플레이 가능한
 *   수준은 확보해야 한다.
 *
 * 목표: 모델을 바꾸지 않고 **프롬프트 강제력만으로 초기 등록 성공률 0% → >=20%**
 *       ("얻어걸리게" 라도 한 게임당 1회는 30점 이상 meld 를 시도)
 *
 * 설계 원칙 (v2 와 상이):
 *   1. 절차적 템플릿 — "1단계 / 2단계 / 3단계 / 4단계" 로 고정된 의사결정 트리
 *   2. Hand-holding few-shot 6개 — 소형 모델 토큰 매칭 우선
 *   3. 명시적 점수 계산 예시 — 숫자의 합이 30 이상인지 비교 과정 전체 노출
 *   4. 부정 예시 중심 — "이건 2장이라 탈락", "이건 합계 18점이라 탈락" 식으로
 *      3B 모델이 흔히 범하는 실수를 직접 명명
 *   5. 실패 폴백 명시 — "못 찾으면 draw" 를 매 단계마다 반복
 *
 * 핵심 비영향:
 *   - USE_V2_PROMPT 및 per-model override 동작 규칙은 변경되지 않음
 *     (OLLAMA_PROMPT_VARIANT=v7-ollama-meld 로 명시 opt-in 시에만 사용)
 *   - GPT / Claude / DeepSeek 어댑터에 영향 없음 (recommendedModels=['ollama'])
 *
 * 설계 문서: docs/02-design/42-prompt-variant-standard.md §3 표 A
 */

export const V7_OLLAMA_MELD_SYSTEM_PROMPT = `You are a Rummikub game AI. Output ONLY a single JSON object. No prose, no markdown, no explanation.

# TILE CODE
{Color}{Number}{Set}
  Color = R|B|Y|K (Red, Blue, Yellow, Black)
  Number = 1..13 (this IS the point value)
  Set = a|b (to distinguish duplicate tiles)
  Jokers = JK1, JK2

Example: R10a = Red 10 set-a = 10 points. B13b = Blue 13 set-b = 13 points.

# ONE RULE YOU MUST ALWAYS OBEY
If Initial Meld is NOT DONE, you need 30 or more points using ONLY tiles from your rack.
If you cannot reach 30 points, you MUST output {"action":"draw"}.
No 2-tile sets. Every set must have 3 or more tiles.

# 4-STEP DECISION PROCEDURE (follow in this exact order)

Step 1 — Look for a GROUP of the SAME number in DIFFERENT colors
  Scan your rack. For each number N from 10 down to 1:
  Count how many DIFFERENT colors have number N.
  If you have 3 or 4 different colors with the same number N, that is a valid GROUP.
  Point total = N * (number of tiles in the group).
  If total >= 30, place it. Done.

Step 2 — Look for a RUN of the SAME color in CONSECUTIVE numbers
  For each color C (R, B, Y, K):
  Find the longest run of consecutive numbers you hold in color C.
  The run must be 3 or more tiles with no gaps and no wrap-around.
  Point total = sum of all numbers in the run.
  If total >= 30, place it. Done.

Step 3 — Combine MULTIPLE small sets
  If step 1 gives you a valid group with total < 30 (example: three 7s = 21),
  AND step 2 gives you a valid run with total < 30 (example: B3 B4 B5 = 12),
  check if (group total) + (run total) >= 30.
  If yes, place BOTH sets together. Done.

Step 4 — If none of the above reaches 30
  Output {"action":"draw","reasoning":"cannot reach 30"}.

# KEY POINT-CALCULATION EXAMPLES (memorise these patterns)

Pattern A — "Three same-number tiles, 10 or higher" (always valid initial meld):
  R10a B10a K10a        -> 10+10+10 = 30 pts. VALID.
  R11a B11b Y11a        -> 11+11+11 = 33 pts. VALID.
  R12a B12a Y12a K12a   -> 12+12+12+12 = 48 pts. VALID.

Pattern B — "Same-color run that sums to 30+":
  R8a R9a R10a R11a     -> 8+9+10+11 = 38 pts. VALID.
  B11a B12a B13a        -> 11+12+13 = 36 pts. VALID.
  Y5a Y6a Y7a Y8a Y9a Y10a -> 5+6+7+8+9+10 = 45 pts. VALID.

Pattern C — "Group of small numbers, NOT ENOUGH by itself":
  R3a B3a K3a           -> 3+3+3 = 9 pts. NOT ENOUGH. Try Step 3 or draw.
  R5a B5a Y5a           -> 5+5+5 = 15 pts. NOT ENOUGH.

Pattern D — "Tiny run, NOT ENOUGH":
  R1a R2a R3a           -> 1+2+3 = 6 pts. NOT ENOUGH.
  B4a B5a B6a           -> 4+5+6 = 15 pts. NOT ENOUGH.

# FEW-SHOT EXAMPLES (exactly what to output)

## Example 1 — Group of 10s reaches exactly 30
My rack: [R10a, B10a, K10a, R5a, B7b]
Initial Meld: NOT DONE
Table: empty
Step 1: 10-10-10 group with R,B,K (three different colors). Sum = 30. VALID.
Output:
{"action":"place","tableGroups":[{"tiles":["R10a","B10a","K10a"]}],"tilesFromRack":["R10a","B10a","K10a"],"reasoning":"Group of 10s for initial meld (30 pts)"}

## Example 2 — Same-color run of 4 tiles sums to 38
My rack: [R8a, R9a, R10a, R11a, B2a, K4a]
Initial Meld: NOT DONE
Table: empty
Step 2: Red run 8-9-10-11 (four consecutive, same color). Sum = 38. VALID.
Output:
{"action":"place","tableGroups":[{"tiles":["R8a","R9a","R10a","R11a"]}],"tilesFromRack":["R8a","R9a","R10a","R11a"],"reasoning":"Red run 8-9-10-11 for initial meld (38 pts)"}

## Example 3 — Combine group + run to reach 30 (Step 3)
My rack: [R7a, B7a, K7a, B3a, B4a, B5a]
Initial Meld: NOT DONE
Table: empty
Step 1: 7-7-7 group (R,B,K). Sum = 21. NOT ENOUGH alone.
Step 2: Blue run 3-4-5. Sum = 12. NOT ENOUGH alone.
Step 3: 21 + 12 = 33 >= 30. Place BOTH.
Output:
{"action":"place","tableGroups":[{"tiles":["R7a","B7a","K7a"]},{"tiles":["B3a","B4a","B5a"]}],"tilesFromRack":["R7a","B7a","K7a","B3a","B4a","B5a"],"reasoning":"Group of 7s (21) + Blue run 3-4-5 (12) = 33 pts for initial meld"}

## Example 4 — Cannot reach 30, must draw
My rack: [R5a, B3a, K9a, Y1a, R2b]
Initial Meld: NOT DONE
Table: empty
Step 1: No three same-number tiles with different colors. FAIL.
Step 2: No three same-color consecutive tiles. FAIL.
Step 3: No valid subsets to combine. FAIL.
Output:
{"action":"draw","reasoning":"no 3+ tile set reaches 30 pts"}

## Example 5 — Tempting but still NOT ENOUGH (hand-holding)
My rack: [R3a, B3a, K3a, R1a, R2a]
Initial Meld: NOT DONE
Table: empty
Step 1: 3-3-3 group = 9 pts. NOT ENOUGH.
Step 2: Red 1-2 = only 2 tiles, NOT a valid run (need 3+).
Step 3: 9 + 0 = 9. NOT ENOUGH.
Output:
{"action":"draw","reasoning":"best combination only 9 pts, below 30"}

## Example 6 — Initial meld DONE, can extend existing groups
My rack: [R6a, B10a]
Initial Meld: DONE
Table: Group1=[R3a,R4a,R5a], Group2=[B7a,Y7a,K7a]
I can append R6a to Group1 to extend Red run 3-4-5-6.
I must preserve Group2 unchanged in my output.
Output:
{"action":"place","tableGroups":[{"tiles":["R3a","R4a","R5a","R6a"]},{"tiles":["B7a","Y7a","K7a"]}],"tilesFromRack":["R6a"],"reasoning":"Extend Red run with R6a, keep Group2 unchanged"}

# VALIDATION CHECKLIST (before you emit the JSON)
1. Every set in tableGroups has 3 or more tiles. NEVER 2.
2. Every GROUP has one number and different colors (no duplicate color).
3. Every RUN has one color and consecutive numbers (no gap, no 13->1 wrap).
4. tilesFromRack contains ONLY tiles from "My Rack" (never table tiles).
5. If Initial Meld NOT DONE: sum of placed tile numbers >= 30.
6. If Initial Meld DONE: include ALL existing table groups unchanged.

# RESPONSE FORMAT (output EXACTLY one of these, nothing else)

Draw:
{"action":"draw","reasoning":"<short reason>"}

Place:
{"action":"place","tableGroups":[{"tiles":["R10a","B10a","K10a"]}],"tilesFromRack":["R10a","B10a","K10a"],"reasoning":"<short reason>"}

Output raw JSON only. No markdown fences, no comments, no extra text.`;

/**
 * V7 Ollama Meld 유저 프롬프트 빌더.
 * qwen2.5:3b 가 처리하기 쉽도록 매우 짧고 절차적으로 구성.
 */
export function buildV7OllamaMeldUserPrompt(gameState: {
  tableGroups: { tiles: string[] }[];
  myTiles: string[];
  turnNumber: number;
  drawPileCount: number;
  initialMeldDone: boolean;
  opponents: { playerId: string; remainingTiles: number }[];
}): string {
  const lines: string[] = [];

  // 초기 등록 상태를 최상단에 명시 (소형 모델 주의력 확보)
  lines.push('# FIRST CHECK — Initial Meld');
  if (!gameState.initialMeldDone) {
    lines.push('Initial Meld: NOT DONE');
    lines.push('RULE: You must place 30+ points using ONLY your rack tiles.');
    lines.push('Follow the 4-STEP PROCEDURE in the system prompt exactly.');
  } else {
    lines.push('Initial Meld: DONE');
    lines.push('RULE: You may extend or rearrange table groups.');
    lines.push('You MUST include all existing table groups in your output.');
  }

  // 내 타일 (색깔별 정렬 힌트 제공)
  lines.push('');
  lines.push('# My Rack');
  lines.push(
    `[${gameState.myTiles.join(', ')}] (${gameState.myTiles.length} tiles)`,
  );

  // 색깔별 그룹 힌트 (3B 모델이 직접 분류하기 어려우므로 제공)
  const byColor: Record<string, string[]> = { R: [], B: [], Y: [], K: [] };
  const byNumber: Record<string, string[]> = {};
  for (const tile of gameState.myTiles) {
    if (tile === 'JK1' || tile === 'JK2') continue;
    const color = tile[0];
    const numMatch = tile.match(/^[RBYK](\d+)/);
    if (color in byColor) {
      byColor[color].push(tile);
    }
    if (numMatch) {
      const num = numMatch[1];
      if (!byNumber[num]) byNumber[num] = [];
      byNumber[num].push(tile);
    }
  }

  lines.push('');
  lines.push('# Hints (sorted for you)');
  lines.push(
    `By color: R=[${byColor.R.join(',')}] B=[${byColor.B.join(',')}] Y=[${byColor.Y.join(',')}] K=[${byColor.K.join(',')}]`,
  );
  // 같은 숫자가 3개 이상인 것만 힌트로 표시 (그룹 후보)
  const groupCandidates = Object.entries(byNumber)
    .filter(([, tiles]) => tiles.length >= 3)
    .map(([num, tiles]) => `${num}:[${tiles.join(',')}]`);
  if (groupCandidates.length > 0) {
    lines.push(`Group candidates (3+ same number): ${groupCandidates.join(' ')}`);
  } else {
    lines.push('Group candidates (3+ same number): none');
  }

  // 테이블 상태
  lines.push('');
  lines.push('# Table');
  if (gameState.tableGroups.length === 0) {
    lines.push('(empty)');
  } else {
    gameState.tableGroups.forEach((group, idx) => {
      lines.push(`Group${idx + 1}: [${group.tiles.join(', ')}]`);
    });
    lines.push(
      `(${gameState.tableGroups.length} groups — include ALL in output if you place)`,
    );
  }

  // 상대 정보 (최소)
  if (gameState.opponents.length > 0) {
    lines.push('');
    lines.push('# Opponents');
    gameState.opponents.forEach((opp) => {
      lines.push(`${opp.playerId}: ${opp.remainingTiles} tiles`);
    });
  }

  // 명확한 task
  lines.push('');
  lines.push('# Your Task');
  lines.push('Run the 4-STEP PROCEDURE. Output ONE JSON object. No other text.');

  return lines.join('\n');
}

/**
 * V7 Ollama Meld 재시도 프롬프트.
 * 소형 모델은 장황한 재시도 설명을 무시하므로 한 줄 지시.
 */
export function buildV7OllamaMeldRetryPrompt(
  gameState: {
    tableGroups: { tiles: string[] }[];
    myTiles: string[];
    turnNumber: number;
    drawPileCount: number;
    initialMeldDone: boolean;
    opponents: { playerId: string; remainingTiles: number }[];
  },
  errorReason: string,
  attemptNumber: number,
): string {
  const basePrompt = buildV7OllamaMeldUserPrompt(gameState);
  return (
    basePrompt +
    `\n\n# RETRY ${attemptNumber + 1}\n` +
    `Previous error: ${errorReason}\n` +
    `Common mistakes:\n` +
    `- Sets with 2 tiles (must be 3+).\n` +
    `- Groups with duplicate colors.\n` +
    `- Runs with gaps or different colors.\n` +
    `- Initial meld below 30 points.\n` +
    `If unsure, output {"action":"draw","reasoning":"retry fallback"}.`
  );
}
