/**
 * A5 — pending → 다른 pending (merge pending)
 *
 * SSOT 매핑:
 * - 56 §3.6 셀: A5 (PENDING_BOARD → PENDING_BOARD)
 * - 룰 ID: UR-14, V-13c, INV-G3, D-01
 * - 상태 전이: S5 → S3 → S5
 * - 사용자 시나리오: F-05 (60 §1.2)
 */

import { describe, it } from '@jest/globals';

describe('[A5] [V-13c] pending → pending (merge)', () => {
  describe('[A5.1] [UR-14] [V-13c] COMPAT merge', () => {
    it.todo('pending [R7,B7] + 다른 pending [Y7] → R7 드래그 후 [Y7] 그룹에 추가 → [Y7,R7,B7] 4장');
    // GREEN 기대값:
    // - dst.tiles.length === before(dst) + 1
    // - src.tiles.length === before(src) - 1
    // - INV-G2: tile code 중복 0
    // - INV-G1: 양쪽 ID 유니크 유지 (병합 후 src 가 빈 그룹이면 INV-G3 로 자동 제거)
  });

  describe('[A5.2] [UR-19] [V-13c] INCOMPAT reject', () => {
    it.todo('pending [R7,B7] + 다른 pending [R5,R6,R7] (run) → R8 드래그 후 [R7,B7] 에 시도 → 거절');
    // band-aid 금지: 토스트 X, UR-19 시각 표시만
  });

  describe('[A5.3] [INV-G3] 출발 그룹 빈 → 자동 정리', () => {
    it.todo('pending [R7] (1장) + 다른 pending → R7 merge → src 자동 제거');
  });

  describe('[A5.4] [D-01] [D-12] 양쪽 pending- ID 정합성', () => {
    it.todo('merge 후 dst.id 보존, src.id 제거 (INV-G1 유지)');
  });
});
