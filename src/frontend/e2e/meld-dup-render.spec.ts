/**
 * BUG-UI-009 + BUG-UI-010 재현 스펙
 *
 * BUG-UI-009: 드래그 시 동일 구조 멜드 복제 렌더링 (9개 복제)
 *   근본 원인: PlayerRack.tsx:154 key 에 idx 누락 → dnd-kit listener 다중 등록
 *             + handleDragEnd re-entrancy guard 부재 → 다중 dispatch 증폭
 *   참조: work_logs/plans/tmp-analysis/bug-ui-009-architect-review.md
 *
 * BUG-UI-010: 드래그 취소(ESC/보드 밖 드롭) 후 타일 stuck (손패 위에 떠있음)
 *   근본 원인: DndContext 에 onDragCancel 핸들러 미설정
 *             + handleDragStart defensive clear 부재
 *   참조: 스크린샷 2026-04-23_221554.png (B5 타일 stuck)
 *
 * 연습 모드(PracticeBoard)에서 재현 — 서버 없이 클라이언트 단독 검증 가능
 *
 * Phase 1 (RED 확정): 이 스펙은 수정 전 코드에서 실패해야 정상
 * Phase 3 (GREEN): 수정 후 코드에서 전부 통과해야 정상
 */

import { test, expect } from "@playwright/test";
import { goToStage, dndDrag, dragTileToBoard } from "./helpers";

// ------------------------------------------------------------------
// 헬퍼: 보드 위 그룹 개수 (미확정 포함)
// ------------------------------------------------------------------

/**
 * 보드의 총 그룹 수 (서버 확정 + pending 포함)
 * GameBoard.tsx 에서 그룹 하나당 타입 토글 버튼이 1개 생성된다.
 */
function boardGroupCount(page: import("@playwright/test").Page) {
  return page.locator('button[aria-label^="그룹 타입"]');
}

/**
 * 미확정(pending) 그룹 수
 * GameBoard.tsx: aria-label="미확정 그룹 (제출 대기 중)" or "미확정 런 (제출 대기 중)"
 */
function pendingGroupCount(page: import("@playwright/test").Page) {
  return page.locator(
    '[aria-label="미확정 그룹 (제출 대기 중)"], [aria-label="미확정 런 (제출 대기 중)"], [aria-label="미확정 그룹 (제출 대기 중)"]'
  );
}

// ------------------------------------------------------------------
// BUG-UI-009: 멜드 복제 렌더링 방지
// ------------------------------------------------------------------

test.describe("BUG-UI-009: 멜드 복제 렌더링 방지", () => {
  /**
   * TC-009-01: rack 타일 1장 드래그 → pending 그룹 1개만 생성
   *
   * 재현 시나리오:
   *   - Stage 1 핸드: R7a, B7a, Y7a, K7a, R3a, B5a
   *   - 타일 1개를 보드로 드래그
   *   - pending 그룹이 1개만 생성되어야 함 (수정 전: 다중 생성)
   *
   * 수정 전 RED 이유:
   *   PlayerRack.tsx:154 key=`rack-${code}` — idx 누락으로 dnd-kit listener 이중 등록 가능
   *   handleDragEnd re-entrancy guard 없어 다중 dispatch 시 N개 pending 그룹 생성
   */
  test("TC-009-01: rack 타일 1장 드래그 후 pending 그룹 1개만 생성", async ({
    page,
  }) => {
    await goToStage(page, 1);

    // 보드 그룹 초기 상태: 0개
    await expect(boardGroupCount(page)).toHaveCount(0, { timeout: 5000 });

    // R7a 1장만 보드로 드래그 (새 그룹 생성)
    await dragTileToBoard(page, "R7a");

    // 핵심 assertion: 그룹이 정확히 1개여야 함 (복제 렌더링 금지)
    // 수정 전: listener 다중 등록 시 동일 드래그로 N개 그룹이 생성됨 → FAIL
    await expect(boardGroupCount(page)).toHaveCount(1, {
      timeout: 3000,
    });
  });

  /**
   * TC-009-02: 연속 드래그 2회 → 그룹 수 최대 2 (re-entrancy guard 가 정상 드래그 차단 안 함)
   *
   * re-entrancy guard 의 false-positive 방지 검증:
   *   - 타일 A 드롭 → 그룹 1개
   *   - 타일 B 드롭 → 그룹 1 or 2개 (기존 그룹에 병합 or 새 그룹)
   *   - 핵심: 그룹이 3개 이상 생성되면 안 됨 (복제 금지)
   *   - guard 가 queueMicrotask 로 해제되므로 정상 연속 드래그는 차단 안 됨
   *
   * 수정 전 RED 이유:
   *   re-entrancy guard 부재 + listener 중복 시 타일 2회 드래그로 3~18개 그룹 생성 가능
   */
  test("TC-009-02: 연속 드래그 2회 시 그룹은 최대 2개 (복제 금지)", async ({
    page,
  }) => {
    await goToStage(page, 1);

    // R7a → 보드 (그룹 1개)
    await dragTileToBoard(page, "R7a");
    await expect(boardGroupCount(page)).toHaveCount(1, { timeout: 3000 });

    // "+ 새 그룹" 버튼 클릭하여 다음 타일은 새 그룹으로 강제
    await page.getByLabel("다음 드롭 시 새 그룹 생성").click();
    await page.waitForTimeout(100);

    // B5a → 새 그룹 (숫자 다름)
    await dragTileToBoard(page, "B5a");

    // 그룹 수 ≤ 2 (복제 없음) — 정확히 2개여야 정상
    const count = await boardGroupCount(page).count();
    expect(count).toBeLessThanOrEqual(2);
    expect(count).toBeGreaterThanOrEqual(1);
  });

  /**
   * TC-009-03: "새 그룹" 버튼 후 빠른 드래그 → 그룹 수가 2개 이하
   *
   * Stage 5 핸드 (14장) 에서 R8a + B4a 두 드래그 후 최대 2개 그룹
   * re-entrancy guard microtask 해제 타이밍 검증 — 3개 이상이면 버그
   */
  test("TC-009-03: 빠른 연속 드래그 시 그룹 수가 드래그 횟수 이하", async ({
    page,
  }) => {
    await goToStage(page, 5);

    // R8a → 보드 (그룹 1개)
    await dragTileToBoard(page, "R8a");
    await page.waitForTimeout(100);

    // 새 그룹 강제 후 B4a 드래그
    await page.getByLabel("다음 드롭 시 새 그룹 생성").click();
    await page.waitForTimeout(50);
    await dragTileToBoard(page, "B4a");

    // 2회 드래그 → 그룹 수 최대 2개 (3개 이상이면 복제 버그)
    const count = await boardGroupCount(page).count();
    expect(count).toBeLessThanOrEqual(2);
    expect(count).toBeGreaterThanOrEqual(1);
  });
});

// ------------------------------------------------------------------
// BUG-UI-010: 드래그 취소 후 타일 stuck 방지
// ------------------------------------------------------------------

test.describe("BUG-UI-010: 드래그 취소 후 타일 stuck 방지", () => {
  /**
   * TC-010-01: 드래그 중 Escape 키 → activeId 초기화 + 랙 타일 복귀
   *
   * dnd-kit PointerSensor 에서 ESC 키 입력 시 onDragCancel 호출됨.
   * 현재 코드(수정 전): onDragCancel 핸들러 없음 → activeDragCode 잔존 → stuck
   *
   * 수정 후 기대:
   *   - ESC 후 랙에 타일 그대로 존재
   *   - 보드에 그룹 추가 없음
   *   - 다음 드래그 정상 동작
   */
  test("TC-010-01: 드래그 시작 후 Escape → 타일 랙 복귀, 보드 변화 없음", async ({
    page,
  }) => {
    await goToStage(page, 1);

    const rackTile = page.locator('[aria-label="R7a 타일 (드래그 가능)"]').first();
    await rackTile.waitFor({ state: "visible", timeout: 5000 });

    const srcBox = await rackTile.boundingBox();
    if (!srcBox) throw new Error("rackTile boundingBox not found");

    const sx = srcBox.x + srcBox.width / 2;
    const sy = srcBox.y + srcBox.height / 2;

    // 드래그 시작 (activation constraint 8px 초과)
    await page.mouse.move(sx, sy);
    await page.mouse.down();
    await page.mouse.move(sx + 3, sy, { steps: 2 });
    await page.mouse.move(sx + 20, sy, { steps: 5 });
    await page.waitForTimeout(100);

    // ESC 키 — dnd-kit 이 onDragCancel 을 호출해야 함
    await page.keyboard.press("Escape");
    await page.mouse.up();
    await page.waitForTimeout(300);

    // 보드 그룹 없음 (드래그 취소됐으므로)
    await expect(boardGroupCount(page)).toHaveCount(0, { timeout: 3000 });

    // 랙에 R7a 여전히 존재 (stuck 아닌 정상 복귀)
    await expect(rackTile).toBeVisible({ timeout: 3000 });
  });

  /**
   * TC-010-02: 드래그 후 보드 외부(빈 영역) 드롭 → 타일 랙 복귀
   *
   * over.id === null 경로 (보드/랙 밖 드롭)에서 activeDragCode 초기화 검증
   * 수정 전: handleDragEnd 의 setActiveDragCode(null) 는 실행되지만
   *          stuck 타일(DragOverlay) 가 잔존하는 시각적 버그 존재
   */
  test("TC-010-02: 보드 외부 드롭 후 재드래그 정상 동작", async ({
    page,
  }) => {
    await goToStage(page, 1);

    const rackTile = page.locator('[aria-label="R7a 타일 (드래그 가능)"]').first();
    await rackTile.waitFor({ state: "visible", timeout: 5000 });

    // 랙 영역 자체로 짧게 드래그 후 드롭 (보드 밖, 같은 랙 위)
    // 이렇게 하면 "player-rack" droppable 로 드롭되어 그룹 추가 없이 종료됨
    const rack = page.locator('[aria-label="내 타일 랙"]');
    const rackBox = await rack.boundingBox();
    if (!rackBox) throw new Error("rack boundingBox not found");

    const srcBox = await rackTile.boundingBox();
    if (!srcBox) throw new Error("rackTile boundingBox not found");

    const sx = srcBox.x + srcBox.width / 2;
    const sy = srcBox.y + srcBox.height / 2;
    // 랙의 다른 위치로 드롭 (같은 랙 내 이동 → 그룹 생성 없음)
    const dx = rackBox.x + rackBox.width - 10;
    const dy = rackBox.y + rackBox.height / 2;

    await page.mouse.move(sx, sy);
    await page.mouse.down();
    await page.mouse.move(sx + 9, sy, { steps: 3 }); // activation constraint 초과
    await page.mouse.move(dx, dy, { steps: 10 }); // 랙 오른쪽 끝 (보드 밖)
    await page.waitForTimeout(150);
    await page.mouse.up();
    await page.waitForTimeout(300);

    // 보드에 그룹 없음 또는 최소 (랙→랙 은 그룹 추가 안 함)
    const countAfterRackDrop = await boardGroupCount(page).count();
    expect(countAfterRackDrop).toBe(0);

    // 재드래그 가능: R7a 다시 보드로 드래그 → 그룹 1개 생성
    await dragTileToBoard(page, "R7a");
    await expect(boardGroupCount(page)).toHaveCount(1, { timeout: 3000 });
  });

  /**
   * TC-010-03: ESC 후 재드래그 → 이전 drag state 오염 없음
   *
   * activeDragSourceRef 잔존 시 다음 드래그의 handleDragEnd 분기가
   * 잘못된 source(table vs rack) 를 보고 오진입하는 문제를 검증
   */
  test("TC-010-03: ESC 후 재드래그 시 올바른 그룹 생성", async ({
    page,
  }) => {
    await goToStage(page, 1);

    const rackTile = page.locator('[aria-label="R7a 타일 (드래그 가능)"]').first();
    await rackTile.waitFor({ state: "visible", timeout: 5000 });

    const srcBox = await rackTile.boundingBox();
    if (!srcBox) throw new Error("rackTile boundingBox not found");

    const sx = srcBox.x + srcBox.width / 2;
    const sy = srcBox.y + srcBox.height / 2;

    // 1차 드래그 → ESC 취소
    await page.mouse.move(sx, sy);
    await page.mouse.down();
    await page.mouse.move(sx + 20, sy, { steps: 5 });
    await page.waitForTimeout(100);
    await page.keyboard.press("Escape");
    await page.mouse.up();
    await page.waitForTimeout(300);

    // 2차 드래그 → 보드에 정상 드롭
    await dragTileToBoard(page, "R7a");

    // 그룹 정확히 1개 (이전 drag state 오염이 없어야 함)
    await expect(boardGroupCount(page)).toHaveCount(1, { timeout: 3000 });
  });
});
