/**
 * game-server REST API 클라이언트
 *
 * API 호출 실패 시 mock-data로 fallback한다.
 * NEXT_PUBLIC_API_URL 환경변수로 엔드포인트를 설정한다.
 */

import type { Room } from "@/types/game";
import {
  MOCK_ROOMS,
  createMockRoom,
} from "./mock-data";

const API_BASE =
  process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8080/api";

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
  options?: RequestInit
): Promise<T> {
  const url = `${API_BASE}${path}`;

  const res = await fetch(url, {
    headers: {
      "Content-Type": "application/json",
      ...options?.headers,
    },
    ...options,
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

/**
 * Room 생성
 * 실패 시 mock 데이터로 fallback (개발/데모 환경)
 */
export async function createRoom(params: CreateRoomParams): Promise<Room> {
  try {
    return await apiFetch<Room>("/rooms", {
      method: "POST",
      body: JSON.stringify(params),
    });
  } catch (err) {
    console.warn("[api] createRoom fallback to mock:", err);
    return createMockRoom({
      playerCount: params.playerCount,
      turnTimeoutSec: params.turnTimeoutSec,
    });
  }
}

/**
 * Room 목록 조회
 * 실패 시 mock 데이터로 fallback
 */
export async function getRooms(): Promise<Room[]> {
  try {
    return await apiFetch<Room[]>("/rooms");
  } catch (err) {
    console.warn("[api] getRooms fallback to mock:", err);
    return MOCK_ROOMS;
  }
}

/**
 * Room 상세 조회
 * 실패 시 mock 데이터에서 찾아 반환
 */
export async function getRoom(roomId: string): Promise<Room> {
  try {
    return await apiFetch<Room>(`/rooms/${roomId}`);
  } catch (err) {
    console.warn("[api] getRoom fallback to mock:", err);
    const found =
      MOCK_ROOMS.find((r) => r.id === roomId || r.roomCode === roomId);
    if (found) return found;
    throw new Error("방을 찾을 수 없습니다.");
  }
}

/**
 * Room 참가
 * 실패 시 mock room 반환
 */
export async function joinRoom(roomId: string): Promise<Room> {
  try {
    return await apiFetch<Room>(`/rooms/${roomId}/join`, {
      method: "POST",
    });
  } catch (err) {
    console.warn("[api] joinRoom fallback to mock:", err);
    const found =
      MOCK_ROOMS.find((r) => r.id === roomId || r.roomCode === roomId);
    if (found) return found;
    throw new Error("방 참가에 실패했습니다.");
  }
}

/**
 * Room 퇴장
 */
export async function leaveRoom(roomId: string): Promise<void> {
  try {
    await apiFetch<void>(`/rooms/${roomId}/leave`, { method: "POST" });
  } catch (err) {
    console.warn("[api] leaveRoom error (ignored):", err);
  }
}

/**
 * 게임 시작
 * 실패 시 그냥 넘어가 게임 페이지로 이동하도록 한다.
 */
export async function startGame(roomId: string): Promise<{ id: string }> {
  try {
    return await apiFetch<{ id: string }>(`/rooms/${roomId}/start`, {
      method: "POST",
    });
  } catch (err) {
    console.warn("[api] startGame fallback to mock:", err);
    // 게임 서버가 없을 때도 UI 흐름을 계속할 수 있게 roomId를 그대로 반환
    return { id: roomId };
  }
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

export async function getMyProfile(): Promise<MyProfile> {
  try {
    return await apiFetch<MyProfile>("/auth/me");
  } catch (err) {
    console.warn("[api] getMyProfile fallback to mock:", err);
    return {
      id: "user-me",
      email: "user@example.com",
      displayName: "애벌레",
      role: "ROLE_USER",
      eloRating: 1247,
      totalGames: 142,
      wins: 77,
      winRate: 54.2,
    };
  }
}
