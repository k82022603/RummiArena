import {
  CanActivate,
  ExecutionContext,
  Injectable,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { CostTrackingService } from './cost-tracking.service';

/**
 * 비용 한도 초과 시 요청을 거부하는 가드.
 *
 * POST /move 엔드포인트에 적용되어 다음 두 가지를 검사한다:
 * 1. DAILY_COST_LIMIT_USD 초과 시 외부 LLM API 모델 호출 차단
 * 2. HOURLY_USER_COST_LIMIT_USD 초과 시 해당 사용자/게임의 요청 차단
 *
 * Ollama(로컬)는 비용이 0이므로 차단하지 않는다.
 * Redis 연결 실패 시에는 요청을 허용한다 (가용성 우선).
 */
@Injectable()
export class CostLimitGuard implements CanActivate {
  private readonly logger = new Logger(CostLimitGuard.name);

  /** 비용이 0인 로컬 모델은 한도 초과 시에도 허용 */
  private static readonly FREE_MODELS = new Set(['ollama']);

  constructor(private readonly costTrackingService: CostTrackingService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest();
    const model: string = request.body?.model;

    // 무료 모델은 한도 체크 없이 통과
    if (CostLimitGuard.FREE_MODELS.has(model)) {
      return true;
    }

    // 1. 일일 전체 비용 한도 확인
    const dailyExceeded =
      await this.costTrackingService.isDailyLimitExceeded();

    if (dailyExceeded) {
      this.logger.warn(
        `[CostLimitGuard] 일일 비용 한도 초과로 요청 거부: model=${model}`,
      );
      throw new HttpException(
        {
          code: 'DAILY_COST_LIMIT_EXCEEDED',
          statusCode: HttpStatus.FORBIDDEN,
          error: 'Daily Cost Limit Exceeded',
          message:
            '일일 LLM API 비용 한도를 초과했습니다. Ollama(로컬) 모델만 사용 가능합니다.',
          allowedModels: ['ollama'],
        },
        HttpStatus.FORBIDDEN,
      );
    }

    // 2. 사용자/게임별 시간당 비용 한도 확인
    // game-server에서 보내는 요청에 gameId가 포함된다.
    // userId가 직접 전달되지 않으므로 gameId를 rate limit 키로 사용한다.
    const rateLimitKey: string | undefined = request.body?.gameId;

    if (rateLimitKey) {
      const hourlyExceeded =
        await this.costTrackingService.isUserHourlyLimitExceeded(rateLimitKey);

      if (hourlyExceeded) {
        this.logger.warn(
          `[CostLimitGuard] 시간당 사용자 비용 한도 초과로 요청 거부: gameId=${rateLimitKey} model=${model}`,
        );
        throw new HttpException(
          {
            code: 'HOURLY_COST_LIMIT_EXCEEDED',
            statusCode: HttpStatus.FORBIDDEN,
            error: 'Hourly User Cost Limit Exceeded',
            message:
              '시간당 사용자 비용 한도를 초과했습니다. 잠시 후 다시 시도해주세요.',
            allowedModels: ['ollama'],
          },
          HttpStatus.FORBIDDEN,
        );
      }
    }

    return true;
  }
}
