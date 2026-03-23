/**
 * TC-P-401 ~ TC-P-402 : Stage 4 — 조커 마스터 (BUG-S-004 수정 후)
 *
 * 수정된 Stage 4:
 *   hand: JK1, Y8a, Y10a, Y11a, R7a, B7a, K7a, R5a, B5a
 *   goal: "multi" (런 1개 + 그룹 1개 이상)
 *
 * 클리어 조건: 유효한 런 1개 + 유효한 그룹 1개 이상 동시 배치
 *
 * 정답 세트:
 *   런: [JK1, Y8a, Y10a, Y11a] → JK1=Y9, Y8-Y9-Y10-Y11 런 ✓
 *   그룹: [R7a, B7a, K7a] → 3색 7 그룹 ✓
 */

import { test, expect } from "@playwright/test";
import {
  goToStage,
  dragTilesToBoard,
  dragTileToBoard,
  clickNewGroup,
  resetBoard,
} from "./helpers";

test.describe("Stage 4 — 조커 마스터 (multi goal)", () => {
  test.beforeEach(async ({ page }) => {
    await goToStage(page, 4);
  });

  // TC-P-401: 런만 배치 → multi 조건 미충족 → 클리어 불가
  test("TC-P-401: 런만 배치 (그룹 없음) → 클리어 불가", async ({ page }) => {
    // JK1+Y8+Y10+Y11 런만 배치
    await dragTilesToBoard(page, ["JK1", "Y8a", "Y10a", "Y11a"]);

    // multi 조건: validGroups≥1 AND validRuns≥1 → 런만 있으면 false
    await expect(page.getByLabel("스테이지 클리어 확정")).toBeDisabled();
  });

  // TC-P-402: 런 + 그룹 동시 배치 → 클리어
  test("TC-P-402: 런(JK1+Y8+Y10+Y11) + 그룹(R7+B7+K7) → 클리어 가능", async ({
    page,
  }) => {
    // 1. 런 배치 (새 그룹 자동 생성)
    await dragTilesToBoard(page, ["JK1", "Y8a", "Y10a", "Y11a"]);

    // 2. 새 그룹 버튼 클릭
    await clickNewGroup(page);

    // 3. 그룹 배치
    await dragTilesToBoard(page, ["R7a", "B7a", "K7a"]);

    // multi 조건: validRuns=[런] ≥1, validGroups=[그룹] ≥1 → 클리어
    await expect(page.getByRole("status")).toHaveText("클리어 가능!");
    await expect(page.getByLabel("스테이지 클리어 확정")).not.toBeDisabled();
  });

  // TC-P-403: 그룹만 배치 → 클리어 불가
  test("TC-P-403: 그룹만 배치 (런 없음) → 클리어 불가", async ({ page }) => {
    await dragTilesToBoard(page, ["R7a", "B7a", "K7a"]);

    await expect(page.getByLabel("스테이지 클리어 확정")).toBeDisabled();
  });

  // 초기화 후 재시도
  test("초기화 후 정답 배치 → 클리어", async ({ page }) => {
    // 잘못된 배치
    await dragTilesToBoard(page, ["R7a", "B7a", "K7a"]);
    await expect(page.getByLabel("스테이지 클리어 확정")).toBeDisabled();

    await resetBoard(page);

    // 정답 배치
    await dragTilesToBoard(page, ["JK1", "Y8a", "Y10a", "Y11a"]);
    await clickNewGroup(page);
    await dragTilesToBoard(page, ["R7a", "B7a", "K7a"]);

    await expect(page.getByRole("status")).toHaveText("클리어 가능!");
  });
});
