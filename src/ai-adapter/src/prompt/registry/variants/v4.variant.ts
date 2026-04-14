import {
  V4_REASONING_SYSTEM_PROMPT,
  buildV4UserPrompt,
  buildV4RetryPrompt,
} from '../../v4-reasoning-prompt';
import { PromptVariant } from '../prompt-registry.types';

/**
 * V4 Reasoning Prompt — 공통 코어 + reasoner variant transform (SP5 구현).
 *
 * SP1 (`docs/03-development/20-common-system-prompt-v4-design.md`) §6.1 core +
 * §6.2 DeepSeek reasoner variant 를 기반으로 reasoner 3모델 (DeepSeek-Reasoner,
 * Claude, DashScope) 공통 body 를 구현한다.
 *
 * v3 대비 실질 변경:
 *   1. Thinking Time Budget 섹션 — empirical 15K 토큰 burst 허가
 *   2. Position Evaluation Criteria 5축 — Legality/Meld/Count/Point/Residual
 *   3. Action Bias (v4 신규) — Claude 과보수 대응
 *   4. Step 6 확장 — 5축 평가 + Action Bias 적용
 *   5. userPrompt 의 동적 "Position Complexity: HIGH" 블록 (v3-tuned 에서 채택)
 *   6. retry 에 "verify twice" + 5축 재적용 강조
 *
 * 본문 파일: `src/ai-adapter/src/prompt/v4-reasoning-prompt.ts`
 * 설계 문서: `docs/03-development/20-common-system-prompt-v4-design.md`
 * 드라이런: `docs/03-development/21-prompt-v4-baseline-dry-run-report.md` (SP5)
 *
 * 권장 사용 (default):
 *   - deepseek-reasoner (behavior change: v3 → v4)
 *   - claude (behavior change: v2 → v4, extended thinking 호환)
 *   - dashscope (behavior change: v3 → v4, thinking-only 호환)
 *
 * 제외:
 *   - openai gpt-5-mini: response_format + 짧은 reasoning 전략 상 v2/v3 유지 (v4.1 에서 분기 예정)
 *   - ollama qwen2.5:3b: 소형 모델, 단순화 variant 필요 (v4.1 에서 분기 예정)
 *   - deepseek (non-reasoner): 현행 v2 유지
 */
export const v4Variant: PromptVariant = {
  id: 'v4',
  version: '1.0.0',
  baseVariant: 'v3',
  systemPromptBuilder: () => V4_REASONING_SYSTEM_PROMPT,
  userPromptBuilder: (gameState) => buildV4UserPrompt(gameState),
  retryPromptBuilder: (gameState, errorReason, attempt) =>
    buildV4RetryPrompt(gameState, errorReason, attempt),
  metadata: {
    description:
      'v3 + Thinking Time Budget + 5-axis Position Evaluation + Action Bias (reasoner 3-model common body)',
    tokenBudget: 1820,
    recommendedModels: ['deepseek-reasoner', 'claude', 'dashscope'],
    recommendedTemperature: 0.0,
    designDoc: 'docs/03-development/20-common-system-prompt-v4-design.md',
    introducedAt: '2026-04-14',
    thinkingMode: 'extended',
    warnIfOffRecommendation: true,
  },
};
