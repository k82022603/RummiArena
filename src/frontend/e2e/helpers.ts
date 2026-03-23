/**
 * Playwright E2E 헬퍼 유틸리티
 *
 * dnd-kit은 PointerSensor를 사용하므로 HTML5 drag API가 아닌
 * mouse 포인터 이벤트를 시뮬레이션해야 한다.
 * activation constraint: distance=8px → 8픽셀 이상 이동 후 드래그 활성화
 */

import type { Locator, Page } from "@playwright/test";

// ------------------------------------------------------------------
// dnd-kit 드래그 시뮬레이션
// ------------------------------------------------------------------

/**
 * 두 로케이터 사이의 dnd-kit 드래그를 시뮬레이션한다.
 * - pointerdown → 8px 초과 이동(활성화) → 목적지 이동 → pointerup
 */
export async function dndDrag(
  page: Page,
  src: Locator,
  dst: Locator
): Promise<void> {
  const srcBox = await src.boundingBox();
  const dstBox = await dst.boundingBox();
  if (!srcBox || !dstBox) throw new Error("boundingBox not found for drag");

  const sx = srcBox.x + srcBox.width / 2;
  const sy = srcBox.y + srcBox.height / 2;
  const dx = dstBox.x + dstBox.width / 2;
  const dy = dstBox.y + dstBox.height / 2;

  await page.mouse.move(sx, sy);
  await page.mouse.down();
  // activation constraint(8px) 초과를 위해 점진적으로 이동
  await page.mouse.move(sx + 3, sy, { steps: 2 });
  await page.mouse.move(sx + 9, sy, { steps: 2 });
  // 목적지로 이동
  await page.mouse.move(dx, dy, { steps: 20 });
  await page.waitForTimeout(60);
  await page.mouse.up();
  await page.waitForTimeout(150);
}

// ------------------------------------------------------------------
// 연습 모드 전용 헬퍼
// ------------------------------------------------------------------

/** 튜토리얼 오버레이를 "시작하기" 버튼으로 닫는다 */
export async function dismissTutorial(page: Page): Promise<void> {
  await page.locator('button:has-text("시작하기")').click();
  await page.waitForTimeout(300);
}

/** 연습 스테이지 페이지로 이동 + 튜토리얼 dismiss */
export async function goToStage(page: Page, stageNum: number): Promise<void> {
  await page.goto(`/practice/${stageNum}`);
  await dismissTutorial(page);
}

/**
 * 랙에서 타일 코드 기준으로 게임 보드에 드래그한다.
 * DraggableTile 의 aria-label = "${code} 타일 (드래그 가능)"
 */
export async function dragTileToBoard(
  page: Page,
  tileCode: string
): Promise<void> {
  const tile = page
    .locator(`[aria-label="${tileCode} 타일 (드래그 가능)"]`)
    .first();
  const board = page.locator('section[aria-label="게임 테이블"]');
  await dndDrag(page, tile, board);
}

/** 여러 타일을 순서대로 보드에 드래그 (모두 마지막 그룹에 추가됨) */
export async function dragTilesToBoard(
  page: Page,
  tileCodes: string[]
): Promise<void> {
  for (const code of tileCodes) {
    await dragTileToBoard(page, code);
  }
}

/** "+ 새 그룹" 버튼 클릭 → 다음 드롭 시 새 그룹 생성 */
export async function clickNewGroup(page: Page): Promise<void> {
  await page.getByLabel("다음 드롭 시 새 그룹 생성").click();
  await page.waitForTimeout(100);
}

/** 초기화 버튼 클릭 */
export async function resetBoard(page: Page): Promise<void> {
  await page.getByLabel("타일 배치 초기화").click();
  await page.waitForTimeout(150);
}
