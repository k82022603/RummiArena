"use client";

import { useMemo, useState } from "react";
import type {
  TournamentFilterState,
  TournamentSummary,
  TournamentRoundEntry,
  CostEfficiencyEntry,
  ModelLatestStats,
} from "@/lib/types";
import { DEFAULT_TOURNAMENT_FILTER } from "@/lib/types";
import TournamentFilter from "./TournamentFilter";
import TournamentGrid from "./TournamentGrid";
import ModelLegend from "./ModelLegend";
import PlaceRateChart from "./PlaceRateChart";

interface TournamentPageClientProps {
  initialSummary: TournamentSummary;
}

/**
 * PR 1 placeholder 슬롯.
 * PR 2~5에서 PlaceRateChart / CostEfficiencyScatter / ModelCardGrid / RoundHistoryTable로 교체된다.
 */
function PlaceholderSlot({
  title,
  description,
  count,
}: {
  title: string;
  description: string;
  count: number;
}) {
  return (
    <div className="h-full flex flex-col">
      <h2 className="text-sm font-semibold text-slate-300 uppercase tracking-wide mb-2">
        {title}
      </h2>
      <p className="text-xs text-slate-500 mb-4">{description}</p>
      <div className="flex-1 flex items-center justify-center border border-dashed border-slate-700 rounded-md text-slate-500 text-sm">
        <span>PR 2~5에서 구현 예정 · 필터 적용 항목 {count}건</span>
      </div>
    </div>
  );
}

export default function TournamentPageClient({
  initialSummary,
}: TournamentPageClientProps) {
  const [filters, setFilters] = useState<TournamentFilterState>(
    DEFAULT_TOURNAMENT_FILTER,
  );

  const { filteredRounds, filteredCostEff, filteredCards } = useMemo(() => {
    const selected = new Set(filters.selectedModels);
    const [startRound, endRound] = filters.roundRange;

    const allRoundIds = Array.from(
      new Set(initialSummary.rounds.map((r) => r.round)),
    );
    const startIdx = allRoundIds.indexOf(startRound);
    const endIdx = allRoundIds.indexOf(endRound);
    const inRange = (roundId: string) => {
      if (startIdx === -1 || endIdx === -1) return true;
      const idx = allRoundIds.indexOf(roundId);
      const lo = Math.min(startIdx, endIdx);
      const hi = Math.max(startIdx, endIdx);
      return idx >= lo && idx <= hi;
    };

    const promptMatches = (pv: string) =>
      filters.promptVersion === "all" || filters.promptVersion === pv;

    const rounds: TournamentRoundEntry[] = initialSummary.rounds.filter(
      (r) =>
        selected.has(r.modelType) &&
        inRange(r.round) &&
        promptMatches(r.promptVersion),
    );

    const costEff: CostEfficiencyEntry[] = initialSummary.costEfficiency.filter(
      (c) =>
        selected.has(c.modelType) &&
        inRange(c.round) &&
        promptMatches(c.promptVersion),
    );

    const cards: ModelLatestStats[] = initialSummary.modelStats.filter((c) =>
      selected.has(c.modelType),
    );

    return {
      filteredRounds: rounds,
      filteredCostEff: costEff,
      filteredCards: cards,
    };
  }, [filters, initialSummary]);

  return (
    <div className="tournament-content">
      <header className="mb-6 flex items-end justify-between flex-wrap gap-4">
        <div>
          <h1
            id="tournament-heading"
            className="text-2xl font-bold text-white"
          >
            AI 토너먼트 결과
          </h1>
          <p className="text-sm text-slate-400 mt-1">
            총 {initialSummary.totalBattles}회 대전 · 누적 비용 $
            {initialSummary.totalCostUsd.toFixed(2)}
          </p>
        </div>
        <p className="text-xs text-slate-500">
          최종 업데이트:{" "}
          {initialSummary.lastUpdated
            ? new Date(initialSummary.lastUpdated).toLocaleString("ko-KR")
            : "—"}
        </p>
      </header>

      <TournamentFilter value={filters} onChange={setFilters} />

      <TournamentGrid
        topLeft={
          <PlaceRateChart
            data={filteredRounds}
            selectedModels={filters.selectedModels}
            promptVersion={filters.promptVersion}
          />
        }
        topRight={
          <PlaceholderSlot
            title="비용 효율성"
            description="Cost vs Place Rate 산점도 (PR 3)"
            count={filteredCostEff.length}
          />
        }
        bottomLeft={
          <PlaceholderSlot
            title="모델 카드"
            description="모델별 최신 지표 요약 (PR 4)"
            count={filteredCards.length}
          />
        }
        bottomRight={
          <PlaceholderSlot
            title="라운드 히스토리"
            description="라운드별 상세 테이블 (PR 5)"
            count={filteredRounds.length}
          />
        }
      />

      <ModelLegend selectedModels={filters.selectedModels} />
    </div>
  );
}
