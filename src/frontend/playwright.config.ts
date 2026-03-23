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
  reporter: [["list"], ["html", { outputFolder: "playwright-report", open: "never" }]],

  use: {
    baseURL: process.env.BASE_URL ?? "http://localhost:30000",
    trace: "on-first-retry",
    screenshot: "only-on-failure",
    video: "off",
    // 드래그 동작을 위한 slowMo
    actionTimeout: 10_000,
  },

  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],
});
