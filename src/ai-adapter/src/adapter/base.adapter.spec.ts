import { BaseAdapter } from './base.adapter';
import { PromptBuilderService } from '../prompt/prompt-builder.service';
import { ResponseParserService } from '../common/parser/response-parser.service';
import { MoveRequestDto } from '../common/dto/move-request.dto';
import { MoveResponseDto } from '../common/dto/move-response.dto';
import { ModelInfo } from '../common/interfaces/ai-adapter.interface';

// -----------------------------------------------------------------------
// BaseAdapter 단위 테스트
//
// 목적:
//   - backoff() 지수 백오프 대기 시간이 attempt 별로 올바른지 확인
//   - max 60000ms cap 이 적용되는지 확인 (이전 max 10000ms 에서 변경)
//   - jest fake timer 로 실제 대기 없이 setTimeout 호출값 검증
// -----------------------------------------------------------------------

/** 테스트용 최소 구현 어댑터 */
class TestAdapter extends BaseAdapter {
  getModelInfo(): ModelInfo {
    return { modelType: 'openai', modelName: 'test-model', baseUrl: 'http://localhost' };
  }

  async healthCheck(): Promise<boolean> {
    return true;
  }

  protected async callLlm(): Promise<{
    content: string;
    promptTokens: number;
    completionTokens: number;
  }> {
    return { content: '{}', promptTokens: 0, completionTokens: 0 };
  }

  /** protected 메서드를 테스트에서 직접 호출할 수 있도록 공개 */
  async callBackoff(attempt: number): Promise<void> {
    return this.backoff(attempt);
  }
}

describe('BaseAdapter - backoff()', () => {
  let adapter: TestAdapter;

  beforeEach(() => {
    const promptBuilder = new PromptBuilderService();
    const responseParser = new ResponseParserService();
    adapter = new TestAdapter(promptBuilder, responseParser, 'TestAdapter');
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  /**
   * backoff(attempt) 이 setTimeout 에 전달하는 ms 값을 검증한다.
   * jest.useFakeTimers() 환경에서 Promise 와 setTimeout 이 함께 동작하려면
   * backoff() 호출 후 jest.runAllTimers() 로 타이머를 완료시켜야 한다.
   */
  const getBackoffMs = async (attempt: number): Promise<number> => {
    let capturedMs = -1;
    const originalSetTimeout = global.setTimeout;
    jest
      .spyOn(global, 'setTimeout')
      .mockImplementationOnce((fn: TimerHandler, ms?: number) => {
        capturedMs = ms ?? 0;
        return originalSetTimeout(fn as () => void, 0); // 즉시 실행
      });

    await adapter.callBackoff(attempt);
    return capturedMs;
  };

  it('attempt=1 이면 2000ms 를 대기한다', async () => {
    jest.useRealTimers(); // 실제 타이머로 값 캡처
    const ms = await getBackoffMs(1);
    expect(ms).toBe(2000);
  });

  it('attempt=2 이면 4000ms 를 대기한다', async () => {
    jest.useRealTimers();
    const ms = await getBackoffMs(2);
    expect(ms).toBe(4000);
  });

  it('attempt=3 이면 8000ms 를 대기한다', async () => {
    jest.useRealTimers();
    const ms = await getBackoffMs(3);
    expect(ms).toBe(8000);
  });

  it('attempt=4 이면 16000ms 를 대기한다', async () => {
    jest.useRealTimers();
    const ms = await getBackoffMs(4);
    expect(ms).toBe(16000);
  });

  it('attempt=5 이면 32000ms 를 대기한다', async () => {
    jest.useRealTimers();
    const ms = await getBackoffMs(5);
    expect(ms).toBe(32000);
  });

  it('attempt=6 이면 60000ms 로 cap 된다 (이전 max 10000ms 에서 변경)', async () => {
    jest.useRealTimers();
    const ms = await getBackoffMs(6);
    expect(ms).toBe(60000);
  });

  it('attempt=10 이어도 60000ms 를 초과하지 않는다', async () => {
    jest.useRealTimers();
    const ms = await getBackoffMs(10);
    expect(ms).toBe(60000);
  });

  it('attempt=0 이면 1000ms 를 대기한다 (첫 시도는 base 에서 호출 안 하지만 인터페이스 확인)', async () => {
    jest.useRealTimers();
    const ms = await getBackoffMs(0);
    expect(ms).toBe(1000);
  });
});

describe('BaseAdapter - generateMove() backoff 호출 패턴', () => {
  let adapter: TestAdapter;
  let backoffSpy: jest.SpyInstance;

  const makeRequest = (overrides: Partial<MoveRequestDto> = {}): MoveRequestDto => ({
    gameId: 'base-test-001',
    playerId: 'ai-test',
    gameState: {
      tableGroups: [],
      myTiles: ['R1a', 'R2a', 'R3a'],
      opponents: [{ playerId: 'p2', remainingTiles: 10 }],
      drawPileCount: 50,
      turnNumber: 1,
      initialMeldDone: false,
    },
    persona: 'rookie',
    difficulty: 'intermediate',
    psychologyLevel: 0,
    maxRetries: 3,
    timeoutMs: 30000,
    ...overrides,
  });

  beforeEach(() => {
    const promptBuilder = new PromptBuilderService();
    const responseParser = new ResponseParserService();
    adapter = new TestAdapter(promptBuilder, responseParser, 'TestAdapter');
    backoffSpy = jest.spyOn(adapter as any, 'backoff').mockResolvedValue(undefined);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('첫 시도(attempt=0) 는 backoff 를 호출하지 않는다', async () => {
    jest
      .spyOn(adapter as any, 'callLlm')
      .mockResolvedValue({
        content: JSON.stringify({ action: 'draw', reasoning: 'test' }),
        promptTokens: 10,
        completionTokens: 5,
      });

    await adapter.generateMove(makeRequest({ maxRetries: 1 }));

    expect(backoffSpy).not.toHaveBeenCalled();
  });

  it('maxRetries=3 에서 모두 실패하면 backoff 가 2회 호출된다 (attempt 1, 2)', async () => {
    jest
      .spyOn(adapter as any, 'callLlm')
      .mockResolvedValue({
        content: 'invalid-json-not-parseable',
        promptTokens: 10,
        completionTokens: 5,
      });

    const response: MoveResponseDto = await adapter.generateMove(makeRequest({ maxRetries: 3 }));

    expect(response.metadata.isFallbackDraw).toBe(true);
    expect(backoffSpy).toHaveBeenCalledTimes(2);
    expect(backoffSpy).toHaveBeenNthCalledWith(1, 1);
    expect(backoffSpy).toHaveBeenNthCalledWith(2, 2);
  });

  it('maxRetries=5 에서 모두 실패하면 backoff 가 4회 호출된다', async () => {
    jest
      .spyOn(adapter as any, 'callLlm')
      .mockResolvedValue({
        content: 'invalid-json',
        promptTokens: 10,
        completionTokens: 5,
      });

    await adapter.generateMove(makeRequest({ maxRetries: 5 }));

    expect(backoffSpy).toHaveBeenCalledTimes(4);
  });
});
