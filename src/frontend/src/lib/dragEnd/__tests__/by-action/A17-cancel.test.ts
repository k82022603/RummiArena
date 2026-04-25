/**
 * A17 -- 드래그 취소 (esc / onDragCancel)
 *
 * SSOT 매핑:
 * - 56 section 3.18 셀: A17 (드래그 중 ESC 키 또는 dnd-kit onDragCancel)
 * - 룰 ID: UR-17, INV-G1, INV-G2
 * - 이 경로에서 어떠한 state 변경도 발생해서는 안 됨 (D-01/D-02 invariant 보호)
 *
 * NOTE: cancel 은 dragEndReducer 에 cancel 전용 경로가 없으며,
 *       UI 레이어가 onDragCancel 에서 reducer 를 호출하지 않는다.
 *       본 테스트는 "cancel 역할을 하는 거절 경로" 를 검증한다.
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
} from "../test-helpers";

describe("[A17] [UR-17] cancel (S2/S3/S4 -> S1/S5)", () => {
  beforeEach(() => resetGroupSeq());

  describe("[A17.1] [UR-17] server -> rack = cannot-return-server-tile (state 변경 0)", () => {
    it("서버 tile 을 rack 으로 drop -> 거절 = cancel 과 동일 효과", () => {
      // UR-17: cancel 시 어떠한 state 변경도 없어야 함
      // server -> rack 는 cannot-return-server-tile 로 거절되어 state 변경 0
      const sg = serverGroup(["R7a", "B7a", "Y7a"] as TileCode[], "group");
      const pg = pendingGroup(["K5a", "K6a"] as TileCode[], "run");
      const myTiles = ["R1a", "B2a"] as TileCode[];
      const pendingIds = new Set([pg.id]);

      const [state, input] = makeReducerArgs({
        tileCode: "R7a" as TileCode,
        source: { kind: "server", groupId: sg.id, index: 0 },
        dest: { kind: "rack" },
        hasInitialMeld: true,
        tableGroups: [sg, pg],
        myTiles,
        pendingGroupIds: pendingIds,
      });
      const output = dragEndReducer(state, input);

      expectRejected(output, "cannot-return-server-tile");
    });
  });

  describe("[A17.2] [UR-17] self-drop = no-op-self-drop (state 변경 0)", () => {
    it("table tile 을 같은 그룹에 drop -> no-op-self-drop 거절", () => {
      const sg = serverGroup(["R7a", "B7a", "Y7a"] as TileCode[], "group");

      const [state, input] = makeReducerArgs({
        tileCode: "R7a" as TileCode,
        source: { kind: "server", groupId: sg.id, index: 0 },
        overId: sg.id, // 같은 그룹에 drop
        hasInitialMeld: true,
        tableGroups: [sg],
        myTiles: [],
      });
      const output = dragEndReducer(state, input);

      expectRejected(output, "no-op-self-drop");
    });
  });

  describe("[A17.3] [INV-G1] [INV-G2] 거절 후 invariant 유지", () => {
    it("거절 경로에서 nextTableGroups 는 입력 state 의 tableGroups 와 동일", () => {
      const sg = serverGroup(["R7a", "B7a", "Y7a"] as TileCode[], "group");
      const pg = pendingGroup(["K1a"] as TileCode[], "group");
      const pendingIds = new Set([pg.id]);

      const [state, input] = makeReducerArgs({
        tileCode: "R7a" as TileCode,
        source: { kind: "server", groupId: sg.id, index: 0 },
        dest: { kind: "rack" },
        hasInitialMeld: true,
        tableGroups: [sg, pg],
        myTiles: [],
        pendingGroupIds: pendingIds,
      });
      const output = dragEndReducer(state, input);

      // 거절이므로 state 변경 없음 -- nextTableGroups 는 입력 tableGroups 참조
      expectRejected(output);
      expect(output.nextTableGroups).toEqual(state.tableGroups);
    });
  });
});
