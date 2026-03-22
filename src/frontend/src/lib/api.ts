/**
 * game-server REST API 클라이언트
 *
 * NEXT_PUBLIC_API_URL 환경변수로 엔드포인트를 설정한다.
 * 예: http://localhost:8080/api
 */

import type { Room } from "@/types/game";

const API_BASE = "/api";

// ------------------------------------------------------------------
// 공통 fetch 래퍼
// ------------------------------------------------------------------

interface ApiError {
  error: {
    code: string;
    message: string;
    details?: Record<string, unknown>;
  };
}

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
    let errorBody: ApiError | undefined;
    try {
      errorBody = (await res.json()) as ApiError;
    } catch {
      // JSON 파싱 실패 무시
    }
    throw new Error(
      errorBody?.error?.message ?? `API 오류: ${res.status} ${res.statusText}`
    );
  }

  return res.json() as Promise<T>;
}

// ------------------------------------------------------------------
// Room API
// ------------------------------------------------------------------

export interface CreateRoomParams {
  playerCount: 2 | 3 | 4;
  turnTimeoutSec: number;
  aiPlayers: Array<{
    type: string;
    persona: string;
    difficulty: string;
    psychologyLevel: number;
  }>;
}

/** Room 생성 */
export async function createRoom(
  params: CreateRoomParams & { displayName?: string },
  token?: string,
): Promise<Room> {
  return apiFetch<Room>("/rooms", {
    method: "POST",
    body: JSON.stringify(params),
    token,
  });
}

/** Room 목록 조회 */
export async function getRooms(token?: string): Promise<Room[]> {
  const res = await apiFetch<{ rooms: Room[]; total: number }>("/rooms", { token });
  return res.rooms ?? [];
}

/** Room 상세 조회 */
export async function getRoom(roomId: string, token?: string): Promise<Room> {
  return apiFetch<Room>(`/rooms/${roomId}`, { token });
}

/** Room 참가 */
export async function joinRoom(
  roomId: string,
  token?: string,
  displayName?: string,
): Promise<Room> {
  return apiFetch<Room>(`/rooms/${roomId}/join`, {
    method: "POST",
    body: JSON.stringify({ displayName }),
    token,
  });
}

/** Room 퇴장 */
export async function leaveRoom(roomId: string, token?: string): Promise<void> {
  await apiFetch<void>(`/rooms/${roomId}/leave`, { method: "POST", token });
}

/** 게임 시작 */
export async function startGame(
  roomId: string,
  token?: string,
): Promise<{ id: string }> {
  return apiFetch<{ id: string }>(`/rooms/${roomId}/start`, {
    method: "POST",
    token,
  });
}

// ------------------------------------------------------------------
// 내 프로필 API
// ------------------------------------------------------------------

export interface MyProfile {
  id: string;
  email: string;
  displayName: string;
  avatarUrl?: string;
  role: "ROLE_USER" | "ROLE_ADMIN";
  eloRating: number;
  totalGames?: number;
  wins?: number;
  winRate?: number;
}

export async function getMyProfile(token?: string): Promise<MyProfile> {
  return apiFetch<MyProfile>("/auth/me", { token });
}
