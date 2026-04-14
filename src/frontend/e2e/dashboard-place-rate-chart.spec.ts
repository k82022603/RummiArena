/**
 * Admin 대시보드 PlaceRateChart E2E 테스트
 *
 * 검증 대상: docs/02-design/33-ai-tournament-dashboard-component-spec.md §4.4
 * - /tournament 페이지에서 PlaceRateChart가 렌더링된다
 * - 4개 모델(GPT-5-mini, Claude Sonnet 4, DeepSeek Reasoner, Ollama qwen2.5:3b) 중
 *   필터에 선택된 라인이 SVG로 그려진다
 * - Tooltip이 마우스 호버 시 표시되며 모델 이름 + place rate를 포함한다
 * - ARIA role="img" + figcaption 존재 (screen reader 접근성)
 *
 * 환경:
 *   - 관리자 대시보드는 localhost:30001 (K8s NodePort)에 배포된다.
 *   - 테스트는 ADMIN_URL 환경 변수로 오버라이드 가능.
 *   - 게임 프론트(localhost:30000)와 별도 호스트이므로 인증 상태 공유 불필요.
 *   - admin 서비스가 접근 불가인 경우 test.skip 처리.
 */

import { expect, test } from "@playwright/test";

const ADMIN_URL = process.env.ADMIN_URL ?? "http://localhost:30001";

test.describe("대시보드 — PlaceRateChart (AI 토너먼트 추이)", () => {
  // 공용 fixture의 storageState (game frontend용)는 admin과 별개이므로 초기화
  test.use({ storageState: { cookies: [], origins: [] }, baseURL: ADMIN_URL });

  test.beforeEach(async ({ page }) => {
    // admin 서비스가 접근 불가면 skip (CI/로컬 어느 쪽에서도 동작)
    try {
      const res = await page.request.get(`${ADMIN_URL}/tournament`, {
        timeout: 5_000,
      });
      if (!res.ok()) {
        test.skip(true, `admin 서비스 응답 오류 (HTTP ${res.status()})`);
      }
    } catch (err) {
      test.skip(true, `admin 서비스 접근 불가: ${(err as Error).message}`);
    }
  });

  test("TC-DASH-001: /tournament 접근 시 Place Rate 추이 figure가 렌더된다", async ({
    page,
  }) => {
    await page.goto("/tournament", { waitUntil: "domcontentloaded" });

    const figure = page.locator('figure[aria-labelledby="place-rate-title"]');
    await expect(figure).toBeVisible({ timeout: 15_000 });

    const caption = figure.locator("figcaption#place-rate-title");
    await expect(caption).toHaveText("Place Rate 추이");
  });

  test("TC-DASH-002: 선택된 모델에 대한 recharts Line 요소가 그려진다", async ({
    page,
  }) => {
    await page.goto("/tournament", { waitUntil: "domcontentloaded" });

    const figure = page.locator('figure[aria-labelledby="place-rate-title"]');
    await expect(figure).toBeVisible({ timeout: 15_000 });

    // recharts 메인 차트 SVG (role="application"); 범례 아이콘 SVG는 제외
    const svg = figure.locator('svg.recharts-surface[role="application"]');
    await expect(svg).toBeVisible();

    // 기본 필터(openai/claude/deepseek) → 최소 3개의 Line 그려진다
    const lines = figure.locator(".recharts-line-curve");
    const count = await lines.count();
    expect(count).toBeGreaterThanOrEqual(3);
  });

  test("TC-DASH-003: sr-only 요약 텍스트가 ARIA describedby로 연결된다", async ({
    page,
  }) => {
    await page.goto("/tournament", { waitUntil: "domcontentloaded" });

    const desc = page.locator("#place-rate-desc");
    const text = await desc.textContent();
    expect(text ?? "").toMatch(/라운드|place|평균/);
  });

  test("TC-DASH-004: 라인 도트 호버 시 tooltip에 모델명이 표시된다", async ({
    page,
  }) => {
    await page.goto("/tournament", { waitUntil: "domcontentloaded" });

    const figure = page.locator('figure[aria-labelledby="place-rate-title"]');
    await expect(figure).toBeVisible({ timeout: 15_000 });

    // recharts가 Line animation을 끝낼 때까지 대기
    await page.waitForTimeout(1200);

    // Line dot 중 첫 번째를 호버
    const dot = figure.locator(".recharts-line-dots circle").first();
    await dot.waitFor({ state: "attached", timeout: 5_000 });
    await dot.hover({ force: true });

    const tooltip = page.locator('[role="tooltip"]');
    await expect(tooltip).toBeVisible({ timeout: 5_000 });

    const tooltipText = (await tooltip.textContent()) ?? "";
    expect(tooltipText).toMatch(/GPT|Claude|DeepSeek|Ollama/);
    expect(tooltipText).toMatch(/%/);
  });

  test("TC-DASH-005: 스크린샷 캡처 — 데스크톱 뷰", async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto("/tournament", { waitUntil: "domcontentloaded" });
    const figure = page.locator('figure[aria-labelledby="place-rate-title"]');
    await expect(figure).toBeVisible({ timeout: 15_000 });
    await page.waitForTimeout(1200);
    await page.screenshot({
      path: "test-results/dashboard-place-rate-chart-desktop.png",
      fullPage: true,
    });
  });

  test("TC-DASH-006: 스크린샷 캡처 — 모바일 뷰", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("/tournament", { waitUntil: "domcontentloaded" });
    const figure = page.locator('figure[aria-labelledby="place-rate-title"]');
    await expect(figure).toBeVisible({ timeout: 15_000 });
    await page.waitForTimeout(1200);
    await page.screenshot({
      path: "test-results/dashboard-place-rate-chart-mobile.png",
      fullPage: true,
    });
  });
});
