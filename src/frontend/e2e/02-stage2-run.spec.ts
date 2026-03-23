/**
 * TC-P-201 ~ TC-P-204 : Stage 2 — 런 만들기
 *
 * 루미큐브 런 룰:
 *   - 같은 색상, 연속된 숫자 3개 이상
 *   - 13→1 순환 불가
 *   - 조커 허용 (빈 숫자 자리 대체)
 *
 * Stage 2 hand: R4a, R5a, R6a, R7a, B3a, K8a
 * goal: "run"
 */

import { test, expect } from "@playwright/test";
import { goToStage, dragTilesToBoard, resetBoard } from "./helpers";

test.describe("Stage 2 — 런 만들기", () => {
  test.beforeEach(async ({ page }) => {
    await goToStage(page, 2);
  });

  // TC-P-201: 연속 3개 런 → 클리어
  test("TC-P-201: R4+R5+R6 (연속 3개) → 클리어 가능", async ({ page }) => {
    await dragTilesToBoard(page, ["R4a", "R5a", "R6a"]);

    await expect(page.locator('span[role="status"]:has-text("클리어 가능!")')).toBeVisible();
    await expect(page.getByLabel("스테이지 클리어 확정")).not.toBeDisabled();
  });

  // TC-P-202: 연속 4개 런 → 클리어
  test("TC-P-202: R4+R5+R6+R7 (연속 4개) → 클리어 가능", async ({ page }) => {
    await dragTilesToBoard(page, ["R4a", "R5a", "R6a", "R7a"]);

    await expect(page.locator('span[role="status"]:has-text("클리어 가능!")')).toBeVisible();
    await expect(page.getByLabel("스테이지 클리어 확정")).not.toBeDisabled();
  });

  // TC-P-203: R6 빠진 런 (조커 없음) → 무효
  test("TC-P-203: R4+R5+R7 (R6 누락, 조커 없음) → 무효", async ({ page }) => {
    await dragTilesToBoard(page, ["R4a", "R5a", "R7a"]);

    await expect(page.getByLabel("스테이지 클리어 확정")).toBeDisabled();
    await expect(page.locator('[role="alert"]').first()).toBeVisible();
  });

  // TC-P-204: 색상 혼합 런 → 무효
  test("TC-P-204: R4+R5+B3 (다른 색상 혼합) → 무효", async ({ page }) => {
    await dragTilesToBoard(page, ["R4a", "R5a", "B3a"]);

    await expect(page.getByLabel("스테이지 클리어 확정")).toBeDisabled();
    await expect(page.locator('[role="alert"]').first()).toBeVisible();
  });

  // TC-R-002: 5개 연속 런
  test("TC-R-002: R4+R5+R6+R7+K8 배치 시 색상 혼합 감지", async ({ page }) => {
    // K8a 는 다른 색상이라 R4-R5-R6-R7 그룹에 추가되면 런 무효
    await dragTilesToBoard(page, ["R4a", "R5a", "R6a", "R7a", "K8a"]);

    // 5개 모두 한 그룹이면 K8 혼합으로 런 무효 → 클리어 불가
    await expect(page.getByLabel("스테이지 클리어 확정")).toBeDisabled();
  });

  // 초기화 후 재배치
  test("초기화 → 재배치 → 클리어", async ({ page }) => {
    await dragTilesToBoard(page, ["R4a", "R5a", "B3a"]); // 무효
    await expect(page.getByLabel("스테이지 클리어 확정")).toBeDisabled();

    await resetBoard(page);
    await expect(
      page.locator('[aria-label="R4a 타일 (드래그 가능)"]')
    ).toBeVisible();

    await dragTilesToBoard(page, ["R4a", "R5a", "R6a"]); // 유효
    await expect(page.getByLabel("스테이지 클리어 확정")).not.toBeDisabled();
  });
});
