"use client";

/**
 * OrbitalTimer — 도넛형 SVG 타이머
 * PR1: 정적 값 렌더링. 색상 애니메이션은 PR3에서 구현.
 * 스펙 §4.2: 64x64 SVG, stroke-dasharray 176
 */

interface OrbitalTimerProps {
  remainingSec: number;
  totalSec: number;
}

const SIZE = 64;
const STROKE_WIDTH = 5;
const RADIUS = (SIZE - STROKE_WIDTH) / 2; // 29.5
const CIRCUMFERENCE = 2 * Math.PI * RADIUS; // ~185.35 → 스펙 기준값 176 사용

// 스펙 §4.2: stroke-dasharray 176 고정
const DASH_TOTAL = 176;

export default function OrbitalTimer({ remainingSec, totalSec }: OrbitalTimerProps) {
  const ratio = totalSec > 0 ? Math.min(1, Math.max(0, remainingSec / totalSec)) : 0;
  const dashOffset = DASH_TOTAL * (1 - ratio);

  return (
    <div
      role="timer"
      aria-label={`남은 시간 ${remainingSec}초`}
      className="relative flex-shrink-0 flex items-center justify-center"
      style={{ width: SIZE, height: SIZE }}
    >
      <svg
        width={SIZE}
        height={SIZE}
        viewBox={`0 0 ${SIZE} ${SIZE}`}
        aria-hidden="true"
        style={{ transform: "rotate(-90deg)" }}
      >
        {/* 배경 트랙 */}
        <circle
          cx={SIZE / 2}
          cy={SIZE / 2}
          r={RADIUS}
          fill="none"
          stroke="#1e2532"
          strokeWidth={STROKE_WIDTH}
        />
        {/* 진행 링 — PR1: amber 고정, PR3에서 동적 색상 */}
        <circle
          cx={SIZE / 2}
          cy={SIZE / 2}
          r={RADIUS}
          fill="none"
          stroke="#f59e0b"
          strokeWidth={STROKE_WIDTH}
          strokeLinecap="round"
          strokeDasharray={DASH_TOTAL}
          strokeDashoffset={dashOffset}
          style={{ transition: "stroke-dashoffset 0.5s linear" }}
        />
      </svg>

      {/* 중앙 텍스트 */}
      <div
        className="absolute inset-0 flex flex-col items-center justify-center"
        aria-hidden="true"
      >
        <span
          className="font-bold leading-none tabular-nums"
          style={{ fontSize: 18, color: "#f8fafc", fontWeight: 700 }}
        >
          {remainingSec}
        </span>
        <span
          className="leading-none tracking-widest"
          style={{ fontSize: 8, color: "#6b7280", fontWeight: 700, letterSpacing: "0.1em" }}
        >
          SEC
        </span>
      </div>
    </div>
  );
}
