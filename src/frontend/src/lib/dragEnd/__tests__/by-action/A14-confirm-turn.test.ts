/**
 * A14 — ConfirmTurn (턴 확정)
 *
 * SSOT 매핑:
 * - 56 §3.15 셀: A14 (사용자 ConfirmTurn 클릭)
 * - 룰 ID: UR-15, V-01, V-02, V-03, V-04, V-14, V-15
 * - 상태 전이: S5/S6 → S7 → End / S8
 * - 사용자 시나리오: F-09 (60 §1.2)
 *
 * 본 테스트는 클라 사전검증 (ConfirmTurn 활성/비활성 + WS 송신) 단위.
 * 서버 검증 (V-* 응답) 단위는 §2.3 Go testify.
 */

import { describe, it } from '@jest/globals';

describe('[A14] [UR-15] ConfirmTurn (S5/S6 → S7)', () => {
  describe('[A14.1] [UR-15] [V-03] pending=0 → 비활성 (V-03 클라 미러)', () => {
    it.todo('pending=0 → ConfirmTurn 버튼 disabled (UR-15)');
  });

  describe('[A14.2] [UR-15] [V-03] pending≥1 + tilesAdded=0 → 비활성', () => {
    it.todo('pending 그룹은 있으나 rack→board 추가 0 → ConfirmTurn 비활성 (V-03 단순 재배치 금지)');
  });

  describe('[A14.3] [UR-15] [V-01] [V-02] [V-14] [V-15] 클라 사전검증 fail → 비활성', () => {
    it.todo('pending [R7,B7] (2장, V-02 위반) → ConfirmTurn 비활성');
  });

  describe('[A14.4] [UR-15] [V-04] [UR-30] PRE_MELD <30 → 비활성', () => {
    it.todo('hasInitialMeld=false + 합계 25점 < 30 → ConfirmTurn 비활성 (UR-30 안내)');
  });

  describe('[A14.5] [UR-15] OK 활성 → WS CONFIRM_TURN 송신 (S5/S6 → S7)', () => {
    it.todo('모든 사전조건 통과 → 클릭 → WS CONFIRM_TURN 송신, state 전이 S7 (UI lock)');
    // GREEN 기대값:
    // - WS message 송신 (CONFIRM_TURN type)
    // - state === S7 (COMMITTING)
    // - UI 입력 disabled (race condition 방지)
  });

  describe('[A14.6] [UR-21] OK INVALID_MOVE 응답 → S8', () => {
    it.todo('서버가 INVALID_MOVE 반환 → state 전이 S8, 토스트 + 스냅샷 롤백');
  });

  describe('[A14.7] [V-19] 송신 중 race UI 잠금 (S7 invariant)', () => {
    it.todo('S7 진입 후 30s 내 응답 없음 → timeout 강제 S8 (응답 후 두 번 클릭 방지)');
  });
});
