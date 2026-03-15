import { HealthController } from './health.controller';
import { HealthService } from './health.service';

// -----------------------------------------------------------------------
// HealthController 단위 테스트
//
// 목적:
//   - GET /health 기본 응답 확인
//   - GET /health/adapters 응답 구조 및 status 결정 로직 확인
// -----------------------------------------------------------------------

describe('HealthController', () => {
  let controller: HealthController;
  let healthService: jest.Mocked<HealthService>;

  beforeEach(() => {
    healthService = {
      checkAllAdapters: jest.fn(),
    } as unknown as jest.Mocked<HealthService>;

    controller = new HealthController(healthService);
  });

  // -----------------------------------------------------------------------
  // GET /health
  // -----------------------------------------------------------------------
  describe('check()', () => {
    it('status: "ok"와 ISO 형식 timestamp를 반환한다', () => {
      const result = controller.check();

      expect(result.status).toBe('ok');
      expect(result.timestamp).toBeDefined();
      // ISO 8601 형식 확인
      expect(() => new Date(result.timestamp)).not.toThrow();
      expect(new Date(result.timestamp).toISOString()).toBe(result.timestamp);
    });
  });

  // -----------------------------------------------------------------------
  // GET /health/adapters
  // -----------------------------------------------------------------------
  describe('checkAdapters()', () => {
    it('모든 어댑터가 healthy이면 status: "ok"를 반환한다', async () => {
      healthService.checkAllAdapters.mockResolvedValueOnce({
        openai: true,
        claude: true,
        deepseek: true,
        ollama: true,
      });

      const result = await controller.checkAdapters();

      expect(result.status).toBe('ok');
      expect(result.adapters).toEqual({
        openai: true,
        claude: true,
        deepseek: true,
        ollama: true,
      });
    });

    it('어댑터 하나라도 false이면 status: "degraded"를 반환한다', async () => {
      healthService.checkAllAdapters.mockResolvedValueOnce({
        openai: true,
        claude: false,
        deepseek: true,
        ollama: true,
      });

      const result = await controller.checkAdapters();

      expect(result.status).toBe('degraded');
    });

    it('모든 어댑터가 false이면 status: "degraded"를 반환한다', async () => {
      healthService.checkAllAdapters.mockResolvedValueOnce({
        openai: false,
        claude: false,
        deepseek: false,
        ollama: false,
      });

      const result = await controller.checkAdapters();

      expect(result.status).toBe('degraded');
    });

    it('응답에 adapters 객체와 timestamp가 포함된다', async () => {
      healthService.checkAllAdapters.mockResolvedValueOnce({
        openai: true,
        claude: true,
        deepseek: false,
        ollama: false,
      });

      const result = await controller.checkAdapters();

      expect(result.adapters).toBeDefined();
      expect(result.timestamp).toBeDefined();
      expect(new Date(result.timestamp).toISOString()).toBe(result.timestamp);
    });

    it('HealthService.checkAllAdapters()를 한 번 호출한다', async () => {
      healthService.checkAllAdapters.mockResolvedValueOnce({
        openai: true,
        claude: true,
        deepseek: true,
        ollama: true,
      });

      await controller.checkAdapters();

      expect(healthService.checkAllAdapters).toHaveBeenCalledTimes(1);
    });
  });
});
