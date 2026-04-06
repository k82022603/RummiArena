import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import axios from 'axios';
import { BaseAdapter } from './base.adapter';
import { ModelInfo } from '../common/interfaces/ai-adapter.interface';
import { MoveRequestDto } from '../common/dto/move-request.dto';
import { MoveResponseDto } from '../common/dto/move-response.dto';
import { PromptBuilderService } from '../prompt/prompt-builder.service';
import { ResponseParserService } from '../common/parser/response-parser.service';
import { V2_REASONING_SYSTEM_PROMPT } from '../prompt/v2-reasoning-prompt';

/**
 * DeepSeek Reasoner 전용 간결한 시스템 프롬프트.
 *
 * DeepSeek Reasoner의 place rate 개선을 위해 다음을 적용한다:
 * 1. 영어 중심 + 핵심 규칙만 포함 (토큰 절약, 규칙 이해도 향상)
 * 2. 단계별 사고 절차를 명시 (reasoning 모델에 최적화)
 * 3. JSON 형식을 극도로 단순화하여 파싱 실패율 감소
 * 4. 그룹/런 규칙을 테이블 형태로 제시 (구조적 이해 용이)
 */
/**
 * DeepSeek Reasoner 전용 시스템 프롬프트.
 *
 * Round 3 분석 결과(55% 무효 배치) 기반 최적화:
 * 1. 타일 인코딩 규칙을 테이블 형태로 명확화 (파싱 실수 방지)
 * 2. few-shot 예시를 VALID/INVALID 쌍으로 강화 (패턴 학습 효과)
 * 3. 자기 검증 체크리스트 추가 ("submit 전 반드시 확인")
 * 4. 단계별 사고 절차를 더 상세히 분해 (추론 모델 최적화)
 * 5. 영어 중심 + 핵심 규칙만 포함 (토큰 절약, 규칙 이해도 향상)
 */
const DEEPSEEK_REASONER_SYSTEM_PROMPT = `You are a Rummikub game AI. Respond with ONLY a valid JSON object.

# Tile Encoding (CRITICAL - understand this perfectly)
Each tile code follows the pattern: {Color}{Number}{Set}

| Component | Values                          | Meaning                            |
|-----------|----------------------------------|-------------------------------------|
| Color     | R, B, Y, K                       | Red, Blue, Yellow, Black            |
| Number    | 1, 2, 3, ..., 13                 | Face value (also = point value)     |
| Set       | a, b                             | Distinguishes duplicate tiles       |
| Jokers    | JK1, JK2                         | Wild cards (2 total)                |

Examples: R7a = Red 7 (set a), B13b = Blue 13 (set b), K1a = Black 1 (set a)
Total tiles: 4 colors x 13 numbers x 2 sets + 2 jokers = 106 tiles

# Rules (STRICT - Game Engine rejects ALL violations)

## GROUP Rules: Same number, DIFFERENT colors, 3-4 tiles
- Every tile in a group MUST have the SAME number
- Every tile in a group MUST have a DIFFERENT color (R, B, Y, K)
- No color can appear twice in a group

VALID GROUP examples:
  [R7a, B7a, K7a]           -> number=7 for all, colors=R,B,K (3 different) OK
  [R5a, B5b, Y5a, K5a]      -> number=5 for all, colors=R,B,Y,K (4 different) OK

INVALID GROUP examples:
  [R7a, R7b, B7a]  -> REJECTED: color R appears TWICE (ERR_GROUP_COLOR_DUP)
  [R7a, B5a, K7a]  -> REJECTED: numbers differ 7,5,7 (ERR_GROUP_NUMBER)
  [R7a, B7a]        -> REJECTED: only 2 tiles, need >= 3 (ERR_SET_SIZE)

## RUN Rules: Same color, CONSECUTIVE numbers, 3+ tiles
- Every tile in a run MUST have the SAME color
- Numbers must be strictly consecutive (no gaps)
- No wraparound: 13-1 is NOT allowed
- Minimum 3 tiles, maximum 13 tiles

VALID RUN examples:
  [R7a, R8a, R9a]              -> color=R for all, numbers=7,8,9 consecutive OK
  [B10a, B11a, B12a, B13a]     -> color=B for all, numbers=10,11,12,13 OK
  [K1a, K2a, K3a, K4a, K5a]   -> color=K for all, numbers=1,2,3,4,5 OK

INVALID RUN examples:
  [R7a, B8a, K9a]  -> REJECTED: different colors R,B,K (run needs SAME color)
  [R7a, R9a, R10a] -> REJECTED: gap at 8 (numbers must be consecutive)
  [R12a, R13a, R1a] -> REJECTED: wraparound 13->1 is forbidden
  [R7a, R8a]        -> REJECTED: only 2 tiles, need >= 3 (ERR_SET_SIZE)

## Size Rule: EVERY group and run must have >= 3 tiles. 2 tiles = ALWAYS INVALID.

## Initial Meld Rule (when initialMeldDone=false):
- Sum of tile numbers in your placed sets must be >= 30 points
- Use ONLY your rack tiles (you CANNOT touch or use table tiles)
- Each tile's number IS its point value: R10a = 10 pts, B3a = 3 pts
- Example: R10a + R11a + R12a = 10+11+12 = 33 pts >= 30 -> VALID
- Example: R1a + R2a + R3a = 1+2+3 = 6 pts < 30 -> REJECTED

## tableGroups = COMPLETE final state of the ENTIRE table after your move
- You MUST include ALL existing table groups (even unchanged ones)
- Then add your new groups
- If you omit any existing group -> "tile loss" -> REJECTED

## tilesFromRack = ONLY tiles YOU placed from YOUR hand (not table tiles)

# Few-Shot Examples (study these carefully)

## Example 1: Draw (no valid combination)
My rack: [R5a, B7b, K3a, Y11a]
Table: (empty), initialMeldDone=false
Analysis: R5+B7+K3=15 (not a valid set anyway), no 3+ same-number or same-color consecutive
-> {"action":"draw","reasoning":"no valid group or run with sum >= 30"}

## Example 2: Place single run (initial meld)
My rack: [R10a, R11a, R12a, B5b, K3a]
Table: (empty), initialMeldDone=false
Analysis: R10a,R11a,R12a = Red run 10-11-12, sum=33 >= 30
-> {"action":"place","tableGroups":[{"tiles":["R10a","R11a","R12a"]}],"tilesFromRack":["R10a","R11a","R12a"],"reasoning":"Red run 10-11-12, sum=33 for initial meld"}

## Example 3: Place group (initial meld)
My rack: [R10a, B10b, K10a, Y2a, R3b]
Table: (empty), initialMeldDone=false
Analysis: R10a,B10b,K10a = Group of 10s (R,B,K), sum=30 >= 30
-> {"action":"place","tableGroups":[{"tiles":["R10a","B10b","K10a"]}],"tilesFromRack":["R10a","B10b","K10a"],"reasoning":"Group of 10s (R,B,K), sum=30 for initial meld"}

## Example 4: Extend existing table group (after initial meld)
My rack: [R6a, B2a]
Table: Group1=[R3a,R4a,R5a], Group2=[B7a,Y7a,K7a], initialMeldDone=true
Analysis: R6a can extend Group1 (R3a,R4a,R5a,R6a = Red run 3-4-5-6)
-> {"action":"place","tableGroups":[{"tiles":["R3a","R4a","R5a","R6a"]},{"tiles":["B7a","Y7a","K7a"]}],"tilesFromRack":["R6a"],"reasoning":"extend existing Red run with R6a, keep Group2 unchanged"}

## Example 5: Multiple sets placed at once
My rack: [R10a, R11a, R12a, B7a, Y7b, K7a, R1a]
Table: (empty), initialMeldDone=false
Analysis: Run R10-11-12 (33pts) + Group 7s B,Y,K (21pts) = 54pts total, 6 tiles placed
-> {"action":"place","tableGroups":[{"tiles":["R10a","R11a","R12a"]},{"tiles":["B7a","Y7b","K7a"]}],"tilesFromRack":["R10a","R11a","R12a","B7a","Y7b","K7a"],"reasoning":"Red run 33pts + Group of 7s 21pts = 54pts, 6 tiles placed"}

# Pre-Submission Validation Checklist (MUST verify before answering)
Before you output your JSON, verify ALL of these:
1. Each set in tableGroups has >= 3 tiles (NEVER 2 or 1)
2. Each run has the SAME color and CONSECUTIVE numbers (no gaps, no wraparound)
3. Each group has the SAME number and ALL DIFFERENT colors (no duplicate colors)
4. tilesFromRack contains ONLY tiles from "My Rack Tiles" (not table tiles)
5. ALL existing table groups are preserved in tableGroups (none omitted)
6. If initialMeldDone=false: sum of placed tile numbers >= 30, and no table tiles used
7. Every tile code in your response matches the {Color}{Number}{Set} format exactly

# Step-by-Step Thinking Procedure
1. List ALL tiles in my rack, grouped by color
2. Find ALL possible groups: for each number, check if 3+ different colors exist
3. Find ALL possible runs: for each color, find consecutive sequences of 3+
4. If initialMeldDone=false: calculate point sum for each combination, keep only sum >= 30
5. If initialMeldDone=true: also check if I can extend existing table groups/runs
6. Compare all valid combinations: pick the one that places the MOST tiles
7. If no valid combination exists: choose "draw"
8. Build JSON response: include ALL existing table groups + your new groups
9. Run the validation checklist above before outputting

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

    // Reasoner 전용 로직: V2 공유 프롬프트 + 향상된 JSON 추출
    const modelInfo = this.getModelInfo();
    const systemPrompt = V2_REASONING_SYSTEM_PROMPT;
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

    // 명확한 지시 + 검증 힌트
    lines.push('');
    lines.push('# Your Task');
    lines.push('Analyze my rack tiles and find valid groups/runs to place.');
    lines.push('If you can place tiles, respond with action="place".');
    lines.push('If no valid combination exists, respond with action="draw".');
    lines.push('');
    lines.push('# Validation Reminders');
    lines.push(
      '- Before submitting: verify each set has 3+ tiles, runs are consecutive same-color, groups are same-number different-colors',
    );
    lines.push(
      '- Only use tiles from your rack or rearrange existing board sets',
    );
    lines.push(
      '- Double-check: no duplicate colors in groups, no gaps in runs, no wraparound (13->1)',
    );
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
      `\n` +
      `Common mistakes to avoid:\n` +
      `- Groups must have ALL DIFFERENT colors (R,B,Y,K). No duplicate colors!\n` +
      `- Runs must be SAME color with CONSECUTIVE numbers. No gaps!\n` +
      `- Every set must have >= 3 tiles. Never submit 2-tile sets.\n` +
      `- tilesFromRack must ONLY contain tiles from "My Rack Tiles" section.\n` +
      `- Include ALL existing table groups in tableGroups (even unchanged ones).\n` +
      `\n` +
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
      max_tokens: isReasoner ? 16384 : 1024,
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
        timeout: isReasoner ? Math.max(timeoutMs, 210_000) : timeoutMs,
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
