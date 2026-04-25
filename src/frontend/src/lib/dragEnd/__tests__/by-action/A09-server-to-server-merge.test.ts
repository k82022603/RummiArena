/**
 * A9 -- 서버 -> 다른 서버 (merge server) -- INC-T11-IDDUP 회귀 핵심 셀
 *
 * SSOT 매핑:
 * - 56 section 3.10 셀: A9 (SERVER_BOARD -> SERVER_BOARD)
 * - 룰 ID: V-13a, V-13c, INV-G1, V-17, UR-14
 *
 * 사고 매핑 (직접 회귀 방지):
 * - INC-T11-IDDUP (docs/04-testing/86 section 3.1): 양쪽 ID 보존 후 충돌 (D-01 위반)
 */

import { describe, it, expect, beforeEach } from "@jest/globals";
import { dragEndReducer } from "../../dragEndReducer";
import type { TileCode, TableGroup } from "@/types/tile";
import {
  serverGroup,
  makeInput,
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
      // V-13a: 최초 등록 전에는 서버 그룹 변형 불가
      const sgA = serverGroup(["R7a", "B7a", "Y7a"] as TileCode[], "group");
      const sgB = serverGroup(["K7a", "R7b"] as TileCode[], "group");

      const output = dragEndReducer(
        makeInput({
          tileCode: "R7a" as TileCode,
          source: { kind: "server", groupId: sgA.id, index: 0 },
          dest: { kind: "server-group", groupId: sgB.id },
          hasInitialMeld: false,
          tableGroups: [sgA, sgB],
          myTiles: [],
        })
      );

      expectRejected(output, "V-13a");
    });
  });

  describe("[A9.2] [V-13c] [UR-14] POST_MELD COMPAT allow", () => {
    it("POST_MELD + server [R7,B7,Y7] + 다른 server [K7] -> R7 -> [K7] drop -> 결과 합병", () => {
      // V-13c: POST_MELD 에서 호환 서버 그룹 간 이동 허용
      const sgA = serverGroup(["R7a", "B7a", "Y7a"] as TileCode[], "group");
      const sgB = serverGroup(["K7a"] as TileCode[], "group");

      const output = dragEndReducer(
        makeInput({
          tileCode: "R7a" as TileCode,
          source: { kind: "server", groupId: sgA.id, index: 0 },
          dest: { kind: "server-group", groupId: sgB.id },
          hasInitialMeld: true,
          tableGroups: [sgA, sgB],
          myTiles: [],
        })
      );

      expectAccepted(output);
      // 양쪽 서버 그룹 모두 pending 마킹
      expect(output.nextPendingGroupIds!.has(sgA.id)).toBe(true);
      expect(output.nextPendingGroupIds!.has(sgB.id)).toBe(true);
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
    it("POST_MELD + 다른 그룹/숫자 -> 거절 (UR-19)", () => {
      // UR-19: 비호환 merge 거절
      const sgA = serverGroup(["R7a", "B7a", "Y7a"] as TileCode[], "group");
      const sgB = serverGroup(["R8a", "B8a", "Y8a"] as TileCode[], "group"); // 숫자 불일치

      const output = dragEndReducer(
        makeInput({
          tileCode: "R7a" as TileCode,
          source: { kind: "server", groupId: sgA.id, index: 0 },
          dest: { kind: "server-group", groupId: sgB.id },
          hasInitialMeld: true,
          tableGroups: [sgA, sgB],
          myTiles: [],
        })
      );

      expectRejected(output, "UR-19");
    });
  });

  describe("[A9.4] [INV-G1] [V-17] **INC-T11-IDDUP 직접 회귀** -- 양쪽 ID 보존 시 충돌 검증", () => {
    it("서버 [그룹A], [그룹B] -> 부분 합병 -> 결과 그룹 ID INV-G1 유니크 보장", () => {
      // INC-T11-IDDUP 사고 직접 reproduction (docs/04-testing/86 section 3.1)
      // 회귀 코드: 양쪽 id 보존 -> React key 충돌 -> ghost group 부패
      const sgA = serverGroup(["R7a", "B7a", "Y7a", "K7a"] as TileCode[], "group");
      const sgB = serverGroup(["R8a", "B8a", "Y8a"] as TileCode[], "group");

      // R7 을 sgB 에 넣으면 비호환이므로 거절이 맞지만,
      // 호환 시나리오를 위해 같은 숫자 사용
      const sgC = serverGroup(["R5a", "B5a", "Y5a"] as TileCode[], "group");
      const sgD = serverGroup(["K5a"] as TileCode[], "group");

      const output = dragEndReducer(
        makeInput({
          tileCode: "R5a" as TileCode,
          source: { kind: "server", groupId: sgC.id, index: 0 },
          dest: { kind: "server-group", groupId: sgD.id },
          hasInitialMeld: true,
          tableGroups: [sgC, sgD],
          myTiles: [],
        })
      );

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

  describe("[A9.5] [D-12] pending 전환 정합성 (양쪽 server -> pending)", () => {
    it("merge 후 양쪽 server 그룹 모두 pending 마킹, ConfirmTurn 시 새 commit", () => {
      const sgA = serverGroup(["R9a", "B9a", "Y9a", "K9a"] as TileCode[], "group");
      const sgB = serverGroup(["R9b"] as TileCode[], "group");

      const output = dragEndReducer(
        makeInput({
          tileCode: "R9a" as TileCode,
          source: { kind: "server", groupId: sgA.id, index: 0 },
          dest: { kind: "server-group", groupId: sgB.id },
          hasInitialMeld: true,
          tableGroups: [sgA, sgB],
          myTiles: [],
        })
      );

      expectAccepted(output);
      // D-12: 양쪽 모두 pending 마킹
      expect(output.nextPendingGroupIds!.has(sgA.id)).toBe(true);
      expect(output.nextPendingGroupIds!.has(sgB.id)).toBe(true);
    });
  });
});
