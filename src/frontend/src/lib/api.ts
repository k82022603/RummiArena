/**
 * game-server REST API 클라이언트
 *
 * NEXT_PUBLIC_API_URL 환경변수로 엔드포인트를 설정한다.
 * 예: http://localhost:8080/api
 */

import type { Room } from "@/types/game";
import { useRateLimitStore } from "@/store/rateLimitStore";

const API_BASE = "/api";

/** 429 자동 재시도 최대 횟수 */
const MAX_RATE_LIMIT_RETRIES = 2;

/** Retry-After 헤더가 없을 때 기본 대기 시간(초) */
const DEFAULT_RETRY_AFTER_SEC = 5;

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

/**
 * Retry-After 헤더 파싱
 * - 정수 → 초 단위
 * - HTTP-date → Date까지 남은 초 계산
 * - 없거나 파싱 실패 → DEFAULT_RETRY_AFTER_SEC
 */
function parseRetryAfter(res: Response): number {
  const raw = res.headers.get("Retry-After");
  if (!raw) return DEFAULT_RETRY_AFTER_SEC;

  const asNumber = Number(raw);
  if (!Number.isNaN(asNumber) && asNumber > 0) {
    return Math.ceil(asNumber);
  }

  // HTTP-date 형식 시도
  const date = new Date(raw);
  if (!Number.isNaN(date.getTime())) {
    const diffSec = Math.ceil((date.getTime() - Date.now()) / 1000);
    return diffSec > 0 ? diffSec : DEFAULT_RETRY_AFTER_SEC;
  }

  return DEFAULT_RETRY_AFTER_SEC;
}

/** Rate Limit 토스트 + 쿨다운 시작 (Zustand store 직접 접근) */
function showRateLimitToast(retrySec: number): void {
  const store = useRateLimitStore.getState();
  store.setMessage(`요청이 너무 빨랐습니다. ${retrySec}초 후 다시 시도합니다.`);
  store.startCooldown(retrySec);
}

export async function apiFetch<T>(
  path: string,
  options?: RequestInit & { token?: string },
  _retryCount = 0,
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

  // ---- 403 Forbidden 처리 (비즈니스 차단: AI_COOLDOWN, COST_LIMIT) ----
  if (res.status === 403) {
    let errorCode = "";
    let errorMessage = "";
    try {
      const body = await res.clone().json();
      // 표준 형식: {error: {code, message}} (ServiceError / ExceptionFilter)
      if (body?.error && typeof body.error === "object") {
        errorCode = body.error.code ?? "";
        errorMessage = body.error.message ?? "";
      } else {
        // 레거시 flat 형식: {code, error, message}
        errorCode = body?.code ?? body?.error ?? "";
        errorMessage = body?.message ?? "";
      }
    } catch {
      /* JSON 파싱 실패 무시 */
    }

    if (errorCode === "AI_COOLDOWN") {
      const store = useRateLimitStore.getState();
      store.setMessage(errorMessage || "AI 게임은 5분에 1회만 생성할 수 있습니다.");
      store.startCooldown(300);
      throw new Error(errorMessage || "AI 게임은 5분에 1회만 생성할 수 있습니다.");
    }

    if (errorCode === "COST_LIMIT" || errorCode === "Daily Cost Limit Exceeded") {
      throw new Error(errorMessage || "일일 LLM API 비용 한도를 초과했습니다.");
    }

    // 기타 403은 일반 에러로 처리
    throw new Error(errorMessage || "접근이 거부되었습니다.");
  }

  // ---- 429 Too Many Requests 처리 ----
  if (res.status === 429) {
    let errorMessage = "";
    try {
      const body = await res.clone().json();
      // 표준 형식: {error: {code, message}} (ServiceError / ExceptionFilter)
      if (body?.error && typeof body.error === "object") {
        errorMessage = body.error.message ?? "";
      } else {
        // 레거시 flat 형식: {code, error, message}
        errorMessage = body?.message ?? "";
      }
    } catch {
      // JSON 파싱 실패 시 기본 Rate Limit 처리
    }

    // 일반 Rate Limit 처리
    const retrySec = parseRetryAfter(res);
    showRateLimitToast(retrySec);

    if (_retryCount < MAX_RATE_LIMIT_RETRIES) {
      useRateLimitStore.getState().setIsRetrying(true);
      await new Promise((resolve) => setTimeout(resolve, retrySec * 1000));
      const result = await apiFetch<T>(path, options, _retryCount + 1);
      useRateLimitStore.getState().setIsRetrying(false);
      return result;
    }

    useRateLimitStore.getState().setIsRetrying(false);
    throw new Error(
      errorMessage || `요청이 너무 많습니다. ${retrySec}초 후에 다시 시도해주세요.`
    );
  }

  if (!res.ok) {
    const ERROR_MESSAGES: Record<number, string> = {
      400: "잘못된 요청입니다.",
      401: "로그인이 필요합니다.",
      404: "요청한 리소스를 찾을 수 없습니다.",
      500: "서버 오류가 발생했습니다. 잠시 후 다시 시도해주세요.",
      503: "서버가 일시적으로 사용할 수 없습니다.",
    };

    let errorBody: ApiError | undefined;
    try {
      errorBody = (await res.json()) as ApiError;
    } catch {
      // JSON 파싱 실패 무시
    }
    throw new Error(
      errorBody?.error?.message ?? ERROR_MESSAGES[res.status] ?? `서버 요청에 실패했습니다. (${res.status})`
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
