"use client";

import { useMemo, useState } from "react";
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

/**
 * PR 1 placeholder 슬롯 — PR 5 (RoundHistoryTable)에서 교체 예정.
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
        <span>PR 5에서 구현 예정 · 필터 적용 항목 {count}건</span>
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
