import {
  V8_OLLAMA_PLACE_SYSTEM_PROMPT,
  buildV8OllamaPlaceUserPrompt,
  buildV8OllamaPlaceRetryPrompt,
} from '../../v8-ollama-place-prompt';
import { PromptVariant } from '../prompt-registry.types';

/**
 * V8 Ollama Place Pre-computed Variant — qwen2.5:3b 전용 opt-in variant.
 *
 * 배경:
 *   v7(4-step 절차 추론) 도 place rate 0% — 3B 모델이 조합 계산 자체를 못 함.
 *   v8 전략: 프롬프트 빌더가 유효 멜드를 사전 계산해 "Output this JSON exactly"
 *   형태로 박제 → 모델은 복사만 하면 됨.
 *
 * 적용 방법:
 *   - 환경변수 OLLAMA_PROMPT_VARIANT=v8-ollama-place 설정 시에만 활성화
 *   - GPT/Claude/DeepSeek 무영향
 */
export const v8OllamaPlaceVariant: PromptVariant = {
  id: 'v8-ollama-place',
  version: '1.0.0',
  baseVariant: 'v2',
  systemPromptBuilder: () => V8_OLLAMA_PLACE_SYSTEM_PROMPT,
  userPromptBuilder: (gameState) => buildV8OllamaPlaceUserPrompt(gameState),
  retryPromptBuilder: (gameState, errorReason, attempt) =>
    buildV8OllamaPlaceRetryPrompt(gameState, errorReason, attempt),
  metadata: {
    description:
      'Ollama (qwen2.5:3b) 전용 사전 계산 프롬프트 — 빌더가 유효 멜드 계산 후 JSON 박제. 모델은 복사만. 목표: place rate >= 1회/게임',
    tokenBudget: 400,
    recommendedModels: ['ollama'],
    recommendedTemperature: 0.0,
    designDoc: 'docs/02-design/42-prompt-variant-standard.md',
    introducedAt: '2026-05-01',
    thinkingMode: 'standard',
    warnIfOffRecommendation: true,
  },
};
