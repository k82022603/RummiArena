/**
 * Admin Playtest S4 결정론적 시드 UI E2E 테스트
 *
 * 검증 대상:
 *   - docs/04-testing/53-playtest-s4-deterministic-framework.md §10 (Admin UI Contract)
 *   - docs/02-design/37-playtest-s4-deterministic-ux.md §4 (와이어프레임)
 *   - docs/02-design/38-colorblind-safe-palette.md §4 (PASS/FAIL 컬러+아이콘)
 *
 * 환경:
 *   - 관리자 대시보드는 K8s 배포 시 localhost:30001, 로컬 dev 시 ADMIN_URL 환경변수로 오버라이드.
 *   - admin 서비스 접근 불가 시 test.skip.
 *   - 시나리오 endpoint(/api/playtest/s4/scenarios)가 5건 미만이면 일부 케이스 skip.
 */

import { expect, test } from "@playwright/test";

const ADMIN_URL = process.env.ADMIN_URL ?? "http://localhost:30001";

test.describe("Admin Playtest S4 — Deterministic Runner", () => {
  test.use({ storageState: { cookies: [], origins: [] }, baseURL: ADMIN_URL });

  test.beforeEach(async ({ page }) => {
    try {
      const res = await page.request.get(`${ADMIN_URL}/playtest-s4`, {
        timeout: 5_000,
      });
      if (!res.ok()) {
        test.skip(true, `admin 서비스 응답 오류 (HTTP ${res.status()})`);
      }
    } catch (err) {
      test.skip(true, `admin 서비스 접근 불가: ${(err as Error).message}`);
    }
  });

  test("TC-S4-UI-001: 페이지 로드 + 5개 시나리오가 드롭다운에 노출된다", async ({
    page,
  }) => {
    await page.goto("/playtest-s4", { waitUntil: "domcontentloaded" });

    const heading = page.locator("#playtest-s4-heading");
    await expect(heading).toBeVisible({ timeout: 15_000 });
    await expect(heading).toHaveText(/Playtest S4/);

    const select = page.getByTestId("scenario-select");
    await expect(select).toBeVisible();

    const options = select.locator("option");
    const count = await options.count();
    expect(count).toBeGreaterThanOrEqual(5);

    // 핵심 시나리오 ID가 옵션 텍스트에 포함되는지 확인
    const optionTexts = await options.allTextContents();
    const joined = optionTexts.join("\n");
    expect(joined).toMatch(/conservation-106/);
    expect(joined).toMatch(/joker-exchange-v07/);
    expect(joined).toMatch(/rearrange-v13-type3/);
  });

  test("TC-S4-UI-002: 시드 입력 hex/uint64 검증 + 잘못된 입력에 에러 표시", async ({
    page,
  }) => {
    await page.goto("/playtest-s4", { waitUntil: "domcontentloaded" });

    const seed = page.getByTestId("seed-input");
    await expect(seed).toBeVisible();

    // 유효 hex
    await seed.fill("0xDEADBEEF");
    await expect(seed).toHaveAttribute("aria-invalid", "false");

    // 유효 decimal uint64
    await seed.fill("12345");
    await expect(seed).toHaveAttribute("aria-invalid", "false");

    // 잘못된 입력 — 영문자 + 숫자 혼합
    await seed.fill("notahex");
    await expect(seed).toHaveAttribute("aria-invalid", "true");

    // 실행 버튼 disabled
    const runBtn = page.getByTestId("run-btn");
    await expect(runBtn).toBeDisabled();

    // 다시 유효한 시드로 복원 → 실행 버튼 활성
    await seed.fill("0x1");
    await expect(runBtn).toBeEnabled();
  });

  test("TC-S4-UI-003: 시나리오 실행 → 결과 패널에 PASS 표시", async ({ page }) => {
    await page.goto("/playtest-s4", { waitUntil: "domcontentloaded" });

    // conservation-106는 항상 PASS인 baseline P0 시나리오
    await page.getByTestId("scenario-select").selectOption("conservation-106");
    await page.getByTestId("seed-input").fill("0x1");

    const runBtn = page.getByTestId("run-btn");
    await expect(runBtn).toBeEnabled();
    await runBtn.click();

    const status = page.getByTestId("result-status");
    await expect(status).toBeVisible({ timeout: 30_000 });
    await expect(status).toHaveText("PASS");

    const checks = page.getByTestId("result-checks");
    await expect(checks).toContainText("conservation_106");
    await expect(checks).toContainText("determinism");
  });

  test("TC-S4-UI-004: fixture/live AI 모드는 disabled + 툴팁/Phase 라벨 노출", async ({
    page,
  }) => {
    await page.goto("/playtest-s4", { waitUntil: "domcontentloaded" });

    const baseline = page.getByTestId("aimode-baseline").locator("input");
    const fixture = page.getByTestId("aimode-fixture").locator("input");
    const live = page.getByTestId("aimode-live").locator("input");

    await expect(baseline).toBeEnabled();
    await expect(baseline).toBeChecked();

    await expect(fixture).toBeDisabled();
    await expect(live).toBeDisabled();

    // disabled 라벨에 "Phase 2+" 텍스트가 보이는지
    const fixtureLabel = page.getByTestId("aimode-fixture");
    await expect(fixtureLabel).toContainText(/Phase 2\+/i);
    const liveLabel = page.getByTestId("aimode-live");
    await expect(liveLabel).toContainText(/Phase 2\+/i);

    // title 속성(툴팁)에 "Sprint" 또는 phase 안내 포함
    const fixtureTitle = await fixtureLabel.getAttribute("title");
    expect(fixtureTitle ?? "").toMatch(/Phase 2|Sprint/);
  });

  test("TC-S4-UI-005: 실행 완료 후 시드가 localStorage 최근 시드에 추가된다", async ({
    page,
  }) => {
    await page.goto("/playtest-s4", { waitUntil: "domcontentloaded" });

    const uniqueSeed = `0x${Date.now().toString(16).slice(-8)}`;
    await page.getByTestId("scenario-select").selectOption("conservation-106");
    await page.getByTestId("seed-input").fill(uniqueSeed);

    await page.getByTestId("run-btn").click();
    await expect(page.getByTestId("result-status")).toHaveText("PASS", {
      timeout: 30_000,
    });

    // 최근 시드 패널에 노출
    const recentPanel = page.getByTestId("recent-seeds-panel");
    await expect(recentPanel).toContainText(uniqueSeed);

    // localStorage에도 기록됨
    const stored = await page.evaluate(() =>
      window.localStorage.getItem("playtest-s4:recent-seeds"),
    );
    expect(stored ?? "").toContain(uniqueSeed);

    // 새로고침 후에도 유지 (브라우저 저장 검증)
    await page.reload({ waitUntil: "domcontentloaded" });
    await expect(
      page.getByTestId("recent-seeds-panel"),
    ).toContainText(uniqueSeed);
  });

  test("TC-S4-UI-006: 스크린샷 — 데스크톱", async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto("/playtest-s4", { waitUntil: "domcontentloaded" });
    await expect(page.getByTestId("playtest-s4-page")).toBeVisible({
      timeout: 15_000,
    });
    // 결과 영역까지 포함된 스크린샷을 위해 한번 실행
    await page.getByTestId("scenario-select").selectOption("conservation-106");
    await page.getByTestId("run-btn").click();
    await expect(page.getByTestId("result-status")).toBeVisible({
      timeout: 30_000,
    });
    await page.screenshot({
      path: "test-results/admin-playtest-s4-desktop.png",
      fullPage: true,
    });
  });

  test("TC-S4-UI-007: 스크린샷 — 모바일", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("/playtest-s4", { waitUntil: "domcontentloaded" });
    await expect(page.getByTestId("playtest-s4-page")).toBeVisible({
      timeout: 15_000,
    });
    await page.screenshot({
      path: "test-results/admin-playtest-s4-mobile.png",
      fullPage: true,
    });
  });
});
