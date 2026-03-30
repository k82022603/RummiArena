import { Module } from '@nestjs/common';
import { CostTrackingService } from './cost-tracking.service';
import { CostController } from './cost.controller';
import { CostLimitGuard } from './cost-limit.guard';

/**
 * 비용 추적 모듈.
 *
 * Redis를 사용하여 일별 LLM API 호출 비용을 추적한다.
 * - CostTrackingService: 비용 기록 및 조회
 * - CostLimitGuard: 일일 한도 초과 시 요청 거부
 * - CostController: GET /stats/cost 엔드포인트
 *
 * RedisModule이 Global로 등록되어 있으므로 별도 import 없이 REDIS_CLIENT 주입 가능.
 */
@Module({
  controllers: [CostController],
  providers: [CostTrackingService, CostLimitGuard],
  exports: [CostTrackingService, CostLimitGuard],
})
export class CostModule {}
