/**
 * PlayerCard 단위 테스트
 *
 * P0-3 회귀 방지: difficulty undefined → "고수"로 잘못 렌더되던 버그.
 * P0-4 회귀 방지: persona 없을 때 "GPT ()" 빈 괄호 렌더되던 버그.
 */

import "@testing-library/jest-dom";
import React from "react";
import { render, screen } from "@testing-library/react";
import PlayerCard from "@/components/game/PlayerCard";
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const anyPlayer = (obj: Record<string, any>) => obj as any;

describe("PlayerCard — 인간 플레이어 (HUMAN)", () => {
  it("displayName 이 아이콘 행에 렌더된다", () => {
    render(
      <PlayerCard
        player={anyPlayer({
          seat: 0,
          type: "HUMAN",
          displayName: "애벌레",
          tileCount: 14,
          status: "CONNECTED",
        })}
        isCurrentTurn={false}
        isAIThinking={false}
      />
    );
    expect(screen.getByTitle("애벌레")).toBeInTheDocument();
  });

  it("HUMAN 플레이어는 AI persona/difficulty 배지 미출력", () => {
    render(
      <PlayerCard
        player={anyPlayer({
          seat: 0,
          type: "HUMAN",
          displayName: "애벌레",
          tileCount: 14,
          status: "CONNECTED",
        })}
        isCurrentTurn={false}
        isAIThinking={false}
      />
    );
    // AI 전용 배지(하수/중수/고수/—) 없음
    expect(screen.queryByText(/^하수$|^중수$|^고수$/)).toBeNull();
  });
});

describe("PlayerCard — AI persona 표시 (P0-4 회귀 방지)", () => {
  it("persona 있으면 'GPT (루키)' 형식", () => {
    render(
      <PlayerCard
        player={anyPlayer({
          seat: 1,
          type: "AI_OPENAI",
          persona: "rookie",
          difficulty: "beginner",
          tileCount: 14,
        })}
        isCurrentTurn={false}
        isAIThinking={false}
      />
    );
    expect(screen.getByTitle("GPT (루키)")).toBeInTheDocument();
  });

  it("persona 없으면 'GPT' (괄호 자체 없음)", () => {
    render(
      <PlayerCard
        player={anyPlayer({
          seat: 1,
          type: "AI_OPENAI",
          difficulty: "beginner",
          tileCount: 14,
        })}
        isCurrentTurn={false}
        isAIThinking={false}
      />
    );
    const name = screen.getByTitle("GPT");
    expect(name.textContent).toBe("GPT");
    // 빈 괄호 "GPT ()" 출력 금지
    expect(name.textContent).not.toContain("(");
    expect(name.textContent).not.toContain(")");
  });

  it("alien persona key (매핑 누락) 여도 괄호 없는 'GPT'", () => {
    render(
      <PlayerCard
        player={anyPlayer({
          seat: 1,
          type: "AI_OPENAI",
          persona: "brand_new_persona",
          difficulty: "expert",
          tileCount: 14,
        })}
        isCurrentTurn={false}
        isAIThinking={false}
      />
    );
    expect(screen.getByTitle("GPT")).toBeInTheDocument();
  });
});

describe("PlayerCard — difficulty fallback (P0-3 회귀 방지)", () => {
  it("beginner → '하수'", () => {
    render(
      <PlayerCard
        player={anyPlayer({
          seat: 1,
          type: "AI_OPENAI",
          persona: "calculator",
          difficulty: "beginner",
          tileCount: 14,
        })}
        isCurrentTurn={false}
        isAIThinking={false}
      />
    );
    expect(screen.getByText("하수")).toBeInTheDocument();
  });

  it("intermediate → '중수'", () => {
    render(
      <PlayerCard
        player={anyPlayer({
          seat: 1,
          type: "AI_OPENAI",
          persona: "shark",
          difficulty: "intermediate",
          tileCount: 14,
        })}
        isCurrentTurn={false}
        isAIThinking={false}
      />
    );
    expect(screen.getByText("중수")).toBeInTheDocument();
  });

  it("expert → '고수' (정상 케이스)", () => {
    render(
      <PlayerCard
        player={anyPlayer({
          seat: 1,
          type: "AI_OPENAI",
          persona: "wall",
          difficulty: "expert",
          tileCount: 14,
        })}
        isCurrentTurn={false}
        isAIThinking={false}
      />
    );
    expect(screen.getByText("고수")).toBeInTheDocument();
  });

  it("undefined difficulty → '—' ('고수' 로 잘못 렌더되지 않음)", () => {
    render(
      <PlayerCard
        player={anyPlayer({
          seat: 1,
          type: "AI_OPENAI",
          persona: "fox",
          // difficulty 누락 (서버 브로드캐스트 누락 시나리오)
          tileCount: 14,
        })}
        isCurrentTurn={false}
        isAIThinking={false}
      />
    );
    expect(screen.getByText("—")).toBeInTheDocument();
    // 오늘 버그: undefined 이 "고수" 로 렌더되던 케이스 확정 차단
    expect(screen.queryByText("고수")).toBeNull();
  });

  it("알 수 없는 difficulty 문자열 → '—'", () => {
    render(
      <PlayerCard
        player={anyPlayer({
          seat: 1,
          type: "AI_OPENAI",
          persona: "rookie",
          difficulty: "EXPERT", // 대소문자 오타 케이스
          tileCount: 14,
        })}
        isCurrentTurn={false}
        isAIThinking={false}
      />
    );
    expect(screen.getByText("—")).toBeInTheDocument();
    expect(screen.queryByText("고수")).toBeNull();
  });
});
