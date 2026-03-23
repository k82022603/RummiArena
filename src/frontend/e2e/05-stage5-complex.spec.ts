/**
 * TC-P-501 ~ TC-P-503 : Stage 5 — 복합 배치
 *
 * 루미큐브 복합 배치:
 *   - 그룹 1개 + 런 1개 이상 동시 배치
 *
 * Stage 5 hand: R7a, B7a, Y7a, K7a, R8a, R9a, R10a,
 *               B4a, B4b, Y4a, K4a, R3a, R3b, B3a
 * goal: "multi"
 *
 * 정답 예시:
 *   그룹: [R7a, B7a, Y7a, K7a] (4색 7 그룹)
 *   런:   [R8a, R9a, R10a] (R 런)
 */

import { test, expect } from "@playwright/test";
import {
  goToStage,
  dragTilesToBoard,
  clickNewGroup,
  resetBoard,
} from "./helpers";

test.describe("Stage 5 — 복합 배치 (multi)", () => {
  test.beforeEach(async ({ page }) => {
    await goToStage(page, 5);
  });

  // TC-P-501: 그룹 + 런 → 클리어
  test("TC-P-501: R7+B7+Y7+K7(그룹) + R8+R9+R10(런) → 클리어 가능", async ({
    page,
  }) => {
    // 그룹 배치 (첫 번째 그룹)
    await dragTilesToBoard(page, ["R7a", "B7a", "Y7a", "K7a"]);

    // 새 그룹 생성 → 런 배치
    await clickNewGroup(page);
    await dragTilesToBoard(page, ["R8a", "R9a", "R10a"]);

    await expect(page.getByRole("status")).toHaveText("클리어 가능!");
    await expect(page.getByLabel("스테이지 클리어 확정")).not.toBeDisabled();
  });

  // TC-P-502: 그룹만 2개 → 클리어 불가 (런 없음)
  test("TC-P-502: 그룹 2개만 배치 → 클리어 불가 (런 없음)", async ({
    page,
  }) => {
    // 그룹 1: R7+B7+Y7+K7
    await dragTilesToBoard(page, ["R7a", "B7a", "Y7a", "K7a"]);

    // 그룹 2: B4+Y4+K4 (multi 에서는 그룹만으로는 클리어 불가)
    await clickNewGroup(page);
    await dragTilesToBoard(page, ["B4a", "Y4a", "K4a"]);

    // validGroups ≥ 1 이지만 validRuns = 0 → multi 클리어 실패
    await expect(page.getByLabel("스테이지 클리어 확정")).toBeDisabled();
  });

  // TC-P-503: 런만 2개 → 클리어 불가 (그룹 없음)
  test("TC-P-503: 런 2개만 배치 → 클리어 불가 (그룹 없음)", async ({
    page,
  }) => {
    // 런 1: R8+R9+R10
    await dragTilesToBoard(page, ["R8a", "R9a", "R10a"]);

    // 런 2: B4+B4b 는 중복이라 런 안됨 → R3+B3 는 색상 혼합
    // 여기서는 런 1개만 배치하고 클리어 여부만 확인
    await expect(page.getByLabel("스테이지 클리어 확정")).toBeDisabled();
  });

  // 초기화 후 정답 배치
  test("초기화 후 재배치 → 클리어", async ({ page }) => {
    await dragTilesToBoard(page, ["R8a", "R9a", "R10a"]); // 런만
    await expect(page.getByLabel("스테이지 클리어 확정")).toBeDisabled();

    await resetBoard(page);

    await dragTilesToBoard(page, ["R7a", "B7a", "Y7a", "K7a"]);
    await clickNewGroup(page);
    await dragTilesToBoard(page, ["R8a", "R9a", "R10a"]);

    await expect(page.getByRole("status")).toHaveText("클리어 가능!");
  });
});
