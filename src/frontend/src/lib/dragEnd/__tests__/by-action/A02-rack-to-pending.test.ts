/**
 * A2 -- 랙 -> 보드 기존 pending 그룹 드롭 (rack-to-pending)
 *
 * SSOT 매핑:
 * - 56 section 3.3 셀: A2 (RACK -> PENDING_BOARD)
 * - 룰 ID: UR-14, UR-19, V-14, V-15, V-08
 *
 * NOTE: V-08 (isMyTurn) 은 UI 레이어 책임. 본 reducer 테스트 범위 밖.
 */

import { describe, it, expect, beforeEach } from "@jest/globals";
import { dragEndReducer } from "../../dragEndReducer";
import type { TileCode } from "@/types/tile";
import {
  pendingGroup,
  makeReducerArgs,
  resetGroupSeq,
  expectRejected,
  expectAccepted,
  expectNoDuplicateTiles,
} from "../test-helpers";

describe("[A2] [UR-14] rack -> pending group", () => {
  beforeEach(() => resetGroupSeq());

  describe("[A2.1] [UR-14] [V-14] COMPAT 그룹 (같은 숫자, 다른 색)", () => {
    it("R7 pending 그룹 + B7 rack 드롭 -> 그룹 멤버 추가 (4색 한도 미달)", () => {
      // V-14: 같은 숫자 + 다른 색 = 그룹 호환
      const pg = pendingGroup(["R7a", "Y7a"] as TileCode[], "group");
      const pendingIds = new Set([pg.id]);

      const [state, input] = makeReducerArgs({
        tileCode: "B7a" as TileCode,
        source: { kind: "rack" },
        dest: { kind: "pending-group", groupId: pg.id },
        tableGroups: [pg],
        myTiles: ["B7a", "K1a"] as TileCode[],
        pendingGroupIds: pendingIds,
      });
      const output = dragEndReducer(state, input);

      expectAccepted(output);
      const resultPg = output.nextTableGroups!.find((g) => g.id === pg.id);
      expect(resultPg!.tiles.length).toBe(3);
      expect(resultPg!.tiles).toContain("B7a");
      // INV-G2
      expectNoDuplicateTiles(output.nextTableGroups!);
      // D-01
      expect(resultPg!.id).toBe(pg.id);
    });
  });

  describe("[A2.2] [UR-14] [V-15] COMPAT 런 앞 연장", () => {
    it("R5/R6/R7 pending 런 + R4 rack 드롭 -> 런 앞 연장", () => {
      // V-15: 같은 색 + 연속 숫자(앞) = 런 호환
      const pg = pendingGroup(["R5a", "R6a", "R7a"] as TileCode[], "run");
      const pendingIds = new Set([pg.id]);

      const [state, input] = makeReducerArgs({
        tileCode: "R4a" as TileCode,
        source: { kind: "rack" },
        dest: { kind: "pending-group", groupId: pg.id },
        tableGroups: [pg],
        myTiles: ["R4a"] as TileCode[],
        pendingGroupIds: pendingIds,
      });
      const output = dragEndReducer(state, input);

      expectAccepted(output);
      const resultPg = output.nextTableGroups!.find((g) => g.id === pg.id);
      expect(resultPg!.tiles.length).toBe(4);
      expect(resultPg!.tiles).toContain("R4a");
    });
  });

  describe("[A2.3] [UR-14] [V-15] COMPAT 런 뒤 연장", () => {
    it("R5/R6/R7 pending 런 + R8 rack 드롭 -> 런 뒤 연장", () => {
      // V-15: 같은 색 + 연속 숫자(뒤) = 런 호환
      const pg = pendingGroup(["R5a", "R6a", "R7a"] as TileCode[], "run");
      const pendingIds = new Set([pg.id]);

      const [state, input] = makeReducerArgs({
        tileCode: "R8a" as TileCode,
        source: { kind: "rack" },
        dest: { kind: "pending-group", groupId: pg.id },
        tableGroups: [pg],
        myTiles: ["R8a"] as TileCode[],
        pendingGroupIds: pendingIds,
      });
      const output = dragEndReducer(state, input);

      expectAccepted(output);
      const resultPg = output.nextTableGroups!.find((g) => g.id === pg.id);
      expect(resultPg!.tiles.length).toBe(4);
      expect(resultPg!.tiles).toContain("R8a");
    });
  });

  describe("[A2.4] [UR-19] INCOMPAT -> 새 그룹 생성 (비호환 타일은 새 그룹으로 분리)", () => {
    it("R7/B7/Y7 그룹 + R8 rack (다른 숫자) 드롭 -> 새 그룹 생성 (rack->pending incompat 분기)", () => {
      // rack -> pending 비호환 시 reducer 는 새 pending 그룹 생성
      const pg = pendingGroup(["R7a", "B7a", "Y7a"] as TileCode[], "group");
      const pendingIds = new Set([pg.id]);

      const [state, input] = makeReducerArgs({
        tileCode: "R8a" as TileCode,
        source: { kind: "rack" },
        dest: { kind: "pending-group", groupId: pg.id },
        tableGroups: [pg],
        myTiles: ["R8a"] as TileCode[],
        pendingGroupIds: pendingIds,
        pendingGroupSeq: 100, // ID 충돌 방지: test-helpers groupSeq 와 겹치지 않도록
      });
      const output = dragEndReducer(state, input);

      // rack -> pending incompat: reducer 는 새 그룹 생성 (거절이 아님)
      expectAccepted(output);
      // 기존 그룹 유지 + 새 그룹 1개
      expect(output.nextTableGroups!.length).toBe(2);
      const newGroup = output.nextTableGroups!.find((g) => g.id !== pg.id);
      expect(newGroup).toBeDefined();
      expect(newGroup!.tiles).toContain("R8a");
    });
  });

  describe("[A2.5] [INV-G3] 빈 pending 그룹은 도달 불가 (자동 정리)", () => {
    it("pending 그룹 .tiles=[] 는 setter 단계에서 즉시 제거 (D-03/INV-G3)", () => {
      // INV-G3: 빈 그룹은 존재할 수 없으므로 도달 자체가 불가
      // 이 테스트는 빈 그룹에 대한 drop 시도 결과를 확인
      const pg = pendingGroup([] as TileCode[], "group");
      const pendingIds = new Set([pg.id]);

      const [state, input] = makeReducerArgs({
        tileCode: "R7a" as TileCode,
        source: { kind: "rack" },
        dest: { kind: "pending-group", groupId: pg.id },
        tableGroups: [pg],
        myTiles: ["R7a"] as TileCode[],
        pendingGroupIds: pendingIds,
      });
      const output = dragEndReducer(state, input);

      // 빈 그룹은 존재 자체가 INV-G3 위반. 도달 불가 상태지만
      // 만약 도달하면 새 그룹 생성 또는 기존 그룹에 추가
      // 어느 쪽이든 빈 그룹이 결과에 남지 않아야 함
      if (!output.rejected) {
        for (const g of output.nextTableGroups!) {
          expect(g.tiles.length).toBeGreaterThan(0);
        }
      }
    });
  });
});
