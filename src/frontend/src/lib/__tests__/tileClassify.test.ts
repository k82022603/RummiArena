/**
 * tileClassify.ts 단위 테스트
 *
 * SSOT: D-10 (type 힌트는 참고용, 내용 기준 분류)
 */

import { classifySetType } from "@/lib/tileClassify";
import type { TileCode } from "@/types/tile";

describe("[tileClassify] classifySetType", () => {
  // ---- 기본 그룹 분류 ----
  describe("그룹 (같은 숫자, 다른 색)", () => {
    it("3장 그룹 — 숫자가 모두 같으면 'group'", () => {
      const tiles: TileCode[] = ["R7a", "B7a", "Y7a"];
      expect(classifySetType(tiles)).toBe("group");
    });

    it("4장 그룹 — 모든 색상 포함 'group'", () => {
      const tiles: TileCode[] = ["R7a", "B7a", "Y7a", "K7a"];
      expect(classifySetType(tiles)).toBe("group");
    });

    it("1장 그룹 — 숫자 단독 'group'", () => {
      // 1장이지만 숫자가 같으면 group (조커 없음)
      const tiles: TileCode[] = ["R5a"];
      expect(classifySetType(tiles)).toBe("group");
    });
  });

  // ---- 런 분류 ----
  describe("런 (같은 색, 연속 숫자)", () => {
    it("3장 런 — 색상이 모두 같으면 'run'", () => {
      const tiles: TileCode[] = ["B5a", "B6a", "B7a"];
      expect(classifySetType(tiles)).toBe("run");
    });

    it("5장 런 — 연속 숫자, 같은 색 'run'", () => {
      const tiles: TileCode[] = ["R1a", "R2a", "R3a", "R4a", "R5a"];
      expect(classifySetType(tiles)).toBe("run");
    });
  });

  // ---- 조커 처리 ----
  describe("조커 처리", () => {
    it("조커만 있으면 'run' (기본값)", () => {
      const tiles: TileCode[] = ["JK1"];
      expect(classifySetType(tiles)).toBe("run");
    });

    it("빈 배열은 'run' (기본값)", () => {
      expect(classifySetType([])).toBe("run");
    });

    it("조커 + 같은 숫자 → 'group'", () => {
      const tiles: TileCode[] = ["R7a", "B7a", "JK1"];
      expect(classifySetType(tiles)).toBe("group");
    });

    it("조커 + 같은 색상 → 'run'", () => {
      const tiles: TileCode[] = ["B5a", "B6a", "JK2"];
      expect(classifySetType(tiles)).toBe("run");
    });
  });

  // ---- 혼재 타일 ----
  describe("혼재 타일 (그룹도 런도 아님)", () => {
    it("숫자 다르고 색상 다르면 'run' (기본값, 서버에서 V-01 거부)", () => {
      const tiles: TileCode[] = ["R7a", "B5a", "Y8a"];
      expect(classifySetType(tiles)).toBe("run");
    });
  });
});
