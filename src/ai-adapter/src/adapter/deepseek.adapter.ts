import { Injectable, Optional } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import axios from 'axios';
import { BaseAdapter } from './base.adapter';
import { ModelInfo } from '../common/interfaces/ai-adapter.interface';
import {
  ModelType as RegistryModelType,
  PromptVariant,
} from '../prompt/registry/prompt-registry.types';
import { MoveRequestDto } from '../common/dto/move-request.dto';
import { MoveResponseDto } from '../common/dto/move-response.dto';
import { PromptBuilderService } from '../prompt/prompt-builder.service';
import { ResponseParserService } from '../common/parser/response-parser.service';
import { PromptRegistry } from '../prompt/registry/prompt-registry.service';
import {
  V2_REASONING_SYSTEM_PROMPT,
  buildV2UserPrompt,
  buildV2RetryPrompt,
} from '../prompt/v2-reasoning-prompt';

/**
 * DeepSeek 어댑터.
 * OpenAI 호환 API 를 사용하므로 openai.adapter.ts 와 구조가 유사하다.
 * 기본 모델: deepseek-v4-flash (V4-Flash, non-thinking 우선)
 *
 * 모델별 동작:
 *   - deepseek-v4-flash / deepseek-v4-pro (V4):
 *     기본: non-thinking 모드 → response_format: json_object 지원, temperature 제어 가능
 *     옵션: DEEPSEEK_V4_THINKING_MODE=true → thinking: { type: "enabled", budget_tokens: 8192 }
 *           thinking 모드 시 reasoning_content 파싱 + extractBestJson() 다단계 JSON 복구
 *
 *   - deepseek-reasoner (R1):
 *     항상 thinking 모드 → reasoning_content 파싱 + extractBestJson() + temperature=0 고정
 *     타임아웃 최소 1800초 적용
 *
 *   - deepseek-chat:
 *     표준 chat 모드 → response_format: json_object 지원, temperature 제어 가능
 *
 * Registry 가 주입되지 않은 경우 (legacy spec): V2 하드코딩 경로 유지 — 기존 테스트 호환.
 * 운영 기준: docs/02-design/42-prompt-variant-standard.md §2 표 B
 */
@Injectable()
export class DeepSeekAdapter extends BaseAdapter {
  private readonly apiKey: string;
  private readonly defaultModel: string;
  private readonly baseUrl = 'https://api.deepseek.com/v1';

  private readonly v4ThinkingMode: boolean;

  constructor(
    promptBuilder: PromptBuilderService,
    responseParser: ResponseParserService,
    private readonly configService: ConfigService,
    @Optional() promptRegistry?: PromptRegistry,
  ) {
    super(promptBuilder, responseParser, 'DeepSeekAdapter', promptRegistry);
    this.apiKey = this.configService.get<string>('DEEPSEEK_API_KEY', '');
    this.defaultModel = this.configService.get<string>(
      'DEEPSEEK_DEFAULT_MODEL',
      'deepseek-v4-flash',
    );
    this.v4ThinkingMode =
      this.configService.get<string>('DEEPSEEK_V4_THINKING_MODE', 'false') ===
      'true';
  }

  protected getRegistryModelType(): RegistryModelType {
    return this.isReasoner ? 'deepseek-reasoner' : 'deepseek';
  }

  /** reasoner 모델 여부를 판별한다 (deepseek-reasoner / R1) */
  private get isReasoner(): boolean {
    return this.defaultModel.includes('reasoner');
  }

  /**
   * V4 모델 여부를 판별한다 (deepseek-v4-flash / deepseek-v4-pro).
   * V4는 기본이 non-thinking이며, DEEPSEEK_V4_THINKING_MODE=true 로 thinking 모드 전환 가능.
   */
  private get isV4(): boolean {
    return this.defaultModel.startsWith('deepseek-v4-');
  }

  /**
   * thinking 모드로 동작하는지 판별한다.
   * - reasoner: 항상 thinking
   * - V4 + DEEPSEEK_V4_THINKING_MODE=true: thinking
   * - 그 외: non-thinking (표준 chat)
   */
  private get isThinkingMode(): boolean {
    return this.isReasoner || (this.isV4 && this.v4ThinkingMode);
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

  /**
   * DeepSeek Reasoner 와 V4 thinking 모드에서 generateMove 를 오버라이드하여
   * 전용 프롬프트와 향상된 파싱 로직을 적용한다.
   *
   * - non-thinking 모드 (V4 기본, deepseek-chat): super.generateMove() 위임
   * - thinking 모드 (reasoner 항상, V4 + DEEPSEEK_V4_THINKING_MODE=true):
   *   프롬프트 선택:
   *     - PromptRegistry 가 주입된 경우: registry.resolve('deepseek-reasoner') 로 PromptVariant 획득
   *     - 미주입 경우: V2 하드코딩 (legacy spec 호환)
   */
  async generateMove(request: MoveRequestDto): Promise<MoveResponseDto> {
    if (!this.isThinkingMode) {
      return super.generateMove(request);
    }

    const modelInfo = this.getModelInfo();
    const variant: PromptVariant | null = this.promptRegistry
      ? this.promptRegistry.resolve('deepseek-reasoner')
      : null;
    const systemPrompt = variant
      ? variant.systemPromptBuilder()
      : V2_REASONING_SYSTEM_PROMPT;
    const totalStartTime = Date.now();

    let lastErrorReason = '';

    for (let attempt = 0; attempt < request.maxRetries; attempt++) {
      if (attempt > 0) {
        const retryModeLabel = this.isReasoner
          ? 'DeepSeek-Reasoner'
          : 'DeepSeek-V4-Thinking';
        this.logger.log(
          `[${retryModeLabel}] 재시도 대기 (attempt=${attempt + 1})`,
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
          ? buildV2UserPrompt(request.gameState)
          : buildV2RetryPrompt(request.gameState, lastErrorReason, attempt);

      const modeLabel = this.isReasoner
        ? 'DeepSeek-Reasoner'
        : 'DeepSeek-V4-Thinking';
      this.logger.log(
        `[${modeLabel}] gameId=${request.gameId} attempt=${attempt + 1}/${request.maxRetries} variant=${variant?.id ?? 'v2-legacy'}`,
      );

      try {
        const llmResult = await this.callLlm(
          systemPrompt,
          userPrompt,
          request.timeoutMs,
          0, // thinking 모드는 temperature=0 고정 (API에서 무시되더라도 명시)
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
            `[${modeLabel}] 성공 action=${parseResult.response.action} latencyMs=${latencyMs}`,
          );
          return parseResult.response;
        }

        lastErrorReason = parseResult.errorReason ?? '알 수 없는 파싱 오류';
        this.logger.warn(
          `[${modeLabel}] attempt=${attempt + 1} 파싱 실패: ${lastErrorReason}`,
        );
      } catch (err) {
        lastErrorReason = (err as Error).message;
        this.logger.error(
          `[${modeLabel}] attempt=${attempt + 1} LLM 호출 오류: ${lastErrorReason}`,
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
    const thinkingMode = this.isThinkingMode;

    const body: Record<string, unknown> = {
      model: this.defaultModel,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt },
      ],
      max_tokens: thinkingMode ? 16384 : 1024,
    };

    if (thinkingMode) {
      // thinking 모드 (reasoner 항상, V4 opt-in):
      //   - temperature 파라미터를 보내지 않음 (API 호환)
      //   - response_format 미지원
      //   - V4 thinking 활성화 파라미터 (reasoner는 불필요 — 항상 thinking)
      if (this.isV4 && this.v4ThinkingMode) {
        body.thinking = { type: 'enabled' };
        body.reasoning_effort = 'high';
      }
    } else {
      // non-thinking 모드 (deepseek-chat, V4 기본, V4-Pro):
      //   - V4 API 기본값이 thinking=enabled이므로 명시적 disabled 필수
      //   - response_format: json_object 지원 → JSON 파싱 신뢰도 향상
      //   - temperature 제어 가능
      if (this.isV4) {
        body.thinking = { type: 'disabled' };
      }
      body.temperature = temperature;
      body.response_format = { type: 'json_object' };
    }

    // reasoner 전용 최소 타임아웃 1000초. V4는 응답이 빠르므로 적용하지 않는다.
    // AI_ADAPTER_TIMEOUT_SEC=1000 기준 (2026-04-27, docs/02-design/41 §3)
    const effectiveTimeout =
      this.isReasoner ? Math.max(timeoutMs, 1_000_000) : timeoutMs;

    const response = await axios.post(
      `${this.baseUrl}/chat/completions`,
      body,
      {
        headers: {
          Authorization: `Bearer ${this.apiKey}`,
          'Content-Type': 'application/json',
        },
        timeout: effectiveTimeout,
      },
    );

    const choice = response.data.choices[0];
    const usage = response.data.usage;
    const content = (choice.message.content as string) ?? '';
    const reasoningContent =
      (choice.message.reasoning_content as string) ?? '';

    if (reasoningContent) {
      this.logger.debug(
        `[DeepSeekAdapter] reasoning (${reasoningContent.length} chars): ${reasoningContent.slice(0, 300)}...`,
      );
    }

    // thinking 모드에서는 extractBestJson으로 다단계 JSON 복구
    let finalContent = content;
    if (thinkingMode) {
      finalContent = this.extractBestJson(content, reasoningContent);
    }

    return {
      content: finalContent,
      promptTokens: usage?.prompt_tokens ?? 0,
      completionTokens: usage?.completion_tokens ?? 0,
    };
  }

  /**
   * DeepSeek Reasoner의 content와 reasoning_content에서 최적의 JSON을 추출한다.
   *
   * 추출 순서:
   * 1. content에서 JSON 직접 파싱 시도
   * 2. content에서 JSON 객체 추출({...}) 시도
   * 3. reasoning_content에서 마지막 JSON 객체 추출 (최종 답변일 가능성 높음)
   * 4. 모든 실패 시 원본 content 반환 (상위 파서에서 에러 처리)
   *
   * 각 단계에서 JSON 복구(trailing comma, 코드블록 제거)를 적용한다.
   */
  extractBestJson(content: string, reasoningContent: string): string {
    // 1단계: content에서 직접 파싱 시도
    const cleanedContent = this.cleanJsonString(content);
    if (cleanedContent && this.isValidJson(cleanedContent)) {
      this.logger.log('[DeepSeek-Reasoner] content에서 JSON 직접 파싱 성공');
      return cleanedContent;
    }

    // 2단계: content에서 JSON 객체 추출 시도
    const contentJson = this.extractJsonFromText(content);
    if (contentJson) {
      this.logger.log('[DeepSeek-Reasoner] content에서 JSON 추출 성공');
      return contentJson;
    }

    // 3단계: reasoning_content에서 JSON 추출 (마지막 JSON이 최종 답변)
    if (reasoningContent) {
      const reasoningJson = this.extractLastJsonFromText(reasoningContent);
      if (reasoningJson) {
        this.logger.log(
          '[DeepSeek-Reasoner] reasoning_content에서 JSON 추출 성공',
        );
        return reasoningJson;
      }
    }

    // 4단계: 실패 시 원본 content 반환
    if (!content.trim() && reasoningContent) {
      this.logger.warn(
        '[DeepSeek-Reasoner] content 비어있고 reasoning_content에서도 JSON 추출 실패',
      );
    }
    return content;
  }

  /**
   * 텍스트에서 JSON 문자열을 정제한다.
   * - 마크다운 코드블록(```json ... ```) 제거
   * - 앞뒤 공백/텍스트 제거
   * - trailing comma 제거
   */
  private cleanJsonString(text: string): string {
    if (!text || !text.trim()) return '';

    let cleaned = text.trim();

    // 코드블록 제거
    const codeBlockMatch = cleaned.match(/```(?:json)?\s*([\s\S]*?)```/);
    if (codeBlockMatch) {
      cleaned = codeBlockMatch[1].trim();
    }

    // JSON 객체 추출
    const jsonMatch = cleaned.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      cleaned = jsonMatch[0];
    }

    // trailing comma 제거 (,} → } / ,] → ])
    cleaned = cleaned.replace(/,\s*}/g, '}').replace(/,\s*]/g, ']');

    return cleaned;
  }

  /**
   * 텍스트에서 action 필드를 포함한 JSON 객체를 추출한다.
   */
  private extractJsonFromText(text: string): string | null {
    if (!text || !text.trim()) return null;

    const cleaned = this.cleanJsonString(text);
    if (!cleaned) return null;

    // action 필드가 포함된 JSON인지 확인
    if (this.isValidJson(cleaned)) {
      try {
        const parsed = JSON.parse(cleaned);
        if (parsed.action === 'draw' || parsed.action === 'place') {
          return cleaned;
        }
      } catch {
        // pass
      }
    }

    return null;
  }

  /**
   * 텍스트에서 마지막 JSON 객체를 추출한다.
   * reasoning_content에서는 마지막 JSON이 최종 결론일 가능성이 높다.
   */
  private extractLastJsonFromText(text: string): string | null {
    if (!text || !text.trim()) return null;

    // 모든 JSON 객체 후보를 찾는다 (중첩 {...} 고려)
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

    // 뒤에서부터 유효한 JSON(action 포함)을 찾는다
    for (let i = candidates.length - 1; i >= 0; i--) {
      const cleaned = candidates[i]
        .replace(/,\s*}/g, '}')
        .replace(/,\s*]/g, ']');
      try {
        const parsed = JSON.parse(cleaned);
        if (parsed.action === 'draw' || parsed.action === 'place') {
          return cleaned;
        }
      } catch {
        // 다음 후보 시도
      }
    }

    return null;
  }

  /** JSON 파싱 가능 여부를 확인한다 */
  private isValidJson(text: string): boolean {
    try {
      JSON.parse(text);
      return true;
    } catch {
      return false;
    }
  }
}
