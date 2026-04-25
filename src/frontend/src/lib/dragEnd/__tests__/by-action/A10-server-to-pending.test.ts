/**
 * A10 — 서버 → pending (server-to-pending move)
 *
 * SSOT 매핑:
 * - 56 §3.11 셀: A10 (SERVER_BOARD → PENDING_BOARD)
 * - 룰 ID: V-13a, V-13c, D-12
 * - 상태 전이: S5 → S4 → S5
 * - 사용자 시나리오: F-06 (60 §1.2)
 */

import { describe, it } from '@jest/globals';

describe('[A10] [V-13a] [V-13c] server → pending', () => {
  describe('[A10.1] [V-13a] [UR-13] PRE_MELD reject', () => {
    it.todo('hasInitialMeld=false → 거절 (V-13a)');
  });

  describe('[A10.2] [V-13c] [UR-14] POST_MELD COMPAT allow + server → pending 전환', () => {
    it.todo('hasInitialMeld=true + server [R7,B7,Y7] + R7 → pending [R8] drop → 거절 (INCOMPAT) — 단 [B5,B6] pending + B7 server → drop → run [B5,B6,B7] (COMPAT)');
    // GREEN 기대값:
    // - dst pending.tiles.length === before + 1
    // - srcServerGroup.tiles.length === before - 1
    // - state.pendingGroupIds.add(serverGroupId)
  });

  describe('[A10.3] [UR-19] POST_MELD INCOMPAT reject', () => {
    it.todo('POST_MELD + INCOMPAT → 거절 (UR-19)');
  });

  describe('[A10.4] [D-12] 출발 server → pending 전환 (그룹 ID 보존)', () => {
    it.todo('drop 후 srcServerGroup.id 보존 (V-17)');
  });
});
