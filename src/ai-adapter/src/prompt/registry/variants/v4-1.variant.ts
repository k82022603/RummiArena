import {
  V4_1_REASONING_SYSTEM_PROMPT,
  buildV4_1UserPrompt,
  buildV4_1RetryPrompt,
} from '../../v4-1-reasoning-prompt';
import { PromptVariant } from '../prompt-registry.types';

/**
 * V4.1 — Single-variable A/B variant of v4 with Thinking Budget directive removed.
 *
 * 배경: Round 6 N=2 검증 결과 v4 가 place rate 25.95% 로 v2 30.8% 대비
 * -4.85%p regression, avg latency +52%, max +94%. "더 오래 사고 + 더 나쁜 결과"
 * 이중 regression 의 원인을 single variable 로 분리 검증.
 *
 * v4 의 다른 구성요소 (5축 평가, Action Bias, Few-shot 5개, 자기검증 7항목) 는
 * 전부 그대로 유지하고 Thinking Budget 명시적 지시만 제거.
 *
 * 권장 사용:
 *   - deepseek-reasoner, claude, dashscope (v4 와 동일)
 *
 * 검증 스크립트: scripts/verify-v4.1-deepseek-empirical.ts (v2 vs v4 vs v4.1 3-way)
 */
export const v4_1Variant: PromptVariant = {
  id: 'v4.1',
  version: '1.0.0',
  baseVariant: 'v4',
  systemPromptBuilder: () => V4_1_REASONING_SYSTEM_PROMPT,
  userPromptBuilder: (gameState) => buildV4_1UserPrompt(gameState),
  retryPromptBuilder: (gameState, errorReason, attempt) =>
    buildV4_1RetryPrompt(gameState, errorReason, attempt),
  metadata: {
    description:
      'v4 minus Thinking Budget directive (single-variable A/B, 5-axis + Action Bias + Few-shot retained)',
    tokenBudget: 1740,
    recommendedModels: ['deepseek-reasoner', 'claude', 'dashscope'],
    recommendedTemperature: 0.0,
    designDoc: 'docs/03-development/22-round6-v4-vs-v2-comparison.md',
    introducedAt: '2026-04-16',
    thinkingMode: 'extended',
    warnIfOffRecommendation: true,
  },
};
