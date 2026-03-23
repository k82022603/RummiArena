/**
 * 연습 모드 E2E 테스트
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
 * 드래그 시뮬레이션:
 *   Playwright dragTo()는 HTML5 drag API 기반.
 *   dnd-kit은 Pointer Events를 사용하므로 dispatchEvent로 직접 시뮬레이션.
 */

import { test, expect, Page } from "@playwright/test";

// ------------------------------------------------------------------
// 헬퍼: dnd-kit 호환 드래그 (PointerEvent 기반)
// ------------------------------------------------------------------

async function dndKitDrag(
  page: Page,
  sourceSelector: string,
  targetSelector: string
) {
  const source = page.locator(sourceSelector).first();
  const target = page.locator(targetSelector).first();

  const sourceBox = await source.boundingBox();
  const targetBox = await target.boundingBox();
  if (!sourceBox || !targetBox) throw new Error(`bounding box not found`);

  const sx = sourceBox.x + sourceBox.width / 2;
  const sy = sourceBox.y + sourceBox.height / 2;
  const tx = targetBox.x + targetBox.width / 2;
  const ty = targetBox.y + targetBox.height / 2;

  await page.mouse.move(sx, sy);
  await page.mouse.down();
  // dnd-kit activationConstraint: distance: 8 을 넘기기 위해 소폭 이동
  await page.mouse.move(sx + 5, sy + 5, { steps: 3 });
  await page.mouse.move(tx, ty, { steps: 10 });
  await page.mouse.up();
  await page.waitForTimeout(200);
}

// ------------------------------------------------------------------
// Stage 1: 그룹 만들기
// ------------------------------------------------------------------

test.describe("Stage 1 — 그룹 만들기", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/practice/1");
    await page.waitForSelector('[aria-label="내 타일 (6개)"]', { timeout: 5000 });
  });

  test("랙에 6개 타일이 초기 로드된다", async ({ page }) => {
    // PlayerRack 내 타일 수 확인
    const rack = page.locator('[aria-label="내 타일 (6개)"]');
    await expect(rack).toBeVisible();
  });

  test("초기화 버튼으로 타일이 원복된다", async ({ page }) => {
    await page.getByRole("button", { name: "초기화" }).click();
    await expect(page.locator('[aria-label="내 타일 (6개)"]')).toBeVisible();
  });

  test("확정 버튼은 클리어 전 비활성화", async ({ page }) => {
    const confirmBtn = page.getByRole("button", { name: "확정" });
    await expect(confirmBtn).toBeDisabled();
  });

  test("3개 타일을 보드에 드래그하면 그룹이 생성된다", async ({ page }) => {
    const board = page.locator('[aria-label="게임 테이블"]');

    // 첫 번째 타일 → 빈 보드에 드롭 (새 그룹 생성)
    await dndKitDrag(page, '[aria-label*="R7a 타일"]', '[aria-label="게임 테이블"]');
    // 두 번째 타일 → 보드에 드롭 (마지막 그룹에 추가)
    await dndKitDrag(page, '[aria-label*="B7a 타일"]', '[aria-label="게임 테이블"]');
    // 세 번째 타일 → 보드에 드롭
    await dndKitDrag(page, '[aria-label*="Y7a 타일"]', '[aria-label="게임 테이블"]');

    // 보드에 "그룹" 레이블이 나타나야 함
    await expect(board.locator("text=그룹")).toBeVisible({ timeout: 3000 });
  });

  test("유효한 그룹 배치 시 클리어 뱃지가 나타난다", async ({ page }) => {
    await dndKitDrag(page, '[aria-label*="R7a 타일"]', '[aria-label="게임 테이블"]');
    await dndKitDrag(page, '[aria-label*="B7a 타일"]', '[aria-label="게임 테이블"]');
    await dndKitDrag(page, '[aria-label*="Y7a 타일"]', '[aria-label="게임 테이블"]');

    await expect(page.getByRole("status", { name: "클리어 가능!" })).toBeVisible({ timeout: 3000 });
  });

  test("클리어 후 확정 버튼이 활성화된다", async ({ page }) => {
    await dndKitDrag(page, '[aria-label*="R7a 타일"]', '[aria-label="게임 테이블"]');
    await dndKitDrag(page, '[aria-label*="B7a 타일"]', '[aria-label="게임 테이블"]');
    await dndKitDrag(page, '[aria-label*="Y7a 타일"]', '[aria-label="게임 테이블"]');

    const confirmBtn = page.getByRole("button", { name: "클리어 확정!" });
    await expect(confirmBtn).toBeEnabled({ timeout: 3000 });
  });
});

// ------------------------------------------------------------------
// Stage 2: 런 만들기
// ------------------------------------------------------------------

test.describe("Stage 2 — 런 만들기", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/practice/2");
    await page.waitForSelector('[aria-label="내 타일 (6개)"]', { timeout: 5000 });
  });

  test("랙에 6개 타일이 초기 로드된다", async ({ page }) => {
    await expect(page.locator('[aria-label="내 타일 (6개)"]')).toBeVisible();
  });

  test("R4+R5+R6 배치 시 런 유효성 통과 + 클리어 뱃지", async ({ page }) => {
    await dndKitDrag(page, '[aria-label*="R4a 타일"]', '[aria-label="게임 테이블"]');
    await dndKitDrag(page, '[aria-label*="R5a 타일"]', '[aria-label="게임 테이블"]');
    await dndKitDrag(page, '[aria-label*="R6a 타일"]', '[aria-label="게임 테이블"]');

    await expect(page.getByRole("status", { name: "클리어 가능!" })).toBeVisible({ timeout: 3000 });
  });

  test("런 그룹 기본 타입이 런이다", async ({ page }) => {
    await dndKitDrag(page, '[aria-label*="R4a 타일"]', '[aria-label="게임 테이블"]');
    // 그룹 타입 토글 버튼: 현재 타입이 "런" 이어야 함
    await expect(page.getByRole("button", { name: /런/ })).toBeVisible({ timeout: 2000 });
  });
});

// ------------------------------------------------------------------
// Stage 3: 조커 활용
// ------------------------------------------------------------------

test.describe("Stage 3 — 조커 활용", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/practice/3");
    await page.waitForSelector('[aria-label="내 타일 (6개)"]', { timeout: 5000 });
  });

  test("초기화 버튼이 동작한다", async ({ page }) => {
    await page.getByRole("button", { name: "초기화" }).click();
    await expect(page.locator('[aria-label="내 타일 (6개)"]')).toBeVisible();
  });
});

// ------------------------------------------------------------------
// 연습 모드 네비게이션
// ------------------------------------------------------------------

test.describe("연습 모드 네비게이션", () => {
  test("Stage 1 페이지가 로드된다", async ({ page }) => {
    await page.goto("/practice/1");
    await expect(page.locator("text=그룹 만들기")).toBeVisible({ timeout: 5000 });
  });

  test("Stage 2 페이지가 로드된다", async ({ page }) => {
    await page.goto("/practice/2");
    await expect(page.locator("text=런 만들기")).toBeVisible({ timeout: 5000 });
  });

  test("Stage 6 페이지가 로드된다", async ({ page }) => {
    await page.goto("/practice/6");
    await expect(page.locator("text=루미큐브 마스터")).toBeVisible({ timeout: 5000 });
  });

  test("잘못된 스테이지 번호는 리디렉트된다", async ({ page }) => {
    await page.goto("/practice/99");
    // /practice 또는 /lobby로 리디렉트 기대
    await expect(page).not.toHaveURL(/\/practice\/99/, { timeout: 3000 });
  });
});
