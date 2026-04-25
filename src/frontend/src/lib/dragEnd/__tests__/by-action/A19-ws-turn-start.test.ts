/**
 * A19 — WS TURN_START
 *
 * SSOT 매핑:
 * - 56 §3.19 셀: A19 (WS 수신)
 * - 룰 ID: UR-02, UR-04, V-08
 * - 상태 전이: → S1 (mySeat) 또는 → S0 (otherSeat)
 * - 사용자 시나리오: F-01 (60 §1.2)
 */

import { describe, it } from '@jest/globals';

describe('[A19] [V-08] [UR-02] [UR-04] WS TURN_START', () => {
  describe('[A19.1] [V-08] [UR-02] mySeat 일치 → S1', () => {
    it.todo('TURN_START { currentSeat: mySeat } 수신 → state === S1 (MY_TURN_IDLE)');
    // GREEN 기대값:
    // - state === S1
    // - UI 활성화 (UR-02)
    // - 타이머 시작
  });

  describe('[A19.2] [V-08] mySeat 불일치 → S0', () => {
    it.todo('TURN_START { currentSeat: otherSeat } 수신 → state === S0 (OUT_OF_TURN)');
  });

  describe('[A19.3] [UR-04] pendingTableGroups=[] 강제', () => {
    it.todo('TURN_START 수신 → pendingTableGroups = [], pendingGroupIds = new Set() (UR-04 invariant)');
    // GREEN: 이전 턴의 잔재 pending 이 있어도 강제 cleanup
    // band-aid 금지: 잔재가 있어도 토스트 X (코드 버그라면 console.error 만)
  });

  describe('[A19.4] [UR-04] S5/S6/S7 진행 중에도 TURN_START 우선', () => {
    it.todo('S7 (COMMITTING) 중에도 TURN_START 수신 → S0/S1 으로 강제 전이 (서버 진실 우선)');
  });
});
