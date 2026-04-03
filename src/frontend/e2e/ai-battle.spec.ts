/**
 * AI 대전 프론트엔드 E2E 테스트
 *
 * 프론트엔드 UI를 통해 실제 AI 대전을 실행하고 게임 흐름을 검증한다.
 * - 방 생성 → AI 설정 → 게임 시작 → AI 턴 진행 → 게임 종료까지 전체 플로우
 * - 실제 LLM API 호출이 발생하므로 비용이 발생한다 (Ollama/qwen2.5:3b 사용 시 무료)
 *
 * 환경: K8s NodePort http://localhost:30000 (frontend), :30080 (game-server)
 * 인증: global-setup.ts에서 생성된 auth.json 세션 재사용
 *
 * K8s ConfigMap 기준 모델:
 * - OpenAI: gpt-5-mini (추론 모델, ~$0.025/턴)
 * - Claude: claude-sonnet-4-20250514 (extended thinking, ~$0.074/턴)
 * - DeepSeek: deepseek-reasoner (~$0.001/턴)
 * - Ollama: qwen2.5:3b (로컬 무료, CPU-only ~25s/턴)
 */

import { test, expect, type Page } from "@playwright/test";
import { cleanupViaPage } from "./helpers/room-cleanup";

// ------------------------------------------------------------------
// 공통 헬퍼
// ------------------------------------------------------------------

/**
 * 방 생성 → 대기실 → 게임 시작까지 진행.
 * 완료 후 page는 /game/{roomId}에 위치.
 */
async function createAIBattle(
  page: Page,
  opts: {
    playerCount?: 2 | 3 | 4;
    aiModel?: string;
    aiPersona?: string;
    aiDifficulty?: string;
    turnTimeout?: number;
  } = {}
): Promise<void> {
  const {
    playerCount = 2,
    aiModel = "LLaMA (Ollama)",
    aiPersona = "샤크",
    aiDifficulty = "고수",
    turnTimeout = 120,
  } = opts;

  // 이전 테스트 잔여 방 정리
  await page.goto("/lobby");
  await page.waitForLoadState("domcontentloaded");
  await cleanupViaPage(page);

  await page.goto("/room/create");
  await page.waitForLoadState("domcontentloaded");
  await expect(
    page.locator('form[aria-label="게임 방 생성 폼"]')
  ).toBeVisible({ timeout: 10_000 });

  // 플레이어 수 설정
  await page.getByRole("button", { name: `${playerCount}인` }).click();

  // 턴 타임아웃 설정
  await page.getByRole("button", { name: `${turnTimeout}초` }).click();

  // AI 모델 선택
  const modelSelect = page.getByLabel("AI 1 모델 선택");
  await modelSelect.selectOption({ label: aiModel });

  // AI 난이도 선택
  const difficultySelect = page.getByLabel("AI 1 난이도 선택");
  await difficultySelect.selectOption({ label: aiDifficulty });

  // AI 페르소나 선택
  await page
    .locator('[aria-label="AI 슬롯 1"]')
    .getByRole("button", { name: new RegExp(aiPersona) })
    .click();

  // 방 만들기 제출
  await page.getByRole("button", { name: "게임 방 만들기" }).click();
  await page.waitForURL(/\/room\//, { timeout: 15_000 });

  // 대기실 확인
  await expect(page.locator('main[aria-label="대기실"]')).toBeVisible({
    timeout: 15_000,
  });

  // 게임 시작
  const startBtn = page.getByLabel("게임 시작");
  await expect(startBtn).toBeVisible({ timeout: 15_000 });
  await startBtn.click();

  // 게임 화면 도달
  await page.waitForURL(/\/game\//, { timeout: 30_000 });
}

/** 게임 화면이 초기화될 때까지 대기 (WebSocket GAME_STATE 수신 후) */
async function waitForGameReady(page: Page): Promise<void> {
  await expect(
    page.locator('section[aria-label="내 타일 랙"]')
  ).toBeVisible({ timeout: 30_000 });

  await page.waitForFunction(
    () => {
      const rack = document.querySelector('[aria-label="내 타일 랙"]');
      if (!rack) return false;
      const tiles = rack.querySelectorAll('[aria-label*="타일 (드래그"]');
      return tiles.length >= 1;
    },
    { timeout: 30_000 }
  );
}

/**
 * 내 차례를 대기한다.
 * ActionBar(게임 액션 그룹)는 isMyTurn일 때만 렌더되므로
 * 이를 기준으로 판정한다. "내 차례" 텍스트는 상대 PlayerCard에도
 * 나타나므로 정확한 판별자가 아니다.
 */
async function waitForMyTurn(page: Page, timeoutMs = 180_000): Promise<void> {
  await expect(
    page.locator('[aria-label="게임 액션"]')
  ).toBeVisible({ timeout: timeoutMs });
}

/**
 * 드로우/배치 후 내 차례 복귀를 대기한다.
 * 1) ActionBar가 사라짐 → 상대 턴으로 전환 확인
 * 2) ActionBar가 다시 나타남 → 내 차례 복귀
 */
async function waitForMyTurnAfterAction(page: Page, timeoutMs = 180_000): Promise<void> {
  const actionBar = page.locator('[aria-label="게임 액션"]');
  // 1) 내 턴이 끝나서 ActionBar가 사라질 때까지 대기
  await expect(actionBar).not.toBeVisible({ timeout: 60_000 });
  // 2) 상대 턴 완료 후 ActionBar 재출현 대기
  await expect(actionBar).toBeVisible({ timeout: timeoutMs });
}

/**
 * AI 턴 중 상태를 대기한다.
 * 서버가 AI_THINKING 메시지를 보내지 않으므로 "사고 중..." 오버레이는 렌더되지 않는다.
 * 대신 ActionBar 숨김 + 상대 PlayerCard "내 차례" 배지로 AI 턴 진행을 판별한다.
 */
async function waitForAITurn(page: Page, timeoutMs = 60_000): Promise<void> {
  // ActionBar가 사라져야 AI 턴으로 전환된 것
  await expect(
    page.locator('[aria-label="게임 액션"]')
  ).not.toBeVisible({ timeout: timeoutMs });

  // 상대 플레이어 영역에 "내 차례" 배지가 보여야 함
  await expect(
    page.locator('[aria-label="상대 플레이어"]').locator("text=내 차례").first()
  ).toBeVisible({ timeout: 10_000 });
}

/** 턴 번호를 읽는다 */
async function getTurnNumber(page: Page): Promise<number> {
  const text = await page.locator("text=턴 #").first().textContent();
  const match = text?.match(/턴 #(\d+)/);
  return match ? parseInt(match[1], 10) : 0;
}

/** 턴 번호가 특정 값보다 커질 때까지 대기한다 */
async function waitForTurnGreaterThan(
  page: Page,
  currentTurn: number,
  timeoutMs = 300_000
): Promise<void> {
  await page.waitForFunction(
    (minTurn) => {
      const allElements = document.querySelectorAll("*");
      for (const el of allElements) {
        const text = el.textContent ?? "";
        if (text.includes("턴 #")) {
          const match = text.match(/턴 #(\d+)/);
          if (match && parseInt(match[1], 10) > minTurn) return true;
        }
      }
      return false;
    },
    currentTurn,
    { timeout: timeoutMs }
  );
}

// ==================================================================
// 1. TC-AB: AI 대전 기본 흐름 (Ollama — 무료)
// ==================================================================

test.describe("TC-AB: AI 대전 기본 흐름 (Ollama)", () => {
  test.setTimeout(300_000); // 5분 — AI 응답 대기 필요

  test("TC-AB-001: Ollama AI와 2인 대전 — 방 생성부터 게임 화면 도달", async ({
    page,
  }) => {
    await createAIBattle(page, {
      playerCount: 2,
      aiModel: "LLaMA (Ollama)",
      aiPersona: "루키",
      aiDifficulty: "하수",
      turnTimeout: 120,
    });
    await waitForGameReady(page);

    // 게임 화면 기본 요소 확인
    await expect(page.locator('section[aria-label="내 타일 랙"]')).toBeVisible();
    await expect(page.locator('section[aria-label="게임 테이블"]')).toBeVisible();
    await expect(page.locator('[aria-label="상대 플레이어"]')).toBeVisible();
    await expect(page.locator('[aria-label="내 정보 패널"]')).toBeVisible();
  });

  test("TC-AB-002: 게임 시작 시 14장의 초기 타일이 배분된다", async ({ page }) => {
    await createAIBattle(page, {
      playerCount: 2,
      aiModel: "LLaMA (Ollama)",
      aiPersona: "계산기",
      turnTimeout: 120,
    });
    await waitForGameReady(page);

    // 초기 패: 14장
    const tileCount = await page
      .locator('[aria-label*="타일 (드래그"]')
      .count();
    expect(tileCount).toBe(14);
  });

  test("TC-AB-003: 상대 플레이어에 AI 정보가 표시된다 (LLaMA)", async ({ page }) => {
    await createAIBattle(page, {
      playerCount: 2,
      aiModel: "LLaMA (Ollama)",
      aiPersona: "샤크",
      turnTimeout: 120,
    });
    await waitForGameReady(page);

    // 상대 플레이어 영역에 AI 정보 표시
    const opponentArea = page.locator('[aria-label="상대 플레이어"]');
    await expect(opponentArea).toBeVisible();

    // AI 타입 또는 페르소나 텍스트가 보여야 함
    const opponentText = await opponentArea.textContent();
    expect(
      opponentText?.includes("LLaMA") || opponentText?.includes("샤크")
    ).toBeTruthy();
  });

  test("TC-AB-004: 턴 타이머가 표시된다", async ({ page }) => {
    await createAIBattle(page, {
      playerCount: 2,
      aiModel: "LLaMA (Ollama)",
      turnTimeout: 120,
    });
    await waitForGameReady(page);

    // 턴 타이머 영역이 존재
    await expect(page.locator("text=턴 #")).toBeVisible({ timeout: 10_000 });
  });

  test("TC-AB-005: 드로우 파일 카운트가 표시된다", async ({ page }) => {
    await createAIBattle(page, {
      playerCount: 2,
      aiModel: "LLaMA (Ollama)",
      turnTimeout: 120,
    });
    await waitForGameReady(page);

    // 드로우 파일 정보 표시 (2인: 106 - 28 = 78장)
    await expect(page.locator("text=드로우 파일").first()).toBeVisible({
      timeout: 10_000,
    });
    await expect(page.locator("text=장").first()).toBeVisible();
  });

  test("TC-AB-006: 내 차례에 액션 버튼이 활성화된다", async ({ page }) => {
    await createAIBattle(page, {
      playerCount: 2,
      aiModel: "LLaMA (Ollama)",
      aiPersona: "루키",
      turnTimeout: 120,
    });
    await waitForGameReady(page);

    // 내 차례 대기 (Seat 0이 항상 먼저)
    await waitForMyTurn(page, 60_000);

    // 드로우 버튼이 표시됨
    const drawBtn = page.locator('button:has-text("드로우")');
    await expect(drawBtn.first()).toBeVisible({ timeout: 5_000 });
  });

  test("TC-AB-007: 드로우 버튼 클릭 시 타일이 추가된다", async ({ page }) => {
    await createAIBattle(page, {
      playerCount: 2,
      aiModel: "LLaMA (Ollama)",
      aiPersona: "루키",
      turnTimeout: 120,
    });
    await waitForGameReady(page);
    await waitForMyTurn(page, 60_000);

    // 드로우 전 타일 수 확인
    const beforeCount = await page
      .locator('[aria-label*="타일 (드래그"]')
      .count();

    // 드로우 클릭
    await page.locator('button:has-text("드로우")').first().click();

    // 드로우 후 타일 수 증가 확인 (1장 추가)
    await page.waitForTimeout(2000);
    const afterCount = await page
      .locator('[aria-label*="타일 (드래그"]')
      .count();
    expect(afterCount).toBe(beforeCount + 1);
  });

  test("TC-AB-008: AI 차례에 상대 카드에 '내 차례' 배지가 표시된다", async ({ page }) => {
    await createAIBattle(page, {
      playerCount: 2,
      aiModel: "LLaMA (Ollama)",
      aiPersona: "루키",
      turnTimeout: 120,
    });
    await waitForGameReady(page);

    // 내 차례에 드로우하여 턴 넘기기
    await waitForMyTurn(page, 120_000);
    await page.locator('button:has-text("드로우")').first().click();

    // AI 턴 확인: ActionBar 숨김 + 상대 PlayerCard에 "내 차례" 배지 표시
    // (서버가 AI_THINKING 메시지를 보내지 않으므로 "사고 중..." 오버레이 대신
    //  상대 카드 "내 차례" 배지 + 액션바 숨김으로 AI 턴 진행을 확인한다)
    await waitForAITurn(page, 60_000);
  });

  test("TC-AB-009: AI 턴이 끝나면 다시 내 차례로 돌아온다", async ({ page }) => {
    await createAIBattle(page, {
      playerCount: 2,
      aiModel: "LLaMA (Ollama)",
      aiPersona: "루키",
      turnTimeout: 120,
    });
    await waitForGameReady(page);

    // 턴 1: 내 차례 → 드로우
    await waitForMyTurn(page, 60_000);
    await page.locator('button:has-text("드로우")').first().click();

    // AI 턴 대기 → 내 차례 복귀 (Ollama CPU: ~25초)
    await waitForMyTurnAfterAction(page, 180_000);

    // ActionBar가 다시 보이면 내 차례
    await expect(page.locator('[aria-label="게임 액션"]')).toBeVisible();
  });

  test("TC-AB-010: 최초 등록 30점 안내가 표시된다", async ({ page }) => {
    await createAIBattle(page, {
      playerCount: 2,
      aiModel: "LLaMA (Ollama)",
      turnTimeout: 120,
    });
    await waitForGameReady(page);

    // "최초 등록 30점 이상 필요" 텍스트 확인
    await expect(
      page.locator("text=30점").first()
    ).toBeVisible({ timeout: 10_000 });
  });
});

// ==================================================================
// 2. TC-AM: AI 모델별 대전 설정 (방 생성 단계만 — API 비용 최소화)
// ==================================================================

test.describe("TC-AM: AI 모델별 방 생성 설정", () => {
  test.setTimeout(60_000);

  test("TC-AM-001: GPT (OpenAI) 모델로 방 생성 설정", async ({ page }) => {
    await page.goto("/room/create");
    await page.waitForLoadState("domcontentloaded");
    await expect(
      page.locator('form[aria-label="게임 방 생성 폼"]')
    ).toBeVisible({ timeout: 10_000 });

    await page.getByLabel("AI 1 모델 선택").selectOption({ label: "GPT (OpenAI)" });

    const selected = await page.getByLabel("AI 1 모델 선택").inputValue();
    expect(selected).toBe("AI_OPENAI");
  });

  test("TC-AM-002: Claude (Anthropic) 모델로 방 생성 설정", async ({ page }) => {
    await page.goto("/room/create");
    await page.waitForLoadState("domcontentloaded");
    await expect(
      page.locator('form[aria-label="게임 방 생성 폼"]')
    ).toBeVisible({ timeout: 10_000 });

    await page
      .getByLabel("AI 1 모델 선택")
      .selectOption({ label: "Claude (Anthropic)" });

    const selected = await page.getByLabel("AI 1 모델 선택").inputValue();
    expect(selected).toBe("AI_CLAUDE");
  });

  test("TC-AM-003: DeepSeek 모델로 방 생성 설정", async ({ page }) => {
    await page.goto("/room/create");
    await page.waitForLoadState("domcontentloaded");
    await expect(
      page.locator('form[aria-label="게임 방 생성 폼"]')
    ).toBeVisible({ timeout: 10_000 });

    await page.getByLabel("AI 1 모델 선택").selectOption({ label: "DeepSeek" });

    const selected = await page.getByLabel("AI 1 모델 선택").inputValue();
    expect(selected).toBe("AI_DEEPSEEK");
  });

  test("TC-AM-004: LLaMA (Ollama) 모델로 방 생성 설정", async ({ page }) => {
    await page.goto("/room/create");
    await page.waitForLoadState("domcontentloaded");
    await expect(
      page.locator('form[aria-label="게임 방 생성 폼"]')
    ).toBeVisible({ timeout: 10_000 });

    await page.getByLabel("AI 1 모델 선택").selectOption({ label: "LLaMA (Ollama)" });

    const selected = await page.getByLabel("AI 1 모델 선택").inputValue();
    expect(selected).toBe("AI_LLAMA");
  });

  test("TC-AM-005: 4인 모드 — 3개 AI 모두 다른 모델로 설정", async ({ page }) => {
    await page.goto("/room/create");
    await page.waitForLoadState("domcontentloaded");
    await expect(
      page.locator('form[aria-label="게임 방 생성 폼"]')
    ).toBeVisible({ timeout: 10_000 });

    // 4인 모드
    await page.getByRole("button", { name: "4인" }).click();

    // AI 2개 추가 (기본 1개 + 2개 = 3개)
    await page.getByLabel("AI 플레이어 추가").click();
    await page.getByLabel("AI 플레이어 추가").click();

    // 각 AI 다른 모델 설정
    await page.getByLabel("AI 1 모델 선택").selectOption({ label: "GPT (OpenAI)" });
    await page.getByLabel("AI 2 모델 선택").selectOption({ label: "Claude (Anthropic)" });
    await page.getByLabel("AI 3 모델 선택").selectOption({ label: "DeepSeek" });

    // 확인
    expect(await page.getByLabel("AI 1 모델 선택").inputValue()).toBe("AI_OPENAI");
    expect(await page.getByLabel("AI 2 모델 선택").inputValue()).toBe("AI_CLAUDE");
    expect(await page.getByLabel("AI 3 모델 선택").inputValue()).toBe("AI_DEEPSEEK");
  });

  test("TC-AM-006: 모든 페르소나를 순회하며 설정 가능 확인", async ({ page }) => {
    await page.goto("/room/create");
    await page.waitForLoadState("domcontentloaded");
    await expect(
      page.locator('form[aria-label="게임 방 생성 폼"]')
    ).toBeVisible({ timeout: 10_000 });

    const personas = ["루키", "계산기", "샤크", "폭스", "벽", "와일드카드"];
    for (const persona of personas) {
      const btn = page
        .locator('[aria-label="AI 슬롯 1"]')
        .getByRole("button", { name: new RegExp(persona) });
      await btn.click();
      await expect(btn).toHaveAttribute("aria-pressed", "true");
    }
  });

  test("TC-AM-007: 심리전 레벨 0~3 설정 UI 존재 확인", async ({ page }) => {
    await page.goto("/room/create");
    await page.waitForLoadState("domcontentloaded");
    await expect(
      page.locator('form[aria-label="게임 방 생성 폼"]')
    ).toBeVisible({ timeout: 10_000 });

    // 심리전 레벨 슬라이더 존재
    const slider = page.locator('[aria-label*="심리전"]');
    await expect(slider.first()).toBeVisible({ timeout: 5_000 });
  });
});

// ==================================================================
// 3. TC-MX: 다인전 AI 혼합 설정
// ==================================================================

test.describe("TC-MX: 다인전 AI 혼합 설정", () => {
  test.setTimeout(60_000);

  test("TC-MX-001: 3인 모드 — Human 1 + AI 2 설정", async ({ page }) => {
    await page.goto("/room/create");
    await page.waitForLoadState("domcontentloaded");
    await expect(
      page.locator('form[aria-label="게임 방 생성 폼"]')
    ).toBeVisible({ timeout: 10_000 });

    await page.getByRole("button", { name: "3인" }).click();
    await page.getByLabel("AI 플레이어 추가").click();

    // AI 슬롯 2개 존재
    await expect(page.locator('[aria-label="AI 슬롯 1"]')).toBeVisible();
    await expect(page.locator('[aria-label="AI 슬롯 2"]')).toBeVisible();

    // 각각 다른 모델
    await page.getByLabel("AI 1 모델 선택").selectOption({ label: "GPT (OpenAI)" });
    await page.getByLabel("AI 2 모델 선택").selectOption({ label: "LLaMA (Ollama)" });

    expect(await page.getByLabel("AI 1 모델 선택").inputValue()).toBe("AI_OPENAI");
    expect(await page.getByLabel("AI 2 모델 선택").inputValue()).toBe("AI_LLAMA");
  });

  test("TC-MX-002: 4인 모드 — Human 1 + AI 3 전부 Ollama(무료) 설정", async ({
    page,
  }) => {
    await page.goto("/room/create");
    await page.waitForLoadState("domcontentloaded");
    await expect(
      page.locator('form[aria-label="게임 방 생성 폼"]')
    ).toBeVisible({ timeout: 10_000 });

    await page.getByRole("button", { name: "4인" }).click();
    await page.getByLabel("AI 플레이어 추가").click();
    await page.getByLabel("AI 플레이어 추가").click();

    // 3개 AI 모두 Ollama
    for (let i = 1; i <= 3; i++) {
      await page
        .getByLabel(`AI ${i} 모델 선택`)
        .selectOption({ label: "LLaMA (Ollama)" });
    }

    for (let i = 1; i <= 3; i++) {
      expect(await page.getByLabel(`AI ${i} 모델 선택`).inputValue()).toBe(
        "AI_LLAMA"
      );
    }
  });

  test("TC-MX-003: 4인 모드 — 각 AI 다른 난이도 설정", async ({ page }) => {
    await page.goto("/room/create");
    await page.waitForLoadState("domcontentloaded");
    await expect(
      page.locator('form[aria-label="게임 방 생성 폼"]')
    ).toBeVisible({ timeout: 10_000 });

    await page.getByRole("button", { name: "4인" }).click();
    await page.getByLabel("AI 플레이어 추가").click();
    await page.getByLabel("AI 플레이어 추가").click();

    await page.getByLabel("AI 1 난이도 선택").selectOption({ label: "하수" });
    await page.getByLabel("AI 2 난이도 선택").selectOption({ label: "중수" });
    await page.getByLabel("AI 3 난이도 선택").selectOption({ label: "고수" });

    expect(await page.getByLabel("AI 1 난이도 선택").inputValue()).toBe("beginner");
    expect(await page.getByLabel("AI 2 난이도 선택").inputValue()).toBe("intermediate");
    expect(await page.getByLabel("AI 3 난이도 선택").inputValue()).toBe("expert");
  });

  test("TC-MX-004: 4인 모드 — 각 AI 다른 페르소나 설정", async ({ page }) => {
    await page.goto("/room/create");
    await page.waitForLoadState("domcontentloaded");
    await expect(
      page.locator('form[aria-label="게임 방 생성 폼"]')
    ).toBeVisible({ timeout: 10_000 });

    await page.getByRole("button", { name: "4인" }).click();
    await page.getByLabel("AI 플레이어 추가").click();
    await page.getByLabel("AI 플레이어 추가").click();

    // AI 1: 루키, AI 2: 계산기, AI 3: 폭스
    await page
      .locator('[aria-label="AI 슬롯 1"]')
      .getByRole("button", { name: /루키/ })
      .click();
    await page
      .locator('[aria-label="AI 슬롯 2"]')
      .getByRole("button", { name: /계산기/ })
      .click();
    await page
      .locator('[aria-label="AI 슬롯 3"]')
      .getByRole("button", { name: /폭스/ })
      .click();

    await expect(
      page
        .locator('[aria-label="AI 슬롯 1"]')
        .getByRole("button", { name: /루키/ })
    ).toHaveAttribute("aria-pressed", "true");
    await expect(
      page
        .locator('[aria-label="AI 슬롯 2"]')
        .getByRole("button", { name: /계산기/ })
    ).toHaveAttribute("aria-pressed", "true");
    await expect(
      page
        .locator('[aria-label="AI 슬롯 3"]')
        .getByRole("button", { name: /폭스/ })
    ).toHaveAttribute("aria-pressed", "true");
  });
});

// ==================================================================
// 4. TC-GP: AI 대전 게임 진행 (Ollama — 무료, 다중 턴)
// ==================================================================

test.describe("TC-GP: AI 대전 게임 진행 (Ollama)", () => {
  test.setTimeout(600_000); // 10분 — 다중 턴 AI 응답 대기

  test("TC-GP-001: 2턴 이상 진행 — 드로우 → AI 턴 → 내 차례 복귀 반복", async ({
    page,
  }) => {
    await createAIBattle(page, {
      playerCount: 2,
      aiModel: "LLaMA (Ollama)",
      aiPersona: "루키",
      aiDifficulty: "하수",
      turnTimeout: 120,
    });
    await waitForGameReady(page);

    // 턴 1: 내 차례 → 드로우 (Ollama CPU: 초기 로딩 느림)
    await waitForMyTurn(page, 120_000);
    const turn1 = await getTurnNumber(page);
    await page.locator('button:has-text("드로우")').first().click();

    // AI 턴 완료 후 내 차례 복귀 대기
    // waitForMyTurnAfterAction: "내 차례" 사라짐 확인 → 다시 나타남 확인
    await waitForMyTurnAfterAction(page, 180_000);
    // 턴 번호가 확실히 증가했는지 대기 (DOM 업데이트 타이밍 보장)
    await waitForTurnGreaterThan(page, turn1, 10_000);
    const turn2 = await getTurnNumber(page);
    expect(turn2).toBeGreaterThan(turn1);

    // 턴 2: 드로우
    await page.locator('button:has-text("드로우")').first().click();

    // AI 턴 완료 후 내 차례 복귀 대기
    await waitForMyTurnAfterAction(page, 180_000);
    await waitForTurnGreaterThan(page, turn2, 10_000);
    const turn3 = await getTurnNumber(page);
    expect(turn3).toBeGreaterThan(turn2);
  });

  test("TC-GP-002: 게임 진행 중 연결 상태가 유지된다", async ({ page }) => {
    await createAIBattle(page, {
      playerCount: 2,
      aiModel: "LLaMA (Ollama)",
      aiPersona: "루키",
      turnTimeout: 120,
    });
    await waitForGameReady(page);
    await waitForMyTurn(page, 60_000);

    // 연결 상태 확인 — 에러 토스트가 없어야 함
    const errorToast = page.locator("text=연결이 끊어졌습니다");
    await expect(errorToast).not.toBeVisible({ timeout: 5_000 });
  });

  test("TC-GP-003: 게임 보드에 테이블 그룹 영역이 존재한다", async ({ page }) => {
    await createAIBattle(page, {
      playerCount: 2,
      aiModel: "LLaMA (Ollama)",
      turnTimeout: 120,
    });
    await waitForGameReady(page);

    // 게임 테이블 (빈 상태라도 영역 존재)
    await expect(
      page.locator('section[aria-label="게임 테이블"]')
    ).toBeVisible();
  });

  test("TC-GP-004: 게임 종료 오버레이 — window.__gameStore로 게임 종료 시뮬레이션", async ({
    page,
  }) => {
    await createAIBattle(page, {
      playerCount: 2,
      aiModel: "LLaMA (Ollama)",
      turnTimeout: 120,
    });
    await waitForGameReady(page);

    // gameStore를 사용하여 게임 종료 시뮬레이션
    await page.waitForFunction(
      () => !!(window as unknown as Record<string, unknown>).__gameStore,
      { timeout: 15_000 }
    );

    await page.evaluate(() => {
      const store = (
        window as unknown as Record<
          string,
          { setState: (s: Record<string, unknown>) => void }
        >
      ).__gameStore;
      store.setState({
        gameEnded: true,
        gameOverResult: {
          endType: "NORMAL",
          results: [
            { seat: 0, remainingTiles: [], isWinner: true },
            { seat: 1, remainingTiles: ["R1a", "B2a"], isWinner: false },
          ],
        },
      });
    });

    // 게임 종료 오버레이 확인
    await expect(
      page.locator('div[role="dialog"][aria-label="게임 종료"]')
    ).toBeVisible({ timeout: 5_000 });

    // "게임 종료" 제목
    await expect(page.locator("text=게임 종료").first()).toBeVisible();

    // 결과 테이블
    await expect(
      page.locator('table[aria-label="게임 결과"]')
    ).toBeVisible();

    // 로비로 돌아가기 버튼
    await expect(
      page.locator('button:has-text("로비로 돌아가기")')
    ).toBeVisible();
  });

  test("TC-GP-005: 교착 종료 오버레이 — STALEMATE endType 표시", async ({
    page,
  }) => {
    await createAIBattle(page, {
      playerCount: 2,
      aiModel: "LLaMA (Ollama)",
      turnTimeout: 120,
    });
    await waitForGameReady(page);

    await page.waitForFunction(
      () => !!(window as unknown as Record<string, unknown>).__gameStore,
      { timeout: 15_000 }
    );

    await page.evaluate(() => {
      const store = (
        window as unknown as Record<
          string,
          { setState: (s: Record<string, unknown>) => void }
        >
      ).__gameStore;
      store.setState({
        gameEnded: true,
        deadlockReason: "ALL_PASS",
        gameOverResult: {
          endType: "STALEMATE",
          results: [
            { seat: 0, remainingTiles: ["R1a"], isWinner: true },
            { seat: 1, remainingTiles: ["R2a", "B3a"], isWinner: false },
          ],
        },
      });
    });

    // 교착 종료 라벨 확인
    await expect(page.locator("text=교착 종료").first()).toBeVisible({
      timeout: 5_000,
    });
    await expect(
      page.locator("text=모든 플레이어가 연속으로 패스").first()
    ).toBeVisible();
  });

  test("TC-GP-006: 게임 종료 후 로비로 돌아가기 클릭 → /lobby 이동", async ({
    page,
  }) => {
    await createAIBattle(page, {
      playerCount: 2,
      aiModel: "LLaMA (Ollama)",
      turnTimeout: 120,
    });
    await waitForGameReady(page);

    await page.waitForFunction(
      () => !!(window as unknown as Record<string, unknown>).__gameStore,
      { timeout: 15_000 }
    );

    // 게임 종료 시뮬레이션
    await page.evaluate(() => {
      const store = (
        window as unknown as Record<
          string,
          { setState: (s: Record<string, unknown>) => void }
        >
      ).__gameStore;
      store.setState({
        gameEnded: true,
        gameOverResult: {
          endType: "NORMAL",
          results: [
            { seat: 0, remainingTiles: [], isWinner: true },
            { seat: 1, remainingTiles: ["R1a"], isWinner: false },
          ],
        },
      });
    });

    await expect(
      page.locator('button:has-text("로비로 돌아가기")')
    ).toBeVisible({ timeout: 5_000 });

    await page.locator('button:has-text("로비로 돌아가기")').click();
    await page.waitForURL(/\/lobby/, { timeout: 10_000 });
    await expect(page).toHaveURL(/\/lobby/);
  });
});
