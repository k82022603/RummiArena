import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import axios from 'axios';
import { BaseAdapter } from './base.adapter';
import { ModelInfo } from '../common/interfaces/ai-adapter.interface';
import { MoveRequestDto } from '../common/dto/move-request.dto';
import { MoveResponseDto } from '../common/dto/move-response.dto';
import { PromptBuilderService } from '../prompt/prompt-builder.service';
import { ResponseParserService } from '../common/parser/response-parser.service';

/**
 * Ollama 로컬 LLM 어댑터.
 * 로컬에서 실행되므로 API 비용이 없다.
 * 응답 속도와 품질은 하드웨어에 따라 변동된다.
 * 기본 모델: gemma3:1b (변경 가능)
 *
 * 소형 모델의 JSON 오류율이 높으므로 최소 재시도 횟수를 5회로 보장한다.
 */
@Injectable()
export class OllamaAdapter extends BaseAdapter {
  /** 4B 소형 모델 JSON 오류율 대응: 최소 재시도 횟수 (MoveRequest.maxRetries < 이 값이면 override) */
  static readonly MIN_RETRIES = 5;

  private readonly baseUrl: string;
  private readonly defaultModel: string;

  constructor(
    promptBuilder: PromptBuilderService,
    responseParser: ResponseParserService,
    private readonly configService: ConfigService,
  ) {
    super(promptBuilder, responseParser, 'OllamaAdapter');
    this.baseUrl = this.configService.get<string>(
      'OLLAMA_BASE_URL',
      'http://localhost:11434',
    );
    this.defaultModel = this.configService.get<string>(
      'OLLAMA_DEFAULT_MODEL',
      'gemma3:4b',
    );
  }

  getModelInfo(): ModelInfo {
    return {
      modelType: 'ollama',
      modelName: this.defaultModel,
      baseUrl: this.baseUrl,
    };
  }

  /**
   * 4B 소형 모델의 JSON 오류율 대응을 위해 maxRetries를 MIN_RETRIES(5) 이상으로 보장한다.
   * 요청자가 더 높은 값을 지정한 경우에는 그대로 사용한다.
   */
  async generateMove(request: MoveRequestDto): Promise<MoveResponseDto> {
    const adjustedRequest: MoveRequestDto =
      request.maxRetries < OllamaAdapter.MIN_RETRIES
        ? { ...request, maxRetries: OllamaAdapter.MIN_RETRIES }
        : request;

    if (request.maxRetries < OllamaAdapter.MIN_RETRIES) {
      this.logger.log(
        `[OllamaAdapter] maxRetries ${request.maxRetries} → ${OllamaAdapter.MIN_RETRIES} (4B 모델 JSON 오류율 대응)`,
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
          num_predict: 512,
          stop: ['```'],
        },
      },
      {
        timeout: timeoutMs,
      },
    );

    const content = (response.data.message?.content as string) ?? '';
    // Ollama는 토큰 사용량을 다른 형태로 제공한다
    const promptEvalCount = response.data.prompt_eval_count ?? 0;
    const evalCount = response.data.eval_count ?? 0;

    return {
      content,
      promptTokens: promptEvalCount,
      completionTokens: evalCount,
    };
  }
}
