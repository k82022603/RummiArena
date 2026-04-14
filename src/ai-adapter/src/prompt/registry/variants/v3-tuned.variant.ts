import {
  V3_TUNED_REASONING_SYSTEM_PROMPT,
  buildV3TunedUserPrompt,
  buildV3TunedRetryPrompt,
} from '../../../adapter/deepseek/prompt-v3-tuned';
import { PromptVariant } from '../prompt-registry.types';

/**
 * V3-Tuned Reasoning Prompt — v3 기반에 burst thinking 활용 문구 + 5축 평가 기준 추가.
 *
 * 본 변형은 C2 (2026-04-14) 작업으로 작성되었으나 SP3 이전까지는 어떤 어댑터에도
 * import 되지 않은 dead code 였다. PromptRegistry 등록을 통해 비로소 활성화된다.
 *
 * 변경점 (vs v3):
 *   - Thinking Time Budget 섹션 (사고 시간 자율 확장 명시 허가)
 *   - Position Evaluation Criteria 5개 항목 (Legality / Meld / Count / Point / Residual)
 *   - "verify twice" retry 강조
 *
 * 권장 사용: DeepSeek-Reasoner / DashScope Qwen3 (A/B 실험용).
 * 대전 검증은 Sprint 6 후반 (Round 6/7) 예정.
 */
export const v3TunedVariant: PromptVariant = {
  id: 'v3-tuned',
  version: '1.0.0',
  baseVariant: 'v3',
  systemPromptBuilder: () => V3_TUNED_REASONING_SYSTEM_PROMPT,
  userPromptBuilder: (gameState) => buildV3TunedUserPrompt(gameState),
  retryPromptBuilder: (gameState, errorReason, attempt) =>
    buildV3TunedRetryPrompt(gameState, errorReason, attempt),
  metadata: {
    description: 'v3 + burst thinking budget + 5-axis position evaluation',
    tokenBudget: 1750,
    recommendedModels: ['deepseek-reasoner', 'dashscope'],
    recommendedTemperature: 0.0,
    designDoc: 'docs/03-development/19-deepseek-token-efficiency-analysis.md',
    introducedAt: '2026-04-14',
    thinkingMode: 'extended',
    warnIfOffRecommendation: true,
  },
};
