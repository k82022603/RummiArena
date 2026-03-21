/**
 * 관리자 대시보드 API 추상화 레이어
 * NEXT_PUBLIC_API_URL이 설정되면 실제 백엔드로 요청하고,
 * 미설정 시 mock 데이터를 반환한다.
 */

import {
  MOCK_DASHBOARD,
  MOCK_GAMES,
  MOCK_USERS,
  MOCK_AI_MODEL_STATS,
  MOCK_PERSONA_STATS,
  MOCK_DIFFICULTY_STATS,
  type AdminGame,
  type AdminUser,
  type AiModelStats,
  type PersonaStats,
  type DifficultyStats,
  type DashboardSummary,
} from "./mock-data";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "";

const isMock = !API_URL;

async function fetchApi<T>(path: string, fallback: T): Promise<T> {
  if (isMock) return fallback;
  try {
    const res = await fetch(`${API_URL}${path}`, {
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
