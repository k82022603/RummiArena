/**
 * A20 — WS TURN_END
 *
 * SSOT 매핑:
 * - 56 §3.19 셀: A20 (WS 수신)
 * - 룰 ID: UR-05, UR-27
 * - 상태 전이: → S0 (또는 End → 다음 TURN_START 대기)
 * - 사용자 시나리오: (F-01 의 cleanup 부분)
 */

import { describe, it } from '@jest/globals';

describe('[A20] [UR-05] WS TURN_END', () => {
  describe('[A20.1] [UR-05] TURN_END OK → S0/S1', () => {
    it.todo('TURN_END { reason: "OK" } 수신 → state === S0, pendingTableGroups=[]');
    // GREEN 기대값:
    // - state === S0
    // - state.tableGroups 갱신 (서버 commit 결과)
    // - state.pendingTableGroups === []
  });

  describe('[A20.2] cleanup (S0 invariant 진입)', () => {
    it.todo('TURN_END 후 모든 drag state 초기화 (activeId=null, isHandlingDragEndRef=false)');
  });

  describe('[A20.3] [UR-27] WIN/ALL_PASS reason 분기', () => {
    it.todo('TURN_END { reason: "WIN" } → GAME_OVER 오버레이 (UR-28). reason: "ALL_PASS" → UR-27 안내');
  });
});
