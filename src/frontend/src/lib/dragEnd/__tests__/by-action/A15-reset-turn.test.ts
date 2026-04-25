/**
 * A15 -- RESET_TURN (되돌리기)
 *
 * SSOT 매핑:
 * - 56 section 3.16 셀: A15 (RESET_TURN 클릭)
 * - 룰 ID: UR-16
 * - 상태 전이: S5/S6 -> S1
 *
 * NOTE: resetTurn 은 store 레벨 동작. dragEndReducer 범위를 넘어가지만,
 *       순수 함수 resetTurnState 를 정의하여 테스트한다.
 */

import { describe, it, expect, beforeEach } from "@jest/globals";
import type { TileCode, TableGroup } from "@/types/tile";
import { pendingGroup, serverGroup, resetGroupSeq } from "../test-helpers";

/**
 * resetTurnState 순수 함수 시그니처 (RED spec)
 */
interface ResetTurnInput {
  pendingTableGroups: TableGroup[];
  pendingGroupIds: Set<string>;
  serverTableGroups: TableGroup[]; // TURN_START 시점 서버 그룹
  turnStartMyTiles: TileCode[];   // TURN_START 시점 랙
}

interface ResetTurnOutput {
  nextTableGroups: TableGroup[];
  nextMyTiles: TileCode[];
  nextPendingGroupIds: Set<string>;
  nextPendingRecoveredJokers: TileCode[];
}

// TODO: frontend-dev PR-D04 에서 구현
function resetTurnState(_input: ResetTurnInput): ResetTurnOutput {
  return {
    nextTableGroups: _input.serverTableGroups,
    nextMyTiles: _input.turnStartMyTiles,
    nextPendingGroupIds: new Set(),
    nextPendingRecoveredJokers: [],
  };
}

describe("[A15] [UR-16] RESET_TURN (S5/S6 -> S1)", () => {
  beforeEach(() => resetGroupSeq());

  describe("[A15.1] [UR-16] S5/S6 -> S1 전이", () => {
    it("pending [R7,B7,Y7] + RESET -> pendingTableGroups=[], 랙 복원", () => {
      // UR-16: RESET 은 pending 을 0 으로 만들고 랙 복원
      const sg = serverGroup(["R1a", "B1a", "Y1a"] as TileCode[], "group");
      const pg = pendingGroup(["R7a", "B7a", "Y7a"] as TileCode[], "group");
      const turnStartMyTiles = ["R7a", "B7a", "Y7a", "K5a"] as TileCode[];

      const result = resetTurnState({
        pendingTableGroups: [pg],
        pendingGroupIds: new Set([pg.id]),
        serverTableGroups: [sg],
        turnStartMyTiles,
      });

      // pending 0
      expect(result.nextPendingGroupIds.size).toBe(0);
      // 랙 복원
      expect(result.nextMyTiles).toEqual(turnStartMyTiles);
      // 서버 그룹 그대로
      expect(result.nextTableGroups).toEqual([sg]);
    });
  });

  describe("[A15.2] [UR-16] pendingTableGroups=[] (cleanup)", () => {
    it("RESET 후 pendingTableGroups 완전 비움, pendingGroupIds 도 비움", () => {
      const sg = serverGroup(["R1a", "B1a", "Y1a"] as TileCode[], "group");

      const result = resetTurnState({
        pendingTableGroups: [],
        pendingGroupIds: new Set(),
        serverTableGroups: [sg],
        turnStartMyTiles: ["K5a"] as TileCode[],
      });

      expect(result.nextPendingGroupIds.size).toBe(0);
      expect(result.nextPendingRecoveredJokers.length).toBe(0);
    });
  });

  describe("[A15.3] [D-12] pending -> server 매핑 정합성 유지", () => {
    it("RESET 후 server tableGroups 는 그대로 (TURN_START 시점), pending 마킹만 제거", () => {
      const sg1 = serverGroup(["R1a", "B1a", "Y1a"] as TileCode[], "group");
      const sg2 = serverGroup(["R5a", "R6a", "R7a"] as TileCode[], "run");

      const result = resetTurnState({
        pendingTableGroups: [],
        pendingGroupIds: new Set([sg1.id]), // sg1 이 pending 마킹되어 있었음
        serverTableGroups: [sg1, sg2],
        turnStartMyTiles: [],
      });

      // 서버 그룹 복원
      expect(result.nextTableGroups.length).toBe(2);
      expect(result.nextTableGroups.find((g) => g.id === sg1.id)).toBeDefined();
      expect(result.nextTableGroups.find((g) => g.id === sg2.id)).toBeDefined();
      // pending 마킹 제거
      expect(result.nextPendingGroupIds.size).toBe(0);
    });
  });
});
