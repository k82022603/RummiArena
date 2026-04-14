import {
  V2_REASONING_SYSTEM_PROMPT,
  buildV2UserPrompt,
  buildV2RetryPrompt,
} from '../../v2-reasoning-prompt';
import { PromptVariant } from '../prompt-registry.types';

/**
 * V2 Reasoning Prompt — 영문 단일 텍스트, OpenAI/Claude USE_V2_PROMPT 경로로 검증된 베이스라인.
 * Round 4 / Round 5 결과: place rate 30.8% (DeepSeek), A 등급 (Claude).
 */
export const v2Variant: PromptVariant = {
  id: 'v2',
  version: '1.0.0',
  systemPromptBuilder: () => V2_REASONING_SYSTEM_PROMPT,
  userPromptBuilder: (gameState) => buildV2UserPrompt(gameState),
  retryPromptBuilder: (gameState, errorReason, attempt) =>
    buildV2RetryPrompt(gameState, errorReason, attempt),
  metadata: {
    description: '영문 reasoning 베이스라인 — Round 4/5 검증, 5개 어댑터 호환',
    tokenBudget: 1200,
    recommendedModels: ['openai', 'claude', 'deepseek', 'ollama'],
    recommendedTemperature: 0.0,
    designDoc: 'docs/02-design/21-reasoning-model-prompt-engineering.md',
    introducedAt: '2026-03-31',
    thinkingMode: 'standard',
    warnIfOffRecommendation: false,
  },
};
