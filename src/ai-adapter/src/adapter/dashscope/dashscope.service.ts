import { Injectable, Optional } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import axios, { AxiosError } from 'axios';
import { BaseAdapter } from '../base.adapter';
import { ModelInfo } from '../../common/interfaces/ai-adapter.interface';
import {
  ModelType as RegistryModelType,
  PromptVariant,
} from '../../prompt/registry/prompt-registry.types';
import { MoveRequestDto } from '../../common/dto/move-request.dto';
import { MoveResponseDto } from '../../common/dto/move-response.dto';
import { PromptBuilderService } from '../../prompt/prompt-builder.service';
import { ResponseParserService } from '../../common/parser/response-parser.service';
import { PromptRegistry } from '../../prompt/registry/prompt-registry.service';
import {
  DASHSCOPE_BASE_URL,
  DASHSCOPE_DEFAULT_MODEL,
  DashScopeChatRequest,
  DashScopeChatResponse,
  DashScopeErrorKind,
  isThinkingOnlyModel,
} from './dashscope.types';
import {
  buildDashScopeSystemPrompt,
  buildDashScopeUserPrompt,
  buildDashScopeRetryPrompt,
} from './prompt-builder';

/**
 * DashScope (Alibaba Cloud Model Studio) 어댑터.
 *
 * OpenAI 호환 엔드포인트(`/compatible-mode/v1/chat/completions`)를 사용하며
 * Qwen3 thinking-only 모델(qwen3-235b-a22b-thinking-2507 등)을 기본으로 지원한다.
 *
 * 특징:
 *   - `enable_thinking=true` + `thinking_budget` 확장 필드 (DashScope 고유)
 *   - `reasoning_content` 응답 필드 파싱 (DeepSeek Reasoner 와 동일 패턴)
 *   - 429 에러를 QPS/QPM 초과(재시도 가능)와 quota 초과(즉시 fallback)로 구분
 *   - thinking-only 모델은 timeoutMs 와 무관하게 최소 600초 타임아웃 적용
 *
 * 설계 문서: docs/02-design/34-dashscope-qwen3-adapter-design.md
 * API 키: Sprint 7 에 발급 예정. 현재는 mock 기반 테스트만 통과.
 */
@Injectable()
export class DashScopeAdapter extends BaseAdapter {
  private readonly apiKey: string;
  private readonly defaultModel: string;
  private readonly baseUrl: string;
  private readonly thinkingBudget: number;
  /** thinking-only 모델 호출 시 최소 타임아웃(ms). 설계 §16 권장 600s */
  private readonly minReasonerTimeoutMs = 600_000;

  constructor(
    promptBuilder: PromptBuilderService,
    responseParser: ResponseParserService,
    private readonly configService: ConfigService,
    @Optional() promptRegistry?: PromptRegistry,
  ) {
    super(promptBuilder, responseParser, 'DashScopeAdapter', promptRegistry);
    this.apiKey = this.configService.get<string>('DASHSCOPE_API_KEY', '');
    this.defaultModel = this.configService.get<string>(
      'DASHSCOPE_DEFAULT_MODEL',
      DASHSCOPE_DEFAULT_MODEL,
    );
    this.baseUrl = this.configService.get<string>(
      'DASHSCOPE_BASE_URL',
      DASHSCOPE_BASE_URL,
    );
    this.thinkingBudget = Number(
      this.configService.get<string>('DASHSCOPE_THINKING_BUDGET', '15000'),
    );
  }

  private get isThinkingOnly(): boolean {
    return isThinkingOnlyModel(this.defaultModel);
  }

  protected getRegistryModelType(): RegistryModelType {
    return 'dashscope';
  }

  getModelInfo(): ModelInfo {
    return {
      modelType: 'dashscope',
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
   * thinking-only 모델은 DeepSeek Reasoner 와 동일하게 generateMove 를 오버라이드하여
   * V3 reasoning 프롬프트 + reasoning_content 파싱 + quota-429 즉시 fallback 경로를 사용한다.
   * hybrid 모델(qwen-plus 등)은 BaseAdapter 의 기본 경로를 그대로 따른다.
   */
  async generateMove(request: MoveRequestDto): Promise<MoveResponseDto> {
    if (!this.isThinkingOnly) {
      return super.generateMove(request);
    }

    const modelInfo = this.getModelInfo();
    const variant: PromptVariant | null = this.promptRegistry
      ? this.promptRegistry.resolve('dashscope')
      : null;
    const systemPrompt = variant
      ? variant.systemPromptBuilder()
      : buildDashScopeSystemPrompt();
    const totalStartTime = Date.now();

    let lastErrorReason = '';

    for (let attempt = 0; attempt < request.maxRetries; attempt++) {
      if (attempt > 0) {
        this.logger.log(
          `[DashScope-Thinking] 재시도 대기 (attempt=${attempt + 1})`,
        );
        await this.backoff(attempt);
      }

      const attemptStartTime = Date.now();

      const userPrompt = variant
        ? attempt === 0
          ? variant.userPromptBuilder(request.gameState)
          : variant.retryPromptBuilder(
              request.gameState,
              lastErrorReason,
              attempt,
            )
        : attempt === 0
          ? buildDashScopeUserPrompt(request.gameState)
          : buildDashScopeRetryPrompt(
              request.gameState,
              lastErrorReason,
              attempt,
            );

      this.logger.log(
        `[DashScope-Thinking] gameId=${request.gameId} attempt=${attempt + 1}/${request.maxRetries} model=${this.defaultModel} variant=${variant?.id ?? 'v3-legacy'}`,
      );

      try {
        const llmResult = await this.callLlm(
          systemPrompt,
          userPrompt,
          request.timeoutMs,
          0, // thinking-only 모델은 온도 영향 없음, 0 고정
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
            `[DashScope-Thinking] 성공 action=${parseResult.response.action} latencyMs=${latencyMs}`,
          );
          return parseResult.response;
        }

        lastErrorReason = parseResult.errorReason ?? '알 수 없는 파싱 오류';
        this.logger.warn(
          `[DashScope-Thinking] attempt=${attempt + 1} 파싱 실패: ${lastErrorReason}`,
        );
      } catch (err) {
        const kind = this.classifyError(err);
        lastErrorReason = (err as Error).message;
        this.logger.error(
          `[DashScope-Thinking] attempt=${attempt + 1} LLM 호출 오류(${kind}): ${lastErrorReason}`,
        );

        // quota 초과는 재시도해도 소용 없으므로 즉시 fallback
        if (kind === 'quota_exceeded') {
          this.logger.warn(
            `[DashScope-Thinking] quota 초과 감지 → 재시도 중단, fallback draw`,
          );
          break;
        }
      }
    }

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
    const thinkingOnly = this.isThinkingOnly;

    const body: DashScopeChatRequest = {
      model: this.defaultModel,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt },
      ],
      max_tokens: thinkingOnly ? 16384 : 1024,
      enable_thinking: true,
      thinking_budget: this.thinkingBudget,
    };

    if (!thinkingOnly) {
      // hybrid 모델만 temperature + JSON 모드를 안전하게 사용할 수 있다
      body.temperature = temperature;
      body.response_format = { type: 'json_object' };
    }

    const response = await axios.post<DashScopeChatResponse>(
      `${this.baseUrl}/chat/completions`,
      body,
      {
        headers: {
          Authorization: `Bearer ${this.apiKey}`,
          'Content-Type': 'application/json',
        },
        timeout: thinkingOnly
          ? Math.max(timeoutMs, this.minReasonerTimeoutMs)
          : timeoutMs,
      },
    );

    const choice = response.data.choices?.[0];
    if (!choice) {
      throw new Error('DashScope 응답에 choices 가 비어있습니다');
    }

    const usage = response.data.usage;
    const content = (choice.message.content ?? '') as string;
    const reasoningContent = (choice.message.reasoning_content ?? '') as string;

    if (reasoningContent) {
      this.logger.debug(
        `[DashScopeAdapter] reasoning (${reasoningContent.length} chars): ${reasoningContent.slice(0, 300)}...`,
      );
    }

    let finalContent = content;
    if (thinkingOnly) {
      finalContent = this.extractBestJson(content, reasoningContent);
    }

    return {
      content: finalContent,
      promptTokens: usage?.prompt_tokens ?? 0,
      completionTokens: usage?.completion_tokens ?? 0,
    };
  }

  /**
   * DashScope 에러를 카테고리로 분류한다.
   * 429 는 응답 본문의 error.code/message 에서 QPS 초과(재시도 가능) vs quota(재시도 불가) 를 구분한다.
   */
  classifyError(err: unknown): DashScopeErrorKind {
    if (!err) return 'unknown';

    const axiosErr = err as AxiosError<{
      error?: { code?: string; message?: string };
    }>;

    if (axiosErr.code === 'ECONNABORTED' || axiosErr.code === 'ETIMEDOUT') {
      return 'timeout';
    }

    const status = axiosErr.response?.status;
    if (status === 401) return 'auth';
    if (status === 429) {
      const payload = axiosErr.response?.data?.error;
      const text =
        `${payload?.code ?? ''} ${payload?.message ?? ''}`.toLowerCase();
      if (text.includes('quota') || text.includes('exceeded your current')) {
        return 'quota_exceeded';
      }
      return 'rate_limit_qps';
    }
    if (status === 500) return 'server_error';
    if (status === 503) return 'overloaded';

    return 'unknown';
  }

  /**
   * thinking 모델의 content + reasoning_content 에서 최적의 JSON 을 추출한다.
   * DeepSeek Reasoner 어댑터의 동일 로직과 완전히 동일한 전략 순서를 따른다.
   *
   *   1. content 직접 파싱
   *   2. content 에서 JSON 객체 추출
   *   3. reasoning_content 의 마지막 JSON (최종 결론)
   *   4. 실패 시 원본 content 반환 (상위 파서가 에러 처리)
   */
  extractBestJson(content: string, reasoningContent: string): string {
    const cleanedContent = this.cleanJsonString(content);
    if (cleanedContent && this.isValidJson(cleanedContent)) {
      return cleanedContent;
    }

    const contentJson = this.extractJsonFromText(content);
    if (contentJson) return contentJson;

    if (reasoningContent) {
      const reasoningJson = this.extractLastJsonFromText(reasoningContent);
      if (reasoningJson) return reasoningJson;
    }

    return content;
  }

  private cleanJsonString(text: string): string {
    if (!text || !text.trim()) return '';
    let cleaned = text.trim();

    const codeBlockMatch = cleaned.match(/```(?:json)?\s*([\s\S]*?)```/);
    if (codeBlockMatch) cleaned = codeBlockMatch[1].trim();

    const jsonMatch = cleaned.match(/\{[\s\S]*\}/);
    if (jsonMatch) cleaned = jsonMatch[0];

    cleaned = cleaned.replace(/,\s*}/g, '}').replace(/,\s*]/g, ']');
    return cleaned;
  }

  private extractJsonFromText(text: string): string | null {
    if (!text || !text.trim()) return null;
    const cleaned = this.cleanJsonString(text);
    if (!cleaned || !this.isValidJson(cleaned)) return null;
    try {
      const parsed = JSON.parse(cleaned);
      if (parsed.action === 'draw' || parsed.action === 'place') return cleaned;
    } catch {
      return null;
    }
    return null;
  }

  private extractLastJsonFromText(text: string): string | null {
    if (!text || !text.trim()) return null;

    const candidates: string[] = [];
    let depth = 0;
    let start = -1;
    for (let i = 0; i < text.length; i++) {
      if (text[i] === '{') {
        if (depth === 0) start = i;
        depth++;
      } else if (text[i] === '}') {
        depth--;
        if (depth === 0 && start >= 0) {
          candidates.push(text.slice(start, i + 1));
          start = -1;
        }
      }
    }

    for (let i = candidates.length - 1; i >= 0; i--) {
      const cleaned = candidates[i]
        .replace(/,\s*}/g, '}')
        .replace(/,\s*]/g, ']');
      try {
        const parsed = JSON.parse(cleaned);
        if (parsed.action === 'draw' || parsed.action === 'place')
          return cleaned;
      } catch {
        continue;
      }
    }
    return null;
  }

  private isValidJson(text: string): boolean {
    try {
      JSON.parse(text);
      return true;
    } catch {
      return false;
    }
  }
}
