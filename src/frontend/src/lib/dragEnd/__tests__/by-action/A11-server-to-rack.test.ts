/**
 * A11 -- 서버 -> 랙 (회수) -- V-06 conservation 위반 거절
 *
 * SSOT 매핑:
 * - 56 section 3.12 셀: A11 (SERVER_BOARD -> RACK)
 * - 룰 ID: V-06, UR-12
 *
 * 본 셀은 "전부 거절" -- 어떤 상태에서도 서버 commit tile 을 랙으로 회수 불가.
 * reducer 에서 source 가 table(server) + overId="player-rack" -> cannot-return-server-tile
 */

import { describe, it, expect, beforeEach } from "@jest/globals";
import { dragEndReducer } from "../../dragEndReducer";
import type { TileCode } from "@/types/tile";
import {
  serverGroup,
  makeReducerArgs,
  resetGroupSeq,
  expectRejected,
} from "../test-helpers";

describe("[A11] [V-06] [UR-12] server -> rack (전체 거절)", () => {
  beforeEach(() => resetGroupSeq());

  describe("[A11.1] [V-13a] PRE_MELD reject", () => {
    it("hasInitialMeld=false + server tile -> rack drop -> 거절 (cannot-return-server-tile)", () => {
      const sg = serverGroup(["R7a", "B7a", "Y7a"] as TileCode[], "group");

      const [state, input] = makeReducerArgs({
        tileCode: "R7a" as TileCode,
        source: { kind: "server", groupId: sg.id, index: 0 },
        dest: { kind: "rack" },
        hasInitialMeld: false,
        tableGroups: [sg],
        myTiles: [],
      });
      const output = dragEndReducer(state, input);

      expectRejected(output, "cannot-return-server-tile");
    });
  });

  describe("[A11.2] [V-06] [UR-12] POST_MELD reject (conservation)", () => {
    it("hasInitialMeld=true + server tile -> rack drop -> 거절 (cannot-return-server-tile)", () => {
      // V-06: 서버 commit 된 tile 을 랙으로 회수 불가
      const sg = serverGroup(["R7a", "B7a", "Y7a"] as TileCode[], "group");

      const [state, input] = makeReducerArgs({
        tileCode: "R7a" as TileCode,
        source: { kind: "server", groupId: sg.id, index: 0 },
        dest: { kind: "rack" },
        hasInitialMeld: true,
        tableGroups: [sg],
        myTiles: [],
      });
      const output = dragEndReducer(state, input);

      expectRejected(output, "cannot-return-server-tile");
    });
  });

  describe("[A11.3] [V-06] conservation 위반 unified message", () => {
    it("어떤 상태에서도 server -> rack drop 차단", () => {
      // 추가 검증: POST_MELD + 다양한 그룹 타입에서도 동일하게 거절
      const sgRun = serverGroup(["R5a", "R6a", "R7a"] as TileCode[], "run");

      const [state, input] = makeReducerArgs({
        tileCode: "R5a" as TileCode,
        source: { kind: "server", groupId: sgRun.id, index: 0 },
        dest: { kind: "rack" },
        hasInitialMeld: true,
        tableGroups: [sgRun],
        myTiles: [],
      });
      const output = dragEndReducer(state, input);

      expectRejected(output, "cannot-return-server-tile");
    });
  });
});
