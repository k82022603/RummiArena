/**
 * A2 — 랙 → 보드 기존 pending 그룹 드롭 (rack-to-pending)
 *
 * SSOT 매핑:
 * - 56 §3.3 셀: A2 (RACK → PENDING_BOARD)
 * - 룰 ID: UR-14, UR-19, V-14, V-15, V-08
 * - 상태 전이: S5 → S2 → S5 (자기-루프)
 * - 사용자 시나리오: F-03 (60 §1.2)
 */

import { describe, it } from '@jest/globals';

describe('[A2] [UR-14] rack → pending group', () => {
  describe('[A2.1] [UR-14] [V-14] COMPAT 그룹 (같은 숫자, 다른 색)', () => {
    it.todo('R7 pending 그룹 + B7 rack 드롭 → 그룹 멤버 추가 (4색 한도 미달)');
    // GREEN 기대값:
    // - targetGroup.tiles.length === before + 1
    // - INV-G2: tile code 중복 0
    // - D-01: targetGroup.id 불변
  });

  describe('[A2.2] [UR-14] [V-15] COMPAT 런 앞 연장', () => {
    it.todo('R5/R6/R7 pending 런 + R4 rack 드롭 → 런 앞 연장');
  });

  describe('[A2.3] [UR-14] [V-15] COMPAT 런 뒤 연장', () => {
    it.todo('R5/R6/R7 pending 런 + R8 rack 드롭 → 런 뒤 연장');
  });

  describe('[A2.4] [UR-19] INCOMPAT 거절 (V-14 위반)', () => {
    it.todo('R7/B7/Y7 그룹 + R8 rack (다른 숫자) 드롭 → 거절, 토스트 X (UR-19 회색 표시)');
    // band-aid 금지: UR-19 시각 표시만, 토스트 노출 금지 (UR-21 은 INVALID_MOVE 만)
  });

  describe('[A2.5] [INV-G3] 빈 pending 그룹은 도달 불가 (자동 정리)', () => {
    it.todo('pending 그룹 .tiles=[] 는 setter 단계에서 즉시 제거 (D-03/INV-G3) — 본 셀 도달 자체 불가');
  });

  describe('[A2.6] [V-08] [UR-01] OTHER_TURN reject', () => {
    it.todo('다른 플레이어 턴 → rack 드래그 차단 (UR-01)');
  });
});
