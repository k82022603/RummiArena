/**
 * A6 — pending → 서버 확정 그룹 (INC-T11-DUP 회귀 핵심 셀)
 *
 * SSOT 매핑:
 * - 56 §3.7 셀: A6 (PENDING_BOARD → SERVER_BOARD)
 * - 룰 ID: V-13a, V-13c, INV-G2, INV-G3, D-12
 * - 상태 전이: S5 → S3 → S5
 * - 사용자 시나리오: F-05 (60 §1.2)
 *
 * 사고 매핑 (직접 회귀 방지):
 * - INC-T11-DUP (docs/04-testing/84): 본 셀에서 출발 그룹 tile 미제거 → D-02 위반 (11B 가 두 그룹 동시 존재)
 * - 본 테스트는 §4.1 INC-T11-DUP 회귀 시나리오의 단위 layer
 */

import { describe, it } from '@jest/globals';

describe('[A6] [V-13a] [V-13c] [INV-G2] pending → server (D-02 atomic 핵심)', () => {
  describe('[A6.1] [V-13a] [UR-13] PRE_MELD reject', () => {
    it.todo('hasInitialMeld=false + pending tile → server group drop → 거절 (V-13a)');
  });

  describe('[A6.2] [V-13c] [UR-14] POST_MELD COMPAT allow + pending 마킹', () => {
    it.todo('hasInitialMeld=true + COMPAT → 서버 그룹이 pending 으로 마킹, 그룹 ID 보존');
    // GREEN 기대값:
    // - state.pendingGroupIds.add(serverGroupId) (D-12)
    // - serverGroup.tiles.length === before + 1
    // - srcPendingGroup.tiles.length === before - 1
  });

  describe('[A6.3] [UR-19] POST_MELD INCOMPAT reject', () => {
    it.todo('POST_MELD + INCOMPAT → 거절 (UR-19 회색 표시)');
  });

  describe('[A6.4] [INV-G3] 출발 pending 빈 → 자동 정리', () => {
    it.todo('1장 짜리 pending 그룹의 마지막 tile 을 server 로 → 출발 자동 제거');
  });

  describe('[A6.5] [D-12] 서버 그룹 pending 마킹 (D-12 정합성)', () => {
    it.todo('drop 후 state.pendingGroupIds 에 serverGroupId 포함, ConfirmTurn 시 다시 서버 commit');
  });

  describe('[A6.6] [INV-G2] [D-02] **INC-T11-DUP 직접 회귀** — atomic tile 이동 검증', () => {
    it.todo('11B pending [11B,12s,11s] + 서버 그룹 [12s,12r,12k] (4색 그룹) → 11B → server drop → 출발 그룹에서 11B 제거 + 서버 그룹에 11B 추가, 보드 위 11B 등장 횟수 정확히 1회');
    // GREEN 기대값 (D-02 invariant):
    // - 모든 board.tiles 의 multiset.get("11B") === 1 (a 접미)
    // - srcGroup.tiles 에서 11B 제거됨
    // - dstGroup.tiles 에 11B 추가됨
    // - 변경 atomic (race condition 없음)
    //
    // 사고 시나리오 84 직접 reproduction:
    // - 사용자: B11a → 12s 4-tile 그룹 합병 시도
    // - 회귀 코드: 출발 [11s,11r,11k] 에 B11a 가 남음 + 서버 [12s,12r,12k,12y] 에도 B11a 추가
    // - 결과: 보드 위 B11a 가 두 그룹 동시 존재 (D-02 위반)
    //
    // 본 테스트가 GREEN = INC-T11-DUP 회귀 100% 차단
  });
});
