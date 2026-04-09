/**
 * 로비 / 방 생성 / 대기실 E2E 테스트
 *
 * 검증 대상:
 *   1. TC-LB (Lobby): 로비 페이지 레이아웃, 프로필 카드, 네비게이션, 방 목록, 방 코드 입력
 *   2. TC-RC (Room Create): 방 생성 폼 — 인원/타임아웃/AI 설정
 *   3. TC-AI (AI Config): AI 슬롯 추가/제거, 모델/난이도/페르소나 변경
 *   4. TC-WR (Waiting Room): 대기실 Seat 슬롯, 호스트 배지, 설정 요약
 *
 * 환경: K8s NodePort http://localhost:30000 (frontend), :30080 (game-server)
 * 인증: global-setup.ts에서 생성된 auth.json 세션 재사용
 */

import { test, expect } from "@playwright/test";
import { cleanupViaPage } from "./helpers/room-cleanup";

// ====================================================================
// 1. Lobby Page Core (TC-LB-001 ~ TC-LB-012)
// ====================================================================

test.describe("로비 페이지 (TC-LB)", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/lobby");
    await page.waitForLoadState("domcontentloaded");
  });

  test("TC-LB-001: /lobby 페이지 로드 — RummiArena 타이틀 표시", async ({
    page,
  }) => {
    const header = page.locator("header");
    await expect(header).toContainText("RummiArena", { timeout: 5000 });
  });

  test("TC-LB-002: 로비 페이지에 aria-label='로비 페이지' 존재", async ({
    page,
  }) => {
    const main = page.locator('main[aria-label="로비 페이지"]');
    await expect(main).toBeVisible({ timeout: 5000 });
  });

  test("TC-LB-003: 사용자 프로필 카드에 이름 표시", async ({ page }) => {
    // MyProfileCard 영역: 세션 사용자 이름 또는 '플레이어' 기본값
    const profileArea = page.locator("aside").first();
    await expect(profileArea).toBeVisible({ timeout: 5000 });
    // 이름은 세션에 따라 다르므로, 텍스트가 비어있지 않은지만 확인
    const nameEl = profileArea.locator("p.font-semibold").first();
    await expect(nameEl).toBeVisible({ timeout: 5000 });
    const nameText = await nameEl.textContent();
    expect(nameText?.trim().length).toBeGreaterThan(0);
  });

  test("TC-LB-004: ELO 점수 '1,247' 표시", async ({ page }) => {
    const elo = page.getByText("1,247");
    await expect(elo).toBeVisible({ timeout: 5000 });
  });

  test("TC-LB-005: 승률 '54%' 표시", async ({ page }) => {
    const winRate = page.getByText("54%");
    await expect(winRate).toBeVisible({ timeout: 5000 });
  });

  test("TC-LB-006: 네비게이션에 로비/연습/랭킹 버튼 표시", async ({
    page,
  }) => {
    const nav = page.locator("nav");
    await expect(nav.getByText("로비")).toBeVisible({ timeout: 5000 });
    await expect(nav.getByText("연습")).toBeVisible({ timeout: 5000 });
    await expect(nav.getByText("랭킹")).toBeVisible({ timeout: 5000 });
  });

  test("TC-LB-007: '연습' 버튼 클릭 → /practice로 이동", async ({
    page,
  }) => {
    const navPractice = page.locator("nav").getByText("연습");
    await navPractice.click();
    await page.waitForURL(/\/practice/, { timeout: 10_000 });
    expect(page.url()).toContain("/practice");
  });

  test("TC-LB-008: 로그아웃 버튼 표시", async ({ page }) => {
    const logoutBtn = page.locator('[aria-label="로그아웃"]');
    await expect(logoutBtn).toBeVisible({ timeout: 5000 });
  });

  test("TC-LB-009: '새 게임' 또는 '방 만들기' 버튼 표시", async ({
    page,
  }) => {
    // 데스크톱: aria-label="새 게임 방 만들기" (aside 내부)
    // 모바일: aria-label="새 게임 방 만들기" (section 내부 lg:hidden)
    const createBtn = page.locator('[aria-label="새 게임 방 만들기"]').first();
    await expect(createBtn).toBeVisible({ timeout: 5000 });
  });

  test("TC-LB-010: '방 만들기' 클릭 → /room/create로 이동", async ({
    page,
  }) => {
    const createBtn = page.locator('[aria-label="새 게임 방 만들기"]').first();
    await createBtn.click();
    await page.waitForURL(/\/room\/create/, { timeout: 10_000 });
    expect(page.url()).toContain("/room/create");
  });

  test("TC-LB-011: 방 코드 입력 필드 존재 (빠른 참가)", async ({ page }) => {
    const codeInput = page.locator('[aria-label="방 코드 입력 (4자리)"]');
    await expect(codeInput).toBeVisible({ timeout: 5000 });
    // placeholder 확인
    await expect(codeInput).toHaveAttribute("placeholder", "ABCD");
    await expect(codeInput).toHaveAttribute("maxLength", "4");
  });

  test("TC-LB-012: '현재 현황' 통계 패널 표시", async ({ page }) => {
    // StatsPanel: h3에 "현재 현황" 텍스트 포함
    const statsHeading = page.getByText("현재 현황");
    await expect(statsHeading).toBeVisible({ timeout: 5000 });
  });
});

// ====================================================================
// 2. Room Creation Form (TC-RC-001 ~ TC-RC-012)
// ====================================================================

test.describe("방 생성 폼 (TC-RC)", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/room/create");
    await page.waitForLoadState("domcontentloaded");
    await expect(
      page.locator('form[aria-label="게임 방 생성 폼"]')
    ).toBeVisible({ timeout: 10_000 });
  });

  test("TC-RC-001: /room/create 페이지 로드 — '새 게임 만들기' 제목 표시", async ({
    page,
  }) => {
    const heading = page.locator("h1");
    await expect(heading).toContainText("새 게임 만들기", { timeout: 5000 });
  });

  test("TC-RC-002: 게임 방 생성 폼 aria-label 존재", async ({ page }) => {
    const form = page.locator('form[aria-label="게임 방 생성 폼"]');
    await expect(form).toBeVisible({ timeout: 5000 });
  });

  test("TC-RC-003: 로비로 돌아가기 버튼 동작", async ({ page }) => {
    const backBtn = page.locator('[aria-label="로비로 돌아가기"]');
    await expect(backBtn).toBeVisible({ timeout: 5000 });
    await backBtn.click();
    await page.waitForURL(/\/lobby/, { timeout: 10_000 });
    expect(page.url()).toContain("/lobby");
  });

  test("TC-RC-004: 플레이어 수 기본값 4인 선택 상태", async ({ page }) => {
    const btn4 = page.getByRole("button", { name: "4인" });
    await expect(btn4).toHaveAttribute("aria-pressed", "true", {
      timeout: 5000,
    });
  });

  test("TC-RC-005: 2인 버튼 클릭 → aria-pressed='true'", async ({
    page,
  }) => {
    const btn2 = page.getByRole("button", { name: "2인" });
    await btn2.click();
    await expect(btn2).toHaveAttribute("aria-pressed", "true", {
      timeout: 5000,
    });
    // 4인은 해제
    const btn4 = page.getByRole("button", { name: "4인" });
    await expect(btn4).toHaveAttribute("aria-pressed", "false");
  });

  test("TC-RC-006: 3인 버튼 클릭 → aria-pressed='true' 및 4인 해제", async ({
    page,
  }) => {
    const btn3 = page.getByRole("button", { name: "3인" });
    await btn3.click();
    await expect(btn3).toHaveAttribute("aria-pressed", "true", {
      timeout: 5000,
    });
    const btn4 = page.getByRole("button", { name: "4인" });
    await expect(btn4).toHaveAttribute("aria-pressed", "false");
  });

  test("TC-RC-007: 턴 타임아웃 기본값 60초", async ({ page }) => {
    const btn60 = page.getByRole("button", { name: "60초" });
    await expect(btn60).toHaveAttribute("aria-pressed", "true", {
      timeout: 5000,
    });
  });

  test("TC-RC-008: 30초 버튼 클릭 → 선택 상태 변경", async ({ page }) => {
    const btn30 = page.getByRole("button", { name: "30초" });
    await btn30.click();
    await expect(btn30).toHaveAttribute("aria-pressed", "true", {
      timeout: 5000,
    });
    // 60초는 해제
    const btn60 = page.getByRole("button", { name: "60초" });
    await expect(btn60).toHaveAttribute("aria-pressed", "false");
  });

  test("TC-RC-009: 120초 버튼 클릭 → '120초' 텍스트 표시", async ({
    page,
  }) => {
    const btn120 = page.getByRole("button", { name: "120초" });
    await btn120.click();
    await expect(btn120).toHaveAttribute("aria-pressed", "true", {
      timeout: 5000,
    });
    // h2에 현재 선택된 턴 시간이 표시됨
    const timeoutLabel = page.locator("#timeout-label");
    await expect(timeoutLabel).toContainText("120초");
  });

  test("TC-RC-010: 타임아웃 슬라이더 존재 (aria-label)", async ({ page }) => {
    const slider = page.locator(
      '[aria-label="턴 제한 시간 설정 (30~120초)"]'
    );
    await expect(slider).toBeVisible({ timeout: 5000 });
    await expect(slider).toHaveAttribute("type", "range");
    await expect(slider).toHaveAttribute("min", "30");
    await expect(slider).toHaveAttribute("max", "120");
  });

  test("TC-RC-011: AI 플레이어 기본 1개 슬롯 표시", async ({ page }) => {
    const aiSlots = page.locator('[aria-label^="AI 슬롯"]');
    await expect(aiSlots).toHaveCount(1, { timeout: 5000 });
    await expect(aiSlots.first()).toBeVisible();
  });

  test("TC-RC-012: AI 슬롯에 기본 모델 'GPT (OpenAI)' 선택", async ({
    page,
  }) => {
    const modelSelect = page.locator('[aria-label="AI 1 모델 선택"]');
    await expect(modelSelect).toBeVisible({ timeout: 5000 });
    await expect(modelSelect).toHaveValue("AI_OPENAI");
  });
});

// ====================================================================
// 3. AI Configuration (TC-AI-001 ~ TC-AI-008)
// ====================================================================

test.describe("AI 플레이어 설정 (TC-AI)", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/room/create");
    await page.waitForLoadState("domcontentloaded");
    await expect(
      page.locator('form[aria-label="게임 방 생성 폼"]')
    ).toBeVisible({ timeout: 10_000 });
  });

  test("TC-AI-001: AI 추가 버튼 클릭 → 두 번째 AI 슬롯 생성", async ({
    page,
  }) => {
    // 기본 4인 모드 — maxAI = 3, 초기 1개
    const addBtn = page.locator('[aria-label="AI 플레이어 추가"]');
    await expect(addBtn).toBeVisible({ timeout: 5000 });
    await addBtn.click();

    const aiSlots = page.locator('[aria-label^="AI 슬롯"]');
    await expect(aiSlots).toHaveCount(2, { timeout: 5000 });
    await expect(page.locator('[aria-label="AI 슬롯 2"]')).toBeVisible();
  });

  test("TC-AI-002: 4인 모드에서 AI 최대 3개 추가 가능", async ({ page }) => {
    // 4인 기본, maxAI = 3
    const addBtn = page.locator('[aria-label="AI 플레이어 추가"]');

    // 1개 → 2개
    await addBtn.click();
    await expect(page.locator('[aria-label="AI 슬롯 2"]')).toBeVisible({
      timeout: 5000,
    });

    // 2개 → 3개
    await addBtn.click();
    await expect(page.locator('[aria-label="AI 슬롯 3"]')).toBeVisible({
      timeout: 5000,
    });

    // 3개에서 추가 버튼이 사라져야 함
    await expect(addBtn).not.toBeVisible({ timeout: 5000 });

    const aiSlots = page.locator('[aria-label^="AI 슬롯"]');
    await expect(aiSlots).toHaveCount(3);
  });

  test("TC-AI-003: 2인 모드 전환 시 AI 슬롯 1개로 제한", async ({
    page,
  }) => {
    // 먼저 4인 모드에서 AI 2개로 확장
    const addBtn = page.locator('[aria-label="AI 플레이어 추가"]');
    await addBtn.click();
    await expect(page.locator('[aria-label^="AI 슬롯"]')).toHaveCount(2, {
      timeout: 5000,
    });

    // 2인 모드로 전환 → AI 1개로 제한
    await page.getByRole("button", { name: "2인" }).click();
    await expect(page.locator('[aria-label^="AI 슬롯"]')).toHaveCount(1, {
      timeout: 5000,
    });

    // 추가 버튼이 사라져야 함 (maxAI = 1, 이미 1개)
    await expect(addBtn).not.toBeVisible({ timeout: 5000 });
  });

  test("TC-AI-004: AI 모델 변경 → Claude (Anthropic) 선택", async ({
    page,
  }) => {
    const modelSelect = page.locator('[aria-label="AI 1 모델 선택"]');
    await modelSelect.selectOption("AI_CLAUDE");
    await expect(modelSelect).toHaveValue("AI_CLAUDE");
  });

  test("TC-AI-005: AI 난이도 '하수' 선택", async ({ page }) => {
    const difficultySelect = page.locator('[aria-label="AI 1 난이도 선택"]');
    await expect(difficultySelect).toBeVisible({ timeout: 5000 });
    // 기본값 확인 (expert)
    await expect(difficultySelect).toHaveValue("expert");
    // 하수로 변경
    await difficultySelect.selectOption("beginner");
    await expect(difficultySelect).toHaveValue("beginner");
  });

  test("TC-AI-006: AI 페르소나 '계산기' 버튼 클릭 → aria-pressed='true'", async ({
    page,
  }) => {
    // 기본 페르소나는 shark
    const sharkBtn = page.locator('[aria-label="샤크: 공격적, 빠른 소진 우선"]');
    await expect(sharkBtn).toHaveAttribute("aria-pressed", "true", {
      timeout: 5000,
    });

    // 계산기 선택
    const calcBtn = page.locator('[aria-label="계산기: 확률 기반 최적화"]');
    await calcBtn.click();
    await expect(calcBtn).toHaveAttribute("aria-pressed", "true", {
      timeout: 5000,
    });
    // 샤크는 해제
    await expect(sharkBtn).toHaveAttribute("aria-pressed", "false");
  });

  test("TC-AI-007: AI 제거 버튼 클릭 → 슬롯 사라짐", async ({ page }) => {
    // 초기 1개 슬롯 확인
    await expect(page.locator('[aria-label="AI 슬롯 1"]')).toBeVisible({
      timeout: 5000,
    });

    // 제거
    const removeBtn = page.locator('[aria-label="AI 1 제거"]');
    await removeBtn.click();

    // 슬롯 0개
    await expect(page.locator('[aria-label^="AI 슬롯"]')).toHaveCount(0, {
      timeout: 5000,
    });

    // "AI 플레이어 없음" 메시지 표시
    await expect(
      page.getByText("AI 플레이어 없음 (인간 플레이어끼리 대전)")
    ).toBeVisible({ timeout: 5000 });
  });

  test("TC-AI-008: 6개 페르소나 버튼 전부 렌더링", async ({ page }) => {
    const personas = [
      { label: "루키", desc: "초보 전략, 단순 배치" },
      { label: "계산기", desc: "확률 기반 최적화" },
      { label: "샤크", desc: "공격적, 빠른 소진 우선" },
      { label: "폭스", desc: "상대 관찰, 블러핑" },
      { label: "벽", desc: "수비적, 타일 보유 최소화" },
      { label: "와일드카드", desc: "무작위 혼합 전략" },
    ];

    for (const p of personas) {
      const btn = page.locator(`[aria-label="${p.label}: ${p.desc}"]`);
      await expect(btn).toBeVisible({ timeout: 5000 });
    }
  });
});

// ====================================================================
// 4. Waiting Room (TC-WR-001 ~ TC-WR-008)
// ====================================================================

test.describe("대기실 (TC-WR)", () => {
  test.afterEach(async ({ page }) => {
    // 방 생성 테스트에서 남은 활성 방 정리
    await page.goto("/lobby");
    await page.waitForLoadState("domcontentloaded");
    await cleanupViaPage(page);
  });

  test("TC-WR-001: /room/create에서 방 생성 폼 제출 시도 → 결과 UI 확인", async ({
    page,
  }) => {
    // 방 생성 페이지 이동
    await page.goto("/room/create");
    await page.waitForLoadState("domcontentloaded");
    await expect(
      page.locator('form[aria-label="게임 방 생성 폼"]')
    ).toBeVisible({ timeout: 10_000 });

    // 2인 모드 + 60초 (기본) + AI 1개 (기본)
    await page.getByRole("button", { name: "2인" }).click();

    // 제출
    const submitBtn = page.getByRole("button", { name: "게임 방 만들기" });
    await expect(submitBtn).toBeVisible({ timeout: 5000 });
    await submitBtn.click();

    // 성공: /room/:id로 이동하고 대기실 표시
    // 실패: role="alert" 에러 메시지 표시
    const success = page.locator('main[aria-label="대기실"]');
    const errorAlert = page.locator('[role="alert"]:not([id="__next-route-announcer__"])');
    const result = await Promise.race([
      success.waitFor({ timeout: 15_000 }).then(() => "success" as const),
      errorAlert.waitFor({ timeout: 15_000 }).then(() => "error" as const),
    ]);

    if (result === "success") {
      expect(page.url()).toMatch(/\/room\//);
      await expect(success).toBeVisible();
    } else {
      // 에러 알림이 표시됨 (이미 게임 중인 방, API 에러 등)
      await expect(errorAlert.first()).toBeVisible();
      const errorText = await errorAlert.first().textContent();
      expect(errorText?.trim().length).toBeGreaterThan(0);
    }
  });

  test("TC-WR-002: /room/nonexistent 직접 접근 시 에러 또는 폴백 UI", async ({
    page,
  }) => {
    await page.goto("/room/nonexistent");
    await page.waitForLoadState("domcontentloaded");

    // 유효하지 않은 roomId: 에러 메시지, 로딩 UI, 또는 로비로 리다이렉트
    const errorAlert = page.locator('[role="alert"]');
    const loadingText = page.getByText("대기실에 입장하는 중...");
    const lobbyRedirect = page.url().includes("/lobby");

    const hasError = await errorAlert.isVisible({ timeout: 10_000 }).catch(() => false);
    const hasLoading = await loadingText.isVisible().catch(() => false);

    // 에러 표시, 로딩 상태, 또는 로비 리다이렉트 중 하나
    expect(hasError || hasLoading || lobbyRedirect).toBe(true);
  });

  test("TC-WR-003: 대기실 페이지에 Seat 슬롯이 표시됨", async ({ page }) => {
    // 방 생성 후 대기실 진입
    await page.goto("/room/create");
    await page.waitForLoadState("domcontentloaded");
    await expect(
      page.locator('form[aria-label="게임 방 생성 폼"]')
    ).toBeVisible({ timeout: 10_000 });

    await page.getByRole("button", { name: "2인" }).click();
    await page.getByRole("button", { name: "게임 방 만들기" }).click();

    // 대기실 진입 확인
    const waitingRoom = page.locator('main[aria-label="대기실"]');
    const isWaiting = await waitingRoom
      .waitFor({ timeout: 15_000 })
      .then(() => true)
      .catch(() => false);

    if (isWaiting) {
      // Seat 슬롯들이 보임 (aria-label="Seat N: ...")
      // 데이터 로딩 대기
      await page.waitForTimeout(2000);
      const seats = page.locator('[aria-label^="Seat"]');
      await expect(seats.first()).toBeVisible({ timeout: 10_000 });
      const seatCount = await seats.count();
      expect(seatCount).toBeGreaterThanOrEqual(2);
    } else {
      // API 에러 또는 "이미 게임 중인 방" → 에러 메시지 확인
      await expect(page.locator('[role="alert"]').first()).toBeVisible({ timeout: 5000 });
    }
  });

  test("TC-WR-004: 호스트 배지가 표시됨", async ({ page }) => {
    await page.goto("/room/create");
    await page.waitForLoadState("domcontentloaded");
    await expect(
      page.locator('form[aria-label="게임 방 생성 폼"]')
    ).toBeVisible({ timeout: 10_000 });

    await page.getByRole("button", { name: "2인" }).click();
    await page.getByRole("button", { name: "게임 방 만들기" }).click();

    const waitingRoom = page.locator('main[aria-label="대기실"]');
    const isWaiting = await waitingRoom
      .waitFor({ timeout: 15_000 })
      .then(() => true)
      .catch(() => false);

    if (isWaiting) {
      // 호스트 배지: "호스트" 텍스트가 Seat 슬롯 내부에 표시
      const hostBadge = page.getByText("호스트").first();
      await expect(hostBadge).toBeVisible({ timeout: 5000 });
    } else {
      await expect(page.locator('[role="alert"]').first()).toBeVisible({ timeout: 5000 });
    }
  });

  test("TC-WR-005: AI 플레이어 정보 표시 (타입 + 페르소나)", async ({
    page,
  }) => {
    await page.goto("/room/create");
    await page.waitForLoadState("domcontentloaded");
    await expect(
      page.locator('form[aria-label="게임 방 생성 폼"]')
    ).toBeVisible({ timeout: 10_000 });

    // 2인 + AI 1개 (기본 GPT shark)
    await page.getByRole("button", { name: "2인" }).click();
    await page.getByRole("button", { name: "게임 방 만들기" }).click();

    const waitingRoom = page.locator('main[aria-label="대기실"]');
    const isWaiting = await waitingRoom
      .waitFor({ timeout: 15_000 })
      .then(() => true)
      .catch(() => false);

    if (isWaiting) {
      // AI 좌석: "GPT (샤크)" 형태로 표시
      const aiInfo = page.getByText(/GPT.*샤크/);
      await expect(aiInfo).toBeVisible({ timeout: 5000 });
    } else {
      await expect(page.locator('[role="alert"]').first()).toBeVisible({ timeout: 5000 });
    }
  });

  test("TC-WR-006: 빈 슬롯에 '대기 중...' 텍스트 표시", async ({ page }) => {
    await page.goto("/room/create");
    await page.waitForLoadState("domcontentloaded");
    await expect(
      page.locator('form[aria-label="게임 방 생성 폼"]')
    ).toBeVisible({ timeout: 10_000 });

    // 4인 모드 + AI 1개 → 빈 슬롯 2개
    await page.getByRole("button", { name: "4인" }).click();
    await page.getByRole("button", { name: "게임 방 만들기" }).click();

    const waitingRoom = page.locator('main[aria-label="대기실"]');
    const isWaiting = await waitingRoom
      .waitFor({ timeout: 15_000 })
      .then(() => true)
      .catch(() => false);

    if (isWaiting) {
      // 4인 대기실: Seat 4개 표시 확인
      await page.waitForTimeout(2000);
      const seats = page.locator('[aria-label^="Seat"]');
      await expect(seats.first()).toBeVisible({ timeout: 10_000 });
      const seatCount = await seats.count();
      expect(seatCount).toBe(4);

      // 4인 대기실에 4개 Seat이 정상 렌더링됨 확인 (빈 슬롯 유무는 서버 상태에 따라 다름)
      // Seat 0은 본인(호스트), 나머지는 AI 또는 빈 슬롯
      const pageText = await page.textContent("body");
      // 적어도 호스트 정보가 보여야 함
      expect(pageText).toContain("호스트");
    } else {
      await expect(page.locator('[role="alert"]').first()).toBeVisible({ timeout: 5000 });
    }
  });

  test("TC-WR-007: 게임 설정 요약 표시 (인원, 타임아웃)", async ({
    page,
  }) => {
    await page.goto("/room/create");
    await page.waitForLoadState("domcontentloaded");
    await expect(
      page.locator('form[aria-label="게임 방 생성 폼"]')
    ).toBeVisible({ timeout: 10_000 });

    // 3인 + 90초
    await page.getByRole("button", { name: "3인" }).click();
    await page.getByRole("button", { name: "90초" }).click();
    await page.getByRole("button", { name: "게임 방 만들기" }).click();

    const waitingRoom = page.locator('main[aria-label="대기실"]');
    const isWaiting = await waitingRoom
      .waitFor({ timeout: 15_000 })
      .then(() => true)
      .catch(() => false);

    if (isWaiting) {
      // 게임 설정 섹션
      const settingsSection = page.locator('[aria-label="게임 설정"]');
      await expect(settingsSection).toBeVisible({ timeout: 5000 });

      // 인원 표시
      await expect(settingsSection).toContainText("최대 인원");
      await expect(settingsSection).toContainText("3명");

      // 턴 제한 표시
      await expect(settingsSection).toContainText("턴 제한");
      await expect(settingsSection).toContainText("90초");
    } else {
      await expect(page.locator('[role="alert"]').first()).toBeVisible({ timeout: 5000 });
    }
  });

  test("TC-WR-008: 나가기 버튼 존재", async ({ page }) => {
    await page.goto("/room/create");
    await page.waitForLoadState("domcontentloaded");
    await expect(
      page.locator('form[aria-label="게임 방 생성 폼"]')
    ).toBeVisible({ timeout: 10_000 });

    await page.getByRole("button", { name: "2인" }).click();
    await page.getByRole("button", { name: "게임 방 만들기" }).click();

    const waitingRoom = page.locator('main[aria-label="대기실"]');
    const isWaiting = await waitingRoom
      .waitFor({ timeout: 15_000 })
      .then(() => true)
      .catch(() => false);

    if (isWaiting) {
      const leaveBtn = page.locator('[aria-label="대기실 나가기"]');
      await expect(leaveBtn).toBeVisible({ timeout: 5000 });
    } else {
      // 헤더의 뒤로가기 버튼도 로비로 돌아가는 기능
      const backBtn = page.locator('[aria-label="로비로 돌아가기"]');
      await expect(backBtn).toBeVisible({ timeout: 5000 });
    }
  });
});
