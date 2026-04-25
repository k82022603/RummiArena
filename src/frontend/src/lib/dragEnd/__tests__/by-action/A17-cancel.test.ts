/**
 * A17 — 드래그 취소 (esc / onDragCancel)
 *
 * SSOT 매핑:
 * - 56 §3.18 셀: A17 (드래그 중 ESC 키 또는 dnd-kit onDragCancel)
 * - 룰 ID: UR-17, INV-G1, INV-G2
 * - 상태 전이: S2/S3/S4 → S1/S5
 * - 사용자 시나리오: F-12 (60 §1.2)
 */

import { describe, it } from '@jest/globals';

describe('[A17] [UR-17] cancel (S2/S3/S4 → S1/S5)', () => {
  describe('[A17.1] [UR-17] S2/S3/S4 → 원위치 (state 변경 0)', () => {
    it.todo('드래그 중 ESC 또는 onDragCancel → state === 직전 상태 (S5 또는 S1)');
    // GREEN 기대값:
    // - 어떠한 setState 호출 없음 (D-01/D-02 invariant 보호)
    // - state.pendingTableGroups === before
    // - state.players[mySeat].rack === before
  });

  describe('[A17.2] [UR-17] state 변경 0 (D-01/D-02 invariant 유지)', () => {
    it.todo('cancel 경로에서 어떠한 store mutation 도 발생 X');
    // band-aid 금지: cancel 처리에 source guard / invariant validator 사용 X
  });

  describe('[A17.3] [INV-G1] [INV-G2] cancel 후 invariant 유지', () => {
    it.todo('cancel 후 모든 board.tiles multiset 유니크 (INV-G2), 모든 group.id 유니크 (INV-G1)');
  });
});
