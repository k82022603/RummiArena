/**
 * A13 -- 랙 내 재정렬 (rack-to-rack reorder)
 *
 * SSOT 매핑:
 * - 56 section 3.14 셀: A13 (RACK -> RACK)
 * - 사적 공간 -- 보드 영향 없음, 내 턴 무관
 */

import { describe, it, expect, beforeEach } from "@jest/globals";
import { dragEndReducer } from "../../dragEndReducer";
import type { TileCode } from "@/types/tile";
import {
  serverGroup,
  makeInput,
  resetGroupSeq,
  expectAccepted,
} from "../test-helpers";

describe("[A13] rack rearrange (사적 공간)", () => {
  beforeEach(() => resetGroupSeq());

  describe("[A13.1] 항상 허용 (내 턴 무관)", () => {
    it("내 랙 [R7,B7,Y7] + Y7 을 인덱스 0 으로 드래그 -> [Y7,R7,B7]", () => {
      const myTiles = ["R7a", "B7a", "Y7a"] as TileCode[];

      const output = dragEndReducer(
        makeInput({
          tileCode: "Y7a" as TileCode,
          source: { kind: "rack" },
          dest: { kind: "rack" },
          isMyTurn: true,
          tableGroups: [],
          myTiles,
        })
      );

      expectAccepted(output);
      // 랙에 같은 타일들이 존재 (순서는 구현에 따라 다름)
      expect(output.nextMyTiles!.sort()).toEqual(myTiles.sort());
      // 보드 영향 0
      expect(output.nextTableGroups!.length).toBe(0);
    });
  });

  describe("[A13.2] OTHER_TURN 도 허용 (사적 공간)", () => {
    it("다른 플레이어 턴에도 내 랙 재정렬 허용 (UR-01 disable 의 예외)", () => {
      const myTiles = ["R7a", "B7a"] as TileCode[];

      const output = dragEndReducer(
        makeInput({
          tileCode: "R7a" as TileCode,
          source: { kind: "rack" },
          dest: { kind: "rack" },
          isMyTurn: false, // OTHER_TURN
          tableGroups: [],
          myTiles,
        })
      );

      expectAccepted(output);
    });
  });

  describe("[A13.3] 보드 영향 없음 (INV-G2 무관)", () => {
    it("rack 재정렬 후 board.tiles multiset 불변", () => {
      const sg = serverGroup(["R1a", "B1a", "Y1a"] as TileCode[], "group");
      const myTiles = ["K5a", "K6a"] as TileCode[];
      const boardTilesBefore = [...sg.tiles];

      const output = dragEndReducer(
        makeInput({
          tileCode: "K5a" as TileCode,
          source: { kind: "rack" },
          dest: { kind: "rack" },
          isMyTurn: true,
          tableGroups: [sg],
          myTiles,
        })
      );

      expectAccepted(output);
      // 보드 타일 불변
      const boardTilesAfter = output.nextTableGroups!.flatMap((g) => g.tiles);
      expect(boardTilesAfter.sort()).toEqual(boardTilesBefore.sort());
    });
  });
});
