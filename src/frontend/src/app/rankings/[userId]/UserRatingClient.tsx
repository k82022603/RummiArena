"use client";

import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import { motion } from "framer-motion";
import { useEffect, useState } from "react";
import {
  getUserRating,
  getRatingHistory,
  TIER_LABEL,
  TIER_COLOR,
} from "@/lib/rankings-api";
import { TierBadge } from "@/components/rankings/TierBadge";
import { RatingChart } from "@/components/rankings/RatingChart";
import type { UserRating, RatingHistoryEntry } from "@/lib/rankings-api";

// ------------------------------------------------------------------
// 스탯 카드
// ------------------------------------------------------------------

function StatCard({
  label,
  value,
  accent,
}: {
  label: string;
  value: string | number;
  accent?: boolean;
}) {
  return (
    <div className="bg-panel-bg rounded-xl p-4 flex flex-col items-center gap-1">
      <p
        className={[
          "text-tile-xl font-bold",
          accent ? "text-warning" : "text-text-primary",
        ].join(" ")}
      >
        {value}
      </p>
      <p className="text-tile-xs text-text-secondary">{label}</p>
    </div>
  );
}

// ------------------------------------------------------------------
// 히스토리 테이블
// ------------------------------------------------------------------

function HistoryTable({ history }: { history: RatingHistoryEntry[] }) {
  if (history.length === 0) {
    return (
      <p className="text-center text-text-secondary text-tile-sm py-8">
        레이팅 변화 기록이 없습니다.
      </p>
    );
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-tile-sm" aria-label="레이팅 변화 히스토리">
        <thead>
          <tr className="border-b border-border text-tile-xs text-text-secondary uppercase tracking-wider">
            <th scope="col" className="py-2 pl-0 pr-3 text-left">
              날짜
            </th>
            <th scope="col" className="py-2 px-3 text-right">
              이전
            </th>
            <th scope="col" className="py-2 px-3 text-right">
              이후
            </th>
            <th scope="col" className="py-2 px-3 text-right">
              변화
            </th>
          </tr>
        </thead>
        <tbody>
          {history.map((h) => (
            <tr
              key={h.id}
              className="border-b border-border/50 hover:bg-card-bg/50 transition-colors"
            >
              <td className="py-2 pl-0 pr-3 text-text-secondary">
                {new Date(h.createdAt).toLocaleDateString("ko-KR", {
                  month: "2-digit",
                  day: "2-digit",
                })}
              </td>
              <td className="py-2 px-3 text-right font-mono text-text-secondary">
                {h.ratingBefore}
              </td>
              <td className="py-2 px-3 text-right font-mono text-text-primary">
                {h.ratingAfter}
              </td>
              <td
                className={[
                  "py-2 px-3 text-right font-mono font-semibold",
                  h.ratingDelta >= 0 ? "text-success" : "text-danger",
                ].join(" ")}
              >
                {h.ratingDelta >= 0 ? "+" : ""}
                {h.ratingDelta}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ------------------------------------------------------------------
// 메인 UserRatingClient
// ------------------------------------------------------------------

interface UserRatingClientProps {
  userId: string;
}

export default function UserRatingClient({ userId }: UserRatingClientProps) {
  const { data: session } = useSession();
  const router = useRouter();

  const [rating, setRating] = useState<UserRating | null>(null);
  const [history, setHistory] = useState<RatingHistoryEntry[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  const isMe =
    (session?.user as { id?: string } | undefined)?.id === userId;

  useEffect(() => {
    const token = (session as { accessToken?: string } | null)?.accessToken;

    const load = async () => {
      setIsLoading(true);
      try {
        const [ratingData, historyData] = await Promise.all([
          getUserRating(userId),
          getRatingHistory(userId, token),
        ]);
        setRating(ratingData);
        setHistory(historyData.data);
      } finally {
        setIsLoading(false);
      }
    };

    void load();
  }, [userId, session]);

  const shortId = userId.slice(0, 8);

  return (
    <main
      className="min-h-screen bg-app-bg text-text-primary"
      aria-label={`${shortId} ELO 프로필`}
    >
      {/* 헤더 */}
      <header className="border-b border-border bg-panel-bg px-6 py-3 h-12 flex items-center">
        <div className="max-w-3xl w-full mx-auto flex items-center gap-3">
          <button
            type="button"
            onClick={() => router.push("/rankings")}
            className="text-text-secondary hover:text-text-primary transition-colors"
            aria-label="랭킹 목록으로 돌아가기"
          >
            &larr;
          </button>
          <h1 className="text-tile-lg font-bold">
            Rummi<span className="text-warning">Arena</span>
            <span className="text-text-secondary font-normal text-tile-sm ml-2">
              플레이어 프로필
            </span>
          </h1>
        </div>
      </header>

      <div className="max-w-3xl mx-auto px-4 py-6">
        {isLoading ? (
          <div className="flex flex-col items-center justify-center py-24 gap-3">
            <motion.div
              animate={{ rotate: 360 }}
              transition={{ repeat: Infinity, duration: 1, ease: "linear" }}
              className="w-8 h-8 rounded-full border-2 border-warning border-t-transparent"
              aria-hidden="true"
            />
            <p className="text-text-secondary text-tile-sm">
              프로필 불러오는 중...
            </p>
          </div>
        ) : rating ? (
          <>
            {/* 프로필 헤더 카드 */}
            <motion.div
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              className="bg-card-bg rounded-xl border border-border p-5 mb-6"
            >
              {/* 아이디 + 배지 */}
              <div className="flex items-start justify-between mb-4">
                <div>
                  <div className="flex items-center gap-2 mb-1">
                    <p className="font-mono font-bold text-tile-lg text-text-primary">
                      {shortId}
                    </p>
                    {isMe && (
                      <span className="px-1.5 py-0.5 rounded text-tile-xs bg-warning/20 text-warning">
                        나
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-2">
                    <TierBadge tier={rating.tier} size="md" />
                    <span className="text-tile-sm text-text-secondary">
                      {rating.gamesPlayed}게임
                    </span>
                  </div>
                </div>

                {/* 메인 레이팅 */}
                <div className="text-right">
                  <p
                    className="text-tile-3xl font-bold"
                    style={{ color: TIER_COLOR[rating.tier] }}
                  >
                    {rating.rating.toLocaleString()}
                  </p>
                  <p className="text-tile-xs text-text-secondary">ELO 레이팅</p>
                </div>
              </div>

              {/* 티어 진행 바 */}
              <div>
                <div className="flex items-center justify-between text-tile-xs text-text-secondary mb-1.5">
                  <span>{TIER_LABEL[rating.tier]}</span>
                  <span>{rating.tierProgress}% 달성</span>
                </div>
                <div className="h-2 bg-panel-bg rounded-full overflow-hidden">
                  <motion.div
                    initial={{ width: 0 }}
                    animate={{ width: `${rating.tierProgress}%` }}
                    transition={{ duration: 0.8, ease: "easeOut" }}
                    className="h-full rounded-full"
                    style={{ backgroundColor: TIER_COLOR[rating.tier] }}
                    role="progressbar"
                    aria-valuenow={rating.tierProgress}
                    aria-valuemin={0}
                    aria-valuemax={100}
                    aria-label="티어 진행도"
                  />
                </div>
              </div>
            </motion.div>

            {/* 스탯 그리드 */}
            <motion.div
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.08 }}
              className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-6"
            >
              <StatCard
                label="최고 레이팅"
                value={rating.peakRating.toLocaleString()}
                accent
              />
              <StatCard
                label="최장 연승"
                value={`${rating.bestStreak}연승`}
                accent
              />
              <StatCard
                label="승률"
                value={`${rating.winRate.toFixed(1)}%`}
              />
              <StatCard
                label="승 / 패"
                value={`${rating.wins}W / ${rating.losses}L`}
              />
            </motion.div>

            {/* 레이팅 변화 차트 */}
            <motion.div
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.16 }}
              className="bg-card-bg rounded-xl border border-border p-5 mb-6"
            >
              <h2 className="text-tile-sm font-semibold text-text-secondary mb-4 uppercase tracking-wider">
                레이팅 변화 (최근 {history.length}게임)
              </h2>
              <RatingChart history={history} />
            </motion.div>

            {/* 히스토리 테이블 */}
            <motion.div
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.24 }}
              className="bg-card-bg rounded-xl border border-border p-5"
            >
              <h2 className="text-tile-sm font-semibold text-text-secondary mb-4 uppercase tracking-wider">
                게임별 레이팅 기록
              </h2>
              <HistoryTable history={history} />
            </motion.div>
          </>
        ) : (
          <div className="py-24 text-center text-text-secondary">
            <p className="text-tile-base mb-2">플레이어를 찾을 수 없습니다.</p>
            <button
              type="button"
              onClick={() => router.push("/rankings")}
              className="text-tile-sm text-warning hover:underline"
            >
              랭킹 목록으로
            </button>
          </div>
        )}
      </div>
    </main>
  );
}
