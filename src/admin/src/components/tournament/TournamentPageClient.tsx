"use client";

import { useMemo, useState, Suspense } from "react";
import type {
  TournamentFilterState,
  TournamentSummary,
  TournamentRoundEntry,
  ModelLatestStats,
} from "@/lib/types";
import { DEFAULT_TOURNAMENT_FILTER } from "@/lib/types";
import TournamentFilter from "./TournamentFilter";
import TournamentGrid from "./TournamentGrid";
import ModelLegend from "./ModelLegend";
import PlaceRateChart from "./PlaceRateChart";
import CostEfficiencyScatter from "./CostEfficiencyScatter";
import ModelCardGrid, {
  type ModelCardEntry,
} from "./ModelCardGrid";
import { RoundHistoryTable } from "./RoundHistoryTable";
import { ROUND_HISTORY_SEED } from "@/lib/roundHistoryData";

/**
 * ModelLatestStats (API 스키마) → ModelCardEntry (ModelCardGrid 입력) 매핑.
 *
 * API 응답에는 fallbackCount가 아직 없고, recentBattleHref도 Sprint 7에서
 * 활성화될 예정이다. skeleton 단계에서는 합리적 기본값을 사용한다.
 */
function toCardEntry(s: ModelLatestStats): ModelCardEntry {
  return {
    modelKey: s.modelType,
    modelName: s.modelName,
    latestRound: s.latestRound,
    latestRate: s.latestRate,
    grade: s.grade,
    fallbackCount: 0, // TODO(Sprint7): API가 fallback_count 추가 시 매핑
    costPerTurn: s.costPerTurn,
    avgResponseTimeSec: s.avgResponseTimeSec,
    totalTilesPlaced: s.totalTilesPlaced,
    completed: s.completed,
    promptVersion: s.promptVersion,
    sparkline: s.sparkline,
    recentBattleHref: `#/tournament/${s.latestRound}/${s.modelType}`,
  };
}

interface TournamentPageClientProps {
  initialSummary: TournamentSummary;
}

/** RoundHistoryTable 로딩 스켈레톤 */
function RoundHistorySkeleton() {
  return (
    <div className="h-full flex flex-col gap-2 animate-pulse">
      <div className="h-8 bg-slate-700/50 rounded w-1/3" />
      <div className="flex-1 bg-slate-700/30 rounded border border-slate-700" />
    </div>
  );
}

export default function TournamentPageClient({
  initialSummary,
}: TournamentPageClientProps) {
  const [filters, setFilters] = useState<TournamentFilterState>(
    DEFAULT_TOURNAMENT_FILTER,
  );

  const { filteredRounds, filteredCards } = useMemo(() => {
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

    const cards: ModelLatestStats[] = initialSummary.modelStats.filter((c) =>
      selected.has(c.modelType),
    );

    return {
      filteredRounds: rounds,
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
          <CostEfficiencyScatter
            data={filteredRounds}
            selectedModels={filters.selectedModels}
            promptVersion={filters.promptVersion}
          />
        }
        bottomLeft={
          <ModelCardGrid
            cards={filteredCards.map(toCardEntry)}
          />
        }
        bottomRight={
          <div className="h-full flex flex-col">
            <h2 className="text-sm font-semibold text-slate-300 uppercase tracking-wide mb-3">
              라운드 히스토리
            </h2>
            <div className="flex-1 overflow-auto">
              <Suspense fallback={<RoundHistorySkeleton />}>
                <RoundHistoryTable data={ROUND_HISTORY_SEED} />
              </Suspense>
            </div>
          </div>
        }
      />

      <ModelLegend selectedModels={filters.selectedModels} />
    </div>
  );
}
