/**
 * PairWarmupShaper — F2(Pair 힌트 실패) 대응 Shaper.
 *
 * 설계: docs/02-design/44-context-shaper-v6-architecture.md §7.3
 * 상태: 스켈레톤 (Day 9) — 알고리즘은 Day 10 AIE 보강 후 구현
 *
 * 목적:
 *   Rack 에 "동색 인접수 2장" (R7a + R8a 등) 이 있을 때, Board 의 기존 Run 에 연장 후보가
 *   있으면 힌트 주입 → "1장 더 draw 하면 완성된다"는 맥락 제공.
 *
 * 알고리즘 (Day 10 구현 예정 — ADR 44 §7.3):
 *   1. rack 에서 pair 추출:
 *      (a) 같은 색의 연속수 2장 (예: R7a + R8a → 동색 인접수 pair)
 *      (b) 같은 숫자 다른 색 2장 (예: R7a + B7a → 동숫자 이색 pair)
 *   2. 각 pair 에 대해 board 순회:
 *      (a) 동색 Run 의 시작/끝에 연장 가능한가? (rack 의 제3 타일로)
 *      (b) 동숫자 Set 에 마지막 1장 채우기 가능한가?
 *   3. "1장 더 draw 하면 완성되는 후보" 를 hints 에 주입
 *      — psychologyLevel >= 2 에서만 활성화 (meta.difficulty 로 게이트)
 *   4. 최대 2 hints 반환 (토큰 예산 ~140 토큰)
 *
 * hint 예시:
 * {
 *   type: 'pair-extension',
 *   payload: {
 *     pair: ['R7a', 'R8a'],
 *     extensionCandidate: 'R6a or R9a',
 *     boardTarget: '기존 R-런 [R10a, R11a, R12a] 와 연결 불가, 독립 Run 필요'
 *   },
 *   confidence: 0.7
 * }
 *
 * 토큰 예산: 최대 2 hints × ~70 토큰 = ~140 토큰 증가
 *
 * 실험 타깃:
 *   - deepseek-reasoner × v2 × pair-warmup (Phase 5 N=3)
 *   - env: DEEPSEEK_REASONER_CONTEXT_SHAPER=pair-warmup
 */

import { ContextShaper, ShaperInput, ShaperOutput } from './shaper.types';
import { passthroughShaper } from './PassthroughShaper';

export class PairWarmupShaper implements ContextShaper {
  readonly id = 'pair-warmup' as const;

  /**
   * TODO Day 10: ADR 44 §7.3 알고리즘 구현 (AIE 수도코드 수신 후)
   *
   * 현재 구현: PassthroughShaper 로 delegate (스켈레톤 단계)
   */
  reshape(input: ShaperInput): ShaperOutput {
    // TODO Day 10: 아래 passthrough delegate 를 실제 알고리즘으로 교체
    // 구현 단계:
    //   1. meta.difficulty 게이트: psychologyLevel 정보 없으므로 difficulty 기준 적용
    //      (difficulty === 'beginner' 이면 hints=[] — 토큰 예산 절약)
    //   2. rack 에서 pair 추출 (동색 인접수 / 동숫자 이색)
    //   3. board 그룹과 매칭 — 연장 가능 후보 탐색
    //   4. 최대 2개 hint 생성 후 반환
    return passthroughShaper.reshape(input);
  }
}

/** 싱글턴 인스턴스 */
export const pairWarmupShaper = new PairWarmupShaper();
