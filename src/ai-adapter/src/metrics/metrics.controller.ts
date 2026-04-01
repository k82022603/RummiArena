import { Controller, Get, Query, Logger } from '@nestjs/common';
import { MetricsService, ModelMetricsSummary } from './metrics.service';

/**
 * 성능 메트릭 조회 컨트롤러.
 * GET /stats/metrics 엔드포인트를 제공한다.
 *
 * 모델별 응답 시간 (avg, p50, p95), 토큰 사용량, JSON 파싱 성공률,
 * 강제 드로우 비율 등을 조회할 수 있다.
 */
@Controller('stats')
export class MetricsController {
  private readonly logger = new Logger(MetricsController.name);

  constructor(private readonly metricsService: MetricsService) {}

  /**
   * 모든 모델의 성능 메트릭 요약을 조회한다.
   *
   * GET /stats/metrics
   * GET /stats/metrics?date=2026-03-30
   */
  @Get('metrics')
  async getAllMetrics(@Query('date') date?: string): Promise<{
    date: string;
    models: ModelMetricsSummary[];
  }> {
    const targetDate = date ?? new Date().toISOString().slice(0, 10);
    this.logger.log(`GET /stats/metrics date=${targetDate}`);

    const models = await this.metricsService.getAllModelSummaries(targetDate);

    return { date: targetDate, models };
  }

  /**
   * 특정 모델의 성능 메트릭을 조회한다.
   *
   * GET /stats/metrics/:model?date=2026-03-30
   */
  @Get('metrics/model')
  async getModelMetrics(
    @Query('model') model?: string,
    @Query('date') date?: string,
  ): Promise<ModelMetricsSummary> {
    const targetModel = model ?? 'openai';
    const targetDate = date ?? new Date().toISOString().slice(0, 10);

    this.logger.log(
      `GET /stats/metrics/model model=${targetModel} date=${targetDate}`,
    );

    return this.metricsService.getModelSummary(targetModel, targetDate);
  }
}
