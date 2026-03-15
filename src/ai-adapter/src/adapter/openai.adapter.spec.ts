import { OpenAiAdapter } from './openai.adapter';
import { PromptBuilderService } from '../prompt/prompt-builder.service';
import { ResponseParserService } from '../common/parser/response-parser.service';
import { ConfigService } from '@nestjs/config';
import axios from 'axios';
import { MoveRequestDto, GameStateDto } from '../common/dto/move-request.dto';

// axios 전체를 mock
jest.mock('axios');
const mockedAxios = axios as jest.Mocked<typeof axios>;

// -----------------------------------------------------------------------
// OpenAiAdapter 단위 테스트
//
// 목적:
//   - OpenAI API 응답을 mock하여 MoveResponseDto 파싱 정상 동작 확인
//   - healthCheck() 동작 확인
//   - getModelInfo() 설정값 반영 확인
// -----------------------------------------------------------------------

const makeGameState = (): GameStateDto => ({
  tableGroups: [],
  myTiles: ['R7a', 'R8a', 'R9a', 'B3b'],
  opponents: [{ playerId: 'player-human', remainingTiles: 9 }],
  drawPileCount: 70,
  turnNumber: 2,
  initialMeldDone: false,
});

const makeMoveRequest = (overrides: Partial<MoveRequestDto> = {}): MoveRequestDto => ({
  gameId: 'openai-test-001',
  playerId: 'ai-openai',
  gameState: makeGameState(),
  persona: 'calculator',
  difficulty: 'expert',
  psychologyLevel: 0,
  maxRetries: 3,
  timeoutMs: 30000,
  ...overrides,
});

/** OpenAI /chat/completions 응답 형식 */
const makeOpenAiResponse = (content: string, promptTokens = 100, completionTokens = 50) => ({
  data: {
    choices: [
      {
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
    model: 'gpt-4o',
  },
  status: 200,
});

describe('OpenAiAdapter', () => {
  let adapter: OpenAiAdapter;
  let promptBuilder: PromptBuilderService;
  let responseParser: ResponseParserService;
  let configService: ConfigService;

  beforeEach(() => {
    promptBuilder = new PromptBuilderService();
    responseParser = new ResponseParserService();

    configService = {
      get: jest.fn((key: string, defaultValue?: string) => {
        const config: Record<string, string> = {
          OPENAI_API_KEY: 'test-api-key',
          OPENAI_DEFAULT_MODEL: 'gpt-4o',
        };
        return config[key] ?? defaultValue;
      }),
    } as unknown as ConfigService;

    adapter = new OpenAiAdapter(promptBuilder, responseParser, configService);
    jest.clearAllMocks();
  });

  // -----------------------------------------------------------------------
  // getModelInfo()
  // -----------------------------------------------------------------------
  describe('getModelInfo()', () => {
    it('modelType=openai, modelName=gpt-4o를 반환한다', () => {
      const info = adapter.getModelInfo();

      expect(info.modelType).toBe('openai');
      expect(info.modelName).toBe('gpt-4o');
      expect(info.baseUrl).toContain('openai.com');
    });

    it('환경변수 미설정 시 기본값(gpt-4o)을 반환한다', () => {
      const configWithDefaults = {
        get: jest.fn((key: string, defaultValue?: string) => defaultValue),
      } as unknown as ConfigService;
      const adapterWithDefaults = new OpenAiAdapter(promptBuilder, responseParser, configWithDefaults);

      const info = adapterWithDefaults.getModelInfo();
      expect(info.modelName).toBe('gpt-4o');
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
      mockedAxios.get = jest.fn().mockRejectedValueOnce(new Error('ECONNREFUSED'));

      const result = await adapter.healthCheck();

      expect(result).toBe(false);
    });
  });

  // -----------------------------------------------------------------------
  // generateMove() - draw 응답
  // -----------------------------------------------------------------------
  describe('generateMove() - draw 응답', () => {
    it('OpenAI가 draw JSON을 반환하면 action=draw 응답을 반환한다', async () => {
      const content = JSON.stringify({
        action: 'draw',
        reasoning: '유효한 조합이 없어 드로우합니다.',
      });
      mockedAxios.post = jest.fn().mockResolvedValueOnce(makeOpenAiResponse(content));

      const response = await adapter.generateMove(makeMoveRequest());

      expect(response.action).toBe('draw');
      expect(response.metadata.modelType).toBe('openai');
      expect(response.metadata.isFallbackDraw).toBe(false);
    });
  });

  // -----------------------------------------------------------------------
  // generateMove() - place 응답
  // -----------------------------------------------------------------------
  describe('generateMove() - place 응답', () => {
    it('place JSON 응답을 올바르게 파싱한다', async () => {
      const content = JSON.stringify({
        action: 'place',
        tableGroups: [{ tiles: ['R7a', 'R8a', 'R9a'] }],
        tilesFromRack: ['R7a', 'R8a', 'R9a'],
        reasoning: '런 배치',
      });
      mockedAxios.post = jest.fn().mockResolvedValueOnce(makeOpenAiResponse(content));

      const response = await adapter.generateMove(makeMoveRequest());

      expect(response.action).toBe('place');
      expect(response.tableGroups).toHaveLength(1);
      expect(response.tilesFromRack).toEqual(['R7a', 'R8a', 'R9a']);
    });
  });

  // -----------------------------------------------------------------------
  // generateMove() - API 호출 파라미터
  // -----------------------------------------------------------------------
  describe('generateMove() - API 호출 파라미터', () => {
    it('/chat/completions 엔드포인트로 POST 요청을 보낸다', async () => {
      mockedAxios.post = jest.fn().mockResolvedValueOnce(
        makeOpenAiResponse(JSON.stringify({ action: 'draw' })),
      );

      await adapter.generateMove(makeMoveRequest());

      const [url] = (mockedAxios.post as jest.Mock).mock.calls[0];
      expect(url).toContain('/chat/completions');
    });

    it('요청 바디에 response_format: json_object가 포함된다', async () => {
      mockedAxios.post = jest.fn().mockResolvedValueOnce(
        makeOpenAiResponse(JSON.stringify({ action: 'draw' })),
      );

      await adapter.generateMove(makeMoveRequest());

      const [, body] = (mockedAxios.post as jest.Mock).mock.calls[0];
      expect(body.response_format).toEqual({ type: 'json_object' });
    });

    it('요청 헤더에 Authorization: Bearer 토큰이 포함된다', async () => {
      mockedAxios.post = jest.fn().mockResolvedValueOnce(
        makeOpenAiResponse(JSON.stringify({ action: 'draw' })),
      );

      await adapter.generateMove(makeMoveRequest());

      const [, , config] = (mockedAxios.post as jest.Mock).mock.calls[0];
      expect(config.headers.Authorization).toContain('Bearer');
    });

    it('timeoutMs가 axios 타임아웃에 전달된다', async () => {
      mockedAxios.post = jest.fn().mockResolvedValueOnce(
        makeOpenAiResponse(JSON.stringify({ action: 'draw' })),
      );

      await adapter.generateMove(makeMoveRequest({ timeoutMs: 20000 }));

      const [, , config] = (mockedAxios.post as jest.Mock).mock.calls[0];
      expect(config.timeout).toBe(20000);
    });
  });

  // -----------------------------------------------------------------------
  // generateMove() - 토큰 메타데이터
  // -----------------------------------------------------------------------
  describe('generateMove() - 토큰 메타데이터', () => {
    it('usage.prompt_tokens와 completion_tokens가 메타데이터에 반영된다', async () => {
      mockedAxios.post = jest.fn().mockResolvedValueOnce(
        makeOpenAiResponse(JSON.stringify({ action: 'draw' }), 180, 75),
      );

      const response = await adapter.generateMove(makeMoveRequest());

      expect(response.metadata.promptTokens).toBe(180);
      expect(response.metadata.completionTokens).toBe(75);
    });

    it('usage 없을 때 promptTokens=0, completionTokens=0을 반환한다', async () => {
      mockedAxios.post = jest.fn().mockResolvedValueOnce({
        data: {
          choices: [{ message: { content: JSON.stringify({ action: 'draw' }) } }],
          // usage 필드 없음
        },
        status: 200,
      });

      const response = await adapter.generateMove(makeMoveRequest());

      expect(response.metadata.promptTokens).toBe(0);
      expect(response.metadata.completionTokens).toBe(0);
    });
  });

  // -----------------------------------------------------------------------
  // generateMove() - 파싱 실패 및 fallback
  // -----------------------------------------------------------------------
  describe('generateMove() - 파싱 실패', () => {
    it('maxRetries 모두 실패하면 isFallbackDraw=true를 반환한다', async () => {
      mockedAxios.post = jest.fn().mockResolvedValue(
        makeOpenAiResponse('파싱 불가 텍스트'),
      );

      const response = await adapter.generateMove(makeMoveRequest({ maxRetries: 2 }));

      expect(response.action).toBe('draw');
      expect(response.metadata.isFallbackDraw).toBe(true);
      expect(response.metadata.retryCount).toBe(2);
    });

    it('axios 에러 시 재시도 후 fallback draw를 반환한다', async () => {
      mockedAxios.post = jest.fn().mockRejectedValue(new Error('timeout'));

      const response = await adapter.generateMove(makeMoveRequest({ maxRetries: 2 }));

      expect(response.action).toBe('draw');
      expect(response.metadata.isFallbackDraw).toBe(true);
    });
  });
});
