import { PromptBuilderService } from './prompt-builder.service';
import { MoveRequestDto, GameStateDto } from '../common/dto/move-request.dto';

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
    service = new PromptBuilderService();
  });

  describe('buildSystemPrompt', () => {
    it('시스템 프롬프트에 게임 규칙이 포함된다', () => {
      const prompt = service.buildSystemPrompt(makeRequest());
      expect(prompt).toContain('루미큐브');
      expect(prompt).toContain('타일 인코딩');
      expect(prompt).toContain('JSON');
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
});
