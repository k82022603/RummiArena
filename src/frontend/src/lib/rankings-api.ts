/**
 * ELO 랭킹 API 클라이언트
 *
 * game-server 엔드포인트:
 *   GET /api/rankings?limit=20&offset=0
 *   GET /api/rankings/tier/:tier
 *   GET /api/users/:id/rating
 *   GET /api/users/:id/rating/history  (인증 필요)
 */

import { apiFetch } from "./api";

// ------------------------------------------------------------------
// 티어 상수 및 색상
// ------------------------------------------------------------------

export type Tier =
  | "UNRANKED"
  | "BRONZE"
  | "SILVER"
  | "GOLD"
  | "PLATINUM"
  | "DIAMOND";

export const TIERS: Tier[] = [
  "UNRANKED",
  "BRONZE",
  "SILVER",
  "GOLD",
  "PLATINUM",
  "DIAMOND",
];

export const TIER_COLOR: Record<Tier, string> = {
  UNRANKED: "#9CA3AF",
  BRONZE: "#B45309",
  SILVER: "#6B7280",
  GOLD: "#D97706",
  PLATINUM: "#0EA5E9",
  DIAMOND: "#7C3AED",
};

export const TIER_LABEL: Record<Tier, string> = {
  UNRANKED: "언랭크",
  BRONZE: "브론즈",
  SILVER: "실버",
  GOLD: "골드",
  PLATINUM: "플래티넘",
  DIAMOND: "다이아몬드",
};

// ------------------------------------------------------------------
// 타입 정의
// ------------------------------------------------------------------

export interface RankingEntry {
  rank: number;
  userId: string;
  rating: number;
  tier: Tier;
  wins: number;
  losses: number;
  gamesPlayed: number;
  winRate: number;
  winStreak: number;
}

export interface RankingsResponse {
  data: RankingEntry[];
  pagination: {
    limit: number;
    offset: number;
    total: number;
  };
}

export interface UserRating {
  userId: string;
  rating: number;
  tier: Tier;
  tierProgress: number;
  wins: number;
  losses: number;
  gamesPlayed: number;
  winRate: number;
  winStreak: number;
  bestStreak: number;
  peakRating: number;
}

export interface RatingHistoryEntry {
  id: string;
  userId: string;
  gameId: string;
  ratingBefore: number;
  ratingAfter: number;
  ratingDelta: number;
  kFactor: number;
  createdAt: string;
}

export interface RatingHistoryResponse {
  data: RatingHistoryEntry[];
  total: number;
  userId: string;
}

// ------------------------------------------------------------------
// Rankings API
// ------------------------------------------------------------------

/** 전체 ELO 리더보드 조회 */
export async function getRankings(
  limit = 20,
  offset = 0
): Promise<RankingsResponse> {
  return apiFetch<RankingsResponse>(
    `/rankings?limit=${limit}&offset=${offset}`
  );
}

/** 특정 티어 리더보드 조회 */
export async function getRankingsByTier(
  tier: Tier,
  limit = 20,
  offset = 0
): Promise<RankingsResponse> {
  return apiFetch<RankingsResponse>(
    `/rankings/tier/${tier}?limit=${limit}&offset=${offset}`
  );
}

/** 특정 유저의 ELO 레이팅 조회 */
export async function getUserRating(userId: string): Promise<UserRating> {
  return apiFetch<UserRating>(`/users/${userId}/rating`);
}

/** 특정 유저의 레이팅 히스토리 조회 (인증 필요) */
export async function getRatingHistory(
  userId: string,
  token?: string
): Promise<RatingHistoryResponse> {
  return apiFetch<RatingHistoryResponse>(
    `/users/${userId}/rating/history`,
    { token }
  );
}
