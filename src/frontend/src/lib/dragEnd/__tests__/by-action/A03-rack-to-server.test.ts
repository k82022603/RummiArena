/**
 * A3 -- 랙 -> 보드 서버 확정 그룹 드롭 (rack-to-server-extend)
 *
 * SSOT 매핑:
 * - 56 section 3.4 셀: A3 (RACK -> SERVER_BOARD)
 * - 룰 ID: UR-13, UR-14, UR-19, V-13a, V-13b, V-17, D-12
 *
 * 사고 매핑:
 * - BUG-UI-EXT-SC1: POST_MELD/COMPAT/허용이 회귀로 차단된 사고
 * - INC-T11-FP-B10: source guard 가 false positive 차단한 사고
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
  expectNoDuplicateTiles,
} from "../test-helpers";

describe("[A3] [V-13a] [V-17] rack -> server group (extend)", () => {
  beforeEach(() => resetGroupSeq());

  describe("[A3.1] [V-13a] [UR-13] PRE_MELD reject", () => {
    it("hasInitialMeld=false + rack drop on server group -> 거절 (V-13a)", () => {
      // V-13a: 최초 등록 전에는 서버 그룹 건드릴 수 없음
      const sg = serverGroup(["R7a", "B7a", "Y7a"] as TileCode[], "group");

      const output = dragEndReducer(
        makeInput({
          tileCode: "K7a" as TileCode,
          source: { kind: "rack" },
          dest: { kind: "server-group", groupId: sg.id },
          hasInitialMeld: false,
          tableGroups: [sg],
          myTiles: ["K7a"] as TileCode[],
        })
      );

      expectRejected(output, "V-13a");
    });
  });

  describe("[A3.2] [V-13a] [V-13b] [UR-14] [V-17] [D-12] POST_MELD COMPAT allow + pending 마킹", () => {
    it("hasInitialMeld=true + COMPAT rack drop -> 서버 그룹 pending 마킹, ID 보존 (V-17)", () => {
      // V-13b: POST_MELD 에서 서버 그룹 확장 허용
      const sg = serverGroup(["R7a", "B7a", "Y7a"] as TileCode[], "group");

      const output = dragEndReducer(
        makeInput({
          tileCode: "K7a" as TileCode,
          source: { kind: "rack" },
          dest: { kind: "server-group", groupId: sg.id },
          hasInitialMeld: true,
          tableGroups: [sg],
          myTiles: ["K7a"] as TileCode[],
        })
      );

      expectAccepted(output);
      // D-12: pending 마킹
      expect(output.nextPendingGroupIds!.has(sg.id)).toBe(true);
      // V-17: 서버 발급 UUID 유지
      const resultSg = output.nextTableGroups!.find((g) => g.id === sg.id);
      expect(resultSg).toBeDefined();
      expect(resultSg!.id).toBe(sg.id);
      // 타일 추가
      expect(resultSg!.tiles.length).toBe(4);
      expect(resultSg!.tiles).toContain("K7a");
      // 랙에서 제거
      expect(output.nextMyTiles!).not.toContain("K7a");
    });
  });

  describe("[A3.3] [UR-19] POST_MELD INCOMPAT reject", () => {
    it("POST_MELD + INCOMPAT (다른 숫자 그룹에 드롭) -> 거절 (UR-19)", () => {
      // UR-19: 비호환 타일 거절
      const sg = serverGroup(["R7a", "B7a", "Y7a"] as TileCode[], "group");

      const output = dragEndReducer(
        makeInput({
          tileCode: "R8a" as TileCode,
          source: { kind: "rack" },
          dest: { kind: "server-group", groupId: sg.id },
          hasInitialMeld: true,
          tableGroups: [sg],
          myTiles: ["R8a"] as TileCode[],
        })
      );

      expectRejected(output, "UR-19");
    });
  });

  describe("[A3.4] [V-17] [D-01] 그룹 ID 보존 (UUID 형식 유지)", () => {
    it("drop 후 serverGroup.id 는 UUID v4 형식 유지", () => {
      // V-17: 클라가 새 ID 할당 X. 서버 발급 ID 그대로 유지
      const sg = serverGroup(["R5a", "R6a", "R7a"] as TileCode[], "run");

      const output = dragEndReducer(
        makeInput({
          tileCode: "R8a" as TileCode,
          source: { kind: "rack" },
          dest: { kind: "server-group", groupId: sg.id },
          hasInitialMeld: true,
          tableGroups: [sg],
          myTiles: ["R8a"] as TileCode[],
        })
      );

      expectAccepted(output);
      const resultSg = output.nextTableGroups!.find((g) => g.id === sg.id);
      expect(resultSg).toBeDefined();
      // ID 는 서버 발급 형식 (test-helpers 의 UUID 패턴)
      expect(resultSg!.id).toBe(sg.id);
      // pending- prefix 가 아닌 원래 UUID 유지
      expect(resultSg!.id.startsWith("pending-")).toBe(false);
    });
  });

  describe("[A3.5] [V-17] 서버 ID 검증 (빈 ID 거부)", () => {
    it("serverGroup.id === '' 인 그룹 (V-17 위반 상태) -> drop 차단", () => {
      // INC-T11-IDDUP 직접 회귀 방지 (86 section 3.1 -- processAIPlace ID 누락)
      const sg: TableGroup = {
        id: "", // V-17 위반
        tiles: ["R7a", "B7a", "Y7a"] as TileCode[],
        type: "group",
      };

      const output = dragEndReducer(
        makeInput({
          tileCode: "K7a" as TileCode,
          source: { kind: "rack" },
          dest: { kind: "server-group", groupId: sg.id },
          hasInitialMeld: true,
          tableGroups: [sg],
          myTiles: ["K7a"] as TileCode[],
        })
      );

      expectRejected(output, "V-17");
    });
  });

  describe("[A3.6] [V-08] [UR-01] OTHER_TURN reject", () => {
    it("다른 플레이어 턴 -> rack 드래그 차단", () => {
      // V-08: 내 턴이 아니면 조작 불가
      const sg = serverGroup(["R7a", "B7a", "Y7a"] as TileCode[], "group");

      const output = dragEndReducer(
        makeInput({
          tileCode: "K7a" as TileCode,
          source: { kind: "rack" },
          dest: { kind: "server-group", groupId: sg.id },
          isMyTurn: false,
          hasInitialMeld: true,
          tableGroups: [sg],
          myTiles: ["K7a"] as TileCode[],
        })
      );

      expectRejected(output, "V-08");
    });
  });
});
