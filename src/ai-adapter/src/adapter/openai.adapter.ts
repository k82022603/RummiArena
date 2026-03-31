import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import axios from 'axios';
import { BaseAdapter } from './base.adapter';
import { ModelInfo } from '../common/interfaces/ai-adapter.interface';
import { PromptBuilderService } from '../prompt/prompt-builder.service';
import { ResponseParserService } from '../common/parser/response-parser.service';

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
 */
@Injectable()
export class OpenAiAdapter extends BaseAdapter {
  /** gpt-5 추론 모델 최소 타임아웃 (ms) */
  static readonly REASONING_MIN_TIMEOUT_MS = 120_000;

  private readonly apiKey: string;
  private readonly defaultModel: string;
  private readonly baseUrl = 'https://api.openai.com/v1';

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
