"use client";

/**
 * RoundProgressBlock — 라운드 진행 도트 표시
 * 스펙 §4.3:
 *   - 도트: 14x14, border-radius 3, gap 4
 *   - 상태: done=#34d39955, current=#f59e0b+glow, pending=#1e2532
 *   - 2인: 최근 2라운드 묶음 표시 (R6·R7 = 4도트), 라운드 사이 세로 구분선
 *   - 3인+: 현재 라운드만
 */

type TurnStatus = "done" | "current" | "pending";

interface RoundData {
  roundIndex: number;
  turns: TurnStatus[];
}

interface RoundProgressBlockProps {
  playerCount: number;
  roundIndex: number;
  rounds: RoundData[];
  turnsCompleted: number;
  turnsTotal: number;
}

const DOT_COLORS: Record<TurnStatus, string> = {
  done: "#34d39955",
  current: "#f59e0b",
  pending: "#1e2532",
};

const DOT_GLOW = "0 0 6px #f59e0b, 0 0 12px rgba(245,158,11,0.4)";

function TurnDot({ status }: { status: TurnStatus }) {
  return (
    <div
      aria-hidden="true"
      style={{
        width: 14,
        height: 14,
        borderRadius: 3,
        backgroundColor: DOT_COLORS[status],
        boxShadow: status === "current" ? DOT_GLOW : "none",
        flexShrink: 0,
      }}
    />
  );
}

/** 2인 전용: 최근 2라운드 그룹 선택 */
function selectTwoPlayerRounds(rounds: RoundData[], roundIndex: number): RoundData[] {
  const currentIdx = rounds.findIndex((r) => r.roundIndex === roundIndex);
  if (currentIdx < 0) return rounds.slice(-1); // fallback

  // 현재 라운드 + 이전 1개
  const start = Math.max(0, currentIdx - 1);
  return rounds.slice(start, currentIdx + 1);
}

/** 라운드 번호 범위 라벨 계산 */
function buildRangeLabel(selectedRounds: RoundData[]): string {
  if (selectedRounds.length === 1) {
    return `ROUND ${selectedRounds[0].roundIndex}`;
  }
  const first = selectedRounds[0].roundIndex;
  const last = selectedRounds[selectedRounds.length - 1].roundIndex;
  return `ROUND ${first}–${last}`;
}

export default function RoundProgressBlock({
  playerCount,
  roundIndex,
  rounds,
  turnsCompleted,
  turnsTotal,
}: RoundProgressBlockProps) {
  const isTwoPlayer = playerCount === 2;

  // 표시할 라운드 결정
  const displayRounds = isTwoPlayer
    ? selectTwoPlayerRounds(rounds, roundIndex)
    : rounds.filter((r) => r.roundIndex === roundIndex);

  const label = buildRangeLabel(displayRounds);

  return (
    <div className="flex flex-col justify-center gap-1" aria-label={label}>
      {/* 라벨 */}
      <span
        className="leading-none tracking-widest font-bold uppercase"
        style={{
          fontSize: 9,
          color: "#6b7280",
          letterSpacing: "1.2px",
          fontWeight: 700,
        }}
      >
        {label}
      </span>

      {/* 도트 행 — 2인이면 라운드 사이 구분선 포함 */}
      <div className="flex items-center" style={{ gap: 4 }}>
        {displayRounds.map((round, rIdx) => (
          <div key={round.roundIndex} className="flex items-center" style={{ gap: 4 }}>
            {/* 라운드 사이 세로 구분선 (2인, rIdx > 0) */}
            {isTwoPlayer && rIdx > 0 && (
              <div
                aria-hidden="true"
                style={{
                  width: 1,
                  height: 14,
                  background: "#1e2532",
                  flexShrink: 0,
                  marginLeft: 2,
                  marginRight: 2,
                }}
              />
            )}
            {round.turns.map((status, tIdx) => (
              <TurnDot key={`${round.roundIndex}-${tIdx}`} status={status} />
            ))}
          </div>
        ))}
      </div>

      {/* 턴 진행 메타 */}
      <span
        className="leading-none"
        style={{ fontSize: 11, color: "#94a3b8" }}
      >
        {turnsCompleted} / {turnsTotal} 턴
      </span>
    </div>
  );
}
