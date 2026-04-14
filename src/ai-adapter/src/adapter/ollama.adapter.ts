import { Injectable, Optional } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import axios from 'axios';
import { BaseAdapter } from './base.adapter';
import { ModelInfo } from '../common/interfaces/ai-adapter.interface';
import { ModelType as RegistryModelType } from '../prompt/registry/prompt-registry.types';
import { MoveRequestDto } from '../common/dto/move-request.dto';
import { MoveResponseDto } from '../common/dto/move-response.dto';
import { PromptBuilderService } from '../prompt/prompt-builder.service';
import { ResponseParserService } from '../common/parser/response-parser.service';
import { PromptRegistry } from '../prompt/registry/prompt-registry.service';

/**
 * Ollama 로컬 LLM 어댑터.
 * 로컬에서 실행되므로 API 비용이 없다.
 * 응답 속도와 품질은 하드웨어에 따라 변동된다.
 * 기본 모델: qwen2.5:3b (Qwen3 thinking 모드는 CPU 환경에서 속도 제약으로 비채택)
 *
 * 소형 모델의 JSON 오류율이 높으므로 최소 재시도 횟수를 5회로 보장한다.
 * CPU 추론 속도를 고려하여 타임아웃을 120초로 보장한다.
 * Qwen3 thinking 모드 응답(content 비고 thinking에 JSON)도 파싱 지원한다.
 */
@Injectable()
export class OllamaAdapter extends BaseAdapter {
  /** 소형 모델 JSON 오류율 대응: 최소 재시도 횟수 */
  static readonly MIN_RETRIES = 5;

  /** CPU 추론 + thinking 모드 대응: 최소 타임아웃 (ms) — 전 모델 210s 통일 */
  static readonly MIN_TIMEOUT_MS = 210_000;

  private readonly baseUrl: string;
  private readonly defaultModel: string;

  constructor(
    promptBuilder: PromptBuilderService,
    responseParser: ResponseParserService,
    private readonly configService: ConfigService,
    @Optional() promptRegistry?: PromptRegistry,
  ) {
    super(promptBuilder, responseParser, 'OllamaAdapter', promptRegistry);
    this.baseUrl = this.configService.get<string>(
      'OLLAMA_BASE_URL',
      'http://localhost:11434',
    );
    this.defaultModel = this.configService.get<string>(
      'OLLAMA_DEFAULT_MODEL',
      'gemma3:4b',
    );
  }

  protected getRegistryModelType(): RegistryModelType {
    return 'ollama';
  }

  getModelInfo(): ModelInfo {
    return {
      modelType: 'ollama',
      modelName: this.defaultModel,
      baseUrl: this.baseUrl,
    };
  }

  /**
   * 소형 모델의 JSON 오류율 및 CPU 추론 속도를 고려하여
   * maxRetries와 timeoutMs를 최소값 이상으로 보장한다.
   */
  async generateMove(request: MoveRequestDto): Promise<MoveResponseDto> {
    const adjustedRetries = Math.max(
      request.maxRetries,
      OllamaAdapter.MIN_RETRIES,
    );
    const adjustedTimeout = Math.max(
      request.timeoutMs,
      OllamaAdapter.MIN_TIMEOUT_MS,
    );
    const adjustedRequest: MoveRequestDto = {
      ...request,
      maxRetries: adjustedRetries,
      timeoutMs: adjustedTimeout,
    };

    if (
      request.maxRetries < OllamaAdapter.MIN_RETRIES ||
      request.timeoutMs < OllamaAdapter.MIN_TIMEOUT_MS
    ) {
      this.logger.log(
        `[OllamaAdapter] maxRetries ${request.maxRetries} → ${adjustedRetries}, timeout ${request.timeoutMs} → ${adjustedTimeout} (로컬 모델 대응)`,
      );
    }

    return super.generateMove(adjustedRequest);
  }

  async healthCheck(): Promise<boolean> {
    try {
      const response = await axios.get(`${this.baseUrl}/api/tags`, {
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
    // Ollama Chat API (OpenAI 호환 엔드포인트 사용)
    const response = await axios.post(
      `${this.baseUrl}/api/chat`,
      {
        model: this.defaultModel,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt },
        ],
        // JSON 형식 강제
        format: 'json',
        stream: false,
        options: {
          temperature: Math.min(temperature, 0.7),
          num_predict: 4096,
          stop: ['```'],
        },
      },
      {
        timeout: timeoutMs,
      },
    );

    const content = (response.data.message?.content as string) ?? '';
    const thinking = (response.data.message?.thinking as string) ?? '';

    // Qwen3 등 thinking 모드 모델: content가 비고 thinking에 추론이 들어오는 경우 처리
    let finalContent = content;
    if (!content.trim() && thinking) {
      // thinking에서 JSON 추출 시도 ({...} 패턴 매칭)
      const jsonMatch = thinking.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        finalContent = jsonMatch[0];
        this.logger.log(`[OllamaAdapter] thinking에서 JSON 추출 성공`);
      } else {
        this.logger.warn(
          `[OllamaAdapter] content 비어있고 thinking에서도 JSON 없음`,
        );
      }
    }
    if (thinking) {
      this.logger.debug(
        `[OllamaAdapter] thinking: ${thinking.slice(0, 200)}...`,
      );
    }

    // Ollama는 토큰 사용량을 다른 형태로 제공한다
    const promptEvalCount = response.data.prompt_eval_count ?? 0;
    const evalCount = response.data.eval_count ?? 0;

    return {
      content: finalContent,
      promptTokens: promptEvalCount,
      completionTokens: evalCount,
    };
  }
}
