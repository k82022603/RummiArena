import { PromptBuilderService } from './prompt-builder.service';
import { MoveRequestDto, GameStateDto } from '../common/dto/move-request.dto';
import { CharacterService } from '../character/character.service';

describe('PromptBuilderService', () => {
  let service: PromptBuilderService;

  const makeRequest = (
    overrides: Partial<MoveRequestDto> = {},
  ): MoveRequestDto => ({
    gameId: 'game-001',
    playerId: 'player-ai-01',
    gameState: {
      tableGroups: [{ tiles: ['R7a', 'B7a', 'K7b'] }],
      myTiles: ['Y1a', 'Y2a', 'Y3a', 'R5b'],
      opponents: [{ playerId: 'player-02', remainingTiles: 8 }],
      drawPileCount: 28,
      turnNumber: 5,
      initialMeldDone: true,
    } as GameStateDto,
    persona: 'shark',
    difficulty: 'expert',
    psychologyLevel: 2,
    maxRetries: 3,
    timeoutMs: 30000,
    ...overrides,
  });

  beforeEach(() => {
    // CharacterService 없이 생성 — 레거시(구 템플릿) 폴백 경로
    service = new PromptBuilderService();
  });

  describe('buildSystemPrompt (레거시 폴백 — CharacterService 없음)', () => {
    it('시스템 프롬프트에 게임 규칙이 포함된다', () => {
      const prompt = service.buildSystemPrompt(makeRequest());
      expect(prompt).toContain('루미큐브');
      expect(prompt).toContain('타일 인코딩');
      expect(prompt).toContain('JSON');
    });

    it('JSON-only 강제 지시가 시스템 프롬프트 앞에 포함된다 (#31 gemma3:4b 최적화)', () => {
      const prompt = service.buildSystemPrompt(makeRequest());
      expect(prompt).toContain('You MUST respond with ONLY a valid JSON object');
      expect(prompt).toContain('No explanation, no markdown, no code blocks');
    });

    it('few-shot 예시가 시스템 프롬프트에 포함된다 (#31 gemma3:4b 최적화)', () => {
      const prompt = service.buildSystemPrompt(makeRequest());
      expect(prompt).toContain('"action":"draw"');
      expect(prompt).toContain('"action":"place"');
    });

    it('캐릭터 지시문이 포함된다', () => {
      const prompt = service.buildSystemPrompt(
        makeRequest({ persona: 'shark' }),
      );
      expect(prompt).toContain('공격적');
    });

    it('심리전 Level 0이면 심리전 지시문이 없다', () => {
      const prompt = service.buildSystemPrompt(
        makeRequest({ psychologyLevel: 0 }),
      );
      expect(prompt).not.toContain('심리전');
    });

    it('심리전 Level 3이면 블러핑 지시문이 포함된다', () => {
      const prompt = service.buildSystemPrompt(
        makeRequest({ psychologyLevel: 3 }),
      );
      expect(prompt).toContain('블러핑');
    });
  });

  describe('buildSystemPrompt (CharacterService 주입 — 신 템플릿 경로)', () => {
    let serviceWithCharacter: PromptBuilderService;
    let characterService: CharacterService;

    beforeEach(() => {
      characterService = new CharacterService();
      serviceWithCharacter = new PromptBuilderService(characterService);
    });

    it('CharacterService가 주입되면 getCharacterPrompt에 위임한다', () => {
      const spy = jest
        .spyOn(characterService, 'getCharacterPrompt')
        .mockReturnValue({
          systemPrompt: 'mocked-system-prompt',
          psychWarfarePrompt: '',
        });

      const result = serviceWithCharacter.buildSystemPrompt(makeRequest());

      expect(spy).toHaveBeenCalledWith('shark', 'expert', 2);
      expect(result).toBe('mocked-system-prompt');
    });

    it('CharacterService 주입 시 shark 캐릭터 시스템 프롬프트를 반환한다', () => {
      const prompt = serviceWithCharacter.buildSystemPrompt(
        makeRequest({ persona: 'shark' }),
      );
      // 신 템플릿(persona.templates.ts)의 shark systemPrompt 키워드 확인
      expect(prompt).toContain('공격');
    });

    it('CharacterService 주입 시 rookie 캐릭터 시스템 프롬프트를 반환한다', () => {
      const prompt = serviceWithCharacter.buildSystemPrompt(
        makeRequest({ persona: 'rookie' }),
      );
      expect(prompt).toContain('초보');
    });

    it('CharacterService 주입 시 calculator 캐릭터 시스템 프롬프트를 반환한다', () => {
      const prompt = serviceWithCharacter.buildSystemPrompt(
        makeRequest({ persona: 'calculator' }),
      );
      expect(prompt).toContain('확률');
    });

    it('CharacterService 주입 시 fox 캐릭터 시스템 프롬프트를 반환한다', () => {
      const prompt = serviceWithCharacter.buildSystemPrompt(
        makeRequest({ persona: 'fox' }),
      );
      expect(prompt).toContain('교활');
    });

    it('CharacterService 주입 시 wall 캐릭터 시스템 프롬프트를 반환한다', () => {
      const prompt = serviceWithCharacter.buildSystemPrompt(
        makeRequest({ persona: 'wall' }),
      );
      expect(prompt).toContain('방어');
    });

    it('CharacterService 주입 시 wildcard 캐릭터 시스템 프롬프트를 반환한다', () => {
      const prompt = serviceWithCharacter.buildSystemPrompt(
        makeRequest({ persona: 'wildcard' }),
      );
      expect(prompt).toContain('예측');
    });

    it('CharacterService 주입 시 모든 캐릭터 프롬프트에 JSON-only 지시가 포함된다 (#31)', () => {
      const characters = [
        'rookie',
        'calculator',
        'shark',
        'fox',
        'wall',
        'wildcard',
      ] as const;
      characters.forEach((persona) => {
        const prompt = serviceWithCharacter.buildSystemPrompt(
          makeRequest({ persona }),
        );
        expect(prompt).toContain('You MUST respond with ONLY a valid JSON object');
        expect(prompt).toContain('"action":"draw"');
        expect(prompt).toContain('"action":"place"');
      });
    });
  });

  describe('buildSystemPrompt (CharacterService 없음 — 레거시 폴백 명시 검증)', () => {
    it('CharacterService가 undefined이면 레거시 buildSystemPrompt를 사용한다', () => {
      const legacyService = new PromptBuilderService(undefined);
      const prompt = legacyService.buildSystemPrompt(makeRequest());
      // 구 템플릿의 BASE_SYSTEM_PROMPT 포함 여부 확인
      expect(prompt).toContain('루미큐브(Rummikub) 게임 AI 플레이어');
    });
  });

  describe('buildUserPrompt', () => {
    it('테이블 상태가 포함된다', () => {
      const prompt = service.buildUserPrompt(makeRequest());
      expect(prompt).toContain('테이블 상태');
      expect(prompt).toContain('R7a');
    });

    it('내 타일 목록이 포함된다', () => {
      const prompt = service.buildUserPrompt(makeRequest());
      expect(prompt).toContain('Y1a');
      expect(prompt).toContain('Y3a');
    });

    it('beginner 난이도에서는 상대 정보가 없다', () => {
      const prompt = service.buildUserPrompt(
        makeRequest({ difficulty: 'beginner' }),
      );
      expect(prompt).not.toContain('상대 플레이어 정보');
    });

    it('expert 난이도에서는 상대 정보가 포함된다', () => {
      const prompt = service.buildUserPrompt(
        makeRequest({ difficulty: 'expert' }),
      );
      expect(prompt).toContain('상대 플레이어 정보');
    });

    it('최초 등록 미완료 상태가 표시된다', () => {
      const req = makeRequest();
      req.gameState.initialMeldDone = false;
      const prompt = service.buildUserPrompt(req);
      expect(prompt).toContain('미완료');
      expect(prompt).toContain('30점');
    });
  });

  describe('buildRetryUserPrompt', () => {
    it('에러 이유와 재시도 안내가 포함된다', () => {
      const prompt = service.buildRetryUserPrompt(
        makeRequest(),
        '유효하지 않은 타일 코드: INVALID',
        1,
      );
      expect(prompt).toContain('재시도 안내');
      expect(prompt).toContain('유효하지 않은 타일 코드: INVALID');
      expect(prompt).toContain('시도 2회');
    });
  });

  describe('getHistoryLimit', () => {
    it('beginner는 0턴을 반환한다', () => {
      expect(service.getHistoryLimit('beginner')).toBe(0);
    });
    it('intermediate는 3턴을 반환한다', () => {
      expect(service.getHistoryLimit('intermediate')).toBe(3);
    });
    it('expert는 5턴을 반환한다', () => {
      expect(service.getHistoryLimit('expert')).toBe(5);
    });
  });

  describe('getTemperature', () => {
    it('beginner는 temperature 0.9를 반환한다 (창의적 실수 유발, JSON 오류율 감소)', () => {
      expect(service.getTemperature('beginner')).toBe(0.9);
    });

    it('intermediate는 temperature 0.7을 반환한다 (균형 잡힌 탐색)', () => {
      expect(service.getTemperature('intermediate')).toBe(0.7);
    });

    it('expert는 temperature 0.3을 반환한다 (최적 수 집중)', () => {
      expect(service.getTemperature('expert')).toBe(0.3);
    });

    it('알 수 없는 difficulty가 전달되면 기본값 0.7을 반환한다', () => {
      // 타입 단언으로 잘못된 값 시뮬레이션
      expect(service.getTemperature('unknown' as 'beginner')).toBe(0.7);
    });
  });
});
