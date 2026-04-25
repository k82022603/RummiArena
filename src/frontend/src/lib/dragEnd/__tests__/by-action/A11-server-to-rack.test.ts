/**
 * A11 — 서버 → 랙 (회수) — V-06 conservation 위반 거절
 *
 * SSOT 매핑:
 * - 56 §3.12 셀: A11 (SERVER_BOARD → RACK)
 * - 룰 ID: V-06, UR-12
 * - 상태 전이: S4 → 거절 (state 변경 없음)
 * - 사용자 시나리오: (F-NN 없음 — 항상 거절)
 *
 * 본 셀은 "전부 거절" — 어떤 상태에서도 서버 commit tile 을 랙으로 회수 불가.
 * 단 V-13e 조커 swap 결과 회수 조커는 별도 (A12).
 */

import { describe, it } from '@jest/globals';

describe('[A11] [V-06] [UR-12] server → rack (전체 거절)', () => {
  describe('[A11.1] [V-13a] PRE_MELD reject', () => {
    it.todo('hasInitialMeld=false + server tile → rack drop → 거절 (V-13a)');
  });

  describe('[A11.2] [V-06] [UR-12] POST_MELD reject (conservation)', () => {
    it.todo('hasInitialMeld=true + server tile → rack drop → 거절 (V-06)');
    // GREEN 기대값: state 변경 0, UR-12 시각 표시
    // band-aid 금지: 토스트 X
  });

  describe('[A11.3] [V-06] conservation 위반 unified message', () => {
    it.todo('어떤 상태에서도 server → rack drop 차단, UR-12 unified 시각 표시');
    // 본 셀 도달 자체가 invariant 위반 — 코드 버그 신호
  });
});
