import {
  V9_OLLAMA_PLACE_SYSTEM_PROMPT,
  buildV9OllamaPlaceUserPrompt,
  buildV9OllamaPlaceRetryPrompt,
} from '../../v9-ollama-place-prompt';
import { PromptVariant } from '../prompt-registry.types';

/**
 * V9 Ollama Place Pre-computed Variant — qwen2.5:3b 전용 opt-in variant.
 *
 * v8 대비 변경점:
 *   - scoreSetWithJoker: 서버 group/runScore 이식 (조커 = 대체 위치 숫자)
 *   - findValidRunsV9: 조커 갭 채우기 + 양끝 확장
 *   - findOptimalInitialMeld: DFS 최다 타일 우선
 *   - findAllExtensions: 다중 확장
 *   - findRunSplits / findJokerExchange: 종반 전략 추가
 *
 * 적용 방법:
 *   - 환경변수 OLLAMA_PROMPT_VARIANT=v9-ollama-place 설정 시에만 활성화
 *   - GPT/Claude/DeepSeek 무영향
 */
export const v9OllamaPlaceVariant: PromptVariant = {
  id: 'v9-ollama-place',
  version: '1.0.0',
  baseVariant: 'v2',
  systemPromptBuilder: () => V9_OLLAMA_PLACE_SYSTEM_PROMPT,
  userPromptBuilder: (gameState) => buildV9OllamaPlaceUserPrompt(gameState),
  retryPromptBuilder: (gameState, errorReason, attempt) =>
    buildV9OllamaPlaceRetryPrompt(gameState, errorReason, attempt),
  metadata: {
    description:
      'Ollama (qwen2.5:3b) 전용 v9 — 조커 점수 서버 이식 + 다중 확장 + 종반 전략. 목표: place rate >= 20%',
    tokenBudget: 400,
    recommendedModels: ['ollama'],
    recommendedTemperature: 0.0,
    designDoc: 'docs/02-design/42-prompt-variant-standard.md',
    introducedAt: '2026-05-09',
    thinkingMode: 'standard',
    warnIfOffRecommendation: true,
  },
};
