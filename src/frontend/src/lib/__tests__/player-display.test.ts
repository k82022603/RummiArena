import {
  AI_DIFFICULTY_LABEL,
  AI_PERSONA_LABEL,
  AI_TYPE_LABEL,
  getPlayerDisplayName,
} from "@/lib/player-display";

describe("player-display constants", () => {
  it("AI_TYPE_LABEL 4모델 매핑 존재", () => {
    expect(AI_TYPE_LABEL.AI_OPENAI).toBe("GPT");
    expect(AI_TYPE_LABEL.AI_CLAUDE).toBe("Claude");
    expect(AI_TYPE_LABEL.AI_DEEPSEEK).toBe("DeepSeek");
    expect(AI_TYPE_LABEL.AI_LLAMA).toBe("LLaMA");
  });

  it("AI_PERSONA_LABEL 6 페르소나 매핑 존재", () => {
    expect(AI_PERSONA_LABEL.rookie).toBe("루키");
    expect(AI_PERSONA_LABEL.calculator).toBe("계산기");
    expect(AI_PERSONA_LABEL.shark).toBe("샤크");
    expect(AI_PERSONA_LABEL.fox).toBe("폭스");
    expect(AI_PERSONA_LABEL.wall).toBe("벽");
    expect(AI_PERSONA_LABEL.wildcard).toBe("와일드카드");
  });

  it("AI_DIFFICULTY_LABEL 3단계 매핑 존재 (P0-3 근거)", () => {
    expect(AI_DIFFICULTY_LABEL.beginner).toBe("하수");
    expect(AI_DIFFICULTY_LABEL.intermediate).toBe("중수");
    expect(AI_DIFFICULTY_LABEL.expert).toBe("고수");
    // 오늘 버그 원인이 된 key: "고수"가 expert 만의 라벨임을 단언
    expect(AI_DIFFICULTY_LABEL).not.toHaveProperty("unknown");
  });
});

describe("getPlayerDisplayName - null/undefined safety", () => {
  it("player가 null이면 fallback 반환", () => {
    expect(getPlayerDisplayName(null)).toBe("—");
    expect(getPlayerDisplayName(null, "Anonymous")).toBe("Anonymous");
  });

  it("player가 undefined이면 fallback 반환", () => {
    expect(getPlayerDisplayName(undefined)).toBe("—");
    expect(getPlayerDisplayName(undefined, "Seat 3")).toBe("Seat 3");
  });
});

describe("getPlayerDisplayName - HUMAN 분기", () => {
  it("HUMAN + displayName 있으면 displayName 반환", () => {
    expect(
      getPlayerDisplayName({ type: "HUMAN", displayName: "애벌레" })
    ).toBe("애벌레");
  });

  it("HUMAN + displayName 없으면 fallback 반환", () => {
    expect(getPlayerDisplayName({ type: "HUMAN" })).toBe("—");
    expect(getPlayerDisplayName({ type: "HUMAN" }, "Seat 0")).toBe("Seat 0");
  });

  it("HUMAN + 빈 문자열 displayName은 fallback 반환", () => {
    // 서버가 빈 문자열을 보낼 경우 안전하게 fallback
    expect(
      getPlayerDisplayName({ type: "HUMAN", displayName: "" }, "Guest")
    ).toBe("Guest");
  });
});

describe("getPlayerDisplayName - AI 분기 (P0-4 회귀 방지)", () => {
  it("AI + persona 있으면 'GPT (루키)' 형식", () => {
    expect(
      getPlayerDisplayName({ type: "AI_OPENAI", persona: "rookie" })
    ).toBe("GPT (루키)");
  });

  it("AI + persona 없으면 괄호 미출력 ('GPT ()' 방지)", () => {
    // 이미지 112030 에서 발견된 P0-4 버그 회귀 방지
    const result = getPlayerDisplayName({ type: "AI_OPENAI" });
    expect(result).toBe("GPT");
    expect(result).not.toContain("(");
    expect(result).not.toContain(")");
  });

  it("AI + persona undefined 인 경우도 괄호 미출력", () => {
    const result = getPlayerDisplayName({
      type: "AI_OPENAI",
      persona: undefined,
    });
    expect(result).toBe("GPT");
  });

  it("AI + 알 수 없는 persona key 는 괄호 미출력 (매핑 누락 대비)", () => {
    // 서버가 새 페르소나를 추가했는데 클라이언트 매핑이 안 된 경우
    const result = getPlayerDisplayName({
      type: "AI_OPENAI",
      persona: "unknown_new_persona",
    });
    expect(result).toBe("GPT");
  });

  it("AI + 서버 제공 displayName 이 있으면 우선 사용", () => {
    expect(
      getPlayerDisplayName({
        type: "AI_OPENAI",
        displayName: "GPT (샤크) - custom",
        persona: "rookie", // displayName이 우선
      })
    ).toBe("GPT (샤크) - custom");
  });

  it("AI 4모델 x persona 조합 정상", () => {
    expect(
      getPlayerDisplayName({ type: "AI_CLAUDE", persona: "shark" })
    ).toBe("Claude (샤크)");
    expect(
      getPlayerDisplayName({ type: "AI_DEEPSEEK", persona: "fox" })
    ).toBe("DeepSeek (폭스)");
    expect(getPlayerDisplayName({ type: "AI_LLAMA", persona: "wall" })).toBe(
      "LLaMA (벽)"
    );
  });

  it("알 수 없는 AI type은 type 문자열 자체 반환", () => {
    expect(
      getPlayerDisplayName({ type: "AI_NEW_MODEL", persona: "rookie" })
    ).toBe("AI_NEW_MODEL (루키)");
  });
});
