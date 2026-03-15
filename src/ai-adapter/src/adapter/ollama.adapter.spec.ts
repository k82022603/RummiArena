import { OllamaAdapter } from './ollama.adapter';
import { PromptBuilderService } from '../prompt/prompt-builder.service';
import { ResponseParserService } from '../common/parser/response-parser.service';
import { ConfigService } from '@nestjs/config';
import axios from 'axios';
import { MoveRequestDto, GameStateDto } from '../common/dto/move-request.dto';

// axios 전체를 mock
jest.mock('axios');
const mockedAxios = axios as jest.Mocked<typeof axios>;

// -----------------------------------------------------------------------
// OllamaAdapter 단위 테스트
//
// 목적:
//   - Ollama API 응답을 mock하여 MoveResponseDto 파싱 정상 동작 확인
//   - 파싱 실패 시 재시도 + 강제 드로우 fallback 확인
//   - healthCheck() 동작 확인
//   - getModelInfo() 설정값 반영 확인
//
// 실제 HTTP 호출 없이 axios를 mock하여 독립적으로 실행한다.
// -----------------------------------------------------------------------

/** 테스트용 MoveRequestDto 팩토리 */
const makeMoveRequest = (
  overrides: Partial<MoveRequestDto> = {},
): MoveRequestDto => ({
  gameId: 'test-game-001',
  playerId: 'ai-player-ollama',
  gameState: {
    tableGroups: [],
    myTiles: ['R7a', 'R8a', 'R9a', 'B3b', 'Y5a', 'K2a'],
    opponents: [{ playerId: 'player-human', remainingTiles: 10 }],
    drawPileCount: 80,
    turnNumber: 1,
    initialMeldDone: false,
  } as GameStateDto,
  persona: 'rookie',
  difficulty: 'beginner',
  psychologyLevel: 0,
  maxRetries: 3,
  timeoutMs: 30000,
  ...overrides,
});

/** Ollama /api/chat 응답 형식으로 래핑 */
const makeOllamaApiResponse = (content: string) => ({
  data: {
    model: 'gemma3:4b',
    message: {
      role: 'assistant',
      content,
    },
    done: true,
    prompt_eval_count: 120,
    eval_count: 45,
  },
  status: 200,
});

describe('OllamaAdapter', () => {
  let adapter: OllamaAdapter;
  let promptBuilder: PromptBuilderService;
  let responseParser: ResponseParserService;
  let configService: ConfigService;

  beforeEach(() => {
    promptBuilder = new PromptBuilderService();
    responseParser = new ResponseParserService();

    // ConfigService mock: OLLAMA_BASE_URL, OLLAMA_DEFAULT_MODEL 환경변수 반환
    configService = {
      get: jest.fn((key: string, defaultValue?: string) => {
        const config: Record<string, string> = {
          OLLAMA_BASE_URL: 'http://172.21.32.1:11434',
          OLLAMA_DEFAULT_MODEL: 'gemma3:4b',
        };
        return config[key] ?? defaultValue;
      }),
    } as unknown as ConfigService;

    adapter = new OllamaAdapter(promptBuilder, responseParser, configService);

    // 각 테스트 전 mock 초기화
    jest.clearAllMocks();
  });

  // -----------------------------------------------------------------------
  // getModelInfo()
  // -----------------------------------------------------------------------
  describe('getModelInfo()', () => {
    it('.env의 OLLAMA_BASE_URL과 OLLAMA_DEFAULT_MODEL을 반환한다', () => {
      const info = adapter.getModelInfo();

      expect(info.modelType).toBe('ollama');
      expect(info.modelName).toBe('gemma3:4b');
      expect(info.baseUrl).toBe('http://172.21.32.1:11434');
    });

    it('환경변수 미설정 시 기본값(localhost:11434, llama3.2)을 반환한다', () => {
      const configWithDefaults = {
        get: jest.fn((key: string, defaultValue?: string) => defaultValue),
      } as unknown as ConfigService;
      const adapterWithDefaults = new OllamaAdapter(
        promptBuilder,
        responseParser,
        configWithDefaults,
      );

      const info = adapterWithDefaults.getModelInfo();
      expect(info.baseUrl).toBe('http://localhost:11434');
      expect(info.modelName).toBe('llama3.2');
    });
  });

  // -----------------------------------------------------------------------
  // healthCheck()
  // -----------------------------------------------------------------------
  describe('healthCheck()', () => {
    it('Ollama /api/tags가 200 응답이면 true를 반환한다', async () => {
      mockedAxios.get = jest.fn().mockResolvedValueOnce({ status: 200 });

      const result = await adapter.healthCheck();

      expect(result).toBe(true);
      expect(mockedAxios.get).toHaveBeenCalledWith(
        'http://172.21.32.1:11434/api/tags',
        expect.objectContaining({ timeout: 5000 }),
      );
    });

    it('Ollama 연결 실패 시 false를 반환한다', async () => {
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
    it('Ollama가 draw JSON을 반환하면 action=draw 응답을 반환한다', async () => {
      const drawContent = JSON.stringify({
        action: 'draw',
        reasoning: '초기 등록 30점을 만들 수 없어 드로우를 선택합니다.',
      });
      mockedAxios.post = jest
        .fn()
        .mockResolvedValueOnce(makeOllamaApiResponse(drawContent));

      const response = await adapter.generateMove(makeMoveRequest());

      expect(response.action).toBe('draw');
      expect(response.reasoning).toContain('드로우');
      expect(response.metadata.modelType).toBe('ollama');
      expect(response.metadata.modelName).toBe('gemma3:4b');
      expect(response.metadata.isFallbackDraw).toBe(false);
      expect(response.metadata.retryCount).toBe(0);
    });
  });

  // -----------------------------------------------------------------------
  // generateMove() - place 응답
  // -----------------------------------------------------------------------
  describe('generateMove() - place 응답', () => {
    it('유효한 place JSON을 반환하면 tableGroups와 tilesFromRack이 설정된다', async () => {
      const placeContent = JSON.stringify({
        action: 'place',
        tableGroups: [{ tiles: ['R7a', 'R8a', 'R9a'] }],
        tilesFromRack: ['R7a', 'R8a', 'R9a'],
        reasoning:
          '빨강 7-8-9 런으로 초기 등록을 완료합니다. (24+... 부족, 드로우)',
      });
      mockedAxios.post = jest
        .fn()
        .mockResolvedValueOnce(makeOllamaApiResponse(placeContent));

      const response = await adapter.generateMove(makeMoveRequest());

      expect(response.action).toBe('place');
      expect(response.tableGroups).toHaveLength(1);
      expect(response.tableGroups![0].tiles).toEqual(['R7a', 'R8a', 'R9a']);
      expect(response.tilesFromRack).toEqual(['R7a', 'R8a', 'R9a']);
      expect(response.metadata.isFallbackDraw).toBe(false);
    });

    it('조커 타일이 포함된 place 응답도 정상 파싱한다', async () => {
      const placeContent = JSON.stringify({
        action: 'place',
        tableGroups: [{ tiles: ['JK1', 'R8a', 'R9a'] }],
        tilesFromRack: ['JK1', 'R8a', 'R9a'],
        reasoning: '조커를 R7a 대신 사용하여 런을 완성합니다.',
      });
      mockedAxios.post = jest
        .fn()
        .mockResolvedValueOnce(makeOllamaApiResponse(placeContent));

      const response = await adapter.generateMove(makeMoveRequest());

      expect(response.action).toBe('place');
      expect(response.tableGroups![0].tiles).toContain('JK1');
    });
  });

  // -----------------------------------------------------------------------
  // generateMove() - 파싱 실패 및 재시도
  // -----------------------------------------------------------------------
  describe('generateMove() - 파싱 실패 및 재시도', () => {
    it('첫 번째 응답 파싱 실패 후 두 번째 응답으로 성공하면 retryCount=1을 반환한다', async () => {
      const invalidContent = '이것은 JSON이 아닙니다.';
      const validContent = JSON.stringify({
        action: 'draw',
        reasoning: '재시도 후 드로우 선택',
      });

      mockedAxios.post = jest
        .fn()
        .mockResolvedValueOnce(makeOllamaApiResponse(invalidContent))
        .mockResolvedValueOnce(makeOllamaApiResponse(validContent));

      const response = await adapter.generateMove(
        makeMoveRequest({ maxRetries: 3 }),
      );

      expect(response.action).toBe('draw');
      expect(response.metadata.retryCount).toBe(1);
      expect(mockedAxios.post).toHaveBeenCalledTimes(2);
    });

    it('maxRetries 모두 실패하면 강제 드로우(isFallbackDraw=true)를 반환한다', async () => {
      // 모든 응답을 파싱 불가 텍스트로 설정
      mockedAxios.post = jest
        .fn()
        .mockResolvedValue(makeOllamaApiResponse('파싱 불가 응답'));

      const response = await adapter.generateMove(
        makeMoveRequest({ maxRetries: 3 }),
      );

      expect(response.action).toBe('draw');
      expect(response.metadata.isFallbackDraw).toBe(true);
      expect(response.metadata.retryCount).toBe(3);
      expect(mockedAxios.post).toHaveBeenCalledTimes(3);
    });

    it('axios 네트워크 오류 시 재시도 후 강제 드로우를 반환한다', async () => {
      mockedAxios.post = jest.fn().mockRejectedValue(new Error('ECONNREFUSED'));

      const response = await adapter.generateMove(
        makeMoveRequest({ maxRetries: 2 }),
      );

      expect(response.action).toBe('draw');
      expect(response.metadata.isFallbackDraw).toBe(true);
      expect(response.metadata.retryCount).toBe(2);
    });
  });

  // -----------------------------------------------------------------------
  // generateMove() - Ollama API 호출 파라미터 검증
  // -----------------------------------------------------------------------
  describe('generateMove() - API 호출 파라미터', () => {
    it('/api/chat 엔드포인트로 POST 요청을 보낸다', async () => {
      mockedAxios.post = jest
        .fn()
        .mockResolvedValueOnce(
          makeOllamaApiResponse(JSON.stringify({ action: 'draw' })),
        );

      await adapter.generateMove(makeMoveRequest());

      const [url] = (mockedAxios.post as jest.Mock).mock.calls[0];
      expect(url).toBe('http://172.21.32.1:11434/api/chat');
    });

    it('요청 바디에 model, messages, stream:false, format:"json"이 포함된다', async () => {
      mockedAxios.post = jest
        .fn()
        .mockResolvedValueOnce(
          makeOllamaApiResponse(JSON.stringify({ action: 'draw' })),
        );

      await adapter.generateMove(makeMoveRequest());

      const [, body] = (mockedAxios.post as jest.Mock).mock.calls[0];
      expect(body.model).toBe('gemma3:4b');
      expect(body.stream).toBe(false);
      expect(body.format).toBe('json');
      expect(body.messages).toHaveLength(2);
      expect(body.messages[0].role).toBe('system');
      expect(body.messages[1].role).toBe('user');
    });

    it('timeoutMs를 axios 타임아웃에 전달한다', async () => {
      mockedAxios.post = jest
        .fn()
        .mockResolvedValueOnce(
          makeOllamaApiResponse(JSON.stringify({ action: 'draw' })),
        );

      await adapter.generateMove(makeMoveRequest({ timeoutMs: 15000 }));

      const [, , config] = (mockedAxios.post as jest.Mock).mock.calls[0];
      expect(config.timeout).toBe(15000);
    });
  });

  // -----------------------------------------------------------------------
  // generateMove() - 메타데이터 검증
  // -----------------------------------------------------------------------
  describe('generateMove() - 메타데이터', () => {
    it('prompt_eval_count와 eval_count가 메타데이터 토큰 수로 반영된다', async () => {
      mockedAxios.post = jest.fn().mockResolvedValueOnce({
        data: {
          model: 'gemma3:4b',
          message: {
            role: 'assistant',
            content: JSON.stringify({ action: 'draw' }),
          },
          done: true,
          prompt_eval_count: 200,
          eval_count: 80,
        },
        status: 200,
      });

      const response = await adapter.generateMove(makeMoveRequest());

      expect(response.metadata.promptTokens).toBe(200);
      expect(response.metadata.completionTokens).toBe(80);
    });

    it('토큰 정보 없을 때(undefined) promptTokens=0, completionTokens=0을 반환한다', async () => {
      mockedAxios.post = jest.fn().mockResolvedValueOnce({
        data: {
          model: 'gemma3:4b',
          message: {
            role: 'assistant',
            content: JSON.stringify({ action: 'draw' }),
          },
          done: true,
          // prompt_eval_count, eval_count 없음
        },
        status: 200,
      });

      const response = await adapter.generateMove(makeMoveRequest());

      expect(response.metadata.promptTokens).toBe(0);
      expect(response.metadata.completionTokens).toBe(0);
    });
  });

  // -----------------------------------------------------------------------
  // generateMove() - 코드 블록 포함 응답 처리
  // -----------------------------------------------------------------------
  describe('generateMove() - 코드 블록 포함 응답', () => {
    it('```json 코드 블록으로 감싸진 응답도 파싱한다', async () => {
      const wrappedContent =
        '```json\n' +
        JSON.stringify({ action: 'draw', reasoning: '코드블록 테스트' }) +
        '\n```';
      mockedAxios.post = jest
        .fn()
        .mockResolvedValueOnce(makeOllamaApiResponse(wrappedContent));

      const response = await adapter.generateMove(makeMoveRequest());

      expect(response.action).toBe('draw');
      expect(response.metadata.isFallbackDraw).toBe(false);
    });
  });
});
