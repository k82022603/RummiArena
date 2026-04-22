import {
  V7_OLLAMA_MELD_SYSTEM_PROMPT,
  buildV7OllamaMeldUserPrompt,
  buildV7OllamaMeldRetryPrompt,
} from '../../v7-ollama-meld-prompt';
import { PromptVariant } from '../prompt-registry.types';

/**
 * V7 Ollama Initial-Meld Hardcoded Variant — qwen2.5:3b 전용 opt-in variant.
 *
 * 배경 (Sprint 7 hotfix, 2026-04-22):
 *   - qwen2.5:3b 는 Round 실측에서 place rate 0% (23턴 / 22 강제 드로우)
 *   - 모델 자체 한계는 Sprint 8 qwen2.5:7b 교체로 해결 예정
 *   - Sprint 7 기간 플레이 가능 수준 확보 목적 — 프롬프트만으로 초기 등록 0 → >=20%
 *
 * 적용 방법:
 *   - 환경변수 OLLAMA_PROMPT_VARIANT=v7-ollama-meld 설정 시에만 활성화
 *   - 기본은 여전히 v2 (USE_V2_PROMPT=true 경로). GPT/Claude/DeepSeek 무영향
 *
 * warnIfOffRecommendation=true:
 *   - recommendedModels 는 ['ollama'] 뿐
 *   - 다른 모델에 적용 시도 시 warn 로그 발생 (안전장치)
 *
 * 설계 문서: docs/02-design/42-prompt-variant-standard.md §3 표 A
 */
export const v7OllamaMeldVariant: PromptVariant = {
  id: 'v7-ollama-meld',
  version: '1.0.0',
  baseVariant: 'v2',
  systemPromptBuilder: () => V7_OLLAMA_MELD_SYSTEM_PROMPT,
  userPromptBuilder: (gameState) => buildV7OllamaMeldUserPrompt(gameState),
  retryPromptBuilder: (gameState, errorReason, attempt) =>
    buildV7OllamaMeldRetryPrompt(gameState, errorReason, attempt),
  metadata: {
    description:
      'Ollama (qwen2.5:3b) 전용 하드코딩 프롬프트 — 4-step 절차 + 6 few-shot + 그룹/런 힌트. 초기 등록 0% → 목표 >=20% (Sprint 7 hotfix)',
    // v2 영문 baseline 1200 tokens 대비 하드코딩 few-shot 추가로 +40% 예상
    tokenBudget: 1700,
    recommendedModels: ['ollama'],
    recommendedTemperature: 0.0,
    designDoc: 'docs/02-design/42-prompt-variant-standard.md',
    introducedAt: '2026-04-22',
    thinkingMode: 'standard',
    warnIfOffRecommendation: true,
  },
};
