import { HttpException, HttpStatus, ExecutionContext } from '@nestjs/common';
import { CostLimitGuard } from './cost-limit.guard';
import { CostTrackingService } from './cost-tracking.service';

// -----------------------------------------------------------------------
// CostLimitGuard 단위 테스트
//
// 일일 비용 한도 초과 시 외부 LLM 모델 요청을 거부하고,
// 무료 모델(ollama)은 항상 허용하는지 검증한다.
// -----------------------------------------------------------------------

const createMockExecutionContext = (model: string): ExecutionContext =>
  ({
    switchToHttp: () => ({
      getRequest: () => ({
        body: { model },
      }),
    }),
  }) as unknown as ExecutionContext;

describe('CostLimitGuard', () => {
  let guard: CostLimitGuard;
  let costTrackingService: jest.Mocked<CostTrackingService>;

  beforeEach(() => {
    costTrackingService = {
      isDailyLimitExceeded: jest.fn(),
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
    });
  });

  // -----------------------------------------------------------------------
  // 한도 미초과
  // -----------------------------------------------------------------------
  describe('한도 미초과', () => {
    it('openai 요청이 한도 미초과 시 허용한다', async () => {
      costTrackingService.isDailyLimitExceeded.mockResolvedValueOnce(false);
      const context = createMockExecutionContext('openai');

      const result = await guard.canActivate(context);

      expect(result).toBe(true);
    });

    it('claude 요청이 한도 미초과 시 허용한다', async () => {
      costTrackingService.isDailyLimitExceeded.mockResolvedValueOnce(false);
      const context = createMockExecutionContext('claude');

      const result = await guard.canActivate(context);

      expect(result).toBe(true);
    });

    it('deepseek 요청이 한도 미초과 시 허용한다', async () => {
      costTrackingService.isDailyLimitExceeded.mockResolvedValueOnce(false);
      const context = createMockExecutionContext('deepseek');

      const result = await guard.canActivate(context);

      expect(result).toBe(true);
    });
  });

  // -----------------------------------------------------------------------
  // 한도 초과
  // -----------------------------------------------------------------------
  describe('한도 초과', () => {
    it('openai 요청이 한도 초과 시 429 에러를 던진다', async () => {
      costTrackingService.isDailyLimitExceeded.mockResolvedValueOnce(true);
      const context = createMockExecutionContext('openai');

      await expect(guard.canActivate(context)).rejects.toThrow(HttpException);

      try {
        await guard.canActivate(context);
      } catch (err) {
        expect((err as HttpException).getStatus()).toBe(
          HttpStatus.TOO_MANY_REQUESTS,
        );
        const response = (err as HttpException).getResponse() as any;
        expect(response.allowedModels).toContain('ollama');
      }
    });

    it('claude 요청이 한도 초과 시 거부한다', async () => {
      costTrackingService.isDailyLimitExceeded.mockResolvedValueOnce(true);
      const context = createMockExecutionContext('claude');

      await expect(guard.canActivate(context)).rejects.toThrow(HttpException);
    });

    it('deepseek 요청이 한도 초과 시 거부한다', async () => {
      costTrackingService.isDailyLimitExceeded.mockResolvedValueOnce(true);
      const context = createMockExecutionContext('deepseek');

      await expect(guard.canActivate(context)).rejects.toThrow(HttpException);
    });
  });
});
