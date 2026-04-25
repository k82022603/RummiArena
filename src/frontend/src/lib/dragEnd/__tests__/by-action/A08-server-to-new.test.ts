/**
 * A8 -- 서버 -> 새 그룹 (split server)
 *
 * SSOT 매핑:
 * - 56 section 3.9 셀: A8 (SERVER_BOARD -> NEW_GROUP)
 * - 룰 ID: V-13a, V-13b, D-12
 */

import { describe, it, expect, beforeEach } from "@jest/globals";
import { dragEndReducer } from "../../dragEndReducer";
import type { TileCode } from "@/types/tile";
import {
  serverGroup,
  makeInput,
  resetGroupSeq,
  expectRejected,
  expectAccepted,
  expectNoDuplicateTiles,
  expectUniqueGroupIds,
} from "../test-helpers";

describe("[A8] [V-13a] [V-13b] server -> new group (split)", () => {
  beforeEach(() => resetGroupSeq());

  describe("[A8.1] [V-13a] [UR-13] PRE_MELD reject", () => {
    it("hasInitialMeld=false + server tile drag -> 거절 (V-13a)", () => {
      const sg = serverGroup(["R7a", "B7a", "Y7a", "K7a"] as TileCode[], "group");

      const output = dragEndReducer(
        makeInput({
          tileCode: "R7a" as TileCode,
          source: { kind: "server", groupId: sg.id, index: 0 },
          dest: { kind: "new-group" },
          hasInitialMeld: false,
          tableGroups: [sg],
          myTiles: [],
        })
      );

      expectRejected(output, "V-13a");
    });
  });

  describe("[A8.2] [V-13b] POST_MELD allow + 출발 server -> pending 전환", () => {
    it("hasInitialMeld=true + server [R7,B7,Y7,K7] + R7 split -> 새 [R7], 출발 [B7,Y7,K7] pending 마킹", () => {
      const sg = serverGroup(["R7a", "B7a", "Y7a", "K7a"] as TileCode[], "group");

      const output = dragEndReducer(
        makeInput({
          tileCode: "R7a" as TileCode,
          source: { kind: "server", groupId: sg.id, index: 0 },
          dest: { kind: "new-group" },
          hasInitialMeld: true,
          tableGroups: [sg],
          myTiles: [],
        })
      );

      expectAccepted(output);
      // 출발 server 그룹: pending 마킹
      expect(output.nextPendingGroupIds!.has(sg.id)).toBe(true);
      const resultSg = output.nextTableGroups!.find((g) => g.id === sg.id);
      expect(resultSg!.tiles.length).toBe(3);
      expect(resultSg!.tiles).not.toContain("R7a");
      // 새 그룹: pending- prefix
      const newGroup = output.nextTableGroups!.find((g) => g.id !== sg.id);
      expect(newGroup!.id.startsWith("pending-")).toBe(true);
      expect(newGroup!.tiles).toEqual(["R7a"]);
      // INV-G2
      expectNoDuplicateTiles(output.nextTableGroups!);
    });
  });

  describe("[A8.3] [D-12] 출발 server -> pending 전환 (그룹 ID 보존)", () => {
    it("split 후 srcServerGroup.id 보존 (V-17 UUID 유지)", () => {
      const sg = serverGroup(["R5a", "R6a", "R7a", "R8a"] as TileCode[], "run");

      const output = dragEndReducer(
        makeInput({
          tileCode: "R5a" as TileCode,
          source: { kind: "server", groupId: sg.id, index: 0 },
          dest: { kind: "new-group" },
          hasInitialMeld: true,
          tableGroups: [sg],
          myTiles: [],
        })
      );

      expectAccepted(output);
      // 원래 서버 그룹 ID 유지 (pending- 로 변경 X)
      const resultSg = output.nextTableGroups!.find((g) => g.id === sg.id);
      expect(resultSg).toBeDefined();
      expect(resultSg!.id.startsWith("pending-")).toBe(false);
    });
  });

  describe("[A8.4] [D-01] [D-12] 새 그룹 pending- ID + INV-G1", () => {
    it("newGroup.id 가 INV-G1 유니크, pending- prefix", () => {
      const sg = serverGroup(["R7a", "B7a", "Y7a", "K7a"] as TileCode[], "group");

      const output = dragEndReducer(
        makeInput({
          tileCode: "K7a" as TileCode,
          source: { kind: "server", groupId: sg.id, index: 3 },
          dest: { kind: "new-group" },
          hasInitialMeld: true,
          tableGroups: [sg],
          myTiles: [],
        })
      );

      expectAccepted(output);
      expectUniqueGroupIds(output.nextTableGroups!);
      const newGroup = output.nextTableGroups!.find((g) => g.id !== sg.id);
      expect(newGroup!.id.startsWith("pending-")).toBe(true);
    });
  });
});
