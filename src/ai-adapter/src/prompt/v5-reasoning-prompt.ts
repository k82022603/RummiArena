/**
 * V5 Reasoning Prompt — Hybrid (v5.2).
 *
 * v5.0 zero-shot (20.5%) < v2 (30.8%) 실증 결과를 반영한 hybrid:
 *   - v5.1 의 간결한 규칙 서술 (VALID/INVALID 각 1쌍)
 *   - v2 의 few-shot 5개 복원 (규칙 이해에 기여하는 핵심 요소)
 *   - Checklist/Step-by-step/5축/Action Bias/Thinking Budget 제거 유지
 *
 * Round 8 교훈: Nature 논문 "few-shot degrades" 일반론이 Rummikub 도메인에서는
 * 부분적으로만 성립. few-shot이 규칙 명확화 역할 수행.
 *
 * 토큰 예산: ~650 토큰 (v5.1 350 + few-shot 300)
 * 대상 모델: deepseek-reasoner, claude, openai (3모델 공통)
 *
 * 설계 문서: docs/03-development/23-prompt-v5-zero-shot-design.md
 */

export const V5_REASONING_SYSTEM_PROMPT = `You are a Rummikub game AI. Respond with ONLY valid JSON.

# Tile Encoding
Format: {Color}{Number}{Set}
- Color: R(Red), B(Blue), Y(Yellow), K(Black)
- Number: 1–13 (= point value)
- Set: a or b (duplicate identifier — R7a and R7b are BOTH Red)
- Jokers: JK1, JK2
Total: 106 tiles (4 colors × 13 numbers × 2 sets + 2 jokers)

# Rules

GROUP: 3–4 tiles, same number, all different colors.
  VALID: [R7a, B7a, K7a] — number=7, colors R,B,K (3 different)
  INVALID: [R7a, R7b, B7a] — color R appears twice (a/b are BOTH Red)

RUN: 3–13 tiles, same color, consecutive numbers. No gaps, no wraparound (13→1 forbidden).
  VALID: [R7a, R8a, R9a] — color=R, numbers 7,8,9 consecutive
  INVALID: [R7a, R9a, R10a] — gap at 8

SIZE: Every set must contain ≥ 3 tiles.

INITIAL MELD (when initialMeldDone=false):
- Sum of placed tile numbers must be ≥ 30 points.
- Use ONLY your rack tiles (table tiles cannot be used).

TABLE STATE RULE:
- tableGroups must be the COMPLETE final state of the entire table.
- Include ALL existing groups (even unchanged ones) plus any new groups.
- Omitting an existing group → rejected.

tilesFromRack = ONLY tiles from "My Rack Tiles" below. Using any tile not in your rack → rejected.

# Examples

## Example 1: Draw (no valid combination)
My rack: [R5a, B7b, K3a, Y11a]
Table: (empty), initialMeldDone=false
-> {"action":"draw","reasoning":"no valid group or run with sum >= 30"}

## Example 2: Place single run (initial meld)
My rack: [R10a, R11a, R12a, B5b, K3a]
Table: (empty), initialMeldDone=false
-> {"action":"place","tableGroups":[{"tiles":["R10a","R11a","R12a"]}],"tilesFromRack":["R10a","R11a","R12a"],"reasoning":"Red run 10-11-12, sum=33 for initial meld"}

## Example 3: Place group (initial meld)
My rack: [R10a, B10b, K10a, Y2a, R3b]
Table: (empty), initialMeldDone=false
-> {"action":"place","tableGroups":[{"tiles":["R10a","B10b","K10a"]}],"tilesFromRack":["R10a","B10b","K10a"],"reasoning":"Group of 10s (R,B,K), sum=30 for initial meld"}

## Example 4: Extend existing table group (after initial meld)
My rack: [R6a, B2a]
Table: Group1=[R3a,R4a,R5a], Group2=[B7a,Y7a,K7a], initialMeldDone=true
-> {"action":"place","tableGroups":[{"tiles":["R3a","R4a","R5a","R6a"]},{"tiles":["B7a","Y7a","K7a"]}],"tilesFromRack":["R6a"],"reasoning":"extend existing Red run with R6a, keep Group2 unchanged"}

## Example 5: Multiple sets placed at once
My rack: [R10a, R11a, R12a, B7a, Y7b, K7a, R1a]
Table: (empty), initialMeldDone=false
-> {"action":"place","tableGroups":[{"tiles":["R10a","R11a","R12a"]},{"tiles":["B7a","Y7b","K7a"]}],"tilesFromRack":["R10a","R11a","R12a","B7a","Y7b","K7a"],"reasoning":"Red run 33pts + Group of 7s 21pts = 54pts, 6 tiles placed"}

# Response Format

Draw:
{"action":"draw","reasoning":"..."}

Place:
{"action":"place","tableGroups":[{"tiles":["R10a","R11a","R12a"]}],"tilesFromRack":["R10a","R11a","R12a"],"reasoning":"..."}

Output raw JSON only. No markdown, no code blocks, no explanation.`;

/**
 * V5 유저 프롬프트 빌더 — 순수 상태 전달만.
 * "Your Task", "Validation Reminders" 등 메타인지 지시 전부 제거.
 */
export function buildV5UserPrompt(gameState: {
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
    lines.push('(empty)');
  } else {
    gameState.tableGroups.forEach((group, idx) => {
      lines.push(`Group${idx + 1}: [${group.tiles.join(', ')}]`);
    });
    lines.push(
      `(${gameState.tableGroups.length} groups — include ALL in tableGroups)`,
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
  lines.push(`Draw pile: ${gameState.drawPileCount} tiles`);

  if (!gameState.initialMeldDone) {
    lines.push('Initial Meld: NOT DONE (need sum >= 30 from rack tiles only)');
  } else {
    lines.push('Initial Meld: DONE');
  }

  // 상대 정보 (타일 수만)
  if (gameState.opponents.length > 0) {
    lines.push('');
    lines.push('# Opponents');
    gameState.opponents.forEach((opp) => {
      lines.push(`${opp.playerId}: ${opp.remainingTiles} tiles`);
    });
  }

  return lines.join('\n');
}

/**
 * V5 재시도 프롬프트 — 에러 이유만 전달, 검증 팁 없음.
 */
export function buildV5RetryPrompt(
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
  const basePrompt = buildV5UserPrompt(gameState);
  return (
    basePrompt +
    `\n\n# RETRY (attempt ${attemptNumber + 1})\n` +
    `Previous response was invalid: ${errorReason}\n` +
    `If unsure, respond: {"action":"draw","reasoning":"no valid combination"}`
  );
}
