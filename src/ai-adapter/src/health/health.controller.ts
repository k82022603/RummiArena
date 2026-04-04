import { Controller, Get } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { HealthService } from './health.service';

/**
 * 헬스체크 컨트롤러.
 * Kubernetes liveness/readiness probe 및 외부 모니터링 용도.
 */
@Throttle({ default: { ttl: 60000, limit: 60 } }) // 60 req/min (헬스체크용, 관대하게 설정)
@Controller('health')
export class HealthController {
  constructor(private readonly healthService: HealthService) {}

  /**
   * 서비스 기본 헬스체크.
   * Kubernetes liveness probe에서 사용.
   * GET /health
   */
  @Get()
  check(): { status: string; timestamp: string } {
    return {
      status: 'ok',
      timestamp: new Date().toISOString(),
    };
  }

  /**
   * 모든 LLM 어댑터 연결 상태 확인.
   * Kubernetes readiness probe에서 사용.
   * GET /health/adapters
   */
  @Get('adapters')
  async checkAdapters(): Promise<{
    status: string;
    adapters: Record<string, boolean>;
    timestamp: string;
  }> {
    const adapterStatus = await this.healthService.checkAllAdapters();
    const allHealthy = Object.values(adapterStatus).every(Boolean);

    return {
      status: allHealthy ? 'ok' : 'degraded',
      adapters: adapterStatus,
      timestamp: new Date().toISOString(),
    };
  }
}
