import {
  V3_REASONING_SYSTEM_PROMPT,
  buildV3UserPrompt,
  buildV3RetryPrompt,
} from './v3-reasoning-prompt';

// -----------------------------------------------------------------------
// V3 Reasoning Prompt 단위 테스트
//
// 목적:
//   - v3 시스템 프롬프트의 4가지 개선 사항이 올바르게 반영되었는지 검증
//   - buildV3UserPrompt/buildV3RetryPrompt가 기대 형식을 생성하는지 확인
//   - v2 대비 추가된 핵심 텍스트가 누락 없이 포함되었는지 확인
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

const makeGameStateWithTable = () => ({
  tableGroups: [
    { tiles: ['R3a', 'R4a', 'R5a'] },
    { tiles: ['B7a', 'Y7a', 'K7a'] },
    { tiles: ['K1a', 'K2a', 'K3a'] },
  ],
  myTiles: ['R6a', 'B2a', 'K10a'],
  turnNumber: 10,
  drawPileCount: 40,
  initialMeldDone: true,
  opponents: [
    { playerId: 'opponent-01', remainingTiles: 5 },
    { playerId: 'opponent-02', remainingTiles: 2 },
  ],
});

describe('V3 Reasoning Prompt', () => {
  // =================================================================
  // V3_REASONING_SYSTEM_PROMPT 검증
  // =================================================================
  describe('V3_REASONING_SYSTEM_PROMPT', () => {
    it('v2 기본 구조를 유지한다 (타일 인코딩, 규칙, 예시, 체크리스트, 절차, 응답 형식)', () => {
      expect(V3_REASONING_SYSTEM_PROMPT).toContain('# Tile Encoding');
      expect(V3_REASONING_SYSTEM_PROMPT).toContain('# Rules');
      expect(V3_REASONING_SYSTEM_PROMPT).toContain('## GROUP Rules');
      expect(V3_REASONING_SYSTEM_PROMPT).toContain('## RUN Rules');
      expect(V3_REASONING_SYSTEM_PROMPT).toContain('## Size Rule');
      expect(V3_REASONING_SYSTEM_PROMPT).toContain('## Initial Meld Rule');
      expect(V3_REASONING_SYSTEM_PROMPT).toContain('# Few-Shot Examples');
      expect(V3_REASONING_SYSTEM_PROMPT).toContain(
        '# Pre-Submission Validation Checklist',
      );
      expect(V3_REASONING_SYSTEM_PROMPT).toContain(
        '# Step-by-Step Thinking Procedure',
      );
      expect(V3_REASONING_SYSTEM_PROMPT).toContain('# Response Format');
    });

    it('JSON-only 강제 문구가 포함된다', () => {
      expect(V3_REASONING_SYSTEM_PROMPT).toContain(
        'Output raw JSON only. No markdown, no code blocks, no explanation text.',
      );
    });

    // 후보 1: 자기 검증 강화 (a/b 세트 구분자 혼동 방지)
    describe('후보 1: 자기 검증 강화', () => {
      it('체크리스트 3번이 확장되어 a/b 세트 구분자 설명을 포함한다', () => {
        expect(V3_REASONING_SYSTEM_PROMPT).toContain(
          'CRITICAL: R7a and R7b are BOTH color R (Red). Same color = REJECTED!',
        );
        expect(V3_REASONING_SYSTEM_PROMPT).toContain(
          'The "a" or "b" suffix distinguishes duplicate tiles, NOT colors',
        );
        expect(V3_REASONING_SYSTEM_PROMPT).toContain(
          'A group can have at most 4 tiles (one per color: R, B, Y, K)',
        );
      });

      it('타일 인코딩 섹션에도 a/b 설명이 추가되었다', () => {
        expect(V3_REASONING_SYSTEM_PROMPT).toContain(
          'R7a and R7b are BOTH Red (R). B5a and B5b are BOTH Blue (B).',
        );
      });

      it('INVALID GROUP 예시에 a/b 혼동 설명이 추가되었다', () => {
        expect(V3_REASONING_SYSTEM_PROMPT).toContain(
          'R7a and R7b are BOTH Red! The a/b suffix is NOT a color difference!',
        );
      });
    });

    // 후보 2: 무효 패턴 few-shot
    describe('후보 2: 무효 패턴 few-shot', () => {
      it('실전 무효 배치 사례 3가지가 포함된다', () => {
        expect(V3_REASONING_SYSTEM_PROMPT).toContain(
          '# Common Mistakes from Real Games (NEVER repeat these)',
        );
        expect(V3_REASONING_SYSTEM_PROMPT).toContain(
          '## Mistake 1: Duplicate color in group (ERR_GROUP_COLOR_DUP)',
        );
        expect(V3_REASONING_SYSTEM_PROMPT).toContain(
          '## Mistake 2: Omitting existing table groups (ERR_TABLE_TILE_MISSING)',
        );
        expect(V3_REASONING_SYSTEM_PROMPT).toContain(
          '## Mistake 3: Gap in run (ERR_RUN_SEQUENCE)',
        );
      });

      it('Mistake 1에서 WRONG/CORRECT 분석이 포함된다', () => {
        expect(V3_REASONING_SYSTEM_PROMPT).toContain(
          'WRONG! R7a and R7b are BOTH Red (R)',
        );
        expect(V3_REASONING_SYSTEM_PROMPT).toContain(
          'R7a+R7b are same color R, cannot form group',
        );
      });

      it('Mistake 2에서 그룹 누락 사례가 포함된다', () => {
        expect(V3_REASONING_SYSTEM_PROMPT).toContain(
          '4 groups MISSING -> REJECTED',
        );
        expect(V3_REASONING_SYSTEM_PROMPT).toContain(
          'ALL 5 groups (Group1 extended + Group2~5 unchanged)',
        );
      });

      it('Mistake 3에서 비연속 런 사례가 포함된다', () => {
        expect(V3_REASONING_SYSTEM_PROMPT).toContain(
          'B5,B7,B8 has gap at 6, not a valid run',
        );
      });
    });

    // 후보 3: 테이블 그룹 누락 방지
    describe('후보 3: 테이블 그룹 누락 방지', () => {
      it('체크리스트 5번이 카운팅 체크로 강화되었다', () => {
        expect(V3_REASONING_SYSTEM_PROMPT).toContain(
          'Count your tableGroups entries',
        );
        expect(V3_REASONING_SYSTEM_PROMPT).toContain(
          'ERR_TABLE_TILE_MISSING -> REJECTED',
        );
      });

      it('tableGroups 규칙에 COUNTING CHECK가 추가되었다', () => {
        expect(V3_REASONING_SYSTEM_PROMPT).toContain(
          'COUNTING CHECK: if Current Table has N groups, your tableGroups must have >= N entries',
        );
      });
    });

    // 후보 4: 배치 최적화
    describe('후보 4: 배치 최적화', () => {
      it('Step 6가 세분화된 배치 전략을 포함한다', () => {
        expect(V3_REASONING_SYSTEM_PROMPT).toContain(
          'Compare all valid combinations to maximize tiles placed',
        );
        expect(V3_REASONING_SYSTEM_PROMPT).toContain(
          'count how many rack tiles it uses',
        );
        expect(V3_REASONING_SYSTEM_PROMPT).toContain(
          'prefer extending',
        );
        expect(V3_REASONING_SYSTEM_PROMPT).toContain(
          'Tie-breaker: prefer placing higher-number tiles',
        );
      });

      it('Step 2에서 a/b 혼동 경고가 포함된다', () => {
        expect(V3_REASONING_SYSTEM_PROMPT).toContain(
          'R7a and R7b are the SAME color (R). Do not count them as different colors!',
        );
      });
    });

    // 5개의 기존 few-shot 예시 유지 확인
    it('기존 5개의 정상 few-shot 예시가 모두 유지된다', () => {
      expect(V3_REASONING_SYSTEM_PROMPT).toContain('## Example 1: Draw');
      expect(V3_REASONING_SYSTEM_PROMPT).toContain(
        '## Example 2: Place single run',
      );
      expect(V3_REASONING_SYSTEM_PROMPT).toContain(
        '## Example 3: Place group',
      );
      expect(V3_REASONING_SYSTEM_PROMPT).toContain(
        '## Example 4: Extend existing table group',
      );
      expect(V3_REASONING_SYSTEM_PROMPT).toContain(
        '## Example 5: Multiple sets placed at once',
      );
    });
  });

  // =================================================================
  // buildV3UserPrompt 검증
  // =================================================================
  describe('buildV3UserPrompt', () => {
    it('빈 테이블에서는 CRITICAL 그룹 수 카운팅을 생성하지 않는다', () => {
      const prompt = buildV3UserPrompt(makeGameState());
      expect(prompt).toContain('(empty table)');
      expect(prompt).not.toContain('CRITICAL: There are exactly');
    });

    it('테이블 그룹이 있으면 CRITICAL 그룹 수 카운팅을 생성한다', () => {
      const prompt = buildV3UserPrompt(makeGameStateWithTable());
      expect(prompt).toContain('CRITICAL: There are exactly 3 groups above.');
      expect(prompt).toContain(
        'Your tableGroups array MUST contain at least 3 entries',
      );
      expect(prompt).toContain(
        'If your tableGroups has fewer than 3 entries -> REJECTED.',
      );
    });

    it('모든 테이블 그룹이 나열된다', () => {
      const prompt = buildV3UserPrompt(makeGameStateWithTable());
      expect(prompt).toContain('Group1: [R3a, R4a, R5a]');
      expect(prompt).toContain('Group2: [B7a, Y7a, K7a]');
      expect(prompt).toContain('Group3: [K1a, K2a, K3a]');
    });

    it('내 타일이 올바르게 출력된다', () => {
      const prompt = buildV3UserPrompt(makeGameState());
      expect(prompt).toContain('[R7a, B7b, K3a, Y11a] (4 tiles)');
    });

    it('initialMeldDone=false일 때 30점 제한 안내가 포함된다', () => {
      const prompt = buildV3UserPrompt(makeGameState());
      expect(prompt).toContain('Initial Meld: NOT DONE');
      expect(prompt).toContain('sum >= 30 points');
      expect(prompt).toContain('ONLY use your rack tiles');
    });

    it('initialMeldDone=true일 때 확장 안내가 포함된다', () => {
      const prompt = buildV3UserPrompt(makeGameStateWithTable());
      expect(prompt).toContain('Initial Meld: DONE');
      expect(prompt).toContain('extend or rearrange');
    });

    it('상대 정보가 포함된다', () => {
      const prompt = buildV3UserPrompt(makeGameStateWithTable());
      expect(prompt).toContain('opponent-01: 5 tiles');
      expect(prompt).toContain(
        'opponent-02: 2 tiles WARNING: close to winning!',
      );
    });

    it('a/b 색상 혼동 경고가 Validation Reminders에 포함된다', () => {
      const prompt = buildV3UserPrompt(makeGameState());
      expect(prompt).toContain(
        'CRITICAL: R7a and R7b are BOTH Red. Same color tiles in a group = REJECTED!',
      );
    });

    it('테이블 그룹 카운트 검증이 Validation Reminders에 포함된다 (그룹 있을 때)', () => {
      const prompt = buildV3UserPrompt(makeGameStateWithTable());
      expect(prompt).toContain(
        'Count check: table has 3 groups. Your tableGroups must have >= 3 entries.',
      );
    });

    it('테이블 그룹 카운트 검증이 Validation Reminders에 없다 (빈 테이블)', () => {
      const prompt = buildV3UserPrompt(makeGameState());
      expect(prompt).not.toContain('Count check:');
    });

    it('상대가 없으면 Opponents 섹션이 없다', () => {
      const prompt = buildV3UserPrompt(
        makeGameState({ opponents: [] }),
      );
      expect(prompt).not.toContain('# Opponents');
    });

    it('JSON-only 지시로 끝난다', () => {
      const prompt = buildV3UserPrompt(makeGameState());
      expect(prompt).toContain(
        'Respond with ONLY the JSON object. No other text.',
      );
    });
  });

  // =================================================================
  // buildV3RetryPrompt 검증
  // =================================================================
  describe('buildV3RetryPrompt', () => {
    it('기본 유저 프롬프트를 포함한다', () => {
      const prompt = buildV3RetryPrompt(makeGameState(), 'invalid JSON', 0);
      expect(prompt).toContain('# Current Table');
      expect(prompt).toContain('# My Rack Tiles');
    });

    it('재시도 안내와 에러 원인이 포함된다', () => {
      const prompt = buildV3RetryPrompt(
        makeGameState(),
        'missing action field',
        1,
      );
      expect(prompt).toContain('# RETRY (attempt 2)');
      expect(prompt).toContain(
        'Your previous response was INVALID: missing action field',
      );
    });

    it('a/b 색상 혼동 경고가 재시도 프롬프트에 포함된다', () => {
      const prompt = buildV3RetryPrompt(makeGameState(), 'invalid', 0);
      expect(prompt).toContain(
        'R7a and R7b are BOTH Red (R). Putting them in the same group = REJECTED.',
      );
    });

    it('테이블 그룹이 있으면 그룹 수 카운팅 안내가 포함된다', () => {
      const prompt = buildV3RetryPrompt(
        makeGameStateWithTable(),
        'missing table tiles',
        0,
      );
      expect(prompt).toContain(
        'Table has 3 groups. Your tableGroups must have >= 3 entries.',
      );
    });

    it('빈 테이블이면 그룹 수 카운팅 안내가 없다', () => {
      const prompt = buildV3RetryPrompt(
        makeGameState(),
        'parse error',
        0,
      );
      expect(prompt).not.toContain('Table has');
    });

    it('안전한 fallback draw 안내가 포함된다', () => {
      const prompt = buildV3RetryPrompt(makeGameState(), 'error', 2);
      expect(prompt).toContain(
        'If unsure, just respond: {"action":"draw","reasoning":"no valid combination"}',
      );
    });

    it('시도 횟수가 올바르게 표시된다', () => {
      const prompt0 = buildV3RetryPrompt(makeGameState(), 'e', 0);
      const prompt1 = buildV3RetryPrompt(makeGameState(), 'e', 1);
      const prompt2 = buildV3RetryPrompt(makeGameState(), 'e', 2);
      expect(prompt0).toContain('attempt 1');
      expect(prompt1).toContain('attempt 2');
      expect(prompt2).toContain('attempt 3');
    });
  });
});
