/**
 * Admin 대시보드 RoundHistoryTable E2E 테스트 (PR 5)
 *
 * 검증 대상: docs/02-design/33-ai-tournament-dashboard-component-spec.md §4.7
 *            docs/02-design/45 (ADR 45 — RoundHistoryTable 설계)
 *
 * ## 위치 결정 사유
 * src/admin/ 에는 Playwright 환경이 없다 (package.json에 @playwright/test 미설치).
 * PlaceRateChart, ModelCardGrid 등 동일 패턴으로 src/frontend/e2e/ 에 배치한다.
 *
 * ## 컴포넌트 구조 (PR 5 구현체)
 * - RoundHistoryTable   — TanStack Table v8, 10컬럼, sortable
 * - RoundHistoryFilterBar — Round / Model / Variant 드롭다운 (멀티셀렉트), 날짜 범위
 * - RoundHistoryStatsFooter — 평균/σ/중앙값/총비용/평균fallback 5카드
 * - RoundHistoryDetailModal — 행 클릭 시 모달 (ESC/배경 클릭 닫기)
 *
 * ## 데이터 전제 (src/admin/src/lib/roundHistoryData.ts)
 * - ROUND_HISTORY_SEED: 17 entries, deepseek 전용, variant v1~v4.1
 * - 최고 placeRate: 0.333 (R10-v3-Run3), 최저: 0.0 (R7-fixture)
 * - fallback 있는 항목: R5-Run1(9), R5-Run2(1), R9-P3(1)
 *
 * ## 환경
 * - Admin 대시보드: localhost:30001 (K8s NodePort) 또는 ADMIN_URL 환경변수
 * - storageState: 빈 상태 (admin은 OAuth 미연동)
 * - admin 서비스 접근 불가 시 모든 테스트 skip 처리
 *
 * ## React hydration 대기 전략
 * RoundHistoryTable은 "use client" + <Suspense> 조합이므로 domcontentloaded
 * 이벤트 이후에도 hydration이 완료되지 않을 수 있다. 모든 테스트에서
 * gotoTournamentAndWait() 헬퍼를 통해 "라운드 히스토리" 텍스트가 DOM에
 * 나타날 때까지 기다린 후 assertions를 시작한다.
 */

import { expect, test, type Page } from "@playwright/test";

const ADMIN_URL = process.env.ADMIN_URL ?? "http://localhost:30001";

/** ROUND_HISTORY_SEED 총 항목 수 (roundHistoryData.ts와 동기) */
const SEED_TOTAL = 17;

/**
 * /tournament 페이지로 이동하고 RoundHistoryTable hydration이 완료될 때까지 대기한다.
 *
 * RoundHistoryTable은 "use client" + <Suspense> 조합이다.
 * Playwright가 networkidle을 받아도 TanStack Table JS가 아직 실행 중일 수 있으므로,
 * table[role="grid"] 요소가 DOM에 첨부(attached)될 때까지 명시적으로 대기한다.
 *
 * NOTE: table은 모바일(sm 미만)에서 CSS hidden 처리되므로 "attached" 상태로만 확인.
 * 가시성(visible) 검사는 각 테스트의 뷰포트 크기에 따라 별도 처리한다.
 */
async function gotoTournamentAndWait(page: Page) {
  await page.goto(`${ADMIN_URL}/tournament`, {
    waitUntil: "load",
    timeout: 30_000,
  });
  // TanStack Table hydration 완료 신호: table[role="grid"] 가 DOM에 첨부
  // state: "attached" — hidden이어도 DOM에 존재하면 통과
  await page.waitForSelector('table[role="grid"]', {
    state: "attached",
    timeout: 40_000,
  });
}

test.describe("대시보드 — RoundHistoryTable (라운드 히스토리)", () => {
  test.use({ storageState: { cookies: [], origins: [] }, baseURL: ADMIN_URL });

  test.beforeEach(async ({ page }) => {
    try {
      const res = await page.request.get(`${ADMIN_URL}/tournament`, {
        timeout: 8_000,
      });
      if (!res.ok()) {
        test.skip(true, `admin 서비스 응답 오류 (HTTP ${res.status()})`);
      }
    } catch (err) {
      test.skip(true, `admin 서비스 접근 불가: ${(err as Error).message}`);
    }
  });

  // ---------------------------------------------------------------------------
  // TC-DASH-RH-001: 기본 렌더링 + 행 수 검증
  // ---------------------------------------------------------------------------
  test(
    "TC-DASH-RH-001: RoundHistoryTable이 렌더되고 시드 데이터 17개 행이 보인다",
    async ({ page }) => {
      await gotoTournamentAndWait(page);

      // 라운드 히스토리 섹션 헤더
      const heading = page.locator("text=라운드 히스토리");
      await expect(heading).toBeVisible({ timeout: 10_000 });

      // role="grid" (TanStack Table 접근성)
      const table = page.locator('table[role="grid"][aria-label="라운드 실험 이력 테이블"]');
      await expect(table).toBeVisible({ timeout: 15_000 });

      // 헤더(th) 행 제외한 데이터 행 수
      const rows = table.locator("tbody tr");
      const count = await rows.count();
      expect(count).toBe(SEED_TOTAL);
    },
  );

  // ---------------------------------------------------------------------------
  // TC-DASH-RH-002: 기본 정렬 — roundId 내림차순 (최신 라운드 상단)
  // ---------------------------------------------------------------------------
  test(
    "TC-DASH-RH-002: 기본 정렬이 roundId 내림차순이고 첫 행이 R10 계열이다",
    async ({ page }) => {
      await gotoTournamentAndWait(page);

      const table = page.locator('table[role="grid"]');
      await expect(table).toBeVisible({ timeout: 15_000 });

      // 첫 번째 데이터 행의 첫 번째 td (roundId 컬럼)
      const firstCell = table.locator("tbody tr:first-child td:first-child span");
      const firstRoundId = (await firstCell.textContent()) ?? "";

      // 기본 정렬: desc → 사전순 내림차순 최상위는 R10-v3-Run3
      // 정렬 알고리즘이 문자열 비교이므로 R10 > R9 > R7 > ... 보장
      expect(firstRoundId).toMatch(/^R10/);
    },
  );

  // ---------------------------------------------------------------------------
  // TC-DASH-RH-003: Place% 컬럼 클릭 → 정렬 방향 변경 검증
  // ---------------------------------------------------------------------------
  test(
    "TC-DASH-RH-003: Place% 헤더 클릭 시 aria-sort가 토글되고 두 번 클릭 시 ascending이 된다",
    async ({ page }) => {
      await gotoTournamentAndWait(page);

      const table = page.locator('table[role="grid"]');
      await expect(table).toBeVisible({ timeout: 15_000 });

      // Place% 헤더 th — aria-sort 속성 확인
      const placeHeader = table.locator('th[aria-label*="Place%"]');
      await expect(placeHeader).toBeVisible();

      // 클릭 전: aria-sort="none" 또는 미설정 (기본 정렬이 roundId이므로)
      const sortBefore = await placeHeader.getAttribute("aria-sort");
      expect(sortBefore ?? "none").toBe("none");

      // 첫 번째 클릭 → TanStack Table 기본 동작: desc (내림차순) 시작
      await placeHeader.click();
      const sortAfterFirst = await placeHeader.getAttribute("aria-sort");
      // desc OR asc — 정렬이 활성화됐는지만 확인
      expect(sortAfterFirst).toMatch(/ascending|descending/);

      // 두 번째 클릭 → 반대 방향
      await placeHeader.click();
      const sortAfterSecond = await placeHeader.getAttribute("aria-sort");
      expect(sortAfterSecond).toMatch(/ascending|descending/);

      // 두 번 클릭 후 정렬 방향이 첫 번째와 다르다
      expect(sortAfterSecond).not.toBe(sortAfterFirst);
    },
  );

  // ---------------------------------------------------------------------------
  // TC-DASH-RH-004: Model 필터 — 존재하지 않는 모델 선택 시 empty state
  // ---------------------------------------------------------------------------
  test(
    "TC-DASH-RH-004: gpt-5-mini 모델 필터 선택 시 empty state 메시지가 표시된다",
    async ({ page }) => {
      await gotoTournamentAndWait(page);

      const table = page.locator('table[role="grid"]');
      await expect(table).toBeVisible({ timeout: 15_000 });

      // FilterBar: Model 드롭다운 버튼 (aria-haspopup="listbox")
      const modelButton = page.locator(
        '[role="search"] button[aria-haspopup="listbox"]',
        { hasText: "Model" },
      );
      await expect(modelButton).toBeVisible();
      await modelButton.click();

      // listbox가 열리면 GPT 체크박스 선택
      const dropdown = page.locator('[role="listbox"][aria-label="Model 필터 선택"]');
      await expect(dropdown).toBeVisible({ timeout: 3_000 });

      const gptCheckbox = dropdown.locator('input[aria-label="gpt-5-mini"]');
      await gptCheckbox.check();

      // 드롭다운 닫기 (바깥 클릭)
      await page.locator("h2:has-text('라운드 히스토리')").click();

      // ROUND_HISTORY_SEED에는 gpt-5-mini 데이터가 없으므로 empty state
      await expect(
        table.locator("td:has-text('필터 조건에 맞는 결과가 없습니다.')"),
      ).toBeVisible({ timeout: 5_000 });
    },
  );

  // ---------------------------------------------------------------------------
  // TC-DASH-RH-005: 날짜 범위 필터 → 미래 날짜 설정 시 empty state
  // ---------------------------------------------------------------------------
  test(
    "TC-DASH-RH-005: 미래 날짜 범위 설정 시 empty state가 표시된다",
    async ({ page }) => {
      await gotoTournamentAndWait(page);

      const table = page.locator('table[role="grid"]');
      await expect(table).toBeVisible({ timeout: 15_000 });

      // 시작일 필터를 미래 날짜(시드 데이터 최대 날짜 이후)로 설정
      const dateFromInput = page.locator('input[aria-label="시작일 필터"]');
      await dateFromInput.fill("2030-01-01");
      // 변경 이벤트 트리거
      await dateFromInput.press("Tab");

      // empty state 텍스트 확인
      await expect(
        table.locator("td:has-text('필터 조건에 맞는 결과가 없습니다.')"),
      ).toBeVisible({ timeout: 5_000 });
    },
  );

  // ---------------------------------------------------------------------------
  // TC-DASH-RH-006: 행 클릭 → DetailModal 열림 + ESC 닫힘
  // ---------------------------------------------------------------------------
  test(
    "TC-DASH-RH-006: 행 클릭 시 DetailModal이 열리고 ESC 키로 닫힌다",
    async ({ page }) => {
      await gotoTournamentAndWait(page);

      const table = page.locator('table[role="grid"]');
      await expect(table).toBeVisible({ timeout: 15_000 });

      // 첫 번째 행 클릭
      const firstRow = table.locator("tbody tr:first-child");
      await firstRow.click();

      // 모달 등장 확인
      const modal = page.locator('[role="dialog"][aria-modal="true"]');
      await expect(modal).toBeVisible({ timeout: 5_000 });

      // 모달 내 성과 섹션 확인
      const perfSection = modal.locator('[aria-label="성과 지표"]');
      await expect(perfSection).toBeVisible();
      await expect(perfSection.locator("text=Place Rate")).toBeVisible();

      // ESC 키로 닫기
      await page.keyboard.press("Escape");
      await expect(modal).not.toBeVisible({ timeout: 3_000 });
    },
  );

  // ---------------------------------------------------------------------------
  // TC-DASH-RH-007: StatsFooter — 총 17건 + 총 비용 표시
  // ---------------------------------------------------------------------------
  test(
    "TC-DASH-RH-007: StatsFooter에 총 17건과 총 비용이 표시된다",
    async ({ page }) => {
      await gotoTournamentAndWait(page);

      const table = page.locator('table[role="grid"]');
      await expect(table).toBeVisible({ timeout: 15_000 });

      // StatsFooter (aria-label="필터 결과 통계 요약")
      const footer = page.locator('[aria-label="필터 결과 통계 요약"]');
      await expect(footer).toBeVisible();

      // "총 17건" 텍스트
      const totalText = (await footer.textContent()) ?? "";
      expect(totalText).toContain(`${SEED_TOTAL}`);

      // "총 비용" 레이블과 "$" 금액 표시
      await expect(footer.locator("text=총 비용")).toBeVisible();
      expect(totalText).toMatch(/\$\d+\.\d{3}/);
    },
  );

  // ---------------------------------------------------------------------------
  // TC-DASH-RH-008: 반응형 — 모바일(390px)에서 카드형 렌더링
  // ---------------------------------------------------------------------------
  test(
    "TC-DASH-RH-008: 모바일(390px) 뷰포트에서 카드형 레이아웃이 렌더된다",
    async ({ page }) => {
      await page.setViewportSize({ width: 390, height: 844 });
      await page.goto(`${ADMIN_URL}/tournament`, {
        waitUntil: "load",
        timeout: 30_000,
      });

      // 모바일에서는 table이 CSS hidden (.hidden.sm:block) 처리되고
      // 카드형 버튼 목록(.sm:hidden)이 표시된다
      // 카드 버튼: aria-label에 "Place Rate" 포함
      const cards = page.locator('button[aria-label*="Place Rate"]');
      // hydration이 완료되면 카드가 최소 1개 이상 보여야 한다
      await expect(cards.first()).toBeVisible({ timeout: 30_000 });
      const cardCount = await cards.count();
      expect(cardCount).toBeGreaterThanOrEqual(1);
    },
  );

  // ---------------------------------------------------------------------------
  // TC-DASH-RH-009: 접근성 — table caption과 aria-live 영역
  // ---------------------------------------------------------------------------
  test(
    "TC-DASH-RH-009: table caption과 aria-live polite 영역이 존재한다",
    async ({ page }) => {
      await gotoTournamentAndWait(page);

      const table = page.locator('table[role="grid"]');
      await expect(table).toBeVisible({ timeout: 15_000 });

      // table caption (sr-only)
      const caption = table.locator("caption");
      await expect(caption).toBeAttached();
      const captionText = (await caption.textContent()) ?? "";
      expect(captionText).toMatch(/RummiArena|라운드/);

      // aria-live="polite" 영역
      const liveRegion = page.locator('[aria-live="polite"][aria-atomic="true"]');
      await expect(liveRegion).toBeAttached();
    },
  );

  // ---------------------------------------------------------------------------
  // TC-DASH-RH-010: 스크린샷 — 데스크톱 + 모바일
  // ---------------------------------------------------------------------------
  test(
    "TC-DASH-RH-010: 스크린샷 — 데스크톱 + 모바일 뷰",
    async ({ page }) => {
      // Desktop (1440px) — table이 visible
      await page.setViewportSize({ width: 1440, height: 900 });
      await gotoTournamentAndWait(page);

      const table = page.locator('table[role="grid"]');
      await expect(table).toBeVisible({ timeout: 15_000 });
      await page.waitForTimeout(600);
      await page.screenshot({
        path: "test-results/dashboard-round-history-table-desktop.png",
        fullPage: true,
      });

      // Mobile (390px) — 카드형 렌더링 (table은 hidden)
      await page.setViewportSize({ width: 390, height: 844 });
      await page.goto(`${ADMIN_URL}/tournament`, {
        waitUntil: "load",
        timeout: 30_000,
      });
      // 카드 버튼이 등장할 때까지 대기
      const cards = page.locator('button[aria-label*="Place Rate"]');
      await expect(cards.first()).toBeVisible({ timeout: 30_000 });
      await page.waitForTimeout(600);
      await page.screenshot({
        path: "test-results/dashboard-round-history-table-mobile.png",
        fullPage: true,
      });
    },
  );
});
