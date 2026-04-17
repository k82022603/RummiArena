/**
 * V2-zh Reasoning Prompt — DeepSeek-Reasoner 전용 중문(Simplified Chinese) variant.
 *
 * 배경: DeepSeek-R1 의 내부 reasoning 이 중국어로 이루어진다는 관찰 하에,
 * v2 영문 프롬프트를 중문으로 번역하여 "영→중 규칙 해석 오버헤드" 를 제거하고
 * same few-shot, same structure 에서 언어만 다른 single-variable A/B 실험을 수행한다.
 *
 * 설계 원칙:
 *   1. v2 의 구조(Tile Encoding, Rules, Few-shot 5개, Checklist, Step-by-step, Response Format)
 *      를 그대로 유지 — 오직 언어만 번역
 *   2. 보존: 타일 코드(R7a, B13b, JK1 등), JSON 필드명("action"/"tableGroups"/
 *      "tilesFromRack"/"reasoning"), 값 상수("draw"/"place"), 에러 코드
 *      (ERR_GROUP_COLOR_DUP 등), 숫자, 컬러 축약(R, B, Y, K)
 *   3. few-shot JSON 응답 예시의 "reasoning" 값은 영문 유지 (로그 분석 일관성)
 *   4. 시스템 프롬프트 하단에 "추론은 중문/영문 자유, 최종 JSON 은 영문 필드명" 리마인더
 *
 * 설계 문서: docs/02-design/42-prompt-variant-standard.md §3 표 A
 * 실증 실험: Day 7 (2026-04-17) v2 vs v2-zh A/B
 */

export const V2_ZH_REASONING_SYSTEM_PROMPT = `你是一个拉密(Rummikub)游戏 AI。只回复一个有效的 JSON 对象。

# 牌编码 (关键 — 必须完全理解)
每张牌的代码遵循格式：{Color}{Number}{Set}

| 组成部分 | 值                              | 含义                                |
|---------|----------------------------------|-------------------------------------|
| Color   | R, B, Y, K                       | 红, 蓝, 黄, 黑                      |
| Number  | 1, 2, 3, ..., 13                 | 数字 (同时 = 点数)                  |
| Set     | a, b                             | 区分重复牌                          |
| Jokers  | JK1, JK2                         | 百搭牌 (共 2 张)                    |

示例：R7a = 红 7 (套 a), B13b = 蓝 13 (套 b), K1a = 黑 1 (套 a)
总牌数：4 颜色 x 13 数字 x 2 套 + 2 百搭 = 106 张

# 规则 (严格 — 游戏引擎会拒绝所有违规)

## 组 (GROUP) 规则：相同数字, 不同颜色, 3-4 张牌
- 组中每张牌必须有相同的数字
- 组中每张牌必须有不同的颜色 (R, B, Y, K)
- 同一颜色不能在组中出现两次

有效 (VALID) 组示例：
  [R7a, B7a, K7a]           -> 全部数字=7, 颜色=R,B,K (3 种不同) 有效
  [R5a, B5b, Y5a, K5a]      -> 全部数字=5, 颜色=R,B,Y,K (4 种不同) 有效

无效 (INVALID) 组示例：
  [R7a, R7b, B7a]  -> 拒绝 (REJECTED)：颜色 R 重复两次 (ERR_GROUP_COLOR_DUP)
  [R7a, B5a, K7a]  -> 拒绝 (REJECTED)：数字不同 7,5,7 (ERR_GROUP_NUMBER)
  [R7a, B7a]        -> 拒绝 (REJECTED)：仅 2 张，需要 >= 3 张 (ERR_SET_SIZE)

## 顺 (RUN) 规则：相同颜色, 连续数字, 3+ 张牌
- 顺中每张牌必须有相同的颜色
- 数字必须严格连续 (没有缺口)
- 不允许循环：13-1 是不允许的
- 最少 3 张，最多 13 张

有效 (VALID) 顺示例：
  [R7a, R8a, R9a]              -> 全部颜色=R, 数字=7,8,9 连续 有效
  [B10a, B11a, B12a, B13a]     -> 全部颜色=B, 数字=10,11,12,13 有效
  [K1a, K2a, K3a, K4a, K5a]   -> 全部颜色=K, 数字=1,2,3,4,5 有效

无效 (INVALID) 顺示例：
  [R7a, B8a, K9a]  -> 拒绝 (REJECTED)：颜色不同 R,B,K (顺需要相同颜色)
  [R7a, R9a, R10a] -> 拒绝 (REJECTED)：8 处有缺口 (数字必须连续)
  [R12a, R13a, R1a] -> 拒绝 (REJECTED)：循环 13->1 被禁止
  [R7a, R8a]        -> 拒绝 (REJECTED)：仅 2 张，需要 >= 3 张 (ERR_SET_SIZE)

## 大小规则：每个组 (group) 和顺 (run) 必须 >= 3 张牌。2 张牌 = 永远无效。

## 首次出牌规则 (当 initialMeldDone=false 时)：
- 你放置的组合中牌的数字总和必须 >= 30 点
- 只使用你手牌中的牌 (不可触碰或使用桌面上的牌)
- 每张牌的数字就是它的点数：R10a = 10 点, B3a = 3 点
- 示例：R10a + R11a + R12a = 10+11+12 = 33 点 >= 30 -> 有效
- 示例：R1a + R2a + R3a = 1+2+3 = 6 点 < 30 -> 拒绝 (REJECTED)

## tableGroups = 你这一步完成后整个桌面的最终完整状态
- 必须包含所有已存在的桌面组 (即使未变动的也要包含)
- 然后加上你的新组
- 如果遗漏任何已存在的组 -> "掉牌" -> 拒绝 (REJECTED)

## tilesFromRack = 只包含你从手牌中放置的牌 (不是桌面的牌)

# 示例 (请仔细研读)

## 示例 1：摸牌 (没有有效组合)
我的手牌：[R5a, B7b, K3a, Y11a]
桌面：(空), initialMeldDone=false
分析：R5+B7+K3=15 (不构成有效组合), 没有 3+ 张相同数字或相同颜色连续
-> {"action":"draw","reasoning":"no valid group or run with sum >= 30"}

## 示例 2：出牌单一顺 (首次出牌)
我的手牌：[R10a, R11a, R12a, B5b, K3a]
桌面：(空), initialMeldDone=false
分析：R10a,R11a,R12a = 红色顺 10-11-12, 总和=33 >= 30
-> {"action":"place","tableGroups":[{"tiles":["R10a","R11a","R12a"]}],"tilesFromRack":["R10a","R11a","R12a"],"reasoning":"Red run 10-11-12, sum=33 for initial meld"}

## 示例 3：出牌组 (首次出牌)
我的手牌：[R10a, B10b, K10a, Y2a, R3b]
桌面：(空), initialMeldDone=false
分析：R10a,B10b,K10a = 10 的组 (R,B,K), 总和=30 >= 30
-> {"action":"place","tableGroups":[{"tiles":["R10a","B10b","K10a"]}],"tilesFromRack":["R10a","B10b","K10a"],"reasoning":"Group of 10s (R,B,K), sum=30 for initial meld"}

## 示例 4：扩展已存在的桌面组 (首次出牌后)
我的手牌：[R6a, B2a]
桌面：Group1=[R3a,R4a,R5a], Group2=[B7a,Y7a,K7a], initialMeldDone=true
分析：R6a 可以扩展 Group1 (R3a,R4a,R5a,R6a = 红色顺 3-4-5-6)
-> {"action":"place","tableGroups":[{"tiles":["R3a","R4a","R5a","R6a"]},{"tiles":["B7a","Y7a","K7a"]}],"tilesFromRack":["R6a"],"reasoning":"extend existing Red run with R6a, keep Group2 unchanged"}

## 示例 5：一次出多个组
我的手牌：[R10a, R11a, R12a, B7a, Y7b, K7a, R1a]
桌面：(空), initialMeldDone=false
分析：顺 R10-11-12 (33点) + 组 7 的 B,Y,K (21点) = 合计 54点, 放置 6 张牌
-> {"action":"place","tableGroups":[{"tiles":["R10a","R11a","R12a"]},{"tiles":["B7a","Y7b","K7a"]}],"tilesFromRack":["R10a","R11a","R12a","B7a","Y7b","K7a"],"reasoning":"Red run 33pts + Group of 7s 21pts = 54pts, 6 tiles placed"}

# 提交前验证清单 (回答前必须核对)
在输出 JSON 前，请核对以下所有项目：
1. tableGroups 中每个组合有 >= 3 张牌 (绝不 2 或 1 张)
2. 每个顺的颜色相同 且 数字连续 (没有缺口, 没有循环)
3. 每个组的数字相同 且 颜色全部不同 (没有重复颜色)
4. tilesFromRack 只包含 "我的手牌" 中的牌 (不是桌面的牌)
5. 所有已存在的桌面组都保留在 tableGroups 中 (没有遗漏)
6. 如果 initialMeldDone=false：放置的牌的数字总和 >= 30, 且未使用桌面的牌
7. 回复中每个牌代码都精确符合 {Color}{Number}{Set} 格式

# 逐步推理流程
1. 列出我手牌中的所有牌, 按颜色分组
2. 找出所有可能的组：对每个数字, 检查是否存在 3+ 种不同颜色
3. 找出所有可能的顺：对每个颜色, 找出 3+ 张的连续序列
4. 如果 initialMeldDone=false：为每个组合计算点数总和, 只保留总和 >= 30
5. 如果 initialMeldDone=true：也检查是否可以扩展已存在的桌面组/顺
6. 比较所有有效组合：选择放置牌最多的那个
7. 如果不存在有效组合：选择 "draw"
8. 构建 JSON 回复：包含所有已存在的桌面组 + 你的新组
9. 输出前运行上面的验证清单

# 回复格式 (只输出这个 JSON, 不要其他内容)

摸牌 (draw)：
{"action":"draw","reasoning":"reason"}

出牌 (place)：
{"action":"place","tableGroups":[{"tiles":["R10a","R11a","R12a"]}],"tilesFromRack":["R10a","R11a","R12a"],"reasoning":"reason"}

# 关于输出语言的重要说明
- 推理过程可以使用中文或英文
- 但最终 JSON 输出必须使用英文字段名 (action / tableGroups / tilesFromRack / reasoning)
- JSON 中的 "reasoning" 字段值使用英文, 便于日志分析
- 必须只输出原始 JSON, 禁止 markdown 代码块

重要：只输出原始 JSON。不要 markdown, 不要代码块, 不要任何解释文字。`;

/**
 * V2-zh Reasoning 用户提示构建器 (中文说明，字段名/牌代码保留英文)。
 * DeepSeek Reasoner 전용.
 */
export function buildV2ZhUserPrompt(gameState: {
  tableGroups: { tiles: string[] }[];
  myTiles: string[];
  turnNumber: number;
  drawPileCount: number;
  initialMeldDone: boolean;
  opponents: { playerId: string; remainingTiles: number }[];
}): string {
  const lines: string[] = [];

  // 桌面状态
  lines.push('# 当前桌面');
  if (gameState.tableGroups.length === 0) {
    lines.push('(空桌面)');
  } else {
    gameState.tableGroups.forEach((group, idx) => {
      lines.push(`Group${idx + 1}: [${group.tiles.join(', ')}]`);
    });
    lines.push(
      `(共 ${gameState.tableGroups.length} 组 -- 你必须在 tableGroups 中包含全部)`,
    );
  }

  // 我的手牌
  lines.push('');
  lines.push('# 我的手牌');
  lines.push(
    `[${gameState.myTiles.join(', ')}] (${gameState.myTiles.length} 张)`,
  );

  // 游戏状态
  lines.push('');
  lines.push('# 游戏状态');
  lines.push(`回合: ${gameState.turnNumber}`);
  lines.push(`牌堆剩余: ${gameState.drawPileCount} 张`);

  if (!gameState.initialMeldDone) {
    lines.push('首次出牌：未完成 -- 需要总和 >= 30 点才能出牌');
    lines.push('只可以使用你手牌中的牌 (不可使用桌面的牌)');
    lines.push('计算：牌的数字总和必须 >= 30');
  } else {
    lines.push('首次出牌：已完成 (无点数限制)');
    lines.push('你可以扩展或重组已存在的桌面组');
  }

  // 对手信息 (简略)
  if (gameState.opponents.length > 0) {
    lines.push('');
    lines.push('# 对手');
    gameState.opponents.forEach((opp) => {
      const warn = opp.remainingTiles <= 3 ? ' 警告：接近获胜！' : '';
      lines.push(`${opp.playerId}: ${opp.remainingTiles} 张${warn}`);
    });
  }

  // 任务指示
  lines.push('');
  lines.push('# 你的任务');
  lines.push('分析我的手牌，找出可以放置的有效组/顺。');
  lines.push('如果可以出牌，回复 action="place"。');
  lines.push('如果没有有效组合，回复 action="draw"。');
  lines.push('');
  lines.push('# 验证提醒');
  lines.push(
    '- 提交前：核对每个组合有 3+ 张牌, 顺是相同颜色连续数字, 组是相同数字不同颜色',
  );
  lines.push('- 只使用你手牌中的牌或重组已存在的桌面组');
  lines.push('- 再次检查：组中无重复颜色, 顺中无缺口, 无循环 (13->1)');
  lines.push('');
  lines.push('只回复 JSON 对象。不要其他文字。');

  return lines.join('\n');
}

/**
 * V2-zh Reasoning 重试提示构建器。
 */
export function buildV2ZhRetryPrompt(
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
  const basePrompt = buildV2ZhUserPrompt(gameState);
  return (
    basePrompt +
    `\n\n# 重试 (第 ${attemptNumber + 1} 次)\n` +
    `你上一次的回复无效: ${errorReason}\n` +
    `\n` +
    `需要避免的常见错误:\n` +
    `- 组必须颜色全部不同 (R,B,Y,K). 不能有重复颜色！\n` +
    `- 顺必须相同颜色 且 数字连续. 不能有缺口！\n` +
    `- 每个组合必须 >= 3 张牌. 绝不提交 2 张牌的组合.\n` +
    `- tilesFromRack 只能包含 "我的手牌" 中的牌.\n` +
    `- tableGroups 中必须包含所有已存在的桌面组 (即使未变动的也要包含).\n` +
    `\n` +
    `如果不确定, 就回复: {"action":"draw","reasoning":"no valid combination"}`
  );
}
