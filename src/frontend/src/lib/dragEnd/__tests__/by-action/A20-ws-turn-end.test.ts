/**
 * A20 -- WS TURN_END
 *
 * SSOT 매핑:
 * - 56 section 3.19 셀: A20 (WS 수신)
 * - 룰 ID: UR-05, UR-27
 * - 상태 전이: -> S0 (또는 End -> 다음 TURN_START 대기)
 */

import { describe, it, expect, beforeEach } from "@jest/globals";
import type { TileCode, TableGroup } from "@/types/tile";
import { serverGroup, resetGroupSeq } from "../test-helpers";

interface TurnEndInput {
  reason: "OK" | "WIN" | "ALL_PASS" | "TIMEOUT";
  newTableGroups: TableGroup[];
  pendingTableGroups: TableGroup[];
  pendingGroupIds: Set<string>;
}

interface TurnEndOutput {
  nextTableGroups: TableGroup[];
  nextPendingTableGroups: TableGroup[];
  nextPendingGroupIds: Set<string>;
  gameOverReason: string | null;
}

// TODO: frontend-dev PR-D05 에서 구현
function applyTurnEnd(input: TurnEndInput): TurnEndOutput {
  return {
    nextTableGroups: input.newTableGroups,
    nextPendingTableGroups: [],
    nextPendingGroupIds: new Set(),
    gameOverReason: input.reason === "WIN" || input.reason === "ALL_PASS" ? input.reason : null,
  };
}

describe("[A20] [UR-05] WS TURN_END", () => {
  beforeEach(() => resetGroupSeq());

  describe("[A20.1] [UR-05] TURN_END OK -> S0/S1", () => {
    it('TURN_END { reason: "OK" } -> pendingTableGroups=[], tableGroups 갱신', () => {
      const newSg = serverGroup(["R7a", "B7a", "Y7a", "K7a"] as TileCode[], "group");

      const result = applyTurnEnd({
        reason: "OK",
        newTableGroups: [newSg],
        pendingTableGroups: [],
        pendingGroupIds: new Set(),
      });

      expect(result.nextTableGroups).toEqual([newSg]);
      expect(result.nextPendingTableGroups.length).toBe(0);
      expect(result.nextPendingGroupIds.size).toBe(0);
      expect(result.gameOverReason).toBeNull();
    });
  });

  describe("[A20.2] cleanup (S0 invariant 진입)", () => {
    it("TURN_END 후 모든 drag state 초기화", () => {
      const result = applyTurnEnd({
        reason: "OK",
        newTableGroups: [],
        pendingTableGroups: [],
        pendingGroupIds: new Set(),
      });

      expect(result.nextPendingTableGroups.length).toBe(0);
      expect(result.nextPendingGroupIds.size).toBe(0);
    });
  });

  describe("[A20.3] [UR-27] WIN/ALL_PASS reason 분기", () => {
    it('TURN_END { reason: "WIN" } -> GAME_OVER, reason: "ALL_PASS" -> UR-27 안내', () => {
      const resultWin = applyTurnEnd({
        reason: "WIN",
        newTableGroups: [],
        pendingTableGroups: [],
        pendingGroupIds: new Set(),
      });

      expect(resultWin.gameOverReason).toBe("WIN");

      const resultAllPass = applyTurnEnd({
        reason: "ALL_PASS",
        newTableGroups: [],
        pendingTableGroups: [],
        pendingGroupIds: new Set(),
      });

      expect(resultAllPass.gameOverReason).toBe("ALL_PASS");
    });
  });
});
