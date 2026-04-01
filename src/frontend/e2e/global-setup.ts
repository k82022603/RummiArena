/**
 * Playwright Global Setup — 게스트 로그인 세션 생성 + 활성 방 정리
 *
 * - dev-login CredentialsProvider로 게스트 세션 생성
 * - storageState를 e2e/auth.json에 저장
 * - 모든 테스트가 이 세션을 재사용 (로그인 반복 없음)
 * - 이전 실행에서 남은 활성 게임 방 정리
 */

import { chromium } from "@playwright/test";
import { cleanupViaPage } from "./helpers/room-cleanup";

const BASE_URL = process.env.BASE_URL ?? "http://localhost:30000";

export default async function globalSetup() {
  const browser = await chromium.launch();
  const page = await browser.newPage();

  await page.goto(`${BASE_URL}/login`);

  // 게스트 닉네임 입력
  await page.locator("#guest-nickname").fill("QA-테스터");

  // 게스트 로그인 버튼 클릭
  await page.getByLabel("게스트로 로그인").click();

  // 로비 또는 다른 보호 페이지로 리디렉션 대기
  await page.waitForURL(/\/(lobby|practice)/, { timeout: 15_000 });

  // 이전 실행에서 남은 활성 게임 방 정리
  await cleanupViaPage(page);

  // 세션 쿠키(storageState) 저장
  await page.context().storageState({ path: "e2e/auth.json" });

  await browser.close();
}
