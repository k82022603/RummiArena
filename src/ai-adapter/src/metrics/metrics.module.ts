import { Module } from '@nestjs/common';
import { MetricsService } from './metrics.service';
import { MetricsController } from './metrics.controller';

/**
 * 성능 메트릭 모듈.
 *
 * LLM 호출의 응답 시간, 토큰 사용량, JSON 파싱 성공률,
 * 강제 드로우 비율 등을 Redis에 기록하고 조회한다.
 *
 * RedisModule이 Global로 등록되어 있으므로 별도 import 없이 REDIS_CLIENT 주입 가능.
 */
@Module({
  controllers: [MetricsController],
  providers: [MetricsService],
  exports: [MetricsService],
})
export class MetricsModule {}
