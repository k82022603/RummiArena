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
 * DeepSeek Reasoner 전용 간결한 시스템 프롬프트.
 *
 * DeepSeek Reasoner의 place rate 개선을 위해 다음을 적용한다:
 * 1. 영어 중심 + 핵심 규칙만 포함 (토큰 절약, 규칙 이해도 향상)
 * 2. 단계별 사고 절차를 명시 (reasoning 모델에 최적화)
 * 3. JSON 형식을 극도로 단순화하여 파싱 실패율 감소
 * 4. 그룹/런 규칙을 테이블 형태로 제시 (구조적 이해 용이)
 */
const DEEPSEEK_REASONER_SYSTEM_PROMPT = `You are a Rummikub game AI. Respond with ONLY a valid JSON object.

# Tile Encoding
Format: {Color}{Number}{Set}
Colors: R(Red), B(Blue), Y(Yellow), K(Black)
Numbers: 1-13, Set: a or b
Jokers: JK1, JK2
Example: R7a = Red 7 set-a, B13b = Blue 13 set-b

# Rules (STRICT - violations are rejected by Game Engine)

## Group: Same number, DIFFERENT colors, 3-4 tiles
VALID: [R7a, B7a, K7a] -- number=7, colors=R,B,K (all different)
VALID: [R5a, B5b, Y5a, K5a] -- number=5, 4 different colors
INVALID: [R7a, R7b, B7a] -- color R appears TWICE -> ERR_GROUP_COLOR_DUP
INVALID: [R7a, B5a, K7a] -- numbers differ (7,5,7) -> ERR_GROUP_NUMBER

## Run: Same color, CONSECUTIVE numbers, 3+ tiles
VALID: [R7a, R8a, R9a] -- color=R, numbers=7,8,9 consecutive
VALID: [B10a, B11a, B12a, B13a] -- color=B, 10-11-12-13
INVALID: [R7a, B8a, K9a] -- different colors -> NOT a run
INVALID: [R7a, R9a, R10a] -- gap at 8 -> NOT consecutive
INVALID: [R12a, R13a, R1a] -- NO wraparound (13->1 forbidden)

## Size: Every group/run must have >= 3 tiles. 2 tiles = INVALID.

## Initial Meld (initialMeldDone=false):
- Sum of tile numbers in placed groups/runs must be >= 30 points
- Use ONLY rack tiles (cannot touch table tiles)
- Each tile's number = its point value (R10a = 10 points)

## tableGroups = COMPLETE final table state after your move
- Include ALL existing groups (unchanged ones too!)
- Add your new groups
- Missing existing groups = "tile loss" -> REJECTED

## tilesFromRack = tiles YOU placed from YOUR rack (not existing table tiles)

# Step-by-Step Thinking Procedure
1. List all tiles in my rack
2. Find ALL possible groups (same number, different colors, 3-4 tiles)
3. Find ALL possible runs (same color, consecutive numbers, 3+ tiles)
4. If initialMeldDone=false: filter to combinations with sum >= 30
5. If initialMeldDone=true and table has groups: check if I can extend existing groups/runs
6. Pick the combination that places the MOST tiles from my rack
7. If no valid combination exists: choose "draw"
8. Build the JSON response with ALL table groups (existing + new)

# Response Format (output ONLY this JSON, nothing else)

Draw:
{"action":"draw","reasoning":"reason"}

Place:
{"action":"place","tableGroups":[{"tiles":["R10a","R11a","R12a"]}],"tilesFromRack":["R10a","R11a","R12a"],"reasoning":"reason"}

IMPORTANT: Output raw JSON only. No markdown, no code blocks, no explanation text.`;

/**
 * DeepSeek 어댑터.
 * OpenAI 호환 API를 사용하므로 openai.adapter.ts와 구조가 유사하다.
 * 기본 모델: deepseek-chat (비용 효율적)
 *
 * deepseek-reasoner 사용 시:
 * - 전용 간결 프롬프트(DEEPSEEK_REASONER_SYSTEM_PROMPT) 사용
 * - reasoning_content 필드 파싱 지원
 * - JSON 복구 로직(trailing comma, 코드블록 제거 등) 적용
 * - temperature=0 고정 (추론 모델은 낮은 온도가 유리)
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

  /** reasoner 모델 여부를 판별한다 */
  private get isReasoner(): boolean {
    return this.defaultModel.includes('reasoner');
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
   * DeepSeek Reasoner는 generateMove를 오버라이드하여
   * 전용 프롬프트와 향상된 파싱 로직을 적용한다.
   */
  async generateMove(request: MoveRequestDto): Promise<MoveResponseDto> {
    if (!this.isReasoner) {
      return super.generateMove(request);
    }

    // Reasoner 전용 로직: 간결 프롬프트 + 향상된 JSON 추출
    const modelInfo = this.getModelInfo();
    const systemPrompt = DEEPSEEK_REASONER_SYSTEM_PROMPT;
    const totalStartTime = Date.now();

    let lastErrorReason = '';

    for (let attempt = 0; attempt < request.maxRetries; attempt++) {
      const attemptStartTime = Date.now();

      // Reasoner 전용 유저 프롬프트 (영어 기반, 간결)
      const userPrompt =
        attempt === 0
          ? this.buildReasonerUserPrompt(request)
          : this.buildReasonerRetryPrompt(request, lastErrorReason, attempt);

      this.logger.log(
        `[DeepSeek-Reasoner] gameId=${request.gameId} attempt=${attempt + 1}/${request.maxRetries}`,
      );

      try {
        const llmResult = await this.callLlm(
          systemPrompt,
          userPrompt,
          request.timeoutMs,
          0, // reasoner는 temperature=0 고정
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
            `[DeepSeek-Reasoner] 성공 action=${parseResult.response.action} latencyMs=${latencyMs}`,
          );
          return parseResult.response;
        }

        lastErrorReason = parseResult.errorReason ?? '알 수 없는 파싱 오류';
        this.logger.warn(
          `[DeepSeek-Reasoner] attempt=${attempt + 1} 파싱 실패: ${lastErrorReason}`,
        );
      } catch (err) {
        lastErrorReason = (err as Error).message;
        this.logger.error(
          `[DeepSeek-Reasoner] attempt=${attempt + 1} LLM 호출 오류: ${lastErrorReason}`,
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

  /**
   * DeepSeek Reasoner 전용 유저 프롬프트.
   * 영어 기반으로 간결하게 게임 상태만 전달한다.
   */
  private buildReasonerUserPrompt(request: MoveRequestDto): string {
    const { gameState } = request;
    const lines: string[] = [];

    // 테이블 상태
    lines.push('# Current Table');
    if (gameState.tableGroups.length === 0) {
      lines.push('(empty table)');
    } else {
      gameState.tableGroups.forEach((group, idx) => {
        lines.push(`Group${idx + 1}: [${group.tiles.join(', ')}]`);
      });
      lines.push(
        `(${gameState.tableGroups.length} groups total -- you MUST include ALL of them in tableGroups)`,
      );
    }

    // 내 타일
    lines.push('');
    lines.push('# My Rack Tiles');
    lines.push(
      `[${gameState.myTiles.join(', ')}] (${gameState.myTiles.length} tiles)`,
    );

    // 게임 상태
    lines.push('');
    lines.push('# Game Status');
    lines.push(`Turn: ${gameState.turnNumber}`);
    lines.push(`Draw pile: ${gameState.drawPileCount} tiles remaining`);

    if (!gameState.initialMeldDone) {
      lines.push(
        'Initial Meld: NOT DONE -- you need sum >= 30 points to place',
      );
      lines.push('You can ONLY use your rack tiles (no table tiles)');
      lines.push('Calculate: sum of tile numbers must be >= 30');
    } else {
      lines.push('Initial Meld: DONE (no point restriction)');
      lines.push('You can extend or rearrange existing table groups');
    }

    // 상대 정보 (간략하게)
    if (gameState.opponents.length > 0) {
      lines.push('');
      lines.push('# Opponents');
      gameState.opponents.forEach((opp) => {
        const warn =
          opp.remainingTiles <= 3 ? ' WARNING: close to winning!' : '';
        lines.push(`${opp.playerId}: ${opp.remainingTiles} tiles${warn}`);
      });
    }

    // 명확한 지시
    lines.push('');
    lines.push('# Your Task');
    lines.push('Analyze my rack tiles and find valid groups/runs to place.');
    lines.push('If you can place tiles, respond with action="place".');
    lines.push('If no valid combination exists, respond with action="draw".');
    lines.push('');
    lines.push('Respond with ONLY the JSON object. No other text.');

    return lines.join('\n');
  }

  /**
   * Reasoner 전용 재시도 프롬프트.
   */
  private buildReasonerRetryPrompt(
    request: MoveRequestDto,
    errorReason: string,
    attemptNumber: number,
  ): string {
    const basePrompt = this.buildReasonerUserPrompt(request);
    return (
      basePrompt +
      `\n\n# RETRY (attempt ${attemptNumber + 1})\n` +
      `Your previous response was INVALID: ${errorReason}\n` +
      `Please fix and respond with valid JSON only.\n` +
      `If unsure, just respond: {"action":"draw","reasoning":"no valid combination"}`
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
    const isReasoner = this.isReasoner;

    // deepseek-reasoner는 response_format: json_object를 지원하지 않는다
    const body: Record<string, unknown> = {
      model: this.defaultModel,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt },
      ],
      max_tokens: isReasoner ? 8192 : 1024,
    };

    if (isReasoner) {
      // reasoner: temperature 파라미터 자체를 보내지 않음 (API 호환)
    } else {
      body.temperature = temperature;
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
        timeout: isReasoner ? Math.max(timeoutMs, 150_000) : timeoutMs,
      },
    );

    const choice = response.data.choices[0];
    const usage = response.data.usage;
    const content = (choice.message.content as string) ?? '';
    const reasoningContent = (choice.message.reasoning_content as string) ?? '';

    if (reasoningContent) {
      this.logger.debug(
        `[DeepSeekAdapter] reasoning (${reasoningContent.length} chars): ${reasoningContent.slice(0, 300)}...`,
      );
    }

    // 향상된 JSON 추출 전략 (reasoner 전용)
    let finalContent = content;
    if (isReasoner) {
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
