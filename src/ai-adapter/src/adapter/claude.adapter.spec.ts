import { ClaudeAdapter } from './claude.adapter';
import { PromptBuilderService } from '../prompt/prompt-builder.service';
import { ResponseParserService } from '../common/parser/response-parser.service';
import { ConfigService } from '@nestjs/config';
import axios from 'axios';
import { MoveRequestDto, GameStateDto } from '../common/dto/move-request.dto';

// axios 전체를 mock
jest.mock('axios');
const mockedAxios = axios as jest.Mocked<typeof axios>;

// -----------------------------------------------------------------------
// ClaudeAdapter 단위 테스트
//
// 목적:
//   - Claude Messages API 응답을 mock하여 MoveResponseDto 파싱 확인
//   - healthCheck() 동작 확인
//   - getModelInfo() 설정값 반영 확인
//   - 요청 헤더(x-api-key, anthropic-version) 검증
// -----------------------------------------------------------------------

const makeGameState = (): GameStateDto => ({
  tableGroups: [{ tiles: ['B3a', 'B4a', 'B5a'] }],
  myTiles: ['R11a', 'B11a', 'K11b', 'Y6a'],
  opponents: [{ playerId: 'human-01', remainingTiles: 6 }],
  drawPileCount: 40,
  turnNumber: 7,
  initialMeldDone: true,
});

const makeMoveRequest = (
  overrides: Partial<MoveRequestDto> = {},
): MoveRequestDto => ({
  gameId: 'claude-test-001',
  playerId: 'ai-claude',
  gameState: makeGameState(),
  persona: 'fox',
  difficulty: 'expert',
  psychologyLevel: 2,
  maxRetries: 3,
  timeoutMs: 30000,
  ...overrides,
});

/** Claude /v1/messages 응답 형식 */
const makeClaudeResponse = (
  text: string,
  inputTokens = 120,
  outputTokens = 60,
) => ({
  data: {
    id: 'msg_test',
    type: 'message',
    role: 'assistant',
    content: [
      {
        type: 'text',
        text,
      },
    ],
    model: 'claude-sonnet-4-20250514',
    usage: {
      input_tokens: inputTokens,
      output_tokens: outputTokens,
    },
    stop_reason: 'end_turn',
  },
  status: 200,
});

describe('ClaudeAdapter', () => {
  let adapter: ClaudeAdapter;
  let promptBuilder: PromptBuilderService;
  let responseParser: ResponseParserService;
  let configService: ConfigService;

  beforeEach(() => {
    promptBuilder = new PromptBuilderService();
    responseParser = new ResponseParserService();

    configService = {
      get: jest.fn((key: string, defaultValue?: string) => {
        const config: Record<string, string> = {
          CLAUDE_API_KEY: 'test-claude-key',
          CLAUDE_DEFAULT_MODEL: 'claude-sonnet-4-20250514',
        };
        return config[key] ?? defaultValue;
      }),
    } as unknown as ConfigService;

    adapter = new ClaudeAdapter(promptBuilder, responseParser, configService);
    jest.clearAllMocks();
  });

  // -----------------------------------------------------------------------
  // getModelInfo()
  // -----------------------------------------------------------------------
  describe('getModelInfo()', () => {
    it('modelType=claude, modelName=claude-sonnet-4-20250514을 반환한다', () => {
      const info = adapter.getModelInfo();

      expect(info.modelType).toBe('claude');
      expect(info.modelName).toBe('claude-sonnet-4-20250514');
      expect(info.baseUrl).toContain('anthropic.com');
    });

    it('환경변수 미설정 시 기본 모델명을 반환한다', () => {
      const configWithDefaults = {
        get: jest.fn((key: string, defaultValue?: string) => defaultValue),
      } as unknown as ConfigService;
      const adapterWithDefaults = new ClaudeAdapter(
        promptBuilder,
        responseParser,
        configWithDefaults,
      );

      const info = adapterWithDefaults.getModelInfo();
      expect(info.modelName).toBeDefined();
      expect(info.modelName.length).toBeGreaterThan(0);
    });
  });

  // -----------------------------------------------------------------------
  // healthCheck()
  // -----------------------------------------------------------------------
  describe('healthCheck()', () => {
    it('/messages 엔드포인트가 200이면 true를 반환한다', async () => {
      mockedAxios.post = jest.fn().mockResolvedValueOnce({ status: 200 });

      const result = await adapter.healthCheck();

      expect(result).toBe(true);
    });

    it('API 연결 실패 시 false를 반환한다', async () => {
      mockedAxios.post = jest
        .fn()
        .mockRejectedValueOnce(new Error('Unauthorized'));

      const result = await adapter.healthCheck();

      expect(result).toBe(false);
    });
  });

  // -----------------------------------------------------------------------
  // generateMove() - draw 응답
  // -----------------------------------------------------------------------
  describe('generateMove() - draw 응답', () => {
    it('Claude가 draw JSON을 반환하면 action=draw 응답을 반환한다', async () => {
      const text = JSON.stringify({
        action: 'draw',
        reasoning: '상대방 패를 분석하여 드로우가 유리합니다.',
      });
      mockedAxios.post = jest
        .fn()
        .mockResolvedValueOnce(makeClaudeResponse(text));

      const response = await adapter.generateMove(makeMoveRequest());

      expect(response.action).toBe('draw');
      expect(response.metadata.modelType).toBe('claude');
      expect(response.metadata.isFallbackDraw).toBe(false);
    });
  });

  // -----------------------------------------------------------------------
  // generateMove() - place 응답
  // -----------------------------------------------------------------------
  describe('generateMove() - place 응답', () => {
    it('place JSON 응답을 올바르게 파싱한다', async () => {
      const text = JSON.stringify({
        action: 'place',
        tableGroups: [{ tiles: ['R11a', 'B11a', 'K11b'] }],
        tilesFromRack: ['R11a', 'B11a', 'K11b'],
        reasoning: '11 그룹 완성',
      });
      mockedAxios.post = jest
        .fn()
        .mockResolvedValueOnce(makeClaudeResponse(text));

      const response = await adapter.generateMove(makeMoveRequest());

      expect(response.action).toBe('place');
      expect(response.tableGroups).toHaveLength(1);
      expect(response.tableGroups![0].tiles).toContain('R11a');
    });
  });

  // -----------------------------------------------------------------------
  // generateMove() - API 호출 파라미터
  // -----------------------------------------------------------------------
  describe('generateMove() - API 호출 파라미터', () => {
    it('/messages 엔드포인트로 POST 요청을 보낸다', async () => {
      mockedAxios.post = jest
        .fn()
        .mockResolvedValueOnce(
          makeClaudeResponse(JSON.stringify({ action: 'draw' })),
        );

      await adapter.generateMove(makeMoveRequest());

      const [url] = (mockedAxios.post as jest.Mock).mock.calls[0];
      expect(url).toContain('/messages');
    });

    it('요청 헤더에 x-api-key가 포함된다', async () => {
      mockedAxios.post = jest
        .fn()
        .mockResolvedValueOnce(
          makeClaudeResponse(JSON.stringify({ action: 'draw' })),
        );

      await adapter.generateMove(makeMoveRequest());

      const [, , config] = (mockedAxios.post as jest.Mock).mock.calls[0];
      expect(config.headers['x-api-key']).toBeDefined();
    });

    it('요청 헤더에 anthropic-version이 포함된다', async () => {
      mockedAxios.post = jest
        .fn()
        .mockResolvedValueOnce(
          makeClaudeResponse(JSON.stringify({ action: 'draw' })),
        );

      await adapter.generateMove(makeMoveRequest());

      const [, , config] = (mockedAxios.post as jest.Mock).mock.calls[0];
      expect(config.headers['anthropic-version']).toBeDefined();
    });

    it('요청 바디에 system 필드로 시스템 프롬프트가 전달된다', async () => {
      mockedAxios.post = jest
        .fn()
        .mockResolvedValueOnce(
          makeClaudeResponse(JSON.stringify({ action: 'draw' })),
        );

      await adapter.generateMove(makeMoveRequest());

      // healthCheck 이후의 generateMove 호출은 두 번째 이상 호출임
      // 첫 번째 generateMove callLlm 호출만 확인
      const calls = (mockedAxios.post as jest.Mock).mock.calls;
      const generateMoveCall = calls.find(([, body]) => body && body.system);
      expect(generateMoveCall).toBeDefined();
      expect(generateMoveCall![1].system).toBeDefined();
    });

    it('timeoutMs가 axios 타임아웃에 전달된다', async () => {
      mockedAxios.post = jest
        .fn()
        .mockResolvedValueOnce(
          makeClaudeResponse(JSON.stringify({ action: 'draw' })),
        );

      await adapter.generateMove(makeMoveRequest({ timeoutMs: 25000 }));

      const calls = (mockedAxios.post as jest.Mock).mock.calls;
      const callLlmCall = calls.find(
        ([, , cfg]) => cfg && cfg.timeout === 25000,
      );
      expect(callLlmCall).toBeDefined();
    });

    it('beginner 난이도는 요청 바디에 temperature=1.0을 포함한다', async () => {
      mockedAxios.post = jest
        .fn()
        .mockResolvedValueOnce(
          makeClaudeResponse(JSON.stringify({ action: 'draw' })),
        );

      await adapter.generateMove(makeMoveRequest({ difficulty: 'beginner' }));

      const [, body] = (mockedAxios.post as jest.Mock).mock.calls[0];
      expect(body.temperature).toBe(1.0);
    });

    it('intermediate 난이도는 요청 바디에 temperature=0.7을 포함한다', async () => {
      mockedAxios.post = jest
        .fn()
        .mockResolvedValueOnce(
          makeClaudeResponse(JSON.stringify({ action: 'draw' })),
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
          makeClaudeResponse(JSON.stringify({ action: 'draw' })),
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
    it('input_tokens와 output_tokens가 메타데이터에 반영된다', async () => {
      mockedAxios.post = jest
        .fn()
        .mockResolvedValueOnce(
          makeClaudeResponse(JSON.stringify({ action: 'draw' }), 200, 90),
        );

      const response = await adapter.generateMove(makeMoveRequest());

      expect(response.metadata.promptTokens).toBe(200);
      expect(response.metadata.completionTokens).toBe(90);
    });
  });

  // -----------------------------------------------------------------------
  // generateMove() - 파싱 실패 및 fallback
  // -----------------------------------------------------------------------
  describe('generateMove() - 파싱 실패', () => {
    it('모든 재시도 실패 시 isFallbackDraw=true를 반환한다', async () => {
      mockedAxios.post = jest
        .fn()
        .mockResolvedValue(makeClaudeResponse('유효하지 않은 응답'));

      const response = await adapter.generateMove(
        makeMoveRequest({ maxRetries: 2 }),
      );

      expect(response.action).toBe('draw');
      expect(response.metadata.isFallbackDraw).toBe(true);
    });
  });
});
