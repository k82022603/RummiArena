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
  // generateMove() - draw 응답
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
  // generateMove() - place 응답
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
  // generateMove() - API 호출 파라미터
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
});
