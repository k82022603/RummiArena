/**
 * V3 Reasoning Prompt - v2 대비 무효 배치 감소 + 배치 효율 향상.
 *
 * v2 프롬프트(30.8% A+ 등급)를 기반으로 4가지 개선을 적용:
 *
 * Phase 1 (즉시 적용):
 *   후보 1 - 자기 검증 강화: ERR_GROUP_COLOR_DUP 대응, a/b 세트 구분자 혼동 방지
 *   후보 3 - 테이블 그룹 누락 방지: ERR_TABLE_TILE_MISSING 대응, 그룹 수 카운팅 강제
 *
 * Phase 2 (A/B 테스트 후 적용):
 *   후보 2 - 무효 패턴 few-shot: 실전 무효 배치 3대 유형을 WRONG/CORRECT 쌍으로 추가
 *
 * Phase 3 (선택적):
 *   후보 4 - 배치 최적화: Step 6 확장, 타일 최대 배치 전략 세분화
 *
 * 토큰 예산: ~1,530 토큰 (v2 ~1,200 대비 +21%, 한국어 ~3,000 대비 여전히 49% 절감)
 * 환경변수 PROMPT_VERSION=v3 으로 토글 가능.
 *
 * 설계 문서: docs/02-design/24-v3-prompt-adapter-impact.md
 * 프롬프트 원칙: docs/02-design/21-reasoning-model-prompt-engineering.md
 */

export const V3_REASONING_SYSTEM_PROMPT = `You are a Rummikub game AI. Respond with ONLY a valid JSON object.

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

## Example 5: Multiple sets placed at once
My rack: [R10a, R11a, R12a, B7a, Y7b, K7a, R1a]
Table: (empty), initialMeldDone=false
Analysis: Run R10-11-12 (33pts) + Group 7s B,Y,K (21pts) = 54pts total, 6 tiles placed
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
6. Compare all valid combinations to maximize tiles placed:
   a. For each valid group/run, count how many rack tiles it uses
   b. Check if groups and runs can be combined (tiles not overlapping)
   c. If extending an existing table group adds more tiles than creating new sets, prefer extending
   d. Pick the combination that places the MOST total tiles from your rack
   e. Tie-breaker: prefer placing higher-number tiles (they are worth more points)
7. If no valid combination exists: choose "draw"
8. Build JSON response: include ALL existing table groups + your new groups
9. Run the validation checklist above before outputting

# Response Format (output ONLY this JSON, nothing else)

Draw:
{"action":"draw","reasoning":"reason"}

Place:
{"action":"place","tableGroups":[{"tiles":["R10a","R11a","R12a"]}],"tilesFromRack":["R10a","R11a","R12a"],"reasoning":"reason"}

IMPORTANT: Output raw JSON only. No markdown, no code blocks, no explanation text.`;

/**
 * V3 Reasoning 유저 프롬프트 빌더.
 * v2 대비 변경: 테이블 그룹 수를 CRITICAL로 강조하여 누락 방지.
 */
export function buildV3UserPrompt(gameState: {
  tableGroups: { tiles: string[] }[];
  myTiles: string[];
  turnNumber: number;
  drawPileCount: number;
  initialMeldDone: boolean;
  opponents: { playerId: string; remainingTiles: number }[];
}): string {
  const lines: string[] = [];

  // 테이블 상태
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

  // 내 타일
  lines.push('');
  lines.push('# My Rack Tiles');
  lines.push(
    `[${gameState.myTiles.join(', ')}] (${gameState.myTiles.length} tiles)`,
  );

  // 게임 상태
  lines.push('');
  lines.push('# Game Status');
  lines.push(`Turn: ${gameState.turnNumber}`);
  lines.push(`Draw pile: ${gameState.drawPileCount} tiles remaining`);

  if (!gameState.initialMeldDone) {
    lines.push(
      'Initial Meld: NOT DONE -- you need sum >= 30 points to place',
    );
    lines.push('You can ONLY use your rack tiles (no table tiles)');
    lines.push('Calculate: sum of tile numbers must be >= 30');
  } else {
    lines.push('Initial Meld: DONE (no point restriction)');
    lines.push('You can extend or rearrange existing table groups');
  }

  // 상대 정보 (간략하게)
  if (gameState.opponents.length > 0) {
    lines.push('');
    lines.push('# Opponents');
    gameState.opponents.forEach((opp) => {
      const warn =
        opp.remainingTiles <= 3 ? ' WARNING: close to winning!' : '';
      lines.push(`${opp.playerId}: ${opp.remainingTiles} tiles${warn}`);
    });
  }

  // 명확한 지시 + 검증 힌트
  lines.push('');
  lines.push('# Your Task');
  lines.push('Analyze my rack tiles and find valid groups/runs to place.');
  lines.push('If you can place tiles, respond with action="place".');
  lines.push('If no valid combination exists, respond with action="draw".');
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
  lines.push('');
  lines.push('Respond with ONLY the JSON object. No other text.');

  return lines.join('\n');
}

/**
 * V3 Reasoning 재시도 프롬프트 빌더.
 * v2 대비 변경: 에러 피드백에 더 구체적인 가이드 추가.
 */
export function buildV3RetryPrompt(
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
  const basePrompt = buildV3UserPrompt(gameState);
  return (
    basePrompt +
    `\n\n# RETRY (attempt ${attemptNumber + 1})\n` +
    `Your previous response was INVALID: ${errorReason}\n` +
    `\n` +
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
    `If unsure, just respond: {"action":"draw","reasoning":"no valid combination"}`
  );
}
