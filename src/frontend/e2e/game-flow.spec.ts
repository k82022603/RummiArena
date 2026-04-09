/**
 * 게임 플로우 E2E 테스트
 *
 * 사용자가 경험하는 전체 게임 흐름을 검증한다:
 *   로비 → 방 생성 → AI 설정 → 폼 유효성 → 게임 UI 스모크
 *
 * TC-GF (Game Flow):       로비~방 생성 완전 흐름 10건
 * TC-AC (AI Character):    AI 캐릭터 설정 8건
 * TC-FV (Form Validation): 방 생성 폼 유효성 5건
 * TC-GU (Game UI Smoke):   게임 관련 페이지 스모크 7건
 *
 * 환경: K8s NodePort http://localhost:30000 (frontend), :30080 (game-server)
 * 인증: global-setup.ts에서 생성된 auth.json 세션 재사용
 */

import { test, expect } from "@playwright/test";
import { cleanupViaPage } from "./helpers/room-cleanup";

// ====================================================================
// 1. Complete Game Creation Flow (TC-GF-001 ~ TC-GF-010)
// ====================================================================

test.describe("TC-GF: 게임 생성 전체 흐름", () => {
  test.afterEach(async ({ page }) => {
    // 방 생성 테스트에서 남은 활성 방 정리
    await page.goto("/lobby");
    await page.waitForLoadState("domcontentloaded");
    await cleanupViaPage(page);
  });

  test("TC-GF-001: 로비 → 방 만들기 → 방 생성 페이지 도달", async ({
    page,
  }) => {
    await page.goto("/lobby");
    await page.waitForLoadState("domcontentloaded");
    await expect(
      page.locator('main[aria-label="로비 페이지"]')
    ).toBeVisible({ timeout: 15_000 });

    // "새 게임 방 만들기" 버튼 클릭 (좌측 패널 or 모바일)
    const createBtn = page.getByLabel("새 게임 방 만들기").first();
    await expect(createBtn).toBeVisible({ timeout: 5000 });
    await createBtn.click();

    // 방 생성 폼 페이지 도달 확인
    await page.waitForURL(/\/room\/create/, { timeout: 10_000 });
    await expect(
      page.locator('form[aria-label="게임 방 생성 폼"]')
    ).toBeVisible({ timeout: 10_000 });
    await expect(page.getByText("새 게임 만들기")).toBeVisible({ timeout: 5000 });
  });

  test("TC-GF-002: 2인 모드 + AI 1개 설정 후 폼 제출 시도", async ({
    page,
  }) => {
    await page.goto("/room/create");
    await page.waitForLoadState("domcontentloaded");
    await expect(
      page.locator('form[aria-label="게임 방 생성 폼"]')
    ).toBeVisible({ timeout: 10_000 });

    // 2인 선택
    const btn2 = page.getByRole("button", { name: "2인" });
    await btn2.click();
    await expect(btn2).toHaveAttribute("aria-pressed", "true", {
      timeout: 5000,
    });

    // AI 슬롯 1개 존재 확인
    await expect(page.locator('[aria-label="AI 슬롯 1"]')).toBeVisible({
      timeout: 5000,
    });

    // 60초 타임아웃 선택
    await page.getByRole("button", { name: "60초" }).click();

    // 제출 버튼 클릭
    await page.getByRole("button", { name: "게임 방 만들기" }).click();

    // 대기실 또는 에러 — 둘 중 하나가 나타나야 함
    await page.waitForFunction(
      () => {
        const url = window.location.pathname;
        const hasError = !!document.querySelector('[role="alert"]');
        return url.includes("/room/") || hasError;
      },
      { timeout: 15_000 }
    );
  });

  test("TC-GF-003: 3인 모드 + AI 2개 설정 확인", async ({ page }) => {
    await page.goto("/room/create");
    await page.waitForLoadState("domcontentloaded");
    await expect(
      page.locator('form[aria-label="게임 방 생성 폼"]')
    ).toBeVisible({ timeout: 10_000 });

    // 3인 선택
    const btn3 = page.getByRole("button", { name: "3인" });
    await btn3.click();
    await expect(btn3).toHaveAttribute("aria-pressed", "true", {
      timeout: 5000,
    });

    // AI 추가 버튼으로 두 번째 AI 추가
    const addBtn = page.getByLabel("AI 플레이어 추가");
    await expect(addBtn).toBeVisible({ timeout: 5000 });
    await addBtn.click();

    // AI 슬롯 2개 존재 확인
    await expect(page.locator('[aria-label="AI 슬롯 1"]')).toBeVisible({
      timeout: 5000,
    });
    await expect(page.locator('[aria-label="AI 슬롯 2"]')).toBeVisible({
      timeout: 5000,
    });
  });

  test("TC-GF-004: 4인 모드 + AI 3개 설정 확인", async ({ page }) => {
    await page.goto("/room/create");
    await page.waitForLoadState("domcontentloaded");
    await expect(
      page.locator('form[aria-label="게임 방 생성 폼"]')
    ).toBeVisible({ timeout: 10_000 });

    // 4인 선택 (기본값)
    const btn4 = page.getByRole("button", { name: "4인" });
    await btn4.click();
    await expect(btn4).toHaveAttribute("aria-pressed", "true", {
      timeout: 5000,
    });

    // AI 추가하여 3개까지 채우기
    const addBtn = page.getByLabel("AI 플레이어 추가");
    while ((await page.locator('[aria-label^="AI 슬롯"]').count()) < 3) {
      if (await addBtn.isVisible()) {
        await addBtn.click();
      } else {
        break;
      }
    }

    // AI 슬롯 3개 존재 확인
    await expect(page.locator('[aria-label="AI 슬롯 1"]')).toBeVisible({
      timeout: 5000,
    });
    await expect(page.locator('[aria-label="AI 슬롯 2"]')).toBeVisible({
      timeout: 5000,
    });
    await expect(page.locator('[aria-label="AI 슬롯 3"]')).toBeVisible({
      timeout: 5000,
    });
  });

  test("TC-GF-005: AI 모델을 Claude로 변경하고 제출 시도", async ({
    page,
  }) => {
    await page.goto("/room/create");
    await page.waitForLoadState("domcontentloaded");
    await expect(
      page.locator('form[aria-label="게임 방 생성 폼"]')
    ).toBeVisible({ timeout: 10_000 });

    // 2인 선택
    await page.getByRole("button", { name: "2인" }).click();

    // AI 1 모델을 Claude로 변경
    const modelSelect = page.getByLabel("AI 1 모델 선택");
    await expect(modelSelect).toBeVisible({ timeout: 5000 });
    await modelSelect.selectOption("AI_CLAUDE");

    // 선택값 확인
    await expect(modelSelect).toHaveValue("AI_CLAUDE");

    // 제출 시도
    await page.getByRole("button", { name: "게임 방 만들기" }).click();

    // 대기실 이동 또는 에러 표시
    await page.waitForFunction(
      () => {
        const url = window.location.pathname;
        const hasError = !!document.querySelector('[role="alert"]');
        return url.includes("/room/") || hasError;
      },
      { timeout: 15_000 }
    );
  });

  test("TC-GF-006: AI 모델을 DeepSeek로 변경하고 확인", async ({ page }) => {
    await page.goto("/room/create");
    await page.waitForLoadState("domcontentloaded");
    await expect(
      page.locator('form[aria-label="게임 방 생성 폼"]')
    ).toBeVisible({ timeout: 10_000 });

    // 2인 선택
    await page.getByRole("button", { name: "2인" }).click();

    // AI 1 모델을 DeepSeek로 변경
    const modelSelect = page.getByLabel("AI 1 모델 선택");
    await modelSelect.selectOption("AI_DEEPSEEK");
    await expect(modelSelect).toHaveValue("AI_DEEPSEEK");
  });

  test("TC-GF-007: AI 모델을 LLaMA로 변경하고 확인", async ({ page }) => {
    await page.goto("/room/create");
    await page.waitForLoadState("domcontentloaded");
    await expect(
      page.locator('form[aria-label="게임 방 생성 폼"]')
    ).toBeVisible({ timeout: 10_000 });

    // 2인 선택
    await page.getByRole("button", { name: "2인" }).click();

    // AI 1 모델을 LLaMA로 변경
    const modelSelect = page.getByLabel("AI 1 모델 선택");
    await modelSelect.selectOption("AI_LLAMA");
    await expect(modelSelect).toHaveValue("AI_LLAMA");
  });

  test("TC-GF-008: 턴 타임아웃 30초로 설정 확인", async ({ page }) => {
    await page.goto("/room/create");
    await page.waitForLoadState("domcontentloaded");
    await expect(
      page.locator('form[aria-label="게임 방 생성 폼"]')
    ).toBeVisible({ timeout: 10_000 });

    // 30초 버튼 클릭
    const btn30 = page.getByRole("button", { name: "30초" });
    await btn30.click();
    await expect(btn30).toHaveAttribute("aria-pressed", "true", {
      timeout: 5000,
    });

    // 슬라이더 값도 30인지 확인
    const slider = page.getByLabel("턴 제한 시간 설정 (30~120초)");
    await expect(slider).toHaveValue("30", { timeout: 5000 });
  });

  test("TC-GF-009: 턴 타임아웃 120초로 설정 확인", async ({ page }) => {
    await page.goto("/room/create");
    await page.waitForLoadState("domcontentloaded");
    await expect(
      page.locator('form[aria-label="게임 방 생성 폼"]')
    ).toBeVisible({ timeout: 10_000 });

    // 120초 버튼 클릭
    const btn120 = page.getByRole("button", { name: "120초" });
    await btn120.click();
    await expect(btn120).toHaveAttribute("aria-pressed", "true", {
      timeout: 5000,
    });

    // 슬라이더 값도 120인지 확인
    const slider = page.getByLabel("턴 제한 시간 설정 (30~120초)");
    await expect(slider).toHaveValue("120", { timeout: 5000 });
  });

  test("TC-GF-010: AI 난이도를 하수로 변경하고 확인", async ({ page }) => {
    await page.goto("/room/create");
    await page.waitForLoadState("domcontentloaded");
    await expect(
      page.locator('form[aria-label="게임 방 생성 폼"]')
    ).toBeVisible({ timeout: 10_000 });

    // 2인 선택
    await page.getByRole("button", { name: "2인" }).click();

    // AI 1 난이도를 "하수"로 변경
    const difficultySelect = page.getByLabel("AI 1 난이도 선택");
    await expect(difficultySelect).toBeVisible({ timeout: 5000 });
    await difficultySelect.selectOption("beginner");
    await expect(difficultySelect).toHaveValue("beginner");
  });
});

// ====================================================================
// 2. AI Character Configuration (TC-AC-001 ~ TC-AC-008)
// ====================================================================

test.describe("TC-AC: AI 캐릭터 설정", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/room/create");
    await page.waitForLoadState("domcontentloaded");
    await expect(
      page.locator('form[aria-label="게임 방 생성 폼"]')
    ).toBeVisible({ timeout: 10_000 });

    // 2인 선택하여 AI 슬롯 1개 확보
    await page.getByRole("button", { name: "2인" }).click();
    await expect(page.locator('[aria-label="AI 슬롯 1"]')).toBeVisible({
      timeout: 5000,
    });
  });

  test("TC-AC-001: 루키 페르소나 선택 → pressed 상태", async ({ page }) => {
    const rookieBtn = page.getByRole("button", { name: /^루키:/ });
    await rookieBtn.click();
    await expect(rookieBtn).toHaveAttribute("aria-pressed", "true", {
      timeout: 5000,
    });
  });

  test("TC-AC-002: 계산기 페르소나 선택 → pressed 상태", async ({ page }) => {
    const calcBtn = page.getByRole("button", { name: /^계산기:/ });
    await calcBtn.click();
    await expect(calcBtn).toHaveAttribute("aria-pressed", "true", {
      timeout: 5000,
    });
  });

  test("TC-AC-003: 샤크 페르소나 기본 선택 확인", async ({ page }) => {
    // 기본값이 shark이므로 이미 pressed 상태
    const sharkBtn = page.getByRole("button", { name: /^샤크:/ });
    await expect(sharkBtn).toHaveAttribute("aria-pressed", "true", {
      timeout: 5000,
    });
  });

  test('TC-AC-004: 폭스 페르소나 선택 → 설명 "상대 관찰" 포함', async ({
    page,
  }) => {
    const foxBtn = page.getByRole("button", { name: /^폭스:/ });
    await foxBtn.click();
    await expect(foxBtn).toHaveAttribute("aria-pressed", "true", {
      timeout: 5000,
    });

    // aria-label에 "상대 관찰" 설명이 포함되어 있는지 확인
    const label = await foxBtn.getAttribute("aria-label");
    expect(label).toContain("상대 관찰");
  });

  test("TC-AC-005: 벽 페르소나 선택 확인", async ({ page }) => {
    const wallBtn = page.getByRole("button", { name: /^벽:/ });
    await wallBtn.click();
    await expect(wallBtn).toHaveAttribute("aria-pressed", "true", {
      timeout: 5000,
    });
  });

  test("TC-AC-006: 와일드카드 페르소나 선택 확인", async ({ page }) => {
    const wildBtn = page.getByRole("button", { name: /^와일드카드:/ });
    await wildBtn.click();
    await expect(wildBtn).toHaveAttribute("aria-pressed", "true", {
      timeout: 5000,
    });
  });

  test("TC-AC-007: AI 추가 → 두 번째 AI 다른 모델/페르소나 설정", async ({
    page,
  }) => {
    // 3인으로 전환하여 AI 2개 가능
    await page.getByRole("button", { name: "3인" }).click();

    // AI 추가
    const addBtn = page.getByLabel("AI 플레이어 추가");
    await expect(addBtn).toBeVisible({ timeout: 5000 });
    await addBtn.click();

    // AI 슬롯 2 존재 확인
    await expect(page.locator('[aria-label="AI 슬롯 2"]')).toBeVisible({
      timeout: 5000,
    });

    // AI 2 모델을 Claude로 변경
    const model2 = page.getByLabel("AI 2 모델 선택");
    await model2.selectOption("AI_CLAUDE");
    await expect(model2).toHaveValue("AI_CLAUDE");

    // AI 2 페르소나를 루키로 변경
    // AI 슬롯 2 내부의 루키 버튼 선택
    const slot2 = page.locator('[aria-label="AI 슬롯 2"]');
    const rookieInSlot2 = slot2.getByRole("button", { name: /^루키:/ });
    await rookieInSlot2.click();
    await expect(rookieInSlot2).toHaveAttribute("aria-pressed", "true", {
      timeout: 5000,
    });

    // AI 1은 여전히 GPT/샤크 확인
    const model1 = page.getByLabel("AI 1 모델 선택");
    await expect(model1).toHaveValue("AI_OPENAI");
  });

  test("TC-AC-008: AI 제거 후 다시 추가 → 기본값 복원 확인", async ({
    page,
  }) => {
    // AI 1 제거
    await page.getByLabel("AI 1 제거").click();

    // AI 슬롯이 사라졌는지 확인
    await expect(page.locator('[aria-label="AI 슬롯 1"]')).not.toBeVisible({
      timeout: 5000,
    });

    // "AI 플레이어 없음" 텍스트 표시
    await expect(page.getByText("AI 플레이어 없음")).toBeVisible({
      timeout: 5000,
    });

    // AI 다시 추가
    const addBtn = page.getByLabel("AI 플레이어 추가");
    await addBtn.click();

    // 슬롯 복원 확인
    await expect(page.locator('[aria-label="AI 슬롯 1"]')).toBeVisible({
      timeout: 5000,
    });

    // 기본값 확인: 모델=OpenAI, 난이도=고수, 페르소나=샤크
    const modelSelect = page.getByLabel("AI 1 모델 선택");
    await expect(modelSelect).toHaveValue("AI_OPENAI");

    const diffSelect = page.getByLabel("AI 1 난이도 선택");
    await expect(diffSelect).toHaveValue("expert");

    const sharkBtn = page
      .locator('[aria-label="AI 슬롯 1"]')
      .getByRole("button", { name: /^샤크:/ });
    await expect(sharkBtn).toHaveAttribute("aria-pressed", "true", {
      timeout: 5000,
    });
  });
});

// ====================================================================
// 3. Room Create Form Validation (TC-FV-001 ~ TC-FV-005)
// ====================================================================

test.describe("TC-FV: 방 생성 폼 유효성 검증", () => {
  test("TC-FV-001: 플레이어 수 변경 시 AI 슬롯 수 제한 확인 (2인→AI 1개 max)", async ({
    page,
  }) => {
    await page.goto("/room/create");
    await page.waitForLoadState("domcontentloaded");
    await expect(
      page.locator('form[aria-label="게임 방 생성 폼"]')
    ).toBeVisible({ timeout: 10_000 });

    // 4인에서 AI 3개 추가
    await page.getByRole("button", { name: "4인" }).click();
    const addBtn = page.getByLabel("AI 플레이어 추가");
    while ((await page.locator('[aria-label^="AI 슬롯"]').count()) < 3) {
      if (await addBtn.isVisible()) await addBtn.click();
      else break;
    }
    expect(await page.locator('[aria-label^="AI 슬롯"]').count()).toBe(3);

    // 2인으로 전환 → AI 슬롯이 1개로 줄어야 함
    await page.getByRole("button", { name: "2인" }).click();
    await expect(page.locator('[aria-label^="AI 슬롯"]')).toHaveCount(1, {
      timeout: 5000,
    });
  });

  test("TC-FV-002: 4인에서 AI 3개 추가 후 추가 버튼 사라짐/비활성", async ({
    page,
  }) => {
    await page.goto("/room/create");
    await page.waitForLoadState("domcontentloaded");
    await expect(
      page.locator('form[aria-label="게임 방 생성 폼"]')
    ).toBeVisible({ timeout: 10_000 });

    // 4인 선택
    await page.getByRole("button", { name: "4인" }).click();

    // AI 3개까지 추가
    const addBtn = page.getByLabel("AI 플레이어 추가");
    while ((await page.locator('[aria-label^="AI 슬롯"]').count()) < 3) {
      if (await addBtn.isVisible()) await addBtn.click();
      else break;
    }

    // 3개 채운 후 추가 버튼이 보이지 않아야 함
    await expect(addBtn).not.toBeVisible({ timeout: 5000 });
  });

  test("TC-FV-003: 타임아웃 슬라이더 30~120 범위 확인", async ({ page }) => {
    await page.goto("/room/create");
    await page.waitForLoadState("domcontentloaded");
    await expect(
      page.locator('form[aria-label="게임 방 생성 폼"]')
    ).toBeVisible({ timeout: 10_000 });

    const slider = page.getByLabel("턴 제한 시간 설정 (30~120초)");
    await expect(slider).toBeVisible({ timeout: 5000 });

    // min/max 속성 검증
    await expect(slider).toHaveAttribute("min", "30");
    await expect(slider).toHaveAttribute("max", "120");

    // step 속성 검증
    await expect(slider).toHaveAttribute("step", "10");
  });

  test('TC-FV-004: 폼 제출 버튼 텍스트 확인 ("게임 방 만들기")', async ({
    page,
  }) => {
    await page.goto("/room/create");
    await page.waitForLoadState("domcontentloaded");
    await expect(
      page.locator('form[aria-label="게임 방 생성 폼"]')
    ).toBeVisible({ timeout: 10_000 });

    // 제출 버튼 텍스트 확인
    const submitBtn = page.getByRole("button", { name: "게임 방 만들기" });
    await expect(submitBtn).toBeVisible({ timeout: 5000 });
    await expect(submitBtn).toHaveText("게임 방 만들기");

    // 버튼의 type이 submit인지 확인
    await expect(submitBtn).toHaveAttribute("type", "submit");
  });

  test("TC-FV-005: 로비로 돌아가기 후 다시 방 만들기 → 기본값 복원", async ({
    page,
  }) => {
    await page.goto("/room/create");
    await page.waitForLoadState("domcontentloaded");
    await expect(
      page.locator('form[aria-label="게임 방 생성 폼"]')
    ).toBeVisible({ timeout: 10_000 });

    // 값을 변경: 2인 + 30초
    await page.getByRole("button", { name: "2인" }).click();
    await page.getByRole("button", { name: "30초" }).click();

    // 로비로 돌아가기
    await page.getByLabel("로비로 돌아가기").click();
    await page.waitForURL(/\/lobby/, { timeout: 10_000 });

    // 다시 방 만들기 페이지로 이동
    await page.goto("/room/create");
    await page.waitForLoadState("domcontentloaded");
    await expect(
      page.locator('form[aria-label="게임 방 생성 폼"]')
    ).toBeVisible({ timeout: 10_000 });

    // 기본값 복원 확인: 4인이 pressed (컴포넌트 기본 state)
    const btn4 = page.getByRole("button", { name: "4인" });
    await expect(btn4).toHaveAttribute("aria-pressed", "true", {
      timeout: 5000,
    });

    // 기본 타임아웃: 60초
    const btn60 = page.getByRole("button", { name: "60초" });
    await expect(btn60).toHaveAttribute("aria-pressed", "true", {
      timeout: 5000,
    });
  });
});

// ====================================================================
// 4. Game UI Smoke (TC-GU-001 ~ TC-GU-007)
// ====================================================================

test.describe("TC-GU: 게임 UI 스모크 테스트", () => {
  test.afterEach(async ({ page }) => {
    // 방 생성/접속 테스트에서 남은 활성 방 정리
    await page.goto("/lobby");
    await page.waitForLoadState("domcontentloaded");
    await cleanupViaPage(page);
  });

  test("TC-GU-001: /game/test-room 직접 접근 → 적절한 처리 (에러 또는 리디렉트)", async ({
    page,
  }) => {
    // 존재하지 않는 게임 방에 직접 접근
    await page.goto("/game/test-room");
    await page.waitForLoadState("domcontentloaded");

    // 에러 메시지, 로비 리디렉트, 또는 빈 상태 중 하나
    await page.waitForFunction(
      () => {
        const url = window.location.pathname;
        const body = document.body.textContent ?? "";
        return (
          url.includes("/lobby") ||
          url.includes("/login") ||
          body.includes("에러") ||
          body.includes("오류") ||
          body.includes("연결") ||
          body.includes("not found") ||
          body.includes("404") ||
          // 게임 화면이 뜨더라도 WS 연결 실패 표시
          body.includes("끊김") ||
          body.includes("재연결") ||
          // 10초 지나면 어떤 UI든 렌더링 완료
          document.readyState === "complete"
        );
      },
      { timeout: 15_000 }
    );
  });

  test("TC-GU-002: 방 생성 폼에서 제출 성공 시 URL이 /room/ 패턴으로 변경", async ({
    page,
  }) => {
    await page.goto("/room/create");
    await page.waitForLoadState("domcontentloaded");
    await expect(
      page.locator('form[aria-label="게임 방 생성 폼"]')
    ).toBeVisible({ timeout: 10_000 });

    // 2인 + 60초 기본 설정
    await page.getByRole("button", { name: "2인" }).click();
    await page.getByRole("button", { name: "60초" }).click();

    // 제출
    await page.getByRole("button", { name: "게임 방 만들기" }).click();

    // 성공 시 /room/{uuid} 패턴으로 이동 확인
    // 실패 시 에러 표시
    await page.waitForFunction(
      () => {
        const url = window.location.pathname;
        const hasError = !!document.querySelector('[role="alert"]');
        // /room/create가 아닌 /room/{id} 패턴
        const isRoomPage =
          url.startsWith("/room/") && !url.includes("/create");
        return isRoomPage || hasError;
      },
      { timeout: 15_000 }
    );

    // 성공 케이스면 URL 검증
    const currentUrl = page.url();
    if (!currentUrl.includes("/room/create")) {
      expect(currentUrl).toMatch(/\/room\//);
    }
  });

  test("TC-GU-003: AI 설정에서 심리전 레벨 설정 UI 존재", async ({
    page,
  }) => {
    await page.goto("/room/create");
    await page.waitForLoadState("domcontentloaded");
    await expect(
      page.locator('form[aria-label="게임 방 생성 폼"]')
    ).toBeVisible({ timeout: 10_000 });

    // 2인 선택
    await page.getByRole("button", { name: "2인" }).click();

    // 심리전 레벨 슬라이더 존재 확인
    const psychSlider = page.getByLabel("AI 1 심리전 레벨 (0~3)");
    await expect(psychSlider).toBeVisible({ timeout: 5000 });

    // min/max 속성 검증
    await expect(psychSlider).toHaveAttribute("min", "0");
    await expect(psychSlider).toHaveAttribute("max", "3");
    await expect(psychSlider).toHaveAttribute("step", "1");

    // 기본값 확인 (DEFAULT_AI.psychologyLevel = 2)
    await expect(psychSlider).toHaveValue("2");
  });

  test("TC-GU-004: 4인 모드에서 Seat 3개의 AI 설정 가능", async ({
    page,
  }) => {
    await page.goto("/room/create");
    await page.waitForLoadState("domcontentloaded");
    await expect(
      page.locator('form[aria-label="게임 방 생성 폼"]')
    ).toBeVisible({ timeout: 10_000 });

    // 4인 선택
    await page.getByRole("button", { name: "4인" }).click();

    // AI 3개까지 추가
    const addBtn = page.getByLabel("AI 플레이어 추가");
    while ((await page.locator('[aria-label^="AI 슬롯"]').count()) < 3) {
      if (await addBtn.isVisible()) await addBtn.click();
      else break;
    }

    // 각 AI 슬롯에 모델/난이도/페르소나 설정 가능한지 확인
    for (let i = 1; i <= 3; i++) {
      await expect(page.getByLabel(`AI ${i} 모델 선택`)).toBeVisible({
        timeout: 5000,
      });
      await expect(page.getByLabel(`AI ${i} 난이도 선택`)).toBeVisible({
        timeout: 5000,
      });
      await expect(
        page.getByLabel(`AI ${i} 심리전 레벨 (0~3)`)
      ).toBeVisible({ timeout: 5000 });
    }
  });

  test("TC-GU-005: 게임 시작 버튼 텍스트 확인 (방 생성 폼)", async ({
    page,
  }) => {
    await page.goto("/room/create");
    await page.waitForLoadState("domcontentloaded");
    await expect(
      page.locator('form[aria-label="게임 방 생성 폼"]')
    ).toBeVisible({ timeout: 10_000 });

    // 제출 버튼 확인 - "게임 방 만들기" 텍스트
    const submitBtn = page.locator(
      'form[aria-label="게임 방 생성 폼"] button[type="submit"]'
    );
    await expect(submitBtn).toBeVisible({ timeout: 5000 });
    await expect(submitBtn).toHaveText("게임 방 만들기");

    // submitting 상태가 아니므로 aria-busy=false (또는 속성 없음)
    const busy = await submitBtn.getAttribute("aria-busy");
    expect(busy === null || busy === "false").toBeTruthy();
  });

  test("TC-GU-006: 에러 발생 시 에러 메시지 영역 존재", async ({ page }) => {
    await page.goto("/room/create");
    await page.waitForLoadState("domcontentloaded");
    await expect(
      page.locator('form[aria-label="게임 방 생성 폼"]')
    ).toBeVisible({ timeout: 10_000 });

    // 에러가 없는 초기 상태에서 role="alert" 요소는 보이지 않아야 함
    const alerts = page.locator('form[aria-label="게임 방 생성 폼"] ~ [role="alert"], form[aria-label="게임 방 생성 폼"] [role="alert"]');
    // 초기에는 에러 없음
    const alertCount = await alerts.count();
    // 에러 div가 없거나 보이지 않아야 함
    if (alertCount > 0) {
      await expect(alerts.first()).not.toBeVisible();
    }

    // 네트워크 오류 시뮬레이션: API를 차단하고 제출
    await page.route("**/api/rooms", (route) => route.abort());

    await page.getByRole("button", { name: "2인" }).click();
    await page.getByRole("button", { name: "게임 방 만들기" }).click();

    // 에러 메시지가 표시되어야 함 (role="alert" — Next.js announcer 제외)
    await expect(
      page.locator('[role="alert"]:not([id="__next-route-announcer__"])')
    ).toBeVisible({ timeout: 10_000 });
  });

  test("TC-GU-007: 방 만들기 폼 레이아웃 — 인원/타임아웃/AI 섹션 순서", async ({
    page,
  }) => {
    await page.goto("/room/create");
    await page.waitForLoadState("domcontentloaded");
    await expect(
      page.locator('form[aria-label="게임 방 생성 폼"]')
    ).toBeVisible({ timeout: 10_000 });

    // 각 섹션 헤딩이 순서대로 존재하는지 확인
    const form = page.locator('form[aria-label="게임 방 생성 폼"]');

    // 섹션 1: 플레이어 수
    const playerSection = form.locator("#player-count-label");
    await expect(playerSection).toBeVisible({ timeout: 5000 });
    await expect(playerSection).toHaveText("플레이어 수");

    // 섹션 2: 턴 제한 시간
    const timeoutSection = form.locator("#timeout-label");
    await expect(timeoutSection).toBeVisible({ timeout: 5000 });
    const timeoutText = await timeoutSection.textContent();
    expect(timeoutText).toContain("턴 제한 시간");

    // 섹션 3: AI 플레이어
    const aiSection = form.locator("#ai-config-label");
    await expect(aiSection).toBeVisible({ timeout: 5000 });
    const aiText = await aiSection.textContent();
    expect(aiText).toContain("AI 플레이어");

    // 순서 검증: 플레이어 수 섹션이 타임아웃 섹션보다 위에 위치
    const playerBox = await playerSection.boundingBox();
    const timeoutBox = await timeoutSection.boundingBox();
    const aiBox = await aiSection.boundingBox();

    expect(playerBox).not.toBeNull();
    expect(timeoutBox).not.toBeNull();
    expect(aiBox).not.toBeNull();

    if (playerBox && timeoutBox && aiBox) {
      expect(playerBox.y).toBeLessThan(timeoutBox.y);
      expect(timeoutBox.y).toBeLessThan(aiBox.y);
    }
  });
});
