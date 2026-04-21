import { getTurnActionLabel } from "@/lib/turn-action-label";

describe("getTurnActionLabel — 서버 enum → 한국어 변환", () => {
  // 핵심 enum 매핑
  it("DRAW_TILE → 드로우", () => {
    expect(getTurnActionLabel("DRAW_TILE")).toBe("드로우");
  });

  it("DRAW → 드로우 (소문자 fallback)", () => {
    expect(getTurnActionLabel("DRAW")).toBe("드로우");
  });

  it("TIMEOUT → 시간 초과 → 자동 드로우", () => {
    expect(getTurnActionLabel("TIMEOUT")).toBe("시간 초과 → 자동 드로우");
  });

  it("PENALTY_DRAW → 강제 드로우 레이블", () => {
    expect(getTurnActionLabel("PENALTY_DRAW")).toBe(
      "강제 드로우 (유효하지 않은 조합 반복)"
    );
  });

  it("FORFEIT → 기권", () => {
    expect(getTurnActionLabel("FORFEIT")).toBe("기권");
  });

  it("PLACE → 배치", () => {
    expect(getTurnActionLabel("PLACE")).toBe("배치");
  });

  // 대소문자 정규화 (toUpperCase) 검증
  it("소문자 draw → 드로우 (대소문자 무관)", () => {
    expect(getTurnActionLabel("draw")).toBe("드로우");
  });

  it("소문자 timeout → 시간 초과 레이블", () => {
    expect(getTurnActionLabel("timeout")).toBe("시간 초과 → 자동 드로우");
  });

  it("소문자 penalty_draw → 강제 드로우 레이블", () => {
    expect(getTurnActionLabel("penalty_draw")).toBe(
      "강제 드로우 (유효하지 않은 조합 반복)"
    );
  });

  it("소문자 forfeit → 기권", () => {
    expect(getTurnActionLabel("forfeit")).toBe("기권");
  });

  // 알 수 없는 값: 언더스코어 → 공백, 소문자 변환
  it("알 수 없는 UNKNOWN_ACTION → 언더스코어 공백·소문자 치환", () => {
    expect(getTurnActionLabel("UNKNOWN_ACTION")).toBe("unknown action");
  });

  it("알 수 없는 빈 문자열 → 빈 문자열 반환", () => {
    expect(getTurnActionLabel("")).toBe("");
  });

  it("알 수 없는 단일 단어 → 소문자 반환", () => {
    expect(getTurnActionLabel("SKIP")).toBe("skip");
  });
});
