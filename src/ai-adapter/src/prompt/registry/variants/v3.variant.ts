import {
  V3_REASONING_SYSTEM_PROMPT,
  buildV3UserPrompt,
  buildV3RetryPrompt,
} from '../../v3-reasoning-prompt';
import { PromptVariant } from '../prompt-registry.types';

/**
 * V3 Reasoning Prompt — v2 기반 무효 배치 감소 + 자기검증 강화.
 *
 * 변경점 (vs v2):
 *   - ERR_GROUP_COLOR_DUP / ERR_TABLE_TILE_MISSING 대응 문구 추가
 *   - tableGroups 카운팅 강제
 *   - few-shot 5개 + Pre-Submission Validation Checklist 7항목
 *
 * 권장 사용:
 *   - DeepSeek-Reasoner (현재 v2 하드코딩 → SP3 머지 시 v3 자동 전환 — behavior change)
 *   - DashScope Qwen3 thinking-only (이미 v3 사용 중)
 *   - OpenAI / Claude (env override 시)
 */
export const v3Variant: PromptVariant = {
  id: 'v3',
  version: '1.0.0',
  baseVariant: 'v2',
  systemPromptBuilder: () => V3_REASONING_SYSTEM_PROMPT,
  userPromptBuilder: (gameState) => buildV3UserPrompt(gameState),
  retryPromptBuilder: (gameState, errorReason, attempt) =>
    buildV3RetryPrompt(gameState, errorReason, attempt),
  metadata: {
    description: 'v2 기반 무효 배치 감소 + 자기검증 강화',
    tokenBudget: 1530,
    recommendedModels: ['deepseek-reasoner', 'dashscope', 'openai', 'claude'],
    recommendedTemperature: 0.0,
    designDoc: 'docs/02-design/24-v3-prompt-adapter-impact.md',
    introducedAt: '2026-04-08',
    thinkingMode: 'standard',
    warnIfOffRecommendation: false,
  },
};
