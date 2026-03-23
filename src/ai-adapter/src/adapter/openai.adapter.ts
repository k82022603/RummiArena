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
 * 기본 모델: gpt-4o-mini (비용 절약). OPENAI_DEFAULT_MODEL 환경변수로 변경 가능.
 */
@Injectable()
export class OpenAiAdapter extends BaseAdapter {
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
      'gpt-4o-mini',
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
    const response = await axios.post(
      `${this.baseUrl}/chat/completions`,
      {
        model: this.defaultModel,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt },
        ],
        // JSON mode: 반드시 JSON 형식으로 응답
        response_format: { type: 'json_object' },
        temperature,
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
