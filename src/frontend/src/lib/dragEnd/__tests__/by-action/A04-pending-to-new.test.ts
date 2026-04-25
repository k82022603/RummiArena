/**
 * A4 -- pending -> 새 그룹 (split via new)
 *
 * SSOT 매핑:
 * - 56 section 3.5 셀: A4 (PENDING_BOARD -> NEW_GROUP)
 * - 룰 ID: UR-11, V-13b, D-01, D-12, V-02, UR-20
 *
 * NOTE: dragEndReducer 의 table 분기에서 overId="game-board-new-group" 는
 *       실제 그룹 ID 가 아니므로 target-not-found 로 거절된다.
 *       pending tile split(새 그룹 생성)은:
 *       1) table(pending) -> player-rack 회수 후
 *       2) rack -> game-board-new-group 로 수행한다 (2-step).
 *       본 테스트는 각 단계를 개별 검증한다.
 */

import { describe, it, expect, beforeEach } from "@jest/globals";
import { dragEndReducer } from "../../dragEndReducer";
import type { TileCode } from "@/types/tile";
import {
  pendingGroup,
  makeReducerArgs,
  resetGroupSeq,
  expectAccepted,
  expectRejected,
  expectNoDuplicateTiles,
  expectNoEmptyGroups,
  expectUniqueGroupIds,
} from "../test-helpers";

describe("[A4] [V-13b] pending -> new group (split)", () => {
  beforeEach(() => resetGroupSeq());

  describe("[A4.1] table -> game-board-new-group = target-not-found (reducer 제약)", () => {
    it("pending tile 을 game-board-new-group 에 drop -> target-not-found 거절", () => {
      const pg = pendingGroup(["R7a", "B7a", "Y7a"] as TileCode[], "group");
      const pendingIds = new Set([pg.id]);

      const [state, input] = makeReducerArgs({
        tileCode: "R7a" as TileCode,
        source: { kind: "pending", groupId: pg.id, index: 0 },
        dest: { kind: "new-group" },
        tableGroups: [pg],
        myTiles: [],
        pendingGroupIds: pendingIds,
      });
      const output = dragEndReducer(state, input);

      // table source 에서 game-board-new-group 은 target-not-found
      expectRejected(output, "target-not-found");
    });
  });

  describe("[A4.2] [V-13b] pending split 2-step: step1 pending->rack 회수", () => {
    it("R7/B7/Y7 pending + R7 -> rack 회수 -> 출발 [B7,Y7], rack 에 R7 추가", () => {
      const pg = pendingGroup(["R7a", "B7a", "Y7a"] as TileCode[], "group");
      const pendingIds = new Set([pg.id]);

      const [state, input] = makeReducerArgs({
        tileCode: "R7a" as TileCode,
        source: { kind: "pending", groupId: pg.id, index: 0 },
        dest: { kind: "rack" },
        tableGroups: [pg],
        myTiles: [],
        pendingGroupIds: pendingIds,
      });
      const output = dragEndReducer(state, input);

      expectAccepted(output);
      // 출발 그룹: B7, Y7 (2장)
      const srcGroup = output.nextTableGroups!.find((g) => g.id === pg.id);
      expect(srcGroup).toBeDefined();
      expect(srcGroup!.tiles.length).toBe(2);
      expect(srcGroup!.tiles).not.toContain("R7a");
      // 랙에 R7 추가
      expect(output.nextMyTiles!).toContain("R7a");
    });
  });

  describe("[A4.3] [V-13b] pending split 2-step: step2 rack->new-group 생성", () => {
    it("rack R7 -> new-group drop -> 새 pending 그룹 [R7] 생성", () => {
      // step1 완료 후 상태: pending [B7,Y7] + rack [R7]
      const pg = pendingGroup(["B7a", "Y7a"] as TileCode[], "group");
      const pendingIds = new Set([pg.id]);

      const [state, input] = makeReducerArgs({
        tileCode: "R7a" as TileCode,
        source: { kind: "rack" },
        dest: { kind: "new-group" },
        tableGroups: [pg],
        myTiles: ["R7a"] as TileCode[],
        pendingGroupIds: pendingIds,
        pendingGroupSeq: 100, // ID 충돌 방지
      });
      const output = dragEndReducer(state, input);

      expectAccepted(output);
      // 새 그룹: R7 (1장)
      const newGroup = output.nextTableGroups!.find((g) => g.id !== pg.id);
      expect(newGroup).toBeDefined();
      expect(newGroup!.tiles).toEqual(["R7a"]);
      // INV-G2
      expectNoDuplicateTiles(output.nextTableGroups!);
      // D-12: pending- prefix
      expect(newGroup!.id.startsWith("pending-")).toBe(true);
    });
  });

  describe("[A4.4] [D-01] [D-12] 새 그룹 pending- prefix ID (rack->new-group)", () => {
    it("newGroup.id pending- prefix, 기존 ID 와 충돌 0 (INV-G1)", () => {
      const pg = pendingGroup(["B7a", "Y7a", "K7a"] as TileCode[], "group");
      const pendingIds = new Set([pg.id]);

      const [state, input] = makeReducerArgs({
        tileCode: "R7a" as TileCode,
        source: { kind: "rack" },
        dest: { kind: "new-group" },
        tableGroups: [pg],
        myTiles: ["R7a"] as TileCode[],
        pendingGroupIds: pendingIds,
        pendingGroupSeq: 100, // ID 충돌 방지
      });
      const output = dragEndReducer(state, input);

      expectAccepted(output);
      const newGroup = output.nextTableGroups!.find((g) => g.id !== pg.id);
      expect(newGroup!.id.startsWith("pending-")).toBe(true);
      expectUniqueGroupIds(output.nextTableGroups!);
    });
  });

  describe("[A4.5] [INV-G3] 출발 그룹 빈 -> 자동 정리 (table->rack 경로)", () => {
    it("1장 짜리 pending 그룹에서 마지막 tile 회수 -> 출발 그룹 자동 제거", () => {
      const pg = pendingGroup(["R7a"] as TileCode[], "group");
      const pendingIds = new Set([pg.id]);

      const [state, input] = makeReducerArgs({
        tileCode: "R7a" as TileCode,
        source: { kind: "pending", groupId: pg.id, index: 0 },
        dest: { kind: "rack" },
        tableGroups: [pg],
        myTiles: [],
        pendingGroupIds: pendingIds,
      });
      const output = dragEndReducer(state, input);

      expectAccepted(output);
      // INV-G3: 빈 그룹 없음
      // nextTableGroups 는 null(pending 전체 정리) 또는 빈 배열
      if (output.nextTableGroups !== null) {
        expectNoEmptyGroups(output.nextTableGroups);
      }
      // 랙에 R7 추가
      expect(output.nextMyTiles!).toContain("R7a");
    });
  });
});
