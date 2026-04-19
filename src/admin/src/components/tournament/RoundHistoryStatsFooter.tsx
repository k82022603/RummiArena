"use client";

/**
 * RoundHistoryStatsFooter — 통계 요약 바 (ADR 45 §6.5)
 *
 * 필터된 결과의 평균 / σ / 중앙값 / 총 비용 / 평균 fallback 표시
 */

import type { RoundHistoryStats } from "@/lib/types";
import { fmtPlaceRate, fmtCost } from "@/lib/formatters";

interface RoundHistoryStatsFooterProps {
  stats: RoundHistoryStats;
}

interface StatCardProps {
  label: string;
  value: string;
  sub?: string;
}

function StatCard({ label, value, sub }: StatCardProps) {
  return (
    <div className="flex flex-col">
      <span className="text-[10px] text-slate-500 uppercase tracking-wide">
        {label}
      </span>
      <span className="text-sm font-semibold text-slate-200">{value}</span>
      {sub && <span className="text-[10px] text-slate-500">{sub}</span>}
    </div>
  );
}

export function RoundHistoryStatsFooter({ stats }: RoundHistoryStatsFooterProps) {
  if (stats.count === 0) {
    return (
      <div className="px-4 py-2 border-t border-slate-700 text-xs text-slate-500">
        결과 없음
      </div>
    );
  }

  return (
    <div
      className="px-4 py-2 border-t border-slate-700 flex flex-wrap items-center gap-x-6 gap-y-1"
      aria-label="필터 결과 통계 요약"
    >
      <span className="text-xs text-slate-400 mr-2">
        총 <strong className="text-slate-200">{stats.count}</strong>건
      </span>

      <StatCard
        label="평균 Place%"
        value={fmtPlaceRate(stats.avgPlaceRate)}
        sub={`σ ${(stats.stdDevPlaceRate * 100).toFixed(2)}%p`}
      />

      <StatCard
        label="중앙값 Place%"
        value={fmtPlaceRate(stats.medianPlaceRate)}
      />

      <StatCard
        label="평균 Fallback"
        value={
          stats.avgFallbackCount === 0
            ? "—"
            : stats.avgFallbackCount.toFixed(1)
        }
      />

      <StatCard
        label="평균 Latency"
        value={
          stats.avgLatencyMs === 0
            ? "—"
            : `${Math.round(stats.avgLatencyMs / 1000)}s`
        }
      />

      <StatCard
        label="총 비용"
        value={fmtCost(stats.totalCostUsd)}
      />
    </div>
  );
}
