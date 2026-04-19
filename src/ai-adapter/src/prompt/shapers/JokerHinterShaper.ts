/**
 * JokerHinterShaper — F1(조커 활용 부족) 대응 Shaper.
 *
 * 설계: docs/02-design/44-context-shaper-v6-architecture.md §7.2
 * 상태: 스켈레톤 (Day 9) — 알고리즘은 Day 10 AIE 보강 후 구현
 *
 * 목적:
 *   Rack 에 JK1/JK2 가 있을 때, LLM 이 매턴 반복하는 "조커로 어떤 Set/Run 완성 가능한가"
 *   탐색을 사전 계산하여 hints 에 주입 → 토큰당 추론 효율 향상.
 *
 * 알고리즘 (Day 10 구현 예정 — ADR 44 §7.2):
 *   1. rack 에서 조커 수 J = rack.filter(t => t.startsWith('JK')).length
 *   2. J === 0 이면 → PassthroughShaper 로 delegate (hints=[])
 *   3. J >= 1 이면:
 *      (a) rack 의 조커 외 타일로 "조커 1장만 끼우면 완성되는 Set" 목록 계산
 *          (같은 숫자 2장 → Set 3장: 예) R7a + B7a + JK1)
 *      (b) rack 의 조커 외 타일로 "조커 1장만 끼우면 완성되는 Run" 목록 계산
 *          (동색 연속 2장 또는 간격 1 → Run 3장: 예) R6a + R8a + JK1 → R6,JK1,R8)
 *      (c) board 의 기존 그룹에 조커로 연장 가능한 후보
 *          (3장 Group 에 같은 숫자 색 삽입, Run 끝/처음 연장)
 *   4. 각 후보에 confidence 부여 (점수 합계 기반)
 *   5. 상위 3개 후보만 hints 에 포함 (토큰 예산 ~180 토큰 제한)
 *
 * hint 예시:
 * {
 *   type: 'joker-candidate',
 *   payload: {
 *     completed: ['R7a', 'B7a', 'JK1'],
 *     rackTilesUsed: ['R7a', 'B7a'],
 *     score: 21,
 *     category: 'set-3'
 *   },
 *   confidence: 0.9
 * }
 *
 * 토큰 예산: 최대 3 hints × ~60 토큰 = ~180 토큰 증가
 *
 * 실험 타깃:
 *   - deepseek-reasoner × v2 × joker-hinter (Phase 4 N=1 pilot)
 *   - env: DEEPSEEK_REASONER_CONTEXT_SHAPER=joker-hinter
 */

import { ContextShaper, ShaperInput, ShaperOutput } from './shaper.types';
import { passthroughShaper } from './PassthroughShaper';

export class JokerHinterShaper implements ContextShaper {
  readonly id = 'joker-hinter' as const;

  /**
   * TODO Day 10: ADR 44 §7.2 알고리즘 구현 (AIE 수도코드 수신 후)
   *
   * 현재 구현: PassthroughShaper 로 delegate (스켈레톤 단계)
   * - 스켈레톤으로 비어있으면 phase 1 regression test 에서 오탐이 발생하므로
   *   Passthrough 위임을 명시적으로 구현한다.
   */
  reshape(input: ShaperInput): ShaperOutput {
    // TODO Day 10: 아래 passthrough delegate 를 실제 알고리즘으로 교체
    // 구현 단계:
    //   1. 조커 감지: const jokers = input.rack.filter(t => t.startsWith('JK'));
    //   2. jokers.length === 0 이면 조기 반환 (passthrough)
    //   3. 비조커 타일에서 Set/Run 후보 탐색
    //   4. Board 그룹 연장 후보 탐색
    //   5. confidence 계산 + 상위 3개 선별
    //   6. ShaperHint[] 생성 후 반환
    return passthroughShaper.reshape(input);
  }
}

/** 싱글턴 인스턴스 */
export const jokerHinterShaper = new JokerHinterShaper();
