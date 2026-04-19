/**
 * PassthroughShaper — v2 baseline Shaper.
 *
 * 설계: docs/02-design/44-context-shaper-v6-architecture.md §7.1
 *
 * 목적:
 *   - v2 동작을 완벽 재현 (A/B 실험의 대조군)
 *   - rack/board/history 를 그대로 통과 (변환 없음)
 *   - hints = [] (빈 배열)
 *
 * Phase 1 수용 기준:
 *   - buildUserPrompt(req, passthroughOutput) 가 buildUserPrompt(req) 와 bitwise 동일
 *   - Object.freeze(input) 후 reshape() 실행 시 throw 없음
 *   - reshape() 실행 시간 < 50ms (순수 참조 복사이므로 O(1))
 */

import { ContextShaper, ShaperInput, ShaperOutput } from './shaper.types';

export class PassthroughShaper implements ContextShaper {
  readonly id = 'passthrough' as const;

  /**
   * 입력을 그대로 출력에 매핑한다.
   *
   * 불변성 보장:
   *   - ShaperInput 이 이미 readonly 이므로 추가 freeze 불필요.
   *   - rackView/boardView/historyView 는 input 의 참조를 그대로 반환 (복사 없음 — O(1)).
   *   - 호출자(MoveService 또는 PromptBuilderService) 가 output 을 mutate 할 경우
   *     input 에 영향을 주지 않도록, ADR 44 §5.2 에 따라 ShaperOutput 도 readonly.
   */
  reshape(input: ShaperInput): ShaperOutput {
    return {
      rackView: input.rack,
      boardView: input.board,
      historyView: input.history,
      hints: [],
    };
  }
}

/** 싱글턴 인스턴스 — Registry 기본값 + fallback 용 */
export const passthroughShaper = new PassthroughShaper();
