/**
 * A16 -- DRAW (드로우 / 자동 패스)
 *
 * SSOT 매핑:
 * - 56 section 3.17 셀: A16 (DRAW 클릭)
 * - 룰 ID: V-10, UR-22, UR-23
 * - 상태 전이: S1 -> S9 -> End
 *
 * NOTE: canDraw / executeDraw 는 store 레벨 동작.
 *       순수 함수 canDraw 를 정의하여 테스트한다.
 */

import { describe, it, expect, beforeEach } from "@jest/globals";
import type { TileCode, TableGroup } from "@/types/tile";
import { pendingGroup, resetGroupSeq } from "../test-helpers";

/**
 * canDraw 순수 함수 시그니처 (RED spec)
 */
interface DrawInput {
  pendingGroupCount: number;
  drawPileCount: number;
}

interface DrawOutput {
  enabled: boolean;
  label: "draw" | "pass";
  reason?: string;
}

// TODO: frontend-dev PR-D04 에서 구현
function canDraw(input: DrawInput): DrawOutput {
  if (input.pendingGroupCount > 0) {
    return { enabled: false, label: "draw", reason: "UR-15" };
  }
  if (input.drawPileCount === 0) {
    return { enabled: true, label: "pass" };
  }
  return { enabled: true, label: "draw" };
}

describe("[A16] [V-10] DRAW (S1 -> S9)", () => {
  beforeEach(() => resetGroupSeq());

  describe("[A16.1] [UR-15] pending>=1 -> reject", () => {
    it("pending 그룹 1개 이상 -> DRAW 비활성", () => {
      const result = canDraw({
        pendingGroupCount: 1,
        drawPileCount: 10,
      });

      expect(result.enabled).toBe(false);
    });
  });

  describe("[A16.2] [V-10] pending=0 + drawpile>0 -> 1장 추가", () => {
    it("pending=0 + drawpile > 0 -> DRAW 활성, label=draw", () => {
      const result = canDraw({
        pendingGroupCount: 0,
        drawPileCount: 10,
      });

      expect(result.enabled).toBe(true);
      expect(result.label).toBe("draw");
    });
  });

  describe('[A16.3] [V-10] [UR-22] pending=0 + drawpile=0 -> 패스', () => {
    it("pending=0 + drawpile=0 -> 패스 라벨 (UR-22)", () => {
      // UR-22: 드로우 파일 비었으면 패스 라벨
      const result = canDraw({
        pendingGroupCount: 0,
        drawPileCount: 0,
      });

      expect(result.enabled).toBe(true);
      expect(result.label).toBe("pass");
    });
  });

  describe("[A16.4] DRAW 후 turn end (S9 -> End)", () => {
    it("DRAW 응답 수신 -> 턴 종료 (상태 전이 검증은 store 레벨)", () => {
      // 본 테스트는 canDraw 범위. 실제 턴 종료는 WS 핸들러에서 처리.
      // canDraw 가 enabled=true 반환하면 WS DRAW 메시지 송신
      const result = canDraw({
        pendingGroupCount: 0,
        drawPileCount: 5,
      });

      expect(result.enabled).toBe(true);
    });
  });
});
