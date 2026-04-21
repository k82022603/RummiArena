import { Logger } from '@nestjs/common';
import {
  AiAdapterInterface,
  ModelInfo,
} from '../common/interfaces/ai-adapter.interface';
import { MoveRequestDto, Difficulty } from '../common/dto/move-request.dto';
import { MoveResponseDto } from '../common/dto/move-response.dto';
import { PromptBuilderService } from '../prompt/prompt-builder.service';
import { ResponseParserService } from '../common/parser/response-parser.service';
import { PromptRegistry } from '../prompt/registry/prompt-registry.service';
import {
  ModelType as RegistryModelType,
  PromptVariant,
} from '../prompt/registry/prompt-registry.types';

/**
 * 난이도별 LLM temperature 기본값.
 * beginner(0.9): 창의적 실수 유발하되 JSON 오류율 감소를 위해 1.0에서 낮춤
 * intermediate(0.7): 균형 잡힌 탐색
 * expert(0.3): 낮은 랜덤성으로 최적 수 집중
 */
export const DIFFICULTY_TEMPERATURE: Record<Difficulty, number> = {
  beginner: 0.9,
  intermediate: 0.7,
  expert: 0.3,
};

/**
 * 모든 LLM 어댑터의 공통 기반 클래스.
 * 재시도 로직, fallback 드로우, 로깅을 공통으로 처리한다.
 * 각 어댑터는 callLlm() 만 구현하면 된다.
 *
 * 프롬프트 해결 흐름 (SP3 / 39번 §4):
 *   - promptRegistry 가 주입되어 있으면 → registry.resolve(modelType) 로 PromptVariant 획득
 *     - variantId === 'character-ko' → legacy PromptBuilderService 경로 (한국어 캐릭터)
 *     - 그 외 → variant.systemPromptBuilder() / userPromptBuilder() / retryPromptBuilder() 사용
 *   - promptRegistry 가 undefined 인 경우 (legacy 테스트 호환) → PromptBuilderService 경로
 */
export abstract class BaseAdapter implements AiAdapterInterface {
  protected readonly logger: Logger;

  constructor(
    protected readonly promptBuilder: PromptBuilderService,
    protected readonly responseParser: ResponseParserService,
    loggerContext: string,
    protected readonly promptRegistry?: PromptRegistry,
  ) {
    this.logger = new Logger(loggerContext);
  }

  /**
   * Registry 에서 본 어댑터에 해당하는 ModelType 을 반환한다.
   * DeepSeek 처럼 chat/reasoner 분리가 필요한 어댑터는 오버라이드한다.
   */
  protected getRegistryModelType(): RegistryModelType {
    return this.getModelInfo().modelType as RegistryModelType;
  }

  /**
   * 본 어댑터가 사용해야 할 PromptVariant 를 반환한다.
   * registry 가 없거나 'character-ko' 변형이면 null 을 반환 (legacy 경로 사용 의미).
   */
  protected resolveActiveVariant(): PromptVariant | null {
    if (!this.promptRegistry) return null;
    const variant = this.promptRegistry.resolve(this.getRegistryModelType());
    if (variant.id === 'character-ko') return null;
    return variant;
  }

  /**
   * LLM API 를 직접 호출하는 메서드. 각 어댑터에서 구현한다.
   * @param temperature 샘플링 온도 (0.0~1.0). 높을수록 창의적, 낮을수록 결정론적.
   *   난이도별 권장값: beginner=1.0 / intermediate=0.7 / expert=0.3
   * @returns 원시 응답 텍스트와 토큰 사용량
   */
  protected abstract callLlm(
    systemPrompt: string,
    userPrompt: string,
    timeoutMs: number,
    temperature: number,
  ): Promise<{
    content: string;
    promptTokens: number;
    completionTokens: number;
  }>;

  abstract getModelInfo(): ModelInfo;
  abstract healthCheck(): Promise<boolean>;

  /**
   * 재시도 전 지수 백오프 대기.
   * 테스트에서 오버라이드하여 대기 시간을 제거할 수 있도록 protected 로 분리.
   */
  protected async backoff(attempt: number): Promise<void> {
    const backoffMs = Math.min(1000 * Math.pow(2, attempt), 60000);
    await new Promise((resolve) => setTimeout(resolve, backoffMs));
  }

  /**
   * 재시도 로직이 포함된 generateMove 구현.
   * 파싱 실패 또는 유효하지 않은 수 → 최대 maxRetries 까지 재시도.
   * 모두 실패하면 강제 드로우를 반환한다.
   */
  async generateMove(request: MoveRequestDto): Promise<MoveResponseDto> {
    const modelInfo = this.getModelInfo();
    const variant = this.resolveActiveVariant();

    const systemPrompt = variant
      ? variant.systemPromptBuilder()
      : this.promptBuilder.buildSystemPrompt(request);

    const totalStartTime = Date.now();
    const temperature = variant
      ? variant.metadata.recommendedTemperature
      : (DIFFICULTY_TEMPERATURE[request.difficulty] ?? 0.7);

    let lastErrorReason = '';

    for (let attempt = 0; attempt < request.maxRetries; attempt++) {
      // 재시도 전 지수 백오프 (첫 시도 제외)
      if (attempt > 0) {
        this.logger.log(
          `[${modelInfo.modelType}] 재시도 대기 (attempt=${attempt + 1})`,
        );
        await this.backoff(attempt);
      }

      const attemptStartTime = Date.now();

      // 재시도 시에는 에러 피드백을 포함한 프롬프트를 사용한다
      let userPrompt: string;
      if (variant) {
        userPrompt =
          attempt === 0
            ? variant.userPromptBuilder(request.gameState)
            : variant.retryPromptBuilder(
                request.gameState,
                lastErrorReason,
                attempt,
              );
      } else {
        userPrompt =
          attempt === 0
            ? this.promptBuilder.buildUserPrompt(request)
            : this.promptBuilder.buildRetryUserPrompt(
                request,
                lastErrorReason,
                attempt,
              );
      }

      this.logger.log(
        `[${modelInfo.modelType}] gameId=${request.gameId} attempt=${attempt + 1}/${request.maxRetries} temperature=${temperature} variant=${variant?.id ?? 'character-ko-legacy'}`,
      );

      try {
        const llmResult = await this.callLlm(
          systemPrompt,
          userPrompt,
          request.timeoutMs,
          temperature,
        );

        const latencyMs = Date.now() - attemptStartTime;
        const parseResult = this.responseParser.parse(
          {
            content: llmResult.content,
            promptTokens: llmResult.promptTokens,
            completionTokens: llmResult.completionTokens,
            latencyMs,
          },
          {
            modelType: modelInfo.modelType,
            modelName: modelInfo.modelName,
            isFallbackDraw: false,
          },
          attempt,
        );

        if (parseResult.success && parseResult.response) {
          this.logger.log(
            `[${modelInfo.modelType}] 성공 action=${parseResult.response.action} latencyMs=${latencyMs}`,
          );
          return parseResult.response;
        }

        lastErrorReason = parseResult.errorReason ?? '알 수 없는 파싱 오류';
        this.logger.warn(
          `[${modelInfo.modelType}] attempt=${attempt + 1} 파싱 실패: ${lastErrorReason}`,
        );
      } catch (err) {
        lastErrorReason = (err as Error).message;
        this.logger.error(
          `[${modelInfo.modelType}] attempt=${attempt + 1} LLM 호출 오류: ${lastErrorReason}`,
        );
      }
    }

    // maxRetries 모두 실패 → 강제 드로우
    const totalLatencyMs = Date.now() - totalStartTime;
    return this.responseParser.buildFallbackDraw(
      {
        modelType: modelInfo.modelType,
        modelName: modelInfo.modelName,
        isFallbackDraw: true,
      },
      request.maxRetries,
      totalLatencyMs,
    );
  }
}
