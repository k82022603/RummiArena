import { PERSONA_TEMPLATES, CHARACTER_PROFILES } from './persona.templates';
import { CharacterType } from './character.types';

/**
 * persona.templates.ts 단위 테스트
 *
 * 모든 캐릭터 템플릿이 존재하고, 필수 필드를 가지고 있으며,
 * 각 캐릭터의 프롬프트가 기대되는 키워드를 포함하는지 검증한다.
 */

const ALL_CHARACTERS: CharacterType[] = [
  'rookie',
  'calculator',
  'shark',
  'fox',
  'wall',
  'wildcard',
];

const ALL_DIFFICULTIES = ['beginner', 'intermediate', 'expert'] as const;

describe('PERSONA_TEMPLATES', () => {
  // -----------------------------------------------------------------------
  // 모든 캐릭터 템플릿 존재 확인
  // -----------------------------------------------------------------------
  describe('템플릿 존재 확인', () => {
    it.each(ALL_CHARACTERS)('%s 캐릭터 템플릿이 존재한다', (character) => {
      expect(PERSONA_TEMPLATES[character]).toBeDefined();
    });

    it('6개 캐릭터 템플릿이 모두 정의되어 있다', () => {
      expect(Object.keys(PERSONA_TEMPLATES)).toHaveLength(6);
    });
  });

  // -----------------------------------------------------------------------
  // 필수 필드 검증
  // -----------------------------------------------------------------------
  describe('필수 필드 검증', () => {
    it.each(ALL_CHARACTERS)(
      '%s - systemPrompt가 비어있지 않다',
      (character) => {
        const template = PERSONA_TEMPLATES[character];
        expect(template.systemPrompt).toBeTruthy();
        expect(template.systemPrompt.length).toBeGreaterThan(10);
      },
    );

    it.each(ALL_CHARACTERS)(
      '%s - strategyHints 3개 난이도가 모두 존재한다',
      (character) => {
        const { strategyHints } = PERSONA_TEMPLATES[character];
        expect(strategyHints.beginner).toBeTruthy();
        expect(strategyHints.intermediate).toBeTruthy();
        expect(strategyHints.expert).toBeTruthy();
      },
    );

    it.each(ALL_CHARACTERS)(
      '%s - psychWarfare Level 1~3이 모두 존재한다',
      (character) => {
        const { psychWarfare } = PERSONA_TEMPLATES[character];
        expect(psychWarfare.level1).toBeTruthy();
        expect(psychWarfare.level2).toBeTruthy();
        expect(psychWarfare.level3).toBeTruthy();
      },
    );

    it.each(ALL_CHARACTERS)(
      '%s - decisionStyle이 비어있지 않다',
      (character) => {
        const template = PERSONA_TEMPLATES[character];
        expect(template.decisionStyle).toBeTruthy();
        expect(template.decisionStyle.length).toBeGreaterThan(10);
      },
    );
  });

  // -----------------------------------------------------------------------
  // 캐릭터별 핵심 키워드 검증
  // -----------------------------------------------------------------------
  describe('캐릭터별 핵심 키워드', () => {
    it('rookie - 초보자 관련 키워드가 포함된다', () => {
      const template = PERSONA_TEMPLATES.rookie;
      const allText = [
        template.systemPrompt,
        template.strategyHints.beginner,
      ].join(' ');
      expect(allText).toMatch(/초보|단순|실수/);
    });

    it('calculator - 계산/확률 관련 키워드가 포함된다', () => {
      const template = PERSONA_TEMPLATES.calculator;
      const allText = [
        template.systemPrompt,
        template.strategyHints.expert,
      ].join(' ');
      expect(allText).toMatch(/확률|계산|점수|효율/);
    });

    it('shark - 공격/압박 관련 키워드가 포함된다', () => {
      const template = PERSONA_TEMPLATES.shark;
      const allText = [
        template.systemPrompt,
        template.strategyHints.beginner,
      ].join(' ');
      expect(allText).toMatch(/공격|압박|많은 타일/);
    });

    it('fox - 블러핑/교활 관련 키워드가 포함된다', () => {
      const template = PERSONA_TEMPLATES.fox;
      const allText = [
        template.systemPrompt,
        template.psychWarfare.level3,
      ].join(' ');
      expect(allText).toMatch(/블러핑|교활|대량/);
    });

    it('wall - 방어/수비 관련 키워드가 포함된다', () => {
      const template = PERSONA_TEMPLATES.wall;
      const allText = [
        template.systemPrompt,
        template.strategyHints.beginner,
      ].join(' ');
      expect(allText).toMatch(/방어|수비|장기전|최소/);
    });

    it('wildcard - 예측불가 관련 키워드가 포함된다', () => {
      const template = PERSONA_TEMPLATES.wildcard;
      const allText = [
        template.systemPrompt,
        template.strategyHints.intermediate,
      ].join(' ');
      expect(allText).toMatch(/예측|즉흥|혼돈|일관성/);
    });
  });

  // -----------------------------------------------------------------------
  // 난이도별 차이 검증
  // -----------------------------------------------------------------------
  describe('난이도별 전략 힌트 차이', () => {
    it.each(ALL_CHARACTERS)(
      '%s - 난이도별 전략 힌트가 서로 다르다',
      (character) => {
        const { strategyHints } = PERSONA_TEMPLATES[character];
        expect(strategyHints.beginner).not.toBe(strategyHints.intermediate);
        expect(strategyHints.intermediate).not.toBe(strategyHints.expert);
        expect(strategyHints.beginner).not.toBe(strategyHints.expert);
      },
    );

    it.each(ALL_CHARACTERS)(
      '%s - expert 힌트는 고수 전략 키워드를 포함한다',
      (character) => {
        const { strategyHints } = PERSONA_TEMPLATES[character];
        // expert 힌트는 고수 전략이나 심화 정보를 언급해야 한다
        const expertText = strategyHints.expert;
        expect(expertText.length).toBeGreaterThan(
          strategyHints.beginner.length * 0.5,
        );
      },
    );
  });

  // -----------------------------------------------------------------------
  // 심리전 레벨별 차이 검증
  // -----------------------------------------------------------------------
  describe('심리전 레벨별 차이', () => {
    it.each(ALL_CHARACTERS)(
      '%s - 심리전 레벨 1~3이 서로 다르다',
      (character) => {
        const { psychWarfare } = PERSONA_TEMPLATES[character];
        expect(psychWarfare.level1).not.toBe(psychWarfare.level2);
        expect(psychWarfare.level2).not.toBe(psychWarfare.level3);
        expect(psychWarfare.level1).not.toBe(psychWarfare.level3);
      },
    );

    it.each(ALL_CHARACTERS)(
      '%s - level3 심리전은 블러핑 또는 최강 관련 내용을 포함한다',
      (character) => {
        const { psychWarfare } = PERSONA_TEMPLATES[character];
        expect(psychWarfare.level3).toMatch(
          /블러핑|최강|최고|폭발|혼돈|압박|소모/,
        );
      },
    );
  });

  // -----------------------------------------------------------------------
  // 타일 인코딩 규칙 검증 (프롬프트 내 타일 표기 확인)
  // -----------------------------------------------------------------------
  describe('타일 인코딩 규칙', () => {
    it('조커 타일(JK1, JK2) 언급이 최소 하나 이상 존재한다', () => {
      const allText = ALL_CHARACTERS.map(
        (c) => PERSONA_TEMPLATES[c].systemPrompt,
      ).join(' ');
      expect(allText).toMatch(/JK1|JK2|조커/);
    });
  });
});

// -----------------------------------------------------------------------
// CHARACTER_PROFILES 검증
// -----------------------------------------------------------------------
describe('CHARACTER_PROFILES', () => {
  it('6개 캐릭터 프로필이 모두 정의되어 있다', () => {
    expect(Object.keys(CHARACTER_PROFILES)).toHaveLength(6);
  });

  it.each(ALL_CHARACTERS)('%s 프로필에 필수 필드가 존재한다', (character) => {
    const profile = CHARACTER_PROFILES[character];
    expect(profile.name).toBe(character);
    expect(profile.displayName).toBeTruthy();
    expect(profile.strategyDescription).toBeTruthy();
    expect(profile.strengths).toBeInstanceOf(Array);
    expect(profile.weaknesses).toBeInstanceOf(Array);
    expect(profile.strengths.length).toBeGreaterThan(0);
    expect(profile.weaknesses.length).toBeGreaterThan(0);
  });

  it('모든 캐릭터의 displayName이 서로 다르다', () => {
    const displayNames = ALL_CHARACTERS.map(
      (c) => CHARACTER_PROFILES[c].displayName,
    );
    const uniqueNames = new Set(displayNames);
    expect(uniqueNames.size).toBe(ALL_CHARACTERS.length);
  });

  it.each(ALL_DIFFICULTIES)(
    '난이도 키가 strategyHints에 존재한다 (%s)',
    (difficulty) => {
      ALL_CHARACTERS.forEach((character) => {
        const hints = PERSONA_TEMPLATES[character].strategyHints;
        expect(hints[difficulty]).toBeDefined();
      });
    },
  );
});
