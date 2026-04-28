/**
 * TurnStatusStrip 단위 테스트 (PR1 — 정적 마크업)
 *
 * 검증 대상:
 *   - 타이머 렌더링 (role=timer, 초 표시)
 *   - 내 차례 / 상대 차례 라벨 분기
 *   - playerCount === 2이면 NEXT 블록 숨김
 *   - playerCount === 4이면 NEXT 블록 표시
 *   - 2인: 라운드 범위 라벨 (ROUND N–M 형식)
 *   - 3인+: 현재 라운드 라벨 (ROUND N 형식)
 */

import "@testing-library/jest-dom";
import React from "react";
import { render, screen } from "@testing-library/react";
import TurnStatusStrip, {
  TurnStatusStripProps,
} from "@/components/game/turn-strip/TurnStatusStrip";

const BASE_PROPS: TurnStatusStripProps = {
  remainingSec: 42,
  totalSec: 60,
  current: {
    playerId: "p1",
    name: "네선용",
    isMe: true,
    avatarColor: "#f59e0b",
  },
  contextLine: "최초 등록 필요 · 30점 이상의 세트를 보드에 올리세요",
  next: {
    playerId: "p2",
    name: "shark",
    avatarChar: "S",
    estimatedWaitSec: 45,
  },
  playerCount: 4,
  roundIndex: 7,
  rounds: [
    {
      roundIndex: 6,
      turns: ["done", "done"],
    },
    {
      roundIndex: 7,
      turns: ["done", "done", "done", "current", "pending", "pending"],
    },
  ],
  turnsCompleted: 3,
  turnsTotal: 6,
};

describe("OrbitalTimer", () => {
  it("role=timer와 남은 시간 aria-label이 렌더된다", () => {
    render(<TurnStatusStrip {...BASE_PROPS} />);
    const timer = screen.getByRole("timer");
    expect(timer).toBeInTheDocument();
    expect(timer).toHaveAttribute("aria-label", "남은 시간 42초");
  });

  it("남은 초(42)를 화면에 표시한다", () => {
    render(<TurnStatusStrip {...BASE_PROPS} />);
    // role=timer 요소 내부에서 숫자 찾기
    expect(screen.getByText("42")).toBeInTheDocument();
  });
});

describe("NowPlayingBlock — 내 차례", () => {
  it("isMe=true이면 YOUR TURN 라벨이 표시된다", () => {
    render(<TurnStatusStrip {...BASE_PROPS} />);
    expect(screen.getByText("YOUR TURN")).toBeInTheDocument();
  });

  it("플레이어 이름이 표시된다", () => {
    render(<TurnStatusStrip {...BASE_PROPS} />);
    expect(screen.getByText("네선용")).toBeInTheDocument();
  });

  it("컨텍스트 라인이 표시된다", () => {
    render(<TurnStatusStrip {...BASE_PROPS} />);
    expect(
      screen.getByText("최초 등록 필요 · 30점 이상의 세트를 보드에 올리세요")
    ).toBeInTheDocument();
  });
});

describe("NowPlayingBlock — 상대 차례", () => {
  it("isMe=false이면 PLAYING 라벨이 표시된다", () => {
    const props: TurnStatusStripProps = {
      ...BASE_PROPS,
      current: { ...BASE_PROPS.current, isMe: false, name: "opponent" },
    };
    render(<TurnStatusStrip {...props} />);
    expect(screen.getByText("PLAYING")).toBeInTheDocument();
  });
});

describe("NextPlayerBlock — playerCount 분기", () => {
  it("playerCount === 2이면 NEXT 블록이 렌더되지 않는다", () => {
    const props: TurnStatusStripProps = { ...BASE_PROPS, playerCount: 2 };
    render(<TurnStatusStrip {...props} />);
    expect(screen.queryByText("NEXT")).not.toBeInTheDocument();
    expect(screen.queryByText("shark")).not.toBeInTheDocument();
  });

  it("playerCount === 4이면 NEXT 블록이 렌더된다", () => {
    render(<TurnStatusStrip {...BASE_PROPS} />);
    expect(screen.getByText("NEXT")).toBeInTheDocument();
    expect(screen.getByText("shark")).toBeInTheDocument();
  });

  it("playerCount === 4이고 next=null이면 NEXT 블록이 렌더되지 않는다", () => {
    const props: TurnStatusStripProps = { ...BASE_PROPS, next: null };
    render(<TurnStatusStrip {...props} />);
    expect(screen.queryByText("NEXT")).not.toBeInTheDocument();
  });

  it("아바타 이니셜 'S'가 표시된다", () => {
    render(<TurnStatusStrip {...BASE_PROPS} />);
    expect(screen.getByText("S")).toBeInTheDocument();
  });

  it("대기 시간 메타가 표시된다", () => {
    render(<TurnStatusStrip {...BASE_PROPS} />);
    expect(screen.getByText("~45s 대기")).toBeInTheDocument();
  });
});

describe("RoundProgressBlock — 라벨 형식", () => {
  it("2인 대전에서 현재 라운드와 이전 라운드가 있으면 ROUND N–M 형식으로 표시한다", () => {
    const props: TurnStatusStripProps = { ...BASE_PROPS, playerCount: 2 };
    render(<TurnStatusStrip {...props} />);
    expect(screen.getByText("ROUND 6–7")).toBeInTheDocument();
  });

  it("2인 대전에서 이전 라운드 없으면(R1) ROUND 1 형식으로 표시한다", () => {
    const props: TurnStatusStripProps = {
      ...BASE_PROPS,
      playerCount: 2,
      roundIndex: 1,
      rounds: [{ roundIndex: 1, turns: ["current", "pending"] }],
    };
    render(<TurnStatusStrip {...props} />);
    expect(screen.getByText("ROUND 1")).toBeInTheDocument();
  });

  it("3인+ 대전에서 현재 라운드 ROUND N 형식으로 표시한다", () => {
    render(<TurnStatusStrip {...BASE_PROPS} />);
    expect(screen.getByText("ROUND 7")).toBeInTheDocument();
  });

  it("턴 진행 메타(N / M 턴)가 표시된다", () => {
    render(<TurnStatusStrip {...BASE_PROPS} />);
    expect(screen.getByText("3 / 6 턴")).toBeInTheDocument();
  });
});

describe("접근성", () => {
  it("section에 aria-label='턴 상태'가 있다", () => {
    render(<TurnStatusStrip {...BASE_PROPS} />);
    expect(screen.getByRole("region", { name: "턴 상태" })).toBeInTheDocument();
  });

  it("NEXT 블록에 aria-label='다음 플레이어'가 있다", () => {
    render(<TurnStatusStrip {...BASE_PROPS} />);
    expect(screen.getByLabelText("다음 플레이어")).toBeInTheDocument();
  });
});
