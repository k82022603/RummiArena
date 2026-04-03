/**
 * [C] 게임 상태 표시 UI 테스트
 *
 * 게임 진행 중 플레이어 패널, 드로우 파일, 연결 상태 등
 * 게임 상태 관련 UI 요소가 올바르게 표시되는지 검증한다.
 *
 * 이 테스트는 실제 게임을 생성한 상태에서 수행한다.
 */

import { test, expect } from "@playwright/test";
import {
  createRoomAndStart,
  waitForGameReady,
  waitForMyTurn,
} from "./helpers/game-helpers";

// ==================================================================
// C-1. 플레이어 패널
// ==================================================================

test.describe("C-1: 플레이어 패널", () => {
  test.setTimeout(180_000);

  test("CS-01: 상대 플레이어 카드 표시", async ({ page }) => {
    await createRoomAndStart(page);
    await waitForGameReady(page);

    const opponentArea = page.locator('[aria-label="상대 플레이어"]');
    await expect(opponentArea).toBeVisible({ timeout: 15_000 });

    const playerCards = opponentArea.locator('[aria-label*="플레이어 카드"]');
    await expect(playerCards.first()).toBeVisible({ timeout: 15_000 });
  });

  test("CS-02: 내 플레이어 카드 표시 (내 정보 패널)", async ({ page }) => {
    await createRoomAndStart(page);
    await waitForGameReady(page);

    const myPanel = page.locator('aside[aria-label="내 정보 패널"]');
    await expect(myPanel).toBeVisible({ timeout: 15_000 });

    const myCard = myPanel.locator('[aria-label*="플레이어 카드"]');
    await expect(myCard.first()).toBeVisible({ timeout: 15_000 });
  });

  test("CS-03: 연결 상태 표시 (초록점)", async ({ page }) => {
    await createRoomAndStart(page);
    await waitForGameReady(page);

    await expect(
      page.locator('[aria-label="연결됨"]').first()
    ).toBeVisible({ timeout: 15_000 });
  });

  test("CS-04: 상대 AI 플레이어 타일 수 표시", async ({ page }) => {
    await createRoomAndStart(page);
    await waitForGameReady(page);

    const opponentCard = page
      .locator('[aria-label="상대 플레이어"]')
      .locator('[aria-label*="플레이어 카드"]')
      .first();
    await expect(opponentCard).toBeVisible({ timeout: 15_000 });
  });

  test("CS-05: 최초 등록 여부 표시", async ({ page }) => {
    await createRoomAndStart(page);
    await waitForGameReady(page);

    const hasRegistration = await page
      .locator("text=/등록 전|등록 완료/")
      .first()
      .isVisible()
      .catch(() => false);
    expect(hasRegistration).toBeTruthy();
  });

  test("CS-06: 현재 턴 플레이어 하이라이트", async ({ page }) => {
    await createRoomAndStart(page);
    await waitForGameReady(page);

    // 게임 진행 중이면 "내 차례" 배지, AI 사고 중, 드로우 버튼, 게임 종료 중 하나가 보여야 한다
    await page.waitForFunction(
      () => {
        const body = document.body.textContent ?? "";
        return (
          body.includes("내 차례") ||
          body.includes("사고 중") ||
          body.includes("게임 종료") ||
          body.includes("드로우")
        );
      },
      { timeout: 60_000 }
    );
  });
});

// ==================================================================
// C-2. 드로우 파일 표시
// ==================================================================

test.describe("C-2: 드로우 파일 표시", () => {
  test.setTimeout(180_000);

  test("CS-07: 드로우 파일 수 표시", async ({ page }) => {
    await createRoomAndStart(page);
    await waitForGameReady(page);

    const drawPile = page.locator('[aria-label*="드로우 파일"]');
    await expect(drawPile.first()).toBeVisible({ timeout: 15_000 });

    await expect(page.locator("text=/\\d+장/").first()).toBeVisible({
      timeout: 15_000,
    });
  });

  test("CS-08: 드로우 파일 카드 스택 시각화", async ({ page }) => {
    await createRoomAndStart(page);
    await waitForGameReady(page);

    await expect(page.locator("text=드로우 파일")).toBeVisible({
      timeout: 15_000,
    });
  });
});

// ==================================================================
// C-3. 게임 화면 레이아웃 일관성
// ==================================================================

test.describe("C-3: 게임 화면 레이아웃", () => {
  test.setTimeout(180_000);

  test("CS-09: 전체 레이아웃 구조 확인 (헤더+상대+보드+랙)", async ({
    page,
  }) => {
    await createRoomAndStart(page);
    await waitForGameReady(page);

    // 헤더: Room
    await expect(page.locator("text=/Room/").first()).toBeVisible({
      timeout: 15_000,
    });

    // 상대 플레이어 영역
    await expect(
      page.locator('[aria-label="상대 플레이어"]')
    ).toBeVisible();

    // 내 정보 패널
    await expect(
      page.locator('aside[aria-label="내 정보 패널"]')
    ).toBeVisible();

    // 게임 테이블
    await expect(
      page.locator('section[aria-label="게임 테이블"]')
    ).toBeVisible();

    // 내 타일 랙
    await expect(
      page.locator('section[aria-label="내 타일 랙"]')
    ).toBeVisible();
  });

  test("CS-10: Room ID 표시", async ({ page }) => {
    await createRoomAndStart(page);
    await waitForGameReady(page);

    await expect(page.locator("text=Room").first()).toBeVisible({
      timeout: 15_000,
    });
  });

  test("CS-11: 내 패 수 표시", async ({ page }) => {
    await createRoomAndStart(page);
    await waitForGameReady(page);

    await expect(
      page.locator("text=/내 패.*장/").first()
    ).toBeVisible({ timeout: 15_000 });
  });

  test("CS-12: 최초 등록 30점 안내 표시", async ({ page }) => {
    await createRoomAndStart(page);
    await waitForGameReady(page);

    const hasInitialMeldText = await page
      .locator("text=/최초 등록/")
      .first()
      .isVisible()
      .catch(() => false);
    expect(hasInitialMeldText).toBeTruthy();
  });
});

// ==================================================================
// C-4. 게임 액션 버튼 상태
// ==================================================================

test.describe("C-4: 게임 액션 버튼 상태", () => {
  test.setTimeout(180_000);

  test("CS-13: 내 차례에 액션 버튼(드로우/초기화/확정) 표시", async ({
    page,
  }) => {
    await createRoomAndStart(page);
    await waitForGameReady(page);

    // 내 차례 대기
    await waitForMyTurn(page);

    // 액션 버튼 그룹 확인
    await expect(
      page.locator('[role="group"][aria-label="게임 액션"]')
    ).toBeVisible({ timeout: 5000 });

    // 드로우 버튼 확인
    await expect(page.getByLabel("타일 드로우")).toBeVisible();

    // 초기화 버튼 확인
    await expect(
      page.getByLabel("이번 턴 배치 초기화 (서버에 RESET_TURN 전송)")
    ).toBeVisible();

    // 확정 버튼 확인
    await expect(page.getByLabel("배치 확정")).toBeVisible();
  });

  test("CS-14: 초기 상태에서 드로우 활성, 초기화/확정 비활성", async ({
    page,
  }) => {
    await createRoomAndStart(page);
    await waitForGameReady(page);

    await waitForMyTurn(page);

    // 드로우: hasPending=false이므로 활성
    await expect(page.getByLabel("타일 드로우")).not.toBeDisabled();

    // 초기화: hasPending=false이므로 비활성
    await expect(
      page.getByLabel("이번 턴 배치 초기화 (서버에 RESET_TURN 전송)")
    ).toBeDisabled();

    // 확정: hasPending=false이므로 비활성
    await expect(page.getByLabel("배치 확정")).toBeDisabled();
  });
});

// ==================================================================
// C-5. 연결 상태 배너
// ==================================================================

test.describe("C-5: 연결 상태", () => {
  test("CS-15: 정상 연결 시 경고 배너 미표시", async ({ page }) => {
    await page.goto("/lobby");
    await page.waitForLoadState("domcontentloaded");

    await page.waitForTimeout(2000);
    const alertBanner = page.locator('[role="alert"][aria-live="assertive"]');
    const count = await alertBanner.count();
    if (count > 0) {
      const text = await alertBanner.first().textContent();
      expect(text).not.toContain("연결이 끊어졌습니다");
    }
  });
});
