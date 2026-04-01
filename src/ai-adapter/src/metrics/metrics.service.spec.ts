import { MetricsService, LlmMetricRecord } from './metrics.service';

// -----------------------------------------------------------------------
// MetricsService 단위 테스트
//
// Redis 클라이언트를 모킹하여 메트릭 기록과 조회를 검증한다.
// -----------------------------------------------------------------------

const createMockPipeline = () => ({
  zadd: jest.fn().mockReturnThis(),
  hincrby: jest.fn().mockReturnThis(),
  expire: jest.fn().mockReturnThis(),
  exec: jest.fn().mockResolvedValue([]),
});

const createMockRedis = () => ({
  pipeline: jest.fn(),
  hgetall: jest.fn(),
  zcard: jest.fn(),
  zrange: jest.fn(),
});

const makeMetricRecord = (
  overrides: Partial<LlmMetricRecord> = {},
): LlmMetricRecord => ({
  modelType: 'openai',
  modelName: 'gpt-4o-mini',
  gameId: 'game-001',
  latencyMs: 500,
  promptTokens: 200,
  completionTokens: 100,
  parseSuccess: true,
  isFallbackDraw: false,
  retryCount: 0,
  timestamp: '2026-03-30T12:00:00.000Z',
  ...overrides,
});

describe('MetricsService', () => {
  let service: MetricsService;
  let mockRedis: ReturnType<typeof createMockRedis>;
  let mockPipeline: ReturnType<typeof createMockPipeline>;

  beforeEach(() => {
    mockRedis = createMockRedis();
    mockPipeline = createMockPipeline();
    mockRedis.pipeline.mockReturnValue(mockPipeline);

    service = new MetricsService(mockRedis as any);
  });

  // -----------------------------------------------------------------------
  // recordMetric 검증
  // -----------------------------------------------------------------------
  describe('recordMetric()', () => {
    it('Redis pipeline으로 메트릭을 기록한다', async () => {
      const record = makeMetricRecord();

      await service.recordMetric(record);

      expect(mockRedis.pipeline).toHaveBeenCalledTimes(1);
      expect(mockPipeline.zadd).toHaveBeenCalledTimes(1);
      expect(mockPipeline.hincrby).toHaveBeenCalled();
      expect(mockPipeline.expire).toHaveBeenCalledTimes(2); // latency key + summary key
      expect(mockPipeline.exec).toHaveBeenCalledTimes(1);
    });

    it('Sorted Set에 latencyMs를 score로 기록한다', async () => {
      const record = makeMetricRecord({ latencyMs: 750 });

      await service.recordMetric(record);

      expect(mockPipeline.zadd).toHaveBeenCalledWith(
        'metrics:latency:openai:2026-03-30',
        750,
        expect.stringContaining('game-001'),
      );
    });

    it('파싱 성공 시 parse_success를 증가시킨다', async () => {
      await service.recordMetric(makeMetricRecord({ parseSuccess: true }));

      const calls = mockPipeline.hincrby.mock.calls;
      const parseCall = calls.find((c: any[]) => c[1] === 'parse_success');
      expect(parseCall).toBeDefined();
      expect(parseCall[2]).toBe(1);
    });

    it('파싱 실패 시 parse_fail을 증가시킨다', async () => {
      await service.recordMetric(makeMetricRecord({ parseSuccess: false }));

      const calls = mockPipeline.hincrby.mock.calls;
      const parseCall = calls.find((c: any[]) => c[1] === 'parse_fail');
      expect(parseCall).toBeDefined();
    });

    it('fallback draw 시 fallback_draws를 증가시킨다', async () => {
      await service.recordMetric(makeMetricRecord({ isFallbackDraw: true }));

      const calls = mockPipeline.hincrby.mock.calls;
      const fbCall = calls.find((c: any[]) => c[1] === 'fallback_draws');
      expect(fbCall).toBeDefined();
    });

    it('Redis 오류 시 예외를 던지지 않는다', async () => {
      mockPipeline.exec.mockRejectedValueOnce(new Error('Redis down'));

      await expect(
        service.recordMetric(makeMetricRecord()),
      ).resolves.toBeUndefined();
    });
  });

  // -----------------------------------------------------------------------
  // getModelSummary 검증
  // -----------------------------------------------------------------------
  describe('getModelSummary()', () => {
    it('Redis 데이터를 올바르게 파싱한다', async () => {
      mockRedis.hgetall.mockResolvedValueOnce({
        total_requests: '100',
        total_tokens_in: '50000',
        total_tokens_out: '20000',
        parse_success: '95',
        parse_fail: '5',
        fallback_draws: '3',
        total_retries: '15',
        total_latency_ms: '50000',
      });
      mockRedis.zcard.mockResolvedValueOnce(100);
      mockRedis.zrange
        .mockResolvedValueOnce(['member1', '450']) // p50
        .mockResolvedValueOnce(['member2', '1200']); // p95

      const summary = await service.getModelSummary('openai', '2026-03-30');

      expect(summary.modelType).toBe('openai');
      expect(summary.totalRequests).toBe(100);
      expect(summary.avgLatencyMs).toBe(500);
      expect(summary.p50LatencyMs).toBe(450);
      expect(summary.p95LatencyMs).toBe(1200);
      expect(summary.totalTokensIn).toBe(50000);
      expect(summary.totalTokensOut).toBe(20000);
      expect(summary.parseSuccessRate).toBe(95);
      expect(summary.fallbackDrawRate).toBe(3);
      expect(summary.avgRetryCount).toBe(0.15);
    });

    it('데이터가 없으면 기본값을 반환한다', async () => {
      mockRedis.hgetall.mockResolvedValueOnce({});
      mockRedis.zcard.mockResolvedValueOnce(0);

      const summary = await service.getModelSummary('claude', '2026-03-30');

      expect(summary.totalRequests).toBe(0);
      expect(summary.avgLatencyMs).toBe(0);
      expect(summary.parseSuccessRate).toBe(100);
      expect(summary.fallbackDrawRate).toBe(0);
    });

    it('Redis 오류 시 기본값을 반환한다', async () => {
      mockRedis.hgetall.mockRejectedValueOnce(new Error('Redis down'));

      const summary = await service.getModelSummary('openai');

      expect(summary.totalRequests).toBe(0);
      expect(summary.modelType).toBe('openai');
    });
  });

  // -----------------------------------------------------------------------
  // getAllModelSummaries 검증
  // -----------------------------------------------------------------------
  describe('getAllModelSummaries()', () => {
    it('4개 모델의 요약을 반환한다', async () => {
      mockRedis.hgetall.mockResolvedValue({});
      mockRedis.zcard.mockResolvedValue(0);

      const summaries = await service.getAllModelSummaries('2026-03-30');

      expect(summaries).toHaveLength(4);
      const types = summaries.map((s) => s.modelType);
      expect(types).toContain('openai');
      expect(types).toContain('claude');
      expect(types).toContain('deepseek');
      expect(types).toContain('ollama');
    });
  });
});
