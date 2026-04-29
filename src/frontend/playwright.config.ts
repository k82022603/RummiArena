import { defineConfig, devices } from "@playwright/test";

/**
 * Playwright E2E 테스트 설정
 * - 로컬 K8s NodePort (localhost:30000) 기준
 * - 연습 모드, 로비, WS 연결 등 핵심 시나리오 커버
 *
 * ## Race 추적 모드 (옵션 B — 평소엔 꺼두고 race 의심 시에만 켜기)
 *
 * 환경변수 두 가지를 동시에 설정해야 한다:
 *   - NEXT_PUBLIC_E2E_RACE_DEBUG=true : Next.js 빌드 변수 → useWebSocket.ts 로그 활성화
 *   - E2E_RACE_DEBUG=true             : Playwright 실행 변수 → page.addInitScript로
 *                                        window.__E2E_RACE_DEBUG__=true 주입
 *
 * 실행 예:
 *   cd src/frontend
 *   NEXT_PUBLIC_E2E_RACE_DEBUG=true E2E_RACE_DEBUG=true \
 *     npx playwright test e2e/rearrangement.spec.ts --workers=1
 *
 * 로그 확인:
 *   grep "\[E2E-RACE\]" test-results/*\/stdout.txt
 *   또는 --reporter=list 실행 중 콘솔에서 직접 확인
 *
 * 주의: NEXT_PUBLIC_E2E_RACE_DEBUG 는 Next.js 빌드 시 번들에 포함된다.
 *       프로덕션 빌드(NODE_ENV=production)에서는 dead code elimination 으로 제거된다.
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
