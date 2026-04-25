/**
 * A4 -- pending -> 새 그룹 (split via new)
 *
 * SSOT 매핑:
 * - 56 section 3.5 셀: A4 (PENDING_BOARD -> NEW_GROUP)
 * - 룰 ID: UR-11, V-13b, D-01, D-12, V-02, UR-20
 */

import { describe, it, expect, beforeEach } from "@jest/globals";
import { dragEndReducer } from "../../dragEndReducer";
import type { TileCode } from "@/types/tile";
import {
  pendingGroup,
  makeInput,
  resetGroupSeq,
  expectAccepted,
  expectNoDuplicateTiles,
  expectNoEmptyGroups,
  expectUniqueGroupIds,
} from "../test-helpers";

describe("[A4] [V-13b] pending -> new group (split)", () => {
  beforeEach(() => resetGroupSeq());

  describe("[A4.1] [V-13b] pending split -- 출발 그룹에서 tile 제거 (atomic)", () => {
    it("R7/B7/Y7 pending + R7 드래그 -> new group -> 출발 [B7,Y7], 새 [R7]", () => {
      const pg = pendingGroup(["R7a", "B7a", "Y7a"] as TileCode[], "group");
      const pendingIds = new Set([pg.id]);

      const output = dragEndReducer(
        makeInput({
          tileCode: "R7a" as TileCode,
          source: { kind: "pending", groupId: pg.id, index: 0 },
          dest: { kind: "new-group" },
          tableGroups: [pg],
          myTiles: [],
          pendingGroupIds: pendingIds,
        })
      );

      expectAccepted(output);
      // 출발 그룹: B7, Y7 (2장)
      const srcGroup = output.nextTableGroups!.find((g) => g.id === pg.id);
      expect(srcGroup).toBeDefined();
      expect(srcGroup!.tiles.length).toBe(2);
      expect(srcGroup!.tiles).not.toContain("R7a");
      // 새 그룹: R7 (1장)
      const newGroup = output.nextTableGroups!.find((g) => g.id !== pg.id);
      expect(newGroup).toBeDefined();
      expect(newGroup!.tiles).toEqual(["R7a"]);
      // INV-G2
      expectNoDuplicateTiles(output.nextTableGroups!);
    });
  });

  describe("[A4.2] [V-02] 잔여 >= 3 정상", () => {
    it("R7/B7/Y7/K7 4장 그룹 + R7 split -> 출발 [B7,Y7,K7] (V-02 통과)", () => {
      const pg = pendingGroup(["R7a", "B7a", "Y7a", "K7a"] as TileCode[], "group");
      const pendingIds = new Set([pg.id]);

      const output = dragEndReducer(
        makeInput({
          tileCode: "R7a" as TileCode,
          source: { kind: "pending", groupId: pg.id, index: 0 },
          dest: { kind: "new-group" },
          tableGroups: [pg],
          myTiles: [],
          pendingGroupIds: pendingIds,
        })
      );

      expectAccepted(output);
      const srcGroup = output.nextTableGroups!.find((g) => g.id === pg.id);
      expect(srcGroup!.tiles.length).toBe(3); // V-02 통과
    });
  });

  describe("[A4.3] [UR-20] [V-02] 잔여 <3 invalid 표시 (ConfirmTurn 시 V-02 거부)", () => {
    it("R7/B7/Y7 3장 그룹 + R7 split -> 출발 [B7,Y7] (UR-20 점선 마킹)", () => {
      // UR-20: 잔여 < 3장이면 invalid 표시하되 즉시 차단 X
      // ConfirmTurn 시점에서 V-02 가 거부
      const pg = pendingGroup(["R7a", "B7a", "Y7a"] as TileCode[], "group");
      const pendingIds = new Set([pg.id]);

      const output = dragEndReducer(
        makeInput({
          tileCode: "R7a" as TileCode,
          source: { kind: "pending", groupId: pg.id, index: 0 },
          dest: { kind: "new-group" },
          tableGroups: [pg],
          myTiles: [],
          pendingGroupIds: pendingIds,
        })
      );

      expectAccepted(output);
      const srcGroup = output.nextTableGroups!.find((g) => g.id === pg.id);
      expect(srcGroup!.tiles.length).toBe(2); // < 3 -- UR-20 표시 대상
    });
  });

  describe("[A4.4] [D-01] [D-12] 새 그룹 pending- prefix ID", () => {
    it("newGroup.id pending- prefix, 기존 ID 와 충돌 0 (INV-G1)", () => {
      const pg = pendingGroup(["R7a", "B7a", "Y7a", "K7a"] as TileCode[], "group");
      const pendingIds = new Set([pg.id]);

      const output = dragEndReducer(
        makeInput({
          tileCode: "R7a" as TileCode,
          source: { kind: "pending", groupId: pg.id, index: 0 },
          dest: { kind: "new-group" },
          tableGroups: [pg],
          myTiles: [],
          pendingGroupIds: pendingIds,
        })
      );

      expectAccepted(output);
      const newGroup = output.nextTableGroups!.find((g) => g.id !== pg.id);
      expect(newGroup!.id.startsWith("pending-")).toBe(true);
      expectUniqueGroupIds(output.nextTableGroups!);
    });
  });

  describe("[A4.5] [INV-G3] 출발 그룹 빈 -> 자동 정리", () => {
    it("1장 짜리 pending 그룹에서 마지막 tile split -> 출발 그룹 자동 제거", () => {
      const pg = pendingGroup(["R7a"] as TileCode[], "group");
      const pendingIds = new Set([pg.id]);

      const output = dragEndReducer(
        makeInput({
          tileCode: "R7a" as TileCode,
          source: { kind: "pending", groupId: pg.id, index: 0 },
          dest: { kind: "new-group" },
          tableGroups: [pg],
          myTiles: [],
          pendingGroupIds: pendingIds,
        })
      );

      expectAccepted(output);
      // INV-G3: 빈 그룹 없음
      expectNoEmptyGroups(output.nextTableGroups!);
      // 출발 그룹 제거됨
      expect(output.nextTableGroups!.find((g) => g.id === pg.id)).toBeUndefined();
    });
  });
});
