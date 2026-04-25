/**
 * A1 -- 랙 -> 보드 새 그룹 드롭 (rack-to-new-group)
 *
 * SSOT 매핑:
 * - 56 section 3.2 셀: A1 (RACK -> NEW_GROUP)
 * - 룰 ID: UR-06, UR-11, UR-15, V-08, D-01, D-12
 * - 상태 전이: S1 -> S2 -> S5
 *
 * NOTE: V-08 (isMyTurn) 은 UI 레이어 책임. 본 reducer 테스트 범위 밖.
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
  expectUniqueGroupIds,
} from "../test-helpers";

describe("[A1] [V-08] [UR-06] rack -> new group", () => {
  beforeEach(() => resetGroupSeq());

  describe("[A1.1] [UR-06] [UR-11] [D-12] MY_TURN PRE_MELD allow", () => {
    it("내 턴 + hasInitialMeld=false -> 새 pending 그룹 생성 (V-04 무관, 자기 랙만 사용)", () => {
      // V-13a 는 서버 그룹 건드리기에만 적용. 새 그룹은 자기 랙만이므로 PRE_MELD 도 허용
      const [state, input] = makeReducerArgs({
        tileCode: "R7a" as TileCode,
        source: { kind: "rack" },
        dest: { kind: "new-group" },
        hasInitialMeld: false,
        myTiles: ["R7a", "B7a"] as TileCode[],
      });
      const output = dragEndReducer(state, input);

      expectAccepted(output);
      // 새 그룹 1개 생성
      expect(output.nextTableGroups!.length).toBe(1);
      // D-12: pending- prefix
      expect(output.nextTableGroups![0].id.startsWith("pending-")).toBe(true);
      // D-01: 유니크
      expectUniqueGroupIds(output.nextTableGroups!);
      // 랙에서 타일 제거
      expect(output.nextMyTiles!).not.toContain("R7a");
      expect(output.nextMyTiles!).toContain("B7a");
    });
  });

  describe("[A1.2] [UR-06] [UR-11] [D-12] MY_TURN POST_MELD allow", () => {
    it("내 턴 + hasInitialMeld=true -> 새 pending 그룹 생성 (PRE_MELD 와 동일)", () => {
      const [state, input] = makeReducerArgs({
        tileCode: "B13a" as TileCode,
        source: { kind: "rack" },
        dest: { kind: "new-group" },
        hasInitialMeld: true,
        myTiles: ["B13a", "K1a"] as TileCode[],
      });
      const output = dragEndReducer(state, input);

      expectAccepted(output);
      expect(output.nextTableGroups!.length).toBe(1);
      expect(output.nextTableGroups![0].tiles).toContain("B13a");
      expect(output.nextMyTiles!).toEqual(["K1a"]);
    });
  });

  describe("[A1.3] [D-01] [D-12] pending- prefix ID 발급", () => {
    it('새 그룹 ID = "pending-{...}" 형식, 기존 그룹 ID 와 충돌 없음 (INV-G1)', () => {
      // 기존 서버 그룹이 있는 상태에서 새 그룹 생성 -> ID 충돌 없음
      const sg = serverGroup(["R1a", "B1a", "Y1a"] as TileCode[], "group");

      const [state, input] = makeReducerArgs({
        tileCode: "K5a" as TileCode,
        source: { kind: "rack" },
        dest: { kind: "new-group" },
        hasInitialMeld: true,
        tableGroups: [sg],
        myTiles: ["K5a"] as TileCode[],
      });
      const output = dragEndReducer(state, input);

      expectAccepted(output);
      // 기존 서버 그룹 + 새 pending 그룹 = 2개
      expect(output.nextTableGroups!.length).toBe(2);
      // 새 그룹은 pending- prefix
      const newGroup = output.nextTableGroups!.find((g) => g.id !== sg.id);
      expect(newGroup).toBeDefined();
      expect(newGroup!.id.startsWith("pending-")).toBe(true);
      // INV-G1: 모든 ID 유니크
      expectUniqueGroupIds(output.nextTableGroups!);
      // pending ID 세트에 등록
      expect(output.nextPendingGroupIds.has(newGroup!.id)).toBe(true);
    });
  });
});
