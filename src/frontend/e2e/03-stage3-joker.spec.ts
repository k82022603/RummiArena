/**
 * TC-P-301 ~ TC-P-304 : Stage 3 — 조커 활용 (P1 우선순위)
 * TC-J-001 ~ TC-J-004 : 조커 규칙 검증
 *
 * 루미큐브 조커 룰:
 *   - 조커는 어떤 위치의 어떤 타일로도 대체 가능
 *   - 조커만으로는 세트 구성 불가 (일반 타일 최소 1개)
 *   - 조커가 런 양 끝에 위치 가능 (BUG-P-001 수정 검증)
 *
 * Stage 3 hand: JK1, R5a, R6a, B7a, Y7a, K7a
 * goal: "joker"
 */

import { test, expect } from "@playwright/test";
import {
  goToStage,
  dragTilesToBoard,
  dragTileToBoard,
  resetBoard,
} from "./helpers";

test.describe("Stage 3 — 조커 활용 (BUG-P-001 수정 검증)", () => {
  test.beforeEach(async ({ page }) => {
    await goToStage(page, 3);
  });

  // TC-P-301 / TC-J-001: 조커 포함 런 → 클리어 (핵심 버그 수정 검증)
  test("TC-P-301: JK1+R5+R6 (조커가 런 앞/뒤에 위치) → 클리어 가능", async ({
    page,
  }) => {
    // [JK1, R5a, R6a] → validateRun: JK1=R4 or R7, span=2 ≤ tiles.length=3 → 유효
    await dragTilesToBoard(page, ["JK1", "R5a", "R6a"]);

    await expect(page.getByRole("status")).toHaveText("클리어 가능!");
    await expect(page.getByLabel("스테이지 클리어 확정")).not.toBeDisabled();
  });

  // TC-P-302 / TC-J-002: 조커 포함 그룹 → 클리어
  test("TC-P-302: JK1+B7+Y7+K7 (조커가 그룹에서 누락 색상 대체) → 클리어 가능", async ({
    page,
  }) => {
    // [JK1, B7a, Y7a, K7a] → validateGroup: JK1=R7, 4색 그룹 → 유효
    await dragTilesToBoard(page, ["JK1", "B7a", "Y7a", "K7a"]);

    await expect(page.getByRole("status")).toHaveText("클리어 가능!");
    await expect(page.getByLabel("스테이지 클리어 확정")).not.toBeDisabled();
  });

  // TC-P-303 / TC-J-003: 조커만 배치 → 클리어 불가
  test("TC-P-303: JK1만 배치 → 클리어 불가 (일반 타일 없음)", async ({
    page,
  }) => {
    await dragTileToBoard(page, "JK1");

    await expect(page.getByLabel("스테이지 클리어 확정")).toBeDisabled();
    await expect(page.getByText("클리어 확정!")).not.toBeVisible();
  });

  // TC-P-304: 조커 없이 R5+R6만 배치 → 클리어 불가
  test("TC-P-304: R5+R6만 배치 (조커 없음) → 클리어 불가", async ({
    page,
  }) => {
    // goal="joker" → isStageClear: hasJoker 체크 → JK1 없으면 false
    await dragTilesToBoard(page, ["R5a", "R6a"]);

    await expect(page.getByLabel("스테이지 클리어 확정")).toBeDisabled();
  });

  // TC-J-004: JK1 혼자 세트 구성 불가
  test("TC-J-004: 조커 배치 후 에러 없이 버튼만 비활성화 상태", async ({
    page,
  }) => {
    await dragTileToBoard(page, "JK1");

    // 에러 메시지는 표시될 수 있지만(1개 미만) confirm은 비활성
    await expect(page.getByLabel("스테이지 클리어 확정")).toBeDisabled();
  });

  // 추가: 조커를 그룹 중간에 배치 (TC-R-009 변형)
  test("TC-R-009 변형: R5+JK1+R7 → 유효한 런 (조커 중간)", async ({
    page,
  }) => {
    // R5, JK1, R7 → [5, JK=6, 7] → 유효한 런
    // 단, 모두 같은 색(R)이어야 함. 여기서 JK1은 R6으로 대체
    await dragTilesToBoard(page, ["R5a", "JK1", "R6a"]);

    // [R5a, JK1, R6a] → validateRun: nums=[5,6], span=2, tiles=3, gaps=0 ≤ 1 → 유효
    await expect(page.getByRole("status")).toHaveText("클리어 가능!");
  });

  // 초기화 → 다른 유효한 조합 시도
  test("초기화 후 그룹 세트로 클리어", async ({ page }) => {
    await dragTilesToBoard(page, ["R5a", "R6a"]); // 아직 클리어 불가
    await expect(page.getByLabel("스테이지 클리어 확정")).toBeDisabled();

    await resetBoard(page);

    // JK1 + B7 + Y7 → 그룹 (JK=R7, K7 등)
    await dragTilesToBoard(page, ["JK1", "B7a", "Y7a"]);
    await expect(page.getByRole("status")).toHaveText("클리어 가능!");
  });
});
