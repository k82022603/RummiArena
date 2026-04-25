/**
 * A13 -- 랙 내 재정렬 (rack-to-rack reorder)
 *
 * SSOT 매핑:
 * - 56 section 3.14 셀: A13 (RACK -> RACK)
 * - 사적 공간 -- 보드 영향 없음, 내 턴 무관
 *
 * NOTE: dragEndReducer 에서 rack source + overId="player-rack" 는
 *       pending 그룹에서 해당 타일을 찾아 랙으로 회수하는 경로이다.
 *       pending 그룹에 해당 타일이 없으면 source-not-found 로 거절.
 *       순수 랙 내 재정렬은 UI 레이어(dnd-kit) 단독 처리.
 */

import { describe, it, expect, beforeEach } from "@jest/globals";
import { dragEndReducer } from "../../dragEndReducer";
import type { TileCode } from "@/types/tile";
import {
  serverGroup,
  pendingGroup,
  makeReducerArgs,
  resetGroupSeq,
  expectAccepted,
  expectRejected,
} from "../test-helpers";

describe("[A13] rack rearrange (사적 공간)", () => {
  beforeEach(() => resetGroupSeq());

  describe("[A13.1] rack -> rack 경로: pending 에 타일이 없으면 source-not-found", () => {
    it("pending 그룹 없이 rack tile 을 rack 에 drop -> source-not-found 거절", () => {
      const myTiles = ["R7a", "B7a", "Y7a"] as TileCode[];

      const [state, input] = makeReducerArgs({
        tileCode: "Y7a" as TileCode,
        source: { kind: "rack" },
        dest: { kind: "rack" },
        tableGroups: [],
        myTiles,
      });
      const output = dragEndReducer(state, input);

      // pending 에 Y7a 없음 -> source-not-found
      expectRejected(output, "source-not-found");
    });
  });

  describe("[A13.2] rack -> rack 경로: pending 에 타일이 있으면 회수", () => {
    it("pending 그룹에 R7a 포함 + rack source R7a drop on rack -> pending 에서 회수", () => {
      const pg = pendingGroup(["R7a", "B7a"] as TileCode[], "group");
      const pendingIds = new Set([pg.id]);
      const myTiles = ["K5a", "K6a"] as TileCode[];

      const [state, input] = makeReducerArgs({
        tileCode: "R7a" as TileCode,
        source: { kind: "rack" },
        dest: { kind: "rack" },
        tableGroups: [pg],
        myTiles,
        pendingGroupIds: pendingIds,
      });
      const output = dragEndReducer(state, input);

      expectAccepted(output);
      // pending 에서 R7a 제거
      const resultPg = output.nextTableGroups!.find((g) => g.id === pg.id);
      expect(resultPg!.tiles).not.toContain("R7a");
      // 랙에 R7a 추가
      expect(output.nextMyTiles!).toContain("R7a");
      expect(output.nextMyTiles!).toContain("K5a");
    });
  });

  describe("[A13.3] 보드 영향 확인 (서버 그룹 불변)", () => {
    it("rack -> rack 회수 시 서버 그룹 tiles 불변", () => {
      const sg = serverGroup(["R1a", "B1a", "Y1a"] as TileCode[], "group");
      const pg = pendingGroup(["K5a", "K6a"] as TileCode[], "run");
      const pendingIds = new Set([pg.id]);
      const boardTilesBefore = [...sg.tiles, ...pg.tiles];

      const [state, input] = makeReducerArgs({
        tileCode: "K5a" as TileCode,
        source: { kind: "rack" },
        dest: { kind: "rack" },
        tableGroups: [sg, pg],
        myTiles: ["R9a"] as TileCode[],
        pendingGroupIds: pendingIds,
      });
      const output = dragEndReducer(state, input);

      expectAccepted(output);
      // 서버 그룹 타일 불변
      const resultSg = output.nextTableGroups!.find((g) => g.id === sg.id);
      expect(resultSg!.tiles).toEqual(sg.tiles);
    });
  });
});
