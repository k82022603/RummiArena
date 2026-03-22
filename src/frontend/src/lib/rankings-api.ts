/**
 * ELO 랭킹 API 클라이언트
 *
 * game-server 엔드포인트:
 *   GET /api/rankings?limit=20&offset=0
 *   GET /api/rankings/tier/:tier
 *   GET /api/users/:id/rating
 *   GET /api/users/:id/rating/history  (인증 필요)
 *
 * API 호출 실패 시 mock 데이터로 fallback한다.
 */

const API_BASE =
  process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8080/api";

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
// Mock 데이터
// ------------------------------------------------------------------

const MOCK_RANKINGS: RankingEntry[] = [
  {
    rank: 1,
    userId: "user-alpha01",
    rating: 2341,
    tier: "DIAMOND",
    wins: 147,
    losses: 31,
    gamesPlayed: 178,
    winRate: 82.6,
    winStreak: 12,
  },
  {
    rank: 2,
    userId: "user-beta007",
    rating: 2187,
    tier: "DIAMOND",
    wins: 132,
    losses: 44,
    gamesPlayed: 176,
    winRate: 75.0,
    winStreak: 5,
  },
  {
    rank: 3,
    userId: "user-gamma42",
    rating: 1998,
    tier: "PLATINUM",
    wins: 98,
    losses: 42,
    gamesPlayed: 140,
    winRate: 70.0,
    winStreak: 3,
  },
  {
    rank: 4,
    userId: "user-delta99",
    rating: 1876,
    tier: "PLATINUM",
    wins: 85,
    losses: 51,
    gamesPlayed: 136,
    winRate: 62.5,
    winStreak: 0,
  },
  {
    rank: 5,
    userId: "user-echo001",
    rating: 1754,
    tier: "GOLD",
    wins: 71,
    losses: 49,
    gamesPlayed: 120,
    winRate: 59.2,
    winStreak: 2,
  },
  {
    rank: 6,
    userId: "user-foxtrot",
    rating: 1632,
    tier: "GOLD",
    wins: 63,
    losses: 57,
    gamesPlayed: 120,
    winRate: 52.5,
    winStreak: 1,
  },
  {
    rank: 7,
    userId: "user-golf007",
    rating: 1521,
    tier: "GOLD",
    wins: 55,
    losses: 65,
    gamesPlayed: 120,
    winRate: 45.8,
    winStreak: 0,
  },
  {
    rank: 8,
    userId: "user-hotel12",
    rating: 1389,
    tier: "SILVER",
    wins: 44,
    losses: 56,
    gamesPlayed: 100,
    winRate: 44.0,
    winStreak: 0,
  },
  {
    rank: 9,
    userId: "user-india89",
    rating: 1247,
    tier: "SILVER",
    wins: 38,
    losses: 52,
    gamesPlayed: 90,
    winRate: 42.2,
    winStreak: 3,
  },
  {
    rank: 10,
    userId: "user-juliet5",
    rating: 1198,
    tier: "SILVER",
    wins: 32,
    losses: 48,
    gamesPlayed: 80,
    winRate: 40.0,
    winStreak: 0,
  },
  {
    rank: 11,
    userId: "user-kilo001",
    rating: 1087,
    tier: "BRONZE",
    wins: 22,
    losses: 38,
    gamesPlayed: 60,
    winRate: 36.7,
    winStreak: 0,
  },
  {
    rank: 12,
    userId: "user-lima007",
    rating: 1043,
    tier: "BRONZE",
    wins: 18,
    losses: 32,
    gamesPlayed: 50,
    winRate: 36.0,
    winStreak: 1,
  },
  {
    rank: 13,
    userId: "user-mikex9",
    rating: 987,
    tier: "BRONZE",
    wins: 12,
    losses: 28,
    gamesPlayed: 40,
    winRate: 30.0,
    winStreak: 0,
  },
  {
    rank: 14,
    userId: "user-nova12",
    rating: 920,
    tier: "UNRANKED",
    wins: 6,
    losses: 14,
    gamesPlayed: 20,
    winRate: 30.0,
    winStreak: 0,
  },
  {
    rank: 15,
    userId: "user-oscar00",
    rating: 875,
    tier: "UNRANKED",
    wins: 3,
    losses: 7,
    gamesPlayed: 10,
    winRate: 30.0,
    winStreak: 0,
  },
];

const MOCK_USER_RATING: UserRating = {
  userId: "user-india89",
  rating: 1247,
  tier: "SILVER",
  tierProgress: 47,
  wins: 38,
  losses: 52,
  gamesPlayed: 90,
  winRate: 42.2,
  winStreak: 3,
  bestStreak: 7,
  peakRating: 1312,
};

function makeMockHistory(userId: string): RatingHistoryResponse {
  const data: RatingHistoryEntry[] = Array.from({ length: 20 }, (_, i) => {
    const delta = Math.floor(Math.random() * 50) - 20;
    const before = 1200 + i * 3 + Math.floor(Math.random() * 30);
    return {
      id: `hist-${i}`,
      userId,
      gameId: `game-${i + 1}`,
      ratingBefore: before,
      ratingAfter: before + delta,
      ratingDelta: delta,
      kFactor: 32,
      createdAt: new Date(
        Date.now() - (20 - i) * 3 * 24 * 60 * 60 * 1000
      ).toISOString(),
    };
  });
  return { data, total: 20, userId };
}

// ------------------------------------------------------------------
// 공통 fetch 래퍼
// ------------------------------------------------------------------

async function apiFetch<T>(
  path: string,
  options?: RequestInit & { token?: string }
): Promise<T> {
  const url = `${API_BASE}${path}`;

  const authHeader: Record<string, string> =
    options?.token ? { Authorization: `Bearer ${options.token}` } : {};

  const res = await fetch(url, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...authHeader,
      ...options?.headers,
    },
  });

  if (!res.ok) {
    throw new Error(`API 오류: ${res.status} ${res.statusText}`);
  }

  return res.json() as Promise<T>;
}

// ------------------------------------------------------------------
// Rankings API
// ------------------------------------------------------------------

/**
 * 전체 ELO 리더보드 조회 (20명씩 페이지네이션)
 * 실패 시 mock 데이터로 fallback
 */
export async function getRankings(
  limit = 20,
  offset = 0
): Promise<RankingsResponse> {
  try {
    return await apiFetch<RankingsResponse>(
      `/rankings?limit=${limit}&offset=${offset}`
    );
  } catch (err) {
    console.warn("[rankings-api] getRankings fallback to mock:", err);
    const slice = MOCK_RANKINGS.slice(offset, offset + limit);
    return {
      data: slice,
      pagination: { limit, offset, total: MOCK_RANKINGS.length },
    };
  }
}

/**
 * 특정 티어 리더보드 조회
 * 실패 시 mock 데이터로 fallback
 */
export async function getRankingsByTier(
  tier: Tier,
  limit = 20,
  offset = 0
): Promise<RankingsResponse> {
  try {
    return await apiFetch<RankingsResponse>(
      `/rankings/tier/${tier}?limit=${limit}&offset=${offset}`
    );
  } catch (err) {
    console.warn("[rankings-api] getRankingsByTier fallback to mock:", err);
    const filtered = MOCK_RANKINGS.filter((r) => r.tier === tier);
    const slice = filtered.slice(offset, offset + limit);
    return {
      data: slice,
      pagination: { limit, offset, total: filtered.length },
    };
  }
}

/**
 * 특정 유저의 ELO 레이팅 조회
 * 실패 시 mock 데이터로 fallback
 */
export async function getUserRating(userId: string): Promise<UserRating> {
  try {
    return await apiFetch<UserRating>(`/users/${userId}/rating`);
  } catch (err) {
    console.warn("[rankings-api] getUserRating fallback to mock:", err);
    return { ...MOCK_USER_RATING, userId };
  }
}

/**
 * 특정 유저의 레이팅 히스토리 조회 (인증 필요)
 * 실패 시 mock 데이터로 fallback
 */
export async function getRatingHistory(
  userId: string,
  token?: string
): Promise<RatingHistoryResponse> {
  try {
    return await apiFetch<RatingHistoryResponse>(
      `/users/${userId}/rating/history`,
      { token }
    );
  } catch (err) {
    console.warn("[rankings-api] getRatingHistory fallback to mock:", err);
    return makeMockHistory(userId);
  }
}
