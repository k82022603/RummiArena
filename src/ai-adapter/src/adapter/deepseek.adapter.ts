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
 *
 * deepseek-reasoner 사용 시 reasoning_content 필드 파싱도 지원한다.
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
    temperature: number,
  ): Promise<{
    content: string;
    promptTokens: number;
    completionTokens: number;
  }> {
    const isReasoner = this.defaultModel.includes('reasoner');

    // deepseek-reasoner는 response_format: json_object를 지원하지 않는다
    const body: Record<string, unknown> = {
      model: this.defaultModel,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt },
      ],
      temperature,
      max_tokens: isReasoner ? 8192 : 1024,
    };
    if (!isReasoner) {
      body.response_format = { type: 'json_object' };
    }

    const response = await axios.post(
      `${this.baseUrl}/chat/completions`,
      body,
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
    const content = (choice.message.content as string) ?? '';
    const reasoningContent =
      (choice.message.reasoning_content as string) ?? '';

    // reasoner 모드: content가 비면 reasoning_content에서 JSON 추출
    let finalContent = content;
    if (!content.trim() && reasoningContent) {
      const jsonMatch = reasoningContent.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        finalContent = jsonMatch[0];
        this.logger.log(
          '[DeepSeekAdapter] reasoning_content에서 JSON 추출 성공',
        );
      } else {
        this.logger.warn(
          '[DeepSeekAdapter] content 비어있고 reasoning_content에서도 JSON 없음',
        );
      }
    }
    if (reasoningContent) {
      this.logger.debug(
        `[DeepSeekAdapter] reasoning: ${reasoningContent.slice(0, 200)}...`,
      );
    }

    return {
      content: finalContent,
      promptTokens: usage?.prompt_tokens ?? 0,
      completionTokens: usage?.completion_tokens ?? 0,
    };
  }
}
