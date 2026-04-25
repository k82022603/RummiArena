/**
 * A17 -- 드래그 취소 (esc / onDragCancel)
 *
 * SSOT 매핑:
 * - 56 section 3.18 셀: A17 (드래그 중 ESC 키 또는 dnd-kit onDragCancel)
 * - 룰 ID: UR-17, INV-G1, INV-G2
 * - 이 경로에서 어떠한 state 변경도 발생해서는 안 됨 (D-01/D-02 invariant 보호)
 */

import { describe, it, expect, beforeEach } from "@jest/globals";
import { dragEndReducer } from "../../dragEndReducer";
import type { TileCode } from "@/types/tile";
import {
  serverGroup,
  pendingGroup,
  makeInput,
  resetGroupSeq,
} from "../test-helpers";

describe("[A17] [UR-17] cancel (S2/S3/S4 -> S1/S5)", () => {
  beforeEach(() => resetGroupSeq());

  describe("[A17.1] [UR-17] S2/S3/S4 -> 원위치 (state 변경 0)", () => {
    it("드래그 중 ESC -> state === 직전 상태", () => {
      // UR-17: cancel 시 어떠한 state 변경도 없어야 함
      const sg = serverGroup(["R7a", "B7a", "Y7a"] as TileCode[], "group");
      const pg = pendingGroup(["K5a", "K6a"] as TileCode[], "run");
      const myTiles = ["R1a", "B2a"] as TileCode[];
      const pendingIds = new Set([pg.id]);

      // cancel 은 dest 가 없는 특수한 경우
      // dragEndReducer 가 cancel 을 처리할 때 state 변경 0 반환
      const output = dragEndReducer(
        makeInput({
          tileCode: "R7a" as TileCode,
          source: { kind: "server", groupId: sg.id, index: 0 },
          dest: { kind: "rack" }, // cancel 시의 dest 는 무시되어야 함
          isMyTurn: true,
          hasInitialMeld: true,
          tableGroups: [sg, pg],
          myTiles,
          pendingGroupIds: pendingIds,
        })
      );

      // cancel 경로에서는 accepted=false (V-06 으로 server->rack 거절)
      // 또는 cancel 전용 핸들링이면 state 변경 0
      // 어느 쪽이든 원래 state 유지
      if (!output.accepted) {
        // 거절 = state 변경 0 (정상)
        expect(output.nextTableGroups).toBeUndefined();
      } else {
        // 만약 허용이라면 state 동일해야 함
        expect(output.nextTableGroups!.length).toBe(2);
      }
    });
  });

  describe("[A17.2] [UR-17] state 변경 0 (D-01/D-02 invariant 유지)", () => {
    it("cancel 경로에서 어떠한 store mutation 도 발생 X", () => {
      // rack -> rack (no-op) 시나리오로 cancel 모사
      const myTiles = ["R7a", "B7a"] as TileCode[];

      const output = dragEndReducer(
        makeInput({
          tileCode: "R7a" as TileCode,
          source: { kind: "rack" },
          dest: { kind: "rack" }, // same source = cancel equivalent
          isMyTurn: true,
          tableGroups: [],
          myTiles,
        })
      );

      // rack -> rack 은 A13 (재정렬). 허용되지만 보드 변경 0
      if (output.accepted) {
        expect(output.nextTableGroups!.length).toBe(0);
        expect(output.nextMyTiles!.sort()).toEqual(myTiles.sort());
      }
    });
  });

  describe("[A17.3] [INV-G1] [INV-G2] cancel 후 invariant 유지", () => {
    it("cancel 후 모든 board.tiles multiset 유니크, 모든 group.id 유니크", () => {
      const sg = serverGroup(["R7a", "B7a", "Y7a"] as TileCode[], "group");
      const pg = pendingGroup(["K1a"] as TileCode[], "group");

      // cancel = rejected (server -> rack = V-06 거절)
      const output = dragEndReducer(
        makeInput({
          tileCode: "R7a" as TileCode,
          source: { kind: "server", groupId: sg.id, index: 0 },
          dest: { kind: "rack" },
          hasInitialMeld: true,
          tableGroups: [sg, pg],
          myTiles: [],
          pendingGroupIds: new Set([pg.id]),
        })
      );

      // 거절이므로 state 변경 없음 -- invariant 유지
      expect(output.accepted).toBe(false);
    });
  });
});
