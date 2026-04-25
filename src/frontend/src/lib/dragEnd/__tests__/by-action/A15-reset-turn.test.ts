/**
 * A15 — RESET_TURN (되돌리기)
 *
 * SSOT 매핑:
 * - 56 §3.16 셀: A15 (RESET_TURN 클릭)
 * - 룰 ID: UR-16
 * - 상태 전이: S5/S6 → S1
 * - 사용자 시나리오: F-10 (60 §1.2)
 */

import { describe, it } from '@jest/globals';

describe('[A15] [UR-16] RESET_TURN (S5/S6 → S1)', () => {
  describe('[A15.1] [UR-16] S5/S6 → S1 전이', () => {
    it.todo('pending [R7,B7,Y7] + RESET 클릭 → state 전이 S1, pendingTableGroups=[]');
    // GREEN 기대값:
    // - state.pendingTableGroups === []
    // - state.players[mySeat].rack 복원 (TURN_START 시점 rack)
    // - state === S1
  });

  describe('[A15.2] [UR-16] pendingTableGroups=[] (cleanup)', () => {
    it.todo('RESET 후 pendingTableGroups 완전 비움, pendingGroupIds 도 비움');
  });

  describe('[A15.3] [D-12] pending → server 매핑 정합성 유지', () => {
    it.todo('RESET 후 server tableGroups 는 그대로 (TURN_START 시점), pending 마킹만 제거');
  });
});
