/**
 * [B] 연습 모드 게임룰 UI 테스트
 *
 * Stage 1~6의 게임 규칙이 UI 레벨에서 올바르게 동작하는지 검증한다.
 * 기존 practice.spec.ts와 game-rules.spec.ts를 보완하여
 * 더 깊은 게임룰 검증 시나리오를 추가한다.
 *
 * Stage별 hand:
 *   Stage 1: R7a, B7a, Y7a, K7a, R3a, B5a         (goal: group)
 *   Stage 2: R4a, R5a, R6a, R7a, B3a, K8a          (goal: run)
 *   Stage 3: JK1, R5a, R6a, B7a, Y7a, K7a          (goal: joker)
 *   Stage 4: JK1, Y8a, Y10a, Y11a, R7a, B7a, K7a, R5a, B5a  (goal: multi)
 *   Stage 5: R7a, B7a, Y7a, K7a, R8a, R9a, R10a, B4a, B4b, Y4a, K4a, R3a, R3b, B3a  (goal: multi)
 *   Stage 6: R1a~R6a, B6a, Y6a, K6a, B7a, B8a, B9a, JK1, K3a  (goal: master)
 */

import { test, expect } from "@playwright/test";
import {
  goToStage,
  dragTileToBoard,
  dragTilesToBoard,
  clickNewGroup,
  resetBoard,
} from "./helpers";

// ==================================================================
// B-1. Stage 1: 그룹 규칙 심화 검증
// ==================================================================

test.describe("B-1a: Stage 1 그룹 규칙 심화", () => {
  test.beforeEach(async ({ page }) => {
    await goToStage(page, 1);
  });

  test("BR-01: 같은 색 2개 포함 (R7+R3+B7) -> 무효 (색 중복)", async ({
    page,
  }) => {
    // R7a + R3a는 같은 Red -> 그룹에서 같은 색 중복
    await dragTilesToBoard(page, ["R7a", "R3a", "B7a"]);
    await expect(page.getByLabel("스테이지 클리어 확정")).toBeDisabled();
  });

  test("BR-02: 4색 그룹 후 확정 -> 클리어 결과 화면", async ({ page }) => {
    await dragTilesToBoard(page, ["R7a", "B7a", "Y7a", "K7a"]);
    await expect(
      page.locator('span[role="status"]:has-text("클리어 가능!")')
    ).toBeVisible({ timeout: 5000 });

    // 확정 클릭
    await page.getByLabel("스테이지 클리어 확정").click();

    // 클리어 결과 표시
    await expect(
      page.locator("text=/스테이지 클리어|Stage 1/").first()
    ).toBeVisible({ timeout: 5000 });
  });

  test("BR-03: 5개 타일 배치 시도 (R7+B7+Y7+K7+R3) -> 초과 타일은 무효", async ({
    page,
  }) => {
    // 그룹은 최대 4개 (4색). 5번째 타일은 같은 그룹에 추가되면 무효
    await dragTilesToBoard(page, ["R7a", "B7a", "Y7a", "K7a", "R3a"]);
    // R3a가 추가되면 숫자 불일치로 무효가 될 수 있음
    await expect(page.getByLabel("스테이지 클리어 확정")).toBeDisabled();
  });

  test("BR-04: 목표 타일(goal) 표시 확인", async ({ page }) => {
    // 스테이지 1 "그룹 만들기" 텍스트 확인
    await expect(page.getByText("그룹 만들기").first()).toBeVisible({
      timeout: 5000,
    });
  });

  test("BR-05: 힌트 패널 클리어 조건 표시 확인", async ({ page }) => {
    // 힌트 패널이 있으면 클리어 조건 텍스트 확인
    const hintPanel = page.locator('[aria-label="힌트 패널"]');
    const isVisible = await hintPanel.isVisible().catch(() => false);
    if (isVisible) {
      await expect(
        page.locator("text=클리어 조건").first()
      ).toBeVisible();
    }
  });
});

// ==================================================================
// B-1b. Stage 2: 런 규칙 심화
// ==================================================================

test.describe("B-1b: Stage 2 런 규칙 심화", () => {
  test.beforeEach(async ({ page }) => {
    await goToStage(page, 2);
  });

  test("BR-06: 같은 색 비연속 (R4+R6+K8) -> 무효", async ({ page }) => {
    await dragTilesToBoard(page, ["R4a", "R6a", "K8a"]);
    await expect(page.getByLabel("스테이지 클리어 확정")).toBeDisabled();
  });

  test("BR-07: 다른 색 혼합 (R4+R5+K8) -> 무효", async ({ page }) => {
    await dragTilesToBoard(page, ["R4a", "R5a", "K8a"]);
    await expect(page.getByLabel("스테이지 클리어 확정")).toBeDisabled();
  });

  test("BR-08: 4장 연속 런 (R4+R5+R6+R7) -> 클리어", async ({ page }) => {
    await dragTilesToBoard(page, ["R4a", "R5a", "R6a", "R7a"]);
    await expect(
      page.locator('span[role="status"]:has-text("클리어 가능!")')
    ).toBeVisible({ timeout: 5000 });
  });

  test("BR-09: 런 후 확정 클릭 -> 클리어 결과", async ({ page }) => {
    await dragTilesToBoard(page, ["R4a", "R5a", "R6a"]);
    await expect(page.getByLabel("스테이지 클리어 확정")).not.toBeDisabled({
      timeout: 5000,
    });
    await page.getByLabel("스테이지 클리어 확정").click();
    await expect(
      page.locator("text=/스테이지 클리어|Stage 2/").first()
    ).toBeVisible({ timeout: 5000 });
  });
});

// ==================================================================
// B-1c. Stage 3: 조커 활용 심화
// ==================================================================

test.describe("B-1c: Stage 3 조커 활용 심화", () => {
  test.beforeEach(async ({ page }) => {
    await goToStage(page, 3);
  });

  // Stage 3 hand: JK1, R5a, R6a, B7a, Y7a, K7a

  test("BR-10: 조커 단독 -> 무효", async ({ page }) => {
    await dragTileToBoard(page, "JK1");
    await expect(page.getByLabel("스테이지 클리어 확정")).toBeDisabled();
  });

  test("BR-11: 조커+1개 -> 무효 (최소 3개 필요)", async ({ page }) => {
    await dragTilesToBoard(page, ["JK1", "R5a"]);
    await expect(page.getByLabel("스테이지 클리어 확정")).toBeDisabled();
  });

  test("BR-12: 조커+R5+R6 -> 유효 런 (JK가 R4 또는 R7 대체)", async ({
    page,
  }) => {
    await dragTilesToBoard(page, ["JK1", "R5a", "R6a"]);
    await expect(
      page.locator('span[role="status"]:has-text("클리어 가능!")')
    ).toBeVisible({ timeout: 5000 });
  });

  test("BR-13: 조커 포함 그룹 (JK1+B7+Y7) -> 유효", async ({ page }) => {
    await dragTilesToBoard(page, ["JK1", "B7a", "Y7a"]);
    await expect(
      page.locator('span[role="status"]:has-text("클리어 가능!")')
    ).toBeVisible({ timeout: 5000 });
  });
});

// ==================================================================
// B-1d. Stage 4: 복합 세트 (조커 + 그룹 + 런)
// ==================================================================

test.describe("B-1d: Stage 4 복합 세트", () => {
  test.beforeEach(async ({ page }) => {
    await goToStage(page, 4);
  });

  // Stage 4 hand: JK1, Y8a, Y10a, Y11a, R7a, B7a, K7a, R5a, B5a

  test("BR-14: 런만 배치 -> multi 목표 미충족", async ({ page }) => {
    await dragTilesToBoard(page, ["Y8a", "JK1", "Y10a", "Y11a"]);
    await expect(page.getByLabel("스테이지 클리어 확정")).toBeDisabled();
  });

  test("BR-15: 그룹만 배치 -> multi 목표 미충족", async ({ page }) => {
    await dragTilesToBoard(page, ["R7a", "B7a", "K7a"]);
    await expect(page.getByLabel("스테이지 클리어 확정")).toBeDisabled();
  });

  test("BR-16: 런+그룹 동시 배치 -> 클리어", async ({ page }) => {
    // 런: Y8-JK1-Y10-Y11
    await dragTilesToBoard(page, ["Y8a", "JK1", "Y10a", "Y11a"]);
    await clickNewGroup(page);
    // 그룹: R7-B7-K7
    await dragTilesToBoard(page, ["R7a", "B7a", "K7a"]);

    await expect(
      page.locator('span[role="status"]:has-text("클리어 가능!")')
    ).toBeVisible({ timeout: 5000 });
  });

  test("BR-17: 복합 배치 후 확정 -> 클리어 결과", async ({ page }) => {
    await dragTilesToBoard(page, ["Y8a", "JK1", "Y10a", "Y11a"]);
    await clickNewGroup(page);
    await dragTilesToBoard(page, ["R7a", "B7a", "K7a"]);

    await expect(page.getByLabel("스테이지 클리어 확정")).not.toBeDisabled({
      timeout: 5000,
    });
    await page.getByLabel("스테이지 클리어 확정").click();
    await expect(
      page.locator("text=/스테이지 클리어|Stage 4/").first()
    ).toBeVisible({ timeout: 5000 });
  });
});

// ==================================================================
// B-1e. Stage 5: 복합 배치 (그룹+런)
// ==================================================================

test.describe("B-1e: Stage 5 복합 배치", () => {
  test.beforeEach(async ({ page }) => {
    await goToStage(page, 5);
  });

  // Stage 5 hand: R7a, B7a, Y7a, K7a, R8a, R9a, R10a, B4a, B4b, Y4a, K4a, R3a, R3b, B3a

  test("BR-18: 4색 그룹 + 3장 런 -> 클리어", async ({ page }) => {
    // 그룹: R7+B7+Y7+K7
    await dragTilesToBoard(page, ["R7a", "B7a", "Y7a", "K7a"]);
    await clickNewGroup(page);
    // 런: R8+R9+R10
    await dragTilesToBoard(page, ["R8a", "R9a", "R10a"]);

    await expect(
      page.locator('span[role="status"]:has-text("클리어 가능!")')
    ).toBeVisible({ timeout: 5000 });
  });

  test("BR-19: 단일 그룹만 배치 -> multi 목표 미충족", async ({ page }) => {
    await dragTilesToBoard(page, ["R7a", "B7a", "Y7a", "K7a"]);
    await expect(page.getByLabel("스테이지 클리어 확정")).toBeDisabled();
  });
});

// ==================================================================
// B-1f. Stage 6: 마스터 (12장 이상)
// ==================================================================

test.describe("B-1f: Stage 6 마스터", () => {
  test.beforeEach(async ({ page }) => {
    await goToStage(page, 6);
  });

  // Stage 6 hand: R1a~R6a, B6a, Y6a, K6a, B7a, B8a, B9a, JK1, K3a

  test("BR-20: 11장 배치 -> 마스터 미충족 (12장 미만)", async ({ page }) => {
    // 런 1: R1~R5 (5장)
    await dragTilesToBoard(page, ["R1a", "R2a", "R3a", "R4a", "R5a"]);
    await clickNewGroup(page);
    // 그룹: B6+Y6+K6 (3장)
    await dragTilesToBoard(page, ["B6a", "Y6a", "K6a"]);
    await clickNewGroup(page);
    // 런 2: B7+B8+B9 (3장)
    await dragTilesToBoard(page, ["B7a", "B8a", "B9a"]);

    // 합계 11장 -> 클리어 불가 (단, 5장 런은 유효)
    // R1~R5 런이 유효 (5장), B6+Y6+K6 그룹 유효 (3장), B7+B8+B9 런 유효 (3장) = 11장
    // master goal: 12장 이상 필요 -> 클리어 불가
    await expect(page.getByLabel("스테이지 클리어 확정")).toBeDisabled();
  });

  test("BR-21: 12장 이상 배치 -> 마스터 클리어", async ({ page }) => {
    // 런 1: R1~R6 (6장)
    await dragTilesToBoard(page, [
      "R1a",
      "R2a",
      "R3a",
      "R4a",
      "R5a",
      "R6a",
    ]);
    await clickNewGroup(page);
    // 그룹: B6+Y6+K6 (3장)
    await dragTilesToBoard(page, ["B6a", "Y6a", "K6a"]);
    await clickNewGroup(page);
    // 런 2: B7+B8+B9 (3장)
    await dragTilesToBoard(page, ["B7a", "B8a", "B9a"]);

    await expect(
      page.locator('span[role="status"]:has-text("클리어 가능!")')
    ).toBeVisible({ timeout: 5000 });
  });
});

// ==================================================================
// B-2. 연습모드 특화 검증
// ==================================================================

test.describe("B-2: 연습모드 특화 UI", () => {
  test("BR-22: 스테이지 선택 페이지 로드", async ({ page }) => {
    await page.goto("/practice");
    await page.waitForLoadState("domcontentloaded");
    await expect(page.getByText("연습 모드").first()).toBeVisible({
      timeout: 5000,
    });
  });

  test("BR-23: Stage 3 -> Stage 4 순차 진행", async ({ page }) => {
    // Stage 3 클리어
    await goToStage(page, 3);
    await dragTilesToBoard(page, ["JK1", "B7a", "Y7a"]);
    await expect(page.getByLabel("스테이지 클리어 확정")).not.toBeDisabled({
      timeout: 5000,
    });
    await page.getByLabel("스테이지 클리어 확정").click();

    // 클리어 후 다음 스테이지 이동 가능 여부 확인
    // (클리어 결과 화면이 나오거나 자동 이동)
    await page.waitForTimeout(1000);
    // 성공 표시 확인
    const hasResult = await page
      .locator("text=/스테이지 클리어|축하|다음/")
      .first()
      .isVisible()
      .catch(() => false);
    expect(hasResult).toBeTruthy();
  });

  test("BR-24: 무효 배치 시 에러 표시", async ({ page }) => {
    await goToStage(page, 1);
    // 숫자 불일치 배치
    await dragTilesToBoard(page, ["R7a", "B7a", "R3a"]);
    // 에러 메시지(role="alert") 확인
    await expect(page.locator('[role="alert"]').first()).toBeVisible({
      timeout: 5000,
    });
  });

  test("BR-25: 그룹 타입 토글 (런 <-> 그룹) 동작", async ({ page }) => {
    await goToStage(page, 2);
    // 타일 1개 배치 -> 런 기본 타입
    await dragTileToBoard(page, "R4a");

    // 런 -> 그룹 변경 버튼 확인
    const toggleBtn = page.locator(
      '[aria-label*="그룹 타입"][aria-label*="변경"]'
    );
    await expect(toggleBtn.first()).toBeVisible({ timeout: 5000 });

    // 토글 클릭
    await toggleBtn.first().click();
    await page.waitForTimeout(200);

    // 다시 클릭하면 원복
    const toggleBtnAfter = page.locator(
      '[aria-label*="그룹 타입"][aria-label*="변경"]'
    );
    await expect(toggleBtnAfter.first()).toBeVisible();
  });

  test("BR-26: 초기화 후 보드 빈 상태 확인", async ({ page }) => {
    await goToStage(page, 1);
    // 타일 배치
    await dragTilesToBoard(page, ["R7a", "B7a", "Y7a"]);
    // 초기화
    await resetBoard(page);
    await page.waitForTimeout(300);

    // 보드에 그룹이 없어야 함
    const board = page.locator('section[aria-label="게임 테이블"]');
    const hasGroups = await board
      .locator("[aria-label*='런'], [aria-label*='그룹']")
      .count();
    // 빈 보드 플레이스홀더 확인
    const hasPlaceholder = await board
      .locator("text=타일을 여기에 드롭하세요")
      .isVisible()
      .catch(() => false);

    // 그룹이 없거나 빈 보드 표시가 되어야 함
    expect(hasGroups === 0 || hasPlaceholder).toBeTruthy();
  });
});
