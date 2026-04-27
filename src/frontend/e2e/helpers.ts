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
 *
 * 타이밍 강화 (2026-04-27, V04-SC1/SC3 fix):
 *   - activation step 3단계 → 확실한 PointerSensor distance 충족
 *   - 목적지 이동 steps: 20 → 40 (dnd-kit collisions 계산 충분 시간 확보)
 *   - mouse.up() 전 대기: 200ms → 300ms (React 리렌더링 대기)
 *   - mouse.up() 후 대기: 300ms → 500ms (onDragEnd + setState 완료 대기)
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
  // activation constraint(8px) 초과를 위해 3단계로 점진 이동
  await page.mouse.move(sx + 2, sy, { steps: 2 });
  await page.mouse.move(sx + 6, sy, { steps: 3 });
  await page.mouse.move(sx + 12, sy, { steps: 3 });
  // 목적지로 충분히 부드럽게 이동 (steps 증가 → collision 감지 안정화)
  await page.mouse.move(dx, dy, { steps: 40 });
  await page.waitForTimeout(300);
  await page.mouse.up();
  await page.waitForTimeout(500);
}

// ------------------------------------------------------------------
// 연습 모드 전용 헬퍼
// ------------------------------------------------------------------

/** 튜토리얼 오버레이를 "시작하기" 버튼으로 닫는다 */
export async function dismissTutorial(page: Page): Promise<void> {
  await page.locator('button:has-text("시작하기")').click();
  await page.waitForTimeout(300);
}

/** 연습 스테이지 페이지로 이동 + 튜토리얼 dismiss + DnD 준비 대기 */
export async function goToStage(page: Page, stageNum: number): Promise<void> {
  await page.goto(`/practice/${stageNum}`);
  await page.waitForLoadState("domcontentloaded");
  await dismissTutorial(page);
  // dnd-kit 센서가 마운트될 때까지 타일 랙 렌더링 대기
  await page.locator('[aria-label="내 타일 랙"]').waitFor({ state: "visible", timeout: 5000 });
  await page.waitForTimeout(200);
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
  // 타일이 실제로 DOM에 렌더링될 때까지 대기
  await tile.waitFor({ state: "visible", timeout: 5000 });
  const board = page.locator('section[aria-label="게임 테이블"]');
  await board.waitFor({ state: "visible", timeout: 5000 });
  await dndDrag(page, tile, board);
}

/** 여러 타일을 순서대로 보드에 드래그 (모두 마지막 그룹에 추가됨) */
export async function dragTilesToBoard(
  page: Page,
  tileCodes: string[]
): Promise<void> {
  for (const code of tileCodes) {
    await dragTileToBoard(page, code);
    // 각 타일 드래그 사이 안정화 대기 (React 렌더링 + dnd-kit 상태 반영)
    await page.waitForTimeout(150);
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
