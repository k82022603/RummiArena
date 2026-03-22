/**
 * 게임 서버 JWT 토큰 유틸리티
 *
 * 우선순위:
 *   1. next-auth session.accessToken (Google OAuth / CredentialsProvider dev-login)
 *   2. localStorage 'auth_token' (next-auth 세션이 없는 경우 fallback)
 *
 * 이 파일은 클라이언트 전용 유틸리티이며 서버 컴포넌트에서 import 금지.
 */

const TOKEN_KEY = "auth_token";

/**
 * 게임 서버 JWT 반환.
 * sessionToken이 있으면 우선 사용하고, 없으면 localStorage에서 읽는다.
 */
export function getGameToken(sessionToken?: string | null): string | null {
  if (sessionToken) return sessionToken;
  if (typeof window === "undefined") return null;
  return localStorage.getItem(TOKEN_KEY);
}

/**
 * JWT를 localStorage에 저장 (dev-login 등 직접 발급 토큰 영속 보관).
 */
export function saveGameToken(token: string): void {
  if (typeof window === "undefined") return;
  localStorage.setItem(TOKEN_KEY, token);
}

/**
 * localStorage의 JWT 삭제 (로그아웃 시 호출).
 */
export function clearGameToken(): void {
  if (typeof window === "undefined") return;
  localStorage.removeItem(TOKEN_KEY);
}
