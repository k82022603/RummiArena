/**
 * A12 -- 조커 swap (V-13e)
 *
 * SSOT 매핑:
 * - 56 section 3.13 셀: A12 (RACK -> JOKER_TILE)
 * - 룰 ID: V-13a, V-13e, V-07, UR-25
 *
 * NOTE: rack source + overId=serverGroupId (조커 포함 그룹).
 *       reducer 가 joker swap 을 우선 시도한다.
 *       PRE_MELD 에서는 server 그룹 joker swap 불가 (isPending=false && !hasInitialMeld).
 */

import { describe, it, expect, beforeEach } from "@jest/globals";
import { dragEndReducer } from "../../dragEndReducer";
import type { TileCode } from "@/types/tile";
import {
  serverGroup,
  makeReducerArgs,
  resetGroupSeq,
  expectRejected,
  expectAccepted,
} from "../test-helpers";

describe("[A12] [V-13a] [V-13e] [V-07] joker swap", () => {
  beforeEach(() => resetGroupSeq());

  describe("[A12.1] [V-13a] [UR-13] PRE_MELD -- 서버 그룹 joker swap 차단", () => {
    it("hasInitialMeld=false + rack tile -> 서버 joker 그룹 drop -> 새 pending 그룹 생성 (서버 보호)", () => {
      // PRE_MELD: isPending=false && !hasInitialMeld -> joker swap 건너뜀
      // rack -> server incompat/compat 분기로 진입: hasInitialMeld=false -> 새 pending 그룹 + warning
      const sg = serverGroup(["R7a", "B7a", "JK1"] as TileCode[], "group");

      const [state, input] = makeReducerArgs({
        tileCode: "Y7a" as TileCode,
        source: { kind: "rack" },
        dest: { kind: "joker-tile", groupId: sg.id },
        hasInitialMeld: false,
        tableGroups: [sg],
        myTiles: ["Y7a"] as TileCode[],
      });
      const output = dragEndReducer(state, input);

      // PRE_MELD: 서버 그룹 보호 -> 새 pending 그룹 생성 + warning
      expectAccepted(output);
      expect(output.warning).toBe("extend-lock-before-initial-meld");
    });
  });

  describe("[A12.2] [V-13e] POST_MELD 그룹 swap", () => {
    it("서버 [R7,B7,JK1] + 랙 Y7 -> JK1 위에 drop -> JK1 회수, 그룹 [R7,B7,Y7]", () => {
      // V-13e: 조커를 동등 가치 타일로 교체
      const sg = serverGroup(["R7a", "B7a", "JK1"] as TileCode[], "group");

      const [state, input] = makeReducerArgs({
        tileCode: "Y7a" as TileCode,
        source: { kind: "rack" },
        dest: { kind: "joker-tile", groupId: sg.id },
        hasInitialMeld: true,
        tableGroups: [sg],
        myTiles: ["Y7a"] as TileCode[],
      });
      const output = dragEndReducer(state, input);

      expectAccepted(output);
      // 그룹에서 JK1 -> Y7 교체
      const resultSg = output.nextTableGroups!.find((g) => g.id === sg.id);
      expect(resultSg!.tiles).toContain("Y7a");
      expect(resultSg!.tiles).not.toContain("JK1");
      // 랙에 JK1 추가 (회수)
      expect(output.nextMyTiles!).toContain("JK1");
      expect(output.nextMyTiles!).not.toContain("Y7a");
      // pendingRecoveredJokers 에 JK1 기록
      expect(output.nextPendingRecoveredJokers).toContain("JK1");
    });
  });

  describe("[A12.3] [V-13e] POST_MELD 런 swap", () => {
    it("서버 [R5,JK1,R7] (R6 대체) + 랙 R6 -> JK1 위에 drop -> JK1 회수, 런 [R5,R6,R7]", () => {
      const sg = serverGroup(["R5a", "JK1", "R7a"] as TileCode[], "run");

      const [state, input] = makeReducerArgs({
        tileCode: "R6a" as TileCode,
        source: { kind: "rack" },
        dest: { kind: "joker-tile", groupId: sg.id },
        hasInitialMeld: true,
        tableGroups: [sg],
        myTiles: ["R6a"] as TileCode[],
      });
      const output = dragEndReducer(state, input);

      expectAccepted(output);
      const resultSg = output.nextTableGroups!.find((g) => g.id === sg.id);
      expect(resultSg!.tiles).toContain("R6a");
      expect(resultSg!.tiles).not.toContain("JK1");
      expect(output.nextMyTiles!).toContain("JK1");
    });
  });

  describe("[A12.4] [V-13e] 동등 가치 위반 -- fallback 분기 (서버 그룹 확장 또는 새 그룹)", () => {
    it("서버 [R5,JK1,R7] (R6 대체) + 랙 R8 (값 불일치) -> swap 실패 -> 서버 확장/새 그룹", () => {
      // V-13e: 동등 가치가 아닌 타일은 swap 불가 -> 다음 분기로 진행
      // rack -> server group 경로: hasInitialMeld=true -> compat check
      const sg = serverGroup(["R5a", "JK1", "R7a"] as TileCode[], "run");

      const [state, input] = makeReducerArgs({
        tileCode: "R8a" as TileCode,
        source: { kind: "rack" },
        dest: { kind: "joker-tile", groupId: sg.id },
        hasInitialMeld: true,
        tableGroups: [sg],
        myTiles: ["R8a"] as TileCode[],
      });
      const output = dragEndReducer(state, input);

      // swap 실패 후 서버 그룹 확장 시도:
      // R8 이 [R5,JK1,R7] 런에 호환 가능 -> 서버 그룹 확장
      // 또는 비호환이면 새 그룹 생성
      // 어느 쪽이든 거절은 아님 (rack source 는 대부분 새 그룹 생성 fallback)
      expectAccepted(output);
    });
  });

  describe("[A12.5] [V-07] [UR-25] 회수 조커 -> pendingRecoveredJokers 기록", () => {
    it("swap 후 state.pendingRecoveredJokers === [JK1]", () => {
      const sg = serverGroup(["R7a", "B7a", "JK1"] as TileCode[], "group");

      const [state, input] = makeReducerArgs({
        tileCode: "Y7a" as TileCode,
        source: { kind: "rack" },
        dest: { kind: "joker-tile", groupId: sg.id },
        hasInitialMeld: true,
        tableGroups: [sg],
        myTiles: ["Y7a"] as TileCode[],
      });
      const output = dragEndReducer(state, input);

      expectAccepted(output);
      // V-07: 회수 조커 기록
      expect(output.nextPendingRecoveredJokers).toContain("JK1");
      expect(output.nextPendingRecoveredJokers.length).toBe(1);
    });
  });

  describe("[A12.6] [V-07] 같은 턴 미사용 -> ConfirmTurn 차단", () => {
    it("swap 후 회수 JK1 미배치 -> pendingRecoveredJokers.length > 0", () => {
      // V-07: 회수 조커 미배치 시 ConfirmTurn 비활성
      const sg = serverGroup(["R7a", "B7a", "JK1"] as TileCode[], "group");

      const [state, input] = makeReducerArgs({
        tileCode: "Y7a" as TileCode,
        source: { kind: "rack" },
        dest: { kind: "joker-tile", groupId: sg.id },
        hasInitialMeld: true,
        tableGroups: [sg],
        myTiles: ["Y7a"] as TileCode[],
      });
      const output = dragEndReducer(state, input);

      expectAccepted(output);
      // 회수 조커가 아직 pendingRecoveredJokers 에 있음 -> ConfirmTurn 비활성 신호
      expect(output.nextPendingRecoveredJokers.length).toBeGreaterThan(0);
    });
  });
});
