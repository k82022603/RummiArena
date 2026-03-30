import { Module, Global, Logger, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Redis from 'ioredis';

export const REDIS_CLIENT = 'REDIS_CLIENT';

/**
 * Redis 연결 모듈.
 * Global 모듈로 선언하여 전체 애플리케이션에서 REDIS_CLIENT 토큰으로 주입 가능.
 *
 * K8s 환경에서는 redis:6379 (rummikub namespace)로 연결된다.
 * 로컬 개발 환경에서는 REDIS_HOST, REDIS_PORT 환경변수로 설정 가능.
 */
@Global()
@Module({
  providers: [
    {
      provide: REDIS_CLIENT,
      useFactory: (configService: ConfigService): Redis => {
        const logger = new Logger('RedisModule');
        const host = configService.get<string>('REDIS_HOST', 'localhost');
        const port = configService.get<number>('REDIS_PORT', 6379);

        const client = new Redis({
          host,
          port,
          // 연결 실패 시 재시도 (최대 10회, 점진적 백오프)
          retryStrategy: (times: number) => {
            if (times > 10) {
              logger.error(
                `Redis 연결 재시도 ${times}회 초과. 연결 포기.`,
              );
              return null;
            }
            const delay = Math.min(times * 500, 5000);
            logger.warn(
              `Redis 연결 재시도 ${times}회 (${delay}ms 후)`,
            );
            return delay;
          },
          // 연결 타임아웃 5초
          connectTimeout: 5000,
          // 명령 타임아웃 3초
          commandTimeout: 3000,
          // 연결이 끊어져도 명령 큐에 쌓지 않음
          enableOfflineQueue: false,
          // lazy connect: 실제 명령 실행 시 연결 시도
          lazyConnect: true,
        });

        client.on('connect', () => {
          logger.log(`Redis 연결 성공 (${host}:${port})`);
        });

        client.on('error', (err: Error) => {
          logger.error(`Redis 연결 오류: ${err.message}`);
        });

        client.on('close', () => {
          logger.warn('Redis 연결 종료');
        });

        // lazy connect이므로 명시적 연결 시도
        client.connect().catch((err: Error) => {
          logger.warn(
            `Redis 초기 연결 실패 (비용 추적 비활성화): ${err.message}`,
          );
        });

        return client;
      },
      inject: [ConfigService],
    },
  ],
  exports: [REDIS_CLIENT],
})
export class RedisModule implements OnModuleDestroy {
  private readonly logger = new Logger('RedisModule');

  constructor(private readonly configService: ConfigService) {}

  /**
   * 애플리케이션 종료 시 Redis 연결을 정리한다.
   * 단, REDIS_CLIENT가 Global provider이므로 직접 참조하지 않고
   * 모듈 수준에서 처리한다.
   */
  async onModuleDestroy(): Promise<void> {
    this.logger.log('Redis 모듈 종료');
  }
}
