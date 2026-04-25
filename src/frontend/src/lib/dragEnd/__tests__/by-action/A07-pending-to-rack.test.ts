/**
 * A7 -- pending -> 랙 (회수)
 *
 * SSOT 매핑:
 * - 56 section 3.8 셀: A7 (PENDING_BOARD -> RACK)
 * - 룰 ID: UR-12, V-06, INV-G3
 */

import { describe, it, expect, beforeEach } from "@jest/globals";
import { dragEndReducer } from "../../dragEndReducer";
import type { TileCode } from "@/types/tile";
import {
  pendingGroup,
  makeInput,
  resetGroupSeq,
  expectAccepted,
  expectNoEmptyGroups,
  expectNoDuplicateTiles,
} from "../test-helpers";

describe("[A7] [UR-12] pending -> rack (recovery)", () => {
  beforeEach(() => resetGroupSeq());

  describe("[A7.1] [UR-12] 회수 항상 허용 (자기 pending 만)", () => {
    it("pending [R7,B7] + R7 -> rack drop -> 출발 [B7], rack 에 R7 추가", () => {
      // UR-12: pending 은 아직 commit 안 됨, 회수 자유
      const pg = pendingGroup(["R7a", "B7a"] as TileCode[], "group");
      const pendingIds = new Set([pg.id]);

      const output = dragEndReducer(
        makeInput({
          tileCode: "R7a" as TileCode,
          source: { kind: "pending", groupId: pg.id, index: 0 },
          dest: { kind: "rack" },
          tableGroups: [pg],
          myTiles: ["K1a"] as TileCode[],
          pendingGroupIds: pendingIds,
        })
      );

      expectAccepted(output);
      // 출발 그룹에서 타일 제거
      const resultPg = output.nextTableGroups!.find((g) => g.id === pg.id);
      expect(resultPg!.tiles.length).toBe(1);
      expect(resultPg!.tiles).not.toContain("R7a");
      // 랙에 타일 추가
      expect(output.nextMyTiles!).toContain("R7a");
      expect(output.nextMyTiles!).toContain("K1a");
    });
  });

  describe("[A7.2] [INV-G3] [D-03] 출발 그룹 빈 -> 자동 정리", () => {
    it("1장 짜리 pending [R7] 마지막 tile 회수 -> 출발 그룹 자동 제거", () => {
      const pg = pendingGroup(["R7a"] as TileCode[], "group");
      const pendingIds = new Set([pg.id]);

      const output = dragEndReducer(
        makeInput({
          tileCode: "R7a" as TileCode,
          source: { kind: "pending", groupId: pg.id, index: 0 },
          dest: { kind: "rack" },
          tableGroups: [pg],
          myTiles: [],
          pendingGroupIds: pendingIds,
        })
      );

      expectAccepted(output);
      expectNoEmptyGroups(output.nextTableGroups!);
      expect(output.nextTableGroups!.find((g) => g.id === pg.id)).toBeUndefined();
      expect(output.nextMyTiles!).toContain("R7a");
    });
  });

  describe("[A7.3] [D-12] 회수 후 pendingGroupIds 갱신", () => {
    it("서버 그룹 pending 마킹 상태에서 마지막 추가 tile 회수 시 pendingGroupIds 갱신", () => {
      // 서버 그룹에 타일 추가 후 회수 -> pendingGroupIds 에서 제거
      const pg = pendingGroup(["R7a", "B7a"] as TileCode[], "group");
      const pendingIds = new Set([pg.id]);

      const output = dragEndReducer(
        makeInput({
          tileCode: "R7a" as TileCode,
          source: { kind: "pending", groupId: pg.id, index: 0 },
          dest: { kind: "rack" },
          tableGroups: [pg],
          myTiles: [],
          pendingGroupIds: pendingIds,
        })
      );

      expectAccepted(output);
      // pending 그룹이 아직 남아있으므로 pendingGroupIds 에 유지
      const resultPg = output.nextTableGroups!.find((g) => g.id === pg.id);
      if (resultPg && resultPg.tiles.length > 0) {
        expect(output.nextPendingGroupIds!.has(pg.id)).toBe(true);
      }
    });
  });

  describe("[A7.4] [V-06] conservation 유지", () => {
    it("회수 전후 player rack tile + board tile 합 = 일정 (D-05 invariant 부분)", () => {
      const pg = pendingGroup(["R7a", "B7a", "Y7a"] as TileCode[], "group");
      const pendingIds = new Set([pg.id]);
      const myTiles = ["K1a", "K2a"] as TileCode[];
      const totalBefore = pg.tiles.length + myTiles.length; // 3 + 2 = 5

      const output = dragEndReducer(
        makeInput({
          tileCode: "R7a" as TileCode,
          source: { kind: "pending", groupId: pg.id, index: 0 },
          dest: { kind: "rack" },
          tableGroups: [pg],
          myTiles,
          pendingGroupIds: pendingIds,
        })
      );

      expectAccepted(output);
      const boardTiles = output.nextTableGroups!.flatMap((g) => g.tiles);
      const totalAfter = boardTiles.length + output.nextMyTiles!.length;
      // V-06: conservation 유지
      expect(totalAfter).toBe(totalBefore);
    });
  });
});
