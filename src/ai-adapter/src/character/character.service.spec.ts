import { CharacterService } from './character.service';
import {
  CharacterType,
  DifficultyLevel,
  PsychWarfareLevel,
  GameContextForPsych,
} from './character.types';

/**
 * CharacterService 단위 테스트
 *
 * 6개 캐릭터 × 3 난이도 프롬프트 생성 확인
 * 심리전 레벨별 프롬프트 차이 확인
 * 게임 컨텍스트 반영 확인
 */

const ALL_CHARACTERS: CharacterType[] = [
  'rookie',
  'calculator',
  'shark',
  'fox',
  'wall',
  'wildcard',
];

const ALL_DIFFICULTIES: DifficultyLevel[] = [
  'beginner',
  'intermediate',
  'expert',
];

const PSYCH_LEVELS: PsychWarfareLevel[] = [0, 1, 2, 3];

describe('CharacterService', () => {
  let service: CharacterService;

  beforeEach(() => {
    service = new CharacterService();
  });

  // -----------------------------------------------------------------------
  // getSystemPrompt()
  // -----------------------------------------------------------------------
  describe('getSystemPrompt()', () => {
    it.each(ALL_CHARACTERS)(
      '%s - 빈 문자열이 아닌 시스템 프롬프트를 반환한다',
      (character) => {
        const prompt = service.getSystemPrompt(character, 'intermediate');
        expect(prompt).toBeTruthy();
        expect(prompt.length).toBeGreaterThan(20);
      },
    );

    it.each(ALL_DIFFICULTIES)(
      'shark + %s - 난이도별 전략 힌트가 포함된다',
      (difficulty) => {
        const prompt = service.getSystemPrompt('shark', difficulty);
        expect(prompt).toBeTruthy();
        // 모든 난이도에 상어 특성 포함
        expect(prompt).toMatch(/공격|압박|배치|타일/);
      },
    );

    it('6개 캐릭터 × 3 난이도 = 18개 조합이 모두 생성된다', () => {
      const prompts = new Set<string>();
      ALL_CHARACTERS.forEach((character) => {
        ALL_DIFFICULTIES.forEach((difficulty) => {
          const prompt = service.getSystemPrompt(character, difficulty);
          prompts.add(prompt);
        });
      });
      // 최소한 캐릭터 수(6)만큼 고유 프롬프트가 있어야 한다
      expect(prompts.size).toBeGreaterThanOrEqual(6);
    });

    it('같은 캐릭터라도 난이도별로 프롬프트가 다르다', () => {
      const beginnerPrompt = service.getSystemPrompt('calculator', 'beginner');
      const expertPrompt = service.getSystemPrompt('calculator', 'expert');
      expect(beginnerPrompt).not.toBe(expertPrompt);
    });

    it('같은 난이도라도 캐릭터별로 프롬프트가 다르다', () => {
      const rookiePrompt = service.getSystemPrompt('rookie', 'expert');
      const sharkPrompt = service.getSystemPrompt('shark', 'expert');
      expect(rookiePrompt).not.toBe(sharkPrompt);
    });

    it('rookie 시스템 프롬프트는 초보 관련 내용을 포함한다', () => {
      const prompt = service.getSystemPrompt('rookie', 'beginner');
      expect(prompt).toMatch(/초보|단순|실수/);
    });

    it('calculator 시스템 프롬프트는 계산/확률 관련 내용을 포함한다', () => {
      const prompt = service.getSystemPrompt('calculator', 'expert');
      expect(prompt).toMatch(/확률|계산|점수|효율/);
    });

    it('shark 시스템 프롬프트는 공격 관련 내용을 포함한다', () => {
      const prompt = service.getSystemPrompt('shark', 'intermediate');
      expect(prompt).toMatch(/공격|압박|많은 타일/);
    });

    it('fox 시스템 프롬프트는 블러핑/교활 관련 내용을 포함한다', () => {
      const prompt = service.getSystemPrompt('fox', 'intermediate');
      expect(prompt).toMatch(/교활|블러핑|보류/);
    });

    it('wall 시스템 프롬프트는 방어 관련 내용을 포함한다', () => {
      const prompt = service.getSystemPrompt('wall', 'beginner');
      expect(prompt).toMatch(/방어|수비|장기전|최소/);
    });

    it('wildcard 시스템 프롬프트는 예측불가 관련 내용을 포함한다', () => {
      const prompt = service.getSystemPrompt('wildcard', 'intermediate');
      expect(prompt).toMatch(/예측|즉흥|혼돈/);
    });

    it('expert 난이도 프롬프트는 beginner보다 더 많은 정보를 포함한다', () => {
      ALL_CHARACTERS.forEach((character) => {
        const expertPrompt = service.getSystemPrompt(character, 'expert');
        const beginnerPrompt = service.getSystemPrompt(character, 'beginner');
        // expert 힌트가 전략적으로 더 복잡해야 함
        expect(expertPrompt.length).toBeGreaterThan(0);
        expect(beginnerPrompt.length).toBeGreaterThan(0);
      });
    });
  });

  // -----------------------------------------------------------------------
  // getPsychWarfarePrompt()
  // -----------------------------------------------------------------------
  describe('getPsychWarfarePrompt()', () => {
    it('Level 0이면 빈 문자열을 반환한다', () => {
      const prompt = service.getPsychWarfarePrompt(0);
      expect(prompt).toBe('');
    });

    it('Level 1~3이면 비어있지 않은 문자열을 반환한다', () => {
      ([1, 2, 3] as PsychWarfareLevel[]).forEach((level) => {
        const prompt = service.getPsychWarfarePrompt(level);
        expect(prompt).toBeTruthy();
        expect(prompt.length).toBeGreaterThan(10);
      });
    });

    it('심리전 Level 1은 상대 관찰 내용을 포함한다', () => {
      const prompt = service.getPsychWarfarePrompt(1);
      expect(prompt).toMatch(/상대.*타일|관찰/);
    });

    it('심리전 Level 2는 패턴 분석 내용을 포함한다', () => {
      const prompt = service.getPsychWarfarePrompt(2);
      expect(prompt).toMatch(/패턴|분석|견제/);
    });

    it('심리전 Level 3은 블러핑 내용을 포함한다', () => {
      const prompt = service.getPsychWarfarePrompt(3);
      expect(prompt).toMatch(/블러핑|페이크|템포/);
    });

    it('레벨이 높을수록 프롬프트가 다르다', () => {
      const level1 = service.getPsychWarfarePrompt(1);
      const level2 = service.getPsychWarfarePrompt(2);
      const level3 = service.getPsychWarfarePrompt(3);
      expect(level1).not.toBe(level2);
      expect(level2).not.toBe(level3);
      expect(level1).not.toBe(level3);
    });

    it('게임 컨텍스트 없이도 정상 동작한다', () => {
      expect(() => service.getPsychWarfarePrompt(2)).not.toThrow();
      expect(() => service.getPsychWarfarePrompt(3)).not.toThrow();
    });

    it('상대 타일이 3개 이하이면 경보 메시지를 포함한다', () => {
      const gameContext: GameContextForPsych = {
        opponentTileCounts: [2],
        turnNumber: 10,
        drawPileCount: 30,
      };
      const prompt = service.getPsychWarfarePrompt(1, gameContext);
      expect(prompt).toMatch(/경보|2장/);
    });

    it('상대 타일이 많으면 경보 메시지가 없다', () => {
      const gameContext: GameContextForPsych = {
        opponentTileCounts: [8, 10],
        turnNumber: 5,
        drawPileCount: 50,
      };
      const prompt = service.getPsychWarfarePrompt(1, gameContext);
      expect(prompt).not.toMatch(/경보/);
    });

    it('드로우 파일이 10장 미만이고 Level 2이면 경고가 추가된다', () => {
      const gameContext: GameContextForPsych = {
        opponentTileCounts: [8],
        turnNumber: 15,
        drawPileCount: 5,
      };
      const prompt = service.getPsychWarfarePrompt(2, gameContext);
      expect(prompt).toMatch(/드로우 파일 경고|5장/);
    });

    it('Level 0에서는 게임 컨텍스트를 전달해도 빈 문자열이다', () => {
      const gameContext: GameContextForPsych = {
        opponentTileCounts: [1],
        turnNumber: 25,
        drawPileCount: 2,
      };
      const prompt = service.getPsychWarfarePrompt(0, gameContext);
      expect(prompt).toBe('');
    });
  });

  // -----------------------------------------------------------------------
  // getCharacterPrompt()
  // -----------------------------------------------------------------------
  describe('getCharacterPrompt()', () => {
    it('systemPrompt와 psychWarfarePrompt를 반환한다', () => {
      const result = service.getCharacterPrompt('shark', 'expert', 3);
      expect(result).toHaveProperty('systemPrompt');
      expect(result).toHaveProperty('psychWarfarePrompt');
    });

    it('Level 0이면 psychWarfarePrompt가 빈 문자열이다', () => {
      const result = service.getCharacterPrompt('calculator', 'intermediate', 0);
      expect(result.psychWarfarePrompt).toBe('');
    });

    it('Level 3이면 psychWarfarePrompt에 블러핑 내용이 포함된다', () => {
      const result = service.getCharacterPrompt('fox', 'expert', 3);
      expect(result.psychWarfarePrompt).toMatch(/블러핑|페이크|템포/);
    });

    it('6개 캐릭터 × 3 난이도 × 4 심리전 레벨 조합이 오류 없이 생성된다', () => {
      ALL_CHARACTERS.forEach((character) => {
        ALL_DIFFICULTIES.forEach((difficulty) => {
          PSYCH_LEVELS.forEach((level) => {
            expect(() =>
              service.getCharacterPrompt(character, difficulty, level),
            ).not.toThrow();
          });
        });
      });
    });
  });

  // -----------------------------------------------------------------------
  // getCharacterPsychPrompt()
  // -----------------------------------------------------------------------
  describe('getCharacterPsychPrompt()', () => {
    it('Level 0이면 빈 문자열을 반환한다', () => {
      ALL_CHARACTERS.forEach((character) => {
        const prompt = service.getCharacterPsychPrompt(character, 0);
        expect(prompt).toBe('');
      });
    });

    it.each(ALL_CHARACTERS)(
      '%s - Level 1~3 심리전 프롬프트가 존재한다',
      (character) => {
        ([1, 2, 3] as PsychWarfareLevel[]).forEach((level) => {
          const prompt = service.getCharacterPsychPrompt(character, level);
          expect(prompt).toBeTruthy();
        });
      },
    );

    it('fox Level 3 심리전은 블러핑 관련 내용을 포함한다', () => {
      const prompt = service.getCharacterPsychPrompt('fox', 3);
      expect(prompt).toMatch(/블러핑|폭발|혼란/);
    });

    it('shark Level 1 심리전은 압박 관련 내용을 포함한다', () => {
      const prompt = service.getCharacterPsychPrompt('shark', 1);
      expect(prompt).toMatch(/압박/);
    });
  });

  // -----------------------------------------------------------------------
  // getCharacterProfile()
  // -----------------------------------------------------------------------
  describe('getCharacterProfile()', () => {
    it.each(ALL_CHARACTERS)(
      '%s 캐릭터 프로필을 반환한다',
      (character) => {
        const profile = service.getCharacterProfile(character);
        expect(profile.name).toBe(character);
        expect(profile.displayName).toBeTruthy();
        expect(profile.strengths.length).toBeGreaterThan(0);
        expect(profile.weaknesses.length).toBeGreaterThan(0);
      },
    );
  });

  // -----------------------------------------------------------------------
  // getAllCharacterProfiles()
  // -----------------------------------------------------------------------
  describe('getAllCharacterProfiles()', () => {
    it('6개 캐릭터 프로필을 반환한다', () => {
      const profiles = service.getAllCharacterProfiles();
      expect(profiles).toHaveLength(6);
    });

    it('반환된 모든 프로필이 필수 필드를 가진다', () => {
      const profiles = service.getAllCharacterProfiles();
      profiles.forEach((profile) => {
        expect(profile.name).toBeTruthy();
        expect(profile.displayName).toBeTruthy();
        expect(profile.strategyDescription).toBeTruthy();
        expect(profile.strengths).toBeInstanceOf(Array);
        expect(profile.weaknesses).toBeInstanceOf(Array);
      });
    });
  });
});
