import { MoveRequestDto, GameStateDto } from '../../common/dto/move-request.dto';
import {
  V3_REASONING_SYSTEM_PROMPT,
  buildV3UserPrompt,
  buildV3RetryPrompt,
} from '../../prompt/v3-reasoning-prompt';

/**
 * DashScope (Qwen3) 전용 프롬프트 빌더.
 *
 * DeepSeek Reasoner 와 동일한 V3 reasoning 프롬프트를 재사용한다.
 * Qwen3 thinking-only 모델은 DeepSeek Reasoner 와 동일 클래스(Reasoning CoT 기반)이므로
 * Round 4~5 에서 검증된 V3 프롬프트가 그대로 최적이다.
 *
 * 미래 튜닝 여지:
 *   - Qwen3 고유 prompt engineering 권장사항 발견 시 v3-qwen3-tuned 분기 가능
 *   - thinking_budget 과 프롬프트 길이의 상관관계 실증 후 조정
 *
 * 설계 문서: docs/02-design/34-dashscope-qwen3-adapter-design.md
 */

export function buildDashScopeSystemPrompt(): string {
  return V3_REASONING_SYSTEM_PROMPT;
}

export function buildDashScopeUserPrompt(gameState: GameStateDto): string {
  return buildV3UserPrompt(gameState);
}

export function buildDashScopeRetryPrompt(
  gameState: GameStateDto,
  errorReason: string,
  attemptNumber: number,
): string {
  return buildV3RetryPrompt(gameState, errorReason, attemptNumber);
}

/**
 * MoveRequest → DashScope 메시지 배열 변환.
 * attempt=0 이면 기본 유저 프롬프트, 1 이상이면 에러 피드백이 포함된 재시도 프롬프트를 사용한다.
 */
export function buildDashScopeMessages(
  request: MoveRequestDto,
  attempt: number,
  lastErrorReason: string,
): Array<{ role: 'system' | 'user'; content: string }> {
  const systemPrompt = buildDashScopeSystemPrompt();
  const userPrompt =
    attempt === 0
      ? buildDashScopeUserPrompt(request.gameState)
      : buildDashScopeRetryPrompt(request.gameState, lastErrorReason, attempt);

  return [
    { role: 'system', content: systemPrompt },
    { role: 'user', content: userPrompt },
  ];
}
