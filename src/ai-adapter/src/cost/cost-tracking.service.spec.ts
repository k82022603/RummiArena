import { ConfigService } from '@nestjs/config';
import {
  CostTrackingService,
  MODEL_PRICING,
  CostRecord,
} from './cost-tracking.service';

// -----------------------------------------------------------------------
// CostTrackingService 단위 테스트
//
// Redis 클라이언트를 모킹하여 비용 기록, 한도 확인, 요약 조회를 검증한다.
// -----------------------------------------------------------------------

/** Redis Pipeline 모킹 */
const createMockPipeline = () => ({
  hincrby: jest.fn().mockReturnThis(),
  expire: jest.fn().mockReturnThis(),
  exec: jest.fn().mockResolvedValue([]),
});

/** Redis 클라이언트 모킹 */
const createMockRedis = () => ({
  pipeline: jest.fn(),
  hget: jest.fn(),
  hgetall: jest.fn(),
  get: jest.fn(),
});

/** ConfigService 모킹 */
const createMockConfigService = (dailyLimitUsd = 5, hourlyUserLimitUsd = 5) =>
  ({
    get: jest.fn((key: string, defaultValue: unknown) => {
      if (key === 'DAILY_COST_LIMIT_USD') return dailyLimitUsd;
      if (key === 'HOURLY_USER_COST_LIMIT_USD') return hourlyUserLimitUsd;
      return defaultValue;
    }),
  }) as unknown as ConfigService;

describe('CostTrackingService', () => {
  let service: CostTrackingService;
  let mockRedis: ReturnType<typeof createMockRedis>;
  let mockPipeline: ReturnType<typeof createMockPipeline>;

  beforeEach(() => {
    mockRedis = createMockRedis();
    mockPipeline = createMockPipeline();
    mockRedis.pipeline.mockReturnValue(mockPipeline);

    service = new CostTrackingService(
      mockRedis as any,
      createMockConfigService(5),
    );
  });

  // -----------------------------------------------------------------------
  // MODEL_PRICING 검증
  // -----------------------------------------------------------------------
  describe('MODEL_PRICING', () => {
    it('openai 단가가 올바르다', () => {
      expect(MODEL_PRICING.openai).toEqual({
        inputPer1M: 2.5,
        outputPer1M: 10.0,
      });
    });

    it('claude 단가가 올바르다', () => {
      expect(MODEL_PRICING.claude).toEqual({
        inputPer1M: 3.0,
        outputPer1M: 15.0,
      });
    });

    it('deepseek 단가가 올바르다', () => {
      expect(MODEL_PRICING.deepseek).toEqual({
        inputPer1M: 1.74,
        outputPer1M: 3.48,
      });
    });

    it('ollama 단가는 0이다', () => {
      expect(MODEL_PRICING.ollama).toEqual({
        inputPer1M: 0,
        outputPer1M: 0,
      });
    });
  });

  // -----------------------------------------------------------------------
  // recordCost 검증
  // -----------------------------------------------------------------------
  describe('recordCost()', () => {
    it('Redis pipeline으로 6개 HINCRBY + 1개 EXPIRE를 실행한다', async () => {
      const record: CostRecord = {
        modelType: 'openai',
        promptTokens: 1000,
        completionTokens: 500,
      };

      await service.recordCost(record);

      expect(mockRedis.pipeline).toHaveBeenCalledTimes(1);
      // 모델별: tokens_in, tokens_out, cost_usd, requests (4건)
      // 전체: total_cost_usd, total_requests (2건)
      // expire (1건)
      // 총 7번 호출
      expect(mockPipeline.hincrby).toHaveBeenCalledTimes(6);
      expect(mockPipeline.expire).toHaveBeenCalledTimes(1);
      expect(mockPipeline.exec).toHaveBeenCalledTimes(1);
    });

    it('openai 비용이 올바르게 계산된다', async () => {
      const record: CostRecord = {
        modelType: 'openai',
        promptTokens: 1_000_000, // 1M tokens
        completionTokens: 1_000_000, // 1M tokens
      };

      await service.recordCost(record);

      // 비용: input $2.5 + output $10 = $12.5
      // 스케일: $12.5 * 1e6 = 12,500,000
      const costCalls = mockPipeline.hincrby.mock.calls.filter(
        (call: any[]) => call[1] === 'openai:cost_usd',
      );
      expect(costCalls).toHaveLength(1);
      expect(costCalls[0][2]).toBe(12_500_000);
    });

    it('ollama 비용은 0이다', async () => {
      const record: CostRecord = {
        modelType: 'ollama',
        promptTokens: 500,
        completionTokens: 200,
      };

      await service.recordCost(record);

      const costCalls = mockPipeline.hincrby.mock.calls.filter(
        (call: any[]) => call[1] === 'ollama:cost_usd',
      );
      expect(costCalls).toHaveLength(1);
      expect(costCalls[0][2]).toBe(0);
    });

    it('Redis 오류 시 예외를 던지지 않는다', async () => {
      mockPipeline.exec.mockRejectedValueOnce(new Error('Redis down'));

      await expect(
        service.recordCost({
          modelType: 'openai',
          promptTokens: 100,
          completionTokens: 50,
        }),
      ).resolves.toBeUndefined();
    });

    it('알 수 없는 모델은 ollama 단가(0)를 사용한다', async () => {
      const record: CostRecord = {
        modelType: 'unknown-model',
        promptTokens: 1000,
        completionTokens: 500,
      };

      await service.recordCost(record);

      const totalCostCalls = mockPipeline.hincrby.mock.calls.filter(
        (call: any[]) => call[1] === 'total_cost_usd',
      );
      expect(totalCostCalls[0][2]).toBe(0);
    });
  });

  // -----------------------------------------------------------------------
  // isDailyLimitExceeded 검증
  // -----------------------------------------------------------------------
  describe('isDailyLimitExceeded()', () => {
    it('비용이 한도 미만이면 false를 반환한다', async () => {
      // $4.99 = 4,990,000 (1e6 스케일)
      mockRedis.hget.mockResolvedValueOnce('4990000');

      const result = await service.isDailyLimitExceeded();

      expect(result).toBe(false);
    });

    it('비용이 한도 이상이면 true를 반환한다', async () => {
      // $5.00 = 5,000,000
      mockRedis.hget.mockResolvedValueOnce('5000000');

      const result = await service.isDailyLimitExceeded();

      expect(result).toBe(true);
    });

    it('비용이 한도를 초과하면 true를 반환한다', async () => {
      // $10.00 = 10,000,000
      mockRedis.hget.mockResolvedValueOnce('10000000');

      const result = await service.isDailyLimitExceeded();

      expect(result).toBe(true);
    });

    it('데이터가 없으면 false를 반환한다', async () => {
      mockRedis.hget.mockResolvedValueOnce(null);

      const result = await service.isDailyLimitExceeded();

      expect(result).toBe(false);
    });

    it('Redis 오류 시 false를 반환한다 (가용성 우선)', async () => {
      mockRedis.hget.mockRejectedValueOnce(new Error('Redis down'));

      const result = await service.isDailyLimitExceeded();

      expect(result).toBe(false);
    });
  });

  // -----------------------------------------------------------------------
  // getDailySummary 검증
  // -----------------------------------------------------------------------
  describe('getDailySummary()', () => {
    it('Redis Hash 데이터를 올바르게 파싱한다', async () => {
      mockRedis.hgetall.mockResolvedValueOnce({
        'openai:tokens_in': '5000',
        'openai:tokens_out': '2000',
        'openai:cost_usd': '32500', // $0.0325
        'openai:requests': '10',
        'claude:tokens_in': '3000',
        'claude:tokens_out': '1000',
        'claude:cost_usd': '24000', // $0.024
        'claude:requests': '5',
        total_cost_usd: '56500', // $0.0565
        total_requests: '15',
      });

      const summary = await service.getDailySummary('2026-03-30');

      expect(summary.date).toBe('2026-03-30');
      expect(summary.totalRequests).toBe(15);
      expect(summary.totalCostUsd).toBeCloseTo(0.0565, 4);
      expect(summary.models['openai']).toBeDefined();
      expect(summary.models['openai'].tokensIn).toBe(5000);
      expect(summary.models['openai'].tokensOut).toBe(2000);
      expect(summary.models['openai'].requests).toBe(10);
      expect(summary.models['claude']).toBeDefined();
      expect(summary.limitUsd).toBe(5);
      expect(summary.limitExceeded).toBe(false);
    });

    it('데이터가 없으면 빈 요약을 반환한다', async () => {
      mockRedis.hgetall.mockResolvedValueOnce({});

      const summary = await service.getDailySummary('2026-03-30');

      expect(summary.totalCostUsd).toBe(0);
      expect(summary.totalRequests).toBe(0);
      expect(Object.keys(summary.models)).toHaveLength(0);
    });

    it('Redis 오류 시 빈 요약을 반환한다', async () => {
      mockRedis.hgetall.mockRejectedValueOnce(new Error('Redis down'));

      const summary = await service.getDailySummary('2026-03-30');

      expect(summary.totalCostUsd).toBe(0);
      expect(summary.limitExceeded).toBe(false);
    });

    it('날짜 미지정 시 오늘 날짜를 사용한다', async () => {
      mockRedis.hgetall.mockResolvedValueOnce({});

      const summary = await service.getDailySummary();

      const today = new Date();
      const expectedDate = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
      expect(summary.date).toBe(expectedDate);
    });

    it('한도 초과 시 limitExceeded가 true이다', async () => {
      mockRedis.hgetall.mockResolvedValueOnce({
        total_cost_usd: '6000000', // $6.00 > $5.00 한도
        total_requests: '100',
      });

      const summary = await service.getDailySummary('2026-03-30');

      expect(summary.limitExceeded).toBe(true);
    });
  });

  // -----------------------------------------------------------------------
  // getRecentDays 검증
  // -----------------------------------------------------------------------
  describe('getRecentDays()', () => {
    it('요청된 일수만큼의 요약을 반환한다', async () => {
      mockRedis.hgetall.mockResolvedValue({});

      const result = await service.getRecentDays(3);

      expect(result).toHaveLength(3);
      expect(mockRedis.hgetall).toHaveBeenCalledTimes(3);
    });

    it('기본값 7일을 사용한다', async () => {
      mockRedis.hgetall.mockResolvedValue({});

      const result = await service.getRecentDays();

      expect(result).toHaveLength(7);
    });
  });

  // -----------------------------------------------------------------------
  // recordUserCost 검증
  // -----------------------------------------------------------------------
  describe('recordUserCost()', () => {
    it('Redis pipeline으로 INCRBY + EXPIRE를 실행한다', async () => {
      const incrbyMock = jest.fn().mockReturnThis();
      const expireMock = jest.fn().mockReturnThis();
      const execMock = jest.fn().mockResolvedValue([]);
      mockRedis.pipeline.mockReturnValue({
        incrby: incrbyMock,
        expire: expireMock,
        exec: execMock,
      });

      const record: CostRecord = {
        modelType: 'openai',
        promptTokens: 1000,
        completionTokens: 500,
      };

      await service.recordUserCost('game-001', record);

      expect(mockRedis.pipeline).toHaveBeenCalled();
      expect(incrbyMock).toHaveBeenCalledTimes(1);
      expect(expireMock).toHaveBeenCalledTimes(1);
      expect(execMock).toHaveBeenCalledTimes(1);
    });

    it('올바른 hourly Redis Key 형식을 사용한다', async () => {
      const incrbyMock = jest.fn().mockReturnThis();
      const expireMock = jest.fn().mockReturnThis();
      const execMock = jest.fn().mockResolvedValue([]);
      mockRedis.pipeline.mockReturnValue({
        incrby: incrbyMock,
        expire: expireMock,
        exec: execMock,
      });

      const record: CostRecord = {
        modelType: 'openai',
        promptTokens: 1000,
        completionTokens: 500,
      };

      await service.recordUserCost('game-001', record);

      expect(incrbyMock).toHaveBeenCalledWith(
        expect.stringMatching(
          /^quota:hourly:game-001:\d{4}-\d{2}-\d{2}-\d{2}$/,
        ),
        expect.any(Number),
      );
    });

    it('claude 모델 비용이 올바르게 계산된다', async () => {
      const incrbyMock = jest.fn().mockReturnThis();
      const expireMock = jest.fn().mockReturnThis();
      const execMock = jest.fn().mockResolvedValue([]);
      mockRedis.pipeline.mockReturnValue({
        incrby: incrbyMock,
        expire: expireMock,
        exec: execMock,
      });

      const record: CostRecord = {
        modelType: 'claude',
        promptTokens: 1_000_000,
        completionTokens: 1_000_000,
      };

      await service.recordUserCost('game-001', record);

      // 비용: input $3.0 + output $15.0 = $18.0
      // 스케일: $18.0 * 1e6 = 18,000,000
      expect(incrbyMock).toHaveBeenCalledWith(
        expect.stringContaining('quota:hourly:game-001:'),
        18_000_000,
      );
    });

    it('ollama 비용은 0으로 기록된다', async () => {
      const incrbyMock = jest.fn().mockReturnThis();
      const expireMock = jest.fn().mockReturnThis();
      const execMock = jest.fn().mockResolvedValue([]);
      mockRedis.pipeline.mockReturnValue({
        incrby: incrbyMock,
        expire: expireMock,
        exec: execMock,
      });

      const record: CostRecord = {
        modelType: 'ollama',
        promptTokens: 500,
        completionTokens: 200,
      };

      await service.recordUserCost('game-001', record);

      expect(incrbyMock).toHaveBeenCalledWith(
        expect.stringContaining('quota:hourly:game-001:'),
        0,
      );
    });

    it('TTL이 3600초로 설정된다', async () => {
      const incrbyMock = jest.fn().mockReturnThis();
      const expireMock = jest.fn().mockReturnThis();
      const execMock = jest.fn().mockResolvedValue([]);
      mockRedis.pipeline.mockReturnValue({
        incrby: incrbyMock,
        expire: expireMock,
        exec: execMock,
      });

      await service.recordUserCost('game-001', {
        modelType: 'openai',
        promptTokens: 100,
        completionTokens: 50,
      });

      expect(expireMock).toHaveBeenCalledWith(
        expect.stringContaining('quota:hourly:game-001:'),
        3600,
        'NX',
      );
    });

    it('Redis 오류 시 예외를 던지지 않는다 (fail-open)', async () => {
      const incrbyMock = jest.fn().mockReturnThis();
      const expireMock = jest.fn().mockReturnThis();
      const execMock = jest.fn().mockRejectedValue(new Error('Redis down'));
      mockRedis.pipeline.mockReturnValue({
        incrby: incrbyMock,
        expire: expireMock,
        exec: execMock,
      });

      await expect(
        service.recordUserCost('game-001', {
          modelType: 'openai',
          promptTokens: 100,
          completionTokens: 50,
        }),
      ).resolves.toBeUndefined();
    });

    it('서로 다른 userId는 서로 다른 Redis Key를 사용한다', async () => {
      const incrbyMock = jest.fn().mockReturnThis();
      const expireMock = jest.fn().mockReturnThis();
      const execMock = jest.fn().mockResolvedValue([]);
      mockRedis.pipeline.mockReturnValue({
        incrby: incrbyMock,
        expire: expireMock,
        exec: execMock,
      });

      const record: CostRecord = {
        modelType: 'openai',
        promptTokens: 100,
        completionTokens: 50,
      };

      await service.recordUserCost('game-001', record);
      await service.recordUserCost('game-002', record);

      const keys = incrbyMock.mock.calls.map((call: any[]) => call[0]);
      expect(keys[0]).toContain('game-001');
      expect(keys[1]).toContain('game-002');
      expect(keys[0]).not.toBe(keys[1]);
    });
  });

  // -----------------------------------------------------------------------
  // isUserHourlyLimitExceeded 검증
  // -----------------------------------------------------------------------
  describe('isUserHourlyLimitExceeded()', () => {
    it('비용이 한도 미만이면 false를 반환한다', async () => {
      // $4.99 = 4,990,000 (1e6 스케일)
      mockRedis.get.mockResolvedValueOnce('4990000');

      const result = await service.isUserHourlyLimitExceeded('game-001');

      expect(result).toBe(false);
    });

    it('비용이 한도 이상이면 true를 반환한다', async () => {
      // $5.00 = 5,000,000
      mockRedis.get.mockResolvedValueOnce('5000000');

      const result = await service.isUserHourlyLimitExceeded('game-001');

      expect(result).toBe(true);
    });

    it('비용이 한도를 초과하면 true를 반환한다', async () => {
      // $10.00 = 10,000,000
      mockRedis.get.mockResolvedValueOnce('10000000');

      const result = await service.isUserHourlyLimitExceeded('game-001');

      expect(result).toBe(true);
    });

    it('데이터가 없으면 false를 반환한다', async () => {
      mockRedis.get.mockResolvedValueOnce(null);

      const result = await service.isUserHourlyLimitExceeded('game-001');

      expect(result).toBe(false);
    });

    it('Redis 오류 시 false를 반환한다 (가용성 우선, fail-open)', async () => {
      mockRedis.get.mockRejectedValueOnce(new Error('Redis down'));

      const result = await service.isUserHourlyLimitExceeded('game-001');

      expect(result).toBe(false);
    });

    it('올바른 hourly Redis Key로 조회한다', async () => {
      mockRedis.get.mockResolvedValueOnce(null);

      await service.isUserHourlyLimitExceeded('game-abc');

      expect(mockRedis.get).toHaveBeenCalledWith(
        expect.stringMatching(
          /^quota:hourly:game-abc:\d{4}-\d{2}-\d{2}-\d{2}$/,
        ),
      );
    });

    it('커스텀 한도가 적용된다', async () => {
      // 한도 $2로 설정된 서비스 생성
      const customService = new CostTrackingService(
        mockRedis as any,
        createMockConfigService(5, 2),
      );

      // $1.99 < $2 한도 → false
      mockRedis.get.mockResolvedValueOnce('1990000');
      expect(await customService.isUserHourlyLimitExceeded('game-001')).toBe(
        false,
      );

      // $2.00 >= $2 한도 → true
      mockRedis.get.mockResolvedValueOnce('2000000');
      expect(await customService.isUserHourlyLimitExceeded('game-001')).toBe(
        true,
      );
    });
  });
});
