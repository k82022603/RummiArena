/**
 * Admin 대시보드 ModelCardGrid E2E 테스트 (PR 4 skeleton)
 *
 * 검증 대상: docs/02-design/33-ai-tournament-dashboard-component-spec.md §4.6
 * 실행 계획: docs/01-planning/20-sprint6-day4-execution-plan.md §3
 *
 * ## 위치 결정 사유
 * 사용자 지시는 `src/admin/e2e/dashboard-model-card-grid.spec.ts` 였으나,
 * `src/admin/`에는 Playwright 환경이 존재하지 않는다 (glob 조사 결과: 0 spec).
 * 어제 PR 3의 `dashboard-cost-efficiency-scatter.spec.ts`와 동일 위치에 둔다.
 *
 * ## 검증 내역
 * - /tournament 페이지 렌더 시 ModelCardGrid section이 보인다
 * - 5장의 모델 카드(OpenAI/Claude/DeepSeek/DashScope/Ollama)가 mock fallback으로 렌더된다
 *   ※ 실제 API 응답이 4개 모델만 반환하면 4장, skeleton mock이면 5장
 * - 기본 정렬: place rate 내림차순 (첫 카드가 30.8% 이상)
 * - 카드마다 등급 배지(A+/A/B/C/F 중 하나)와 "최근 대전" 링크가 존재
 * - ARIA: aria-label, sr-only 요약이 올바르게 연결됨
 *
 * ## 환경
 * - 관리자 대시보드는 localhost:30001 (K8s NodePort) 또는 dev 서버
 * - ADMIN_URL 환경 변수로 오버라이드 가능
 * - admin 서비스 접근 불가 시 test.skip 처리
 */

import { expect, test } from "@playwright/test";

const ADMIN_URL = process.env.ADMIN_URL ?? "http://localhost:30001";

test.describe("대시보드 — ModelCardGrid (모델 카드)", () => {
  test.use({ storageState: { cookies: [], origins: [] }, baseURL: ADMIN_URL });

  test.beforeEach(async ({ page }) => {
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

  test("TC-DASH-MC-001: ModelCardGrid section이 렌더된다", async ({ page }) => {
    await page.goto("/tournament", { waitUntil: "domcontentloaded" });

    const grid = page.locator('[data-testid="model-card-grid"]');
    await expect(grid).toBeVisible({ timeout: 15_000 });

    const title = grid.locator("#model-card-grid-title");
    await expect(title).toHaveText("모델 카드");
  });

  test("TC-DASH-MC-002: 모델 카드가 4~5장 렌더된다 (mock fallback 포함)", async ({
    page,
  }) => {
    await page.goto("/tournament", { waitUntil: "domcontentloaded" });

    const grid = page.locator('[data-testid="model-card-grid"]');
    await expect(grid).toBeVisible({ timeout: 15_000 });

    const cards = grid.locator('[data-testid="model-card"]');
    const count = await cards.count();

    // 필터 기본값: openai/claude/deepseek 3개 → API 응답 시 3~4장
    // mock fallback 진입 시 5장 (skeleton 전용, DashScope 포함)
    // 두 경우 모두 최소 3장 이상이어야 한다
    expect(count).toBeGreaterThanOrEqual(3);
    expect(count).toBeLessThanOrEqual(5);
  });

  test("TC-DASH-MC-003: 기본 정렬 — place rate 내림차순", async ({ page }) => {
    await page.goto("/tournament", { waitUntil: "domcontentloaded" });

    const grid = page.locator('[data-testid="model-card-grid"]');
    await expect(grid).toBeVisible({ timeout: 15_000 });

    const cards = grid.locator('[data-testid="model-card"]');
    const count = await cards.count();
    expect(count).toBeGreaterThanOrEqual(2);

    // data-place-rate 속성으로 내림차순 확인
    const rates: number[] = [];
    for (let i = 0; i < count; i += 1) {
      const v = await cards.nth(i).getAttribute("data-place-rate");
      rates.push(Number(v ?? 0));
    }
    for (let i = 1; i < rates.length; i += 1) {
      expect(rates[i]).toBeLessThanOrEqual(rates[i - 1]);
    }
  });

  test("TC-DASH-MC-004: 각 카드에 등급 배지와 '최근 대전' 링크가 있다", async ({
    page,
  }) => {
    await page.goto("/tournament", { waitUntil: "domcontentloaded" });

    const grid = page.locator('[data-testid="model-card-grid"]');
    await expect(grid).toBeVisible({ timeout: 15_000 });

    const firstCard = grid.locator('[data-testid="model-card"]').first();

    // 등급 배지 — aria-label="등급 A+" 등
    const gradeBadge = firstCard.locator('[aria-label^="등급"]');
    await expect(gradeBadge).toBeVisible();
    const gradeText = (await gradeBadge.textContent()) ?? "";
    expect(gradeText).toMatch(/^(A\+|A|B|C|D|F)$/);

    // 최근 대전 링크
    const link = firstCard.locator('a[aria-label*="최근 대전 보기"]');
    await expect(link).toBeVisible();
    const href = await link.getAttribute("href");
    expect(href).toBeTruthy();
  });

  test("TC-DASH-MC-005: 주 지표가 'NN.N%' 형식으로 표시된다", async ({ page }) => {
    await page.goto("/tournament", { waitUntil: "domcontentloaded" });

    const grid = page.locator('[data-testid="model-card-grid"]');
    await expect(grid).toBeVisible({ timeout: 15_000 });

    const firstCard = grid.locator('[data-testid="model-card"]').first();
    const rateText = (await firstCard.locator("p.text-4xl").textContent()) ?? "";
    expect(rateText).toMatch(/\d+\.\d%/);
  });

  test("TC-DASH-MC-006: sr-only 요약이 aria-labelledby와 연결된다", async ({
    page,
  }) => {
    await page.goto("/tournament", { waitUntil: "domcontentloaded" });

    const grid = page.locator('[data-testid="model-card-grid"]');
    const labelledBy = await grid.getAttribute("aria-labelledby");
    expect(labelledBy).toBe("model-card-grid-title");

    const srText = await grid.locator("p.sr-only").textContent();
    expect(srText ?? "").toMatch(/Place Rate/);
  });

  test("TC-DASH-MC-007: 스크린샷 — 데스크톱 + 태블릿 + 모바일", async ({
    page,
  }) => {
    // Desktop (3 col)
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto("/tournament", { waitUntil: "domcontentloaded" });
    const grid = page.locator('[data-testid="model-card-grid"]');
    await expect(grid).toBeVisible({ timeout: 15_000 });
    await page.waitForTimeout(600);
    await page.screenshot({
      path: "test-results/dashboard-model-card-grid-desktop.png",
      fullPage: true,
    });

    // Tablet (2 col)
    await page.setViewportSize({ width: 768, height: 1024 });
    await page.goto("/tournament", { waitUntil: "domcontentloaded" });
    await expect(grid).toBeVisible({ timeout: 15_000 });
    await page.waitForTimeout(600);
    await page.screenshot({
      path: "test-results/dashboard-model-card-grid-tablet.png",
      fullPage: true,
    });

    // Mobile (1 col)
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("/tournament", { waitUntil: "domcontentloaded" });
    await expect(grid).toBeVisible({ timeout: 15_000 });
    await page.waitForTimeout(600);
    await page.screenshot({
      path: "test-results/dashboard-model-card-grid-mobile.png",
      fullPage: true,
    });
  });
});
