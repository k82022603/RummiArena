/**
 * Room Cleanup Utility for Playwright E2E Tests
 *
 * 이전 테스트에서 남은 활성 게임 방을 정리한다.
 * "이미 게임 중인 방이 있습니다" (409 ALREADY_IN_ROOM) 오류 방지.
 *
 * 전략:
 * 1. GET /api/rooms 로 활성 방 목록 조회
 * 2. 테스트 사용자가 참가 중인 방을 찾아 POST /api/rooms/:id/leave 호출
 * 3. leave 실패 시 DELETE /api/rooms/:id 시도 (방장인 경우)
 */

import type { Page } from "@playwright/test";

const GAME_SERVER_URL = process.env.GAME_SERVER_URL ?? "http://localhost:30080";

/**
 * 브라우저 컨텍스트에서 활성 게임 방을 정리한다.
 * page가 이미 로그인 세션(storageState)을 갖고 있어야 한다.
 *
 * Next.js 프록시를 통하지 않고 game-server에 직접 요청한다.
 * 단, JWT 토큰이 필요하므로 먼저 세션에서 토큰을 추출한다.
 */
export async function cleanupActiveRooms(page: Page): Promise<void> {
  try {
    // 1. Next.js 세션에서 accessToken 추출
    const token = await extractAccessToken(page);
    if (!token) {
      console.log("[room-cleanup] No access token found, skipping cleanup");
      return;
    }

    // 2. 활성 방 목록 조회 (game-server 직접)
    const rooms = await fetchActiveRooms(token);
    if (rooms.length === 0) {
      console.log("[room-cleanup] No active rooms found");
      return;
    }

    console.log(`[room-cleanup] Found ${rooms.length} active room(s), cleaning up...`);

    // 3. 각 방에서 퇴장 시도
    for (const room of rooms) {
      await leaveOrDeleteRoom(room.id, token);
    }

    console.log("[room-cleanup] Cleanup complete");
  } catch (err) {
    // 클린업 실패는 치명적이지 않음 — 로그만 남기고 계속 진행
    console.warn("[room-cleanup] Cleanup failed (non-fatal):", err);
  }
}

/**
 * Next.js 세션에서 accessToken을 추출한다.
 * /api/auth/session 엔드포인트를 호출하여 세션 정보를 가져온다.
 */
async function extractAccessToken(page: Page): Promise<string | null> {
  try {
    const token = await page.evaluate(async () => {
      const res = await fetch("/api/auth/session");
      if (!res.ok) return null;
      const session = (await res.json()) as { accessToken?: string };
      return session.accessToken ?? null;
    });
    return token;
  } catch {
    return null;
  }
}

interface RoomInfo {
  id: string;
  status: string;
}

/**
 * game-server에서 활성 방 목록을 조회한다.
 */
async function fetchActiveRooms(token: string): Promise<RoomInfo[]> {
  try {
    const res = await fetch(`${GAME_SERVER_URL}/api/rooms`, {
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
    });
    if (!res.ok) return [];
    const data = (await res.json()) as { rooms?: RoomInfo[] };
    return data.rooms ?? [];
  } catch {
    return [];
  }
}

/**
 * 방에서 퇴장하거나 삭제한다.
 * leave 실패 시 delete를 시도한다.
 */
async function leaveOrDeleteRoom(roomId: string, token: string): Promise<void> {
  try {
    // leave 시도
    const leaveRes = await fetch(
      `${GAME_SERVER_URL}/api/rooms/${roomId}/leave`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
      }
    );
    if (leaveRes.ok) {
      console.log(`[room-cleanup] Left room ${roomId}`);
      return;
    }

    // leave 실패 시 delete 시도
    const deleteRes = await fetch(`${GAME_SERVER_URL}/api/rooms/${roomId}`, {
      method: "DELETE",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
    });
    if (deleteRes.ok) {
      console.log(`[room-cleanup] Deleted room ${roomId}`);
    } else {
      console.warn(
        `[room-cleanup] Failed to leave/delete room ${roomId}: ${leaveRes.status} / ${deleteRes.status}`
      );
    }
  } catch (err) {
    console.warn(`[room-cleanup] Error cleaning room ${roomId}:`, err);
  }
}

/**
 * createRoomAndStart 에서 사용할 인라인 클린업.
 * 방 생성 실패 시 (409) 기존 방에서 나간 후 재시도한다.
 *
 * 이 함수는 page.evaluate 내에서 fetch를 사용하므로
 * Next.js 프록시(/api/rooms)를 통해 요청한다.
 *
 * 개선: leave 실패 시 game-server 직접 호출 + DELETE 시도로
 * 이전 테스트의 stale room을 더 확실히 정리한다.
 */
export async function cleanupViaPage(page: Page): Promise<void> {
  const gameServerUrl = process.env.GAME_SERVER_URL ?? "http://localhost:30080";

  await page.evaluate(async (gsUrl: string) => {
    try {
      // 세션에서 토큰 추출
      const sessionRes = await fetch("/api/auth/session");
      if (!sessionRes.ok) return;
      const session = (await sessionRes.json()) as { accessToken?: string };
      const token = session.accessToken;
      if (!token) return;

      // 활성 방 목록 조회 (Next.js 프록시)
      const roomsRes = await fetch("/api/rooms", {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!roomsRes.ok) return;
      const data = (await roomsRes.json()) as {
        rooms?: Array<{ id: string; status: string }>;
      };
      const rooms = data.rooms ?? [];

      // 각 방에서 퇴장 시도 (여러 전략 순차 적용)
      for (const room of rooms) {
        let left = false;

        // 전략 1: Next.js 프록시 통해 leave
        try {
          const r = await fetch(`/api/rooms/${room.id}/leave`, {
            method: "POST",
            headers: {
              Authorization: `Bearer ${token}`,
              "Content-Type": "application/json",
            },
          });
          if (r.ok) { left = true; continue; }
        } catch { /* ignore */ }

        // 전략 2: game-server 직접 leave
        if (!left) {
          try {
            const r = await fetch(`${gsUrl}/api/rooms/${room.id}/leave`, {
              method: "POST",
              headers: {
                Authorization: `Bearer ${token}`,
                "Content-Type": "application/json",
              },
            });
            if (r.ok) { left = true; continue; }
          } catch { /* ignore */ }
        }

        // 전략 3: game-server 직접 DELETE (방장인 경우)
        if (!left) {
          try {
            await fetch(`${gsUrl}/api/rooms/${room.id}`, {
              method: "DELETE",
              headers: {
                Authorization: `Bearer ${token}`,
                "Content-Type": "application/json",
              },
            });
          } catch { /* ignore */ }
        }
      }
    } catch {
      // 전체 클린업 실패는 무시
    }
  }, gameServerUrl);
}
