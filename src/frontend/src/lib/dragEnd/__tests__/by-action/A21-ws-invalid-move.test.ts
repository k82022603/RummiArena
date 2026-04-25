/**
 * A21 -- WS INVALID_MOVE -- INC-T11-FP-B10 사고 회귀 핵심
 *
 * SSOT 매핑:
 * - 56 section 3.19 셀: A21 (WS 수신)
 * - 룰 ID: UR-21, UR-34
 * - 상태 전이: S7 -> S8
 *
 * 사고 매핑:
 * - INC-T11-FP-B10: band-aid 토스트 (UR-34 위반) 가 사용자 incident 직전 노출
 */

import { describe, it, expect, beforeEach } from "@jest/globals";
import type { TileCode, TableGroup } from "@/types/tile";
import { serverGroup, pendingGroup, resetGroupSeq } from "../test-helpers";

interface InvalidMoveInput {
  ruleId: string;       // 서버가 반환한 위반 룰 ID (예: "V-04")
  message: string;      // 서버 메시지
  serverSnapshot: {
    tableGroups: TableGroup[];
    myTiles: TileCode[];
  };
}

interface InvalidMoveOutput {
  nextTableGroups: TableGroup[];
  nextMyTiles: TileCode[];
  nextPendingTableGroups: TableGroup[];
  nextPendingGroupIds: Set<string>;
  toastMessage: string;
}

// TODO: frontend-dev PR-D05 에서 구현
function applyInvalidMove(input: InvalidMoveInput): InvalidMoveOutput {
  return {
    nextTableGroups: input.serverSnapshot.tableGroups,
    nextMyTiles: input.serverSnapshot.myTiles,
    nextPendingTableGroups: [],
    nextPendingGroupIds: new Set(),
    toastMessage: `[${input.ruleId}] ${input.message}`,
  };
}

// UR-34 위반 패턴 (band-aid 토스트 금지)
const BANNED_TOAST_PATTERNS = [
  "BUG-UI-T11-INVARIANT",
  "BUG-UI-T11-SOURCE-GUARD",
  "상태 이상",
  "invariant 오류",
  "소스 불일치",
];

describe("[A21] [UR-21] [UR-34] WS INVALID_MOVE (S7 -> S8)", () => {
  beforeEach(() => resetGroupSeq());

  describe("[A21.1] [UR-21] S7 -> S8 전이", () => {
    it("S7 (COMMITTING) 중 INVALID_MOVE 수신 -> 롤백", () => {
      const sg = serverGroup(["R7a", "B7a", "Y7a"] as TileCode[], "group");
      const myTiles = ["K1a", "K2a", "K3a"] as TileCode[];

      const result = applyInvalidMove({
        ruleId: "V-04",
        message: "최초 등록은 30점 이상이어야 합니다",
        serverSnapshot: {
          tableGroups: [sg],
          myTiles,
        },
      });

      // 롤백 확인
      expect(result.nextTableGroups).toEqual([sg]);
      expect(result.nextMyTiles).toEqual(myTiles);
      expect(result.nextPendingTableGroups.length).toBe(0);
      expect(result.nextPendingGroupIds.size).toBe(0);
    });
  });

  describe("[A21.2] [UR-21] 토스트 표시 (룰 ID prefix 강제)", () => {
    it("토스트 카피 = [V-04] ... (룰 ID prefix 의무)", () => {
      const result = applyInvalidMove({
        ruleId: "V-04",
        message: "최초 등록은 30점 이상이어야 합니다",
        serverSnapshot: {
          tableGroups: [],
          myTiles: [],
        },
      });

      // UR-21: 토스트에 룰 ID prefix 포함
      expect(result.toastMessage).toMatch(/^\[V-04\]/);
    });
  });

  describe("[A21.3] [UR-21] 스냅샷 롤백 (서버 마지막 healthy state 복원)", () => {
    it("INVALID_MOVE 수신 -> tableGroups, myTiles 모두 서버 스냅샷으로 롤백", () => {
      const sg1 = serverGroup(["R1a", "B1a", "Y1a"] as TileCode[], "group");
      const sg2 = serverGroup(["R5a", "R6a", "R7a"] as TileCode[], "run");
      const myTiles = ["K10a", "K11a", "K12a", "K13a"] as TileCode[];

      const result = applyInvalidMove({
        ruleId: "V-02",
        message: "그룹은 최소 3장이어야 합니다",
        serverSnapshot: {
          tableGroups: [sg1, sg2],
          myTiles,
        },
      });

      // 서버 스냅샷으로 완전 복원
      expect(result.nextTableGroups).toEqual([sg1, sg2]);
      expect(result.nextMyTiles).toEqual(myTiles);
      // pending 전수 정리
      expect(result.nextPendingTableGroups.length).toBe(0);
      expect(result.nextPendingGroupIds.size).toBe(0);
    });
  });

  describe("[A21.4] [UR-34] **INC-T11-FP-B10 직접 회귀** -- band-aid 토스트 금지 검증", () => {
    it("INVALID_MOVE 수신 -> 토스트에 UR-34 위반 패턴 0건", () => {
      // INC-T11-FP-B10 회귀 방지: band-aid 토스트 금지
      const result = applyInvalidMove({
        ruleId: "V-04",
        message: "최초 등록은 30점 이상이어야 합니다",
        serverSnapshot: {
          tableGroups: [],
          myTiles: [],
        },
      });

      // UR-34: 금지 패턴 0건 (negative assertion)
      // G2-EXEMPT: A21.4 negative assertion -- band-aid 이름을 검증 대상으로 참조하는 것은 허용
      for (const pattern of BANNED_TOAST_PATTERNS) {
        expect(result.toastMessage).not.toContain(pattern);
      }

      // 토스트에는 V-* 룰 ID 만 포함
      expect(result.toastMessage).toMatch(/\[V-\d+\]/);
    });
  });
});
