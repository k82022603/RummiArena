/**
 * A12 -- 조커 swap (V-13e)
 *
 * SSOT 매핑:
 * - 56 section 3.13 셀: A12 (RACK -> JOKER_TILE)
 * - 룰 ID: V-13a, V-13e, V-07, UR-25
 */

import { describe, it, expect, beforeEach } from "@jest/globals";
import { dragEndReducer } from "../../dragEndReducer";
import type { TileCode } from "@/types/tile";
import {
  serverGroup,
  makeInput,
  resetGroupSeq,
  expectRejected,
  expectAccepted,
} from "../test-helpers";

describe("[A12] [V-13a] [V-13e] [V-07] joker swap", () => {
  beforeEach(() => resetGroupSeq());

  describe("[A12.1] [V-13a] [UR-13] PRE_MELD reject", () => {
    it("hasInitialMeld=false + rack tile -> joker drop -> 거절 (V-13a)", () => {
      // V-13a: 최초 등록 전에는 서버 그룹 변형 불가
      const sg = serverGroup(["R7a", "B7a", "JK1"] as TileCode[], "group");

      const output = dragEndReducer(
        makeInput({
          tileCode: "Y7a" as TileCode,
          source: { kind: "rack" },
          dest: { kind: "joker-tile", groupId: sg.id },
          hasInitialMeld: false,
          tableGroups: [sg],
          myTiles: ["Y7a"] as TileCode[],
        })
      );

      expectRejected(output, "V-13a");
    });
  });

  describe("[A12.2] [V-13e] POST_MELD 그룹 swap", () => {
    it("서버 [R7,B7,JK1] + 랙 Y7 -> JK1 위에 drop -> JK1 회수, 그룹 [R7,B7,Y7]", () => {
      // V-13e: 조커를 동등 가치 타일로 교체
      const sg = serverGroup(["R7a", "B7a", "JK1"] as TileCode[], "group");

      const output = dragEndReducer(
        makeInput({
          tileCode: "Y7a" as TileCode,
          source: { kind: "rack" },
          dest: { kind: "joker-tile", groupId: sg.id },
          hasInitialMeld: true,
          tableGroups: [sg],
          myTiles: ["Y7a"] as TileCode[],
        })
      );

      expectAccepted(output);
      // 그룹에서 JK1 -> Y7 교체
      const resultSg = output.nextTableGroups!.find((g) => g.id === sg.id);
      expect(resultSg!.tiles).toContain("Y7a");
      expect(resultSg!.tiles).not.toContain("JK1");
      // 랙에 JK1 추가 (회수)
      expect(output.nextMyTiles!).toContain("JK1");
      expect(output.nextMyTiles!).not.toContain("Y7a");
      // pendingRecoveredJokers 에 JK1 기록
      expect(output.nextPendingRecoveredJokers!).toContain("JK1");
    });
  });

  describe("[A12.3] [V-13e] POST_MELD 런 swap", () => {
    it("서버 [R5,JK1,R7] (R6 대체) + 랙 R6 -> JK1 위에 drop -> JK1 회수, 런 [R5,R6,R7]", () => {
      const sg = serverGroup(["R5a", "JK1", "R7a"] as TileCode[], "run");

      const output = dragEndReducer(
        makeInput({
          tileCode: "R6a" as TileCode,
          source: { kind: "rack" },
          dest: { kind: "joker-tile", groupId: sg.id },
          hasInitialMeld: true,
          tableGroups: [sg],
          myTiles: ["R6a"] as TileCode[],
        })
      );

      expectAccepted(output);
      const resultSg = output.nextTableGroups!.find((g) => g.id === sg.id);
      expect(resultSg!.tiles).toContain("R6a");
      expect(resultSg!.tiles).not.toContain("JK1");
      expect(output.nextMyTiles!).toContain("JK1");
    });
  });

  describe("[A12.4] [V-13e] 동등 가치 위반 reject", () => {
    it("서버 [R5,JK1,R7] (R6 대체) + 랙 R8 (값 불일치) -> drop -> 거절 (V-13e)", () => {
      // V-13e: 동등 가치가 아닌 타일은 swap 불가
      const sg = serverGroup(["R5a", "JK1", "R7a"] as TileCode[], "run");

      const output = dragEndReducer(
        makeInput({
          tileCode: "R8a" as TileCode,
          source: { kind: "rack" },
          dest: { kind: "joker-tile", groupId: sg.id },
          hasInitialMeld: true,
          tableGroups: [sg],
          myTiles: ["R8a"] as TileCode[],
        })
      );

      expectRejected(output, "V-13e");
    });
  });

  describe("[A12.5] [V-07] [UR-25] 회수 조커 -> pendingRecoveredJokers 기록", () => {
    it("swap 후 state.pendingRecoveredJokers === [JK1]", () => {
      const sg = serverGroup(["R7a", "B7a", "JK1"] as TileCode[], "group");

      const output = dragEndReducer(
        makeInput({
          tileCode: "Y7a" as TileCode,
          source: { kind: "rack" },
          dest: { kind: "joker-tile", groupId: sg.id },
          hasInitialMeld: true,
          tableGroups: [sg],
          myTiles: ["Y7a"] as TileCode[],
        })
      );

      expectAccepted(output);
      // V-07: 회수 조커 기록
      expect(output.nextPendingRecoveredJokers!).toContain("JK1");
      expect(output.nextPendingRecoveredJokers!.length).toBe(1);
    });
  });

  describe("[A12.6] [V-07] 같은 턴 미사용 -> ConfirmTurn 차단", () => {
    it("swap 후 회수 JK1 미배치 -> pendingRecoveredJokers.length > 0", () => {
      // V-07: 회수 조커 미배치 시 ConfirmTurn 비활성
      // 본 테스트는 reducer 출력의 pendingRecoveredJokers 상태만 확인
      // ConfirmTurn 비활성화 로직은 A14 에서 검증
      const sg = serverGroup(["R7a", "B7a", "JK1"] as TileCode[], "group");

      const output = dragEndReducer(
        makeInput({
          tileCode: "Y7a" as TileCode,
          source: { kind: "rack" },
          dest: { kind: "joker-tile", groupId: sg.id },
          hasInitialMeld: true,
          tableGroups: [sg],
          myTiles: ["Y7a"] as TileCode[],
        })
      );

      expectAccepted(output);
      // 회수 조커가 아직 pendingRecoveredJokers 에 있음 -> ConfirmTurn 비활성 신호
      expect(output.nextPendingRecoveredJokers!.length).toBeGreaterThan(0);
    });
  });
});
