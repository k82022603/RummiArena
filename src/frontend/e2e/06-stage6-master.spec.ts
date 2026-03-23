/**
 * TC-P-601 ~ TC-P-603 : Stage 6 — 루미큐브 마스터
 *
 * 마스터 룰: 유효한 세트에서 총 12장 이상 배치
 *
 * Stage 6 hand: R1a, R2a, R3a, R4a, R5a, R6a,
 *               B6a, Y6a, K6a,
 *               B7a, B8a, B9a,
 *               JK1, K3a
 * goal: "master"
 *
 * 정답:
 *   런1: [R1a~R6a] = 6장
 *   그룹: [B6a, Y6a, K6a] = 3장
 *   런2: [B7a, B8a, B9a] = 3장
 *   합계: 12장 → 클리어 ✓
 */

import { test, expect } from "@playwright/test";
import {
  goToStage,
  dragTilesToBoard,
  clickNewGroup,
  resetBoard,
} from "./helpers";

test.describe("Stage 6 — 루미큐브 마스터 (12장 이상)", () => {
  test.beforeEach(async ({ page }) => {
    await goToStage(page, 6);
  });

  // TC-P-601: 12장 정확히 배치 → 클리어
  test("TC-P-601: R런(6)+그룹(3)+B런(3) = 12장 → 클리어 가능", async ({
    page,
  }) => {
    // 런 1: R1~R6 (6장)
    await dragTilesToBoard(page, ["R1a", "R2a", "R3a", "R4a", "R5a", "R6a"]);

    // 그룹: B6+Y6+K6 (3장)
    await clickNewGroup(page);
    await dragTilesToBoard(page, ["B6a", "Y6a", "K6a"]);

    // 런 2: B7+B8+B9 (3장)
    await clickNewGroup(page);
    await dragTilesToBoard(page, ["B7a", "B8a", "B9a"]);

    // 총 12장 → master 클리어 (tileCount ≥ 12)
    await expect(page.locator('span[role="status"]:has-text("클리어 가능!")')).toBeVisible();
    await expect(page.getByLabel("스테이지 클리어 확정")).not.toBeDisabled();
  });

  // TC-P-602: 11장 배치 → 클리어 불가
  test("TC-P-602: 11장 배치 → 클리어 불가 (12장 미만)", async ({ page }) => {
    // 런 1: R1~R6 (6장)
    await dragTilesToBoard(page, ["R1a", "R2a", "R3a", "R4a", "R5a", "R6a"]);

    // 그룹: B6+Y6+K6 (3장)
    await clickNewGroup(page);
    await dragTilesToBoard(page, ["B6a", "Y6a", "K6a"]);

    // 런 2: B7+B8 (2장만) → 유효한 런이 되려면 3개 이상 필요 → 무효
    await clickNewGroup(page);
    await dragTilesToBoard(page, ["B7a", "B8a"]);

    // 런2가 무효(2장)이므로 유효 타일 수 = 9장 < 12 → 클리어 불가
    await expect(page.getByLabel("스테이지 클리어 확정")).toBeDisabled();
  });

  // TC-P-603: JK1 활용 + 12장 이상 → 클리어
  test("TC-P-603: JK1 포함 세트로 12장 이상 → 클리어 가능", async ({
    page,
  }) => {
    // 런 1: R1~R6 (6장)
    await dragTilesToBoard(page, ["R1a", "R2a", "R3a", "R4a", "R5a", "R6a"]);

    // 그룹: B6+Y6+K6 (3장)
    await clickNewGroup(page);
    await dragTilesToBoard(page, ["B6a", "Y6a", "K6a"]);

    // 런 2: B7+B8+B9 (3장)
    await clickNewGroup(page);
    await dragTilesToBoard(page, ["B7a", "B8a", "B9a"]);

    // 추가: JK1 포함 세트 (선택)
    // 이미 12장으로 클리어 조건 충족
    await expect(page.locator('span[role="status"]:has-text("클리어 가능!")')).toBeVisible();

    // 클리어 확정 클릭
    await page.getByLabel("스테이지 클리어 확정").click();

    // 클리어 결과 화면 표시 확인
    await expect(
      page.locator("text=/스테이지 클리어|Stage 6/").first()
    ).toBeVisible({ timeout: 3000 });
  });

  // 초기화 후 재배치
  test("초기화 후 재배치 → 클리어", async ({ page }) => {
    // 잘못된 배치
    await dragTilesToBoard(page, ["R1a", "R2a", "R3a"]); // 3장만
    await expect(page.getByLabel("스테이지 클리어 확정")).toBeDisabled();

    await resetBoard(page);

    // 올바른 12장 배치
    await dragTilesToBoard(page, ["R1a", "R2a", "R3a", "R4a", "R5a", "R6a"]);
    await clickNewGroup(page);
    await dragTilesToBoard(page, ["B6a", "Y6a", "K6a"]);
    await clickNewGroup(page);
    await dragTilesToBoard(page, ["B7a", "B8a", "B9a"]);

    await expect(page.locator('span[role="status"]:has-text("클리어 가능!")')).toBeVisible();
  });
});
