import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import axios from 'axios';
import { BaseAdapter } from './base.adapter';
import { ModelInfo } from '../common/interfaces/ai-adapter.interface';
import { PromptBuilderService } from '../prompt/prompt-builder.service';
import { ResponseParserService } from '../common/parser/response-parser.service';

/**
 * DeepSeek 어댑터.
 * OpenAI 호환 API를 사용하므로 openai.adapter.ts와 구조가 유사하다.
 * 기본 모델: deepseek-chat (비용 효율적)
 */
@Injectable()
export class DeepSeekAdapter extends BaseAdapter {
  private readonly apiKey: string;
  private readonly defaultModel: string;
  private readonly baseUrl = 'https://api.deepseek.com/v1';

  constructor(
    promptBuilder: PromptBuilderService,
    responseParser: ResponseParserService,
    private readonly configService: ConfigService,
  ) {
    super(promptBuilder, responseParser, 'DeepSeekAdapter');
    this.apiKey = this.configService.get<string>('DEEPSEEK_API_KEY', '');
    this.defaultModel = this.configService.get<string>(
      'DEEPSEEK_DEFAULT_MODEL',
      'deepseek-chat',
    );
  }

  getModelInfo(): ModelInfo {
    return {
      modelType: 'deepseek',
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
  ): Promise<{
    content: string;
    promptTokens: number;
    completionTokens: number;
  }> {
    // DeepSeek은 OpenAI 호환 API를 제공하므로 동일한 요청 구조를 사용한다
    const response = await axios.post(
      `${this.baseUrl}/chat/completions`,
      {
        model: this.defaultModel,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt },
        ],
        response_format: { type: 'json_object' },
        temperature: 0.7,
        max_tokens: 1024,
      },
      {
        headers: {
          Authorization: `Bearer ${this.apiKey}`,
          'Content-Type': 'application/json',
        },
        timeout: timeoutMs,
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
