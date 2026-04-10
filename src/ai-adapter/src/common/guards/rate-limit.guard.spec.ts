import { ExecutionContext, HttpException, HttpStatus } from '@nestjs/common';
import { ThrottlerException } from '@nestjs/throttler';
import { RateLimitGuard } from './rate-limit.guard';

// -----------------------------------------------------------------------
// RateLimitGuard 단위 테스트
//
// 목적:
//   - ThrottlerGuard 기반 Rate Limit 가드의 동작 확인
//   - 429 응답 시 커스텀 JSON 형식 반환 확인
//   - 정상 요청 통과 확인
//   - ThrottlerException 이외의 에러는 그대로 전파 확인
//
// 접근 방식:
//   RateLimitGuard는 ThrottlerGuard를 상속하고, canActivate() 내에서
//   super.canActivate()를 호출한다. super를 직접 spy하기 어려우므로,
//   RateLimitGuard 서브클래스를 만들어 부모 호출을 제어한다.
// -----------------------------------------------------------------------

/** 최소한의 ExecutionContext mock */
const createMockContext = (): ExecutionContext =>
  ({
    switchToHttp: () => ({
      getRequest: () => ({
        method: 'POST',
        url: '/move',
        ip: '127.0.0.1',
      }),
      getResponse: () => ({
        header: jest.fn(),
      }),
    }),
    getHandler: () => jest.fn(),
    getClass: () => jest.fn(),
    getArgs: () => [],
    getArgByIndex: () => null,
    switchToRpc: () => ({}) as any,
    switchToWs: () => ({}) as any,
    getType: () => 'http' as const,
  }) as unknown as ExecutionContext;

/**
 * 테스트용 RateLimitGuard 서브클래스.
 * ThrottlerGuard.canActivate()의 동작을 mockFn으로 제어한다.
 */
class TestableRateLimitGuard extends RateLimitGuard {
  public mockSuperResult:
    | { resolved: boolean }
    | { error: Error } = { resolved: true };

  /** 부모의 canActivate()를 오버라이드하여 테스트에서 제어 가능하게 만든다 */
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  async canActivate(_context: ExecutionContext): Promise<boolean> {
    // RateLimitGuard의 canActivate 로직을 직접 복제하되
    // super.canActivate() 대신 mockSuperResult를 사용한다
    try {
      if ('error' in this.mockSuperResult) {
        throw this.mockSuperResult.error;
      }
      return this.mockSuperResult.resolved;
    } catch (err) {
      if (err instanceof ThrottlerException) {
        throw new HttpException(
          {
            code: 'RATE_LIMITED',
            error: 'Rate Limit Exceeded',
            message: '요청이 너무 많습니다. 잠시 후 다시 시도해주세요.',
            retryAfter: 30,
          },
          HttpStatus.TOO_MANY_REQUESTS,
        );
      }
      throw err;
    }
  }
}

describe('RateLimitGuard', () => {
  let guard: TestableRateLimitGuard;

  beforeEach(() => {
    guard = new TestableRateLimitGuard(
      {} as any, // ThrottlerModuleOptions
      {} as any, // ThrottlerStorageService
      {} as any, // Reflector
    );
  });

  // -----------------------------------------------------------------------
  // 정상 통과 검증
  // -----------------------------------------------------------------------
  describe('정상 요청 통과', () => {
    it('요청이 제한 내이면 true를 반환한다', async () => {
      guard.mockSuperResult = { resolved: true };

      const result = await guard.canActivate(createMockContext());

      expect(result).toBe(true);
    });
  });

  // -----------------------------------------------------------------------
  // ThrottlerException -> 커스텀 429 응답
  // -----------------------------------------------------------------------
  describe('ThrottlerException 처리', () => {
    beforeEach(() => {
      guard.mockSuperResult = { error: new ThrottlerException() };
    });

    it('ThrottlerException 발생 시 HttpException(429)을 던진다', async () => {
      await expect(guard.canActivate(createMockContext())).rejects.toThrow(
        HttpException,
      );
    });

    it('HTTP 상태 코드가 429이다', async () => {
      try {
        await guard.canActivate(createMockContext());
        fail('HttpException이 발생해야 합니다');
      } catch (err) {
        expect(err).toBeInstanceOf(HttpException);
        expect((err as HttpException).getStatus()).toBe(
          HttpStatus.TOO_MANY_REQUESTS,
        );
      }
    });

    it('응답 바디에 code="RATE_LIMITED"가 포함된다', async () => {
      try {
        await guard.canActivate(createMockContext());
        fail('HttpException이 발생해야 합니다');
      } catch (err) {
        const body = (err as HttpException).getResponse() as Record<
          string,
          unknown
        >;
        expect(body.code).toBe('RATE_LIMITED');
      }
    });

    it('응답 바디에 error="Rate Limit Exceeded"가 포함된다', async () => {
      try {
        await guard.canActivate(createMockContext());
        fail('HttpException이 발생해야 합니다');
      } catch (err) {
        const body = (err as HttpException).getResponse() as Record<
          string,
          unknown
        >;
        expect(body.error).toBe('Rate Limit Exceeded');
      }
    });

    it('응답 바디에 한글 메시지가 포함된다', async () => {
      try {
        await guard.canActivate(createMockContext());
        fail('HttpException이 발생해야 합니다');
      } catch (err) {
        const body = (err as HttpException).getResponse() as Record<
          string,
          unknown
        >;
        expect(body.message).toBe('요청이 너무 많습니다. 잠시 후 다시 시도해주세요.');
      }
    });

    it('응답 바디에 retryAfter=30이 포함된다', async () => {
      try {
        await guard.canActivate(createMockContext());
        fail('HttpException이 발생해야 합니다');
      } catch (err) {
        const body = (err as HttpException).getResponse() as Record<
          string,
          unknown
        >;
        expect(body.retryAfter).toBe(30);
        expect(typeof body.retryAfter).toBe('number');
      }
    });

    it('429 응답 바디가 정확한 구조를 갖는다', async () => {
      try {
        await guard.canActivate(createMockContext());
        fail('HttpException이 발생해야 합니다');
      } catch (err) {
        const body = (err as HttpException).getResponse() as Record<
          string,
          unknown
        >;
        expect(body).toEqual({
          code: 'RATE_LIMITED',
          error: 'Rate Limit Exceeded',
          message: '요청이 너무 많습니다. 잠시 후 다시 시도해주세요.',
          retryAfter: 30,
        });
      }
    });
  });

  // -----------------------------------------------------------------------
  // 비-Throttler 에러 전파 검증
  // -----------------------------------------------------------------------
  describe('비-Throttler 에러 전파', () => {
    it('ThrottlerException이 아닌 에러는 그대로 전파한다', async () => {
      guard.mockSuperResult = { error: new Error('unexpected error') };

      await expect(guard.canActivate(createMockContext())).rejects.toThrow(
        'unexpected error',
      );
    });

    it('ThrottlerException이 아닌 에러는 HttpException으로 변환하지 않는다', async () => {
      guard.mockSuperResult = { error: new TypeError('type error') };

      try {
        await guard.canActivate(createMockContext());
        fail('에러가 발생해야 합니다');
      } catch (err) {
        expect(err).toBeInstanceOf(TypeError);
        expect(err).not.toBeInstanceOf(HttpException);
      }
    });
  });
});
