/**
 * TC-P-101 ~ TC-P-104 : Stage 1 — 그룹 만들기
 *
 * 루미큐브 그룹 룰:
 *   - 같은 숫자, 서로 다른 색상, 3~4개 타일
 *   - 조커 허용 (빈 색상 자리 대체)
 *
 * Stage 1 hand: R7a, B7a, Y7a, K7a, R3a, B5a
 * goal: "group"
 */

import { test, expect } from "@playwright/test";
import {
  goToStage,
  dragTilesToBoard,
  dragTileToBoard,
  resetBoard,
} from "./helpers";

test.describe("Stage 1 — 그룹 만들기", () => {
  test.beforeEach(async ({ page }) => {
    await goToStage(page, 1);
  });

  // TC-P-101: 3색 그룹 (유효) → 클리어
  test("TC-P-101: R7+B7+Y7 (3색) → 클리어 가능", async ({ page }) => {
    await dragTilesToBoard(page, ["R7a", "B7a", "Y7a"]);

    await expect(page.getByRole("status")).toHaveText("클리어 가능!");
    await expect(page.getByLabel("스테이지 클리어 확정")).not.toBeDisabled();
    await expect(page.getByText("클리어 확정!")).toBeVisible();
  });

  // TC-P-102: 2개만 배치 → 클리어 불가
  test("TC-P-102: R7+B7 (2개) → 클리어 불가", async ({ page }) => {
    await dragTilesToBoard(page, ["R7a", "B7a"]);

    await expect(page.getByLabel("스테이지 클리어 확정")).toBeDisabled();
    await expect(page.getByText("클리어 확정!")).not.toBeVisible();
  });

  // TC-P-103: 잘못된 타일 조합 (다른 숫자) → 클리어 불가
  test("TC-P-103: R7+B7+R3 (숫자 불일치) → 무효", async ({ page }) => {
    await dragTilesToBoard(page, ["R7a", "B7a", "R3a"]);

    await expect(page.getByLabel("스테이지 클리어 확정")).toBeDisabled();
    // 오류 표시 확인 (그룹 타입 패널에 에러 메시지)
    await expect(page.locator('[role="alert"]').first()).toBeVisible();
  });

  // TC-P-104: 4색 그룹 → 클리어
  test("TC-P-104: R7+B7+Y7+K7 (4색) → 클리어 가능", async ({ page }) => {
    await dragTilesToBoard(page, ["R7a", "B7a", "Y7a", "K7a"]);

    await expect(page.getByRole("status")).toHaveText("클리어 가능!");
    await expect(page.getByLabel("스테이지 클리어 확정")).not.toBeDisabled();
  });

  // TC-G-007: 조커 포함 그룹 → 유효
  test("TC-G-007: 초기화 후 R7+B7+B5로 다른 세트 시도 → 무효 후 초기화 정상", async ({
    page,
  }) => {
    // 잘못된 배치 후 초기화 → 다시 정상 배치
    await dragTilesToBoard(page, ["R7a", "B7a", "B5a"]); // 숫자 불일치
    await expect(page.getByLabel("스테이지 클리어 확정")).toBeDisabled();

    await resetBoard(page);
    // 초기화 후 랙 복구 확인
    await expect(
      page.locator('[aria-label="R7a 타일 (드래그 가능)"]')
    ).toBeVisible();

    // 다시 올바른 배치
    await dragTilesToBoard(page, ["R7a", "B7a", "Y7a"]);
    await expect(page.getByLabel("스테이지 클리어 확정")).not.toBeDisabled();
  });
});
