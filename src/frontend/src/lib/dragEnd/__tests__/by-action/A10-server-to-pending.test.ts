/**
 * A10 -- 서버 -> pending (server-to-pending move)
 *
 * SSOT 매핑:
 * - 56 section 3.11 셀: A10 (SERVER_BOARD -> PENDING_BOARD)
 * - 룰 ID: V-13a, V-13c, D-12
 *
 * NOTE: server source 는 reducer 에서 { kind: "table" } 로 통합.
 *       overId 는 타겟 pending 그룹 ID.
 */

import { describe, it, expect, beforeEach } from "@jest/globals";
import { dragEndReducer } from "../../dragEndReducer";
import type { TileCode } from "@/types/tile";
import {
  serverGroup,
  pendingGroup,
  makeReducerArgs,
  resetGroupSeq,
  expectRejected,
  expectAccepted,
  expectNoDuplicateTiles,
} from "../test-helpers";

describe("[A10] [V-13a] [V-13c] server -> pending", () => {
  beforeEach(() => resetGroupSeq());

  describe("[A10.1] [V-13a] [UR-13] PRE_MELD reject", () => {
    it("hasInitialMeld=false -> 거절 (initial-meld-required)", () => {
      const sg = serverGroup(["R7a", "B7a", "Y7a"] as TileCode[], "group");
      const pg = pendingGroup(["K7a"] as TileCode[], "group");
      const pendingIds = new Set([pg.id]);

      const [state, input] = makeReducerArgs({
        tileCode: "R7a" as TileCode,
        source: { kind: "server", groupId: sg.id, index: 0 },
        overId: pg.id,
        hasInitialMeld: false,
        tableGroups: [sg, pg],
        myTiles: [],
        pendingGroupIds: pendingIds,
      });
      const output = dragEndReducer(state, input);

      expectRejected(output, "initial-meld-required");
    });
  });

  describe("[A10.2] [V-13c] [UR-14] POST_MELD COMPAT allow + server -> pending 전환", () => {
    it("hasInitialMeld=true + COMPAT -> server tile 을 pending 에 추가, server -> pending 전환", () => {
      // COMPAT: B7 server -> [R7, Y7] pending (같은 숫자, 다른 색)
      const sg = serverGroup(["B7a", "K7a", "R7b"] as TileCode[], "group");
      const pg = pendingGroup(["R7a", "Y7a"] as TileCode[], "group");
      const pendingIds = new Set([pg.id]);

      const [state, input] = makeReducerArgs({
        tileCode: "B7a" as TileCode,
        source: { kind: "server", groupId: sg.id, index: 0 },
        overId: pg.id,
        hasInitialMeld: true,
        tableGroups: [sg, pg],
        myTiles: [],
        pendingGroupIds: pendingIds,
      });
      const output = dragEndReducer(state, input);

      expectAccepted(output);
      // dst pending 에 타일 추가
      const resultPg = output.nextTableGroups!.find((g) => g.id === pg.id);
      expect(resultPg!.tiles).toContain("B7a");
      // src server 에서 타일 제거 + pending 전환
      const resultSg = output.nextTableGroups!.find((g) => g.id === sg.id);
      expect(resultSg!.tiles).not.toContain("B7a");
      // D-12: 타겟 pending 그룹이 pending 마킹 유지, 서버 그룹은 타겟이 아니므로 마킹 안 됨
      expect(output.nextPendingGroupIds.has(pg.id)).toBe(true);
      // INV-G2
      expectNoDuplicateTiles(output.nextTableGroups!);
    });
  });

  describe("[A10.3] [UR-19] POST_MELD INCOMPAT reject", () => {
    it("POST_MELD + INCOMPAT -> 거절 (incompatible-merge)", () => {
      const sg = serverGroup(["R7a", "B7a", "Y7a"] as TileCode[], "group");
      const pg = pendingGroup(["R8a", "B8a"] as TileCode[], "group"); // 숫자 불일치
      const pendingIds = new Set([pg.id]);

      const [state, input] = makeReducerArgs({
        tileCode: "R7a" as TileCode,
        source: { kind: "server", groupId: sg.id, index: 0 },
        overId: pg.id,
        hasInitialMeld: true,
        tableGroups: [sg, pg],
        myTiles: [],
        pendingGroupIds: pendingIds,
      });
      const output = dragEndReducer(state, input);

      expectRejected(output, "incompatible-merge");
    });
  });

  describe("[A10.4] [D-12] 출발 server -> 그룹 ID 보존 (V-17)", () => {
    it("drop 후 srcServerGroup.id 보존 (V-17)", () => {
      // B7a (Blue 7) -> pending [K7a] (Black 7) 호환 (같은 숫자, 다른 색 = group)
      const sg = serverGroup(["R7a", "B7a", "Y7a", "K7a"] as TileCode[], "group");
      const pg = pendingGroup(["K7b"] as TileCode[], "group");
      const pendingIds = new Set([pg.id]);

      const [state, input] = makeReducerArgs({
        tileCode: "B7a" as TileCode,
        source: { kind: "server", groupId: sg.id, index: 1 },
        overId: pg.id,
        hasInitialMeld: true,
        tableGroups: [sg, pg],
        myTiles: [],
        pendingGroupIds: pendingIds,
      });
      const output = dragEndReducer(state, input);

      expectAccepted(output);
      // V-17: 서버 ID 보존
      const resultSg = output.nextTableGroups!.find((g) => g.id === sg.id);
      expect(resultSg).toBeDefined();
      expect(resultSg!.id).toBe(sg.id);
      expect(resultSg!.id.startsWith("pending-")).toBe(false);
    });
  });
});
