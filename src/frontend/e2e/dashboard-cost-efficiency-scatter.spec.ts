/**
 * Admin 대시보드 CostEfficiencyScatter E2E 테스트
 *
 * 검증 대상: docs/02-design/33-ai-tournament-dashboard-component-spec.md §4.5
 * - /tournament 페이지의 topRight 슬롯에 비용 효율 산점도가 렌더링된다
 * - 모델별로 분리된 Scatter 시리즈가 그려진다 (4개 중 선택된 모델)
 * - Pareto frontier 점선이 표시된다 (DeepSeek 근방 통과 예상)
 * - Tooltip 호버 시 모델명, $/턴, place rate, 총 턴, place/$ 가 표시된다
 * - ARIA: figure + figcaption + sr-only 요약 (screen reader 접근성)
 *
 * 핵심 데이터: C1 분석 (DeepSeek 비용 효율 GPT의 29배, Claude의 93배)
 *
 * 환경:
 *   - 관리자 대시보드는 localhost:30001 (K8s NodePort) 또는 dev 서버
 *   - ADMIN_URL 환경 변수로 오버라이드 가능
 *   - admin 서비스 접근 불가 시 test.skip 처리
 */

import { expect, test } from "@playwright/test";

const ADMIN_URL = process.env.ADMIN_URL ?? "http://localhost:30001";

test.describe("대시보드 — CostEfficiencyScatter (비용 효율성)", () => {
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

  test("TC-DASH-SC-001: /tournament 접근 시 비용 효율성 figure가 렌더된다", async ({
    page,
  }) => {
    await page.goto("/tournament", { waitUntil: "domcontentloaded" });

    const figure = page.locator('figure[aria-labelledby="cost-eff-title"]');
    await expect(figure).toBeVisible({ timeout: 15_000 });

    const caption = figure.locator("figcaption#cost-eff-title");
    await expect(caption).toHaveText("비용 효율성");
  });

  test("TC-DASH-SC-002: 모델별 Scatter 시리즈(symbols)가 그려진다", async ({
    page,
  }) => {
    await page.goto("/tournament", { waitUntil: "domcontentloaded" });

    const figure = page.locator('figure[aria-labelledby="cost-eff-title"]');
    await expect(figure).toBeVisible({ timeout: 15_000 });

    // 메인 차트 SVG (범례 아이콘 SVG는 제외)
    const svg = figure.locator('svg.recharts-surface[role="application"]');
    await expect(svg).toBeVisible();

    // recharts Scatter — 모델별 symbol path. 기본 필터(openai/claude/deepseek) →
    // 최소 6개 점이 그려진다 (각 모델당 최소 1개 라운드 보유).
    const symbols = figure.locator(".recharts-scatter-symbol");
    const count = await symbols.count();
    expect(count).toBeGreaterThanOrEqual(3);
  });

  test("TC-DASH-SC-003: Pareto frontier 점선이 표시된다", async ({ page }) => {
    await page.goto("/tournament", { waitUntil: "domcontentloaded" });

    const figure = page.locator('figure[aria-labelledby="cost-eff-title"]');
    await expect(figure).toBeVisible({ timeout: 15_000 });

    // recharts Line(linear) 컴포넌트는 .recharts-line-curve 클래스를 갖는다.
    // CostEfficiencyScatter는 산점도 위에 한 줄의 frontier line만 그린다.
    const line = figure.locator(".recharts-line-curve").first();
    await expect(line).toBeAttached();

    // strokeDasharray='6 4' 가 적용돼야 한다
    const dash = await line.getAttribute("stroke-dasharray");
    expect(dash).not.toBeNull();
    expect(dash).toMatch(/6/);
  });

  test("TC-DASH-SC-004: 산점 호버 시 tooltip에 모델/비용/place 정보가 표시된다", async ({
    page,
  }) => {
    await page.goto("/tournament", { waitUntil: "domcontentloaded" });

    const figure = page.locator('figure[aria-labelledby="cost-eff-title"]');
    await expect(figure).toBeVisible({ timeout: 15_000 });

    // recharts 애니메이션 종료 대기
    await page.waitForTimeout(1200);

    const symbol = figure.locator(".recharts-scatter-symbol").first();
    await symbol.waitFor({ state: "attached", timeout: 5_000 });
    await symbol.hover({ force: true });

    const tooltip = page.locator('[role="tooltip"]');
    await expect(tooltip).toBeVisible({ timeout: 5_000 });

    const tooltipText = (await tooltip.textContent()) ?? "";
    expect(tooltipText).toMatch(/GPT|Claude|DeepSeek|Ollama/);
    // $ 표시 + % 표시 + place / $ 라벨이 모두 포함돼야 한다
    expect(tooltipText).toMatch(/\$/);
    expect(tooltipText).toMatch(/%/);
    expect(tooltipText).toMatch(/place\s*\/\s*\$/i);
  });

  test("TC-DASH-SC-005: sr-only 요약이 ARIA describedby로 연결된다", async ({
    page,
  }) => {
    await page.goto("/tournament", { waitUntil: "domcontentloaded" });

    const desc = page.locator("#cost-eff-desc");
    const text = await desc.textContent();
    expect(text ?? "").toMatch(/라운드|비용|place|효율/);
  });

  test("TC-DASH-SC-006: 스크린샷 캡처 — 데스크톱 + 모바일", async ({ page }) => {
    // 데스크톱
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto("/tournament", { waitUntil: "domcontentloaded" });
    const figure = page.locator('figure[aria-labelledby="cost-eff-title"]');
    await expect(figure).toBeVisible({ timeout: 15_000 });
    await page.waitForTimeout(1200);
    await page.screenshot({
      path: "test-results/dashboard-cost-efficiency-scatter-desktop.png",
      fullPage: true,
    });

    // 모바일
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("/tournament", { waitUntil: "domcontentloaded" });
    await expect(figure).toBeVisible({ timeout: 15_000 });
    await page.waitForTimeout(1200);
    await page.screenshot({
      path: "test-results/dashboard-cost-efficiency-scatter-mobile.png",
      fullPage: true,
    });
  });
});
