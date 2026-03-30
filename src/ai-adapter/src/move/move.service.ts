import { Injectable, Logger, BadRequestException } from '@nestjs/common';
import { OpenAiAdapter } from '../adapter/openai.adapter';
import { ClaudeAdapter } from '../adapter/claude.adapter';
import { DeepSeekAdapter } from '../adapter/deepseek.adapter';
import { OllamaAdapter } from '../adapter/ollama.adapter';
import { AiAdapterInterface } from '../common/interfaces/ai-adapter.interface';
import { MoveRequestDto } from '../common/dto/move-request.dto';
import { MoveResponseDto } from '../common/dto/move-response.dto';
import { CostTrackingService } from '../cost/cost-tracking.service';
import { MetricsService } from '../metrics/metrics.service';

export type ModelType = 'openai' | 'claude' | 'deepseek' | 'ollama';

/**
 * Move 비즈니스 로직 서비스.
 *
 * model 파라미터를 보고 적절한 어댑터를 선택한 뒤 generateMove()를 위임한다.
 * 재시도 로직과 fallback 드로우는 BaseAdapter에 이미 내장되어 있으므로
 * 이 서비스는 어댑터 선택과 오류 변환에만 집중한다.
 *
 * LLM 호출 완료 후 비용 추적(CostTrackingService)과
 * 성능 메트릭(MetricsService)을 비동기로 기록한다.
 * 기록 실패는 서비스 응답에 영향을 주지 않는다.
 */
@Injectable()
export class MoveService {
  private readonly logger = new Logger(MoveService.name);

  constructor(
    private readonly openAiAdapter: OpenAiAdapter,
    private readonly claudeAdapter: ClaudeAdapter,
    private readonly deepSeekAdapter: DeepSeekAdapter,
    private readonly ollamaAdapter: OllamaAdapter,
    private readonly costTrackingService: CostTrackingService,
    private readonly metricsService: MetricsService,
  ) {}

  /**
   * 요청된 모델에 해당하는 어댑터를 선택하여 AI 수를 생성한다.
   * LLM 호출 완료 후 비용 추적과 성능 메트릭을 비동기로 기록한다.
   *
   * @param model LLM 공급자 타입
   * @param request 게임 상태 + AI 설정이 담긴 DTO
   */
  async generateMove(
    model: ModelType,
    request: MoveRequestDto,
  ): Promise<MoveResponseDto> {
    const adapter = this.selectAdapter(model);

    this.logger.log(
      `[MoveService] gameId=${request.gameId} playerId=${request.playerId} model=${model} persona=${request.persona} difficulty=${request.difficulty} psychologyLevel=${request.psychologyLevel}`,
    );

    const response = await adapter.generateMove(request);

    this.logger.log(
      `[MoveService] 완료 gameId=${request.gameId} action=${response.action} retryCount=${response.metadata.retryCount} latencyMs=${response.metadata.latencyMs}`,
    );

    // 비용 추적 + 메트릭 기록 (비동기, fire-and-forget)
    this.recordCostAndMetrics(model, request.gameId, response).catch(
      (err) => {
        this.logger.warn(
          `[MoveService] 비용/메트릭 기록 실패: ${(err as Error).message}`,
        );
      },
    );

    return response;
  }

  /**
   * 비용 추적과 성능 메트릭을 병렬로 기록한다.
   * 실패해도 서비스 응답에는 영향 없음.
   */
  private async recordCostAndMetrics(
    model: ModelType,
    gameId: string,
    response: MoveResponseDto,
  ): Promise<void> {
    const { metadata } = response;

    await Promise.allSettled([
      this.costTrackingService.recordCost({
        modelType: metadata.modelType,
        promptTokens: metadata.promptTokens,
        completionTokens: metadata.completionTokens,
      }),
      this.metricsService.recordMetric({
        modelType: metadata.modelType,
        modelName: metadata.modelName,
        gameId,
        latencyMs: metadata.latencyMs,
        promptTokens: metadata.promptTokens,
        completionTokens: metadata.completionTokens,
        parseSuccess: !metadata.isFallbackDraw,
        isFallbackDraw: metadata.isFallbackDraw,
        retryCount: metadata.retryCount,
        timestamp: new Date().toISOString(),
      }),
    ]);
  }

  /**
   * model 타입 문자열을 실제 어댑터 인스턴스로 매핑한다.
   * 알 수 없는 모델 타입이면 BadRequestException을 던진다.
   */
  private selectAdapter(model: ModelType): AiAdapterInterface {
    const adapters: Record<ModelType, AiAdapterInterface> = {
      openai: this.openAiAdapter,
      claude: this.claudeAdapter,
      deepseek: this.deepSeekAdapter,
      ollama: this.ollamaAdapter,
    };

    const adapter = adapters[model];
    if (!adapter) {
      throw new BadRequestException(
        `지원하지 않는 모델입니다: "${model}". 사용 가능한 모델: openai, claude, deepseek, ollama`,
      );
    }

    return adapter;
  }
}
