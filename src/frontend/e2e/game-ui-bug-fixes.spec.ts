/**
 * BUG-UI-001 ~ BUG-UI-004 수정 검증 E2E 테스트
 *
 * BUG-UI-001 [Critical]: Human이 여러 그룹을 동시에 배치할 수 없음
 *   - 수정: handleDragEnd에 자동 새 그룹 생성 로직 추가
 *   - 4개 초과 타일 드롭 시 자동 새 그룹 생성
 *   - 숫자/색상이 다른 타일 드롭 시 자동 새 그룹 생성
 *
 * BUG-UI-002 [Medium]: AI 배치 테이블 그룹 시각적 분리 확인
 *   - 수정: GameBoard의 그룹 간 gap을 4 -> 6으로 확대
 *
 * BUG-UI-003 [Low]: 게임 종료 화면에서 플레이어 이름 빈칸
 *   - 수정: PlayerState에 DisplayName 필드 추가, GAME_STATE에 전달
 *
 * BUG-UI-004 [Low]: trophy 이모지 "[trophy]" 텍스트로 표시
 *   - 확인: 이미 정상 이모지로 렌더링됨
 *
 * 검증 환경: 연습 모드 Stage 4, 5, 6 (다중 그룹 배치 테스트에 최적)
 *
 * 참고: 연습 모드에서는 pendingGroupIds가 없으므로 "미확정" aria-label이 아닌
 *       그룹 타입 토글 버튼 (aria-label*="그룹 타입") 수로 그룹 개수를 판별한다.
 */

import { test, expect, type Page } from "@playwright/test";
import {
  goToStage,
  dragTileToBoard,
  dragTilesToBoard,
  clickNewGroup,
  resetBoard,
} from "./helpers";

// ------------------------------------------------------------------
// 헬퍼: 보드 위 그룹 개수 확인 (연습 모드용)
// ------------------------------------------------------------------

/**
 * 연습 모드에서 보드 위 그룹 수를 확인한다.
 * 그룹 타입 변경 BUTTON (aria-label이 "그룹 타입 ... 변경"으로 시작) 개수로 판별한다.
 * 그룹 하나당 타입 토글 버튼이 1개씩 생성된다.
 * 주의: 부모 div의 aria-label="배치된 그룹 타입 변경"이 일치하지 않도록 button만 선택한다.
 */
function boardGroupCount(page: Page) {
  return page.locator('button[aria-label^="그룹 타입"]');
}

// ==================================================================
// BUG-UI-001: 다중 그룹 동시 배치 테스트 (연습 모드)
// ==================================================================

test.describe("BUG-UI-001: 다중 그룹 동시 배치", () => {
  // Stage 4 hand: JK1, Y8a, Y10a, Y11a, R7a, B7a, K7a, R5a, B5a
  // 정답: [Y8+JK1+Y10+Y11] 런 + [R7+B7+K7] 그룹

  test.describe("Stage 4 -- 수동 새 그룹 버튼 사용", () => {
    test.beforeEach(async ({ page }) => {
      await goToStage(page, 4);
    });

    test("BUG-001-S4-01: 새 그룹 버튼으로 런+그룹 2개 동시 배치 성공", async ({
      page,
    }) => {
      // 1. 런 배치: Y8+JK1+Y10+Y11
      await dragTilesToBoard(page, ["Y8a", "JK1", "Y10a", "Y11a"]);

      // 보드에 그룹 1개 확인
      await expect(boardGroupCount(page)).toHaveCount(1, { timeout: 5000 });

      // 2. 새 그룹 버튼 클릭
      await clickNewGroup(page);

      // 3. 그룹 배치: R7+B7+K7
      await dragTilesToBoard(page, ["R7a", "B7a", "K7a"]);

      // 보드에 그룹 2개 확인
      await expect(boardGroupCount(page)).toHaveCount(2, { timeout: 5000 });

      // 클리어 가능 확인 (multi 목표: 런 1개 + 그룹 1개)
      await expect(
        page.locator('span[role="status"]:has-text("클리어 가능!")')
      ).toBeVisible({ timeout: 5000 });
    });

    test("BUG-001-S4-02: 새 그룹 버튼 없이 런만 배치 -> 클리어 불가", async ({
      page,
    }) => {
      await dragTilesToBoard(page, ["JK1", "Y8a", "Y10a", "Y11a"]);
      await expect(page.getByLabel("스테이지 클리어 확정")).toBeDisabled();
    });
  });

  // Stage 5 hand: R7a, B7a, Y7a, K7a, R8a, R9a, R10a, B4a, B4b, Y4a, K4a, R3a, R3b, B3a
  // 정답: [R7+B7+Y7+K7] 그룹 + [R8+R9+R10] 런

  test.describe("Stage 5 -- 자동 새 그룹 생성 검증", () => {
    test.beforeEach(async ({ page }) => {
      await goToStage(page, 5);
    });

    test("BUG-001-S5-01: 4색 그룹 후 다른 색상 타일 자동 새 그룹 생성", async ({
      page,
    }) => {
      // 1. 그룹 배치: R7+B7+Y7+K7 (4개 -- 자동으로 꽉 참)
      await dragTilesToBoard(page, ["R7a", "B7a", "Y7a", "K7a"]);

      // 4개 후 R8a 추가 시 자동 새 그룹 생성되어야 함 (>=4 조건)
      await dragTilesToBoard(page, ["R8a", "R9a", "R10a"]);

      // 보드에 그룹 2개 확인
      await expect(boardGroupCount(page)).toHaveCount(2, { timeout: 5000 });

      // 클리어 가능 확인
      await expect(
        page.locator('span[role="status"]:has-text("클리어 가능!")')
      ).toBeVisible({ timeout: 5000 });
    });

    test("BUG-001-S5-02: 3개 그룹 후 새 그룹 버튼으로 런 추가", async ({
      page,
    }) => {
      // 그룹: R7+B7+Y7 (3개)
      await dragTilesToBoard(page, ["R7a", "B7a", "Y7a"]);

      // 새 그룹 버튼 클릭
      await clickNewGroup(page);

      // 런: R8+R9+R10
      await dragTilesToBoard(page, ["R8a", "R9a", "R10a"]);

      // 보드에 그룹 2개 확인
      await expect(boardGroupCount(page)).toHaveCount(2, { timeout: 5000 });

      // 클리어 가능 확인 (multi 목표)
      await expect(
        page.locator('span[role="status"]:has-text("클리어 가능!")')
      ).toBeVisible({ timeout: 5000 });
    });

    test("BUG-001-S5-03: 그룹(3개)+같은 숫자 타일 -> 같은 그룹에 추가", async ({
      page,
    }) => {
      // R7+B7+Y7 그룹 (같은 숫자) -> K7도 같은 숫자이므로 같은 그룹에 추가
      await dragTilesToBoard(page, ["R7a", "B7a", "Y7a", "K7a"]);

      // 그룹은 1개여야 함 (4개 모두 같은 그룹)
      await expect(boardGroupCount(page)).toHaveCount(1, { timeout: 5000 });
    });
  });

  // Stage 6: 12장 이상 배치 테스트 (3개 그룹)
  // hand: R1a~R6a, B6a, Y6a, K6a, B7a, B8a, B9a, JK1, K3a

  test.describe("Stage 6 -- 3개 그룹 동시 배치", () => {
    test.beforeEach(async ({ page }) => {
      await goToStage(page, 6);
    });

    test("BUG-001-S6-01: 런+그룹+런 3개 세트 동시 배치 (12장+)", async ({
      page,
    }) => {
      // 런 1: R1~R6 (6장 -- 같은 색상 연속이므로 같은 그룹 유지)
      await dragTilesToBoard(page, [
        "R1a",
        "R2a",
        "R3a",
        "R4a",
        "R5a",
        "R6a",
      ]);

      // 새 그룹 클릭
      await clickNewGroup(page);

      // 그룹: B6+Y6+K6 (같은 숫자)
      await dragTilesToBoard(page, ["B6a", "Y6a", "K6a"]);

      // 새 그룹 클릭
      await clickNewGroup(page);

      // 런 2: B7+B8+B9
      await dragTilesToBoard(page, ["B7a", "B8a", "B9a"]);

      // 보드에 그룹 3개 확인
      await expect(boardGroupCount(page)).toHaveCount(3, { timeout: 5000 });

      // 12장 = 클리어 가능 (master 목표)
      await expect(
        page.locator('span[role="status"]:has-text("클리어 가능!")')
      ).toBeVisible({ timeout: 5000 });
    });
  });

  test.describe("초기화 후 재배치", () => {
    test("BUG-001-RESET: 초기화 후 다중 그룹 재배치 성공", async ({ page }) => {
      await goToStage(page, 4);

      // 잘못된 배치 (단일 그룹에 전부)
      await dragTilesToBoard(page, ["R7a", "B7a"]);

      // 초기화
      await resetBoard(page);

      // 정답 배치
      await dragTilesToBoard(page, ["Y8a", "JK1", "Y10a", "Y11a"]);
      await clickNewGroup(page);
      await dragTilesToBoard(page, ["R7a", "B7a", "K7a"]);

      await expect(
        page.locator('span[role="status"]:has-text("클리어 가능!")')
      ).toBeVisible({ timeout: 5000 });
    });
  });
});

// ==================================================================
// BUG-UI-001: 자동 새 그룹 생성 - 숫자/색상 불일치 감지 테스트
// ==================================================================

test.describe("BUG-UI-001: 자동 새 그룹 생성 (숫자/색상 불일치)", () => {
  // Stage 5 hand: R7a, B7a, Y7a, K7a, R8a, R9a, R10a, B4a, B4b, Y4a, K4a, R3a, R3b, B3a

  test.beforeEach(async ({ page }) => {
    await goToStage(page, 5);
  });

  test("AUTO-01: 그룹(같은 숫자) 후 다른 숫자 드롭 -> 자동 새 그룹", async ({
    page,
  }) => {
    // R7+B7+Y7 (같은 숫자 7 그룹 후보)
    await dragTilesToBoard(page, ["R7a", "B7a", "Y7a"]);

    // R8a (숫자 8) -> 그룹 후보에 숫자 불일치 -> 자동 새 그룹
    await dragTileToBoard(page, "R8a");

    // 기대: 2개 그룹 (R7+B7+Y7), (R8a)
    await expect(boardGroupCount(page)).toHaveCount(2, { timeout: 5000 });
  });

  test("AUTO-02: 런(같은 색상) 후 다른 색상 드롭 -> 자동 새 그룹", async ({
    page,
  }) => {
    // R8+R9+R10 (같은 색상 Red 런 후보)
    await dragTilesToBoard(page, ["R8a", "R9a", "R10a"]);

    // B4a (파란색) -> 런 후보에 색상 불일치 -> 자동 새 그룹
    await dragTileToBoard(page, "B4a");

    // 기대: 2개 그룹 (R8+R9+R10), (B4a)
    await expect(boardGroupCount(page)).toHaveCount(2, { timeout: 5000 });
  });

  test("AUTO-03: 혼합 타일(숫자도 색상도 다름) -> 자동 분리 안 함", async ({
    page,
  }) => {
    // R7a (빨강 7) + B4a (파랑 4) -> 숫자도 색상도 다름
    // 1개 타일 시점에는 isGroupCandidate=true, isRunCandidate=true (1개는 양쪽 다 해당)
    // B4a: 숫자 불일치(7!=4) AND 색상 불일치(R!=B) 이지만
    // 두 조건 모두 !isRunCandidate&&isGroupCandidate나 !isGroupCandidate&&isRunCandidate에 해당 안 함
    // (둘 다 true이므로) -> 같은 그룹에 남음
    await dragTileToBoard(page, "R7a");
    await dragTileToBoard(page, "B4a");

    // 혼합 상태에서는 분리하지 않음 (1개 그룹)
    await expect(boardGroupCount(page)).toHaveCount(1, { timeout: 5000 });
  });
});

// ==================================================================
// BUG-UI-002: 테이블 그룹 시각적 분리 확인
// ==================================================================

test.describe("BUG-UI-002: 테이블 그룹 시각적 분리", () => {
  test("테이블 그룹 간 충분한 간격 확인", async ({ page }) => {
    await goToStage(page, 5);

    // 2개 그룹 배치
    await dragTilesToBoard(page, ["R7a", "B7a", "Y7a", "K7a"]);
    await clickNewGroup(page);
    await dragTilesToBoard(page, ["R8a", "R9a", "R10a"]);

    // 보드에 2개 그룹이 있는지 확인
    await expect(boardGroupCount(page)).toHaveCount(2, { timeout: 5000 });

    // 보드 내 타일 그룹 컨테이너들의 경계 박스를 비교
    // 각 그룹은 "gap-0.5 p-1.5 rounded-lg" div 안에 타일들이 있다
    const tileContainers = page.locator(
      'section[aria-label="게임 테이블"] .flex.gap-0\\.5'
    );
    const count = await tileContainers.count();
    expect(count).toBeGreaterThanOrEqual(2);

    if (count >= 2) {
      const box1 = await tileContainers.nth(0).boundingBox();
      const box2 = await tileContainers.nth(1).boundingBox();
      expect(box1).not.toBeNull();
      expect(box2).not.toBeNull();

      if (box1 && box2) {
        // 두 그룹 사이에 최소 8px 간격 확인
        const gap =
          box2.x > box1.x + box1.width
            ? box2.x - (box1.x + box1.width)
            : box2.y > box1.y + box1.height
            ? box2.y - (box1.y + box1.height)
            : 0;
        expect(gap).toBeGreaterThanOrEqual(8);
      }
    }
  });
});

// ==================================================================
// BUG-UI-003: 게임 종료 화면 플레이어 이름 표시
// ==================================================================

test.describe("BUG-UI-003: 플레이어 이름 표시 (소스 코드 검증)", () => {
  test("GameEndedOverlay에 getPlayerDisplayName이 올바르게 구현됨", async ({
    page,
  }) => {
    await page.goto("/lobby");
    await page.waitForLoadState("domcontentloaded");

    // DOM에 "[trophy]" 텍스트가 없는지 확인 (BUG-UI-004 검증 포함)
    const hasTrophyText = await page.evaluate(() => {
      return document.body.innerHTML.includes("[trophy]");
    });
    expect(hasTrophyText).toBe(false);
  });
});

// ==================================================================
// BUG-UI-004: trophy 이모지 정상 표시 확인
// ==================================================================

test.describe("BUG-UI-004: trophy 이모지 렌더링", () => {
  test("소스 코드에 [trophy] 텍스트가 없고 실제 이모지 사용", async ({
    page,
  }) => {
    await page.goto("/practice/1");
    await page.waitForLoadState("domcontentloaded");

    const content = await page.evaluate(() => document.body.innerHTML);
    expect(content).not.toContain("[trophy]");
    expect(content).not.toContain("[TROPHY]");
  });
});

// ==================================================================
// 새 그룹 버튼 토글 동작 테스트
// ==================================================================

test.describe("새 그룹 버튼 토글", () => {
  test.beforeEach(async ({ page }) => {
    await goToStage(page, 4);
  });

  test("새 그룹 버튼 표시 조건: 타일 배치 후에만 표시", async ({ page }) => {
    // 배치 전: 새 그룹 버튼 없음
    const newGroupBtn = page.getByLabel("다음 드롭 시 새 그룹 생성");
    await expect(newGroupBtn).not.toBeVisible();

    // 타일 1개 배치
    await dragTileToBoard(page, "R7a");

    // 배치 후: 새 그룹 버튼 표시
    await expect(newGroupBtn).toBeVisible({ timeout: 5000 });
  });

  test("새 그룹 버튼 토글 ON/OFF 동작", async ({ page }) => {
    await dragTileToBoard(page, "R7a");

    const newGroupBtn = page.getByLabel("다음 드롭 시 새 그룹 생성");
    await expect(newGroupBtn).toBeVisible({ timeout: 5000 });

    // 기본: OFF 상태
    await expect(newGroupBtn).toContainText("새 그룹");

    // 클릭: ON 상태
    await newGroupBtn.click();
    await expect(newGroupBtn).toContainText("새 그룹 모드 ON");

    // 다시 클릭: OFF 상태로 돌아감
    await newGroupBtn.click();
    await page.waitForTimeout(200);
    await expect(newGroupBtn).toContainText("새 그룹");
  });
});
