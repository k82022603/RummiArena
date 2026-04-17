import {
  V2_ZH_REASONING_SYSTEM_PROMPT,
  buildV2ZhUserPrompt,
  buildV2ZhRetryPrompt,
} from '../../v2-zh-reasoning-prompt';
import { PromptVariant } from '../prompt-registry.types';

/**
 * V2-zh — DeepSeek-Reasoner 전용 중문(Simplified Chinese) A/B variant of v2.
 *
 * 배경: DeepSeek-R1 의 내부 reasoning 이 중국어로 이루어진다는 관찰에 근거.
 * v2 영문 프롬프트 → 중문 번역으로 "영→중 규칙 해석 오버헤드" 제거 가설.
 * same few-shot / same structure — 언어만 다른 single-variable A/B 실험.
 *
 * v2 대비 실질 변경:
 *   1. 규칙 설명, 지시문, Analysis 텍스트, 섹션 헤더를 중문 (简体) 으로 번역
 *   2. 시스템 프롬프트 하단에 "출력 언어 리마인더" 블록 추가 (reasoning=중/영 자유,
 *      최종 JSON 필드명은 영문, JSON 내 "reasoning" 값은 영문)
 *
 * 번역에서 보존(영문 유지):
 *   - 타일 코드 (R7a, B13b, JK1, JK2 등)
 *   - JSON 필드명 ("action", "tableGroups", "tilesFromRack", "reasoning")
 *   - 값 상수 ("draw", "place"), 에러 코드 (ERR_GROUP_COLOR_DUP 등)
 *   - 컬러 축약 (R, B, Y, K), 숫자 (아라비아 숫자)
 *   - few-shot JSON 응답 예시의 "reasoning" 값
 *
 * 권장 사용:
 *   - deepseek-reasoner 전용 (warnIfOffRecommendation=true)
 *
 * 설계 문서: docs/02-design/42-prompt-variant-standard.md §3 표 A
 */
export const v2ZhVariant: PromptVariant = {
  id: 'v2-zh',
  version: '1.0.0',
  baseVariant: 'v2',
  systemPromptBuilder: () => V2_ZH_REASONING_SYSTEM_PROMPT,
  userPromptBuilder: (gameState) => buildV2ZhUserPrompt(gameState),
  retryPromptBuilder: (gameState, errorReason, attempt) =>
    buildV2ZhRetryPrompt(gameState, errorReason, attempt),
  metadata: {
    description:
      'v2 Chinese (Simplified) translation — DeepSeek-R1 전용 single-variable A/B (v2 vs v2-zh)',
    // tokenBudget 실측 근거: chars=4746 (CJK 1076 + ASCII 3670). DeepSeek tokenizer 기준
    // 추정 ~1700 tokens (CJK 는 평균 0.5~0.7 tok/char, ASCII 는 0.25 tok/char 가정).
    // v2 영문 baseline 1200 대비 +41%. Day 7 첫 실행 후 실제 prompt_tokens 로 갱신 예정.
    tokenBudget: 1700,
    recommendedModels: ['deepseek-reasoner'],
    recommendedTemperature: 0.0,
    designDoc: 'docs/02-design/42-prompt-variant-standard.md',
    introducedAt: '2026-04-17',
    thinkingMode: 'extended',
    warnIfOffRecommendation: true,
  },
};
