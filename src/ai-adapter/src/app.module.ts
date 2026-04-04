import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ThrottlerModule } from '@nestjs/throttler';
import { APP_GUARD } from '@nestjs/core';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { HealthModule } from './health/health.module';
import { MoveModule } from './move/move.module';
import { CharacterModule } from './character/character.module';
import { RedisModule } from './redis/redis.module';
import { CostModule } from './cost/cost.module';
import { MetricsModule } from './metrics/metrics.module';
import { RateLimitGuard } from './common/guards/rate-limit.guard';

/**
 * RummiArena AI Adapter 루트 모듈.
 *
 * ConfigModule.forRoot()를 통해 .env 파일에서 환경변수를 로드한다.
 * isGlobal: true로 설정하여 모든 모듈에서 ConfigService를 별도 import 없이 사용 가능하다.
 *
 * ThrottlerModule: 글로벌 Rate Limit 적용.
 *   - 기본: 30 req/min (모든 엔드포인트)
 *   - 엔드포인트별 세분화는 @Throttle() 데코레이터로 개별 설정
 *   - /move: 20 req/min (LLM 호출 비용)
 *   - /health: 60 req/min
 *
 * RedisModule: Global 모듈로 REDIS_CLIENT를 전체 앱에 제공한다.
 * CostModule: LLM 비용 추적 및 GET /stats/cost 엔드포인트 제공.
 * MetricsModule: LLM 성능 메트릭 기록 및 GET /stats/metrics 엔드포인트 제공.
 */
@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: '.env',
      // .env 파일이 없어도 에러 없이 진행 (환경변수로 주입 가능)
      ignoreEnvFile: process.env.NODE_ENV === 'production',
    }),
    ThrottlerModule.forRoot([
      {
        name: 'default',
        ttl: 60000, // 1분 (밀리초)
        limit: 30, // 기본: 30 req/min
      },
    ]),
    RedisModule,
    HealthModule,
    MoveModule,
    CharacterModule,
    CostModule,
    MetricsModule,
  ],
  controllers: [AppController],
  providers: [
    AppService,
    {
      provide: APP_GUARD,
      useClass: RateLimitGuard,
    },
  ],
})
export class AppModule {}
