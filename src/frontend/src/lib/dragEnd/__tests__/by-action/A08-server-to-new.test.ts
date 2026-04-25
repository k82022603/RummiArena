/**
 * A8 — 서버 → 새 그룹 (split server)
 *
 * SSOT 매핑:
 * - 56 §3.9 셀: A8 (SERVER_BOARD → NEW_GROUP)
 * - 룰 ID: V-13a, V-13b, D-12
 * - 상태 전이: S5 → S4 → S5
 * - 사용자 시나리오: F-06 (60 §1.2)
 */

import { describe, it } from '@jest/globals';

describe('[A8] [V-13a] [V-13b] server → new group (split)', () => {
  describe('[A8.1] [V-13a] [UR-13] PRE_MELD reject', () => {
    it.todo('hasInitialMeld=false + server tile drag → 거절 (V-13a)');
  });

  describe('[A8.2] [V-13b] POST_MELD allow + 출발 server → pending 전환', () => {
    it.todo('hasInitialMeld=true + server [R7,B7,Y7,K7] + R7 split → 새 pending 그룹 [R7], 출발 [B7,Y7,K7] pending 마킹');
    // GREEN 기대값:
    // - state.pendingGroupIds.add(serverGroupId) (출발 마킹)
    // - newGroup.id.startsWith("pending-") (D-12)
    // - newGroup.tiles === [R7]
    // - srcServerGroup.tiles === [B7,Y7,K7]
  });

  describe('[A8.3] [D-12] 출발 server → pending 전환 (그룹 ID 보존)', () => {
    it.todo('split 후 srcServerGroup.id 보존 (V-17 UUID 유지), 클라가 새 pending- ID 할당 X');
  });

  describe('[A8.4] [D-01] [D-12] 새 그룹 pending- ID + INV-G1', () => {
    it.todo('newGroup.id 가 INV-G1 유니크, pending- prefix');
  });
});
