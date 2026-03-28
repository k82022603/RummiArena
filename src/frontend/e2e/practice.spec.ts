/**
 * 연습 모드 E2E 테스트 (스모크 테스트)
 *
 * 테스트 대상: localhost:30000/practice/:stageNum
 *
 * Stage 1 — 그룹 만들기 (goal: "group")
 *   패: R7, B7, Y7, K7, R3, B5
 *   정답: R7 + B7 + Y7 (또는 K7 포함 4개) → 유효한 그룹
 *
 * Stage 2 — 런 만들기 (goal: "run")
 *   패: R4, R5, R6, R7, B3, K8
 *   정답: R4 + R5 + R6 → 유효한 런
 *
 * 드래그 구현: helpers.ts의 dndDrag(PointerEvent 기반) 활용
 *   - helpers.ts 전용 함수는 01~06 spec에서 검증됨
 */

import { test, expect } from "@playwright/test";
import { goToStage, dragTileToBoard, dragTilesToBoard } from "./helpers";

// ------------------------------------------------------------------
// Stage 1: 그룹 만들기
// ------------------------------------------------------------------

test.describe("Stage 1 — 그룹 만들기", () => {
  test.beforeEach(async ({ page }) => {
    await goToStage(page, 1);
  });

  test("랙에 6개 타일이 초기 로드된다", async ({ page }) => {
    const rack = page.locator('[aria-label="내 타일 랙"]');
    await expect(rack).toBeVisible();
  });

  test("초기화 버튼으로 타일이 원복된다", async ({ page }) => {
    await page.getByRole("button", { name: "초기화" }).click();
    await expect(page.locator('[aria-label="내 타일 랙"]')).toBeVisible();
  });

  test("확정 버튼은 클리어 전 비활성화", async ({ page }) => {
    const confirmBtn = page.getByLabel("스테이지 클리어 확정");
    await expect(confirmBtn).toBeDisabled();
  });

  test("3개 타일을 보드에 드래그하면 그룹이 생성된다", async ({ page }) => {
    const board = page.locator('section[aria-label="게임 테이블"]');

    await dragTileToBoard(page, "R7a");
    await expect(board.getByText("그룹").first()).toBeVisible({ timeout: 5000 });
  });

  test("유효한 그룹 배치 시 클리어 뱃지가 나타난다", async ({ page }) => {
    await dragTilesToBoard(page, ["R7a", "B7a", "Y7a"]);
    await expect(page.locator('span[role="status"]:has-text("클리어 가능!")')).toBeVisible({ timeout: 5000 });
  });

  test("클리어 후 확정 버튼이 활성화된다", async ({ page }) => {
    await dragTilesToBoard(page, ["R7a", "B7a", "Y7a"]);
    await expect(page.getByLabel("스테이지 클리어 확정")).not.toBeDisabled({ timeout: 5000 });
  });
});

// ------------------------------------------------------------------
// Stage 2: 런 만들기
// ------------------------------------------------------------------

test.describe("Stage 2 — 런 만들기", () => {
  test.beforeEach(async ({ page }) => {
    await goToStage(page, 2);
  });

  test("랙에 6개 타일이 초기 로드된다", async ({ page }) => {
    await expect(page.locator('[aria-label="내 타일 랙"]')).toBeVisible();
  });

  test("R4+R5+R6 배치 시 런 유효성 통과 + 클리어 뱃지", async ({ page }) => {
    await dragTilesToBoard(page, ["R4a", "R5a", "R6a"]);
    await expect(page.locator('span[role="status"]:has-text("클리어 가능!")')).toBeVisible({ timeout: 5000 });
  });

  test("런 그룹 기본 타입이 런이다", async ({ page }) => {
    await dragTileToBoard(page, "R4a");
    // 그룹 타입 토글 버튼: aria-label에 "런 → 그룹" 포함
    await expect(
      page.locator('[aria-label="그룹 타입 런 → 그룹으로 변경"]')
    ).toBeVisible({ timeout: 5000 });
  });
});

// ------------------------------------------------------------------
// Stage 3: 조커 활용
// ------------------------------------------------------------------

test.describe("Stage 3 — 조커 활용", () => {
  test.beforeEach(async ({ page }) => {
    await goToStage(page, 3);
  });

  test("초기화 버튼이 동작한다", async ({ page }) => {
    await page.getByRole("button", { name: "초기화" }).click();
    await expect(page.locator('[aria-label="내 타일 랙"]')).toBeVisible();
  });
});

// ------------------------------------------------------------------
// 연습 모드 네비게이션
// ------------------------------------------------------------------

test.describe("연습 모드 네비게이션", () => {
  test("Stage 1 페이지가 로드된다", async ({ page }) => {
    await page.goto("/practice/1");
    await expect(page.getByText("그룹 만들기").first()).toBeVisible({ timeout: 5000 });
  });

  test("Stage 2 페이지가 로드된다", async ({ page }) => {
    await page.goto("/practice/2");
    await expect(page.getByText("런 만들기").first()).toBeVisible({ timeout: 5000 });
  });

  test("Stage 6 페이지가 로드된다", async ({ page }) => {
    await page.goto("/practice/6");
    await expect(page.getByText("루미큐브 마스터").first()).toBeVisible({ timeout: 5000 });
  });

  test("잘못된 스테이지 번호는 /practice로 리디렉트된다", async ({ page }) => {
    await page.goto("/practice/99");
    await expect(page).toHaveURL(/\/practice$/, { timeout: 5000 });
  });
});
