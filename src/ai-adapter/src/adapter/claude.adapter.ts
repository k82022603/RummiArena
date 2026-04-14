import { Injectable, Optional } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import axios from 'axios';
import { BaseAdapter } from './base.adapter';
import { ModelInfo } from '../common/interfaces/ai-adapter.interface';
import { ModelType as RegistryModelType } from '../prompt/registry/prompt-registry.types';
import { PromptBuilderService } from '../prompt/prompt-builder.service';
import { ResponseParserService } from '../common/parser/response-parser.service';
import { PromptRegistry } from '../prompt/registry/prompt-registry.service';

/**
 * Anthropic Claude 어댑터.
 * Messages API 를 사용하며, 긴 컨텍스트(게임 히스토리) 를 효과적으로 활용한다.
 * 기본 모델: claude-sonnet-4-20250514 (expert)
 *
 * 프롬프트 선택은 PromptRegistry 가 담당 (39번 §4). 환경변수 CLAUDE_PROMPT_VARIANT 또는
 * PROMPT_VARIANT 로 변형 전환 가능. 미설정 시 default-recommendation 'v2' 사용.
 *
 * Extended thinking 은 본 어댑터의 callLlm() 자체 책임 (CLAUDE_EXTENDED_THINKING 환경변수).
 */
@Injectable()
export class ClaudeAdapter extends BaseAdapter {
  private readonly apiKey: string;
  private readonly defaultModel: string;
  private readonly baseUrl = 'https://api.anthropic.com/v1';
  private readonly anthropicVersion = '2023-06-01';

  constructor(
    promptBuilder: PromptBuilderService,
    responseParser: ResponseParserService,
    private readonly configService: ConfigService,
    @Optional() promptRegistry?: PromptRegistry,
  ) {
    super(promptBuilder, responseParser, 'ClaudeAdapter', promptRegistry);
    this.apiKey = this.configService.get<string>('CLAUDE_API_KEY', '');
    this.defaultModel = this.configService.get<string>(
      'CLAUDE_DEFAULT_MODEL',
      'claude-sonnet-4-20250514',
    );
  }

  protected getRegistryModelType(): RegistryModelType {
    return 'claude';
  }

  getModelInfo(): ModelInfo {
    return {
      modelType: 'claude',
      modelName: this.defaultModel,
      baseUrl: this.baseUrl,
    };
  }

  async healthCheck(): Promise<boolean> {
    try {
      // Claude API는 별도 health 엔드포인트가 없으므로 최소 요청으로 확인
      const response = await axios.post(
        `${this.baseUrl}/messages`,
        {
          model: this.defaultModel,
          max_tokens: 10,
          messages: [{ role: 'user', content: 'ping' }],
        },
        {
          headers: {
            'x-api-key': this.apiKey,
            'anthropic-version': this.anthropicVersion,
            'Content-Type': 'application/json',
          },
          timeout: 5000,
        },
      );
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
    const useThinking =
      this.configService.get<string>('CLAUDE_EXTENDED_THINKING', 'true') ===
      'true';

    const body: Record<string, unknown> = {
      model: this.defaultModel,
      system: systemPrompt,
      messages: [{ role: 'user', content: userPrompt }],
    };

    if (useThinking) {
      // Extended thinking: temperature 설정 불가, budget_tokens로 사고량 제어
      body.max_tokens = 16000;
      body.thinking = { type: 'enabled', budget_tokens: 10000 };
    } else {
      body.max_tokens = 1024;
      body.temperature = temperature;
    }

    const response = await axios.post(`${this.baseUrl}/messages`, body, {
      headers: {
        'x-api-key': this.apiKey,
        'anthropic-version': this.anthropicVersion,
        'Content-Type': 'application/json',
      },
      timeout: useThinking ? Math.max(timeoutMs, 210_000) : timeoutMs,
    });

    // Extended thinking 응답: [{type:"thinking",...},{type:"text",...}]
    const contentBlocks = response.data.content as Array<{
      type: string;
      text?: string;
      thinking?: string;
    }>;
    const textBlock = contentBlocks.find((b) => b.type === 'text');
    const thinkingBlock = contentBlocks.find((b) => b.type === 'thinking');
    const content = textBlock?.text ?? '';

    if (thinkingBlock?.thinking) {
      this.logger.debug(
        `[ClaudeAdapter] thinking: ${thinkingBlock.thinking.slice(0, 200)}...`,
      );
    }

    const usage = response.data.usage;

    return {
      content,
      promptTokens: usage?.input_tokens ?? 0,
      completionTokens: usage?.output_tokens ?? 0,
    };
  }
}
