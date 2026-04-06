import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import axios from 'axios';
import { BaseAdapter } from './base.adapter';
import { ModelInfo } from '../common/interfaces/ai-adapter.interface';
import { MoveRequestDto } from '../common/dto/move-request.dto';
import { MoveResponseDto } from '../common/dto/move-response.dto';
import { PromptBuilderService } from '../prompt/prompt-builder.service';
import { ResponseParserService } from '../common/parser/response-parser.service';
import {
  V2_REASONING_SYSTEM_PROMPT,
  buildV2UserPrompt,
  buildV2RetryPrompt,
} from '../prompt/v2-reasoning-prompt';

/**
 * OpenAI GPT 어댑터.
 * JSON mode를 활용하여 구조화된 응답을 강제한다.
 * 기본 모델: gpt-5-mini (추론 모델).
 *
 * gpt-5-mini 이상은 추론 모델로 다음 API 차이가 있다:
 * - max_tokens 대신 max_completion_tokens 사용
 * - temperature 커스텀 미지원 (고정 1)
 * - 응답에 reasoning_tokens 포함
 * - 추론 시간이 길어 최소 타임아웃 60초 보장
 *
 * USE_V2_PROMPT=true 시 DeepSeek v2 영문 reasoning 프롬프트 사용.
 */
@Injectable()
export class OpenAiAdapter extends BaseAdapter {
  /** 추론 모델 최소 타임아웃 (ms) — 전 모델 210s 통일 */
  static readonly REASONING_MIN_TIMEOUT_MS = 210_000;

  private readonly apiKey: string;
  private readonly defaultModel: string;
  private readonly baseUrl = 'https://api.openai.com/v1';
  private readonly useV2Prompt: boolean;

  constructor(
    promptBuilder: PromptBuilderService,
    responseParser: ResponseParserService,
    private readonly configService: ConfigService,
  ) {
    super(promptBuilder, responseParser, 'OpenAiAdapter');
    this.apiKey = this.configService.get<string>('OPENAI_API_KEY', '');
    this.defaultModel = this.configService.get<string>(
      'OPENAI_DEFAULT_MODEL',
      'gpt-5-mini',
    );
    this.useV2Prompt =
      this.configService.get<string>('USE_V2_PROMPT', 'false') === 'true';
    if (this.useV2Prompt) {
      this.logger.log('[OpenAI] V2 Reasoning Prompt enabled');
    }
  }

  getModelInfo(): ModelInfo {
    return {
      modelType: 'openai',
      modelName: this.defaultModel,
      baseUrl: this.baseUrl,
    };
  }

  async healthCheck(): Promise<boolean> {
    try {
      const response = await axios.get(`${this.baseUrl}/models`, {
        headers: { Authorization: `Bearer ${this.apiKey}` },
        timeout: 5000,
      });
      return response.status === 200;
    } catch {
      return false;
    }
  }

  /**
   * V2 프롬프트 활성화 시 generateMove를 오버라이드하여
   * 영문 reasoning 프롬프트와 영문 유저 프롬프트를 사용한다.
   */
  async generateMove(request: MoveRequestDto): Promise<MoveResponseDto> {
    if (!this.useV2Prompt) {
      return super.generateMove(request);
    }

    // V2 프롬프트: DeepSeek Reasoner와 동일한 영문 프롬프트 사용
    const modelInfo = this.getModelInfo();
    const systemPrompt = V2_REASONING_SYSTEM_PROMPT;
    const totalStartTime = Date.now();

    let lastErrorReason = '';

    for (let attempt = 0; attempt < request.maxRetries; attempt++) {
      const attemptStartTime = Date.now();

      const userPrompt =
        attempt === 0
          ? buildV2UserPrompt(request.gameState)
          : buildV2RetryPrompt(
              request.gameState,
              lastErrorReason,
              attempt,
            );

      this.logger.log(
        `[OpenAI-V2] gameId=${request.gameId} attempt=${attempt + 1}/${request.maxRetries}`,
      );

      try {
        const llmResult = await this.callLlm(
          systemPrompt,
          userPrompt,
          request.timeoutMs,
          0, // v2 프롬프트에서는 낮은 temperature 사용
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
            `[OpenAI-V2] 성공 action=${parseResult.response.action} latencyMs=${latencyMs}`,
          );
          return parseResult.response;
        }

        lastErrorReason = parseResult.errorReason ?? '알 수 없는 파싱 오류';
        this.logger.warn(
          `[OpenAI-V2] attempt=${attempt + 1} 파싱 실패: ${lastErrorReason}`,
        );
      } catch (err) {
        lastErrorReason = (err as Error).message;
        this.logger.error(
          `[OpenAI-V2] attempt=${attempt + 1} LLM 호출 오류: ${lastErrorReason}`,
        );
      }
    }

    // maxRetries 모두 실패 -> 강제 드로우
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

  protected async callLlm(
    systemPrompt: string,
    userPrompt: string,
    timeoutMs: number,
    temperature: number,
  ): Promise<{
    content: string;
    promptTokens: number;
    completionTokens: number;
  }> {
    // gpt-5 시리즈(추론 모델)는 max_completion_tokens + temperature 고정
    // gpt-4o 시리즈(비추론)는 max_tokens + temperature 커스텀
    const isReasoningModel = this.defaultModel.startsWith('gpt-5');
    const body: Record<string, unknown> = {
      model: this.defaultModel,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt },
      ],
      response_format: { type: 'json_object' },
    };
    if (isReasoningModel) {
      body.max_completion_tokens = 8192;
    } else {
      body.temperature = temperature;
      body.max_tokens = 1024;
    }

    const response = await axios.post(
      `${this.baseUrl}/chat/completions`,
      body,
      {
        headers: {
          Authorization: `Bearer ${this.apiKey}`,
          'Content-Type': 'application/json',
        },
        timeout: isReasoningModel
          ? Math.max(timeoutMs, OpenAiAdapter.REASONING_MIN_TIMEOUT_MS)
          : timeoutMs,
      },
    );

    const choice = response.data.choices[0];
    const usage = response.data.usage;

    return {
      content: choice.message.content as string,
      promptTokens: usage?.prompt_tokens ?? 0,
      completionTokens: usage?.completion_tokens ?? 0,
    };
  }
}
