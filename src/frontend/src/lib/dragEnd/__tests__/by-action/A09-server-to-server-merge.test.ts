/**
 * A9 -- 서버 -> 다른 서버 (merge server) -- INC-T11-IDDUP 회귀 핵심 셀
 *
 * SSOT 매핑:
 * - 56 section 3.10 셀: A9 (SERVER_BOARD -> SERVER_BOARD)
 * - 룰 ID: V-13a, V-13c, INV-G1, V-17, UR-14
 *
 * 사고 매핑 (직접 회귀 방지):
 * - INC-T11-IDDUP (docs/04-testing/86 section 3.1): 양쪽 ID 보존 후 충돌 (D-01 위반)
 *
 * NOTE: server source 는 reducer 에서 { kind: "table" } 로 통합.
 *       overId 는 타겟 그룹 ID.
 */

import { describe, it, expect, beforeEach } from "@jest/globals";
import { dragEndReducer } from "../../dragEndReducer";
import type { TileCode, TableGroup } from "@/types/tile";
import {
  serverGroup,
  makeReducerArgs,
  resetGroupSeq,
  expectRejected,
  expectAccepted,
  expectUniqueGroupIds,
  expectNoDuplicateTiles,
} from "../test-helpers";

describe("[A9] [V-13a] [V-13c] [V-17] [INV-G1] server -> server (merge)", () => {
  beforeEach(() => resetGroupSeq());

  describe("[A9.1] [V-13a] [UR-13] PRE_MELD reject", () => {
    it("hasInitialMeld=false + server tile -> server group drop -> 거절", () => {
      const sgA = serverGroup(["R7a", "B7a", "Y7a"] as TileCode[], "group");
      const sgB = serverGroup(["K7a", "R7b"] as TileCode[], "group");

      const [state, input] = makeReducerArgs({
        tileCode: "R7a" as TileCode,
        source: { kind: "server", groupId: sgA.id, index: 0 },
        overId: sgB.id,
        hasInitialMeld: false,
        tableGroups: [sgA, sgB],
        myTiles: [],
      });
      const output = dragEndReducer(state, input);

      expectRejected(output, "initial-meld-required");
    });
  });

  describe("[A9.2] [V-13c] [UR-14] POST_MELD COMPAT allow", () => {
    it("POST_MELD + server [R7,B7,Y7] + 다른 server [K7] -> R7 -> [K7] drop -> 결과 합병", () => {
      const sgA = serverGroup(["R7a", "B7a", "Y7a"] as TileCode[], "group");
      const sgB = serverGroup(["K7a"] as TileCode[], "group");

      const [state, input] = makeReducerArgs({
        tileCode: "R7a" as TileCode,
        source: { kind: "server", groupId: sgA.id, index: 0 },
        overId: sgB.id,
        hasInitialMeld: true,
        tableGroups: [sgA, sgB],
        myTiles: [],
      });
      const output = dragEndReducer(state, input);

      expectAccepted(output);
      // 타겟 서버 그룹이 pending 마킹 (reducer 는 target 만 마킹)
      expect(output.nextPendingGroupIds.has(sgB.id)).toBe(true);
      // 타일 이동 확인
      const resultSgA = output.nextTableGroups!.find((g) => g.id === sgA.id);
      const resultSgB = output.nextTableGroups!.find((g) => g.id === sgB.id);
      expect(resultSgA).toBeDefined();
      expect(resultSgA!.tiles).not.toContain("R7a");
      expect(resultSgA!.tiles.length).toBe(2); // B7, Y7
      expect(resultSgB).toBeDefined();
      expect(resultSgB!.tiles).toContain("R7a");
      expect(resultSgB!.tiles.length).toBe(2); // K7, R7
      // INV-G2: 보드 전체 중복 없음
      expectNoDuplicateTiles(output.nextTableGroups!);
    });
  });

  describe("[A9.3] [UR-19] POST_MELD INCOMPAT reject", () => {
    it("POST_MELD + 다른 그룹/숫자 -> 거절 (incompatible-merge)", () => {
      const sgA = serverGroup(["R7a", "B7a", "Y7a"] as TileCode[], "group");
      const sgB = serverGroup(["R8a", "B8a", "Y8a"] as TileCode[], "group"); // 숫자 불일치

      const [state, input] = makeReducerArgs({
        tileCode: "R7a" as TileCode,
        source: { kind: "server", groupId: sgA.id, index: 0 },
        overId: sgB.id,
        hasInitialMeld: true,
        tableGroups: [sgA, sgB],
        myTiles: [],
      });
      const output = dragEndReducer(state, input);

      expectRejected(output, "incompatible-merge");
    });
  });

  describe("[A9.4] [INV-G1] [V-17] **INC-T11-IDDUP 직접 회귀** -- 양쪽 ID 보존 시 충돌 검증", () => {
    it("서버 [그룹A], [그룹B] -> 부분 합병 -> 결과 그룹 ID INV-G1 유니크 보장", () => {
      const sgC = serverGroup(["R5a", "B5a", "Y5a"] as TileCode[], "group");
      const sgD = serverGroup(["K5a"] as TileCode[], "group");

      const [state, input] = makeReducerArgs({
        tileCode: "R5a" as TileCode,
        source: { kind: "server", groupId: sgC.id, index: 0 },
        overId: sgD.id,
        hasInitialMeld: true,
        tableGroups: [sgC, sgD],
        myTiles: [],
      });
      const output = dragEndReducer(state, input);

      expectAccepted(output);
      // INV-G1: 모든 그룹 ID 유니크
      expectUniqueGroupIds(output.nextTableGroups!);
      // V-17: 그룹 ID 가 빈 문자열이면 안 됨
      for (const g of output.nextTableGroups!) {
        expect(g.id).not.toBe("");
        expect(g.id.length).toBeGreaterThan(0);
      }
    });
  });

  describe("[A9.5] [D-12] pending 전환 정합성 (타겟 server -> pending)", () => {
    it("merge 후 타겟 server 그룹 pending 마킹, ConfirmTurn 시 새 commit", () => {
      // R9a (Red 9) -> [B9a] (Blue 9) 호환 (같은 숫자, 다른 색 = group)
      const sgA = serverGroup(["R9a", "B9a", "Y9a", "K9a"] as TileCode[], "group");
      const sgB = serverGroup(["R9b", "B9b"] as TileCode[], "group");

      const [state, input] = makeReducerArgs({
        tileCode: "Y9a" as TileCode,
        source: { kind: "server", groupId: sgA.id, index: 2 },
        overId: sgB.id,
        hasInitialMeld: true,
        tableGroups: [sgA, sgB],
        myTiles: [],
      });
      const output = dragEndReducer(state, input);

      expectAccepted(output);
      // D-12: 타겟 그룹이 pending 마킹
      expect(output.nextPendingGroupIds.has(sgB.id)).toBe(true);
    });
  });
});
