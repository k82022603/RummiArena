import {
  V5_REASONING_SYSTEM_PROMPT,
  buildV5UserPrompt,
  buildV5RetryPrompt,
} from '../../v5-reasoning-prompt';
import { PromptVariant } from '../prompt-registry.types';

/**
 * V5 — Hybrid Reasoning (v5.2: v5 간결 규칙 + v2 few-shot).
 *
 * 배경: v5.0 zero-shot (20.5%) < v2 (30.8%). few-shot이 규칙 이해에 기여.
 * Round 8 교훈: Nature "few-shot degrades" 일반론은 Rummikub 도메인에서 부분 성립.
 *
 * v2 대비 제거 (유지):
 *   - Step-by-step 9단계 → 제거
 *   - Validation Checklist 7항목 → 제거
 *   - VALID/INVALID 예시 다수 → GROUP/RUN 각 1쌍만 유지
 *
 * v5.0 대비 복원:
 *   - Few-shot 5개 → 복원 (v2 원본 그대로)
 *
 * 토큰 예산: ~650 (v5.1 350 + few-shot 300)
 * 대상: 3모델 공통 (deepseek-reasoner, claude, openai)
 */
export const v5Variant: PromptVariant = {
  id: 'v5',
  version: '2.0.0',
  systemPromptBuilder: () => V5_REASONING_SYSTEM_PROMPT,
  userPromptBuilder: (gameState) => buildV5UserPrompt(gameState),
  retryPromptBuilder: (gameState, errorReason, attempt) =>
    buildV5RetryPrompt(gameState, errorReason, attempt),
  metadata: {
    description:
      'Hybrid reasoning (v5.2): v5 concise rules + v2 few-shot 5 examples. No checklist, no step-by-step.',
    tokenBudget: 650,
    recommendedModels: ['deepseek-reasoner', 'claude', 'openai'],
    recommendedTemperature: 0.0,
    designDoc: 'docs/03-development/23-prompt-v5-zero-shot-design.md',
    introducedAt: '2026-04-17',
    thinkingMode: 'extended',
    warnIfOffRecommendation: true,
  },
};
