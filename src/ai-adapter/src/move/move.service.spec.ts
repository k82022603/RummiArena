import { BadRequestException } from '@nestjs/common';
import { MoveService } from './move.service';
import { OpenAiAdapter } from '../adapter/openai.adapter';
import { ClaudeAdapter } from '../adapter/claude.adapter';
import { DeepSeekAdapter } from '../adapter/deepseek.adapter';
import { OllamaAdapter } from '../adapter/ollama.adapter';
import { MoveRequestDto, GameStateDto } from '../common/dto/move-request.dto';
import { MoveResponseDto } from '../common/dto/move-response.dto';
import { CostTrackingService } from '../cost/cost-tracking.service';
import { MetricsService } from '../metrics/metrics.service';

// -----------------------------------------------------------------------
// MoveService 단위 테스트
//
// 목적:
//   - model 파라미터에 따라 올바른 어댑터를 선택하는지 확인
//   - 알 수 없는 model 타입에서 BadRequestException을 던지는지 확인
//   - 어댑터 응답이 그대로 반환되는지 확인
//   - 비용 추적과 메트릭 기록이 호출되는지 확인
// -----------------------------------------------------------------------

const makeGameState = (): GameStateDto => ({
  tableGroups: [],
  myTiles: ['R7a', 'R8a', 'R9a'],
  opponents: [{ playerId: 'player-human', remainingTiles: 8 }],
  drawPileCount: 60,
  turnNumber: 3,
  initialMeldDone: false,
});

const makeMoveRequest = (): MoveRequestDto => ({
  gameId: 'svc-test-001',
  playerId: 'ai-player-001',
  gameState: makeGameState(),
  persona: 'calculator',
  difficulty: 'intermediate',
  psychologyLevel: 1,
  maxRetries: 3,
  timeoutMs: 30000,
});

const makeDrawResponse = (modelType: string): MoveResponseDto => ({
  action: 'draw',
  reasoning: '테스트용 드로우',
  metadata: {
    modelType,
    modelName: 'test-model',
    latencyMs: 100,
    promptTokens: 50,
    completionTokens: 20,
    retryCount: 0,
    isFallbackDraw: false,
  },
});

describe('MoveService', () => {
  let service: MoveService;

  let openAiAdapter: jest.Mocked<OpenAiAdapter>;
  let claudeAdapter: jest.Mocked<ClaudeAdapter>;
  let deepSeekAdapter: jest.Mocked<DeepSeekAdapter>;
  let ollamaAdapter: jest.Mocked<OllamaAdapter>;
  let costTrackingService: jest.Mocked<CostTrackingService>;
  let metricsService: jest.Mocked<MetricsService>;

  beforeEach(() => {
    openAiAdapter = {
      generateMove: jest.fn(),
      healthCheck: jest.fn(),
      getModelInfo: jest.fn(),
    } as unknown as jest.Mocked<OpenAiAdapter>;

    claudeAdapter = {
      generateMove: jest.fn(),
      healthCheck: jest.fn(),
      getModelInfo: jest.fn(),
    } as unknown as jest.Mocked<ClaudeAdapter>;

    deepSeekAdapter = {
      generateMove: jest.fn(),
      healthCheck: jest.fn(),
      getModelInfo: jest.fn(),
    } as unknown as jest.Mocked<DeepSeekAdapter>;

    ollamaAdapter = {
      generateMove: jest.fn(),
      healthCheck: jest.fn(),
      getModelInfo: jest.fn(),
    } as unknown as jest.Mocked<OllamaAdapter>;

    costTrackingService = {
      recordCost: jest.fn().mockResolvedValue(undefined),
      isDailyLimitExceeded: jest.fn().mockResolvedValue(false),
      getDailySummary: jest.fn(),
    } as unknown as jest.Mocked<CostTrackingService>;

    metricsService = {
      recordMetric: jest.fn().mockResolvedValue(undefined),
    } as unknown as jest.Mocked<MetricsService>;

    service = new MoveService(
      openAiAdapter,
      claudeAdapter,
      deepSeekAdapter,
      ollamaAdapter,
      costTrackingService,
      metricsService,
    );
  });

  // -----------------------------------------------------------------------
  // 어댑터 선택 검증
  // -----------------------------------------------------------------------
  describe('generateMove() - 어댑터 선택', () => {
    it('model=openai이면 OpenAiAdapter.generateMove()를 호출한다', async () => {
      const expected = makeDrawResponse('openai');
      openAiAdapter.generateMove.mockResolvedValueOnce(expected);

      const result = await service.generateMove('openai', makeMoveRequest());

      expect(openAiAdapter.generateMove).toHaveBeenCalledTimes(1);
      expect(claudeAdapter.generateMove).not.toHaveBeenCalled();
      expect(deepSeekAdapter.generateMove).not.toHaveBeenCalled();
      expect(ollamaAdapter.generateMove).not.toHaveBeenCalled();
      expect(result).toEqual(expected);
    });

    it('model=claude이면 ClaudeAdapter.generateMove()를 호출한다', async () => {
      const expected = makeDrawResponse('claude');
      claudeAdapter.generateMove.mockResolvedValueOnce(expected);

      const result = await service.generateMove('claude', makeMoveRequest());

      expect(claudeAdapter.generateMove).toHaveBeenCalledTimes(1);
      expect(openAiAdapter.generateMove).not.toHaveBeenCalled();
      expect(result).toEqual(expected);
    });

    it('model=deepseek이면 DeepSeekAdapter.generateMove()를 호출한다', async () => {
      const expected = makeDrawResponse('deepseek');
      deepSeekAdapter.generateMove.mockResolvedValueOnce(expected);

      const result = await service.generateMove('deepseek', makeMoveRequest());

      expect(deepSeekAdapter.generateMove).toHaveBeenCalledTimes(1);
      expect(result).toEqual(expected);
    });

    it('model=ollama이면 OllamaAdapter.generateMove()를 호출한다', async () => {
      const expected = makeDrawResponse('ollama');
      ollamaAdapter.generateMove.mockResolvedValueOnce(expected);

      const result = await service.generateMove('ollama', makeMoveRequest());

      expect(ollamaAdapter.generateMove).toHaveBeenCalledTimes(1);
      expect(result).toEqual(expected);
    });
  });

  // -----------------------------------------------------------------------
  // 알 수 없는 모델 타입
  // -----------------------------------------------------------------------
  describe('generateMove() - 잘못된 모델', () => {
    it('지원하지 않는 모델 타입이면 BadRequestException을 던진다', async () => {
      await expect(
        service.generateMove('unknown' as any, makeMoveRequest()),
      ).rejects.toThrow(BadRequestException);
    });

    it('BadRequestException 메시지에 모델명이 포함된다', async () => {
      await expect(
        service.generateMove('invalid-model' as any, makeMoveRequest()),
      ).rejects.toThrow('invalid-model');
    });
  });

  // -----------------------------------------------------------------------
  // 응답 전달 검증
  // -----------------------------------------------------------------------
  describe('generateMove() - 응답 전달', () => {
    it('어댑터 응답(place)이 그대로 반환된다', async () => {
      const placeResponse: MoveResponseDto = {
        action: 'place',
        tableGroups: [{ tiles: ['R7a', 'R8a', 'R9a'] }],
        tilesFromRack: ['R7a', 'R8a', 'R9a'],
        reasoning: '런 배치',
        metadata: {
          modelType: 'openai',
          modelName: 'gpt-4o',
          latencyMs: 250,
          promptTokens: 120,
          completionTokens: 60,
          retryCount: 0,
          isFallbackDraw: false,
        },
      };
      openAiAdapter.generateMove.mockResolvedValueOnce(placeResponse);

      const result = await service.generateMove('openai', makeMoveRequest());

      expect(result.action).toBe('place');
      expect(result.tableGroups).toHaveLength(1);
      expect(result.metadata.modelType).toBe('openai');
    });

    it('어댑터 응답(fallback draw)이 그대로 반환된다', async () => {
      const fallbackResponse: MoveResponseDto = {
        action: 'draw',
        metadata: {
          modelType: 'ollama',
          modelName: 'llama3.2',
          latencyMs: 5000,
          promptTokens: 0,
          completionTokens: 0,
          retryCount: 3,
          isFallbackDraw: true,
        },
      };
      ollamaAdapter.generateMove.mockResolvedValueOnce(fallbackResponse);

      const result = await service.generateMove('ollama', makeMoveRequest());

      expect(result.action).toBe('draw');
      expect(result.metadata.isFallbackDraw).toBe(true);
      expect(result.metadata.retryCount).toBe(3);
    });

    it('MoveRequestDto가 어댑터에 그대로 전달된다', async () => {
      const request = makeMoveRequest();
      ollamaAdapter.generateMove.mockResolvedValueOnce(
        makeDrawResponse('ollama'),
      );

      await service.generateMove('ollama', request);

      expect(ollamaAdapter.generateMove).toHaveBeenCalledWith(request);
    });
  });

  // -----------------------------------------------------------------------
  // 비용 추적 + 메트릭 기록 검증
  // -----------------------------------------------------------------------
  describe('generateMove() - 비용 추적 및 메트릭', () => {
    it('LLM 호출 후 비용 추적이 호출된다', async () => {
      const response = makeDrawResponse('openai');
      openAiAdapter.generateMove.mockResolvedValueOnce(response);

      await service.generateMove('openai', makeMoveRequest());

      // fire-and-forget이므로 약간의 딜레이 필요
      await new Promise((resolve) => setTimeout(resolve, 10));

      expect(costTrackingService.recordCost).toHaveBeenCalledWith({
        modelType: 'openai',
        promptTokens: 50,
        completionTokens: 20,
      });
    });

    it('LLM 호출 후 메트릭 기록이 호출된다', async () => {
      const response = makeDrawResponse('claude');
      claudeAdapter.generateMove.mockResolvedValueOnce(response);

      await service.generateMove('claude', makeMoveRequest());

      await new Promise((resolve) => setTimeout(resolve, 10));

      expect(metricsService.recordMetric).toHaveBeenCalledWith(
        expect.objectContaining({
          modelType: 'claude',
          modelName: 'test-model',
          gameId: 'svc-test-001',
          latencyMs: 100,
          promptTokens: 50,
          completionTokens: 20,
          parseSuccess: true,
          isFallbackDraw: false,
          retryCount: 0,
        }),
      );
    });

    it('비용 추적 실패 시에도 응답은 정상 반환된다', async () => {
      costTrackingService.recordCost.mockRejectedValueOnce(
        new Error('Redis down'),
      );
      const response = makeDrawResponse('openai');
      openAiAdapter.generateMove.mockResolvedValueOnce(response);

      const result = await service.generateMove('openai', makeMoveRequest());

      expect(result).toEqual(response);
    });

    it('메트릭 기록 실패 시에도 응답은 정상 반환된다', async () => {
      metricsService.recordMetric.mockRejectedValueOnce(
        new Error('Redis down'),
      );
      const response = makeDrawResponse('openai');
      openAiAdapter.generateMove.mockResolvedValueOnce(response);

      const result = await service.generateMove('openai', makeMoveRequest());

      expect(result).toEqual(response);
    });

    it('fallback draw 응답도 비용/메트릭이 기록된다', async () => {
      const response: MoveResponseDto = {
        action: 'draw',
        metadata: {
          modelType: 'openai',
          modelName: 'gpt-4o',
          latencyMs: 5000,
          promptTokens: 0,
          completionTokens: 0,
          retryCount: 3,
          isFallbackDraw: true,
        },
      };
      openAiAdapter.generateMove.mockResolvedValueOnce(response);

      await service.generateMove('openai', makeMoveRequest());

      await new Promise((resolve) => setTimeout(resolve, 10));

      expect(costTrackingService.recordCost).toHaveBeenCalled();
      expect(metricsService.recordMetric).toHaveBeenCalledWith(
        expect.objectContaining({
          isFallbackDraw: true,
          parseSuccess: false,
        }),
      );
    });
  });
});
