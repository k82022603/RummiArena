"use client";

/**
 * EloRankingPanel — ELO 랭킹 통계 패널 (Client Component)
 *
 * - 상단 요약 카드 3개: 총 랭크 유저 수 / 최고 레이팅 / 평균 레이팅
 * - 티어 분포 파이 차트 (recharts PieChart)
 * - 전체 리더보드 테이블 (티어 필터 탭 + 페이지네이션)
 */

import { useState, useCallback, useMemo } from "react";
import {
  PieChart,
  Pie,
  Cell,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from "recharts";
import { TIER_COLORS } from "@/lib/mock-data";
import type {
  EloTier,
  EloRankingEntry,
  EloRankingsResponse,
  EloSummary,
  EloTierDistribution,
} from "@/lib/mock-data";

// ------------------------------------------------------------------
// 상수
// ------------------------------------------------------------------

const TIER_LABEL: Record<EloTier, string> = {
  UNRANKED: "Unranked",
  BRONZE:   "Bronze",
  SILVER:   "Silver",
  GOLD:     "Gold",
  PLATINUM: "Platinum",
  DIAMOND:  "Diamond",
};

const FILTER_TABS: Array<{ key: EloTier | "ALL"; label: string }> = [
  { key: "ALL",      label: "전체" },
  { key: "DIAMOND",  label: "Diamond" },
  { key: "PLATINUM", label: "Platinum" },
  { key: "GOLD",     label: "Gold" },
  { key: "SILVER",   label: "Silver" },
  { key: "BRONZE",   label: "Bronze" },
  { key: "UNRANKED", label: "Unranked" },
];

const PAGE_SIZE = 20;

// ------------------------------------------------------------------
// 서브 컴포넌트: 요약 카드
// ------------------------------------------------------------------

interface SummaryCardProps {
  title: string;
  value: string | number;
  accent?: string;
}

function SummaryCard({ title, value, accent = "text-white" }: SummaryCardProps) {
  return (
    <div className="bg-slate-800 border border-slate-700 rounded-lg p-5">
      <p className="text-sm text-slate-400 mb-1">{title}</p>
      <p className={`text-3xl font-bold ${accent}`}>{value}</p>
    </div>
  );
}

// ------------------------------------------------------------------
// 서브 컴포넌트: 티어 배지
// ------------------------------------------------------------------

function TierBadge({ tier }: { tier: EloTier }) {
  const color = TIER_COLORS[tier];
  return (
    <span
      className="inline-flex items-center px-2 py-0.5 rounded text-xs font-semibold"
      style={{ backgroundColor: `${color}22`, color, border: `1px solid ${color}55` }}
    >
      {TIER_LABEL[tier]}
    </span>
  );
}

// ------------------------------------------------------------------
// 서브 컴포넌트: 파이 차트 툴팁
// ------------------------------------------------------------------

interface PieTooltipProps {
  active?: boolean;
  payload?: Array<{ name: string; value: number; payload: { tier: EloTier; color: string } }>;
}

function EloTierTooltip({ active, payload }: PieTooltipProps) {
  if (!active || !payload || payload.length === 0) return null;
  const item = payload[0];
  return (
    <div className="bg-slate-800 border border-slate-600 rounded-lg px-3 py-2 text-sm">
      <p className="font-semibold" style={{ color: item.payload.color }}>
        {TIER_LABEL[item.payload.tier]}
      </p>
      <p className="text-slate-300">{item.value}명</p>
    </div>
  );
}

// ------------------------------------------------------------------
// 서브 컴포넌트: 파이 차트 섹션
// ------------------------------------------------------------------

interface ChartDataItem {
  name: string;
  value: number;
  tier: EloTier;
  color: string;
}

function TierDistributionChart({ data }: { data: EloTierDistribution[] }) {
  const chartData: ChartDataItem[] = data.map((d) => ({
    name: TIER_LABEL[d.tier],
    value: d.count,
    tier: d.tier,
    color: d.color,
  }));

  // Legend content는 recharts가 payload를 주입하지 않으므로 클로저로 chartData 직접 사용
  function renderLegend() {
    return (
      <ul className="flex flex-wrap gap-x-4 gap-y-1 justify-center mt-2">
        {chartData.map((entry) => (
          <li key={entry.tier} className="flex items-center gap-1.5 text-xs text-slate-400">
            <span
              className="w-3 h-3 rounded-sm flex-shrink-0"
              style={{ backgroundColor: entry.color }}
              aria-hidden="true"
            />
            {entry.name}
            <span className="text-slate-500">({entry.value}명)</span>
          </li>
        ))}
      </ul>
    );
  }

  return (
    <section
      className="bg-slate-800 border border-slate-700 rounded-lg p-5"
      aria-label="티어별 인원 분포"
    >
      <h2 className="text-sm font-semibold text-slate-300 mb-4 uppercase tracking-wide">
        티어 분포
      </h2>
      <div className="w-full h-56">
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie
              data={chartData}
              cx="50%"
              cy="45%"
              innerRadius={55}
              outerRadius={85}
              paddingAngle={3}
              dataKey="value"
            >
              {chartData.map((entry) => (
                <Cell key={entry.tier} fill={entry.color} stroke="transparent" />
              ))}
            </Pie>
            <Tooltip content={<EloTierTooltip />} />
            <Legend content={renderLegend} />
          </PieChart>
        </ResponsiveContainer>
      </div>
    </section>
  );
}

// ------------------------------------------------------------------
// 서브 컴포넌트: 리더보드 테이블
// ------------------------------------------------------------------

interface LeaderboardTableProps {
  entries: EloRankingEntry[];
  total: number;
  page: number;
  onPrev: () => void;
  onNext: () => void;
  activeTier: EloTier | "ALL";
  onTierChange: (tier: EloTier | "ALL") => void;
}

function LeaderboardTable({
  entries,
  total,
  page,
  onPrev,
  onNext,
  activeTier,
  onTierChange,
}: LeaderboardTableProps) {
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const start = page * PAGE_SIZE + 1;
  const end = Math.min((page + 1) * PAGE_SIZE, total);

  return (
    <section className="bg-slate-800 border border-slate-700 rounded-lg p-5">
      <div className="flex items-center justify-between mb-4 flex-wrap gap-3">
        <h2 className="text-sm font-semibold text-slate-300 uppercase tracking-wide">
          전체 리더보드
        </h2>
        {/* 티어 필터 탭 */}
        <div
          className="flex flex-wrap gap-1"
          role="tablist"
          aria-label="티어 필터"
        >
          {FILTER_TABS.map(({ key, label }) => (
            <button
              key={key}
              role="tab"
              aria-selected={activeTier === key}
              onClick={() => onTierChange(key)}
              className={[
                "px-3 py-1 rounded text-xs font-medium transition-colors",
                activeTier === key
                  ? "bg-slate-600 text-white"
                  : "text-slate-400 hover:bg-slate-700 hover:text-white",
              ].join(" ")}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-sm" aria-label="ELO 리더보드 테이블">
          <thead className="text-slate-400 text-xs uppercase border-b border-slate-700">
            <tr>
              <th className="py-2 pr-3 text-right w-10">#</th>
              <th className="py-2 text-left">닉네임</th>
              <th className="py-2 text-center">티어</th>
              <th className="py-2 text-right">레이팅</th>
              <th className="py-2 text-right">승</th>
              <th className="py-2 text-right">패</th>
              <th className="py-2 text-right">무</th>
              <th className="py-2 text-right">승률</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-700/60">
            {entries.length === 0 ? (
              <tr>
                <td colSpan={8} className="py-8 text-center text-slate-500">
                  해당 티어 랭킹 데이터가 없습니다.
                </td>
              </tr>
            ) : (
              entries.map((entry, idx) => (
                <tr
                  key={entry.userId}
                  className={idx % 2 === 0 ? "bg-slate-900/40" : ""}
                >
                  <td className="py-2 pr-3 text-right text-slate-400 font-mono text-xs">
                    {entry.rank}
                  </td>
                  <td className="py-2 text-slate-100 font-medium">
                    {entry.displayName}
                    {entry.winStreak >= 3 && (
                      <span
                        className="ml-1.5 text-xs text-orange-400 font-semibold"
                        title={`${entry.winStreak}연승`}
                        aria-label={`${entry.winStreak}연승`}
                      >
                        {entry.winStreak}W
                      </span>
                    )}
                  </td>
                  <td className="py-2 text-center">
                    <TierBadge tier={entry.tier} />
                  </td>
                  <td className="py-2 text-right font-mono font-semibold text-slate-100">
                    {entry.rating.toLocaleString()}
                  </td>
                  <td className="py-2 text-right text-green-400">{entry.wins}</td>
                  <td className="py-2 text-right text-red-400">{entry.losses}</td>
                  <td className="py-2 text-right text-slate-400">{entry.draws}</td>
                  <td className="py-2 text-right text-slate-300">
                    {entry.winRate.toFixed(1)}%
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* 페이지네이션 */}
      <div className="flex items-center justify-between mt-4 text-xs text-slate-400">
        <span>
          {total > 0 ? `${start}–${end} / 총 ${total}명` : "0명"}
        </span>
        <div className="flex gap-2">
          <button
            onClick={onPrev}
            disabled={page === 0}
            className="px-3 py-1 rounded bg-slate-700 hover:bg-slate-600 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
            aria-label="이전 페이지"
          >
            이전
          </button>
          <span className="px-2 py-1 text-slate-300">
            {page + 1} / {totalPages}
          </span>
          <button
            onClick={onNext}
            disabled={page >= totalPages - 1}
            className="px-3 py-1 rounded bg-slate-700 hover:bg-slate-600 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
            aria-label="다음 페이지"
          >
            다음
          </button>
        </div>
      </div>
    </section>
  );
}

// ------------------------------------------------------------------
// 메인 컴포넌트
// ------------------------------------------------------------------

interface EloRankingPanelProps {
  initialRankings: EloRankingsResponse;
  summary: EloSummary;
  tierDistribution: EloTierDistribution[];
}

export default function EloRankingPanel({
  initialRankings,
  summary,
  tierDistribution,
}: EloRankingPanelProps) {
  const [activeTier, setActiveTier] = useState<EloTier | "ALL">("ALL");
  const [page, setPage] = useState(0);

  // 클라이언트 사이드 티어 필터 (mock 모드 / 초기 데이터 기준)
  const filteredEntries = useMemo<EloRankingEntry[]>(() => {
    const all = initialRankings.rankings;
    return activeTier === "ALL"
      ? all
      : all.filter((r) => r.tier === activeTier);
  }, [initialRankings.rankings, activeTier]);

  const pagedEntries = useMemo(
    () => filteredEntries.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE),
    [filteredEntries, page],
  );

  const handleTierChange = useCallback((tier: EloTier | "ALL") => {
    setActiveTier(tier);
    setPage(0);
  }, []);

  const handlePrev = useCallback(() => setPage((p) => Math.max(0, p - 1)), []);
  const handleNext = useCallback(
    () =>
      setPage((p) =>
        p < Math.ceil(filteredEntries.length / PAGE_SIZE) - 1 ? p + 1 : p,
      ),
    [filteredEntries.length],
  );

  return (
    <div>
      <h1 className="text-xl font-bold text-white mb-6">ELO 랭킹</h1>

      {/* 요약 카드 3개 */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-6">
        <SummaryCard
          title="총 랭크 유저"
          value={`${summary.totalRankedUsers.toLocaleString()}명`}
          accent="text-blue-400"
        />
        <SummaryCard
          title="최고 레이팅"
          value={summary.topRating.toLocaleString()}
          accent="text-purple-400"
        />
        <SummaryCard
          title="평균 레이팅"
          value={summary.avgRating.toLocaleString()}
          accent="text-yellow-400"
        />
      </div>

      {/* 파이 차트 + 리더보드 상단 배치 */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-6">
        {/* 파이 차트 (1/3) */}
        <div className="lg:col-span-1">
          <TierDistributionChart data={tierDistribution} />
        </div>

        {/* 리더보드 테이블 (2/3) */}
        <div className="lg:col-span-2">
          <LeaderboardTable
            entries={pagedEntries}
            total={filteredEntries.length}
            page={page}
            onPrev={handlePrev}
            onNext={handleNext}
            activeTier={activeTier}
            onTierChange={handleTierChange}
          />
        </div>
      </div>
    </div>
  );
}
