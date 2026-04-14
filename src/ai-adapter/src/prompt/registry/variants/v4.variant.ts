import {
  V3_REASONING_SYSTEM_PROMPT,
  buildV3UserPrompt,
  buildV3RetryPrompt,
} from '../../v3-reasoning-prompt';
import { PromptVariant } from '../prompt-registry.types';

/**
 * v4 placeholder — SP5 가 실제 구현으로 교체 예정.
 *
 * SP1 산출물 (`docs/03-development/20-common-system-prompt-v4-design.md` §6.1~6.5) 는 v4 코어
 * + 4개 모델 variant transform 의 **draft 코드 블록** 만 제공하며, `V4_CORE_SYSTEM_PROMPT_SIMPLIFIED`,
 * `buildV4CoreUserPrompt`, `buildV4CoreUserPromptSimple` 등의 헬퍼는 아직 export 되지 않았다.
 *
 * SP3 단계에서는 v4 를 registry 에 **placeholder 로만 등록** 하여 다음을 보장한다:
 *   1. `getActiveVariant('openai').variantId === 'v4'` 가 환경변수 PROMPT_VARIANT=v4 설정 시 작동
 *   2. metrics 의 `prompt_variant_id` 컬럼이 'v4' 로 기록될 수 있음
 *   3. SP5 가 변형 본문만 교체하면 즉시 활성화 (어댑터 코드 변경 0건)
 *
 * 현재 본문은 v3 와 동일. SP5 머지 시 SP1 §6.1~6.5 의 코어/variant 코드 블록을 import 해서 교체.
 *
 * **주의**: SP3 머지 시점에 PROMPT_VARIANT=v4 를 활성화하면 v3 와 100% 동일하게 동작한다.
 *  v4 의 모델별 차별화는 SP5 에서 구현된다.
 */
export const v4Variant: PromptVariant = {
  id: 'v4',
  version: '0.1.0-placeholder',
  baseVariant: 'v3',
  systemPromptBuilder: () => V3_REASONING_SYSTEM_PROMPT,
  userPromptBuilder: (gameState) => buildV3UserPrompt(gameState),
  retryPromptBuilder: (gameState, errorReason, attempt) =>
    buildV3RetryPrompt(gameState, errorReason, attempt),
  metadata: {
    description:
      'v4 placeholder — SP5 가 코어+variant transform 으로 교체 예정 (현재 v3 와 동일)',
    tokenBudget: 1530,
    recommendedModels: ['openai', 'claude', 'deepseek-reasoner', 'dashscope'],
    recommendedTemperature: 0.0,
    designDoc: 'docs/03-development/20-common-system-prompt-v4-design.md',
    introducedAt: '2026-04-14',
    thinkingMode: 'standard',
    warnIfOffRecommendation: true,
  },
};
