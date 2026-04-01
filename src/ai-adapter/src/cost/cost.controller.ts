import { Controller, Get, Query, Logger } from '@nestjs/common';
import {
  CostTrackingService,
  DailyCostSummary,
  MODEL_PRICING,
} from './cost-tracking.service';

/**
 * 비용 조회 컨트롤러.
 * GET /stats/cost 엔드포인트를 제공한다.
 *
 * admin 대시보드 또는 모니터링 시스템에서 호출하여
 * 일별 LLM API 호출 비용을 확인한다.
 */
@Controller('stats')
export class CostController {
  private readonly logger = new Logger(CostController.name);

  constructor(private readonly costTrackingService: CostTrackingService) {}

  /**
   * 일별 비용 요약을 조회한다.
   *
   * GET /stats/cost
   * GET /stats/cost?date=2026-03-30
   *
   * @param date YYYY-MM-DD 형식. 생략 시 오늘 날짜.
   */
  @Get('cost')
  async getDailyCost(@Query('date') date?: string): Promise<DailyCostSummary> {
    this.logger.log(`GET /stats/cost date=${date ?? 'today'}`);

    // 날짜 형식 검증 (간이)
    if (date && !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      return {
        date: date,
        totalCostUsd: 0,
        totalRequests: 0,
        models: {},
        limitUsd: 0,
        limitExceeded: false,
      };
    }

    return this.costTrackingService.getDailySummary(date);
  }

  /**
   * 최근 N일간의 비용 추이를 조회한다.
   *
   * GET /stats/cost/history
   * GET /stats/cost/history?days=14
   *
   * @param days 조회할 일수 (기본: 7, 최대: 30)
   */
  @Get('cost/history')
  async getCostHistory(
    @Query('days') days?: number,
  ): Promise<{ days: number; history: DailyCostSummary[] }> {
    const targetDays = Math.min(Math.max(days ?? 7, 1), 30);
    this.logger.log(`GET /stats/cost/history days=${targetDays}`);

    const history = await this.costTrackingService.getRecentDays(targetDays);

    return { days: targetDays, history };
  }

  /**
   * 모델별 토큰 단가 정보를 조회한다.
   *
   * GET /stats/cost/pricing
   */
  @Get('cost/pricing')
  getPricing(): {
    pricing: Record<string, { inputPer1M: number; outputPer1M: number }>;
  } {
    return { pricing: MODEL_PRICING };
  }
}
