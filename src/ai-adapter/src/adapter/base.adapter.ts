import { Logger } from '@nestjs/common';
import { AiAdapterInterface, ModelInfo } from '../common/interfaces/ai-adapter.interface';
import { MoveRequestDto } from '../common/dto/move-request.dto';
import { MoveResponseDto } from '../common/dto/move-response.dto';
import { PromptBuilderService } from '../prompt/prompt-builder.service';
import { ResponseParserService } from '../common/parser/response-parser.service';

/**
 * 모든 LLM 어댑터의 공통 기반 클래스.
 * 재시도 로직, fallback 드로우, 로깅을 공통으로 처리한다.
 * 각 어댑터는 callLlm()만 구현하면 된다.
 */
export abstract class BaseAdapter implements AiAdapterInterface {
  protected readonly logger: Logger;

  constructor(
    protected readonly promptBuilder: PromptBuilderService,
    protected readonly responseParser: ResponseParserService,
    loggerContext: string,
  ) {
    this.logger = new Logger(loggerContext);
  }

  /**
   * LLM API를 직접 호출하는 메서드. 각 어댑터에서 구현한다.
   * @returns 원시 응답 텍스트와 토큰 사용량
   */
  protected abstract callLlm(
    systemPrompt: string,
    userPrompt: string,
    timeoutMs: number,
  ): Promise<{ content: string; promptTokens: number; completionTokens: number }>;

  abstract getModelInfo(): ModelInfo;
  abstract healthCheck(): Promise<boolean>;

  /**
   * 재시도 로직이 포함된 generateMove 구현.
   * 파싱 실패 또는 유효하지 않은 수 → 최대 maxRetries까지 재시도.
   * 모두 실패하면 강제 드로우를 반환한다.
   */
  async generateMove(request: MoveRequestDto): Promise<MoveResponseDto> {
    const modelInfo = this.getModelInfo();
    const systemPrompt = this.promptBuilder.buildSystemPrompt(request);
    const totalStartTime = Date.now();

    let lastErrorReason = '';

    for (let attempt = 0; attempt < request.maxRetries; attempt++) {
      const attemptStartTime = Date.now();

      // 재시도 시에는 에러 피드백을 포함한 프롬프트를 사용한다
      const userPrompt =
        attempt === 0
          ? this.promptBuilder.buildUserPrompt(request)
          : this.promptBuilder.buildRetryUserPrompt(request, lastErrorReason, attempt);

      this.logger.log(
        `[${modelInfo.modelType}] gameId=${request.gameId} attempt=${attempt + 1}/${request.maxRetries}`,
      );

      try {
        const llmResult = await this.callLlm(
          systemPrompt,
          userPrompt,
          request.timeoutMs,
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
