/**
 * Playwright Global Teardown — 테스트 후 활성 게임 방 정리
 *
 * 모든 테스트 완료 후 남아있는 활성 게임 방을 정리하여
 * 다음 테스트 실행에서 "이미 게임 중인 방이 있습니다" 오류를 방지한다.
 */

import { chromium } from "@playwright/test";
import { cleanupActiveRooms } from "./helpers/room-cleanup";

const BASE_URL = process.env.BASE_URL ?? "http://localhost:30000";

export default async function globalTeardown() {
  console.log("[global-teardown] Cleaning up active game rooms...");

  const browser = await chromium.launch();
  const context = await browser.newContext({
    storageState: "e2e/auth.json",
  });
  const page = await context.newPage();

  try {
    // 로비로 이동하여 세션 활성화 (쿠키 → 토큰 교환 필요)
    await page.goto(`${BASE_URL}/lobby`, { timeout: 15_000 });
    await page.waitForLoadState("domcontentloaded");

    // 활성 방 정리
    await cleanupActiveRooms(page);
  } catch (err) {
    console.warn("[global-teardown] Non-fatal error:", err);
  } finally {
    await browser.close();
  }

  console.log("[global-teardown] Done");
}
