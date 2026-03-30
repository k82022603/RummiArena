import { CostController } from './cost.controller';
import { CostTrackingService, DailyCostSummary } from './cost-tracking.service';

// -----------------------------------------------------------------------
// CostController 단위 테스트
//
// GET /stats/cost, GET /stats/cost/history, GET /stats/cost/pricing
// 엔드포인트의 요청 위임과 응답을 검증한다.
// -----------------------------------------------------------------------

const makeSummary = (date: string): DailyCostSummary => ({
  date,
  totalCostUsd: 1.5,
  totalRequests: 20,
  models: {
    openai: { tokensIn: 5000, tokensOut: 2000, costUsd: 1.2, requests: 15 },
    ollama: { tokensIn: 1000, tokensOut: 500, costUsd: 0, requests: 5 },
  },
  limitUsd: 5,
  limitExceeded: false,
});

describe('CostController', () => {
  let controller: CostController;
  let costTrackingService: jest.Mocked<CostTrackingService>;

  beforeEach(() => {
    costTrackingService = {
      getDailySummary: jest.fn(),
      getRecentDays: jest.fn(),
    } as unknown as jest.Mocked<CostTrackingService>;

    controller = new CostController(costTrackingService);
  });

  // -----------------------------------------------------------------------
  // GET /stats/cost
  // -----------------------------------------------------------------------
  describe('getDailyCost()', () => {
    it('날짜를 지정하면 해당 날짜의 요약을 반환한다', async () => {
      const expected = makeSummary('2026-03-30');
      costTrackingService.getDailySummary.mockResolvedValueOnce(expected);

      const result = await controller.getDailyCost('2026-03-30');

      expect(costTrackingService.getDailySummary).toHaveBeenCalledWith(
        '2026-03-30',
      );
      expect(result).toEqual(expected);
    });

    it('날짜 미지정 시 오늘 날짜로 조회한다', async () => {
      const expected = makeSummary('2026-03-30');
      costTrackingService.getDailySummary.mockResolvedValueOnce(expected);

      await controller.getDailyCost();

      expect(costTrackingService.getDailySummary).toHaveBeenCalledWith(
        undefined,
      );
    });

    it('잘못된 날짜 형식이면 빈 요약을 반환한다', async () => {
      const result = await controller.getDailyCost('invalid-date');

      expect(costTrackingService.getDailySummary).not.toHaveBeenCalled();
      expect(result.date).toBe('invalid-date');
      expect(result.totalCostUsd).toBe(0);
    });
  });

  // -----------------------------------------------------------------------
  // GET /stats/cost/history
  // -----------------------------------------------------------------------
  describe('getCostHistory()', () => {
    it('기본 7일간의 히스토리를 반환한다', async () => {
      const summaries = Array.from({ length: 7 }, (_, i) =>
        makeSummary(`2026-03-${30 - i}`),
      );
      costTrackingService.getRecentDays.mockResolvedValueOnce(summaries);

      const result = await controller.getCostHistory();

      expect(result.days).toBe(7);
      expect(result.history).toHaveLength(7);
      expect(costTrackingService.getRecentDays).toHaveBeenCalledWith(7);
    });

    it('days 파라미터가 30을 초과하면 30으로 제한한다', async () => {
      costTrackingService.getRecentDays.mockResolvedValueOnce([]);

      await controller.getCostHistory(50);

      expect(costTrackingService.getRecentDays).toHaveBeenCalledWith(30);
    });

    it('days 파라미터가 0이면 1로 보정한다', async () => {
      costTrackingService.getRecentDays.mockResolvedValueOnce([]);

      await controller.getCostHistory(0);

      expect(costTrackingService.getRecentDays).toHaveBeenCalledWith(1);
    });
  });

  // -----------------------------------------------------------------------
  // GET /stats/cost/pricing
  // -----------------------------------------------------------------------
  describe('getPricing()', () => {
    it('모델별 단가를 반환한다', () => {
      const result = controller.getPricing();

      expect(result.pricing).toBeDefined();
      expect(result.pricing['openai']).toBeDefined();
      expect(result.pricing['claude']).toBeDefined();
      expect(result.pricing['deepseek']).toBeDefined();
      expect(result.pricing['ollama']).toBeDefined();
      expect(result.pricing['ollama'].inputPer1M).toBe(0);
    });
  });
});
