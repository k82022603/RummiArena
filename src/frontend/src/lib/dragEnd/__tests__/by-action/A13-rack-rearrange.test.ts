/**
 * A13 — 랙 내 재정렬 (rack-to-rack reorder)
 *
 * SSOT 매핑:
 * - 56 §3.14 셀: A13 (RACK → RACK)
 * - 룰 ID: (rack 사적 공간 — 보드 영향 없음)
 * - 상태 전이: 상태 머신 미영향 (S0~S10 어떤 상태에서도 허용)
 * - 사용자 시나리오: F-08 (60 §1.2, P2)
 */

import { describe, it } from '@jest/globals';

describe('[A13] rack rearrange (사적 공간)', () => {
  describe('[A13.1] 항상 허용 (내 턴 무관)', () => {
    it.todo('내 랙 [R7,B7,Y7] + Y7 을 인덱스 0 으로 드래그 → [Y7,R7,B7]');
    // GREEN 기대값:
    // - state.players[mySeat].rack 순서 변경
    // - 보드/pending/server 영향 0
  });

  describe('[A13.2] OTHER_TURN 도 허용 (사적 공간)', () => {
    it.todo('다른 플레이어 턴에도 내 랙 재정렬 허용 (UR-01 disable 의 예외)');
  });

  describe('[A13.3] 보드 영향 없음 (INV-G2 무관)', () => {
    it.todo('rack 재정렬 후 board.tiles multiset 불변, INV-G2 영향 0');
  });
});
