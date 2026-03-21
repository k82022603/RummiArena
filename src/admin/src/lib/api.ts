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
  getMockRooms,
  type AdminGame,
  type AdminUser,
  type AiModelStats,
  type PersonaStats,
  type DifficultyStats,
  type DashboardSummary,
  type HealthStatus,
} from "./mock-data";

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
 * JWT 인증 없이 호출하며 실패 시 mock 데이터 반환.
 */
export async function fetchRooms(): Promise<AdminGame[]> {
  if (USE_MOCK) return getMockRooms();
  try {
    const res = await fetch(`${API_BASE}/api/rooms`, {
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
