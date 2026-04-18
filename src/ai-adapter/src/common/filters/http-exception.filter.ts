import {
  ExceptionFilter,
  Catch,
  ArgumentsHost,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { Response } from 'express';

/**
 * 글로벌 예외 필터.
 *
 * 모든 HTTP 에러 응답을 통일된 형식으로 변환한다:
 * {
 *   error: {
 *     code: "ERROR_CODE",
 *     message: "사용자 메시지",
 *     statusCode: 403
 *   }
 * }
 *
 * HttpException이 아닌 예외는 500 INTERNAL_ERROR로 처리한다.
 */
@Catch()
export class GlobalHttpExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(GlobalHttpExceptionFilter.name);

  catch(exception: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();

    let status = HttpStatus.INTERNAL_SERVER_ERROR;
    let code = 'INTERNAL_ERROR';
    let message = 'Internal server error';

    if (exception instanceof HttpException) {
      status = exception.getStatus();
      const exResponse = exception.getResponse();
      if (typeof exResponse === 'object' && exResponse !== null) {
        const obj = exResponse as Record<string, unknown>;
        code =
          (obj.code as string) ?? (obj.error as string) ?? `HTTP_${status}`;
        message = (obj.message as string) ?? exception.message;
      } else {
        message = String(exResponse);
      }
    } else {
      this.logger.error(
        'Unhandled exception',
        exception instanceof Error ? exception.stack : String(exception),
      );
    }

    response.status(status).json({
      error: { code, message, statusCode: status },
    });
  }
}
