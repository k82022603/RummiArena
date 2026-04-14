import { PromptVariant } from '../prompt-registry.types';

/**
 * character-ko — 한국어 캐릭터 페르소나 프롬프트 (legacy fallback).
 *
 * 본 변형은 PromptBuilderService 의 한국어 캐릭터 시스템(persona × difficulty × psychologyLevel)을
 * registry 인덱스에서 식별 가능하게 하는 **placeholder** 다. 빌더 함수는 호출 시 빈 문자열을 반환하며,
 * 실제 한국어 프롬프트 생성은 어댑터가 자체적으로 PromptBuilderService.buildSystemPrompt() /
 * buildUserPrompt() 를 사용하여 수행한다.
 *
 * 이 우회 구조의 이유:
 *   - 한국어 캐릭터 프롬프트는 GameStateDto 만으로 생성 불가 (persona/difficulty/psychologyLevel 의존)
 *   - PromptVariant 인터페이스를 GameStateDto-only 로 유지하기 위해 legacy 경로는 별도 유지
 *   - 어댑터는 `registry.getActiveVariant(modelType).variantId === 'character-ko'` 일 때만
 *     PromptBuilderService 경로를 타도록 분기 (BaseAdapter.generateMove() 가 이미 그 경로)
 *
 * 즉 character-ko 변형이 active 라는 사실 자체가 metrics 로 기록될 수 있도록 등록하는 것이 본 파일의 역할이다.
 *
 * SP3 머지 후 1주 동안: ollama 가 default-recommendation 으로 v2 를 받도록 매핑 변경되어
 * character-ko 는 명시적 env override (`OLLAMA_PROMPT_VARIANT=character-ko`) 시에만 활성화.
 */
export const characterKoVariant: PromptVariant = {
  id: 'character-ko',
  version: '1.0.0',
  systemPromptBuilder: () => '',
  userPromptBuilder: () => '',
  retryPromptBuilder: () => '',
  metadata: {
    description:
      '한국어 캐릭터 페르소나 (legacy) — PromptBuilderService 가 직접 생성, 본 변형은 metrics tagging 용 placeholder',
    tokenBudget: 3000,
    recommendedModels: ['ollama'],
    recommendedTemperature: 0.7,
    designDoc: 'src/ai-adapter/src/prompt/persona.templates.ts',
    introducedAt: '2026-03-15',
    thinkingMode: 'standard',
    warnIfOffRecommendation: true,
  },
};
