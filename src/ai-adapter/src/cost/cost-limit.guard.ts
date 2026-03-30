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
 * 일일 비용 한도 초과 시 요청을 거부하는 가드.
 *
 * POST /move 엔드포인트에 적용되어 DAILY_COST_LIMIT_USD 초과 시
 * 외부 LLM API 모델(openai, claude, deepseek) 호출을 차단한다.
 * Ollama(로컬)는 비용이 0이므로 차단하지 않는다.
 *
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

    const exceeded = await this.costTrackingService.isDailyLimitExceeded();

    if (exceeded) {
      this.logger.warn(
        `[CostLimitGuard] 일일 비용 한도 초과로 요청 거부: model=${model}`,
      );
      throw new HttpException(
        {
          statusCode: HttpStatus.TOO_MANY_REQUESTS,
          error: 'Daily Cost Limit Exceeded',
          message:
            '일일 LLM API 비용 한도를 초과했습니다. Ollama(로컬) 모델만 사용 가능합니다.',
          allowedModels: ['ollama'],
        },
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }

    return true;
  }
}
