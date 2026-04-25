/**
 * A12 — 조커 swap (V-13e)
 *
 * SSOT 매핑:
 * - 56 §3.13 셀: A12 (RACK → JOKER_TILE)
 * - 룰 ID: V-13a, V-13e, V-07, UR-25
 * - 상태 전이: S5 → S4 → S10 (joker recovered pending)
 * - 사용자 시나리오: F-07 (60 §1.2)
 *
 * 별도 단위 테스트:
 * - tryJokerSwap 순수 함수 (`tryJokerSwap-{group,run}.test.ts`) — PR-D-Q03
 */

import { describe, it } from '@jest/globals';

describe('[A12] [V-13a] [V-13e] [V-07] joker swap', () => {
  describe('[A12.1] [V-13a] [UR-13] PRE_MELD reject', () => {
    it.todo('hasInitialMeld=false + rack tile → joker drop → 거절 (V-13a)');
  });

  describe('[A12.2] [V-13e] POST_MELD 그룹 swap', () => {
    it.todo('서버 [R7,B7,JK1] + 랙 Y7 → JK1 위에 drop → JK1 회수, 그룹 [R7,B7,Y7]');
    // GREEN 기대값:
    // - 서버 그룹의 JK1 → Y7 교체
    // - state.players[mySeat].rack 에 JK1 추가
    // - state.pendingRecoveredJokers.add("JK1")
    // - state 전이 S10
  });

  describe('[A12.3] [V-13e] POST_MELD 런 swap', () => {
    it.todo('서버 [R5,JK1,R7] (R6 대체) + 랙 R6 → JK1 위에 drop → JK1 회수, 런 [R5,R6,R7]');
  });

  describe('[A12.4] [V-13e] 동등 가치 위반 reject', () => {
    it.todo('서버 [R5,JK1,R7] (R6 대체) + 랙 R8 (값 불일치) → drop → 거절 (V-13e)');
  });

  describe('[A12.5] [V-07] [UR-25] 회수 조커 → pendingRecoveredJokers 기록', () => {
    it.todo('swap 후 state.pendingRecoveredJokers === ["JK1"], UR-25 시각 강조 (펄스 + "이번 턴 사용 필수")');
  });

  describe('[A12.6] [V-07] 같은 턴 미사용 → ConfirmTurn 차단', () => {
    it.todo('swap 후 회수 JK1 미배치 → ConfirmTurn 비활성 (UR-15 + V-07 클라 미러)');
    // GREEN 기대값:
    // - state.pendingRecoveredJokers.size > 0 → ConfirmTurn disabled
    // - JK1 을 다시 보드에 배치 후 → ConfirmTurn 활성
  });
});
