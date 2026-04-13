import { DeepSeekAdapter } from './deepseek.adapter';
import { PromptBuilderService } from '../prompt/prompt-builder.service';
import { ResponseParserService } from '../common/parser/response-parser.service';
import { ConfigService } from '@nestjs/config';
import axios from 'axios';
import { MoveRequestDto, GameStateDto } from '../common/dto/move-request.dto';

// axios 전체를 mock
jest.mock('axios');
const mockedAxios = axios as jest.Mocked<typeof axios>;

// -----------------------------------------------------------------------
// DeepSeekAdapter 단위 테스트
//
// 목적:
//   - DeepSeek OpenAI 호환 API 응답을 mock하여 MoveResponseDto 파싱 확인
//   - healthCheck() 동작 확인
//   - getModelInfo() 설정값 반영 확인
//   - OpenAI 호환 포맷(choices[0].message.content)으로 파싱되는지 확인
//   - Reasoner 모드: 전용 프롬프트, JSON 추출, reasoning_content 파싱 확인
// -----------------------------------------------------------------------

const makeGameState = (): GameStateDto => ({
  tableGroups: [],
  myTiles: ['K1a', 'K2a', 'K3a', 'Y7b'],
  opponents: [{ playerId: 'opponent-01', remainingTiles: 11 }],
  drawPileCount: 55,
  turnNumber: 1,
  initialMeldDone: false,
});

const makeGameStateWithTable = (): GameStateDto => ({
  tableGroups: [{ tiles: ['R3a', 'R4a', 'R5a'] }],
  myTiles: ['R6a', 'B2a', 'K10a'],
  opponents: [{ playerId: 'opponent-01', remainingTiles: 5 }],
  drawPileCount: 40,
  turnNumber: 10,
  initialMeldDone: true,
});

const makeMoveRequest = (
  overrides: Partial<MoveRequestDto> = {},
): MoveRequestDto => ({
  gameId: 'deepseek-test-001',
  playerId: 'ai-deepseek',
  gameState: makeGameState(),
  persona: 'wall',
  difficulty: 'intermediate',
  psychologyLevel: 1,
  maxRetries: 3,
  timeoutMs: 30000,
  ...overrides,
});

/** DeepSeek /v1/chat/completions 응답 형식 (OpenAI 호환) */
const makeDeepSeekResponse = (
  content: string,
  promptTokens = 90,
  completionTokens = 45,
) => ({
  data: {
    id: 'chatcmpl-test',
    object: 'chat.completion',
    choices: [
      {
        index: 0,
        message: {
          role: 'assistant',
          content,
        },
        finish_reason: 'stop',
      },
    ],
    usage: {
      prompt_tokens: promptTokens,
      completion_tokens: completionTokens,
      total_tokens: promptTokens + completionTokens,
    },
    model: 'deepseek-chat',
  },
  status: 200,
});

/** DeepSeek Reasoner 응답 형식 (reasoning_content 포함) */
const makeReasonerResponse = (
  content: string,
  reasoningContent: string,
  promptTokens = 200,
  completionTokens = 500,
) => ({
  data: {
    id: 'chatcmpl-reasoner-test',
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
    model: 'deepseek-reasoner',
  },
  status: 200,
});

/** deepseek-chat 어댑터 생성 헬퍼 (향후 chat 모델 테스트용) */
// eslint-disable-next-line @typescript-eslint/no-unused-vars
const makeChatAdapter = () => {
  const promptBuilder = new PromptBuilderService();
  const responseParser = new ResponseParserService();
  const configService = {
    get: jest.fn((key: string, defaultValue?: string) => {
      const config: Record<string, string> = {
        DEEPSEEK_API_KEY: 'test-deepseek-key',
        DEEPSEEK_DEFAULT_MODEL: 'deepseek-chat',
      };
      return config[key] ?? defaultValue;
    }),
  } as unknown as ConfigService;
  return new DeepSeekAdapter(promptBuilder, responseParser, configService);
};

/** deepseek-reasoner 어댑터 생성 헬퍼 */
const makeReasonerAdapter = () => {
  const promptBuilder = new PromptBuilderService();
  const responseParser = new ResponseParserService();
  const configService = {
    get: jest.fn((key: string, defaultValue?: string) => {
      const config: Record<string, string> = {
        DEEPSEEK_API_KEY: 'test-deepseek-key',
        DEEPSEEK_DEFAULT_MODEL: 'deepseek-reasoner',
      };
      return config[key] ?? defaultValue;
    }),
  } as unknown as ConfigService;
  return new DeepSeekAdapter(promptBuilder, responseParser, configService);
};

describe('DeepSeekAdapter', () => {
  let adapter: DeepSeekAdapter;
  let promptBuilder: PromptBuilderService;
  let responseParser: ResponseParserService;
  let configService: ConfigService;

  beforeEach(() => {
    promptBuilder = new PromptBuilderService();
    responseParser = new ResponseParserService();

    configService = {
      get: jest.fn((key: string, defaultValue?: string) => {
        const config: Record<string, string> = {
          DEEPSEEK_API_KEY: 'test-deepseek-key',
          DEEPSEEK_DEFAULT_MODEL: 'deepseek-chat',
        };
        return config[key] ?? defaultValue;
      }),
    } as unknown as ConfigService;

    adapter = new DeepSeekAdapter(promptBuilder, responseParser, configService);
    jest.clearAllMocks();

    // 재시도 지수 백오프를 무효화하여 테스트 타임아웃 방지
    jest.spyOn(adapter as any, 'backoff').mockResolvedValue(undefined);
  });

  // -----------------------------------------------------------------------
  // getModelInfo()
  // -----------------------------------------------------------------------
  describe('getModelInfo()', () => {
    it('modelType=deepseek, modelName=deepseek-chat를 반환한다', () => {
      const info = adapter.getModelInfo();

      expect(info.modelType).toBe('deepseek');
      expect(info.modelName).toBe('deepseek-chat');
      expect(info.baseUrl).toContain('deepseek.com');
    });

    it('환경변수 미설정 시 기본값(deepseek-chat)을 반환한다', () => {
      const configWithDefaults = {
        get: jest.fn((key: string, defaultValue?: string) => defaultValue),
      } as unknown as ConfigService;
      const adapterWithDefaults = new DeepSeekAdapter(
        promptBuilder,
        responseParser,
        configWithDefaults,
      );

      const info = adapterWithDefaults.getModelInfo();
      expect(info.modelName).toBe('deepseek-chat');
    });
  });

  // -----------------------------------------------------------------------
  // healthCheck()
  // -----------------------------------------------------------------------
  describe('healthCheck()', () => {
    it('/models 엔드포인트가 200이면 true를 반환한다', async () => {
      mockedAxios.get = jest.fn().mockResolvedValueOnce({ status: 200 });

      const result = await adapter.healthCheck();

      expect(result).toBe(true);
      expect(mockedAxios.get).toHaveBeenCalledWith(
        expect.stringContaining('/models'),
        expect.objectContaining({ timeout: 5000 }),
      );
    });

    it('API 연결 실패 시 false를 반환한다', async () => {
      mockedAxios.get = jest
        .fn()
        .mockRejectedValueOnce(new Error('ECONNREFUSED'));

      const result = await adapter.healthCheck();

      expect(result).toBe(false);
    });
  });

  // -----------------------------------------------------------------------
  // generateMove() - draw 응답 (deepseek-chat)
  // -----------------------------------------------------------------------
  describe('generateMove() - draw 응답', () => {
    it('DeepSeek이 draw JSON을 반환하면 action=draw 응답을 반환한다', async () => {
      const content = JSON.stringify({
        action: 'draw',
        reasoning: '초기 등록 30점 미달로 드로우합니다.',
      });
      mockedAxios.post = jest
        .fn()
        .mockResolvedValueOnce(makeDeepSeekResponse(content));

      const response = await adapter.generateMove(makeMoveRequest());

      expect(response.action).toBe('draw');
      expect(response.metadata.modelType).toBe('deepseek');
      expect(response.metadata.isFallbackDraw).toBe(false);
    });
  });

  // -----------------------------------------------------------------------
  // generateMove() - place 응답 (deepseek-chat)
  // -----------------------------------------------------------------------
  describe('generateMove() - place 응답', () => {
    it('place JSON 응답(OpenAI 호환 포맷)을 올바르게 파싱한다', async () => {
      const content = JSON.stringify({
        action: 'place',
        tableGroups: [{ tiles: ['K1a', 'K2a', 'K3a'] }],
        tilesFromRack: ['K1a', 'K2a', 'K3a'],
        reasoning: '검정 1-2-3 런',
      });
      mockedAxios.post = jest
        .fn()
        .mockResolvedValueOnce(makeDeepSeekResponse(content));

      const response = await adapter.generateMove(makeMoveRequest());

      expect(response.action).toBe('place');
      expect(response.tableGroups).toHaveLength(1);
      expect(response.tilesFromRack).toEqual(['K1a', 'K2a', 'K3a']);
    });
  });

  // -----------------------------------------------------------------------
  // generateMove() - API 호출 파라미터 (deepseek-chat)
  // -----------------------------------------------------------------------
  describe('generateMove() - API 호출 파라미터', () => {
    it('/chat/completions 엔드포인트로 POST 요청을 보낸다', async () => {
      mockedAxios.post = jest
        .fn()
        .mockResolvedValueOnce(
          makeDeepSeekResponse(JSON.stringify({ action: 'draw' })),
        );

      await adapter.generateMove(makeMoveRequest());

      const [url] = (mockedAxios.post as jest.Mock).mock.calls[0];
      expect(url).toContain('/chat/completions');
    });

    it('요청 바디에 response_format: json_object가 포함된다', async () => {
      mockedAxios.post = jest
        .fn()
        .mockResolvedValueOnce(
          makeDeepSeekResponse(JSON.stringify({ action: 'draw' })),
        );

      await adapter.generateMove(makeMoveRequest());

      const [, body] = (mockedAxios.post as jest.Mock).mock.calls[0];
      expect(body.response_format).toEqual({ type: 'json_object' });
    });

    it('요청 헤더에 Authorization: Bearer가 포함된다', async () => {
      mockedAxios.post = jest
        .fn()
        .mockResolvedValueOnce(
          makeDeepSeekResponse(JSON.stringify({ action: 'draw' })),
        );

      await adapter.generateMove(makeMoveRequest());

      const [, , config] = (mockedAxios.post as jest.Mock).mock.calls[0];
      expect(config.headers.Authorization).toContain('Bearer');
    });

    it('timeoutMs가 axios 타임아웃에 전달된다', async () => {
      mockedAxios.post = jest
        .fn()
        .mockResolvedValueOnce(
          makeDeepSeekResponse(JSON.stringify({ action: 'draw' })),
        );

      await adapter.generateMove(makeMoveRequest({ timeoutMs: 10000 }));

      const [, , config] = (mockedAxios.post as jest.Mock).mock.calls[0];
      expect(config.timeout).toBe(10000);
    });

    it('beginner 난이도는 요청 바디에 temperature=0.9를 포함한다', async () => {
      mockedAxios.post = jest
        .fn()
        .mockResolvedValueOnce(
          makeDeepSeekResponse(JSON.stringify({ action: 'draw' })),
        );

      await adapter.generateMove(makeMoveRequest({ difficulty: 'beginner' }));

      const [, body] = (mockedAxios.post as jest.Mock).mock.calls[0];
      expect(body.temperature).toBe(0.9);
    });

    it('intermediate 난이도는 요청 바디에 temperature=0.7을 포함한다', async () => {
      mockedAxios.post = jest
        .fn()
        .mockResolvedValueOnce(
          makeDeepSeekResponse(JSON.stringify({ action: 'draw' })),
        );

      await adapter.generateMove(
        makeMoveRequest({ difficulty: 'intermediate' }),
      );

      const [, body] = (mockedAxios.post as jest.Mock).mock.calls[0];
      expect(body.temperature).toBe(0.7);
    });

    it('expert 난이도는 요청 바디에 temperature=0.3을 포함한다', async () => {
      mockedAxios.post = jest
        .fn()
        .mockResolvedValueOnce(
          makeDeepSeekResponse(JSON.stringify({ action: 'draw' })),
        );

      await adapter.generateMove(makeMoveRequest({ difficulty: 'expert' }));

      const [, body] = (mockedAxios.post as jest.Mock).mock.calls[0];
      expect(body.temperature).toBe(0.3);
    });
  });

  // -----------------------------------------------------------------------
  // generateMove() - 토큰 메타데이터
  // -----------------------------------------------------------------------
  describe('generateMove() - 토큰 메타데이터', () => {
    it('prompt_tokens와 completion_tokens가 메타데이터에 반영된다', async () => {
      mockedAxios.post = jest
        .fn()
        .mockResolvedValueOnce(
          makeDeepSeekResponse(JSON.stringify({ action: 'draw' }), 150, 65),
        );

      const response = await adapter.generateMove(makeMoveRequest());

      expect(response.metadata.promptTokens).toBe(150);
      expect(response.metadata.completionTokens).toBe(65);
    });
  });

  // -----------------------------------------------------------------------
  // generateMove() - 파싱 실패 및 fallback
  // -----------------------------------------------------------------------
  describe('generateMove() - 파싱 실패', () => {
    it('모든 재시도 실패 시 isFallbackDraw=true를 반환한다', async () => {
      mockedAxios.post = jest
        .fn()
        .mockResolvedValue(makeDeepSeekResponse('JSON이 아닌 응답'));

      const response = await adapter.generateMove(
        makeMoveRequest({ maxRetries: 2 }),
      );

      expect(response.action).toBe('draw');
      expect(response.metadata.isFallbackDraw).toBe(true);
      expect(response.metadata.retryCount).toBe(2);
    });

    it('네트워크 에러 시 재시도 후 fallback draw를 반환한다', async () => {
      mockedAxios.post = jest
        .fn()
        .mockRejectedValue(new Error('Network Error'));

      const response = await adapter.generateMove(
        makeMoveRequest({ maxRetries: 2 }),
      );

      expect(response.action).toBe('draw');
      expect(response.metadata.isFallbackDraw).toBe(true);
    });
  });

  // -----------------------------------------------------------------------
  // Reasoner 모드: 전용 프롬프트 사용 확인
  // -----------------------------------------------------------------------
  describe('Reasoner 모드 - 전용 프롬프트', () => {
    let reasonerAdapter: DeepSeekAdapter;

    beforeEach(() => {
      reasonerAdapter = makeReasonerAdapter();
      jest.clearAllMocks();
      jest.spyOn(reasonerAdapter as any, 'backoff').mockResolvedValue(undefined);
    });

    it('reasoner 모드에서 요청 바디에 temperature가 포함되지 않는다', async () => {
      const content = JSON.stringify({ action: 'draw', reasoning: 'no combo' });
      mockedAxios.post = jest
        .fn()
        .mockResolvedValueOnce(makeReasonerResponse(content, 'thinking...'));

      await reasonerAdapter.generateMove(makeMoveRequest());

      const [, body] = (mockedAxios.post as jest.Mock).mock.calls[0];
      expect(body.temperature).toBeUndefined();
    });

    it('reasoner 모드에서 response_format이 포함되지 않는다', async () => {
      const content = JSON.stringify({ action: 'draw', reasoning: 'no combo' });
      mockedAxios.post = jest
        .fn()
        .mockResolvedValueOnce(makeReasonerResponse(content, 'thinking...'));

      await reasonerAdapter.generateMove(makeMoveRequest());

      const [, body] = (mockedAxios.post as jest.Mock).mock.calls[0];
      expect(body.response_format).toBeUndefined();
    });

    it('reasoner 모드에서 최소 타임아웃 500초가 적용된다', async () => {
      // 2026-04-10: AI_ADAPTER_TIMEOUT_SEC 240→500초 상향 (DeepSeek Reasoner 후반부 356s 관찰)
      // deepseek.adapter.ts:193 → Math.max(timeoutMs, 500_000)
      const content = JSON.stringify({ action: 'draw', reasoning: 'no combo' });
      mockedAxios.post = jest
        .fn()
        .mockResolvedValueOnce(makeReasonerResponse(content, ''));

      await reasonerAdapter.generateMove(makeMoveRequest({ timeoutMs: 10000 }));

      const [, , config] = (mockedAxios.post as jest.Mock).mock.calls[0];
      expect(config.timeout).toBe(500_000);
    });

    it('reasoner 모드에서 영어 기반 시스템 프롬프트를 사용한다', async () => {
      const content = JSON.stringify({ action: 'draw', reasoning: 'no combo' });
      mockedAxios.post = jest
        .fn()
        .mockResolvedValueOnce(makeReasonerResponse(content, ''));

      await reasonerAdapter.generateMove(makeMoveRequest());

      const [, body] = (mockedAxios.post as jest.Mock).mock.calls[0];
      const systemContent = body.messages[0].content;
      // Reasoner 전용 프롬프트는 영어 기반
      expect(systemContent).toContain('You are a Rummikub game AI');
      expect(systemContent).toContain('Step-by-Step Thinking Procedure');
    });

    it('reasoner 모드에서 유저 프롬프트가 영어 기반으로 생성된다', async () => {
      const content = JSON.stringify({ action: 'draw', reasoning: 'no combo' });
      mockedAxios.post = jest
        .fn()
        .mockResolvedValueOnce(makeReasonerResponse(content, ''));

      await reasonerAdapter.generateMove(makeMoveRequest());

      const [, body] = (mockedAxios.post as jest.Mock).mock.calls[0];
      const userContent = body.messages[1].content;
      expect(userContent).toContain('# Current Table');
      expect(userContent).toContain('# My Rack Tiles');
      expect(userContent).toContain('# Game Status');
    });

    it('reasoner 모드에서 draw 응답을 정상 파싱한다', async () => {
      const content = JSON.stringify({
        action: 'draw',
        reasoning: 'no valid combination for initial meld',
      });
      mockedAxios.post = jest
        .fn()
        .mockResolvedValueOnce(
          makeReasonerResponse(content, 'I analyzed all tiles...'),
        );

      const response = await reasonerAdapter.generateMove(makeMoveRequest());

      expect(response.action).toBe('draw');
      expect(response.metadata.modelType).toBe('deepseek');
      expect(response.metadata.modelName).toBe('deepseek-reasoner');
    });

    it('reasoner 모드에서 place 응답을 정상 파싱한다', async () => {
      const content = JSON.stringify({
        action: 'place',
        tableGroups: [{ tiles: ['K1a', 'K2a', 'K3a'] }],
        tilesFromRack: ['K1a', 'K2a', 'K3a'],
        reasoning: 'K run 1-2-3 for 6 points, need 30 but trying',
      });
      mockedAxios.post = jest
        .fn()
        .mockResolvedValueOnce(makeReasonerResponse(content, 'Let me find...'));

      const response = await reasonerAdapter.generateMove(makeMoveRequest());

      expect(response.action).toBe('place');
      expect(response.tableGroups).toHaveLength(1);
      expect(response.tilesFromRack).toEqual(['K1a', 'K2a', 'K3a']);
    });

    it('reasoner 모드에서 initialMeldDone=true 시 기존 테이블 정보를 포함한다', async () => {
      const content = JSON.stringify({
        action: 'place',
        tableGroups: [{ tiles: ['R3a', 'R4a', 'R5a', 'R6a'] }],
        tilesFromRack: ['R6a'],
        reasoning: 'extend existing run',
      });
      mockedAxios.post = jest
        .fn()
        .mockResolvedValueOnce(makeReasonerResponse(content, 'thinking...'));

      const response = await reasonerAdapter.generateMove(
        makeMoveRequest({ gameState: makeGameStateWithTable() }),
      );

      expect(response.action).toBe('place');
      expect(response.tilesFromRack).toEqual(['R6a']);
    });
  });

  // -----------------------------------------------------------------------
  // Reasoner 모드: JSON 추출 로직
  // -----------------------------------------------------------------------
  describe('Reasoner 모드 - JSON 추출 (extractBestJson)', () => {
    let reasonerAdapter: DeepSeekAdapter;

    beforeEach(() => {
      reasonerAdapter = makeReasonerAdapter();
      jest.clearAllMocks();
      jest.spyOn(reasonerAdapter as any, 'backoff').mockResolvedValue(undefined);
    });

    it('content가 순수 JSON이면 그대로 사용한다', () => {
      const json = '{"action":"draw","reasoning":"no combo"}';
      const result = reasonerAdapter.extractBestJson(json, '');
      expect(JSON.parse(result)).toEqual({
        action: 'draw',
        reasoning: 'no combo',
      });
    });

    it('content가 마크다운 코드블록에 감싸져 있어도 JSON을 추출한다', () => {
      const wrapped = '```json\n{"action":"draw","reasoning":"no combo"}\n```';
      const result = reasonerAdapter.extractBestJson(wrapped, '');
      expect(JSON.parse(result)).toEqual({
        action: 'draw',
        reasoning: 'no combo',
      });
    });

    it('content 앞뒤에 설명 텍스트가 있어도 JSON을 추출한다', () => {
      const messy =
        'Here is my response:\n{"action":"draw","reasoning":"test"}\nThat was my answer.';
      const result = reasonerAdapter.extractBestJson(messy, '');
      expect(JSON.parse(result).action).toBe('draw');
    });

    it('content에 trailing comma가 있어도 복구하여 파싱한다', () => {
      const withTrailing = '{"action":"draw","reasoning":"test",}';
      const result = reasonerAdapter.extractBestJson(withTrailing, '');
      expect(JSON.parse(result).action).toBe('draw');
    });

    it('content가 비어있고 reasoning_content에 JSON이 있으면 추출한다', () => {
      const reasoning =
        'Let me think about this... I should draw.\n{"action":"draw","reasoning":"no valid combination"}';
      const result = reasonerAdapter.extractBestJson('', reasoning);
      expect(JSON.parse(result).action).toBe('draw');
    });

    it('reasoning_content에 여러 JSON이 있으면 마지막(최종 답변)을 추출한다', () => {
      const reasoning =
        'First attempt: {"action":"place","tableGroups":[]}\n' +
        'Wait, that is wrong. Let me reconsider.\n' +
        '{"action":"draw","reasoning":"no valid combination after reconsideration"}';
      const result = reasonerAdapter.extractBestJson('', reasoning);
      const parsed = JSON.parse(result);
      expect(parsed.action).toBe('draw');
      expect(parsed.reasoning).toContain('reconsideration');
    });

    it('content가 잘못된 JSON이고 reasoning_content에 유효한 JSON이 있으면 reasoning에서 추출한다', () => {
      const badContent = 'I think the answer is draw';
      const reasoning =
        'After analysis: {"action":"draw","reasoning":"K tiles sum to 6, need 30 for initial meld"}';
      const result = reasonerAdapter.extractBestJson(badContent, reasoning);
      expect(JSON.parse(result).action).toBe('draw');
    });

    it('content와 reasoning 모두 JSON이 없으면 원본 content를 반환한다', () => {
      const result = reasonerAdapter.extractBestJson(
        'no json here',
        'no json here either',
      );
      expect(result).toBe('no json here');
    });

    it('place 응답에서 배열 trailing comma를 복구한다', () => {
      const json =
        '{"action":"place","tableGroups":[{"tiles":["R7a","B7a","K7a",]},],"tilesFromRack":["R7a","B7a",],"reasoning":"group"}';
      const result = reasonerAdapter.extractBestJson(json, '');
      const parsed = JSON.parse(result);
      expect(parsed.action).toBe('place');
      expect(parsed.tableGroups[0].tiles).toEqual(['R7a', 'B7a', 'K7a']);
    });

    it('reasoner API 호출 시 content가 비어있으면 reasoning_content에서 JSON을 추출한다', async () => {
      const reasoning =
        'I need to analyze my tiles K1a, K2a, K3a, Y7b...\n' +
        'K1+K2+K3 = 6 points, not enough for initial meld (need 30).\n' +
        'I should draw.\n' +
        '{"action":"draw","reasoning":"K run sum is only 6, need 30 for initial meld"}';

      mockedAxios.post = jest
        .fn()
        .mockResolvedValueOnce(makeReasonerResponse('', reasoning));

      const response = await reasonerAdapter.generateMove(makeMoveRequest());

      expect(response.action).toBe('draw');
      expect(response.metadata.isFallbackDraw).toBe(false);
    });

    it('reasoner API 호출 시 content에 코드블록 래핑된 JSON도 파싱한다', async () => {
      const content =
        '```json\n{"action":"place","tableGroups":[{"tiles":["K1a","K2a","K3a"]}],"tilesFromRack":["K1a","K2a","K3a"],"reasoning":"K run"}\n```';

      mockedAxios.post = jest
        .fn()
        .mockResolvedValueOnce(makeReasonerResponse(content, 'thinking...'));

      const response = await reasonerAdapter.generateMove(makeMoveRequest());

      expect(response.action).toBe('place');
      expect(response.tableGroups).toHaveLength(1);
    });
  });

  // -----------------------------------------------------------------------
  // Reasoner 모드: 재시도 및 fallback
  // -----------------------------------------------------------------------
  describe('Reasoner 모드 - 재시도 및 fallback', () => {
    let reasonerAdapter: DeepSeekAdapter;

    beforeEach(() => {
      reasonerAdapter = makeReasonerAdapter();
      jest.clearAllMocks();
      jest.spyOn(reasonerAdapter as any, 'backoff').mockResolvedValue(undefined);
    });

    it('reasoner 모드에서 모든 재시도 실패 시 fallback draw를 반환한다', async () => {
      mockedAxios.post = jest
        .fn()
        .mockResolvedValue(
          makeReasonerResponse('invalid response', 'random thoughts'),
        );

      const response = await reasonerAdapter.generateMove(
        makeMoveRequest({ maxRetries: 2 }),
      );

      expect(response.action).toBe('draw');
      expect(response.metadata.isFallbackDraw).toBe(true);
      expect(response.metadata.retryCount).toBe(2);
    });

    it('reasoner 모드에서 첫 시도 실패 후 두 번째 시도 성공 시 정상 응답한다', async () => {
      const failResponse = makeReasonerResponse('not json', 'thinking...');
      const successResponse = makeReasonerResponse(
        JSON.stringify({ action: 'draw', reasoning: 'retry success' }),
        'reconsidered...',
      );

      mockedAxios.post = jest
        .fn()
        .mockResolvedValueOnce(failResponse)
        .mockResolvedValueOnce(successResponse);

      const response = await reasonerAdapter.generateMove(
        makeMoveRequest({ maxRetries: 3 }),
      );

      expect(response.action).toBe('draw');
      expect(response.metadata.isFallbackDraw).toBe(false);
      expect(response.metadata.retryCount).toBe(1); // 두 번째 시도(index 1)
    });

    it('reasoner 모드에서 네트워크 에러 시 재시도 후 fallback 반환한다', async () => {
      mockedAxios.post = jest.fn().mockRejectedValue(new Error('timeout'));

      const response = await reasonerAdapter.generateMove(
        makeMoveRequest({ maxRetries: 2 }),
      );

      expect(response.action).toBe('draw');
      expect(response.metadata.isFallbackDraw).toBe(true);
    });
  });

  // -----------------------------------------------------------------------
  // DeepSeek 프롬프트 최적화 검증 (Round 3 -> Round 4)
  //
  // 목적:
  //   - few-shot 예시가 시스템 프롬프트에 포함되는지 확인
  //   - 타일 인코딩 테이블이 포함되는지 확인
  //   - 자기 검증 체크리스트가 포함되는지 확인
  //   - 유저 프롬프트에 검증 힌트가 포함되는지 확인
  //   - 재시도 프롬프트에 공통 실수 목록이 포함되는지 확인
  // -----------------------------------------------------------------------
  describe('DeepSeek 프롬프트 최적화 (무효율 55%→30% 목표)', () => {
    let reasonerAdapter: DeepSeekAdapter;

    beforeEach(() => {
      reasonerAdapter = makeReasonerAdapter();
      jest.clearAllMocks();
      jest.spyOn(reasonerAdapter as any, 'backoff').mockResolvedValue(undefined);
    });

    describe('시스템 프롬프트 - few-shot 예시', () => {
      it('시스템 프롬프트에 5개 이상의 few-shot 예시가 포함된다', async () => {
        const content = JSON.stringify({ action: 'draw', reasoning: 'test' });
        mockedAxios.post = jest
          .fn()
          .mockResolvedValueOnce(makeReasonerResponse(content, ''));

        await reasonerAdapter.generateMove(makeMoveRequest());

        const [, body] = (mockedAxios.post as jest.Mock).mock.calls[0];
        const systemContent: string = body.messages[0].content;

        // few-shot 예시 섹션 존재
        expect(systemContent).toContain('Few-Shot Examples');

        // draw 예시
        expect(systemContent).toContain('Example 1: Draw');

        // place 예시 (single run)
        expect(systemContent).toContain('Example 2: Place single run');

        // place 예시 (group)
        expect(systemContent).toContain('Example 3: Place group');

        // extend 예시
        expect(systemContent).toContain('Example 4: Extend existing');

        // multiple sets 예시
        expect(systemContent).toContain('Example 5: Multiple sets');
      });

      it('few-shot 예시에 유효한 RUN 예시가 포함된다', async () => {
        const content = JSON.stringify({ action: 'draw', reasoning: 'test' });
        mockedAxios.post = jest
          .fn()
          .mockResolvedValueOnce(makeReasonerResponse(content, ''));

        await reasonerAdapter.generateMove(makeMoveRequest());

        const [, body] = (mockedAxios.post as jest.Mock).mock.calls[0];
        const systemContent: string = body.messages[0].content;

        // R10a, R11a, R12a 런 예시
        expect(systemContent).toContain('R10a');
        expect(systemContent).toContain('R11a');
        expect(systemContent).toContain('R12a');
      });

      it('few-shot 예시에 유효한 GROUP 예시가 포함된다', async () => {
        const content = JSON.stringify({ action: 'draw', reasoning: 'test' });
        mockedAxios.post = jest
          .fn()
          .mockResolvedValueOnce(makeReasonerResponse(content, ''));

        await reasonerAdapter.generateMove(makeMoveRequest());

        const [, body] = (mockedAxios.post as jest.Mock).mock.calls[0];
        const systemContent: string = body.messages[0].content;

        // Group 예시 (같은 숫자, 다른 색)
        expect(systemContent).toContain('R7a, B7a, K7a');
      });

      it('few-shot 예시에 INVALID 케이스와 그 이유가 포함된다', async () => {
        const content = JSON.stringify({ action: 'draw', reasoning: 'test' });
        mockedAxios.post = jest
          .fn()
          .mockResolvedValueOnce(makeReasonerResponse(content, ''));

        await reasonerAdapter.generateMove(makeMoveRequest());

        const [, body] = (mockedAxios.post as jest.Mock).mock.calls[0];
        const systemContent: string = body.messages[0].content;

        // INVALID 예시와 에러 코드
        expect(systemContent).toContain('ERR_GROUP_COLOR_DUP');
        expect(systemContent).toContain('ERR_GROUP_NUMBER');
        expect(systemContent).toContain('ERR_SET_SIZE');
      });
    });

    describe('시스템 프롬프트 - 타일 인코딩 강화', () => {
      it('타일 인코딩이 테이블 형태로 제시된다', async () => {
        const content = JSON.stringify({ action: 'draw', reasoning: 'test' });
        mockedAxios.post = jest
          .fn()
          .mockResolvedValueOnce(makeReasonerResponse(content, ''));

        await reasonerAdapter.generateMove(makeMoveRequest());

        const [, body] = (mockedAxios.post as jest.Mock).mock.calls[0];
        const systemContent: string = body.messages[0].content;

        // 테이블 형태의 인코딩 설명
        expect(systemContent).toContain('Component');
        expect(systemContent).toContain('Color');
        expect(systemContent).toContain('R, B, Y, K');
        expect(systemContent).toContain('Number');
        expect(systemContent).toContain('1, 2, 3');
        expect(systemContent).toContain('Set');
        expect(systemContent).toContain('a, b');
      });

      it('106장 전체 타일 수가 명시된다', async () => {
        const content = JSON.stringify({ action: 'draw', reasoning: 'test' });
        mockedAxios.post = jest
          .fn()
          .mockResolvedValueOnce(makeReasonerResponse(content, ''));

        await reasonerAdapter.generateMove(makeMoveRequest());

        const [, body] = (mockedAxios.post as jest.Mock).mock.calls[0];
        const systemContent: string = body.messages[0].content;

        expect(systemContent).toContain('106 tiles');
      });
    });

    describe('시스템 프롬프트 - 자기 검증 체크리스트', () => {
      it('Pre-Submission Validation Checklist가 포함된다', async () => {
        const content = JSON.stringify({ action: 'draw', reasoning: 'test' });
        mockedAxios.post = jest
          .fn()
          .mockResolvedValueOnce(makeReasonerResponse(content, ''));

        await reasonerAdapter.generateMove(makeMoveRequest());

        const [, body] = (mockedAxios.post as jest.Mock).mock.calls[0];
        const systemContent: string = body.messages[0].content;

        expect(systemContent).toContain('Pre-Submission Validation Checklist');
        expect(systemContent).toContain('>= 3 tiles');
        expect(systemContent).toContain('SAME color');
        expect(systemContent).toContain('CONSECUTIVE numbers');
        expect(systemContent).toContain('DIFFERENT colors');
      });
    });

    describe('유저 프롬프트 - 검증 힌트', () => {
      it('유저 프롬프트에 Validation Reminders 섹션이 포함된다', async () => {
        const content = JSON.stringify({ action: 'draw', reasoning: 'test' });
        mockedAxios.post = jest
          .fn()
          .mockResolvedValueOnce(makeReasonerResponse(content, ''));

        await reasonerAdapter.generateMove(makeMoveRequest());

        const [, body] = (mockedAxios.post as jest.Mock).mock.calls[0];
        const userContent: string = body.messages[1].content;

        expect(userContent).toContain('Validation Reminders');
        expect(userContent).toContain('verify each set has 3+ tiles');
        expect(userContent).toContain('runs are consecutive same-color');
        expect(userContent).toContain('groups are same-number different-colors');
      });

      it('유저 프롬프트에 duplicate color 경고가 포함된다', async () => {
        const content = JSON.stringify({ action: 'draw', reasoning: 'test' });
        mockedAxios.post = jest
          .fn()
          .mockResolvedValueOnce(makeReasonerResponse(content, ''));

        await reasonerAdapter.generateMove(makeMoveRequest());

        const [, body] = (mockedAxios.post as jest.Mock).mock.calls[0];
        const userContent: string = body.messages[1].content;

        expect(userContent).toContain('no duplicate colors in groups');
      });
    });

    describe('재시도 프롬프트 - 공통 실수 목록', () => {
      it('재시도 프롬프트에 공통 실수 방지 가이드가 포함된다', async () => {
        // 첫 시도 실패 -> 두 번째 시도
        const failResponse = makeReasonerResponse('invalid', 'bad');
        const successResponse = makeReasonerResponse(
          JSON.stringify({ action: 'draw', reasoning: 'retry' }),
          'ok',
        );

        mockedAxios.post = jest
          .fn()
          .mockResolvedValueOnce(failResponse)
          .mockResolvedValueOnce(successResponse);

        await reasonerAdapter.generateMove(makeMoveRequest({ maxRetries: 3 }));

        // 두 번째 호출의 유저 프롬프트에 공통 실수 목록이 있는지 확인
        const [, retryBody] = (mockedAxios.post as jest.Mock).mock.calls[1];
        const retryUserContent: string = retryBody.messages[1].content;

        expect(retryUserContent).toContain('Common mistakes to avoid');
        expect(retryUserContent).toContain('ALL DIFFERENT colors');
        expect(retryUserContent).toContain('SAME color');
        expect(retryUserContent).toContain('CONSECUTIVE numbers');
        expect(retryUserContent).toContain('>= 3 tiles');
      });
    });

    describe('시스템 프롬프트 - 그룹/런 규칙 명확화', () => {
      it('그룹 규칙에 "no color can appear twice" 명시가 포함된다', async () => {
        const content = JSON.stringify({ action: 'draw', reasoning: 'test' });
        mockedAxios.post = jest
          .fn()
          .mockResolvedValueOnce(makeReasonerResponse(content, ''));

        await reasonerAdapter.generateMove(makeMoveRequest());

        const [, body] = (mockedAxios.post as jest.Mock).mock.calls[0];
        const systemContent: string = body.messages[0].content;

        expect(systemContent).toContain(
          'No color can appear twice in a group',
        );
      });

      it('런 규칙에 "no wraparound" 명시가 포함된다', async () => {
        const content = JSON.stringify({ action: 'draw', reasoning: 'test' });
        mockedAxios.post = jest
          .fn()
          .mockResolvedValueOnce(makeReasonerResponse(content, ''));

        await reasonerAdapter.generateMove(makeMoveRequest());

        const [, body] = (mockedAxios.post as jest.Mock).mock.calls[0];
        const systemContent: string = body.messages[0].content;

        expect(systemContent).toContain('No wraparound');
        expect(systemContent).toContain('13-1 is NOT allowed');
      });

      it('Initial Meld 규칙에 점수 계산 예시가 포함된다', async () => {
        const content = JSON.stringify({ action: 'draw', reasoning: 'test' });
        mockedAxios.post = jest
          .fn()
          .mockResolvedValueOnce(makeReasonerResponse(content, ''));

        await reasonerAdapter.generateMove(makeMoveRequest());

        const [, body] = (mockedAxios.post as jest.Mock).mock.calls[0];
        const systemContent: string = body.messages[0].content;

        // 30점 이상 예시
        expect(systemContent).toContain('10+11+12 = 33');
        // 30점 미만 예시
        expect(systemContent).toContain('1+2+3 = 6');
      });
    });
  });
});
