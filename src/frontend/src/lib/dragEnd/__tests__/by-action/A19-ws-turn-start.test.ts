/**
 * A19 -- WS TURN_START
 *
 * SSOT 매핑:
 * - 56 section 3.19 셀: A19 (WS 수신)
 * - 룰 ID: UR-02, UR-04, V-08
 * - 상태 전이: -> S1 (mySeat) 또는 -> S0 (otherSeat)
 *
 * NOTE: WS 이벤트 핸들러는 store 레벨.
 *       순수 함수 applyTurnStart 를 정의하여 테스트한다.
 */

import { describe, it, expect, beforeEach } from "@jest/globals";
import type { TileCode, TableGroup } from "@/types/tile";
import { pendingGroup, resetGroupSeq } from "../test-helpers";

interface TurnStartInput {
  currentSeat: number;
  mySeat: number;
  pendingTableGroups: TableGroup[];
  pendingGroupIds: Set<string>;
}

interface TurnStartOutput {
  isMyTurn: boolean;
  nextPendingTableGroups: TableGroup[];
  nextPendingGroupIds: Set<string>;
  nextPendingRecoveredJokers: TileCode[];
}

// TODO: frontend-dev PR-D05 에서 구현
function applyTurnStart(input: TurnStartInput): TurnStartOutput {
  return {
    isMyTurn: input.currentSeat === input.mySeat,
    nextPendingTableGroups: [],
    nextPendingGroupIds: new Set(),
    nextPendingRecoveredJokers: [],
  };
}

describe("[A19] [V-08] [UR-02] [UR-04] WS TURN_START", () => {
  beforeEach(() => resetGroupSeq());

  describe("[A19.1] [V-08] [UR-02] mySeat 일치 -> S1", () => {
    it("TURN_START { currentSeat: mySeat } -> isMyTurn=true (S1)", () => {
      const result = applyTurnStart({
        currentSeat: 0,
        mySeat: 0,
        pendingTableGroups: [],
        pendingGroupIds: new Set(),
      });

      expect(result.isMyTurn).toBe(true);
    });
  });

  describe("[A19.2] [V-08] mySeat 불일치 -> S0", () => {
    it("TURN_START { currentSeat: otherSeat } -> isMyTurn=false (S0)", () => {
      const result = applyTurnStart({
        currentSeat: 1,
        mySeat: 0,
        pendingTableGroups: [],
        pendingGroupIds: new Set(),
      });

      expect(result.isMyTurn).toBe(false);
    });
  });

  describe("[A19.3] [UR-04] pendingTableGroups=[] 강제", () => {
    it("TURN_START 수신 -> pendingTableGroups=[], pendingGroupIds=empty (UR-04)", () => {
      // UR-04: TURN_START 수신 시 이전 턴 잔재 pending 강제 정리
      const pg = pendingGroup(["R7a", "B7a"] as TileCode[], "group");

      const result = applyTurnStart({
        currentSeat: 0,
        mySeat: 0,
        pendingTableGroups: [pg],
        pendingGroupIds: new Set([pg.id]),
      });

      expect(result.nextPendingTableGroups.length).toBe(0);
      expect(result.nextPendingGroupIds.size).toBe(0);
      expect(result.nextPendingRecoveredJokers.length).toBe(0);
    });
  });

  describe("[A19.4] [UR-04] S5/S6/S7 진행 중에도 TURN_START 우선", () => {
    it("S7 (COMMITTING) 중에도 TURN_START 수신 -> 강제 cleanup (서버 진실 우선)", () => {
      // S7 에서 TURN_START 수신 = 서버가 turnEnd + 다음 턴 시작을 보냄
      // 클라는 서버 진실을 우선하여 강제 cleanup
      const pg = pendingGroup(["K1a", "K2a", "K3a"] as TileCode[], "run");

      const result = applyTurnStart({
        currentSeat: 2,
        mySeat: 0,
        pendingTableGroups: [pg],
        pendingGroupIds: new Set([pg.id]),
      });

      // 무조건 cleanup
      expect(result.nextPendingTableGroups.length).toBe(0);
      expect(result.isMyTurn).toBe(false);
    });
  });
});
