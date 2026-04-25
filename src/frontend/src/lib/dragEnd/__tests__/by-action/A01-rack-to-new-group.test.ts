/**
 * A1 — 랙 → 보드 새 그룹 드롭 (rack-to-new-group)
 *
 * SSOT 매핑:
 * - 56 §3.2 셀: A1 (RACK → NEW_GROUP)
 * - 룰 ID: UR-06, UR-11, UR-15, V-08, D-01, D-12
 * - 상태 전이: S1 → S2 → S5
 * - 사용자 시나리오: F-02 (60 §1.2)
 *
 * RED→GREEN (G3 게이트):
 * - Day 1 (RED 초안): describe/it 골격 + TODO 주석
 * - Day 2~3 (RED commit): 실제 assertion 추가, CI RED 확인
 * - Day 4 (GREEN commit): frontend-dev PR-D03 머지 후 GREEN 확인
 *
 * band-aid 금지 (G2 게이트):
 * - source guard 동작 검증 X
 * - 단순 코드 분기 (`forceNewGroup` 플래그 등) 검증 X
 */

import { describe, it } from '@jest/globals';

describe('[A1] [V-08] [UR-06] rack → new group', () => {
  describe('[A1.1] [V-08] [UR-01] OTHER_TURN reject', () => {
    it.todo('rack tile 드래그 → new-group 드롭 시도 → 거절 (UR-01)');
  });

  describe('[A1.2] [UR-06] [UR-11] [D-12] MY_TURN PRE_MELD allow', () => {
    it.todo('내 턴 + hasInitialMeld=false → 새 pending 그룹 생성 (V-04 무관, 자기 랙만 사용)');
    // GREEN 기대값:
    // - state.pendingTableGroups.length === before.length + 1
    // - newGroup.id.startsWith("pending-") (D-12)
    // - newGroup.id 가 D-01 유니크
    // - state.players[mySeat].rack 에서 dragged tile 1개 제거
  });

  describe('[A1.3] [UR-06] [UR-11] [D-12] MY_TURN POST_MELD allow', () => {
    it.todo('내 턴 + hasInitialMeld=true → 새 pending 그룹 생성 (PRE_MELD 와 동일)');
  });

  describe('[A1.4] [D-01] [D-12] pending- prefix ID 발급', () => {
    it.todo('새 그룹 ID = "pending-{uuid v4}" 형식, 기존 그룹 ID 와 충돌 없음 (INV-G1)');
    // GREEN 기대값:
    // - newGroup.id.match(/^pending-[0-9a-f-]{36}$/) === non-null
    // - state.pendingTableGroups.map(g => g.id) 가 multiset 유니크
  });
});
