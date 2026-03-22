"use client";

import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import { useCallback, useEffect, useState } from "react";
import {
  getRankings,
  getRankingsByTier,
  getUserRating,
  TIERS,
  TIER_LABEL,
} from "@/lib/rankings-api";
import { TierBadge } from "@/components/rankings/TierBadge";
import type { RankingEntry, RankingsResponse, Tier, UserRating } from "@/lib/rankings-api";

// ------------------------------------------------------------------
// 티어 필터 탭
// ------------------------------------------------------------------

const ALL_FILTER = "ALL" as const;
type TierFilter = typeof ALL_FILTER | Tier;

const FILTER_TABS: { value: TierFilter; label: string }[] = [
  { value: ALL_FILTER, label: "전체" },
  ...TIERS.map((t) => ({ value: t as TierFilter, label: TIER_LABEL[t] })),
];

// ------------------------------------------------------------------
// 순위 뱃지 (1~3위 특별 표시)
// ------------------------------------------------------------------

function RankBadge({ rank }: { rank: number }) {
  if (rank === 1)
    return (
      <span className="font-mono font-bold text-tile-base text-yellow-400">
        1
      </span>
    );
  if (rank === 2)
    return (
      <span className="font-mono font-bold text-tile-base text-gray-300">
        2
      </span>
    );
  if (rank === 3)
    return (
      <span className="font-mono font-bold text-tile-base text-amber-600">
        3
      </span>
    );
  return (
    <span className="font-mono text-tile-sm text-text-secondary">{rank}</span>
  );
}

// ------------------------------------------------------------------
// 리더보드 행
// ------------------------------------------------------------------

function LeaderboardRow({
  entry,
  isMe,
  onClick,
}: {
  entry: RankingEntry;
  isMe: boolean;
  onClick: () => void;
}) {
  const shortId = entry.userId.slice(0, 8);

  return (
    <motion.tr
      initial={{ opacity: 0, x: -4 }}
      animate={{ opacity: 1, x: 0 }}
      className={[
        "border-b border-border transition-colors cursor-pointer",
        isMe
          ? "bg-warning/10 hover:bg-warning/15"
          : "hover:bg-card-bg",
      ].join(" ")}
      onClick={onClick}
      role="row"
      aria-label={`${entry.rank}위 ${shortId}`}
    >
      <td className="py-3 pl-4 pr-2 w-12 text-center">
        <RankBadge rank={entry.rank} />
      </td>
      <td className="py-3 px-2">
        <div className="flex items-center gap-2">
          <span
            className={[
              "font-mono text-tile-sm",
              isMe ? "text-warning font-semibold" : "text-text-primary",
            ].join(" ")}
          >
            {shortId}
          </span>
          {isMe && (
            <span className="px-1.5 py-0.5 rounded text-tile-xs bg-warning/20 text-warning">
              나
            </span>
          )}
        </div>
      </td>
      <td className="py-3 px-2 text-right">
        <span className="font-mono font-bold text-tile-sm text-text-primary">
          {entry.rating.toLocaleString()}
        </span>
      </td>
      <td className="py-3 px-2 text-center">
        <TierBadge tier={entry.tier} size="sm" />
      </td>
      <td className="py-3 px-2 text-right text-tile-sm text-text-secondary">
        {entry.winRate.toFixed(1)}%
      </td>
      <td className="py-3 px-2 pr-4 text-right text-tile-sm">
        {entry.winStreak > 0 ? (
          <span className="text-success font-semibold">
            {entry.winStreak}연승
          </span>
        ) : (
          <span className="text-text-secondary">-</span>
        )}
      </td>
    </motion.tr>
  );
}

// ------------------------------------------------------------------
// 내 레이팅 요약 카드
// ------------------------------------------------------------------

function MyRatingSummary({ rating }: { rating: UserRating }) {
  const router = useRouter();

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      className="p-4 bg-card-bg rounded-xl border border-warning/40 mb-4"
    >
      <div className="flex items-center justify-between mb-2">
        <p className="text-tile-xs text-text-secondary uppercase tracking-wider">
          내 레이팅
        </p>
        <button
          type="button"
          onClick={() => router.push(`/rankings/${rating.userId}`)}
          className="text-tile-xs text-warning hover:underline"
          aria-label="내 ELO 프로필 보기"
        >
          상세 보기
        </button>
      </div>
      <div className="flex items-center gap-4">
        <div>
          <p className="text-tile-xl font-bold text-warning">
            {rating.rating.toLocaleString()}
          </p>
          <p className="text-tile-xs text-text-secondary">ELO</p>
        </div>
        <TierBadge tier={rating.tier} size="md" />
        <div className="ml-auto text-right">
          <p className="text-tile-sm font-semibold text-text-primary">
            {rating.winRate.toFixed(1)}%
          </p>
          <p className="text-tile-xs text-text-secondary">
            {rating.wins}승 {rating.losses}패
          </p>
        </div>
      </div>
      {/* 티어 진행 바 */}
      <div className="mt-3">
        <div className="flex items-center justify-between text-tile-xs text-text-secondary mb-1">
          <span>{TIER_LABEL[rating.tier]}</span>
          <span>{rating.tierProgress}%</span>
        </div>
        <div className="h-1.5 bg-panel-bg rounded-full overflow-hidden">
          <div
            className="h-full rounded-full transition-all duration-700"
            style={{ width: `${rating.tierProgress}%`, backgroundColor: "#F3C623" }}
            role="progressbar"
            aria-valuenow={rating.tierProgress}
            aria-valuemin={0}
            aria-valuemax={100}
            aria-label="티어 진행도"
          />
        </div>
      </div>
    </motion.div>
  );
}

// ------------------------------------------------------------------
// 페이지네이션
// ------------------------------------------------------------------

function Pagination({
  offset,
  limit,
  total,
  onChange,
}: {
  offset: number;
  limit: number;
  total: number;
  onChange: (offset: number) => void;
}) {
  const currentPage = Math.floor(offset / limit) + 1;
  const totalPages = Math.ceil(total / limit);

  if (totalPages <= 1) return null;

  return (
    <div className="flex items-center justify-center gap-2 mt-4">
      <button
        type="button"
        onClick={() => onChange(Math.max(0, offset - limit))}
        disabled={offset === 0}
        className="px-3 py-1.5 rounded-lg text-tile-sm bg-card-bg border border-border hover:border-border-active disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
        aria-label="이전 페이지"
      >
        &larr;
      </button>
      <span className="text-tile-sm text-text-secondary">
        {currentPage} / {totalPages}
      </span>
      <button
        type="button"
        onClick={() => onChange(Math.min((totalPages - 1) * limit, offset + limit))}
        disabled={offset + limit >= total}
        className="px-3 py-1.5 rounded-lg text-tile-sm bg-card-bg border border-border hover:border-border-active disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
        aria-label="다음 페이지"
      >
        &rarr;
      </button>
    </div>
  );
}

// ------------------------------------------------------------------
// 메인 RankingsClient
// ------------------------------------------------------------------

export default function RankingsClient() {
  const { data: session } = useSession();
  const router = useRouter();

  const [activeFilter, setActiveFilter] = useState<TierFilter>(ALL_FILTER);
  const [offset, setOffset] = useState(0);
  const [response, setResponse] = useState<RankingsResponse | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [myRating, setMyRating] = useState<UserRating | null>(null);

  const limit = 20;

  // 내 레이팅 로드 (로그인 상태면)
  useEffect(() => {
    const userId = (session?.user as { id?: string } | undefined)?.id;
    if (!userId) return;
    void getUserRating(userId).then(setMyRating).catch(() => null);
  }, [session]);

  // 리더보드 로드
  const loadRankings = useCallback(async () => {
    setIsLoading(true);
    try {
      const data =
        activeFilter === ALL_FILTER
          ? await getRankings(limit, offset)
          : await getRankingsByTier(activeFilter, limit, offset);
      setResponse(data);
    } finally {
      setIsLoading(false);
    }
  }, [activeFilter, offset]);

  useEffect(() => {
    void loadRankings();
  }, [loadRankings]);

  // 필터 변경 시 페이지 초기화
  const handleFilterChange = (filter: TierFilter) => {
    setActiveFilter(filter);
    setOffset(0);
  };

  const myUserId = (session?.user as { id?: string } | undefined)?.id;

  return (
    <main className="min-h-screen bg-app-bg text-text-primary" aria-label="ELO 랭킹 페이지">
      {/* 헤더 */}
      <header className="border-b border-border bg-panel-bg px-6 py-3 h-12 flex items-center">
        <div className="max-w-4xl w-full mx-auto flex items-center justify-between">
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => router.push("/lobby")}
              className="text-text-secondary hover:text-text-primary transition-colors"
              aria-label="로비로 돌아가기"
            >
              &larr;
            </button>
            <h1 className="text-tile-lg font-bold">
              Rummi<span className="text-warning">Arena</span>
              <span className="text-text-secondary font-normal text-tile-sm ml-2">
                랭킹
              </span>
            </h1>
          </div>
          {session?.user?.name && (
            <span className="text-tile-sm text-text-secondary hidden sm:inline">
              {session.user.name}
            </span>
          )}
        </div>
      </header>

      <div className="max-w-4xl mx-auto px-4 py-6">
        {/* 내 레이팅 요약 (로그인 상태) */}
        {myRating && <MyRatingSummary rating={myRating} />}

        {/* 티어 필터 탭 */}
        <div
          className="flex gap-1 mb-4 flex-wrap"
          role="tablist"
          aria-label="티어 필터"
        >
          {FILTER_TABS.map(({ value, label }) => (
            <button
              key={value}
              type="button"
              role="tab"
              aria-selected={activeFilter === value}
              onClick={() => handleFilterChange(value)}
              className={[
                "px-3 py-1.5 rounded-lg text-tile-sm font-medium transition-colors",
                activeFilter === value
                  ? "bg-warning text-gray-900"
                  : "bg-card-bg border border-border text-text-secondary hover:border-border-active hover:text-text-primary",
              ].join(" ")}
            >
              {label}
            </button>
          ))}
        </div>

        {/* 리더보드 테이블 */}
        <div className="bg-card-bg rounded-xl border border-border overflow-hidden">
          {/* 테이블 헤더 */}
          <div className="border-b border-border px-4 py-2 flex items-center justify-between">
            <p className="text-tile-sm font-semibold text-text-secondary">
              {activeFilter === ALL_FILTER
                ? "전체 순위"
                : `${TIER_LABEL[activeFilter]} 순위`}
            </p>
            <button
              type="button"
              onClick={() => void loadRankings()}
              className="text-tile-xs text-text-secondary hover:text-text-primary transition-colors"
              aria-label="랭킹 새로고침"
            >
              새로고침
            </button>
          </div>

          <table className="w-full" role="table" aria-label="ELO 리더보드">
            <thead>
              <tr className="border-b border-border text-tile-xs text-text-secondary uppercase tracking-wider">
                <th scope="col" className="py-2 pl-4 pr-2 text-center w-12">
                  순위
                </th>
                <th scope="col" className="py-2 px-2 text-left">
                  플레이어
                </th>
                <th scope="col" className="py-2 px-2 text-right">
                  레이팅
                </th>
                <th scope="col" className="py-2 px-2 text-center">
                  티어
                </th>
                <th scope="col" className="py-2 px-2 text-right">
                  승률
                </th>
                <th scope="col" className="py-2 px-2 pr-4 text-right">
                  연승
                </th>
              </tr>
            </thead>
            <tbody>
              {isLoading ? (
                <tr>
                  <td colSpan={6} className="py-16 text-center">
                    <motion.div
                      animate={{ rotate: 360 }}
                      transition={{
                        repeat: Infinity,
                        duration: 1,
                        ease: "linear",
                      }}
                      className="w-6 h-6 rounded-full border-2 border-warning border-t-transparent mx-auto mb-2"
                      aria-hidden="true"
                    />
                    <p className="text-tile-sm text-text-secondary">
                      불러오는 중...
                    </p>
                  </td>
                </tr>
              ) : response?.data.length === 0 ? (
                <tr>
                  <td
                    colSpan={6}
                    className="py-16 text-center text-text-secondary text-tile-sm"
                  >
                    해당 티어의 랭킹 데이터가 없습니다.
                  </td>
                </tr>
              ) : (
                <AnimatePresence>
                  {response?.data.map((entry) => (
                    <LeaderboardRow
                      key={entry.userId}
                      entry={entry}
                      isMe={entry.userId === myUserId}
                      onClick={() => router.push(`/rankings/${entry.userId}`)}
                    />
                  ))}
                </AnimatePresence>
              )}
            </tbody>
          </table>
        </div>

        {/* 페이지네이션 */}
        {response && (
          <Pagination
            offset={response.pagination.offset}
            limit={response.pagination.limit}
            total={response.pagination.total}
            onChange={setOffset}
          />
        )}
      </div>
    </main>
  );
}
