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
 *
 * NOTE: V-08 (isMyTurn) 은 UI 레이어 책임. 본 reducer 테스트 범위 밖.
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
  expectNoDuplicateTiles,
} from "../test-helpers";

describe("[A3] [V-13a] [V-17] rack -> server group (extend)", () => {
  beforeEach(() => resetGroupSeq());

  describe("[A3.1] [V-13a] [UR-13] PRE_MELD -> 새 pending 그룹 생성 (서버 보호)", () => {
    it("hasInitialMeld=false + rack drop on server group -> 새 pending 그룹 생성 (서버 그룹 보호)", () => {
      // PRE_MELD: 서버 그룹 확장 불가, 대신 새 pending 그룹 생성 + warning
      const sg = serverGroup(["R7a", "B7a", "Y7a"] as TileCode[], "group");

      const [state, input] = makeReducerArgs({
        tileCode: "K7a" as TileCode,
        source: { kind: "rack" },
        dest: { kind: "server-group", groupId: sg.id },
        hasInitialMeld: false,
        tableGroups: [sg],
        myTiles: ["K7a"] as TileCode[],
      });
      const output = dragEndReducer(state, input);

      // PRE_MELD: reducer 는 서버 그룹 확장 대신 새 pending 그룹 생성 + warning
      expectAccepted(output);
      expect(output.warning).toBe("extend-lock-before-initial-meld");
      // 서버 그룹 원본 유지
      const resultSg = output.nextTableGroups!.find((g) => g.id === sg.id);
      expect(resultSg!.tiles.length).toBe(3); // 변경 없음
      // 새 pending 그룹 생성
      const newGroup = output.nextTableGroups!.find((g) => g.id !== sg.id);
      expect(newGroup).toBeDefined();
      expect(newGroup!.tiles).toContain("K7a");
    });
  });

  describe("[A3.2] [V-13a] [V-13b] [UR-14] [V-17] [D-12] POST_MELD COMPAT allow + pending 마킹", () => {
    it("hasInitialMeld=true + COMPAT rack drop -> 서버 그룹 pending 마킹, ID 보존 (V-17)", () => {
      // V-13b: POST_MELD 에서 서버 그룹 확장 허용
      const sg = serverGroup(["R7a", "B7a", "Y7a"] as TileCode[], "group");

      const [state, input] = makeReducerArgs({
        tileCode: "K7a" as TileCode,
        source: { kind: "rack" },
        dest: { kind: "server-group", groupId: sg.id },
        hasInitialMeld: true,
        tableGroups: [sg],
        myTiles: ["K7a"] as TileCode[],
      });
      const output = dragEndReducer(state, input);

      expectAccepted(output);
      // D-12: pending 마킹
      expect(output.nextPendingGroupIds.has(sg.id)).toBe(true);
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

  describe("[A3.3] [UR-19] POST_MELD INCOMPAT -> 새 그룹 생성", () => {
    it("POST_MELD + INCOMPAT (다른 숫자 그룹에 드롭) -> 새 pending 그룹 생성", () => {
      // rack -> server incompat: reducer 는 새 pending 그룹 생성
      const sg = serverGroup(["R7a", "B7a", "Y7a"] as TileCode[], "group");

      const [state, input] = makeReducerArgs({
        tileCode: "R8a" as TileCode,
        source: { kind: "rack" },
        dest: { kind: "server-group", groupId: sg.id },
        hasInitialMeld: true,
        tableGroups: [sg],
        myTiles: ["R8a"] as TileCode[],
      });
      const output = dragEndReducer(state, input);

      // rack -> server incompat: 새 pending 그룹 생성
      expectAccepted(output);
      expect(output.nextTableGroups!.length).toBe(2);
      const newGroup = output.nextTableGroups!.find((g) => g.id !== sg.id);
      expect(newGroup).toBeDefined();
      expect(newGroup!.tiles).toContain("R8a");
    });
  });

  describe("[A3.4] [V-17] [D-01] 그룹 ID 보존 (UUID 형식 유지)", () => {
    it("drop 후 serverGroup.id 는 UUID v4 형식 유지", () => {
      // V-17: 클라가 새 ID 할당 X. 서버 발급 ID 그대로 유지
      const sg = serverGroup(["R5a", "R6a", "R7a"] as TileCode[], "run");

      const [state, input] = makeReducerArgs({
        tileCode: "R8a" as TileCode,
        source: { kind: "rack" },
        dest: { kind: "server-group", groupId: sg.id },
        hasInitialMeld: true,
        tableGroups: [sg],
        myTiles: ["R8a"] as TileCode[],
      });
      const output = dragEndReducer(state, input);

      expectAccepted(output);
      const resultSg = output.nextTableGroups!.find((g) => g.id === sg.id);
      expect(resultSg).toBeDefined();
      // ID 는 서버 발급 형식 (test-helpers 의 UUID 패턴)
      expect(resultSg!.id).toBe(sg.id);
      // pending- prefix 가 아닌 원래 UUID 유지
      expect(resultSg!.id.startsWith("pending-")).toBe(false);
    });
  });
});
