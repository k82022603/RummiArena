"use client";

import type { ReactNode } from "react";

interface TournamentGridProps {
  topLeft: ReactNode;
  topRight: ReactNode;
  bottomLeft: ReactNode;
  bottomRight: ReactNode;
}

/**
 * 4분할 responsive 그리드. PR 1에서는 각 슬롯이 placeholder.
 * PR 2~5에서 차트/카드/테이블로 채워진다.
 *
 * 브레이크포인트 (스펙 §4.3):
 * - `< 1024px`: grid-cols-1 (세로 스택)
 * - `1024px+`: grid-cols-2 (2×2)
 */
export default function TournamentGrid({
  topLeft,
  topRight,
  bottomLeft,
  bottomRight,
}: TournamentGridProps) {
  return (
    <section aria-label="토너먼트 대시보드 그리드">
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="bg-slate-800 border border-slate-700 rounded-lg p-5 min-h-[320px]">
          {topLeft}
        </div>
        <div className="bg-slate-800 border border-slate-700 rounded-lg p-5 min-h-[320px]">
          {topRight}
        </div>
        <div className="bg-slate-800 border border-slate-700 rounded-lg p-5 min-h-[320px]">
          {bottomLeft}
        </div>
        <div className="bg-slate-800 border border-slate-700 rounded-lg p-5 min-h-[320px]">
          {bottomRight}
        </div>
      </div>
    </section>
  );
}
