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

/** Qwen3 thinking 모드 응답 형식으로 래핑 (content + thinking) */
const makeOllamaThinkingResponse = (content: string, thinking: string) => ({
  data: {
    model: 'qwen3:4b',
    message: {
      role: 'assistant',
      content,
      thinking,
    },
    done: true,
    prompt_eval_count: 150,
    eval_count: 80,
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

    it('환경변수 미설정 시 기본값(localhost:11434, gemma3:4b)을 반환한다', () => {
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
      expect(info.modelName).toBe('gemma3:4b');
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
      // OllamaAdapter.MIN_RETRIES(5)로 보정되므로 실제 시도 횟수는 5회
      mockedAxios.post = jest
        .fn()
        .mockResolvedValue(makeOllamaApiResponse('파싱 불가 응답'));

      const response = await adapter.generateMove(
        makeMoveRequest({ maxRetries: 3 }),
      );

      expect(response.action).toBe('draw');
      expect(response.metadata.isFallbackDraw).toBe(true);
      // maxRetries=3이 MIN_RETRIES=5로 보정되므로 retryCount=5
      expect(response.metadata.retryCount).toBe(OllamaAdapter.MIN_RETRIES);
      expect(mockedAxios.post).toHaveBeenCalledTimes(OllamaAdapter.MIN_RETRIES);
    });

    it('axios 네트워크 오류 시 재시도 후 강제 드로우를 반환한다', async () => {
      mockedAxios.post = jest.fn().mockRejectedValue(new Error('ECONNREFUSED'));

      // maxRetries=2가 MIN_RETRIES=5로 보정됨
      const response = await adapter.generateMove(
        makeMoveRequest({ maxRetries: 2 }),
      );

      expect(response.action).toBe('draw');
      expect(response.metadata.isFallbackDraw).toBe(true);
      // MIN_RETRIES=5로 보정되므로 retryCount=5
      expect(response.metadata.retryCount).toBe(OllamaAdapter.MIN_RETRIES);
    });
  });

  // -----------------------------------------------------------------------
  // MIN_RETRIES 상수 및 maxRetries 보정 로직
  // -----------------------------------------------------------------------
  describe('MIN_RETRIES 상수 및 maxRetries 보정', () => {
    it('MIN_RETRIES 상수는 5이다', () => {
      expect(OllamaAdapter.MIN_RETRIES).toBe(5);
    });

    it('maxRetries가 MIN_RETRIES(5)보다 크면 보정 없이 그대로 사용한다', async () => {
      const validContent = JSON.stringify({
        action: 'draw',
        reasoning: '드로우',
      });
      mockedAxios.post = jest
        .fn()
        .mockResolvedValueOnce(makeOllamaApiResponse(validContent));

      // maxRetries=7 > MIN_RETRIES=5 이므로 보정 없이 7 그대로
      const response = await adapter.generateMove(
        makeMoveRequest({ maxRetries: 7 }),
      );

      expect(response.action).toBe('draw');
      // 첫 시도에 성공하므로 retryCount=0
      expect(response.metadata.retryCount).toBe(0);
      expect(mockedAxios.post).toHaveBeenCalledTimes(1);
    });

    it('maxRetries가 MIN_RETRIES(5)와 동일하면 보정 없이 그대로 사용한다', async () => {
      const validContent = JSON.stringify({
        action: 'draw',
        reasoning: '드로우',
      });
      mockedAxios.post = jest
        .fn()
        .mockResolvedValueOnce(makeOllamaApiResponse(validContent));

      const response = await adapter.generateMove(
        makeMoveRequest({ maxRetries: 5 }),
      );

      expect(response.action).toBe('draw');
      expect(response.metadata.retryCount).toBe(0);
    });

    it('maxRetries=1이 MIN_RETRIES=5로 보정되면 fallback 시 retryCount=5이다', async () => {
      mockedAxios.post = jest
        .fn()
        .mockResolvedValue(makeOllamaApiResponse('파싱 불가'));

      const response = await adapter.generateMove(
        makeMoveRequest({ maxRetries: 1 }),
      );

      expect(response.metadata.isFallbackDraw).toBe(true);
      expect(response.metadata.retryCount).toBe(OllamaAdapter.MIN_RETRIES);
      expect(mockedAxios.post).toHaveBeenCalledTimes(OllamaAdapter.MIN_RETRIES);
    });
  });

  // -----------------------------------------------------------------------
  // generateMove() - temperature 파라미터 검증
  // -----------------------------------------------------------------------
  describe('generateMove() - temperature 파라미터', () => {
    it('beginner 난이도는 temperature=0.7로 API를 호출한다 (Ollama: max 0.7 clamp)', async () => {
      mockedAxios.post = jest
        .fn()
        .mockResolvedValueOnce(
          makeOllamaApiResponse(JSON.stringify({ action: 'draw' })),
        );

      await adapter.generateMove(makeMoveRequest({ difficulty: 'beginner' }));

      const [, body] = (mockedAxios.post as jest.Mock).mock.calls[0];
      // #31: Ollama 소형 모델 JSON 형식 준수율 향상을 위해 temperature를 max 0.7로 clamp
      expect(body.options.temperature).toBe(0.7);
    });

    it('intermediate 난이도는 temperature=0.7로 API를 호출한다', async () => {
      mockedAxios.post = jest
        .fn()
        .mockResolvedValueOnce(
          makeOllamaApiResponse(JSON.stringify({ action: 'draw' })),
        );

      await adapter.generateMove(
        makeMoveRequest({ difficulty: 'intermediate' }),
      );

      const [, body] = (mockedAxios.post as jest.Mock).mock.calls[0];
      expect(body.options.temperature).toBe(0.7);
    });

    it('expert 난이도는 temperature=0.3으로 API를 호출한다', async () => {
      mockedAxios.post = jest
        .fn()
        .mockResolvedValueOnce(
          makeOllamaApiResponse(JSON.stringify({ action: 'draw' })),
        );

      await adapter.generateMove(makeMoveRequest({ difficulty: 'expert' }));

      const [, body] = (mockedAxios.post as jest.Mock).mock.calls[0];
      expect(body.options.temperature).toBe(0.3);
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

    it('options에 num_predict=4096과 stop 토큰이 포함된다 (thinking + JSON 공간 확보)', async () => {
      mockedAxios.post = jest
        .fn()
        .mockResolvedValueOnce(
          makeOllamaApiResponse(JSON.stringify({ action: 'draw' })),
        );

      await adapter.generateMove(makeMoveRequest());

      const [, body] = (mockedAxios.post as jest.Mock).mock.calls[0];
      expect(body.options.num_predict).toBe(4096);
      // BL-P2-007: '\n\n' stop 토큰 제거 (place 응답 잘림 방지), '```' 코드블록만 유지
      expect(body.options.stop).toEqual(['```']);
    });

    it('timeoutMs를 axios 타임아웃에 전달한다 (MIN_TIMEOUT_MS 이상으로 보정)', async () => {
      mockedAxios.post = jest
        .fn()
        .mockResolvedValueOnce(
          makeOllamaApiResponse(JSON.stringify({ action: 'draw' })),
        );

      // timeoutMs=15000은 MIN_TIMEOUT_MS(210000)보다 작으므로 210000으로 보정됨
      await adapter.generateMove(makeMoveRequest({ timeoutMs: 15000 }));

      const [, , config] = (mockedAxios.post as jest.Mock).mock.calls[0];
      expect(config.timeout).toBe(OllamaAdapter.MIN_TIMEOUT_MS);
    });

    it('timeoutMs가 MIN_TIMEOUT_MS보다 크면 보정 없이 그대로 전달한다', async () => {
      mockedAxios.post = jest
        .fn()
        .mockResolvedValueOnce(
          makeOllamaApiResponse(JSON.stringify({ action: 'draw' })),
        );

      await adapter.generateMove(makeMoveRequest({ timeoutMs: 300000 }));

      const [, , config] = (mockedAxios.post as jest.Mock).mock.calls[0];
      expect(config.timeout).toBe(300000);
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

  // -----------------------------------------------------------------------
  // generateMove() - Qwen3 thinking 모드 응답 처리
  // -----------------------------------------------------------------------
  describe('generateMove() - thinking 모드 응답', () => {
    it('content가 비고 thinking에 JSON이 있으면 thinking에서 추출하여 파싱한다', async () => {
      const thinkingText =
        '이 상황에서는 30점을 넘기기 어려우므로 드로우해야 합니다.\n' +
        JSON.stringify({
          action: 'draw',
          reasoning: 'thinking에서 추출된 드로우',
        });
      mockedAxios.post = jest
        .fn()
        .mockResolvedValueOnce(makeOllamaThinkingResponse('', thinkingText));

      const response = await adapter.generateMove(makeMoveRequest());

      expect(response.action).toBe('draw');
      expect(response.reasoning).toContain('thinking에서 추출된 드로우');
      expect(response.metadata.isFallbackDraw).toBe(false);
    });

    it('content가 비고 thinking에 place JSON이 있으면 추출하여 파싱한다', async () => {
      const placeJson = JSON.stringify({
        action: 'place',
        tableGroups: [{ tiles: ['R7a', 'R8a', 'R9a'] }],
        tilesFromRack: ['R7a', 'R8a', 'R9a'],
        reasoning: 'thinking에서 추출된 배치',
      });
      const thinkingText = `R7-R8-R9 런 조합을 분석합니다.\n${placeJson}`;
      mockedAxios.post = jest
        .fn()
        .mockResolvedValueOnce(makeOllamaThinkingResponse('', thinkingText));

      const response = await adapter.generateMove(makeMoveRequest());

      expect(response.action).toBe('place');
      expect(response.tableGroups).toHaveLength(1);
      expect(response.tilesFromRack).toEqual(['R7a', 'R8a', 'R9a']);
      expect(response.metadata.isFallbackDraw).toBe(false);
    });

    it('content와 thinking 둘 다 있으면 content를 우선 사용한다', async () => {
      const contentJson = JSON.stringify({
        action: 'draw',
        reasoning: 'content의 드로우',
      });
      const thinkingJson = JSON.stringify({
        action: 'place',
        tableGroups: [{ tiles: ['R7a', 'R8a', 'R9a'] }],
        tilesFromRack: ['R7a', 'R8a', 'R9a'],
        reasoning: 'thinking의 배치',
      });
      mockedAxios.post = jest
        .fn()
        .mockResolvedValueOnce(
          makeOllamaThinkingResponse(contentJson, thinkingJson),
        );

      const response = await adapter.generateMove(makeMoveRequest());

      // content가 비어있지 않으므로 content를 사용
      expect(response.action).toBe('draw');
      expect(response.reasoning).toContain('content의 드로우');
    });

    it('content가 비고 thinking에도 JSON이 없으면 재시도 후 fallback 드로우를 반환한다', async () => {
      const thinkingNoJson =
        '이 상황에서는 어떤 조합도 만들 수 없습니다. 드로우해야 합니다.';
      mockedAxios.post = jest
        .fn()
        .mockResolvedValue(makeOllamaThinkingResponse('', thinkingNoJson));

      const response = await adapter.generateMove(makeMoveRequest());

      expect(response.action).toBe('draw');
      expect(response.metadata.isFallbackDraw).toBe(true);
    });

    it('content가 비고 thinking이 빈 문자열이면 재시도 후 fallback 드로우를 반환한다', async () => {
      mockedAxios.post = jest
        .fn()
        .mockResolvedValue(makeOllamaThinkingResponse('', ''));

      const response = await adapter.generateMove(makeMoveRequest());

      expect(response.action).toBe('draw');
      expect(response.metadata.isFallbackDraw).toBe(true);
    });
  });
});
