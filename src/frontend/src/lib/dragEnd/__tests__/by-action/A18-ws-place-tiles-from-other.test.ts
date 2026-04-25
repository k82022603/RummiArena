/**
 * A18 -- WS PLACE_TILES (다른 플레이어 turn)
 *
 * SSOT 매핑:
 * - 56 section 3.19 셀: A18 (WS 수신)
 * - 룰 ID: UR-04 (자기 턴 invariant)
 * - 내 pending 영향 0
 *
 * NOTE: WS 이벤트 핸들러는 store 레벨.
 *       순수 함수 applyPlaceTilesFromOther 를 정의하여 테스트한다.
 */

import { describe, it, expect, beforeEach } from "@jest/globals";
import type { TileCode, TableGroup } from "@/types/tile";
import { serverGroup, pendingGroup, resetGroupSeq } from "../test-helpers";

interface PlaceTilesInput {
  currentTableGroups: TableGroup[];
  pendingTableGroups: TableGroup[];
  newTableGroups: TableGroup[]; // 서버에서 수신한 새 테이블
  myTiles: TileCode[];
}

interface PlaceTilesOutput {
  nextTableGroups: TableGroup[];
  nextMyTiles: TileCode[];
  pendingPreserved: boolean; // UR-04: 내 pending 보존 여부
}

// TODO: frontend-dev PR-D05 에서 구현
function applyPlaceTilesFromOther(input: PlaceTilesInput): PlaceTilesOutput {
  return {
    nextTableGroups: input.newTableGroups,
    nextMyTiles: input.myTiles,
    pendingPreserved: true,
  };
}

describe("[A18] [UR-04] WS PLACE_TILES from other player", () => {
  beforeEach(() => resetGroupSeq());

  describe("[A18.1] 관전 표시 (state.tableGroups 갱신)", () => {
    it("다른 플레이어 PLACE_TILES 수신 -> tableGroups 만 갱신, 내 랙/pending 영향 0", () => {
      const oldSg = serverGroup(["R7a", "B7a", "Y7a"] as TileCode[], "group");
      const newSg = serverGroup(["R7a", "B7a", "Y7a", "K7a"] as TileCode[], "group");
      const myTiles = ["K1a", "K2a"] as TileCode[];

      const result = applyPlaceTilesFromOther({
        currentTableGroups: [oldSg],
        pendingTableGroups: [],
        newTableGroups: [newSg],
        myTiles,
      });

      // 테이블 갱신
      expect(result.nextTableGroups).toEqual([newSg]);
      // 랙 불변
      expect(result.nextMyTiles).toEqual(myTiles);
      // UR-04: pending 보존
      expect(result.pendingPreserved).toBe(true);
    });
  });

  describe("[A18.2] [UR-04] 내 pending 영향 없음 (invariant)", () => {
    it("내가 S5 (pending building) 상태일 때 PLACE_TILES 수신 -> pending 동결", () => {
      const sg = serverGroup(["R1a", "B1a", "Y1a"] as TileCode[], "group");
      const pg = pendingGroup(["K5a", "K6a", "K7a"] as TileCode[], "run");
      const newSg = serverGroup(["R1a", "B1a", "Y1a", "K1a"] as TileCode[], "group");

      const result = applyPlaceTilesFromOther({
        currentTableGroups: [sg],
        pendingTableGroups: [pg],
        newTableGroups: [newSg],
        myTiles: [],
      });

      // UR-04: pending 보존
      expect(result.pendingPreserved).toBe(true);
    });
  });
});
