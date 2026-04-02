/**
 * 드래그앤드롭 기반 테이블 재배치(Manipulation) E2E 테스트
 *
 * 연습 모드(PracticeBoard)를 사용하여 서버 없이 클라이언트 단독으로
 * 드래그앤드롭 테이블 조작 기능을 검증한다.
 *
 * 테스트 대상:
 *   - 기존 그룹에 타일 추가 (확장)
 *   - 보드 타일 초기화를 통한 랙 복원
 *   - 새 그룹 생성 (수동 / 자동)
 *   - 미완성 세트 확정 차단
 *   - 유효하지 않은 런 경고 (비연속 숫자)
 *   - 유효하지 않은 그룹 경고 (색상 중복)
 *   - 드래그 취소 시 타일 원위치
 *
 * 연습 모드 스테이지별 핸드:
 *   Stage 1: R7a, B7a, Y7a, K7a, R3a, B5a       (goal: group)
 *   Stage 2: R4a, R5a, R6a, R7a, B3a, K8a        (goal: run)
 *   Stage 5: R7a, B7a, Y7a, K7a, R8a, R9a, R10a, B4a, B4b, Y4a, K4a, R3a, R3b, B3a (goal: multi)
 *
 * TC-DND: DnD Manipulation 테스트 코드
 */

import { test, expect } from "@playwright/test";
import {
  goToStage,
  dndDrag,
  dragTileToBoard,
  dragTilesToBoard,
  clickNewGroup,
  resetBoard,
} from "./helpers";

// ==================================================================
// 헬퍼: 보드 위 그룹 개수 확인 (연습 모드)
// ==================================================================

/**
 * 보드 위 그룹 수를 그룹 타입 토글 버튼 개수로 확인한다.
 * 그룹 하나당 타입 토글 버튼이 1개 생성된다.
 */
function boardGroupCount(page: import("@playwright/test").Page) {
  return page.locator('button[aria-label^="그룹 타입"]');
}

/**
 * n번째(0-based) 보드 그룹의 타일 수 배지 텍스트를 반환한다.
 * aria-label="N개 타일" 형식
 */
function groupTileCountBadge(
  page: import("@playwright/test").Page,
  groupIndex: number
) {
  return page.locator('span[aria-label$="개 타일"]').nth(groupIndex);
}

// ==================================================================
// 1. 기존 그룹에 타일 추가 (확장)
// ==================================================================

test.describe("TC-DND-01: 기존 그룹에 타일 추가 (확장)", () => {
  test.beforeEach(async ({ page }) => {
    // Stage 2 핸드: R4a, R5a, R6a, R7a, B3a, K8a (런 목표)
    await goToStage(page, 2);
  });

  test("DND-01-01: 3장 런 배치 후 같은 색상 연속 타일 추가 -> 4장 런으로 확장", async ({
    page,
  }) => {
    // 1. R4+R5+R6 런 배치 (3장)
    await dragTilesToBoard(page, ["R4a", "R5a", "R6a"]);

    // 그룹 1개, 3개 타일 확인
    await expect(boardGroupCount(page)).toHaveCount(1, { timeout: 5000 });
    await expect(groupTileCountBadge(page, 0)).toHaveText("3개");

    // 2. R7a를 보드에 드래그 -> 같은 색상+연속 숫자이므로 기존 그룹에 자동 추가
    await dragTileToBoard(page, "R7a");

    // 그룹은 여전히 1개, 4개 타일로 확장
    await expect(boardGroupCount(page)).toHaveCount(1, { timeout: 5000 });
    await expect(groupTileCountBadge(page, 0)).toHaveText("4개");

    // 클리어 가능 확인
    await expect(
      page.locator('span[role="status"]:has-text("클리어 가능!")')
    ).toBeVisible({ timeout: 5000 });
  });

  test("DND-01-02: 3색 그룹 배치 후 4번째 색상 추가 -> 4색 그룹으로 확장 [Stage 1]", async ({
    page,
  }) => {
    // Stage 1으로 이동 (핸드: R7a, B7a, Y7a, K7a, R3a, B5a)
    await goToStage(page, 1);

    // R7+B7+Y7 그룹 배치 (3색)
    await dragTilesToBoard(page, ["R7a", "B7a", "Y7a"]);

    await expect(boardGroupCount(page)).toHaveCount(1, { timeout: 5000 });
    await expect(groupTileCountBadge(page, 0)).toHaveText("3개");

    // K7a 추가 -> 같은 숫자이므로 기존 그룹에 추가 (4색 그룹)
    await dragTileToBoard(page, "K7a");

    await expect(boardGroupCount(page)).toHaveCount(1, { timeout: 5000 });
    await expect(groupTileCountBadge(page, 0)).toHaveText("4개");
  });
});

// ==================================================================
// 2. 보드 타일 초기화를 통한 랙 복원
// ==================================================================

test.describe("TC-DND-02: 보드 타일 초기화 -> 랙 복원", () => {
  /**
   * 현재 PracticeBoard에서 보드 위 타일은 Tile(비드래그)으로 렌더링되므로
   * 보드에서 직접 드래그하여 랙으로 복원하는 것은 불가능하다.
   * 대신 "초기화" 버튼(resetBoard)을 통해 전체 복원을 검증한다.
   */

  test("DND-02-01: 타일 배치 후 초기화 -> 모든 타일이 랙으로 복원", async ({
    page,
  }) => {
    await goToStage(page, 1);

    // 3개 타일을 보드에 배치
    await dragTilesToBoard(page, ["R7a", "B7a", "Y7a"]);

    // 랙에서 해당 타일들이 사라졌는지 확인
    const rack = page.locator('[aria-label="내 타일 랙"]');
    await expect(
      rack.locator('[aria-label="R7a 타일 (드래그 가능)"]')
    ).not.toBeVisible({ timeout: 3000 });
    await expect(
      rack.locator('[aria-label="B7a 타일 (드래그 가능)"]')
    ).not.toBeVisible({ timeout: 3000 });

    // 보드에 그룹이 있는지 확인
    await expect(boardGroupCount(page)).toHaveCount(1, { timeout: 5000 });

    // 초기화 실행
    await resetBoard(page);
    await page.waitForTimeout(300);

    // 타일이 랙에 복원됨
    await expect(
      rack.locator('[aria-label="R7a 타일 (드래그 가능)"]')
    ).toBeVisible({ timeout: 5000 });
    await expect(
      rack.locator('[aria-label="B7a 타일 (드래그 가능)"]')
    ).toBeVisible({ timeout: 5000 });
    await expect(
      rack.locator('[aria-label="Y7a 타일 (드래그 가능)"]')
    ).toBeVisible({ timeout: 5000 });

    // 보드 그룹이 사라짐
    await expect(boardGroupCount(page)).toHaveCount(0, { timeout: 5000 });
  });

  test("DND-02-02: 복수 그룹 배치 후 초기화 -> 전체 복원", async ({ page }) => {
    await goToStage(page, 5);

    // 그룹 1: R7+B7+Y7+K7
    await dragTilesToBoard(page, ["R7a", "B7a", "Y7a", "K7a"]);
    // 그룹 2: R8+R9+R10 (자동 새 그룹)
    await dragTilesToBoard(page, ["R8a", "R9a", "R10a"]);

    await expect(boardGroupCount(page)).toHaveCount(2, { timeout: 5000 });

    // 초기화
    await resetBoard(page);
    await page.waitForTimeout(300);

    // 모든 타일이 랙으로 복원
    const rack = page.locator('[aria-label="내 타일 랙"]');
    for (const code of ["R7a", "B7a", "Y7a", "K7a", "R8a", "R9a", "R10a"]) {
      await expect(
        rack.locator(`[aria-label="${code} 타일 (드래그 가능)"]`)
      ).toBeVisible({ timeout: 5000 });
    }

    await expect(boardGroupCount(page)).toHaveCount(0, { timeout: 5000 });
  });
});

// ==================================================================
// 3. 새 그룹 생성
// ==================================================================

test.describe("TC-DND-03: 새 그룹 생성", () => {
  test("DND-03-01: 빈 보드에 타일 3개 드롭 -> 새 그룹 1개 자동 생성", async ({
    page,
  }) => {
    await goToStage(page, 1);

    // 보드가 비어있는 상태에서 첫 타일 드롭
    await dragTileToBoard(page, "R7a");

    // 첫 드롭 시 새 그룹 자동 생성
    await expect(boardGroupCount(page)).toHaveCount(1, { timeout: 5000 });
    await expect(groupTileCountBadge(page, 0)).toHaveText("1개");

    // 2번째, 3번째 타일 -> 같은 그룹에 추가
    await dragTilesToBoard(page, ["B7a", "Y7a"]);

    // 여전히 1개 그룹, 3개 타일
    await expect(boardGroupCount(page)).toHaveCount(1, { timeout: 5000 });
    await expect(groupTileCountBadge(page, 0)).toHaveText("3개");
  });

  test("DND-03-02: 새 그룹 버튼으로 두 번째 그룹 생성", async ({ page }) => {
    await goToStage(page, 5);

    // 첫 번째 그룹: R7+B7+Y7
    await dragTilesToBoard(page, ["R7a", "B7a", "Y7a"]);
    await expect(boardGroupCount(page)).toHaveCount(1, { timeout: 5000 });

    // 새 그룹 버튼 클릭
    await clickNewGroup(page);

    // 두 번째 그룹: R8
    await dragTileToBoard(page, "R8a");

    // 2개 그룹 확인
    await expect(boardGroupCount(page)).toHaveCount(2, { timeout: 5000 });
  });

  test("DND-03-03: 자동 새 그룹 -- 4색 그룹 후 다른 숫자 드롭 시 분리", async ({
    page,
  }) => {
    await goToStage(page, 5);

    // 4색 그룹: R7+B7+Y7+K7 (그룹 꽉 참)
    await dragTilesToBoard(page, ["R7a", "B7a", "Y7a", "K7a"]);
    await expect(boardGroupCount(page)).toHaveCount(1, { timeout: 5000 });

    // R8a (숫자 8, 빨강) -> 그룹 4개 초과 -> 자동 새 그룹
    await dragTileToBoard(page, "R8a");

    await expect(boardGroupCount(page)).toHaveCount(2, { timeout: 5000 });
  });

  test("DND-03-04: 자동 새 그룹 -- 런 후보에 다른 색상 드롭 시 분리", async ({
    page,
  }) => {
    await goToStage(page, 5);

    // 런 후보: R8+R9+R10 (빨강 연속)
    await dragTilesToBoard(page, ["R8a", "R9a", "R10a"]);
    await expect(boardGroupCount(page)).toHaveCount(1, { timeout: 5000 });

    // B4a (파란색) -> 런 후보에 색상 불일치 -> 자동 새 그룹
    await dragTileToBoard(page, "B4a");

    await expect(boardGroupCount(page)).toHaveCount(2, { timeout: 5000 });
  });
});

// ==================================================================
// 4. 미완성 세트 확정 차단
// ==================================================================

test.describe("TC-DND-04: 미완성 세트 확정 차단", () => {
  test("DND-04-01: 타일 2개만 배치 -> 확정 버튼 비활성화", async ({
    page,
  }) => {
    await goToStage(page, 1);

    // 2개만 배치 (최소 3개 필요)
    await dragTilesToBoard(page, ["R7a", "B7a"]);

    // 확정 버튼 비활성화
    await expect(page.getByLabel("스테이지 클리어 확정")).toBeDisabled();

    // "클리어 가능!" 뱃지가 보이지 않아야 함
    await expect(
      page.locator('span[role="status"]:has-text("클리어 가능!")')
    ).not.toBeVisible();
  });

  test("DND-04-02: 2개에서 3개로 추가 시 유효하면 확정 버튼 활성화", async ({
    page,
  }) => {
    await goToStage(page, 1);

    // 2개 배치 -> 비활성
    await dragTilesToBoard(page, ["R7a", "B7a"]);
    await expect(page.getByLabel("스테이지 클리어 확정")).toBeDisabled();

    // 3번째 타일 추가 -> 유효 그룹 완성 (R7+B7+Y7)
    await dragTileToBoard(page, "Y7a");

    // 확정 버튼 활성화
    await expect(page.getByLabel("스테이지 클리어 확정")).not.toBeDisabled({
      timeout: 5000,
    });
    await expect(
      page.locator('span[role="status"]:has-text("클리어 가능!")')
    ).toBeVisible({ timeout: 5000 });
  });

  test("DND-04-03: 빈 보드에서 확정 버튼 비활성화", async ({ page }) => {
    await goToStage(page, 1);

    // 아무 타일도 배치하지 않은 상태
    await expect(page.getByLabel("스테이지 클리어 확정")).toBeDisabled();
  });

  test("DND-04-04: 유효 -> 초기화 -> 다시 미완성 배치 -> 확정 차단", async ({
    page,
  }) => {
    await goToStage(page, 1);

    // 유효한 배치
    await dragTilesToBoard(page, ["R7a", "B7a", "Y7a"]);
    await expect(page.getByLabel("스테이지 클리어 확정")).not.toBeDisabled({
      timeout: 5000,
    });

    // 초기화
    await resetBoard(page);
    await page.waitForTimeout(300);

    // 미완성 배치 (2개만)
    await dragTilesToBoard(page, ["R7a", "B7a"]);
    await expect(page.getByLabel("스테이지 클리어 확정")).toBeDisabled();
  });
});

// ==================================================================
// 5. 유효하지 않은 런 경고 (비연속 숫자)
// ==================================================================

test.describe("TC-DND-05: 유효하지 않은 런 -- 비연속 숫자", () => {
  test("DND-05-01: 같은 색 비연속 숫자 3장 (R4+R6+R7) -> 확정 차단", async ({
    page,
  }) => {
    await goToStage(page, 2);

    // R4+R6+R7: R5가 빠져 비연속
    await dragTilesToBoard(page, ["R4a", "R6a", "R7a"]);

    // 확정 버튼 비활성화
    await expect(page.getByLabel("스테이지 클리어 확정")).toBeDisabled();

    // "클리어 가능!" 뱃지 없음
    await expect(
      page.locator('span[role="status"]:has-text("클리어 가능!")')
    ).not.toBeVisible();
  });

  test("DND-05-02: 비연속 런에 에러 메시지 표시", async ({ page }) => {
    await goToStage(page, 2);

    // R4+R6+R7: 비연속
    await dragTilesToBoard(page, ["R4a", "R6a", "R7a"]);

    // 그룹 타입 토글 영역에 에러 표시 (role="alert")
    const errorAlert = page.locator('[role="alert"]');
    await expect(errorAlert.first()).toBeVisible({ timeout: 5000 });
  });

  test("DND-05-03: 색상 혼합 런 (R4+R5+B3) -> 확정 차단 + 에러", async ({
    page,
  }) => {
    await goToStage(page, 2);

    // R4+R5+B3: 색상 혼합
    await dragTilesToBoard(page, ["R4a", "R5a", "B3a"]);

    // 확정 차단
    await expect(page.getByLabel("스테이지 클리어 확정")).toBeDisabled();
  });
});

// ==================================================================
// 6. 유효하지 않은 그룹 경고 (색상 중복)
// ==================================================================

test.describe("TC-DND-06: 유효하지 않은 그룹 -- 색상 중복", () => {
  test("DND-06-01: 같은 색상 같은 숫자 (R7+R3+B7) -> 숫자 불일치 무효", async ({
    page,
  }) => {
    await goToStage(page, 1);

    // R7+B7+R3: 숫자가 다르므로 그룹으로 무효
    await dragTilesToBoard(page, ["R7a", "B7a", "R3a"]);

    // 확정 차단
    await expect(page.getByLabel("스테이지 클리어 확정")).toBeDisabled();
  });

  test("DND-06-02: 색상 중복 경고 감지 (GameBoard detectDuplicateColors)", async ({
    page,
  }) => {
    // Stage 5 핸드에서 같은 색상 타일이 여러 개 있음
    // B4a, B4b (같은 파랑, 같은 숫자 4)
    await goToStage(page, 5);

    // 새 그룹 생성 후 B4a + B4b 배치 -> 같은 색상 중복
    await dragTileToBoard(page, "B4a");
    await dragTileToBoard(page, "B4b");

    // 그룹 타입 토글 영역에 에러 표시
    const errorAlert = page.locator('[role="alert"]');
    await expect(errorAlert.first()).toBeVisible({ timeout: 5000 });

    // 확정 차단
    await expect(page.getByLabel("스테이지 클리어 확정")).toBeDisabled();
  });

  test("DND-06-03: 중복 해소 후 확정 가능", async ({ page }) => {
    await goToStage(page, 1);

    // 무효 배치 (R7+R3+B5: 숫자 불일치)
    await dragTilesToBoard(page, ["R7a", "R3a", "B5a"]);
    await expect(page.getByLabel("스테이지 클리어 확정")).toBeDisabled();

    // 초기화 후 유효 그룹 배치
    await resetBoard(page);
    await page.waitForTimeout(300);

    await dragTilesToBoard(page, ["R7a", "B7a", "Y7a"]);
    await expect(page.getByLabel("스테이지 클리어 확정")).not.toBeDisabled({
      timeout: 5000,
    });
  });
});

// ==================================================================
// 7. 드래그 취소 시 타일 유지
// ==================================================================

test.describe("TC-DND-07: 드래그 취소 시 타일 원위치", () => {
  test("DND-07-01: 드래그 시작 후 ESC 키 -> 타일이 랙에 남아있음", async ({
    page,
  }) => {
    await goToStage(page, 1);

    const rack = page.locator('[aria-label="내 타일 랙"]');
    const tile = rack.locator('[aria-label="R7a 타일 (드래그 가능)"]');
    await expect(tile).toBeVisible({ timeout: 5000 });

    // 드래그 시작: 마우스 다운 + 8px 이상 이동
    const tileBox = await tile.boundingBox();
    expect(tileBox).not.toBeNull();
    if (!tileBox) return;

    const cx = tileBox.x + tileBox.width / 2;
    const cy = tileBox.y + tileBox.height / 2;

    await page.mouse.move(cx, cy);
    await page.mouse.down();
    await page.mouse.move(cx + 3, cy, { steps: 2 });
    await page.mouse.move(cx + 12, cy, { steps: 2 });
    await page.waitForTimeout(100);

    // ESC 키로 드래그 취소
    await page.keyboard.press("Escape");
    await page.waitForTimeout(200);

    // 타일이 랙에 그대로 남아있어야 함
    await expect(
      rack.locator('[aria-label="R7a 타일 (드래그 가능)"]')
    ).toBeVisible({ timeout: 5000 });

    // 보드에 그룹이 생성되지 않았어야 함
    await expect(boardGroupCount(page)).toHaveCount(0);
  });

  test("DND-07-02: 드래그 시작 후 짧은 거리(8px 미만) 이동 -> 드래그 미활성화", async ({
    page,
  }) => {
    // dnd-kit PointerSensor의 activationConstraint.distance = 8px
    // 8px 미만 이동 시 드래그가 활성화되지 않아 아무 일도 일어나지 않는다.
    await goToStage(page, 1);

    const rack = page.locator('[aria-label="내 타일 랙"]');
    const tile = rack.locator('[aria-label="R7a 타일 (드래그 가능)"]');
    await expect(tile).toBeVisible({ timeout: 5000 });

    const tileBox = await tile.boundingBox();
    expect(tileBox).not.toBeNull();
    if (!tileBox) return;

    const cx = tileBox.x + tileBox.width / 2;
    const cy = tileBox.y + tileBox.height / 2;

    // 마우스 다운 후 5px만 이동 (8px 미만 -> 드래그 미활성화)
    await page.mouse.move(cx, cy);
    await page.mouse.down();
    await page.mouse.move(cx + 5, cy, { steps: 3 });
    await page.waitForTimeout(100);
    await page.mouse.up();
    await page.waitForTimeout(200);

    // 타일이 랙에 그대로 남아있어야 함
    await expect(
      rack.locator('[aria-label="R7a 타일 (드래그 가능)"]')
    ).toBeVisible({ timeout: 5000 });

    // 보드에 그룹이 생성되지 않았어야 함
    await expect(boardGroupCount(page)).toHaveCount(0);
  });

  test("DND-07-03: 정상 드래그 후 랙에 타일이 사라지는지 대조 검증", async ({
    page,
  }) => {
    await goToStage(page, 1);

    const rack = page.locator('[aria-label="내 타일 랙"]');

    // 드래그 전: 랙에 R7a 존재
    await expect(
      rack.locator('[aria-label="R7a 타일 (드래그 가능)"]')
    ).toBeVisible({ timeout: 5000 });

    // 정상적으로 보드에 드래그
    await dragTileToBoard(page, "R7a");

    // 랙에서 R7a 사라짐 (대조군: 드래그 취소와 반대 결과)
    await expect(
      rack.locator('[aria-label="R7a 타일 (드래그 가능)"]')
    ).not.toBeVisible({ timeout: 5000 });

    // 보드에 그룹 생성
    await expect(boardGroupCount(page)).toHaveCount(1, { timeout: 5000 });
  });
});

// ==================================================================
// 8. 기존 그룹에 타일을 직접 드래그하여 추가 (DroppableGroupWrapper)
// ==================================================================

test.describe("TC-DND-08: 특정 그룹으로 직접 드롭 (groupsDroppable)", () => {
  test("DND-08-01: 두 그룹 중 첫 번째 그룹에 직접 드롭하여 타일 추가", async ({
    page,
  }) => {
    await goToStage(page, 5);

    // 그룹 1: R7+B7+Y7 (3색 그룹)
    await dragTilesToBoard(page, ["R7a", "B7a", "Y7a"]);
    await expect(boardGroupCount(page)).toHaveCount(1, { timeout: 5000 });

    // 새 그룹 버튼 클릭
    await clickNewGroup(page);

    // 그룹 2: R8+R9+R10 (런)
    await dragTilesToBoard(page, ["R8a", "R9a", "R10a"]);
    await expect(boardGroupCount(page)).toHaveCount(2, { timeout: 5000 });
    await expect(groupTileCountBadge(page, 0)).toHaveText("3개");
    await expect(groupTileCountBadge(page, 1)).toHaveText("3개");

    // K7a를 첫 번째 그룹(7 그룹)으로 직접 드래그
    // 첫 번째 그룹의 DroppableGroupWrapper를 찾는다.
    // 게임 테이블 내 첫 번째 flex-col 그룹 영역
    const boardSection = page.locator('section[aria-label="게임 테이블"]');
    const firstGroupZone = boardSection.locator(".flex.flex-wrap.gap-6 > div").first();
    const rackTile = page
      .locator('[aria-label="K7a 타일 (드래그 가능)"]')
      .first();
    await rackTile.waitFor({ state: "visible", timeout: 5000 });

    await dndDrag(page, rackTile, firstGroupZone);

    // 첫 번째 그룹이 4개로 확장되고, 두 번째 그룹은 3개 유지
    await expect(groupTileCountBadge(page, 0)).toHaveText("4개", {
      timeout: 5000,
    });
    await expect(groupTileCountBadge(page, 1)).toHaveText("3개");
  });
});

// ==================================================================
// 9. 복합 시나리오: 확장 + 새 그룹 + 확정 플로우
// ==================================================================

test.describe("TC-DND-09: 복합 조작 시나리오", () => {
  test("DND-09-01: 그룹 확장 + 새 그룹 생성 + 클리어 확정 전체 플로우", async ({
    page,
  }) => {
    // Stage 5: 목표 = multi (그룹 1개 + 런 1개)
    await goToStage(page, 5);

    // 1단계: 4색 그룹 R7+B7+Y7+K7
    await dragTilesToBoard(page, ["R7a", "B7a", "Y7a", "K7a"]);
    await expect(boardGroupCount(page)).toHaveCount(1, { timeout: 5000 });

    // 2단계: 런 R8+R9+R10 (4색 초과 -> 자동 새 그룹)
    await dragTilesToBoard(page, ["R8a", "R9a", "R10a"]);
    await expect(boardGroupCount(page)).toHaveCount(2, { timeout: 5000 });

    // 3단계: 클리어 가능 확인
    await expect(
      page.locator('span[role="status"]:has-text("클리어 가능!")')
    ).toBeVisible({ timeout: 5000 });
    await expect(page.getByLabel("스테이지 클리어 확정")).not.toBeDisabled();

    // 4단계: 확정 클릭
    await page.getByLabel("스테이지 클리어 확정").click();

    // 5단계: 클리어 오버레이 표시
    const scoreDialog = page.locator(
      '[role="dialog"][aria-label="스테이지 클리어"]'
    );
    await expect(scoreDialog).toBeVisible({ timeout: 5000 });
    await expect(page.getByText("획득 점수").first()).toBeVisible({
      timeout: 5000,
    });
  });

  test("DND-09-02: 초기화 -> 재배치 -> 클리어 플로우", async ({ page }) => {
    await goToStage(page, 5);

    // 잘못된 배치: 숫자 불일치 타일들 혼합
    await dragTilesToBoard(page, ["R7a", "R8a"]);
    await expect(page.getByLabel("스테이지 클리어 확정")).toBeDisabled();

    // 초기화
    await resetBoard(page);
    await page.waitForTimeout(300);

    // 정확한 배치
    await dragTilesToBoard(page, ["R7a", "B7a", "Y7a", "K7a"]);
    await clickNewGroup(page);
    await dragTilesToBoard(page, ["R8a", "R9a", "R10a"]);

    await expect(
      page.locator('span[role="status"]:has-text("클리어 가능!")')
    ).toBeVisible({ timeout: 5000 });
    await expect(page.getByLabel("스테이지 클리어 확정")).not.toBeDisabled();
  });
});
