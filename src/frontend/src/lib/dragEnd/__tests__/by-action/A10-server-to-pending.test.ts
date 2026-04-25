/**
 * A10 -- 서버 -> pending (server-to-pending move)
 *
 * SSOT 매핑:
 * - 56 section 3.11 셀: A10 (SERVER_BOARD -> PENDING_BOARD)
 * - 룰 ID: V-13a, V-13c, D-12
 */

import { describe, it, expect, beforeEach } from "@jest/globals";
import { dragEndReducer } from "../../dragEndReducer";
import type { TileCode } from "@/types/tile";
import {
  serverGroup,
  pendingGroup,
  makeInput,
  resetGroupSeq,
  expectRejected,
  expectAccepted,
  expectNoDuplicateTiles,
} from "../test-helpers";

describe("[A10] [V-13a] [V-13c] server -> pending", () => {
  beforeEach(() => resetGroupSeq());

  describe("[A10.1] [V-13a] [UR-13] PRE_MELD reject", () => {
    it("hasInitialMeld=false -> 거절 (V-13a)", () => {
      const sg = serverGroup(["R7a", "B7a", "Y7a"] as TileCode[], "group");
      const pg = pendingGroup(["K7a"] as TileCode[], "group");
      const pendingIds = new Set([pg.id]);

      const output = dragEndReducer(
        makeInput({
          tileCode: "R7a" as TileCode,
          source: { kind: "server", groupId: sg.id, index: 0 },
          dest: { kind: "pending-group", groupId: pg.id },
          hasInitialMeld: false,
          tableGroups: [sg, pg],
          myTiles: [],
          pendingGroupIds: pendingIds,
        })
      );

      expectRejected(output, "V-13a");
    });
  });

  describe("[A10.2] [V-13c] [UR-14] POST_MELD COMPAT allow + server -> pending 전환", () => {
    it("hasInitialMeld=true + COMPAT -> server tile 을 pending 에 추가, server -> pending 전환", () => {
      // COMPAT: B7 server -> [R7, Y7] pending (같은 숫자, 다른 색)
      const sg = serverGroup(["B7a", "K7a", "R7b"] as TileCode[], "group");
      const pg = pendingGroup(["R7a", "Y7a"] as TileCode[], "group");
      const pendingIds = new Set([pg.id]);

      const output = dragEndReducer(
        makeInput({
          tileCode: "B7a" as TileCode,
          source: { kind: "server", groupId: sg.id, index: 0 },
          dest: { kind: "pending-group", groupId: pg.id },
          hasInitialMeld: true,
          tableGroups: [sg, pg],
          myTiles: [],
          pendingGroupIds: pendingIds,
        })
      );

      expectAccepted(output);
      // dst pending 에 타일 추가
      const resultPg = output.nextTableGroups!.find((g) => g.id === pg.id);
      expect(resultPg!.tiles).toContain("B7a");
      // src server 에서 타일 제거 + pending 전환
      const resultSg = output.nextTableGroups!.find((g) => g.id === sg.id);
      expect(resultSg!.tiles).not.toContain("B7a");
      expect(output.nextPendingGroupIds!.has(sg.id)).toBe(true);
      // INV-G2
      expectNoDuplicateTiles(output.nextTableGroups!);
    });
  });

  describe("[A10.3] [UR-19] POST_MELD INCOMPAT reject", () => {
    it("POST_MELD + INCOMPAT -> 거절 (UR-19)", () => {
      const sg = serverGroup(["R7a", "B7a", "Y7a"] as TileCode[], "group");
      const pg = pendingGroup(["R8a", "B8a"] as TileCode[], "group"); // 숫자 불일치
      const pendingIds = new Set([pg.id]);

      const output = dragEndReducer(
        makeInput({
          tileCode: "R7a" as TileCode,
          source: { kind: "server", groupId: sg.id, index: 0 },
          dest: { kind: "pending-group", groupId: pg.id },
          hasInitialMeld: true,
          tableGroups: [sg, pg],
          myTiles: [],
          pendingGroupIds: pendingIds,
        })
      );

      expectRejected(output, "UR-19");
    });
  });

  describe("[A10.4] [D-12] 출발 server -> pending 전환 (그룹 ID 보존)", () => {
    it("drop 후 srcServerGroup.id 보존 (V-17)", () => {
      const sg = serverGroup(["R7a", "B7a", "Y7a", "K7a"] as TileCode[], "group");
      const pg = pendingGroup(["R7b"] as TileCode[], "group");
      const pendingIds = new Set([pg.id]);

      const output = dragEndReducer(
        makeInput({
          tileCode: "R7a" as TileCode,
          source: { kind: "server", groupId: sg.id, index: 0 },
          dest: { kind: "pending-group", groupId: pg.id },
          hasInitialMeld: true,
          tableGroups: [sg, pg],
          myTiles: [],
          pendingGroupIds: pendingIds,
        })
      );

      expectAccepted(output);
      // V-17: 서버 ID 보존
      const resultSg = output.nextTableGroups!.find((g) => g.id === sg.id);
      expect(resultSg).toBeDefined();
      expect(resultSg!.id).toBe(sg.id);
      expect(resultSg!.id.startsWith("pending-")).toBe(false);
    });
  });
});
