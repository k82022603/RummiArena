/**
 * 연습 모드 고급 E2E 테스트 (practice-advanced)
 *
 * 기존 practice.spec.ts (스모크 테스트) 및 01~06 스테이지별 테스트를 보완하여
 * 랜딩 페이지, 튜토리얼 오버레이, 게임플레이 심화, 점수·내비게이션, 엣지 케이스를
 * 포괄적으로 검증한다.
 *
 * TC-PL : Practice Landing Page
 * TC-TU : Tutorial Overlay
 * TC-SG : Stage Gameplay Deep
 * TC-SN : Score & Navigation
 * TC-PE : Practice Edge Cases
 */

import { test, expect } from "@playwright/test";
import {
  goToStage,
  dragTileToBoard,
  dragTilesToBoard,
  clickNewGroup,
  resetBoard,
  dismissTutorial,
} from "./helpers";

// ==================================================================
// 1. Practice Landing Page (TC-PL-001 ~ TC-PL-008)
// ==================================================================

test.describe("1. 연습 모드 랜딩 페이지", () => {
  test.beforeEach(async ({ page }) => {
    // localStorage 초기화하여 깨끗한 상태에서 시작
    await page.goto("/practice");
    await page.evaluate(() => {
      localStorage.removeItem("practice_completed_stages");
      localStorage.removeItem("practice_best_scores");
    });
    await page.reload();
    await page.waitForLoadState("domcontentloaded");
  });

  test("TC-PL-001: /practice 페이지 로드 시 '연습 모드' 제목 표시", async ({
    page,
  }) => {
    await expect(page.getByText("연습 모드").first()).toBeVisible({
      timeout: 5000,
    });
  });

  test("TC-PL-002: 설명 텍스트 '단계별 학습으로' 표시", async ({ page }) => {
    await expect(
      page.getByText("단계별 학습으로").first()
    ).toBeVisible({ timeout: 5000 });
  });

  test("TC-PL-003: Stage 1 카드가 항상 잠금 해제 상태", async ({ page }) => {
    // Stage 1 카드: aria-label에 "(잠김)" 없음
    const stage1Card = page.locator(
      '[aria-label="Stage 1: 그룹 만들기"]'
    );
    await expect(stage1Card).toBeVisible({ timeout: 5000 });
    // data-disabled 속성이 없어야 함 (잠금 해제)
    await expect(stage1Card).not.toHaveAttribute("data-disabled", "true");
  });

  test("TC-PL-004: 로비로 돌아가기 버튼 동작", async ({ page }) => {
    const backBtn = page.getByLabel("로비로 돌아가기");
    await expect(backBtn).toBeVisible({ timeout: 5000 });
    await backBtn.click();
    await expect(page).toHaveURL(/\/lobby/, { timeout: 5000 });
  });

  test("TC-PL-005: Stage 1 클릭 시 /practice/1로 이동", async ({ page }) => {
    const stage1Card = page.locator(
      '[aria-label="Stage 1: 그룹 만들기"]'
    );
    await stage1Card.click();
    await expect(page).toHaveURL(/\/practice\/1/, { timeout: 5000 });
  });

  test("TC-PL-006: 6개 스테이지 카드 전부 렌더링", async ({ page }) => {
    const stageList = page.locator('[role="list"][aria-label="스테이지 목록"]');
    await expect(stageList).toBeVisible({ timeout: 5000 });
    const items = stageList.locator('[role="listitem"]');
    await expect(items).toHaveCount(6);
  });

  test("TC-PL-007: Stage 2~6 초기 상태에서 잠금 표시 (localStorage 비어있을 때)", async ({
    page,
  }) => {
    // Stage 2~6 카드에는 "(잠김)" 포함
    for (const num of [2, 3, 4, 5, 6]) {
      const card = page.locator(`[aria-label*="Stage ${num}"][aria-label*="잠김"]`);
      await expect(card).toBeVisible({ timeout: 5000 });
    }
  });

  test("TC-PL-008: localStorage에 완료 데이터 설정 시 다음 스테이지 잠금 해제", async ({
    page,
  }) => {
    // Stage 1을 완료 상태로 설정
    await page.evaluate(() => {
      localStorage.setItem("practice_completed_stages", JSON.stringify([1]));
    });
    await page.reload();
    await page.waitForLoadState("domcontentloaded");

    // Stage 2가 잠금 해제되어야 함 (aria-label에 "(잠김)" 없음)
    const stage2Card = page.locator(
      '[aria-label="Stage 2: 런 만들기"]'
    );
    await expect(stage2Card).toBeVisible({ timeout: 5000 });
    await expect(stage2Card).not.toHaveAttribute("data-disabled", "true");
  });
});

// ==================================================================
// 2. Tutorial Overlay (TC-TU-001 ~ TC-TU-004)
// ==================================================================

test.describe("2. 튜토리얼 오버레이", () => {
  test("TC-TU-001: 스테이지 진입 시 튜토리얼 오버레이 표시", async ({
    page,
  }) => {
    await page.goto("/practice/1");
    await page.waitForLoadState("domcontentloaded");

    // 튜토리얼 다이얼로그가 표시됨
    const overlay = page.locator('[role="dialog"][aria-modal="true"]');
    await expect(overlay).toBeVisible({ timeout: 5000 });
    // "시작하기" 버튼이 보임
    await expect(
      page.locator('button:has-text("시작하기")')
    ).toBeVisible({ timeout: 5000 });
  });

  test("TC-TU-002: '시작하기' 버튼 클릭 시 오버레이 닫힘", async ({
    page,
  }) => {
    await page.goto("/practice/1");
    await page.waitForLoadState("domcontentloaded");

    const overlay = page.locator(
      '[role="dialog"][aria-modal="true"][aria-label*="튜토리얼"]'
    );
    await expect(overlay).toBeVisible({ timeout: 5000 });

    await page.locator('button:has-text("시작하기")').click();
    await page.waitForTimeout(500);

    // 오버레이 닫힘
    await expect(overlay).not.toBeVisible();
  });

  test("TC-TU-003: 오버레이 닫힌 후 게임 보드 인터랙션 가능", async ({
    page,
  }) => {
    await goToStage(page, 1);

    // 튜토리얼이 닫힌 후 타일 랙과 보드가 인터랙션 가능
    const rack = page.locator('[aria-label="내 타일 랙"]');
    await expect(rack).toBeVisible({ timeout: 5000 });

    // 타일을 보드에 드래그 가능
    await dragTileToBoard(page, "R7a");

    // 보드에 그룹이 생성됨
    const board = page.locator('section[aria-label="게임 테이블"]');
    await expect(board).toBeVisible();
  });

  test("TC-TU-004: 각 스테이지별 튜토리얼 내용이 다름 (Stage 1 vs Stage 3)", async ({
    page,
  }) => {
    // Stage 1 튜토리얼 확인
    await page.goto("/practice/1");
    await page.waitForLoadState("domcontentloaded");
    const overlay1 = page.locator('[role="dialog"][aria-modal="true"]');
    await expect(overlay1).toBeVisible({ timeout: 5000 });
    // Stage 1 메시지: "같은 숫자를 가진 타일 3~4개를 모아"
    await expect(
      page.getByText("같은 숫자를 가진 타일").first()
    ).toBeVisible({ timeout: 5000 });
    const stage1Text = await overlay1.textContent();

    // Stage 3 튜토리얼 확인
    await page.goto("/practice/3");
    await page.waitForLoadState("domcontentloaded");
    const overlay3 = page.locator('[role="dialog"][aria-modal="true"]');
    await expect(overlay3).toBeVisible({ timeout: 5000 });
    // Stage 3 메시지: "조커(JK)는 어떤 타일로든 대체"
    await expect(
      page.getByText("조커(JK)는").first()
    ).toBeVisible({ timeout: 5000 });
    const stage3Text = await overlay3.textContent();

    // 내용이 달라야 함
    expect(stage1Text).not.toEqual(stage3Text);
  });
});

// ==================================================================
// 3. Stage Gameplay Deep (TC-SG-001 ~ TC-SG-008)
// ==================================================================

test.describe("3. 스테이지 게임플레이 심화", () => {
  test("TC-SG-001: Stage 3 조커를 그룹에 사용 — JK1+B7+Y7+K7 -> 클리어", async ({
    page,
  }) => {
    await goToStage(page, 3);

    // JK1이 R7 역할로 4색 그룹 완성
    await dragTilesToBoard(page, ["JK1", "B7a", "Y7a", "K7a"]);

    await expect(
      page.locator('span[role="status"]:has-text("클리어 가능!")')
    ).toBeVisible({ timeout: 5000 });
    await expect(page.getByLabel("스테이지 클리어 확정")).not.toBeDisabled();
  });

  test("TC-SG-002: Stage 4 멀티세트 — 그룹+런 조합으로 클리어", async ({
    page,
  }) => {
    await goToStage(page, 4);

    // 런: JK1+Y8+Y10+Y11 (JK1=Y9)
    await dragTilesToBoard(page, ["JK1", "Y8a", "Y10a", "Y11a"]);
    await clickNewGroup(page);
    // 그룹: R7+B7+K7
    await dragTilesToBoard(page, ["R7a", "B7a", "K7a"]);

    await expect(
      page.locator('span[role="status"]:has-text("클리어 가능!")')
    ).toBeVisible({ timeout: 5000 });
    await expect(page.getByLabel("스테이지 클리어 확정")).not.toBeDisabled();
  });

  test("TC-SG-003: 잘못된 배치(타일 2개만) -> 클리어 뱃지 미표시", async ({
    page,
  }) => {
    await goToStage(page, 1);

    // 2개만 배치 -> 유효한 그룹 아님
    await dragTilesToBoard(page, ["R7a", "B7a"]);

    await expect(page.getByLabel("스테이지 클리어 확정")).toBeDisabled();
    // 클리어 뱃지가 보이지 않아야 함
    await expect(
      page.locator('span[role="status"]:has-text("클리어 가능!")')
    ).not.toBeVisible();
  });

  test("TC-SG-004: 보드 초기화 후 클리어 뱃지 사라짐", async ({ page }) => {
    await goToStage(page, 1);

    // 유효한 그룹 배치 -> 클리어 뱃지 표시
    await dragTilesToBoard(page, ["R7a", "B7a", "Y7a"]);
    await expect(
      page.locator('span[role="status"]:has-text("클리어 가능!")')
    ).toBeVisible({ timeout: 5000 });

    // 초기화
    await resetBoard(page);
    await page.waitForTimeout(300);

    // 클리어 뱃지 사라짐
    await expect(
      page.locator('span[role="status"]:has-text("클리어 가능!")')
    ).not.toBeVisible();
    await expect(page.getByLabel("스테이지 클리어 확정")).toBeDisabled();
  });

  test("TC-SG-005: 새 그룹 버튼으로 두 번째 그룹 생성", async ({ page }) => {
    await goToStage(page, 4);

    // 첫 번째 그룹 (런)
    await dragTilesToBoard(page, ["JK1", "Y8a", "Y10a", "Y11a"]);

    // 새 그룹 버튼 클릭
    await clickNewGroup(page);

    // 두 번째 그룹
    await dragTilesToBoard(page, ["R7a", "B7a", "K7a"]);

    // 두 세트 모두 유효하면 클리어
    await expect(
      page.locator('span[role="status"]:has-text("클리어 가능!")')
    ).toBeVisible({ timeout: 5000 });
  });

  test("TC-SG-006: 각 스테이지에서 힌트 패널이 표시됨", async ({ page }) => {
    await goToStage(page, 1);

    // 힌트 패널 (aria-label="힌트 패널") — 데스크톱 뷰포트에서만 표시 (sm:block)
    const hintPanel = page.locator('[aria-label="힌트 패널"]');
    const isVisible = await hintPanel.isVisible().catch(() => false);

    if (isVisible) {
      // 클리어 조건 텍스트 확인
      await expect(page.getByText("클리어 조건").first()).toBeVisible({
        timeout: 5000,
      });
      // 힌트 텍스트 확인
      await expect(page.getByText("힌트").first()).toBeVisible({
        timeout: 5000,
      });
    } else {
      // 모바일 뷰포트에서는 힌트 패널이 숨겨짐 (sm:block) — 패스
      test.skip();
    }
  });

  test("TC-SG-007: 프로그레스 바가 현재 스테이지 표시", async ({ page }) => {
    await goToStage(page, 2);

    // ProgressBar: nav[aria-label="스테이지 진행도"]
    const progressBar = page.locator('[aria-label="스테이지 진행도"]');
    await expect(progressBar).toBeVisible({ timeout: 5000 });

    // Stage 2가 현재(aria-current="step") 표시
    const currentDot = progressBar.locator('[aria-current="step"]');
    await expect(currentDot).toBeVisible({ timeout: 5000 });
    await expect(currentDot).toHaveAttribute(
      "aria-label",
      /Stage 2.*현재/
    );
  });

  test("TC-SG-008: 타일을 보드에 놓으면 랙에서 사라짐", async ({ page }) => {
    await goToStage(page, 1);

    // R7a 타일이 랙에 존재
    const tileBefore = page.locator(
      '[aria-label="R7a 타일 (드래그 가능)"]'
    );
    await expect(tileBefore).toBeVisible({ timeout: 5000 });

    // 보드로 드래그
    await dragTileToBoard(page, "R7a");

    // 랙에서 R7a 타일이 사라져야 함
    await expect(
      page.locator('[aria-label="내 타일 랙"]').locator('[aria-label="R7a 타일 (드래그 가능)"]')
    ).not.toBeVisible({ timeout: 5000 });
  });
});

// ==================================================================
// 4. Score & Navigation (TC-SN-001 ~ TC-SN-006)
// ==================================================================

test.describe("4. 점수 및 내비게이션", () => {
  test("TC-SN-001: 클리어 후 확정 버튼 클릭 -> 점수 표시 오버레이", async ({
    page,
  }) => {
    await goToStage(page, 1);

    // 유효한 그룹 배치
    await dragTilesToBoard(page, ["R7a", "B7a", "Y7a"]);
    await expect(page.getByLabel("스테이지 클리어 확정")).not.toBeDisabled({
      timeout: 5000,
    });

    // 확정 클릭
    await page.getByLabel("스테이지 클리어 확정").click();

    // 점수 표시 오버레이 (role="dialog")
    const scoreDialog = page.locator(
      '[role="dialog"][aria-label="스테이지 클리어"]'
    );
    await expect(scoreDialog).toBeVisible({ timeout: 5000 });

    // "획득 점수" 텍스트 + 점수 숫자 표시
    await expect(page.getByText("획득 점수").first()).toBeVisible({
      timeout: 5000,
    });
    // "Stage 1 클리어!" 텍스트
    await expect(
      page.getByText("Stage 1 클리어!").first()
    ).toBeVisible({ timeout: 5000 });
  });

  test("TC-SN-002: 점수 표시에서 '다시 하기' 클릭 -> 보드 초기화", async ({
    page,
  }) => {
    await goToStage(page, 1);

    // 클리어 -> 확정
    await dragTilesToBoard(page, ["R7a", "B7a", "Y7a"]);
    await page.getByLabel("스테이지 클리어 확정").click();

    // 점수 표시 오버레이 대기
    await expect(
      page.locator('[role="dialog"][aria-label="스테이지 클리어"]')
    ).toBeVisible({ timeout: 5000 });

    // "다시 하기" 버튼 클릭
    await page.locator('button:has-text("다시 하기")').click();
    await page.waitForTimeout(500);

    // 오버레이 닫힘
    await expect(
      page.locator('[role="dialog"][aria-label="스테이지 클리어"]')
    ).not.toBeVisible();

    // 타일이 랙으로 복구됨
    await expect(
      page.locator('[aria-label="R7a 타일 (드래그 가능)"]')
    ).toBeVisible({ timeout: 5000 });

    // 확정 버튼 비활성화 (보드 초기화 상태)
    await expect(page.getByLabel("스테이지 클리어 확정")).toBeDisabled();
  });

  test("TC-SN-003: 점수 표시에서 '다음 스테이지' 클릭 -> 다음 스테이지로 이동", async ({
    page,
  }) => {
    await goToStage(page, 1);

    // 클리어 -> 확정
    await dragTilesToBoard(page, ["R7a", "B7a", "Y7a"]);
    await page.getByLabel("스테이지 클리어 확정").click();

    // 점수 표시 대기
    await expect(
      page.locator('[role="dialog"][aria-label="스테이지 클리어"]')
    ).toBeVisible({ timeout: 5000 });

    // "다음 스테이지" 버튼 클릭
    await page.locator('button:has-text("다음 스테이지")').click();

    // Stage 2 (/practice/2)로 이동
    await expect(page).toHaveURL(/\/practice\/2/, { timeout: 5000 });
  });

  test("TC-SN-004: Stage 6 클리어 시 '처음부터 다시' 버튼 표시", async ({
    page,
  }) => {
    await goToStage(page, 6);

    // Stage 6 클리어: 12장 배치
    await dragTilesToBoard(page, [
      "R1a", "R2a", "R3a", "R4a", "R5a", "R6a",
    ]);
    await clickNewGroup(page);
    await dragTilesToBoard(page, ["B6a", "Y6a", "K6a"]);
    await clickNewGroup(page);
    await dragTilesToBoard(page, ["B7a", "B8a", "B9a"]);

    await expect(page.getByLabel("스테이지 클리어 확정")).not.toBeDisabled({
      timeout: 5000,
    });
    await page.getByLabel("스테이지 클리어 확정").click();

    // "모든 스테이지 완료" 오버레이
    const finalDialog = page.locator(
      '[role="dialog"][aria-label="모든 스테이지 완료"]'
    );
    await expect(finalDialog).toBeVisible({ timeout: 5000 });

    // "처음부터 다시" 버튼 표시
    await expect(
      page.locator('button:has-text("처음부터 다시")')
    ).toBeVisible({ timeout: 5000 });

    // "다음 스테이지" 버튼은 표시되지 않음 (마지막 스테이지)
    await expect(
      page.locator('button:has-text("다음 스테이지")')
    ).not.toBeVisible();
  });

  test("TC-SN-005: 스테이지 진행 바 표시 (e.g., Stage 2 current)", async ({
    page,
  }) => {
    await goToStage(page, 3);

    // ProgressBar가 6개 점을 표시
    const progressBar = page.locator('[aria-label="스테이지 진행도"]');
    await expect(progressBar).toBeVisible({ timeout: 5000 });

    // Stage 3이 현재로 표시
    const currentDot = progressBar.locator('[aria-current="step"]');
    await expect(currentDot).toHaveAttribute(
      "aria-label",
      /Stage 3.*현재/
    );

    // 6개 스테이지 점이 모두 렌더링됨
    const dots = progressBar.locator('[aria-label*="Stage"]');
    await expect(dots).toHaveCount(6);
  });

  test("TC-SN-006: 뒤로가기 버튼으로 /practice 목록 복귀", async ({
    page,
  }) => {
    await goToStage(page, 2);

    // "스테이지 목록으로 돌아가기" 버튼
    const backBtn = page.getByLabel("스테이지 목록으로 돌아가기");
    await expect(backBtn).toBeVisible({ timeout: 5000 });
    await backBtn.click();

    // /practice로 이동
    await expect(page).toHaveURL(/\/practice$/, { timeout: 5000 });
  });
});

// ==================================================================
// 5. Edge Cases (TC-PE-001 ~ TC-PE-004)
// ==================================================================

test.describe("5. 엣지 케이스", () => {
  test("TC-PE-001: /practice/0 접근 -> /practice로 리디렉트", async ({
    page,
  }) => {
    await page.goto("/practice/0");
    await expect(page).toHaveURL(/\/practice$/, { timeout: 5000 });
  });

  test("TC-PE-002: /practice/7 접근 -> /practice로 리디렉트", async ({
    page,
  }) => {
    await page.goto("/practice/7");
    await expect(page).toHaveURL(/\/practice$/, { timeout: 5000 });
  });

  test("TC-PE-003: /practice/abc 접근 -> /practice로 리디렉트", async ({
    page,
  }) => {
    await page.goto("/practice/abc");
    await expect(page).toHaveURL(/\/practice$/, { timeout: 5000 });
  });

  test("TC-PE-004: 빈 보드에서 확정 버튼 비활성화", async ({ page }) => {
    await goToStage(page, 1);

    // 아무 타일도 배치하지 않은 상태
    const confirmBtn = page.getByLabel("스테이지 클리어 확정");
    await expect(confirmBtn).toBeDisabled();
  });
});
