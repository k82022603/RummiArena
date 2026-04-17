import {
  V2_ZH_REASONING_SYSTEM_PROMPT,
  buildV2ZhUserPrompt,
  buildV2ZhRetryPrompt,
} from './v2-zh-reasoning-prompt';

// -----------------------------------------------------------------------
// V2-zh Reasoning Prompt 단위 테스트
//
// 목적:
//   - 중문 번역된 v2 프롬프트가 핵심 섹션(규칙/예시/체크리스트/절차/포맷)을 유지하는지
//   - 번역에서 **반드시 보존해야 할 영문 요소** (타일 코드, JSON 필드명, 에러 코드,
//     값 상수, 컬러 축약)가 올바르게 남아있는지
//   - build*UserPrompt / build*RetryPrompt 가 기대한 중문+보존 요소를 생성하는지
// -----------------------------------------------------------------------

const makeGameState = (overrides = {}) => ({
  tableGroups: [] as { tiles: string[] }[],
  myTiles: ['R7a', 'B7b', 'K3a', 'Y11a'],
  turnNumber: 1,
  drawPileCount: 55,
  initialMeldDone: false,
  opponents: [{ playerId: 'opponent-01', remainingTiles: 11 }],
  ...overrides,
});

describe('V2-zh Reasoning Prompt', () => {
  describe('V2_ZH_REASONING_SYSTEM_PROMPT — 중문 본문', () => {
    it('핵심 중문 용어를 포함한다 (手牌, 桌面, 首次出牌, 连续, 组, 顺)', () => {
      expect(V2_ZH_REASONING_SYSTEM_PROMPT).toMatch(/手牌/);
      expect(V2_ZH_REASONING_SYSTEM_PROMPT).toMatch(/桌面/);
      expect(V2_ZH_REASONING_SYSTEM_PROMPT).toMatch(/首次出牌/);
      expect(V2_ZH_REASONING_SYSTEM_PROMPT).toMatch(/连续/);
      expect(V2_ZH_REASONING_SYSTEM_PROMPT).toMatch(/组/);
      expect(V2_ZH_REASONING_SYSTEM_PROMPT).toMatch(/顺/);
    });

    it('타일 코드는 영문으로 보존된다 (R7a, B13b, JK1, JK2)', () => {
      expect(V2_ZH_REASONING_SYSTEM_PROMPT).toMatch(/R7a/);
      expect(V2_ZH_REASONING_SYSTEM_PROMPT).toMatch(/B13b/);
      expect(V2_ZH_REASONING_SYSTEM_PROMPT).toMatch(/JK1/);
      expect(V2_ZH_REASONING_SYSTEM_PROMPT).toMatch(/JK2/);
      expect(V2_ZH_REASONING_SYSTEM_PROMPT).toMatch(/K1a/);
    });

    it('JSON 필드명은 영문으로 보존된다 (action / tableGroups / tilesFromRack / reasoning)', () => {
      expect(V2_ZH_REASONING_SYSTEM_PROMPT).toMatch(/"action"/);
      expect(V2_ZH_REASONING_SYSTEM_PROMPT).toMatch(/"tableGroups"/);
      expect(V2_ZH_REASONING_SYSTEM_PROMPT).toMatch(/"tilesFromRack"/);
      expect(V2_ZH_REASONING_SYSTEM_PROMPT).toMatch(/"reasoning"/);
    });

    it('값 상수는 영문으로 보존된다 ("draw", "place")', () => {
      expect(V2_ZH_REASONING_SYSTEM_PROMPT).toMatch(/"draw"/);
      expect(V2_ZH_REASONING_SYSTEM_PROMPT).toMatch(/"place"/);
    });

    it('에러 코드는 영문으로 보존된다 (ERR_GROUP_COLOR_DUP, ERR_GROUP_NUMBER, ERR_SET_SIZE)', () => {
      expect(V2_ZH_REASONING_SYSTEM_PROMPT).toMatch(/ERR_GROUP_COLOR_DUP/);
      expect(V2_ZH_REASONING_SYSTEM_PROMPT).toMatch(/ERR_GROUP_NUMBER/);
      expect(V2_ZH_REASONING_SYSTEM_PROMPT).toMatch(/ERR_SET_SIZE/);
    });

    it('컬러 축약은 영문으로 보존된다 (R, B, Y, K)', () => {
      // 명시적 "R, B, Y, K" 표기 확인
      expect(V2_ZH_REASONING_SYSTEM_PROMPT).toMatch(/R, B, Y, K/);
    });

    it('v2 구조 섹션을 중문으로 유지한다 (牌编码, 规则, 示例, 清单, 流程, 回复格式)', () => {
      expect(V2_ZH_REASONING_SYSTEM_PROMPT).toMatch(/牌编码/);
      expect(V2_ZH_REASONING_SYSTEM_PROMPT).toMatch(/规则/);
      expect(V2_ZH_REASONING_SYSTEM_PROMPT).toMatch(/示例/);
      expect(V2_ZH_REASONING_SYSTEM_PROMPT).toMatch(/验证清单/);
      expect(V2_ZH_REASONING_SYSTEM_PROMPT).toMatch(/逐步推理流程/);
      expect(V2_ZH_REASONING_SYSTEM_PROMPT).toMatch(/回复格式/);
    });

    it('출력 언어 리마인더 블록을 포함한다 (关于输出语言的重要说明)', () => {
      expect(V2_ZH_REASONING_SYSTEM_PROMPT).toMatch(/关于输出语言的重要说明/);
      expect(V2_ZH_REASONING_SYSTEM_PROMPT).toMatch(
        /推理过程可以使用中文或英文/,
      );
      expect(V2_ZH_REASONING_SYSTEM_PROMPT).toMatch(/英文字段名/);
    });

    it('JSON-only 강제 문구(중문)를 포함한다', () => {
      expect(V2_ZH_REASONING_SYSTEM_PROMPT).toMatch(
        /只输出原始 JSON|禁止 markdown/,
      );
    });

    it('few-shot JSON 응답 예시의 "reasoning" 값은 영문이다', () => {
      // Example 1 의 draw reasoning
      expect(V2_ZH_REASONING_SYSTEM_PROMPT).toMatch(
        /"reasoning":"no valid group or run/,
      );
      // Example 2 의 place reasoning
      expect(V2_ZH_REASONING_SYSTEM_PROMPT).toMatch(
        /"reasoning":"Red run 10-11-12/,
      );
    });
  });

  describe('buildV2ZhUserPrompt', () => {
    it('중문 섹션 헤더를 포함한다 (当前桌面, 我的手牌, 游戏状态, 你的任务)', () => {
      const p = buildV2ZhUserPrompt(makeGameState());
      expect(p).toMatch(/当前桌面/);
      expect(p).toMatch(/我的手牌/);
      expect(p).toMatch(/游戏状态/);
      expect(p).toMatch(/你的任务/);
    });

    it('타일 코드는 영문으로 보존된다 (R7a, B7b 등 입력값 그대로)', () => {
      const p = buildV2ZhUserPrompt(
        makeGameState({
          tableGroups: [{ tiles: ['R7a', 'B7a', 'K7a'] }],
          myTiles: ['R10a', 'B10b', 'Y2a'],
        }),
      );
      expect(p).toMatch(/R7a/);
      expect(p).toMatch(/B10b/);
      expect(p).toMatch(/Y2a/);
      expect(p).toMatch(/手牌|桌面/);
    });

    it('빈 桌面 상태 중문 표기 "(空桌面)" 를 포함한다', () => {
      const p = buildV2ZhUserPrompt(makeGameState());
      expect(p).toMatch(/空桌面/);
    });

    it('initialMeldDone=false 시 "首次出牌：未完成" + 30 점 요구 명시', () => {
      const p = buildV2ZhUserPrompt(makeGameState({ initialMeldDone: false }));
      expect(p).toMatch(/首次出牌：未完成/);
      expect(p).toMatch(/>= 30/);
    });

    it('initialMeldDone=true 시 "首次出牌：已完成" 표기', () => {
      const p = buildV2ZhUserPrompt(makeGameState({ initialMeldDone: true }));
      expect(p).toMatch(/首次出牌：已完成/);
    });

    it('상대 잔여 <=3 이면 "警告：接近获胜！" 포함', () => {
      const p = buildV2ZhUserPrompt(
        makeGameState({
          opponents: [{ playerId: 'opponent-01', remainingTiles: 2 }],
        }),
      );
      expect(p).toMatch(/警告：接近获胜/);
    });

    it('턴 번호와 draw pile 수를 중문 라벨과 함께 출력', () => {
      const p = buildV2ZhUserPrompt(
        makeGameState({ turnNumber: 7, drawPileCount: 42 }),
      );
      expect(p).toMatch(/回合: 7/);
      expect(p).toMatch(/牌堆剩余: 42/);
    });
  });

  describe('buildV2ZhRetryPrompt', () => {
    it('재시도 헤더 "# 重试" + 시도 횟수 포함', () => {
      const p = buildV2ZhRetryPrompt(makeGameState(), 'invalid group', 1);
      expect(p).toMatch(/# 重试/);
      expect(p).toMatch(/第 2 次/);
    });

    it('errorReason 문자열을 본문에 포함', () => {
      const p = buildV2ZhRetryPrompt(makeGameState(), 'ERR_GROUP_COLOR_DUP', 0);
      expect(p).toMatch(/ERR_GROUP_COLOR_DUP/);
    });

    it('중문 오류 안내 + fallback JSON 예시 포함', () => {
      const p = buildV2ZhRetryPrompt(makeGameState(), 'invalid', 0);
      expect(p).toMatch(/需要避免的常见错误/);
      expect(p).toMatch(/"action":"draw"/);
    });
  });
});
