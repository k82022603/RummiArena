/**
 * A16 — DRAW (드로우 / 자동 패스)
 *
 * SSOT 매핑:
 * - 56 §3.17 셀: A16 (DRAW 클릭)
 * - 룰 ID: V-10, UR-22, UR-23
 * - 상태 전이: S1 → S9 → End
 * - 사용자 시나리오: F-11 (60 §1.2)
 */

import { describe, it } from '@jest/globals';

describe('[A16] [V-10] DRAW (S1 → S9)', () => {
  describe('[A16.1] [UR-15] pending≥1 → reject', () => {
    it.todo('pending 그룹 1개 이상 → DRAW 비활성 (UR-15 안내: ConfirmTurn 또는 RESET 후 시도)');
  });

  describe('[A16.2] [V-10] pending=0 + drawpile>0 → 1장 추가', () => {
    it.todo('pending=0 + drawpile.length > 0 → DRAW 활성 → state.players[mySeat].rack 에 1장 추가, turn end');
    // GREEN 기대값:
    // - state.players[mySeat].rack.length === before + 1
    // - state === S9 → End
  });

  describe('[A16.3] [V-10] [UR-22] pending=0 + drawpile=0 → 패스', () => {
    it.todo('pending=0 + drawpile.length === 0 → "패스" 라벨 (UR-22) → DRAW 클릭 → 1장 추가 X, turn end');
  });

  describe('[A16.4] DRAW 후 turn end (S9 → End)', () => {
    it.todo('DRAW 응답 수신 → state === End → TURN_END broadcast 대기');
  });
});
