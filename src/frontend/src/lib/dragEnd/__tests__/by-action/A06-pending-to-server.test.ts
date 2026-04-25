/**
 * A6 -- pending -> 서버 확정 그룹 (INC-T11-DUP 회귀 핵심 셀)
 *
 * SSOT 매핑:
 * - 56 section 3.7 셀: A6 (PENDING_BOARD -> SERVER_BOARD)
 * - 룰 ID: V-13a, V-13c, INV-G2, INV-G3, D-12
 * - 상태 전이: S5 -> S3 -> S5
 *
 * 사고 매핑 (직접 회귀 방지):
 * - INC-T11-DUP (docs/04-testing/84): 출발 그룹 tile 미제거 -> D-02 위반
 */

import { describe, it, expect, beforeEach } from "@jest/globals";
import { dragEndReducer } from "../../dragEndReducer";
import type { TileCode, TableGroup } from "@/types/tile";
import {
  serverGroup,
  pendingGroup,
  makeInput,
  resetGroupSeq,
  expectRejected,
  expectAccepted,
  expectTileCountOnBoard,
  expectNoDuplicateTiles,
  expectNoEmptyGroups,
} from "../test-helpers";

describe("[A6] [V-13a] [V-13c] [INV-G2] pending -> server (D-02 atomic 핵심)", () => {
  beforeEach(() => resetGroupSeq());

  describe("[A6.1] [V-13a] [UR-13] PRE_MELD reject", () => {
    it("hasInitialMeld=false + pending tile -> server group drop -> 거절 (V-13a)", () => {
      // V-13a: 최초 등록 전에는 서버 그룹 변형 불가
      const sg = serverGroup(["R7a", "B7a", "Y7a"] as TileCode[], "group");
      const pg = pendingGroup(["K7a"] as TileCode[], "group");
      const pendingIds = new Set([pg.id]);

      const output = dragEndReducer(
        makeInput({
          tileCode: "K7a" as TileCode,
          source: { kind: "pending", groupId: pg.id, index: 0 },
          dest: { kind: "server-group", groupId: sg.id },
          hasInitialMeld: false,
          tableGroups: [sg, pg],
          myTiles: [],
          pendingGroupIds: pendingIds,
        })
      );

      expectRejected(output, "V-13a");
    });
  });

  describe("[A6.2] [V-13c] [UR-14] POST_MELD COMPAT allow + pending 마킹", () => {
    it("hasInitialMeld=true + COMPAT -> 서버 그룹이 pending 으로 마킹, 그룹 ID 보존", () => {
      // V-13c: POST_MELD 에서 호환 타일은 서버 그룹에 추가 허용
      const sg = serverGroup(["R7a", "B7a", "Y7a"] as TileCode[], "group");
      const pg = pendingGroup(["K7a"] as TileCode[], "group");
      const pendingIds = new Set([pg.id]);

      const output = dragEndReducer(
        makeInput({
          tileCode: "K7a" as TileCode,
          source: { kind: "pending", groupId: pg.id, index: 0 },
          dest: { kind: "server-group", groupId: sg.id },
          hasInitialMeld: true,
          tableGroups: [sg, pg],
          myTiles: [],
          pendingGroupIds: pendingIds,
        })
      );

      expectAccepted(output);
      // D-12: 서버 그룹 ID 보존하면서 pending 마킹
      const resultSg = output.nextTableGroups!.find((g) => g.id === sg.id);
      expect(resultSg).toBeDefined();
      expect(resultSg!.tiles).toContain("K7a");
      expect(resultSg!.tiles.length).toBe(4);
      // pending 마킹
      expect(output.nextPendingGroupIds!.has(sg.id)).toBe(true);
      // 출발 그룹에서 타일 제거
      const resultPg = output.nextTableGroups!.find((g) => g.id === pg.id);
      // 1장 뿐이므로 자동 정리 (INV-G3)
      expect(resultPg).toBeUndefined();
    });
  });

  describe("[A6.3] [UR-19] POST_MELD INCOMPAT reject", () => {
    it("POST_MELD + INCOMPAT -> 거절 (UR-19 회색 표시)", () => {
      // UR-19: 호환 안 되는 타일은 거절
      const sg = serverGroup(["R7a", "B7a", "Y7a"] as TileCode[], "group");
      const pg = pendingGroup(["R8a"] as TileCode[], "group"); // 숫자 불일치
      const pendingIds = new Set([pg.id]);

      const output = dragEndReducer(
        makeInput({
          tileCode: "R8a" as TileCode,
          source: { kind: "pending", groupId: pg.id, index: 0 },
          dest: { kind: "server-group", groupId: sg.id },
          hasInitialMeld: true,
          tableGroups: [sg, pg],
          myTiles: [],
          pendingGroupIds: pendingIds,
        })
      );

      expectRejected(output, "UR-19");
    });
  });

  describe("[A6.4] [INV-G3] 출발 pending 빈 -> 자동 정리", () => {
    it("1장 짜리 pending 그룹의 마지막 tile 을 server 로 -> 출발 자동 제거", () => {
      const sg = serverGroup(["R7a", "B7a", "Y7a"] as TileCode[], "group");
      const pg = pendingGroup(["K7a"] as TileCode[], "group");
      const pendingIds = new Set([pg.id]);

      const output = dragEndReducer(
        makeInput({
          tileCode: "K7a" as TileCode,
          source: { kind: "pending", groupId: pg.id, index: 0 },
          dest: { kind: "server-group", groupId: sg.id },
          hasInitialMeld: true,
          tableGroups: [sg, pg],
          myTiles: [],
          pendingGroupIds: pendingIds,
        })
      );

      expectAccepted(output);
      // INV-G3: 빈 그룹 없음
      expectNoEmptyGroups(output.nextTableGroups!);
      // pg 가 제거되어야 함
      expect(output.nextTableGroups!.find((g) => g.id === pg.id)).toBeUndefined();
    });
  });

  describe("[A6.5] [D-12] 서버 그룹 pending 마킹 (D-12 정합성)", () => {
    it("drop 후 state.pendingGroupIds 에 serverGroupId 포함, ConfirmTurn 시 다시 서버 commit", () => {
      const sg = serverGroup(["R7a", "B7a"] as TileCode[], "group");
      const pg = pendingGroup(["Y7a", "K7a"] as TileCode[], "group");
      const pendingIds = new Set([pg.id]);

      const output = dragEndReducer(
        makeInput({
          tileCode: "Y7a" as TileCode,
          source: { kind: "pending", groupId: pg.id, index: 0 },
          dest: { kind: "server-group", groupId: sg.id },
          hasInitialMeld: true,
          tableGroups: [sg, pg],
          myTiles: [],
          pendingGroupIds: pendingIds,
        })
      );

      expectAccepted(output);
      // D-12: 서버 그룹이 pending 마킹됨
      expect(output.nextPendingGroupIds!.has(sg.id)).toBe(true);
    });
  });

  describe("[A6.6] [INV-G2] [D-02] **INC-T11-DUP 직접 회귀** -- atomic tile 이동 검증", () => {
    it("B11a pending -> 서버 그룹 drop -> 출발에서 제거 + 서버에 추가, 보드 위 B11a 정확히 1회", () => {
      // INC-T11-DUP 사고 직접 reproduction (docs/04-testing/84)
      // 사용자: B11a -> 12s 4-tile 그룹 합병 시도
      // 회귀 코드: 출발 [K11a,R11a,Y11a] 에 B11a 남음 + 서버에도 B11a 추가 -> D-02 위반
      const sg = serverGroup(
        ["R12a", "B12a", "K12a", "Y12a"] as TileCode[],
        "group"
      ); // 12 4색 그룹

      // pending: B11a + K11a + R11a (3장 11 그룹)
      const pg = pendingGroup(
        ["B11a", "K11a", "R11a"] as TileCode[],
        "group"
      );
      const pendingIds = new Set([pg.id]);

      const output = dragEndReducer(
        makeInput({
          tileCode: "B11a" as TileCode,
          source: { kind: "pending", groupId: pg.id, index: 0 },
          dest: { kind: "server-group", groupId: sg.id },
          hasInitialMeld: true,
          tableGroups: [sg, pg],
          myTiles: [],
          pendingGroupIds: pendingIds,
        })
      );

      // 호환성 체크: B11a (숫자 11)는 12 그룹과 비호환 -> 거절되어야 함 (UR-19)
      // Note: 매트릭스 56 section 3.7 A6 POST_MELD/INCOMPAT = 거절
      // 사고 시나리오에서는 이 검증이 누락되어 D-02 위반 발생
      expectRejected(output, "UR-19");

      // 대안 시나리오: 호환되는 경우의 atomic 이동 검증
      const sg2 = serverGroup(
        ["R11a", "K11a", "Y11a"] as TileCode[],
        "group"
      ); // 11 3색 그룹
      const pg2 = pendingGroup(["B11a"] as TileCode[], "group");
      const pendingIds2 = new Set([pg2.id]);

      const output2 = dragEndReducer(
        makeInput({
          tileCode: "B11a" as TileCode,
          source: { kind: "pending", groupId: pg2.id, index: 0 },
          dest: { kind: "server-group", groupId: sg2.id },
          hasInitialMeld: true,
          tableGroups: [sg2, pg2],
          myTiles: [],
          pendingGroupIds: pendingIds2,
        })
      );

      expectAccepted(output2);
      // D-02 invariant: B11a 는 보드 전체에서 정확히 1회 등장
      expectTileCountOnBoard(output2.nextTableGroups!, "B11a" as TileCode, 1);
      // INV-G2: 전체 보드 타일 중복 없음
      expectNoDuplicateTiles(output2.nextTableGroups!);
      // 출발 그룹에서 B11a 제거 (1장이므로 자동 정리)
      expect(output2.nextTableGroups!.find((g) => g.id === pg2.id)).toBeUndefined();
      // 서버 그룹에 B11a 추가
      const resultSg2 = output2.nextTableGroups!.find((g) => g.id === sg2.id);
      expect(resultSg2).toBeDefined();
      expect(resultSg2!.tiles).toContain("B11a");
      expect(resultSg2!.tiles.length).toBe(4); // 3 + 1 = 4색 완전 그룹
    });
  });
});
