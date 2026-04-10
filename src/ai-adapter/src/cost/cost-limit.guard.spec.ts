import { HttpException, HttpStatus, ExecutionContext } from '@nestjs/common';
import { CostLimitGuard } from './cost-limit.guard';
import { CostTrackingService } from './cost-tracking.service';

// -----------------------------------------------------------------------
// CostLimitGuard 단위 테스트
//
// 일일 비용 한도 및 시간당 사용자 비용 한도 초과 시
// 외부 LLM 모델 요청을 거부하고,
// 무료 모델(ollama)은 항상 허용하는지 검증한다.
// -----------------------------------------------------------------------

const createMockExecutionContext = (
  model: string,
  gameId?: string,
): ExecutionContext =>
  ({
    switchToHttp: () => ({
      getRequest: () => ({
        body: { model, ...(gameId !== undefined ? { gameId } : {}) },
      }),
    }),
  }) as unknown as ExecutionContext;

describe('CostLimitGuard', () => {
  let guard: CostLimitGuard;
  let costTrackingService: jest.Mocked<CostTrackingService>;

  beforeEach(() => {
    costTrackingService = {
      isDailyLimitExceeded: jest.fn().mockResolvedValue(false),
      isUserHourlyLimitExceeded: jest.fn().mockResolvedValue(false),
    } as unknown as jest.Mocked<CostTrackingService>;

    guard = new CostLimitGuard(costTrackingService);
  });

  // -----------------------------------------------------------------------
  // 무료 모델 허용
  // -----------------------------------------------------------------------
  describe('무료 모델 (ollama)', () => {
    it('ollama는 한도 체크 없이 항상 허용한다', async () => {
      const context = createMockExecutionContext('ollama');

      const result = await guard.canActivate(context);

      expect(result).toBe(true);
      expect(costTrackingService.isDailyLimitExceeded).not.toHaveBeenCalled();
      expect(
        costTrackingService.isUserHourlyLimitExceeded,
      ).not.toHaveBeenCalled();
    });
  });

  // -----------------------------------------------------------------------
  // 한도 미초과
  // -----------------------------------------------------------------------
  describe('한도 미초과', () => {
    it('openai 요청이 한도 미초과 시 허용한다', async () => {
      costTrackingService.isDailyLimitExceeded.mockResolvedValueOnce(false);
      const context = createMockExecutionContext('openai', 'game-001');

      const result = await guard.canActivate(context);

      expect(result).toBe(true);
    });

    it('claude 요청이 한도 미초과 시 허용한다', async () => {
      costTrackingService.isDailyLimitExceeded.mockResolvedValueOnce(false);
      const context = createMockExecutionContext('claude', 'game-002');

      const result = await guard.canActivate(context);

      expect(result).toBe(true);
    });

    it('deepseek 요청이 한도 미초과 시 허용한다', async () => {
      costTrackingService.isDailyLimitExceeded.mockResolvedValueOnce(false);
      const context = createMockExecutionContext('deepseek', 'game-003');

      const result = await guard.canActivate(context);

      expect(result).toBe(true);
    });
  });

  // -----------------------------------------------------------------------
  // 일일 한도 초과
  // -----------------------------------------------------------------------
  describe('일일 한도 초과', () => {
    it('openai 요청이 일일 한도 초과 시 403 에러를 던진다', async () => {
      costTrackingService.isDailyLimitExceeded.mockResolvedValueOnce(true);
      const context = createMockExecutionContext('openai');

      await expect(guard.canActivate(context)).rejects.toThrow(HttpException);

      costTrackingService.isDailyLimitExceeded.mockResolvedValueOnce(true);
      try {
        await guard.canActivate(context);
      } catch (err) {
        expect((err as HttpException).getStatus()).toBe(
          HttpStatus.FORBIDDEN,
        );
        const response = (err as HttpException).getResponse() as any;
        expect(response.allowedModels).toContain('ollama');
        expect(response.error).toBe('Daily Cost Limit Exceeded');
        expect(response.code).toBe('DAILY_COST_LIMIT_EXCEEDED');
      }
    });

    it('claude 요청이 일일 한도 초과 시 거부한다', async () => {
      costTrackingService.isDailyLimitExceeded.mockResolvedValueOnce(true);
      const context = createMockExecutionContext('claude');

      await expect(guard.canActivate(context)).rejects.toThrow(HttpException);
    });

    it('deepseek 요청이 일일 한도 초과 시 거부한다', async () => {
      costTrackingService.isDailyLimitExceeded.mockResolvedValueOnce(true);
      const context = createMockExecutionContext('deepseek');

      await expect(guard.canActivate(context)).rejects.toThrow(HttpException);
    });
  });

  // -----------------------------------------------------------------------
  // 시간당 사용자/게임 비용 한도 초과 (SEC-RL-002)
  // -----------------------------------------------------------------------
  describe('시간당 사용자 비용 한도 초과', () => {
    it('시간당 한도 초과 시 403 에러를 던진다', async () => {
      costTrackingService.isDailyLimitExceeded.mockResolvedValueOnce(false);
      costTrackingService.isUserHourlyLimitExceeded.mockResolvedValueOnce(true);
      const context = createMockExecutionContext('openai', 'game-001');

      await expect(guard.canActivate(context)).rejects.toThrow(HttpException);

      costTrackingService.isDailyLimitExceeded.mockResolvedValueOnce(false);
      costTrackingService.isUserHourlyLimitExceeded.mockResolvedValueOnce(true);
      try {
        await guard.canActivate(context);
      } catch (err) {
        expect((err as HttpException).getStatus()).toBe(
          HttpStatus.FORBIDDEN,
        );
        const response = (err as HttpException).getResponse() as any;
        expect(response.error).toBe('Hourly User Cost Limit Exceeded');
        expect(response.code).toBe('HOURLY_COST_LIMIT_EXCEEDED');
        expect(response.message).toBe(
          '시간당 사용자 비용 한도를 초과했습니다. 잠시 후 다시 시도해주세요.',
        );
        expect(response.allowedModels).toContain('ollama');
      }
    });

    it('시간당 한도 미초과 시 허용한다', async () => {
      costTrackingService.isDailyLimitExceeded.mockResolvedValueOnce(false);
      costTrackingService.isUserHourlyLimitExceeded.mockResolvedValueOnce(
        false,
      );
      const context = createMockExecutionContext('claude', 'game-002');

      const result = await guard.canActivate(context);

      expect(result).toBe(true);
      expect(
        costTrackingService.isUserHourlyLimitExceeded,
      ).toHaveBeenCalledWith('game-002');
    });

    it('gameId를 rate limit 키로 사용한다', async () => {
      costTrackingService.isDailyLimitExceeded.mockResolvedValueOnce(false);
      const context = createMockExecutionContext('openai', 'my-game-xyz');

      await guard.canActivate(context);

      expect(
        costTrackingService.isUserHourlyLimitExceeded,
      ).toHaveBeenCalledWith('my-game-xyz');
    });

    it('gameId가 없으면 시간당 한도 체크를 건너뛴다', async () => {
      costTrackingService.isDailyLimitExceeded.mockResolvedValueOnce(false);
      const context = createMockExecutionContext('openai');

      const result = await guard.canActivate(context);

      expect(result).toBe(true);
      expect(
        costTrackingService.isUserHourlyLimitExceeded,
      ).not.toHaveBeenCalled();
    });

    it('서로 다른 gameId는 독립적으로 한도가 적용된다', async () => {
      // game-001: 한도 초과
      costTrackingService.isDailyLimitExceeded.mockResolvedValueOnce(false);
      costTrackingService.isUserHourlyLimitExceeded.mockResolvedValueOnce(true);
      const context1 = createMockExecutionContext('openai', 'game-001');
      await expect(guard.canActivate(context1)).rejects.toThrow(HttpException);

      // game-002: 한도 미초과
      costTrackingService.isDailyLimitExceeded.mockResolvedValueOnce(false);
      costTrackingService.isUserHourlyLimitExceeded.mockResolvedValueOnce(
        false,
      );
      const context2 = createMockExecutionContext('openai', 'game-002');
      const result = await guard.canActivate(context2);
      expect(result).toBe(true);
    });

    it('일일 한도가 먼저 확인되고, 초과 시 시간당 한도는 확인하지 않는다', async () => {
      costTrackingService.isDailyLimitExceeded.mockResolvedValueOnce(true);
      const context = createMockExecutionContext('openai', 'game-001');

      await expect(guard.canActivate(context)).rejects.toThrow(HttpException);
      expect(
        costTrackingService.isUserHourlyLimitExceeded,
      ).not.toHaveBeenCalled();
    });
  });
});
