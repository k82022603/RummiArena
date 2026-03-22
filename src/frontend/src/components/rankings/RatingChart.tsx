"use client";

import { memo, useMemo } from "react";
import type { RatingHistoryEntry } from "@/lib/rankings-api";

interface RatingChartProps {
  history: RatingHistoryEntry[];
}

const CHART_W = 600;
const CHART_H = 180;
const PAD_LEFT = 48;
const PAD_RIGHT = 16;
const PAD_TOP = 16;
const PAD_BOTTOM = 32;

const INNER_W = CHART_W - PAD_LEFT - PAD_RIGHT;
const INNER_H = CHART_H - PAD_TOP - PAD_BOTTOM;

/**
 * 레이팅 변화 히스토리 차트 (SVG 기반 LineChart)
 *
 * recharts 미설치 환경이므로 SVG를 직접 렌더링한다.
 * recharts가 필요하다면 package.json에 "recharts": "^2.x" 를 추가하면 된다.
 */
export const RatingChart = memo(function RatingChart({
  history,
}: RatingChartProps) {
  const points = useMemo(() => {
    if (history.length === 0) return [];

    const ratings = history.map((h) => h.ratingAfter);
    const minR = Math.min(...ratings);
    const maxR = Math.max(...ratings);
    const rangeR = maxR - minR || 1;

    return history.map((h, i) => {
      const x = PAD_LEFT + (i / Math.max(history.length - 1, 1)) * INNER_W;
      const y =
        PAD_TOP + INNER_H - ((h.ratingAfter - minR) / rangeR) * INNER_H;
      return { x, y, entry: h };
    });
  }, [history]);

  const yLabels = useMemo(() => {
    if (history.length === 0) return [];
    const ratings = history.map((h) => h.ratingAfter);
    const minR = Math.min(...ratings);
    const maxR = Math.max(...ratings);
    const step = Math.ceil((maxR - minR) / 4 / 50) * 50 || 50;
    const labels: number[] = [];
    for (
      let v = Math.floor(minR / step) * step;
      v <= maxR + step;
      v += step
    ) {
      labels.push(v);
    }
    const rangeR = maxR - minR || 1;
    return labels.map((v) => ({
      value: v,
      y: PAD_TOP + INNER_H - ((v - minR) / rangeR) * INNER_H,
    }));
  }, [history]);

  const polyline = points.map((p) => `${p.x},${p.y}`).join(" ");

  if (history.length === 0) {
    return (
      <div className="flex items-center justify-center h-40 text-text-secondary text-tile-sm">
        레이팅 히스토리가 없습니다.
      </div>
    );
  }

  return (
    <div className="w-full overflow-x-auto">
      <svg
        viewBox={`0 0 ${CHART_W} ${CHART_H}`}
        className="w-full"
        style={{ minWidth: "280px", maxHeight: "200px" }}
        aria-label="레이팅 변화 차트"
        role="img"
      >
        {/* 격자선 + Y축 레이블 */}
        {yLabels.map(({ value, y }) =>
          y >= PAD_TOP - 4 && y <= PAD_TOP + INNER_H + 4 ? (
            <g key={value}>
              <line
                x1={PAD_LEFT}
                y1={y}
                x2={PAD_LEFT + INNER_W}
                y2={y}
                stroke="#30363D"
                strokeWidth={1}
                strokeDasharray="4 4"
              />
              <text
                x={PAD_LEFT - 6}
                y={y + 4}
                textAnchor="end"
                fontSize={9}
                fill="#8B949E"
              >
                {value}
              </text>
            </g>
          ) : null
        )}

        {/* 영역 채우기 */}
        <defs>
          <linearGradient id="ratingGradient" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#F3C623" stopOpacity={0.3} />
            <stop offset="100%" stopColor="#F3C623" stopOpacity={0.02} />
          </linearGradient>
        </defs>
        {points.length > 1 && (
          <polygon
            points={[
              `${PAD_LEFT},${PAD_TOP + INNER_H}`,
              ...points.map((p) => `${p.x},${p.y}`),
              `${PAD_LEFT + INNER_W},${PAD_TOP + INNER_H}`,
            ].join(" ")}
            fill="url(#ratingGradient)"
          />
        )}

        {/* 라인 */}
        {points.length > 1 && (
          <polyline
            points={polyline}
            fill="none"
            stroke="#F3C623"
            strokeWidth={2}
            strokeLinejoin="round"
            strokeLinecap="round"
          />
        )}

        {/* 데이터 포인트 */}
        {points.map((p, i) => (
          <circle
            key={i}
            cx={p.x}
            cy={p.y}
            r={3}
            fill={p.entry.ratingDelta >= 0 ? "#3FB950" : "#F85149"}
            stroke="#0D1117"
            strokeWidth={1.5}
          >
            <title>
              {new Date(p.entry.createdAt).toLocaleDateString("ko-KR")}
              {" · "}
              {p.entry.ratingAfter}
              {" ("}
              {p.entry.ratingDelta >= 0 ? "+" : ""}
              {p.entry.ratingDelta}
              {")"}
            </title>
          </circle>
        ))}

        {/* X축 레이블 (5개 간격) */}
        {points
          .filter(
            (_, i) =>
              i === 0 ||
              i === points.length - 1 ||
              i % Math.ceil(points.length / 4) === 0
          )
          .map((p, i) => (
            <text
              key={i}
              x={p.x}
              y={CHART_H - 8}
              textAnchor="middle"
              fontSize={9}
              fill="#8B949E"
            >
              {new Date(p.entry.createdAt).toLocaleDateString("ko-KR", {
                month: "numeric",
                day: "numeric",
              })}
            </text>
          ))}
      </svg>
    </div>
  );
});
