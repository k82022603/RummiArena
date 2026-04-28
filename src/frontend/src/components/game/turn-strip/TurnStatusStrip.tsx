"use client";

/**
 * TurnStatusStrip — 게임보드 상단 턴 상태 스트립
 * PR1: 정적 마크업 + 목업 데이터. 실시간 연동은 PR2에서.
 *
 * 스펙 §2 컴포넌트 구조:
 *   OrbitalTimer | NowPlayingBlock | [StripDivider | NextPlayerBlock](*) | StripDivider | RoundProgressBlock
 *   (*) playerCount === 2이면 NextPlayerBlock + 앞 StripDivider 숨김
 *
 * 스펙 §4.1 디자인 토큰:
 *   --strip-h: 88px
 *   --strip-bg: linear-gradient(180deg, #11151e 0%, #0d121b 100%)
 *   --strip-border: 1px solid #1e2532
 *   --strip-radius: 10px
 *   --strip-padding: 14px 18px
 *   --strip-gap: 24px
 */

import OrbitalTimer from "./OrbitalTimer";
import NowPlayingBlock from "./NowPlayingBlock";
import NextPlayerBlock from "./NextPlayerBlock";
import RoundProgressBlock from "./RoundProgressBlock";
import StripDivider from "./StripDivider";

type TurnStatus = "done" | "current" | "pending";

export interface TurnStatusStripProps {
  remainingSec: number;
  totalSec: number;
  current: {
    playerId: string;
    name: string;
    isMe: boolean;
    avatarColor: string;
  };
  contextLine: string;
  next: {
    playerId: string;
    name: string;
    avatarChar: string;
    estimatedWaitSec: number;
  } | null;
  playerCount: number;
  roundIndex: number;
  rounds: Array<{
    roundIndex: number;
    turns: TurnStatus[];
  }>;
  turnsCompleted: number;
  turnsTotal: number;
}

export default function TurnStatusStrip({
  remainingSec,
  totalSec,
  current,
  contextLine,
  next,
  playerCount,
  roundIndex,
  rounds,
  turnsCompleted,
  turnsTotal,
}: TurnStatusStripProps) {
  const showNext = playerCount > 2 && next !== null;

  return (
    <section
      aria-label="턴 상태"
      className="flex-shrink-0 flex items-center"
      style={{
        height: 88,
        background:
          "radial-gradient(circle at 12% 50%, rgba(245,158,11,0.08) 0%, transparent 40%), linear-gradient(180deg, #11151e 0%, #0d121b 100%)",
        border: "1px solid #1e2532",
        borderRadius: 10,
        padding: "14px 18px",
        gap: 24,
        overflow: "hidden",
      }}
    >
      {/* 도넛 타이머 */}
      <OrbitalTimer remainingSec={remainingSec} totalSec={totalSec} />

      {/* 현재 차례 */}
      <NowPlayingBlock player={current} contextLine={contextLine} />

      {/* 다음 차례 — 2인이면 숨김 */}
      {showNext && next && (
        <>
          <StripDivider />
          <NextPlayerBlock player={next} />
        </>
      )}

      {/* 구분선 */}
      <StripDivider />

      {/* 라운드 진행 */}
      <RoundProgressBlock
        playerCount={playerCount}
        roundIndex={roundIndex}
        rounds={rounds}
        turnsCompleted={turnsCompleted}
        turnsTotal={turnsTotal}
      />
    </section>
  );
}
