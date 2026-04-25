/**
 * A14 -- ConfirmTurn (턴 확정)
 *
 * SSOT 매핑:
 * - 56 section 3.15 셀: A14 (사용자 ConfirmTurn 클릭)
 * - 룰 ID: UR-15, V-01, V-02, V-03, V-04, V-14, V-15
 *
 * 본 테스트는 클라 사전검증 (ConfirmTurn 활성/비활성) 단위.
 * dragEndReducer 의 범위를 넘어가는 부분이므로 canConfirmTurn 헬퍼를 테스트.
 * 서버 검증 (V-* 응답) 단위는 Go testify.
 *
 * NOTE: 현재 canConfirmTurn 은 아직 추출되지 않은 상태.
 *       본 테스트는 RED spec 으로 기대 시그니처를 정의한다.
 */

import { describe, it, expect, beforeEach } from "@jest/globals";
import type { TileCode, TableGroup } from "@/types/tile";
import { pendingGroup, serverGroup, resetGroupSeq } from "../test-helpers";

/**
 * canConfirmTurn 순수 함수 시그니처 (RED spec)
 * 실제 구현은 frontend-dev PR-D04 에서 채운다.
 */
interface ConfirmTurnInput {
  pendingTableGroups: TableGroup[];
  pendingGroupIds: Set<string>;
  hasInitialMeld: boolean;
  pendingRecoveredJokers: TileCode[];
  /** 이번 턴에 랙에서 보드로 추가한 타일 수 */
  tilesAddedCount: number;
}

// TODO: frontend-dev PR-D04 에서 구현 후 import 경로 교체
function canConfirmTurn(_input: ConfirmTurnInput): { enabled: boolean; reason?: string } {
  // RED stub
  return { enabled: false, reason: "NOT_IMPLEMENTED" };
}

describe("[A14] [UR-15] ConfirmTurn (S5/S6 -> S7)", () => {
  beforeEach(() => resetGroupSeq());

  describe("[A14.1] [UR-15] [V-03] pending=0 -> 비활성 (V-03 클라 미러)", () => {
    it("pending=0 -> ConfirmTurn 버튼 disabled (UR-15)", () => {
      const result = canConfirmTurn({
        pendingTableGroups: [],
        pendingGroupIds: new Set(),
        hasInitialMeld: true,
        pendingRecoveredJokers: [],
        tilesAddedCount: 0,
      });

      expect(result.enabled).toBe(false);
    });
  });

  describe("[A14.2] [UR-15] [V-03] pending>=1 + tilesAdded=0 -> 비활성", () => {
    it("pending 그룹 있으나 rack->board 추가 0 -> 비활성 (V-03 재배치만)", () => {
      const pg = pendingGroup(["R7a", "B7a", "Y7a"] as TileCode[], "group");
      const result = canConfirmTurn({
        pendingTableGroups: [pg],
        pendingGroupIds: new Set([pg.id]),
        hasInitialMeld: true,
        pendingRecoveredJokers: [],
        tilesAddedCount: 0, // 재배치만, 새 타일 추가 없음
      });

      expect(result.enabled).toBe(false);
    });
  });

  describe("[A14.3] [UR-15] [V-01] [V-02] [V-14] [V-15] 클라 사전검증 fail -> 비활성", () => {
    it("pending [R7,B7] (2장, V-02 위반) -> 비활성", () => {
      const pg = pendingGroup(["R7a", "B7a"] as TileCode[], "group");
      const result = canConfirmTurn({
        pendingTableGroups: [pg],
        pendingGroupIds: new Set([pg.id]),
        hasInitialMeld: true,
        pendingRecoveredJokers: [],
        tilesAddedCount: 2,
      });

      // V-02: 그룹은 최소 3장
      expect(result.enabled).toBe(false);
    });
  });

  describe("[A14.4] [UR-15] [V-04] [UR-30] PRE_MELD <30 -> 비활성", () => {
    it("hasInitialMeld=false + 합계 25점 < 30 -> 비활성 (UR-30 안내)", () => {
      // V-04: 최초 등록은 30점 이상
      // R7 + B7 + Y7 = 21점 < 30
      const pg = pendingGroup(["R7a", "B7a", "Y7a"] as TileCode[], "group");
      const result = canConfirmTurn({
        pendingTableGroups: [pg],
        pendingGroupIds: new Set([pg.id]),
        hasInitialMeld: false,
        pendingRecoveredJokers: [],
        tilesAddedCount: 3,
      });

      expect(result.enabled).toBe(false);
    });
  });

  describe("[A14.5] [UR-15] OK 활성 -> WS CONFIRM_TURN 송신 (S5/S6 -> S7)", () => {
    it("모든 사전조건 통과 -> enabled=true", () => {
      // R10 + B10 + Y10 = 30점 >= 30 (V-04 통과)
      const pg = pendingGroup(["R10a", "B10a", "Y10a"] as TileCode[], "group");
      const result = canConfirmTurn({
        pendingTableGroups: [pg],
        pendingGroupIds: new Set([pg.id]),
        hasInitialMeld: false,
        pendingRecoveredJokers: [],
        tilesAddedCount: 3,
      });

      expect(result.enabled).toBe(true);
    });
  });

  describe("[A14.6] [UR-21] OK INVALID_MOVE 응답 -> S8", () => {
    it("서버가 INVALID_MOVE 반환 -> 롤백 필요 (A21 에서 상세 검증)", () => {
      // 본 테스트는 ConfirmTurn 이후 INVALID_MOVE 수신 시나리오의 존재만 확인
      // 실제 검증은 A21 테스트에서 수행
      expect(true).toBe(true); // placeholder -- A21 참조
    });
  });

  describe("[A14.7] [V-19] 송신 중 race UI 잠금 (S7 invariant)", () => {
    it("S7 진입 후 30s 내 응답 없음 -> timeout 필요 (S7 invariant)", () => {
      // S7 (COMMITTING) 상태에서는 추가 입력 차단 (race condition 방지)
      // 본 테스트는 canConfirmTurn 범위가 아니므로 상위 store 테스트에서 검증
      expect(true).toBe(true); // placeholder -- store/state-machine 참조
    });
  });
});
