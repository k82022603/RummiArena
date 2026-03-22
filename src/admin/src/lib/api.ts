/**
 * 관리자 대시보드 API 추상화 레이어
 *
 * NEXT_PUBLIC_USE_MOCK=true 이거나 NEXT_PUBLIC_API_URL 미설정 시 mock 데이터를 반환한다.
 * 그 외에는 실제 game-server REST API를 호출하고, 실패 시 mock fallback을 반환한다.
 */

import {
  MOCK_DASHBOARD,
  MOCK_GAMES,
  MOCK_USERS,
  MOCK_AI_MODEL_STATS,
  MOCK_PERSONA_STATS,
  MOCK_DIFFICULTY_STATS,
  MOCK_ELO_RANKINGS,
  MOCK_ELO_SUMMARY,
  TIER_COLORS,
  getMockRooms,
  getMockEloTierDistribution,
  type AdminGame,
  type AdminUser,
  type AiModelStats,
  type PersonaStats,
  type DifficultyStats,
  type DashboardSummary,
  type HealthStatus,
  type EloTier,
  type EloRankingsResponse,
  type EloSummary,
  type EloTierDistribution,
} from "./mock-data";
import { getAdminToken } from "./auth";

// ------------------------------------------------------------------
// 설정
// ------------------------------------------------------------------

const API_BASE = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8080";

/**
 * mock 모드 활성화 조건:
 * - NEXT_PUBLIC_USE_MOCK=true 이거나
 * - NEXT_PUBLIC_API_URL 환경변수가 없을 때
 */
const USE_MOCK =
  process.env.NEXT_PUBLIC_USE_MOCK === "true" ||
  !process.env.NEXT_PUBLIC_API_URL;

// ------------------------------------------------------------------
// 내부 헬퍼
// ------------------------------------------------------------------

async function fetchApi<T>(path: string, fallback: T): Promise<T> {
  if (USE_MOCK) return fallback;
  try {
    const res = await fetch(`${API_BASE}${path}`, {
      headers: { "Content-Type": "application/json" },
      next: { revalidate: 10 },
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return res.json() as Promise<T>;
  } catch {
    console.warn(`[admin/api] fetch failed for ${path}, falling back to mock`);
    return fallback;
  }
}

// ------------------------------------------------------------------
// 헬스체크
// ------------------------------------------------------------------

/**
 * game-server 헬스 상태를 반환한다.
 * API 호출 실패 시 { status: 'unreachable' }를 반환한다.
 */
export async function fetchHealth(): Promise<HealthStatus> {
  if (USE_MOCK) {
    return { status: "ok", uptime: 0, version: "mock" };
  }
  try {
    const res = await fetch(`${API_BASE}/health`, {
      next: { revalidate: 5 },
    });
    if (!res.ok) return { status: "degraded" };
    return (await res.json()) as HealthStatus;
  } catch {
    return { status: "unreachable" };
  }
}

// ------------------------------------------------------------------
// 활성 방 목록 (game-server /api/rooms)
// ------------------------------------------------------------------

/**
 * game-server에서 활성 방 목록을 가져온다.
 * Authorization: Bearer 토큰을 포함하여 호출하며 실패 시 mock 데이터 반환.
 */
export async function fetchRooms(): Promise<AdminGame[]> {
  if (USE_MOCK) return getMockRooms();
  try {
    const token = await getAdminToken();
    const headers: Record<string, string> = {};
    if (token) {
      headers["Authorization"] = `Bearer ${token}`;
    }
    const res = await fetch(`${API_BASE}/api/rooms`, {
      headers,
      next: { revalidate: 10 },
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return (await res.json()) as AdminGame[];
  } catch {
    console.warn("[admin/api] fetchRooms failed, falling back to mock");
    return getMockRooms();
  }
}

// ------------------------------------------------------------------
// 관리자 전용 엔드포인트 (admin API 구현 전 mock 사용)
// ------------------------------------------------------------------

export async function getDashboard(): Promise<DashboardSummary> {
  return fetchApi("/admin/dashboard", MOCK_DASHBOARD);
}

export async function getGames(): Promise<AdminGame[]> {
  return fetchApi("/admin/games", MOCK_GAMES);
}

export async function getGame(id: string): Promise<AdminGame | null> {
  const found = MOCK_GAMES.find((g) => g.id === id) ?? null;
  return fetchApi(`/admin/games/${id}`, found);
}

export async function getUsers(): Promise<AdminUser[]> {
  return fetchApi("/admin/users", MOCK_USERS);
}

export async function getAiModelStats(): Promise<AiModelStats[]> {
  return fetchApi("/admin/stats/ai-models", MOCK_AI_MODEL_STATS);
}

export async function getPersonaStats(): Promise<PersonaStats[]> {
  return fetchApi("/admin/stats/personas", MOCK_PERSONA_STATS);
}

export async function getDifficultyStats(): Promise<DifficultyStats[]> {
  return fetchApi("/admin/stats/difficulty", MOCK_DIFFICULTY_STATS);
}

// ------------------------------------------------------------------
// ELO 랭킹 API
// ------------------------------------------------------------------

/**
 * 전체 ELO 리더보드를 가져온다.
 * tier 인자가 주어지면 /api/rankings/tier/:tier 를 호출한다.
 */
export async function getEloRankings(
  limit = 20,
  offset = 0,
  tier?: EloTier,
): Promise<EloRankingsResponse> {
  const mockRankings = tier
    ? MOCK_ELO_RANKINGS.filter((r) => r.tier === tier)
    : MOCK_ELO_RANKINGS;

  const mockResponse: EloRankingsResponse = {
    rankings: mockRankings.slice(offset, offset + limit),
    total: mockRankings.length,
    limit,
    offset,
  };

  if (USE_MOCK) return mockResponse;

  try {
    const token = await getAdminToken();
    const headers: Record<string, string> = { "Content-Type": "application/json" };
    if (token) headers["Authorization"] = `Bearer ${token}`;

    const endpoint = tier
      ? `${API_BASE}/api/rankings/tier/${tier}?limit=${limit}&offset=${offset}`
      : `${API_BASE}/api/rankings?limit=${limit}&offset=${offset}`;

    const res = await fetch(endpoint, { headers, next: { revalidate: 30 } });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return res.json() as Promise<EloRankingsResponse>;
  } catch {
    console.warn("[admin/api] getEloRankings failed, falling back to mock");
    return mockResponse;
  }
}

/**
 * ELO 요약 통계 (총 랭크 유저, 최고/평균 레이팅)
 */
export async function getEloSummary(): Promise<EloSummary> {
  if (USE_MOCK) return MOCK_ELO_SUMMARY;
  try {
    const token = await getAdminToken();
    const headers: Record<string, string> = { "Content-Type": "application/json" };
    if (token) headers["Authorization"] = `Bearer ${token}`;

    // game-server가 별도 summary 엔드포인트를 제공하기 전까지 rankings에서 계산
    const res = await fetch(`${API_BASE}/api/rankings?limit=100&offset=0`, {
      headers,
      next: { revalidate: 60 },
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = (await res.json()) as EloRankingsResponse;
    const ranked = data.rankings.filter((r) => r.tier !== "UNRANKED");
    return {
      totalRankedUsers: ranked.length,
      topRating: ranked.length > 0 ? Math.max(...ranked.map((r) => r.rating)) : 0,
      avgRating:
        ranked.length > 0
          ? Math.round(ranked.reduce((s, r) => s + r.rating, 0) / ranked.length)
          : 0,
    };
  } catch {
    console.warn("[admin/api] getEloSummary failed, falling back to mock");
    return MOCK_ELO_SUMMARY;
  }
}

/**
 * 티어별 인원 분포 (파이 차트용)
 */
export async function getEloTierDistribution(): Promise<EloTierDistribution[]> {
  if (USE_MOCK) return getMockEloTierDistribution();
  try {
    const token = await getAdminToken();
    const headers: Record<string, string> = { "Content-Type": "application/json" };
    if (token) headers["Authorization"] = `Bearer ${token}`;

    const res = await fetch(`${API_BASE}/api/rankings?limit=200&offset=0`, {
      headers,
      next: { revalidate: 60 },
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const { rankings } = (await res.json()) as EloRankingsResponse;

    // 서버 응답 데이터로 티어별 집계
    const countByTier: Partial<Record<EloTier, number>> = {};
    for (const r of rankings) {
      countByTier[r.tier] = (countByTier[r.tier] ?? 0) + 1;
    }
    const TIER_ORDER: EloTier[] = ["UNRANKED", "BRONZE", "SILVER", "GOLD", "PLATINUM", "DIAMOND"];
    return TIER_ORDER
      .filter((t) => (countByTier[t] ?? 0) > 0)
      .map((t) => ({ tier: t, count: countByTier[t] ?? 0, color: TIER_COLORS[t] }));
  } catch {
    console.warn("[admin/api] getEloTierDistribution failed, falling back to mock");
    return getMockEloTierDistribution();
  }
}
