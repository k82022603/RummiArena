/**
 * A5 -- pending -> 다른 pending (merge pending)
 *
 * SSOT 매핑:
 * - 56 section 3.6 셀: A5 (PENDING_BOARD -> PENDING_BOARD)
 * - 룰 ID: UR-14, V-13c, INV-G3, D-01
 */

import { describe, it, expect, beforeEach } from "@jest/globals";
import { dragEndReducer } from "../../dragEndReducer";
import type { TileCode } from "@/types/tile";
import {
  pendingGroup,
  makeInput,
  resetGroupSeq,
  expectRejected,
  expectAccepted,
  expectNoDuplicateTiles,
  expectNoEmptyGroups,
  expectUniqueGroupIds,
} from "../test-helpers";

describe("[A5] [V-13c] pending -> pending (merge)", () => {
  beforeEach(() => resetGroupSeq());

  describe("[A5.1] [UR-14] [V-13c] COMPAT merge", () => {
    it("pending [R7,B7] + 다른 pending [Y7] -> Y7 을 [R7,B7] 에 추가", () => {
      const pgA = pendingGroup(["R7a", "B7a"] as TileCode[], "group");
      const pgB = pendingGroup(["Y7a"] as TileCode[], "group");
      const pendingIds = new Set([pgA.id, pgB.id]);

      const output = dragEndReducer(
        makeInput({
          tileCode: "Y7a" as TileCode,
          source: { kind: "pending", groupId: pgB.id, index: 0 },
          dest: { kind: "pending-group", groupId: pgA.id },
          tableGroups: [pgA, pgB],
          myTiles: [],
          pendingGroupIds: pendingIds,
        })
      );

      expectAccepted(output);
      // dst 에 타일 추가
      const resultA = output.nextTableGroups!.find((g) => g.id === pgA.id);
      expect(resultA!.tiles.length).toBe(3);
      expect(resultA!.tiles).toContain("Y7a");
      // src 1장 -> 자동 정리 (INV-G3)
      expect(output.nextTableGroups!.find((g) => g.id === pgB.id)).toBeUndefined();
      // INV-G2
      expectNoDuplicateTiles(output.nextTableGroups!);
    });
  });

  describe("[A5.2] [UR-19] [V-13c] INCOMPAT reject", () => {
    it("pending [R7,B7] + 다른 pending [R5,R6,R7] 런 -> R8 드래그 후 [R7,B7] 에 시도 -> 거절", () => {
      // UR-19: 숫자 불일치 = 비호환 -> 거절
      const pgDst = pendingGroup(["R7a", "B7a"] as TileCode[], "group");
      const pgSrc = pendingGroup(["R5a", "R6a", "R8a"] as TileCode[], "run");
      const pendingIds = new Set([pgDst.id, pgSrc.id]);

      const output = dragEndReducer(
        makeInput({
          tileCode: "R8a" as TileCode,
          source: { kind: "pending", groupId: pgSrc.id, index: 2 },
          dest: { kind: "pending-group", groupId: pgDst.id },
          tableGroups: [pgDst, pgSrc],
          myTiles: [],
          pendingGroupIds: pendingIds,
        })
      );

      expectRejected(output, "UR-19");
    });
  });

  describe("[A5.3] [INV-G3] 출발 그룹 빈 -> 자동 정리", () => {
    it("pending [R7] (1장) + 다른 pending [B7,Y7] -> R7 merge -> src 자동 제거", () => {
      const pgSrc = pendingGroup(["R7a"] as TileCode[], "group");
      const pgDst = pendingGroup(["B7a", "Y7a"] as TileCode[], "group");
      const pendingIds = new Set([pgSrc.id, pgDst.id]);

      const output = dragEndReducer(
        makeInput({
          tileCode: "R7a" as TileCode,
          source: { kind: "pending", groupId: pgSrc.id, index: 0 },
          dest: { kind: "pending-group", groupId: pgDst.id },
          tableGroups: [pgSrc, pgDst],
          myTiles: [],
          pendingGroupIds: pendingIds,
        })
      );

      expectAccepted(output);
      expectNoEmptyGroups(output.nextTableGroups!);
      expect(output.nextTableGroups!.find((g) => g.id === pgSrc.id)).toBeUndefined();
    });
  });

  describe("[A5.4] [D-01] [D-12] 양쪽 pending- ID 정합성", () => {
    it("merge 후 dst.id 보존, src.id 제거 (INV-G1 유지)", () => {
      const pgSrc = pendingGroup(["R7a"] as TileCode[], "group");
      const pgDst = pendingGroup(["B7a", "Y7a"] as TileCode[], "group");
      const pendingIds = new Set([pgSrc.id, pgDst.id]);

      const output = dragEndReducer(
        makeInput({
          tileCode: "R7a" as TileCode,
          source: { kind: "pending", groupId: pgSrc.id, index: 0 },
          dest: { kind: "pending-group", groupId: pgDst.id },
          tableGroups: [pgSrc, pgDst],
          myTiles: [],
          pendingGroupIds: pendingIds,
        })
      );

      expectAccepted(output);
      // dst ID 보존
      expect(output.nextTableGroups!.find((g) => g.id === pgDst.id)).toBeDefined();
      // INV-G1
      expectUniqueGroupIds(output.nextTableGroups!);
    });
  });
});
