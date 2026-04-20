import { DashScopeAdapter } from './dashscope.service';
import { PromptBuilderService } from '../../prompt/prompt-builder.service';
import { ResponseParserService } from '../../common/parser/response-parser.service';
import { ConfigService } from '@nestjs/config';
import axios from 'axios';
import {
  MoveRequestDto,
  GameStateDto,
} from '../../common/dto/move-request.dto';
import {
  DASHSCOPE_DEFAULT_MODEL,
  DASHSCOPE_BASE_URL,
  DASHSCOPE_MODELS,
} from './dashscope.types';

jest.mock('axios');
const mockedAxios = axios as jest.Mocked<typeof axios>;

// -----------------------------------------------------------------------
// DashScopeAdapter 단위 테스트
//
// 목적 (task #10 C2 완료 기준):
//   - 정상 응답 파싱 (content + reasoning_content)
//   - 401 / 429(QPS) / 429(quota) / 500 / 503 / 타임아웃 에러 분류
//   - JSON 파싱 실패 → fallback draw
//   - 빈 응답 처리
//   - thinking-only 모델의 timeout 강제 600초
//   - extra_body(enable_thinking, thinking_budget) 주입 확인
//
// 모든 테스트는 mock HTTP 만 사용 — 실제 DashScope API 호출 금지.
// -----------------------------------------------------------------------

const makeGameState = (): GameStateDto => ({
  tableGroups: [],
  myTiles: ['K1a', 'K2a', 'K3a', 'Y7b'],
  opponents: [{ playerId: 'opponent-01', remainingTiles: 11 }],
  drawPileCount: 55,
  turnNumber: 1,
  initialMeldDone: false,
});

const makeMoveRequest = (
  overrides: Partial<MoveRequestDto> = {},
): MoveRequestDto => ({
  gameId: 'dashscope-test-001',
  playerId: 'ai-dashscope',
  gameState: makeGameState(),
  persona: 'wall',
  difficulty: 'intermediate',
  psychologyLevel: 1,
  maxRetries: 3,
  timeoutMs: 30000,
  ...overrides,
});

/** DashScope OpenAI-compat 응답 형식 (reasoning_content 포함) */
const makeDashScopeResponse = (
  content: string,
  reasoningContent: string | null = 'thinking...',
  promptTokens = 250,
  completionTokens = 800,
) => ({
  data: {
    id: 'chatcmpl-dashscope-test',
    object: 'chat.completion',
    choices: [
      {
        index: 0,
        message: {
          role: 'assistant',
          content,
          reasoning_content: reasoningContent,
        },
        finish_reason: 'stop',
      },
    ],
    usage: {
      prompt_tokens: promptTokens,
      completion_tokens: completionTokens,
      total_tokens: promptTokens + completionTokens,
    },
    model: DASHSCOPE_DEFAULT_MODEL,
  },
  status: 200,
});

/** HTTP 응답 구조를 가진 axios 에러 팩토리 */
const makeAxiosError = (
  status: number,
  data: { error?: { code?: string; message?: string } } = {},
  code?: string,
): Error => {
  const err: any = new Error(`Request failed with status code ${status}`);
  err.isAxiosError = true;
  err.code = code;
  err.response = { status, data };
  return err;
};

const makeTimeoutError = (): Error => {
  const err: any = new Error('timeout of 600000ms exceeded');
  err.isAxiosError = true;
  err.code = 'ECONNABORTED';
  return err;
};

/** thinking-only 모델로 설정된 어댑터 (qwen3-235b-a22b-thinking-2507) */
const makeAdapter = (modelOverride?: string) => {
  const promptBuilder = new PromptBuilderService();
  const responseParser = new ResponseParserService();
  const configService = {
    get: jest.fn((key: string, defaultValue?: string) => {
      const config: Record<string, string> = {
        DASHSCOPE_API_KEY: 'test-dashscope-key',
        DASHSCOPE_DEFAULT_MODEL: modelOverride ?? DASHSCOPE_DEFAULT_MODEL,
        DASHSCOPE_BASE_URL: DASHSCOPE_BASE_URL,
        DASHSCOPE_THINKING_BUDGET: '15000',
      };
      return config[key] ?? defaultValue;
    }),
  } as unknown as ConfigService;
  const adapter = new DashScopeAdapter(
    promptBuilder,
    responseParser,
    configService,
  );
  jest.spyOn(adapter as any, 'backoff').mockResolvedValue(undefined);
  return adapter;
};

describe('DashScopeAdapter', () => {
  let adapter: DashScopeAdapter;

  beforeEach(() => {
    adapter = makeAdapter();
    jest.clearAllMocks();
  });

  // -----------------------------------------------------------------------
  // 메타데이터 / 모델 정보
  // -----------------------------------------------------------------------
  describe('getModelInfo()', () => {
    it('modelType=dashscope, modelName=qwen3-235b-a22b-thinking-2507 을 반환한다', () => {
      const info = adapter.getModelInfo();
      expect(info.modelType).toBe('dashscope');
      expect(info.modelName).toBe('qwen3-235b-a22b-thinking-2507');
      expect(info.baseUrl).toContain('dashscope-intl.aliyuncs.com');
    });

    it('DASHSCOPE_DEFAULT_MODEL 환경변수가 반영된다', () => {
      const custom = makeAdapter(DASHSCOPE_MODELS.QWEN3_NEXT_80B_THINKING);
      expect(custom.getModelInfo().modelName).toBe(
        'qwen3-next-80b-a3b-thinking',
      );
    });
  });

  // -----------------------------------------------------------------------
  // healthCheck()
  // -----------------------------------------------------------------------
  describe('healthCheck()', () => {
    it('/models 엔드포인트가 200 이면 true 를 반환한다', async () => {
      mockedAxios.get = jest.fn().mockResolvedValueOnce({ status: 200 });
      const result = await adapter.healthCheck();
      expect(result).toBe(true);
      expect(mockedAxios.get).toHaveBeenCalledWith(
        expect.stringContaining('/models'),
        expect.objectContaining({ timeout: 5000 }),
      );
    });

    it('네트워크 실패 시 false 를 반환한다', async () => {
      mockedAxios.get = jest.fn().mockRejectedValueOnce(new Error('ENOTFOUND'));
      const result = await adapter.healthCheck();
      expect(result).toBe(false);
    });
  });

  // -----------------------------------------------------------------------
  // generateMove() - 정상 응답 (thinking-only)
  // -----------------------------------------------------------------------
  describe('generateMove() - 정상 응답', () => {
    it('reasoning_content + content 가 모두 있을 때 action 을 정상 파싱한다', async () => {
      const content = JSON.stringify({
        action: 'draw',
        reasoning: 'no combo for 30pt meld',
      });
      mockedAxios.post = jest
        .fn()
        .mockResolvedValueOnce(makeDashScopeResponse(content, 'Analyzing...'));

      const response = await adapter.generateMove(makeMoveRequest());

      expect(response.action).toBe('draw');
      expect(response.metadata.modelType).toBe('dashscope');
      expect(response.metadata.modelName).toBe('qwen3-235b-a22b-thinking-2507');
      expect(response.metadata.isFallbackDraw).toBe(false);
    });

    it('place 응답을 올바른 tableGroups/tilesFromRack 으로 파싱한다', async () => {
      const content = JSON.stringify({
        action: 'place',
        tableGroups: [{ tiles: ['K1a', 'K2a', 'K3a'] }],
        tilesFromRack: ['K1a', 'K2a', 'K3a'],
        reasoning: 'Black run 1-2-3',
      });
      mockedAxios.post = jest
        .fn()
        .mockResolvedValueOnce(makeDashScopeResponse(content));

      const response = await adapter.generateMove(makeMoveRequest());
      expect(response.action).toBe('place');
      expect(response.tableGroups).toHaveLength(1);
      expect(response.tilesFromRack).toEqual(['K1a', 'K2a', 'K3a']);
    });

    it('token usage 가 metadata 에 반영된다', async () => {
      mockedAxios.post = jest
        .fn()
        .mockResolvedValueOnce(
          makeDashScopeResponse(
            JSON.stringify({ action: 'draw', reasoning: 'ok' }),
            'thinking',
            333,
            777,
          ),
        );
      const response = await adapter.generateMove(makeMoveRequest());
      expect(response.metadata.promptTokens).toBe(333);
      expect(response.metadata.completionTokens).toBe(777);
    });
  });

  // -----------------------------------------------------------------------
  // generateMove() - 요청 바디/헤더 검증
  // -----------------------------------------------------------------------
  describe('generateMove() - 요청 바디/헤더', () => {
    it('`/chat/completions` 엔드포인트로 POST 를 전송한다', async () => {
      mockedAxios.post = jest
        .fn()
        .mockResolvedValueOnce(
          makeDashScopeResponse(JSON.stringify({ action: 'draw' })),
        );
      await adapter.generateMove(makeMoveRequest());
      const [url] = (mockedAxios.post as jest.Mock).mock.calls[0];
      expect(url).toContain('/chat/completions');
      expect(url).toContain('dashscope-intl.aliyuncs.com');
    });

    it('요청 바디에 enable_thinking=true, thinking_budget=15000 이 포함된다', async () => {
      mockedAxios.post = jest
        .fn()
        .mockResolvedValueOnce(
          makeDashScopeResponse(JSON.stringify({ action: 'draw' })),
        );
      await adapter.generateMove(makeMoveRequest());
      const [, body] = (mockedAxios.post as jest.Mock).mock.calls[0];
      expect(body.enable_thinking).toBe(true);
      expect(body.thinking_budget).toBe(15000);
    });

    it('thinking-only 모델은 temperature / response_format 을 요청에 포함하지 않는다', async () => {
      mockedAxios.post = jest
        .fn()
        .mockResolvedValueOnce(
          makeDashScopeResponse(JSON.stringify({ action: 'draw' })),
        );
      await adapter.generateMove(makeMoveRequest());
      const [, body] = (mockedAxios.post as jest.Mock).mock.calls[0];
      expect(body.temperature).toBeUndefined();
      expect(body.response_format).toBeUndefined();
    });

    it('Authorization Bearer 헤더가 포함된다', async () => {
      mockedAxios.post = jest
        .fn()
        .mockResolvedValueOnce(
          makeDashScopeResponse(JSON.stringify({ action: 'draw' })),
        );
      await adapter.generateMove(makeMoveRequest());
      const [, , config] = (mockedAxios.post as jest.Mock).mock.calls[0];
      expect(config.headers.Authorization).toBe('Bearer test-dashscope-key');
    });

    it('thinking-only 모델은 timeoutMs 와 무관하게 최소 600_000ms 타임아웃이 적용된다', async () => {
      mockedAxios.post = jest
        .fn()
        .mockResolvedValueOnce(
          makeDashScopeResponse(JSON.stringify({ action: 'draw' })),
        );
      await adapter.generateMove(makeMoveRequest({ timeoutMs: 10_000 }));
      const [, , config] = (mockedAxios.post as jest.Mock).mock.calls[0];
      expect(config.timeout).toBe(600_000);
    });
  });

  // -----------------------------------------------------------------------
  // generateMove() - 에러 분류 및 fallback
  // -----------------------------------------------------------------------
  describe('generateMove() - 에러 처리', () => {
    it('401 인증 에러는 재시도 후 fallback draw 를 반환한다', async () => {
      mockedAxios.post = jest.fn().mockRejectedValue(
        makeAxiosError(401, {
          error: { code: 'InvalidApiKey', message: 'Unauthorized' },
        }),
      );

      const response = await adapter.generateMove(
        makeMoveRequest({ maxRetries: 2 }),
      );

      expect(response.action).toBe('draw');
      expect(response.metadata.isFallbackDraw).toBe(true);
      expect(response.metadata.retryCount).toBe(2);
    });

    it('429 QPS 초과 에러는 재시도 가능 분류(rate_limit_qps)로 인식한다', () => {
      const err = makeAxiosError(429, {
        error: {
          code: 'Throttling',
          message: 'queries per second (QPS) exceeded',
        },
      });
      expect(adapter.classifyError(err)).toBe('rate_limit_qps');
    });

    it('429 quota 초과는 quota_exceeded 로 분류되고 즉시 fallback 으로 전환된다', async () => {
      const quotaErr = makeAxiosError(429, {
        error: {
          code: 'QuotaExceeded',
          message: 'You exceeded your current quota, please check billing.',
        },
      });

      // classifyError 직접 분류 확인
      expect(adapter.classifyError(quotaErr)).toBe('quota_exceeded');

      // generateMove 시 quota 에러는 재시도를 중단하고 fallback 한다
      mockedAxios.post = jest.fn().mockRejectedValue(quotaErr);

      const response = await adapter.generateMove(
        makeMoveRequest({ maxRetries: 3 }),
      );

      expect(response.action).toBe('draw');
      expect(response.metadata.isFallbackDraw).toBe(true);
      // quota 감지 즉시 중단되므로 첫 시도 1 회만 호출되어야 한다
      expect((mockedAxios.post as jest.Mock).mock.calls.length).toBe(1);
    });

    it('500 서버 에러는 재시도 후 fallback draw 를 반환한다', async () => {
      mockedAxios.post = jest.fn().mockRejectedValue(
        makeAxiosError(500, {
          error: { code: 'InternalError', message: 'upstream failure' },
        }),
      );

      const response = await adapter.generateMove(
        makeMoveRequest({ maxRetries: 2 }),
      );

      expect(response.action).toBe('draw');
      expect(response.metadata.isFallbackDraw).toBe(true);
    });

    it('503 overloaded 를 overloaded 로 분류한다', () => {
      const err = makeAxiosError(503, {
        error: { code: 'Overloaded', message: 'engine busy' },
      });
      expect(adapter.classifyError(err)).toBe('overloaded');
    });

    it('ECONNABORTED 타임아웃 에러를 timeout 으로 분류한다', () => {
      const err = makeTimeoutError();
      expect(adapter.classifyError(err)).toBe('timeout');
    });

    it('타임아웃 발생 시 재시도 후 fallback draw 를 반환한다', async () => {
      mockedAxios.post = jest.fn().mockRejectedValue(makeTimeoutError());
      const response = await adapter.generateMove(
        makeMoveRequest({ maxRetries: 2 }),
      );
      expect(response.action).toBe('draw');
      expect(response.metadata.isFallbackDraw).toBe(true);
    });
  });

  // -----------------------------------------------------------------------
  // generateMove() - 파싱 실패 / 빈 응답
  // -----------------------------------------------------------------------
  describe('generateMove() - 파싱 실패 / 빈 응답', () => {
    it('JSON 이 아닌 응답은 재시도 후 fallback draw 가 된다', async () => {
      mockedAxios.post = jest
        .fn()
        .mockResolvedValue(
          makeDashScopeResponse('이건 JSON이 아닙니다', 'also not JSON'),
        );
      const response = await adapter.generateMove(
        makeMoveRequest({ maxRetries: 2 }),
      );
      expect(response.action).toBe('draw');
      expect(response.metadata.isFallbackDraw).toBe(true);
    });

    it('빈 응답(빈 content + 빈 reasoning_content)은 fallback draw 를 반환한다', async () => {
      mockedAxios.post = jest
        .fn()
        .mockResolvedValue(makeDashScopeResponse('', ''));
      const response = await adapter.generateMove(
        makeMoveRequest({ maxRetries: 2 }),
      );
      expect(response.action).toBe('draw');
      expect(response.metadata.isFallbackDraw).toBe(true);
    });

    it('choices 가 빈 배열이면 에러로 처리되고 fallback draw 를 반환한다', async () => {
      mockedAxios.post = jest.fn().mockResolvedValue({
        data: {
          id: 'empty',
          object: 'chat.completion',
          choices: [],
          usage: { prompt_tokens: 0, completion_tokens: 0, total_tokens: 0 },
          model: DASHSCOPE_DEFAULT_MODEL,
        },
        status: 200,
      });
      const response = await adapter.generateMove(
        makeMoveRequest({ maxRetries: 2 }),
      );
      expect(response.action).toBe('draw');
      expect(response.metadata.isFallbackDraw).toBe(true);
    });
  });

  // -----------------------------------------------------------------------
  // extractBestJson - DeepSeek Reasoner 동일 패턴 검증
  // -----------------------------------------------------------------------
  describe('extractBestJson()', () => {
    it('content 가 순수 JSON 이면 그대로 반환한다', () => {
      const json = '{"action":"draw","reasoning":"no combo"}';
      const result = adapter.extractBestJson(json, '');
      expect(JSON.parse(result).action).toBe('draw');
    });

    it('content 가 마크다운 코드블록에 감싸져 있어도 JSON 을 추출한다', () => {
      const wrapped = '```json\n{"action":"draw","reasoning":"t"}\n```';
      const result = adapter.extractBestJson(wrapped, '');
      expect(JSON.parse(result).action).toBe('draw');
    });

    it('content 가 비어 있고 reasoning_content 에 JSON 이 있으면 그걸 사용한다', () => {
      const reasoning =
        'Let me think... Final answer: {"action":"draw","reasoning":"no meld"}';
      const result = adapter.extractBestJson('', reasoning);
      expect(JSON.parse(result).action).toBe('draw');
    });

    it('reasoning_content 에 여러 JSON 후보가 있으면 마지막(최종 결론)을 반환한다', () => {
      const reasoning =
        '{"action":"place","tableGroups":[]}\n' +
        'Wait, reconsider.\n' +
        '{"action":"draw","reasoning":"final"}';
      const result = adapter.extractBestJson('', reasoning);
      const parsed = JSON.parse(result);
      expect(parsed.action).toBe('draw');
      expect(parsed.reasoning).toBe('final');
    });

    it('trailing comma 가 있는 JSON 도 복구하여 파싱 가능하게 만든다', () => {
      const withComma = '{"action":"draw","reasoning":"x",}';
      const result = adapter.extractBestJson(withComma, '');
      expect(JSON.parse(result).action).toBe('draw');
    });
  });
});
