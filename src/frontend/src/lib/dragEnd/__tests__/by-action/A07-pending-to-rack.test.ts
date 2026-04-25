/**
 * A7 — pending → 랙 (회수)
 *
 * SSOT 매핑:
 * - 56 §3.8 셀: A7 (PENDING_BOARD → RACK)
 * - 룰 ID: UR-12, V-06, INV-G3
 * - 상태 전이: S5 → S3 → S5 (pending 0 이면 → S1)
 * - 사용자 시나리오: F-05 (60 §1.2)
 */

import { describe, it } from '@jest/globals';

describe('[A7] [UR-12] pending → rack (recovery)', () => {
  describe('[A7.1] [UR-12] 회수 항상 허용 (자기 pending 만)', () => {
    it.todo('pending [R7,B7] + R7 → rack drop → 출발 [B7], rack 에 R7 추가');
    // GREEN 기대값:
    // - srcGroup.tiles.length === before - 1
    // - state.players[mySeat].rack 에 R7 추가
    // - INV-G2: tile code 중복 0 (a/b 접미는 별개)
  });

  describe('[A7.2] [INV-G3] [D-03] 출발 그룹 빈 → 자동 정리', () => {
    it.todo('1장 짜리 pending [R7] 마지막 tile 회수 → 출발 그룹 자동 제거');
    // GREEN: state.pendingTableGroups 에서 srcGroup 제거됨
  });

  describe('[A7.3] [D-12] 회수 후 pendingGroupIds 갱신', () => {
    it.todo('서버 그룹이 pending 마킹된 상태에서 마지막 추가 tile 회수 시 pendingGroupIds 에서 제거');
  });

  describe('[A7.4] [V-06] conservation 유지', () => {
    it.todo('회수 전후 player rack tile + board tile 합 = 일정 (D-05 invariant 부분)');
  });
});
