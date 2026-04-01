import { defineConfig, devices } from "@playwright/test";

/**
 * Playwright E2E 테스트 설정
 * - 로컬 K8s NodePort (localhost:30000) 기준
 * - 연습 모드, 로비, WS 연결 등 핵심 시나리오 커버
 */
export default defineConfig({
  testDir: "./e2e",
  fullyParallel: false, // K8s 부하 방지
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  workers: 1,
  globalSetup: "./e2e/global-setup.ts",
  globalTeardown: "./e2e/global-teardown.ts",
  reporter: [["list"], ["html", { outputFolder: "playwright-report", open: "never" }]],

  use: {
    baseURL: process.env.BASE_URL ?? "http://localhost:30000",
    trace: "on-first-retry",
    screenshot: "only-on-failure",
    video: "off",
    actionTimeout: 10_000,
    // 인증 세션 재사용 (global-setup에서 생성)
    storageState: "e2e/auth.json",
  },

  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],
});
