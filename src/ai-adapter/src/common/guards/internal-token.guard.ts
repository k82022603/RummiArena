import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Request } from 'express';

/**
 * 내부 서비스 간 통신용 토큰 가드.
 * X-Internal-Token 헤더가 AI_ADAPTER_INTERNAL_TOKEN 환경변수와 일치해야 통과한다.
 * AI_ADAPTER_INTERNAL_TOKEN이 비어 있으면 개발 환경으로 간주하고 통과시킨다.
 */
@Injectable()
export class InternalTokenGuard implements CanActivate {
  constructor(private readonly configService: ConfigService) {}

  canActivate(context: ExecutionContext): boolean {
    const expectedToken = this.configService.get<string>(
      'AI_ADAPTER_INTERNAL_TOKEN',
      '',
    );

    // 토큰 미설정 시 개발 환경으로 간주 — 경고 로그 없이 통과
    if (!expectedToken) {
      return true;
    }

    const request = context.switchToHttp().getRequest<Request>();
    const provided = request.headers['x-internal-token'];

    if (!provided || provided !== expectedToken) {
      throw new UnauthorizedException('Invalid internal token');
    }

    return true;
  }
}
