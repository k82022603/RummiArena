/**
 * 관리자 대시보드 API 클라이언트
 *
 * game-server REST API를 직접 호출한다.
 * NEXT_PUBLIC_API_URL 기본값은 "" (same-origin).
 */

import { getAdminToken } from "./auth";
import type {
  AdminGame,
  AdminUser,
  AiModelStats,
  PersonaStats,
  DifficultyStats,
  DashboardSummary,
  HealthStatus,
  EloTier,
  EloRankingsResponse,
  EloSummary,
  EloTierDistribution,
  TournamentSummary,
  TournamentFilterState,
} from "./types";
import { EMPTY_TOURNAMENT } from "./types";

export type {
  AdminGame,
  AdminUser,
  AiModelStats,
  PersonaStats,
  DifficultyStats,
  DashboardSummary,
  HealthStatus,
  EloTier,
  EloRankingsResponse,
  EloSummary,
  EloTierDistribution,
  TournamentSummary,
  TournamentRoundEntry,
  TournamentFilterState,
  ModelLatestStats,
  CostEfficiencyEntry,
  ModelType,
  PromptVersion,
  TournamentStatus,
  ModelGrade,
} from "./types";

export type {
  GameStatus,
  PlayerType,
  Difficulty,
  Persona,
  AdminPlayer,
  ActionLog,
  EloRankingEntry,
} from "./types";

// ------------------------------------------------------------------
// 설정
// ------------------------------------------------------------------

const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? "";

// ------------------------------------------------------------------
// 티어 색상 (EloRankingPanel 등에서 사용)
// ------------------------------------------------------------------

export const TIER_COLORS: Record<EloTier, string> = {
  UNRANKED: "#9CA3AF",
  BRONZE:   "#B45309",
  SILVER:   "#6B7280",
  GOLD:     "#D97706",
  PLATINUM: "#0EA5E9",
  DIAMOND:  "#7C3AED",
};

// ------------------------------------------------------------------
// 내부 헬퍼
// ------------------------------------------------------------------

async function fetchApi<T>(path: string, fallback?: T): Promise<T> {
  try {
    const res = await fetch(`${API_BASE}${path}`, {
      headers: { "Content-Type": "application/json" },
      next: { revalidate: 10 },
    });
    if (!res.ok) {
      if (fallback !== undefined) return fallback;
      throw new Error(`HTTP ${res.status}: ${path}`);
    }
    return res.json() as Promise<T>;
  } catch (err) {
    if (fallback !== undefined) return fallback;
    throw err;
  }
}

async function fetchApiWithAuth<T>(path: string, options?: { revalidate?: number }): Promise<T> {
  const token = await getAdminToken();
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (token) headers["Authorization"] = `Bearer ${token}`;

  const res = await fetch(`${API_BASE}${path}`, {
    headers,
    next: { revalidate: options?.revalidate ?? 10 },
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}: ${path}`);
  return res.json() as Promise<T>;
}

// ------------------------------------------------------------------
// 헬스체크
// ------------------------------------------------------------------

/**
 * game-server 헬스 상태를 반환한다.
 * API 호출 실패 시 { status: 'unreachable' }를 반환한다.
 */
export async function fetchHealth(): Promise<HealthStatus> {
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
 * Authorization: Bearer 토큰을 포함하여 호출한다.
 */
export async function fetchRooms(): Promise<AdminGame[]> {
  try {
    return await fetchApiWithAuth<AdminGame[]>("/api/rooms");
  } catch {
    return [];
  }
}

// ------------------------------------------------------------------
// 관리자 전용 엔드포인트
// ------------------------------------------------------------------

const EMPTY_DASHBOARD: DashboardSummary = {
  activeGames: 0,
  onlineUsers: 0,
  todayFinishedGames: 0,
  aiVsHumanRatio: { ai: 0, human: 100 },
};

export async function getDashboard(): Promise<DashboardSummary> {
  return fetchApi<DashboardSummary>("/admin/dashboard", EMPTY_DASHBOARD);
}

export async function getGames(): Promise<AdminGame[]> {
  return fetchApi<AdminGame[]>("/admin/games", []);
}

export async function getGame(id: string): Promise<AdminGame | null> {
  return fetchApi<AdminGame | null>(`/admin/games/${id}`, null);
}

export async function getUsers(): Promise<AdminUser[]> {
  return fetchApi<AdminUser[]>("/admin/users", []);
}

export async function getAiModelStats(): Promise<AiModelStats[]> {
  return fetchApi<AiModelStats[]>("/admin/stats/ai-models", []);
}

export async function getPersonaStats(): Promise<PersonaStats[]> {
  return fetchApi<PersonaStats[]>("/admin/stats/personas", []);
}

export async function getDifficultyStats(): Promise<DifficultyStats[]> {
  return fetchApi<DifficultyStats[]>("/admin/stats/difficulty", []);
}

// ------------------------------------------------------------------
// ELO 랭킹 API
// ------------------------------------------------------------------

/**
 * 전체 ELO 리더보드를 가져온다.
 * tier 인자가 주어지면 /api/rankings/tier/:tier 를 호출한다.
 */
const EMPTY_RANKINGS: EloRankingsResponse = { rankings: [], total: 0, limit: 20, offset: 0 };

async function fetchApiWithAuthSafe<T>(path: string, fallback: T, options?: { revalidate?: number }): Promise<T> {
  try {
    return await fetchApiWithAuth<T>(path, options);
  } catch {
    return fallback;
  }
}

export async function getEloRankings(
  limit = 20,
  offset = 0,
  tier?: EloTier,
): Promise<EloRankingsResponse> {
  const endpoint = tier
    ? `/api/rankings/tier/${tier}?limit=${limit}&offset=${offset}`
    : `/api/rankings?limit=${limit}&offset=${offset}`;
  return fetchApiWithAuthSafe<EloRankingsResponse>(endpoint, EMPTY_RANKINGS, { revalidate: 30 });
}

/**
 * ELO 요약 통계 (총 랭크 유저, 최고/평균 레이팅)
 * game-server가 별도 summary 엔드포인트를 제공하기 전까지 rankings에서 계산한다.
 */
export async function getEloSummary(): Promise<EloSummary> {
  const data = await fetchApiWithAuthSafe<EloRankingsResponse>(
    "/api/rankings?limit=100&offset=0",
    EMPTY_RANKINGS,
    { revalidate: 60 },
  );
  const ranked = data.rankings.filter((r) => r.tier !== "UNRANKED");
  return {
    totalRankedUsers: ranked.length,
    topRating: ranked.length > 0 ? Math.max(...ranked.map((r) => r.rating)) : 0,
    avgRating:
      ranked.length > 0
        ? Math.round(ranked.reduce((s, r) => s + r.rating, 0) / ranked.length)
        : 0,
  };
}

// ------------------------------------------------------------------
// AI 토너먼트 대시보드 API
// ------------------------------------------------------------------
//
// 스펙: docs/02-design/33-ai-tournament-dashboard-component-spec.md §6
// Sprint 6 W1 — 옵션 B 선행 구현. game-server는 정적 JSON 프록시로 응답.
// 쿼리 파라미터는 현재 서버 사이드에서 무시되며, Sprint 6 W2에서 DB 집계
// 교체와 함께 서버 사이드 필터링이 구현된다. 그때까지는 클라이언트가
// useMemo로 필터링한다 (스펙 4.1 TournamentPageClient).

/**
 * AI 토너먼트 대시보드 요약을 가져온다.
 *
 * @param filter 선택적 필터. 현재 옵션 B에서는 **서버 사이드에서 무시**되지만,
 *               Sprint 6 W2 DB 집계 교체 시 자동으로 활성화되도록 쿼리 문자열을
 *               미리 구성한다. 호출자는 클라이언트 사이드에서 useMemo로
 *               필터링한다.
 * @returns 토너먼트 요약. API 실패 시 `EMPTY_TOURNAMENT` fallback.
 */
export async function getTournamentSummary(
  filter?: Partial<TournamentFilterState>,
): Promise<TournamentSummary> {
  const params = new URLSearchParams();
  if (filter?.selectedModels?.length) {
    params.set("models", filter.selectedModels.join(","));
  }
  if (filter?.roundRange) {
    params.set("rounds", `${filter.roundRange[0]}-${filter.roundRange[1]}`);
  }
  if (filter?.promptVersion && filter.promptVersion !== "all") {
    params.set("prompt", filter.promptVersion);
  }
  const qs = params.toString();
  const path = `/admin/stats/ai/tournament${qs ? `?${qs}` : ""}`;
  return fetchApi<TournamentSummary>(path, EMPTY_TOURNAMENT);
}

/**
 * 티어별 인원 분포 (파이 차트용)
 */
export async function getEloTierDistribution(): Promise<EloTierDistribution[]> {
  const { rankings } = await fetchApiWithAuthSafe<EloRankingsResponse>(
    "/api/rankings?limit=200&offset=0",
    EMPTY_RANKINGS,
    { revalidate: 60 },
  );

  const countByTier: Partial<Record<EloTier, number>> = {};
  for (const r of rankings) {
    countByTier[r.tier] = (countByTier[r.tier] ?? 0) + 1;
  }
  const TIER_ORDER: EloTier[] = ["UNRANKED", "BRONZE", "SILVER", "GOLD", "PLATINUM", "DIAMOND"];
  return TIER_ORDER
    .filter((t) => (countByTier[t] ?? 0) > 0)
    .map((t) => ({ tier: t, count: countByTier[t] ?? 0, color: TIER_COLORS[t] }));
}
