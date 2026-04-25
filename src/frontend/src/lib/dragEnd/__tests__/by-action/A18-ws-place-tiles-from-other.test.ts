/**
 * A18 — WS PLACE_TILES (다른 플레이어 turn)
 *
 * SSOT 매핑:
 * - 56 §3.19 셀: A18 (WS 수신)
 * - 룰 ID: UR-04 (자기 턴 invariant)
 * - 상태 전이: S0 (관전 표시), 내 pending 영향 0
 * - 사용자 시나리오: F-14 (60 §1.2)
 */

import { describe, it } from '@jest/globals';

describe('[A18] [UR-04] WS PLACE_TILES from other player', () => {
  describe('[A18.1] 관전 표시 (state.tableGroups 갱신)', () => {
    it.todo('다른 플레이어 PLACE_TILES 수신 → state.tableGroups 만 갱신, state === S0 유지');
    // GREEN 기대값:
    // - state.tableGroups 갱신
    // - state.players[mySeat].rack 영향 0
    // - state.pendingTableGroups 영향 0 (UR-04 invariant)
  });

  describe('[A18.2] [UR-04] 내 pending 영향 없음 (invariant)', () => {
    it.todo('내가 S5 (pending building) 상태일 때 PLACE_TILES 수신 → pending 동결, S5 유지');
    // 단 TURN_START 수신 시는 pending 강제 reset (A19)
  });
});
