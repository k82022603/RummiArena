import {
  Injectable,
  ExecutionContext,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { ThrottlerGuard, ThrottlerException } from '@nestjs/throttler';

/**
 * Rate Limit 가드.
 *
 * @nestjs/throttler 기반으로 엔드포인트별 요청 제한을 적용한다.
 * 429 응답 시 커스텀 JSON 형식을 반환한다.
 *
 * 기본 설정 (AppModule에서 ThrottlerModule로 구성):
 *   - /move (POST): 20 req/min (LLM 호출 비용이 높음)
 *   - /health, /health/adapters: 60 req/min
 *   - 기타: 30 req/min
 */
@Injectable()
export class RateLimitGuard extends ThrottlerGuard {
  private readonly rateLimitLogger = new Logger(RateLimitGuard.name);

  /**
   * ThrottlerGuard의 handleRequest를 오버라이드하여 429 응답을 커스텀 형식으로 변환한다.
   */
  async canActivate(context: ExecutionContext): Promise<boolean> {
    try {
      return await super.canActivate(context);
    } catch (err) {
      if (err instanceof ThrottlerException) {
        const request = context.switchToHttp().getRequest();
        this.rateLimitLogger.warn(
          `[RateLimitGuard] 요청 제한 초과: ${request.method} ${request.url} IP=${request.ip}`,
        );

        throw new HttpException(
          {
            error: 'RATE_LIMITED',
            message: 'Too many requests',
            retryAfter: 30,
          },
          HttpStatus.TOO_MANY_REQUESTS,
        );
      }
      throw err;
    }
  }
}
