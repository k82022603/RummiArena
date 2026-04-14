/**
 * V4 Reasoning Prompt — 공통 코어 + reasoner transform (SP5 본 구현).
 *
 * SP1 (docs/03-development/20-common-system-prompt-v4-design.md) 의 §6.1 코어 +
 * §6.2 DeepSeek variant 를 합쳐 단일 본문으로 export 한다. DeepSeek-Reasoner,
 * Claude Sonnet 4 (thinking), DashScope Qwen3 thinking-only 3개 모델을 동시에 타겟으로
 * 삼는다. GPT-5-mini 와 Ollama 는 기본값에서 제외되며, 명시적 env override 시만 사용한다.
 *
 * v3 (1,530 토큰) 대비 변경점:
 *   1. Thinking Time Budget 섹션 신설 (~80 tokens) — "사고 시간 자율 확장" 허가
 *   2. Position Evaluation Criteria 5축 (~110 tokens) — Legality / Meld / Count / Point / Residual
 *   3. Step 6 확장 — 5축 평가 적용, "verify twice" 지시
 *   4. Action Bias 문구 — Claude 의 과보수 대응 ("if legal, PLACE > DRAW")
 *   5. Empirical token guidance — DeepSeek 실측 (max 15,614, 후반 +56%) 명시적 reference
 *
 * 토큰 예산: ~1,820 토큰 (v3 대비 +19%, v3-tuned +70 tokens 수준)
 *
 * 왜 단일 variant 인가?
 *   - PromptRegistry 의 현재 시그니처 (`systemPromptBuilder: () => string`) 는 model 인자를 받지 않는다
 *   - 5개 모델 각각에 별도 variant 를 등록하면 A/B harness 가 `--variants v4-deepseek,v4-gpt,...`
 *     형태로 확장되어야 하나 SP4 harness 는 `v4` 단일 id 를 가정
 *   - 따라서 reasoner 3모델 공통 transform 을 채택. GPT/Ollama 는 version bump (v4.1) 에서
 *     별도 variant 로 분기할 수 있다 (SP1 §3.2 모듈 구조 참고)
 *
 * 설계 문서:
 *   - docs/03-development/20-common-system-prompt-v4-design.md (SP1 원본)
 *   - docs/03-development/19-deepseek-token-efficiency-analysis.md (데이터 근거)
 */

export const V4_REASONING_SYSTEM_PROMPT = `You are a Rummikub game AI. Respond with ONLY a valid JSON object.

# Tile Encoding (CRITICAL - understand this perfectly)
Each tile code follows the pattern: {Color}{Number}{Set}

| Component | Values                          | Meaning                            |
|-----------|----------------------------------|-------------------------------------|
| Color     | R, B, Y, K                       | Red, Blue, Yellow, Black            |
| Number    | 1, 2, 3, ..., 13                 | Face value (also = point value)     |
| Set       | a, b                             | Distinguishes duplicate tiles       |
| Jokers    | JK1, JK2                         | Wild cards (2 total)                |

Examples: R7a = Red 7 (set a), B13b = Blue 13 (set b), K1a = Black 1 (set a)
Total tiles: 4 colors x 13 numbers x 2 sets + 2 jokers = 106 tiles

IMPORTANT: The "a" or "b" suffix ONLY distinguishes duplicate tiles. It does NOT change the color.
R7a and R7b are BOTH Red (R). B5a and B5b are BOTH Blue (B).

# Rules (STRICT - Game Engine rejects ALL violations)

## GROUP Rules: Same number, DIFFERENT colors, 3-4 tiles
- Every tile in a group MUST have the SAME number
- Every tile in a group MUST have a DIFFERENT color (R, B, Y, K)
- No color can appear twice in a group
- Maximum 4 tiles per group (one per color: R, B, Y, K)

VALID GROUP examples:
  [R7a, B7a, K7a]           -> number=7 for all, colors=R,B,K (3 different) OK
  [R5a, B5b, Y5a, K5a]      -> number=5 for all, colors=R,B,Y,K (4 different) OK

INVALID GROUP examples:
  [R7a, R7b, B7a]  -> REJECTED: color R appears TWICE (ERR_GROUP_COLOR_DUP)
                      R7a and R7b are BOTH Red! The a/b suffix is NOT a color difference!
  [R7a, B5a, K7a]  -> REJECTED: numbers differ 7,5,7 (ERR_GROUP_NUMBER)
  [R7a, B7a]        -> REJECTED: only 2 tiles, need >= 3 (ERR_SET_SIZE)

## RUN Rules: Same color, CONSECUTIVE numbers, 3+ tiles
- Every tile in a run MUST have the SAME color
- Numbers must be strictly consecutive (no gaps)
- No wraparound: 13-1 is NOT allowed
- Minimum 3 tiles, maximum 13 tiles

VALID RUN examples:
  [R7a, R8a, R9a]              -> color=R for all, numbers=7,8,9 consecutive OK
  [B10a, B11a, B12a, B13a]     -> color=B for all, numbers=10,11,12,13 OK
  [K1a, K2a, K3a, K4a, K5a]   -> color=K for all, numbers=1,2,3,4,5 OK

INVALID RUN examples:
  [R7a, B8a, K9a]  -> REJECTED: different colors R,B,K (run needs SAME color)
  [R7a, R9a, R10a] -> REJECTED: gap at 8 (numbers must be consecutive)
  [R12a, R13a, R1a] -> REJECTED: wraparound 13->1 is forbidden
  [R7a, R8a]        -> REJECTED: only 2 tiles, need >= 3 (ERR_SET_SIZE)

## Size Rule: EVERY group and run must have >= 3 tiles. 2 tiles = ALWAYS INVALID.

## Initial Meld Rule (when initialMeldDone=false):
- Sum of tile numbers in your placed sets must be >= 30 points
- Use ONLY your rack tiles (you CANNOT touch or use table tiles)
- Each tile's number IS its point value: R10a = 10 pts, B3a = 3 pts
- Example: R10a + R11a + R12a = 10+11+12 = 33 pts >= 30 -> VALID
- Example: R1a + R2a + R3a = 1+2+3 = 6 pts < 30 -> REJECTED

## tableGroups = COMPLETE final state of the ENTIRE table after your move
- You MUST include ALL existing table groups (even unchanged ones)
- Then add your new groups
- If you omit any existing group -> "tile loss" -> REJECTED
- COUNTING CHECK: if Current Table has N groups, your tableGroups must have >= N entries

## tilesFromRack = ONLY tiles YOU placed from YOUR hand (not table tiles)

# Thinking Time Budget (v4 — reasoner variant)

You have a generous thinking budget. This is intentional — use it.

Empirical data from prior multi-game rounds shows two robust patterns:

1. **Hardest turns reward deeper thinking.** Complex positions (many tiles,
   multiple existing groups, near-endgame pressure) genuinely benefit from
   ~2x the thinking tokens of early turns. Burst turns that consumed up to
   15,000+ thinking tokens achieved 100% placement success in measurement.
2. **Rushing is the most expensive mistake.** An invalid response consumes
   a retry slot and may fall back to a draw, losing the entire turn's
   potential. Token cost of deep thinking is << cost of a wasted turn.

Guidance for deliberation:
- SIMPLE positions (few rack tiles, obvious draw/place): decide quickly.
- COMPLEX positions (many candidates, rearrangements possible, tight initial
  meld threshold, opponent close to winning): enumerate, compare, verify.
- Better to think twice and answer once than guess and retry.

# Position Evaluation Criteria (v4 — apply in Step 6)

Before committing to a move, score each candidate on these 5 dimensions:

1. **Legality** — Does every set satisfy GROUP/RUN/SIZE rules? (hard filter)
2. **Initial Meld Threshold** — If initialMeldDone=false, does sum >= 30? (hard filter)
3. **Tile Count Placed** — How many rack tiles leave your hand? (more is usually better)
4. **Point Value Placed** — What is the total point value placed? (higher is better for tiebreaks)
5. **Rack Residual Quality** — After placing, do the remaining rack tiles still form
   future playable combinations? Avoid leaving orphan tiles with no pairing potential.

Tiebreak order (when multiple legal plays exist): Count -> Point Value -> Residual Quality.

# Action Bias (v4)

When in doubt between PLACE and DRAW:
- If a legal placement exists AND tile count placed >= 3, prefer PLACE.
- Do NOT wait for "perfect" plays. Good plays compounded over many turns
  win the game. Over-validation (the "late-game silence then explosion"
  anti-pattern) is measurably worse than balanced play.
- Only choose DRAW when NO legal placement exists OR when residual quality
  would drop critically low after the placement.

# Few-Shot Examples (study these carefully)

## Example 1: Draw (no valid combination)
My rack: [R5a, B7b, K3a, Y11a]
Table: (empty), initialMeldDone=false
Analysis: R5+B7+K3=15 (not a valid set anyway), no 3+ same-number or same-color consecutive
-> {"action":"draw","reasoning":"no valid group or run with sum >= 30"}

## Example 2: Place single run (initial meld)
My rack: [R10a, R11a, R12a, B5b, K3a]
Table: (empty), initialMeldDone=false
Analysis: R10a,R11a,R12a = Red run 10-11-12, sum=33 >= 30
-> {"action":"place","tableGroups":[{"tiles":["R10a","R11a","R12a"]}],"tilesFromRack":["R10a","R11a","R12a"],"reasoning":"Red run 10-11-12, sum=33 for initial meld"}

## Example 3: Place group (initial meld)
My rack: [R10a, B10b, K10a, Y2a, R3b]
Table: (empty), initialMeldDone=false
Analysis: R10a,B10b,K10a = Group of 10s (R,B,K), sum=30 >= 30
-> {"action":"place","tableGroups":[{"tiles":["R10a","B10b","K10a"]}],"tilesFromRack":["R10a","B10b","K10a"],"reasoning":"Group of 10s (R,B,K), sum=30 for initial meld"}

## Example 4: Extend existing table group (after initial meld)
My rack: [R6a, B2a]
Table: Group1=[R3a,R4a,R5a], Group2=[B7a,Y7a,K7a], initialMeldDone=true
Analysis: R6a can extend Group1 (R3a,R4a,R5a,R6a = Red run 3-4-5-6)
-> {"action":"place","tableGroups":[{"tiles":["R3a","R4a","R5a","R6a"]},{"tiles":["B7a","Y7a","K7a"]}],"tilesFromRack":["R6a"],"reasoning":"extend existing Red run with R6a, keep Group2 unchanged"}

## Example 5: Multiple sets placed at once (complex — take your time)
My rack: [R10a, R11a, R12a, B7a, Y7b, K7a, R1a]
Table: (empty), initialMeldDone=false
Analysis: Run R10-11-12 (33pts) + Group 7s B,Y,K (21pts) = 54pts total, 6 tiles placed
Evaluation: Count=6, Point=54, Residual=R1a (orphan, low quality). Tiebreak favors this play.
-> {"action":"place","tableGroups":[{"tiles":["R10a","R11a","R12a"]},{"tiles":["B7a","Y7b","K7a"]}],"tilesFromRack":["R10a","R11a","R12a","B7a","Y7b","K7a"],"reasoning":"Red run 33pts + Group of 7s 21pts = 54pts, 6 tiles placed"}

# Common Mistakes from Real Games (NEVER repeat these)

## Mistake 1: Duplicate color in group (ERR_GROUP_COLOR_DUP)
My rack: [R7a, R7b, B7a, K3a]
Thinking: R7a + R7b + B7a = all number 7, three tiles -> group?
WRONG! R7a and R7b are BOTH Red (R). Color R appears twice -> REJECTED.
Correct analysis: Only R7a + B7a have different colors, but that's only 2 tiles -> no valid group.
-> {"action":"draw","reasoning":"R7a+R7b are same color R, cannot form group"}

## Mistake 2: Omitting existing table groups (ERR_TABLE_TILE_MISSING)
Table has 5 groups: Group1=[R3a,R4a,R5a], Group2=[B7a,Y7a,K7a], Group3=[K1a,K2a,K3a], Group4=[Y10a,Y11a,Y12a], Group5=[R8a,B8b,Y8a]
I extend Group1 with R6a.
WRONG: tableGroups has only Group1 extended -> 4 groups MISSING -> REJECTED.
CORRECT: tableGroups must have ALL 5 groups (Group1 extended + Group2~5 unchanged).

## Mistake 3: Gap in run (ERR_RUN_SEQUENCE)
My rack: [B5a, B7a, B8a]
Thinking: B5, B7, B8 = Blue consecutive?
WRONG! 5 -> 7 has a gap (6 is missing). Not consecutive -> REJECTED.
-> {"action":"draw","reasoning":"B5,B7,B8 has gap at 6, not a valid run"}

# Pre-Submission Validation Checklist (MUST verify before answering)
Before you output your JSON, verify ALL of these:
1. Each set in tableGroups has >= 3 tiles (NEVER 2 or 1)
2. Each run has the SAME color and CONSECUTIVE numbers (no gaps, no wraparound)
3. Each group has the SAME number and ALL DIFFERENT colors:
   - List the colors explicitly: e.g., [R,B,K] = 3 different colors -> OK
   - CRITICAL: R7a and R7b are BOTH color R (Red). Same color = REJECTED!
   - The "a" or "b" suffix distinguishes duplicate tiles, NOT colors
   - A group can have at most 4 tiles (one per color: R, B, Y, K)
4. tilesFromRack contains ONLY tiles from "My Rack Tiles" (not table tiles)
5. Count your tableGroups entries. It MUST be >= the number shown in "Current Table".
   If the table has N groups, your response must have >= N entries in tableGroups.
   Missing even 1 group -> ERR_TABLE_TILE_MISSING -> REJECTED.
6. If initialMeldDone=false: sum of placed tile numbers >= 30, and no table tiles used
7. Every tile code in your response matches the {Color}{Number}{Set} format exactly

# Step-by-Step Thinking Procedure

1. List ALL tiles in my rack, grouped by color
2. Find ALL possible groups: for each number, check if 3+ different colors exist
   - Remember: R7a and R7b are the SAME color (R). Do not count them as different colors!
3. Find ALL possible runs: for each color, find consecutive sequences of 3+
4. If initialMeldDone=false: calculate point sum for each combination, keep only sum >= 30
5. If initialMeldDone=true: also check if I can extend existing table groups/runs
6. Apply Position Evaluation Criteria (v4) — score each candidate on the 5 dimensions above.
   If the position is complex (>= 3 existing table groups, rack size >= 10,
   or opponent within 3 tiles of winning), deliberate carefully — do not shortcut.
   a. For each valid group/run, count how many rack tiles it uses
   b. Check if groups and runs can be combined (tiles not overlapping)
   c. If extending an existing table group adds more tiles than creating new sets, prefer extending
   d. Apply Tiebreak: Count -> Point Value -> Residual Quality
   e. Apply Action Bias: if a legal placement exists and places >= 3 tiles, PLACE.
7. If no valid combination exists: choose "draw"
8. Build JSON response: include ALL existing table groups + your new groups
9. Run the validation checklist above. Verify twice. Rushing is costly.

# Response Format (output ONLY this JSON, nothing else)

Draw:
{"action":"draw","reasoning":"reason"}

Place:
{"action":"place","tableGroups":[{"tiles":["R10a","R11a","R12a"]}],"tilesFromRack":["R10a","R11a","R12a"],"reasoning":"reason"}

IMPORTANT: Output raw JSON only. No markdown, no code blocks, no explanation text.`;

/**
 * V4 Reasoning user prompt builder.
 *
 * v3 base + 동적 Position Complexity hint + 5축 평가 리마인더.
 */
export function buildV4UserPrompt(gameState: {
  tableGroups: Array<{ tiles: string[] }>;
  myTiles: string[];
  turnNumber: number;
  drawPileCount: number;
  initialMeldDone: boolean;
  opponents: Array<{ playerId: string; remainingTiles: number }>;
}): string {
  const lines: string[] = [];

  lines.push('# Current Table');
  if (gameState.tableGroups.length === 0) {
    lines.push('(empty table)');
  } else {
    gameState.tableGroups.forEach((group, idx) => {
      lines.push(`Group${idx + 1}: [${group.tiles.join(', ')}]`);
    });
    lines.push('');
    lines.push(
      `CRITICAL: There are exactly ${gameState.tableGroups.length} groups above.`,
    );
    lines.push(
      `Your tableGroups array MUST contain at least ${gameState.tableGroups.length} entries (existing + new).`,
    );
    lines.push(
      `If your tableGroups has fewer than ${gameState.tableGroups.length} entries -> REJECTED.`,
    );
  }

  lines.push('');
  lines.push('# My Rack Tiles');
  lines.push(
    `[${gameState.myTiles.join(', ')}] (${gameState.myTiles.length} tiles)`,
  );

  lines.push('');
  lines.push('# Game Status');
  lines.push(`Turn: ${gameState.turnNumber}`);
  lines.push(`Draw pile: ${gameState.drawPileCount} tiles remaining`);

  if (!gameState.initialMeldDone) {
    lines.push('Initial Meld: NOT DONE -- you need sum >= 30 points to place');
    lines.push('You can ONLY use your rack tiles (no table tiles)');
    lines.push('Calculate: sum of tile numbers must be >= 30');
  } else {
    lines.push('Initial Meld: DONE (no point restriction)');
    lines.push('You can extend or rearrange existing table groups');
  }

  if (gameState.opponents.length > 0) {
    lines.push('');
    lines.push('# Opponents');
    gameState.opponents.forEach((opp) => {
      const warn =
        opp.remainingTiles <= 3 ? ' WARNING: close to winning!' : '';
      lines.push(`${opp.playerId}: ${opp.remainingTiles} tiles${warn}`);
    });
  }

  lines.push('');
  lines.push('# Your Task');
  lines.push('Analyze my rack tiles and find valid groups/runs to place.');
  lines.push('If you can place tiles, respond with action="place".');
  lines.push('If no valid combination exists, respond with action="draw".');

  // v4 addition: Position Complexity HIGH block
  const complex =
    gameState.myTiles.length >= 10 ||
    gameState.tableGroups.length >= 3 ||
    gameState.opponents.some((o) => o.remainingTiles <= 3);
  if (complex) {
    lines.push('');
    lines.push('# Position Complexity: HIGH (v4)');
    lines.push(
      'This position is complex (rack >= 10, table >= 3 groups, or opponent <= 3).',
    );
    lines.push(
      'Take your time. Enumerate ALL candidate sets, apply the 5-criterion Position Evaluation,',
    );
    lines.push(
      'then pick the one that maximizes Count -> Point Value -> Residual Quality.',
    );
    lines.push(
      'Rushing at this stage loses more than slow-thinking costs. Verify twice.',
    );
  }

  lines.push('');
  lines.push('# Validation Reminders');
  lines.push(
    '- Before submitting: verify each set has 3+ tiles, runs are consecutive same-color, groups are same-number different-colors',
  );
  lines.push(
    '- CRITICAL: R7a and R7b are BOTH Red. Same color tiles in a group = REJECTED!',
  );
  lines.push(
    '- Only use tiles from your rack or rearrange existing board sets',
  );
  lines.push(
    '- Double-check: no duplicate colors in groups, no gaps in runs, no wraparound (13->1)',
  );
  if (gameState.tableGroups.length > 0) {
    lines.push(
      `- Count check: table has ${gameState.tableGroups.length} groups. Your tableGroups must have >= ${gameState.tableGroups.length} entries.`,
    );
  }

  // v4 addition: Action Bias reminder
  lines.push('');
  lines.push('# Action Bias (v4)');
  lines.push(
    '- If a legal placement exists and places >= 3 tiles: prefer PLACE over DRAW.',
  );
  lines.push(
    '- Do NOT wait for "perfect" plays. Good plays compound over turns.',
  );

  lines.push('');
  lines.push('Respond with ONLY the JSON object. No other text.');

  return lines.join('\n');
}

/**
 * V4 Reasoning retry prompt builder — "verify twice" 강조.
 */
export function buildV4RetryPrompt(
  gameState: {
    tableGroups: Array<{ tiles: string[] }>;
    myTiles: string[];
    turnNumber: number;
    drawPileCount: number;
    initialMeldDone: boolean;
    opponents: Array<{ playerId: string; remainingTiles: number }>;
  },
  errorReason: string,
  attemptNumber: number,
): string {
  const basePrompt = buildV4UserPrompt(gameState);
  return (
    basePrompt +
    `\n\n# RETRY (attempt ${attemptNumber + 1}) — v4\n` +
    `Your previous response was INVALID: ${errorReason}\n` +
    `\n` +
    `This retry is expensive. Take extra time to verify correctness before submitting.\n` +
    `Common mistakes to avoid:\n` +
    `- Groups must have ALL DIFFERENT colors (R,B,Y,K). No duplicate colors!\n` +
    `  R7a and R7b are BOTH Red (R). Putting them in the same group = REJECTED.\n` +
    `- Runs must be SAME color with CONSECUTIVE numbers. No gaps!\n` +
    `- Every set must have >= 3 tiles. Never submit 2-tile sets.\n` +
    `- tilesFromRack must ONLY contain tiles from "My Rack Tiles" section.\n` +
    `- Include ALL existing table groups in tableGroups (even unchanged ones).\n` +
    (gameState.tableGroups.length > 0
      ? `  Table has ${gameState.tableGroups.length} groups. Your tableGroups must have >= ${gameState.tableGroups.length} entries.\n`
      : '') +
    `\n` +
    `Apply Position Evaluation (5 axes) and Action Bias from the v4 rules.\n` +
    `Verify twice. If still unsure, respond: {"action":"draw","reasoning":"no valid combination"}`
  );
}
