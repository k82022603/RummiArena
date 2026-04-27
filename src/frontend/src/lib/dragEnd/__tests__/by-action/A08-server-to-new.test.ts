/**
 * A8 -- 서버 -> 새 그룹 (split server)
 *
 * SSOT 매핑:
 * - 56 section 3.9 셀: A8 (SERVER_BOARD -> NEW_GROUP)
 * - 룰 ID: V-13a, V-13b, D-12
 *
 * NOTE: dragEndReducer 의 table source 분기에서 overId="game-board-new-group" 는
 *       직접 split 을 지원한다 (A4/A8 분기, POST_MELD 시).
 *       server 타일 split 은 단일 드래그로 수행 가능:
 *         table(server) -> game-board-new-group → SPLIT_SERVER_GROUP (hasInitialMeld=true 시)
 *       본 테스트는 reducer 의 실제 동작을 검증한다.
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
  expectUniqueGroupIds,
} from "../test-helpers";

describe("[A8] [V-13a] [V-13b] server -> new group (split)", () => {
  beforeEach(() => resetGroupSeq());

  describe("[A8.1] [V-13a] [UR-13] PRE_MELD reject (table -> table 분기)", () => {
    it("hasInitialMeld=false + server tile drag -> 다른 그룹 drop -> 거절 (initial-meld-required)", () => {
      const sg = serverGroup(["R7a", "B7a", "Y7a", "K7a"] as TileCode[], "group");
      const pg = pendingGroup(["R1a"] as TileCode[], "group");
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

  describe("[A8.2] [V-13b] table source + overId=game-board-new-group -> 직접 split (SPLIT_SERVER_GROUP)", () => {
    it("server tile 을 game-board-new-group 에 drop -> 새 그룹 분리 허용 (POST_MELD)", () => {
      const sg = serverGroup(["R7a", "B7a", "Y7a", "K7a"] as TileCode[], "group");

      const [state, input] = makeReducerArgs({
        tileCode: "R7a" as TileCode,
        source: { kind: "server", groupId: sg.id, index: 0 },
        dest: { kind: "new-group" },
        hasInitialMeld: true,
        tableGroups: [sg],
        myTiles: [],
      });
      const output = dragEndReducer(state, input);

      expectAccepted(output);
      expect(output.action).toBe("SPLIT_SERVER_GROUP");
      // source server group ID 가 pendingGroupIds 에 포함 (V-17)
      expect(output.nextPendingGroupIds.has(sg.id)).toBe(true);
      // 새 pending 그룹 생성
      const newGroup = output.nextTableGroups!.find((g) => g.id !== sg.id);
      expect(newGroup).toBeDefined();
      expect(newGroup!.tiles).toEqual(["R7a"]);
      expect(newGroup!.id.startsWith("pending-")).toBe(true);
      // INV-G2: 중복 없음
      expectNoDuplicateTiles(output.nextTableGroups!);
    });
  });

  describe("[A8.3] [V-13b] POST_MELD server tile -> 다른 그룹 COMPAT 이동", () => {
    it("hasInitialMeld=true + server [R7,B7,Y7,K7] + R7 -> 호환 pending 그룹으로 이동", () => {
      // R7a (Red 7) -> pending [B7b] (Blue 7) = 같은 숫자, 다른 색 = group 호환
      const sg = serverGroup(["R7a", "B7a", "Y7a", "K7a"] as TileCode[], "group");
      const pg = pendingGroup(["B7b"] as TileCode[], "group");
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

      expectAccepted(output);
      // D-12: 타겟 그룹이 pending 마킹
      expect(output.nextPendingGroupIds.has(pg.id)).toBe(true);
      const resultSg = output.nextTableGroups!.find((g) => g.id === sg.id);
      expect(resultSg!.tiles.length).toBe(3);
      expect(resultSg!.tiles).not.toContain("R7a");
      // target 그룹에 R7 추가
      const resultPg = output.nextTableGroups!.find((g) => g.id === pg.id);
      expect(resultPg!.tiles).toContain("R7a");
      // INV-G2
      expectNoDuplicateTiles(output.nextTableGroups!);
    });
  });

  describe("[A8.4] [D-12] 출발 server -> pending 전환 (그룹 ID 보존)", () => {
    it("split 후 srcServerGroup.id 보존 (V-17 UUID 유지)", () => {
      const sg = serverGroup(["R5a", "R6a", "R7a", "R8a"] as TileCode[], "run");
      const pg = pendingGroup(["R4a"] as TileCode[], "run");
      const pendingIds = new Set([pg.id]);

      const [state, input] = makeReducerArgs({
        tileCode: "R5a" as TileCode,
        source: { kind: "server", groupId: sg.id, index: 0 },
        overId: pg.id,
        hasInitialMeld: true,
        tableGroups: [sg, pg],
        myTiles: [],
        pendingGroupIds: pendingIds,
      });
      const output = dragEndReducer(state, input);

      expectAccepted(output);
      // 원래 서버 그룹 ID 유지 (pending- 로 변경 X)
      const resultSg = output.nextTableGroups!.find((g) => g.id === sg.id);
      expect(resultSg).toBeDefined();
      expect(resultSg!.id.startsWith("pending-")).toBe(false);
    });
  });

  describe("[A8.5] [D-01] [D-12] rack -> new-group: pending- ID + INV-G1 (대안 경로)", () => {
    it("rack source 로 game-board-new-group 에 drop -> 새 pending 그룹 생성", () => {
      const sg = serverGroup(["R7a", "B7a", "Y7a", "K7a"] as TileCode[], "group");

      const [state, input] = makeReducerArgs({
        tileCode: "Y1a" as TileCode,
        source: { kind: "rack" },
        dest: { kind: "new-group" },
        hasInitialMeld: true,
        tableGroups: [sg],
        myTiles: ["Y1a"] as TileCode[],
      });
      const output = dragEndReducer(state, input);

      expectAccepted(output);
      expectUniqueGroupIds(output.nextTableGroups!);
      const newGroup = output.nextTableGroups!.find((g) => g.id !== sg.id);
      expect(newGroup!.id.startsWith("pending-")).toBe(true);
    });
  });
});
