/**
 * BUG-UI-013 재현 스펙 — 손패 카운트 요동
 *
 * 배경: 2026-04-23 22:04:18 / 22:07:33 스크린샷.
 * 손패 하단에 표시되는 타일 수("16장") 가 16 → 19 → 18 → 21 로 요동하며
 * 실제 렌더된 타일 갯수와 불일치. 드로우/드래그 연속 시 재현.
 *
 * 근본 원인 가설 (architect 리뷰):
 * 1. `tiles.length` vs `tiles.filter(t => !t.pending).length` 구분 누락
 * 2. 드로우 애니메이션 state 가 실제 store state 와 격리 안 됨 (중복 병합)
 * 3. drag preview 가 손패 카운트 계산에 포함됨
 *
 * 본 스펙은 Phase 2 frontend-dev 수정 전 **RED 확정** 용도.
 *
 * GREEN 만드는 방법:
 *   1. `src/frontend/src/components/game/PlayerRack.tsx` 카운트 selector
 *      → `selectMyTileCount` (gameStore) 단일 source 사용
 *   2. drag preview 로 떠있는 타일은 아직 rack state 에 포함되므로 필터 불필요
 *      단, pending(드로우 애니메이션 중인 타일) 은 제외 필터 필수
 *   3. `tiles.length` 를 직접 쓰는 곳 grep → selector 로 치환
 *
 * 참조:
 *   - work_logs/plans/2026-04-24-sprint7-ui-bug-triage-plan.md §3.1 BUG-UI-013
 *   - d:\Users\KTDS\Pictures\FastStone\2026-04-23_220418.png (16→19)
 *   - d:\Users\KTDS\Pictures\FastStone\2026-04-23_220733.png (21장 불일치)
 */

import { test, expect, type Page } from "@playwright/test";
import {
  createRoomAndStart,
  waitForGameReady,
  waitForStoreReady,
  getRackTileCodes,
} from "./helpers/game-helpers";
import { cleanupViaPage } from "./helpers/room-cleanup";

/**
 * 화면에 표시된 손패 카운트 숫자를 추출.
 * PlayerRack 근처의 "N장" 또는 "N" 표기를 찾는다.
 */
async function readDisplayedTileCount(page: Page): Promise<number | null> {
  // 1. aria-label 내 카운트 (예: "내 타일 랙 (16장)")
  const rackLabel = await page
    .locator('section[aria-label*="내 타일 랙"]')
    .first()
    .getAttribute("aria-label");

  if (rackLabel) {
    const m = rackLabel.match(/(\d+)\s*장/);
    if (m) return parseInt(m[1], 10);
  }

  // 2. data-testid="hand-count" or "tile-count" 탐색
  for (const testid of ["hand-count", "tile-count", "rack-count"]) {
    const el = page.locator(`[data-testid="${testid}"]`);
    if ((await el.count()) > 0) {
      const txt = (await el.first().innerText()).trim();
      const m = txt.match(/(\d+)/);
      if (m) return parseInt(m[1], 10);
    }
  }

  // 3. PlayerRack 섹션 내부 "N장" 텍스트 매칭
  const rackSection = page.locator('section[aria-label*="내 타일 랙"]');
  if ((await rackSection.count()) > 0) {
    const text = await rackSection.first().innerText();
    const m = text.match(/(\d+)\s*장/);
    if (m) return parseInt(m[1], 10);
  }

  return null;
}

test.describe("BUG-UI-013: 손패 카운트 ↔ 실제 타일 수 일치", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/lobby");
    await page.waitForLoadState("domcontentloaded");
    await cleanupViaPage(page);
  });

  test("T13-01 [RED] 게임 시작 직후 손패 카운트 = 렌더 타일 수", async ({
    page,
  }) => {
    // given: 게임 시작 (초기 14장)
    await createRoomAndStart(page, { playerCount: 2, aiCount: 1 });
    await waitForGameReady(page);
    await waitForStoreReady(page);

    // 상태 안정화 대기
    await page.waitForTimeout(500);

    // when: 손패 카운트와 실제 타일 갯수 비교
    const displayedCount = await readDisplayedTileCount(page);
    const actualCodes = await getRackTileCodes(page);

    // then: 일치
    expect(
      displayedCount,
      "displayedCount 를 읽을 수 없음 — aria-label 또는 data-testid 누락"
    ).not.toBeNull();

    // RED 확정 포인트: 실제 환경에서는 drift 발생
    expect(
      displayedCount,
      `표시 카운트(${displayedCount}) ≠ 실제 타일 수(${actualCodes.length}). drift 감지.`
    ).toBe(actualCodes.length);
  });

  test("T13-02 [RED] 드래그 preview 중에도 카운트 drift 없음", async ({
    page,
  }) => {
    await createRoomAndStart(page, { playerCount: 2, aiCount: 1 });
    await waitForGameReady(page);
    await waitForStoreReady(page);
    await page.waitForTimeout(500);

    // when: 랙의 첫 타일을 보드로 드래그 시작 (활성화 constraint 8px 초과)
    const firstTile = page
      .locator('section[aria-label="내 타일 랙"] [aria-label*="타일 (드래그 가능)"]')
      .first();
    await firstTile.waitFor({ state: "visible", timeout: 5_000 });

    const box = await firstTile.boundingBox();
    if (box) {
      const sx = box.x + box.width / 2;
      const sy = box.y + box.height / 2;
      await page.mouse.move(sx, sy);
      await page.mouse.down();
      // 활성화
      await page.mouse.move(sx + 12, sy, { steps: 3 });
      // drag preview 상태에서 100ms 유지 (카운트 재계산 유발)
      await page.waitForTimeout(100);

      // then: 드래그 중에도 카운트 = 랙 렌더 수
      const displayedCount = await readDisplayedTileCount(page);
      const actualCodes = await getRackTileCodes(page);

      // 드롭 전 cleanup
      await page.mouse.up();

      expect(
        displayedCount,
        `drag preview 중 drift — 표시(${displayedCount}) vs 실제(${actualCodes.length})`
      ).toBe(actualCodes.length);
    }
  });

  test("T13-03 [RED] setStoreState 시뮬레이션 — 16/19/18/21 요동 재현", async ({
    page,
  }) => {
    await createRoomAndStart(page, { playerCount: 2, aiCount: 1 });
    await waitForGameReady(page);
    await waitForStoreReady(page);

    // 사용자 스크린샷(22:04:18, 22:07:33) 타일 수 변화 재현
    // 매 상태 변경 후 표시값 = 실제 랙 타일 수 유지 확인
    const mockTileCounts = [16, 19, 18, 21];

    for (const count of mockTileCounts) {
      // 랙 타일 배열을 count 만큼 강제 생성
      const mockTiles = Array.from({ length: count }, (_, i) => ({
        code: `R${((i % 13) + 1)}a`,
        color: "R",
        number: (i % 13) + 1,
        setId: "a",
      }));

      await page.evaluate((tiles) => {
        const store = (window as unknown as {
          __gameStore?: {
            setState: (s: Record<string, unknown>) => void;
          };
        }).__gameStore;
        if (store) {
          store.setState({ rack: { tiles } });
        }
      }, mockTiles);

      await page.waitForTimeout(300);

      const displayed = await readDisplayedTileCount(page);
      const actual = await getRackTileCodes(page);

      expect(
        displayed,
        `count=${count} 시뮬레이션에서 drift — 표시(${displayed}) vs 실제(${actual.length})`
      ).toBe(actual.length);
    }
  });
});
