/**
 * A4 — pending → 새 그룹 (split via new)
 *
 * SSOT 매핑:
 * - 56 §3.5 셀: A4 (PENDING_BOARD → NEW_GROUP)
 * - 룰 ID: UR-11, V-13b, D-01, D-12
 * - 상태 전이: S5 → S3 → S5
 * - 사용자 시나리오: F-05 (60 §1.2)
 */

import { describe, it } from '@jest/globals';

describe('[A4] [V-13b] pending → new group (split)', () => {
  describe('[A4.1] [V-13b] pending split — 출발 그룹에서 tile 제거 (atomic)', () => {
    it.todo('R7/B7/Y7 pending + R7 드래그 → new group → 출발 그룹 [B7,Y7], 새 그룹 [R7]');
    // GREEN 기대값:
    // - srcGroup.tiles.length === before - 1
    // - newGroup.tiles.length === 1
    // - INV-G2: tile code 중복 0
    // - 변경 atomic (race 없음)
  });

  describe('[A4.2] [V-02] 잔여 ≥3 정상', () => {
    it.todo('R7/B7/Y7/K7 4장 그룹 + R7 split → 출발 [B7,Y7,K7] (V-02 통과)');
  });

  describe('[A4.3] [UR-20] [V-02] 잔여 <3 invalid 표시 (ConfirmTurn 시 V-02 거부)', () => {
    it.todo('R7/B7/Y7 3장 그룹 + R7 split → 출발 [B7,Y7] (UR-20 점선 + invalid 마킹)');
    // band-aid 금지: 즉시 차단 X. ConfirmTurn 시점에서 V-02 가 거부 (UR-15 비활성)
  });

  describe('[A4.4] [D-01] [D-12] 새 그룹 pending- prefix ID', () => {
    it.todo('newGroup.id.match(/^pending-[0-9a-f-]{36}$/), 기존 ID 와 충돌 0 (INV-G1)');
  });

  describe('[A4.5] [INV-G3] 출발 그룹 빈 → 자동 정리', () => {
    it.todo('1장 짜리 pending 그룹에서 마지막 tile split → 출발 그룹 자동 제거');
  });
});
