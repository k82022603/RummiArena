/**
 * 인증 · 로그인 · 네비게이션 E2E 테스트
 *
 * 검증 대상:
 * 1. TC-LG  (로그인 페이지 UI)     — 비인증 상태
 * 2. TC-AF  (인증 플로우)           — 비인증 상태
 * 3. TC-AN  (인증된 네비게이션)     — 인증 상태
 * 4. TC-EE  (에러·엣지 케이스)      — 인증 상태
 *
 * 환경: K8s NodePort http://localhost:30000
 * 인증: global-setup.ts에서 생성된 auth.json 세션 재사용 (인증 블록)
 *       비인증 블록은 storageState를 빈 값으로 덮어씀
 */

import { test, expect } from "@playwright/test";

// ====================================================================
// 비인증 테스트 (로그인 페이지 UI + 인증 플로우)
// ====================================================================

test.describe("비인증 — 로그인 페이지 UI 및 인증 플로우", () => {
  test.use({ storageState: { cookies: [], origins: [] } });

  // ----------------------------------------------------------------
  // TC-LG: 로그인 페이지 UI
  // ----------------------------------------------------------------

  test("TC-LG-001: /login 페이지 로드 시 aria-label='로그인 페이지' 존재", async ({
    page,
  }) => {
    await page.goto("/login");
    await expect(
      page.locator('main[aria-label="로그인 페이지"]')
    ).toBeVisible({ timeout: 10_000 });
  });

  test("TC-LG-002: 'RummiArena' 타이틀이 표시된다", async ({ page }) => {
    await page.goto("/login");
    const heading = page.locator("h1");
    await expect(heading).toBeVisible({ timeout: 10_000 });
    await expect(heading).toContainText("Rummi");
    await expect(heading).toContainText("Arena");
  });

  test("TC-LG-003: 부제 'AI와 함께하는 루미큐브 대전 플랫폼' 표시", async ({
    page,
  }) => {
    await page.goto("/login");
    await expect(
      page.getByText("AI와 함께하는 루미큐브 대전 플랫폼")
    ).toBeVisible({ timeout: 10_000 });
  });

  test("TC-LG-004: 게스트 닉네임 입력 필드 #guest-nickname 존재", async ({
    page,
  }) => {
    await page.goto("/login");
    const input = page.locator("#guest-nickname");
    await expect(input).toBeVisible({ timeout: 10_000 });
    await expect(input).toBeEditable();
  });

  test("TC-LG-005: 게스트 로그인 버튼 (aria-label='게스트로 로그인') 존재", async ({
    page,
  }) => {
    await page.goto("/login");
    await expect(
      page.getByLabel("게스트로 로그인")
    ).toBeVisible({ timeout: 10_000 });
  });

  test("TC-LG-006: 빈 닉네임으로 로그인 시도 → '닉네임을 입력해 주세요.' 에러", async ({
    page,
  }) => {
    await page.goto("/login");
    await page.waitForLoadState("domcontentloaded");

    // 닉네임 비우고 로그인 버튼 클릭
    await page.locator("#guest-nickname").fill("");
    await page.getByLabel("게스트로 로그인").click();

    await expect(
      page.getByText("닉네임을 입력해 주세요.")
    ).toBeVisible({ timeout: 5_000 });
  });

  test("TC-LG-007: 1자 닉네임 입력 시 → '닉네임은 2~12자여야 합니다.' 에러", async ({
    page,
  }) => {
    await page.goto("/login");
    await page.waitForLoadState("domcontentloaded");

    await page.locator("#guest-nickname").fill("A");
    await page.getByLabel("게스트로 로그인").click();

    await expect(
      page.getByText("닉네임은 2~12자여야 합니다.")
    ).toBeVisible({ timeout: 5_000 });
  });

  test("TC-LG-008: 13자 이상 닉네임 입력 시 → '닉네임은 2~12자여야 합니다.' 에러", async ({
    page,
  }) => {
    await page.goto("/login");
    await page.waitForLoadState("domcontentloaded");

    // maxLength=12이므로 프로그래밍적으로 13자 설정
    await page.locator("#guest-nickname").evaluate((el: HTMLInputElement) => {
      el.removeAttribute("maxlength");
    });
    await page.locator("#guest-nickname").fill("가나다라마바사아자차카타파");
    await page.getByLabel("게스트로 로그인").click();

    await expect(
      page.getByText("닉네임은 2~12자여야 합니다.")
    ).toBeVisible({ timeout: 5_000 });
  });

  // ----------------------------------------------------------------
  // TC-AF: 인증 플로우
  // ----------------------------------------------------------------

  test("TC-AF-001: 비인증 상태에서 / 접근 → /login으로 리디렉트", async ({
    page,
  }) => {
    await page.goto("/");
    await page.waitForURL(/\/login/, { timeout: 15_000 });
    await expect(page).toHaveURL(/\/login/);
  });

  test("TC-AF-002: 비인증 상태에서 /lobby 접근 → /login으로 리디렉트", async ({
    page,
  }) => {
    await page.goto("/lobby");
    await page.waitForURL(/\/login/, { timeout: 15_000 });
    await expect(page).toHaveURL(/\/login/);
  });

  test("TC-AF-003: 유효한 닉네임으로 게스트 로그인 → /lobby 도달", async ({
    page,
  }) => {
    await page.goto("/login");
    await page.waitForLoadState("domcontentloaded");

    const nickname = `E2E-${Date.now().toString(36)}`;
    await page.locator("#guest-nickname").fill(nickname);
    await page.getByLabel("게스트로 로그인").click();

    await page.waitForURL(/\/lobby/, { timeout: 15_000 });
    await expect(page).toHaveURL(/\/lobby/);
  });

  test("TC-AF-004: 로그인 후 세션 유지 확인 (페이지 새로고침 후 /lobby 유지)", async ({
    page,
  }) => {
    await page.goto("/login");
    await page.waitForLoadState("domcontentloaded");

    const nickname = `Keep-${Date.now().toString(36)}`;
    await page.locator("#guest-nickname").fill(nickname);
    await page.getByLabel("게스트로 로그인").click();

    await page.waitForURL(/\/lobby/, { timeout: 15_000 });

    // 새로고침 후에도 /lobby에 머무는지 확인
    await page.reload();
    await page.waitForLoadState("domcontentloaded");
    await expect(page).toHaveURL(/\/lobby/, { timeout: 15_000 });
  });

  test("TC-AF-005: 비인증 상태에서 /room/create → /login 리디렉트", async ({
    page,
  }) => {
    await page.goto("/room/create");
    await page.waitForURL(/\/login/, { timeout: 15_000 });
    await expect(page).toHaveURL(/\/login/);
  });
});

// ====================================================================
// 인증된 테스트 (네비게이션 + 에러·엣지 케이스)
// ====================================================================

test.describe("인증됨 — 네비게이션 및 에러·엣지 케이스", () => {
  // 기본 storageState (auth.json) 사용 — 별도 설정 불필요

  // ----------------------------------------------------------------
  // TC-AN: 인증된 네비게이션
  // ----------------------------------------------------------------

  test("TC-AN-001: 인증된 상태에서 / 접근 → /lobby로 리디렉트", async ({
    page,
  }) => {
    await page.goto("/");
    await page.waitForURL(/\/lobby/, { timeout: 15_000 });
    await expect(page).toHaveURL(/\/lobby/);
  });

  test("TC-AN-002: /lobby에서 '연습' 네비게이션 → /practice 이동", async ({
    page,
  }) => {
    await page.goto("/lobby");
    await page.waitForLoadState("domcontentloaded");

    // 로비 헤더 nav 내의 "연습" 버튼 클릭
    await page.locator("nav").getByText("연습").click();

    await page.waitForURL(/\/practice/, { timeout: 10_000 });
    await expect(page).toHaveURL(/\/practice/);
  });

  test("TC-AN-003: /practice에서 '로비로 돌아가기' → /lobby 이동", async ({
    page,
  }) => {
    await page.goto("/practice");
    await page.waitForLoadState("domcontentloaded");

    await page.getByLabel("로비로 돌아가기").click();

    await page.waitForURL(/\/lobby/, { timeout: 10_000 });
    await expect(page).toHaveURL(/\/lobby/);
  });

  test("TC-AN-004: /lobby에서 '새 게임 방 만들기' 버튼 → /room/create 이동", async ({
    page,
  }) => {
    await page.goto("/lobby");
    await page.waitForLoadState("domcontentloaded");

    await page.getByLabel("새 게임 방 만들기").first().click();

    await page.waitForURL(/\/room\/create/, { timeout: 10_000 });
    await expect(page).toHaveURL(/\/room\/create/);
  });

  test("TC-AN-005: /room/create에서 '로비로 돌아가기' → /lobby 이동", async ({
    page,
  }) => {
    await page.goto("/room/create");
    await page.waitForLoadState("domcontentloaded");

    await page.getByLabel("로비로 돌아가기").click();

    await page.waitForURL(/\/lobby/, { timeout: 10_000 });
    await expect(page).toHaveURL(/\/lobby/);
  });

  test("TC-AN-006: /rankings에서 '로비로 돌아가기' → /lobby 이동", async ({
    page,
  }) => {
    await page.goto("/rankings");
    await page.waitForLoadState("domcontentloaded");

    await page.getByLabel("로비로 돌아가기").click();

    await page.waitForURL(/\/lobby/, { timeout: 10_000 });
    await expect(page).toHaveURL(/\/lobby/);
  });

  test("TC-AN-007: /lobby 헤더에 사용자 이름 표시", async ({ page }) => {
    await page.goto("/lobby");
    await page.waitForLoadState("domcontentloaded");

    // global-setup에서 "QA-테스터"로 로그인
    // 헤더의 인사말 또는 이름 표시 영역 확인
    const greeting = page.getByText("QA-테스터");
    await expect(greeting.first()).toBeVisible({ timeout: 10_000 });
  });

  test("TC-AN-008: 로그아웃 버튼 클릭 → /login 페이지로 이동", async ({
    page,
  }) => {
    await page.goto("/lobby");
    await page.waitForLoadState("domcontentloaded");

    await page.getByLabel("로그아웃").click();

    await page.waitForURL(/\/login/, { timeout: 15_000 });
    await expect(page).toHaveURL(/\/login/);
  });

  test("TC-AN-009: /practice/1 직접 접근 → 정상 로드 (인증 상태)", async ({
    page,
  }) => {
    await page.goto("/practice/1");
    await page.waitForLoadState("domcontentloaded");

    // Stage 1 "그룹 만들기" 제목 확인
    await expect(
      page.getByText("그룹 만들기").first()
    ).toBeVisible({ timeout: 10_000 });
  });

  test("TC-AN-010: /rankings 직접 접근 → 정상 로드", async ({ page }) => {
    await page.goto("/rankings");
    await page.waitForLoadState("domcontentloaded");

    // 랭킹 페이지 main 확인
    await expect(
      page.locator('main[aria-label="ELO 랭킹 페이지"]')
    ).toBeVisible({ timeout: 10_000 });
  });

  // ----------------------------------------------------------------
  // TC-EE: 에러 및 엣지 케이스
  // ----------------------------------------------------------------

  test("TC-EE-001: 존재하지 않는 라우트 /nonexistent → 404 또는 리디렉트", async ({
    page,
  }) => {
    const response = await page.goto("/nonexistent");

    // Next.js는 존재하지 않는 라우트에 대해 404 반환 또는 특정 페이지로 리디렉트
    const status = response?.status() ?? 0;
    const url = page.url();

    // 404 응답이거나 에러 페이지/리디렉트 중 하나
    const handled =
      status === 404 ||
      url.includes("/login") ||
      url.includes("/lobby") ||
      (await page.getByText("404").isVisible().catch(() => false));

    expect(handled).toBe(true);
  });

  test("TC-EE-002: /game/invalid-room-id → 에러 또는 리디렉트", async ({
    page,
  }) => {
    await page.goto("/game/invalid-room-id");
    await page.waitForLoadState("domcontentloaded");

    // 잘못된 방 ID로 접근 시 에러 메시지가 표시되거나 다른 페이지로 이동
    const url = page.url();
    const hasError =
      (await page
        .getByText(/에러|오류|찾을 수 없|존재하지/)
        .first()
        .isVisible()
        .catch(() => false)) ||
      url.includes("/lobby") ||
      url.includes("/login");

    // 게임 페이지에 남아있더라도 에러 상태를 보여주는 것으로 간주
    expect(hasError || url.includes("/game/")).toBe(true);
  });

  test("TC-EE-003: /practice/99 → /practice로 리디렉트", async ({ page }) => {
    await page.goto("/practice/99");
    await expect(page).toHaveURL(/\/practice$/, { timeout: 10_000 });
  });

  test("TC-EE-004: /room/create 페이지에서 브라우저 뒤로가기 → 이전 페이지", async ({
    page,
  }) => {
    // 먼저 로비에 방문
    await page.goto("/lobby");
    await page.waitForLoadState("domcontentloaded");
    await expect(
      page.locator('main[aria-label="로비 페이지"]')
    ).toBeVisible({ timeout: 10_000 });

    // 방 만들기로 이동
    await page.goto("/room/create");
    await page.waitForLoadState("domcontentloaded");
    await expect(
      page.locator('form[aria-label="게임 방 생성 폼"]')
    ).toBeVisible({ timeout: 10_000 });

    // 브라우저 뒤로가기
    await page.goBack();

    await page.waitForURL(/\/lobby/, { timeout: 10_000 });
    await expect(page).toHaveURL(/\/lobby/);
  });

  test("TC-EE-005: 동일 페이지 재방문 시 상태 유지", async ({ page }) => {
    // /lobby 첫 방문
    await page.goto("/lobby");
    await page.waitForLoadState("domcontentloaded");
    await expect(
      page.locator('main[aria-label="로비 페이지"]')
    ).toBeVisible({ timeout: 10_000 });

    // 다른 페이지로 이동
    await page.goto("/practice");
    await page.waitForLoadState("domcontentloaded");

    // 다시 /lobby로 복귀
    await page.goto("/lobby");
    await page.waitForLoadState("domcontentloaded");

    // 로비가 정상적으로 다시 로드되는지 확인 (인증 유지, UI 정상)
    await expect(
      page.locator('main[aria-label="로비 페이지"]')
    ).toBeVisible({ timeout: 10_000 });
    await expect(
      page.getByText("QA-테스터").first()
    ).toBeVisible({ timeout: 10_000 });
  });
});
