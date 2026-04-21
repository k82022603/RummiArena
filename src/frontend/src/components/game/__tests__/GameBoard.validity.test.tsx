/**
 * G-1/G-2 pending 블록 유효성 판정 단위 테스트
 *
 * validatePendingBlock()이 올바른 결과를 반환하는지 검증한다.
 */
import { validatePendingBlock } from "@/components/game/GameBoard";
import type { TileCode } from "@/types/tile";

describe("validatePendingBlock", () => {
  // ----------------------------------------------------------------
  // partial: 3개 미만
  // ----------------------------------------------------------------
  it("타일이 2개 이하면 partial을 반환한다", () => {
    expect(validatePendingBlock(["R7a", "R8a"] as TileCode[])).toBe("partial");
  });

  it("빈 배열은 partial을 반환한다", () => {
    expect(validatePendingBlock([] as TileCode[])).toBe("partial");
  });

  it("조커 2개만 있으면 partial을 반환한다", () => {
    expect(validatePendingBlock(["JK1", "JK2"] as TileCode[])).toBe("partial");
  });

  // ----------------------------------------------------------------
  // valid-run: 같은 색, 연속 숫자, 3개 이상
  // ----------------------------------------------------------------
  it("같은 색 연속 3개는 valid-run을 반환한다", () => {
    expect(validatePendingBlock(["R5a", "R6a", "R7a"] as TileCode[])).toBe("valid-run");
  });

  it("같은 색 연속 5개는 valid-run을 반환한다", () => {
    expect(
      validatePendingBlock(["B1a", "B2a", "B3a", "B4a", "B5a"] as TileCode[])
    ).toBe("valid-run");
  });

  it("조커 1개 포함 연속 런은 valid-run을 반환한다", () => {
    // R5, JK1(=R6 역할), R7
    expect(
      validatePendingBlock(["R5a", "JK1", "R7a"] as TileCode[])
    ).toBe("valid-run");
  });

  // ----------------------------------------------------------------
  // valid-group: 같은 숫자, 다른 색, 3~4개
  // ----------------------------------------------------------------
  it("같은 숫자 다른 색 3개는 valid-group을 반환한다", () => {
    expect(
      validatePendingBlock(["R7a", "B7a", "Y7a"] as TileCode[])
    ).toBe("valid-group");
  });

  it("같은 숫자 다른 색 4개는 valid-group을 반환한다", () => {
    expect(
      validatePendingBlock(["R7a", "B7a", "Y7a", "K7a"] as TileCode[])
    ).toBe("valid-group");
  });

  // ----------------------------------------------------------------
  // invalid: 규칙 위반
  // ----------------------------------------------------------------
  it("색 혼합 + 비연속 숫자는 invalid를 반환한다", () => {
    // BUG-UI-002 핵심 케이스: R7, B9, Y3 → 색도 숫자도 일치하지 않음
    expect(
      validatePendingBlock(["R7a", "B9a", "Y3a"] as TileCode[])
    ).toBe("invalid");
  });

  it("같은 색이지만 숫자 비연속이면 invalid를 반환한다", () => {
    // R5, R6, R8 → 6과 8 사이 간격 2
    expect(
      validatePendingBlock(["R5a", "R6a", "R8a"] as TileCode[])
    ).toBe("invalid");
  });

  it("같은 숫자지만 같은 색 중복이면 invalid를 반환한다", () => {
    // R7 두 장 + B7 → 그룹이지만 색상 중복
    expect(
      validatePendingBlock(["R7a", "R7b", "B7a"] as TileCode[])
    ).toBe("invalid");
  });

  it("그룹이 5개 이상이면 invalid를 반환한다", () => {
    // 색이 4가지뿐인데 5개는 불가능하지만 같은 숫자+다른색 5개 테스트
    // 실제로는 5색 없음 → 색상 중복 경로로 invalid
    expect(
      validatePendingBlock(["R7a", "B7a", "Y7a", "K7a", "R7b"] as TileCode[])
    ).toBe("invalid");
  });
});
