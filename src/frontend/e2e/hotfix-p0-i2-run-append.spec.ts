/**
 * I-2 런 앞/뒤 타일 부착 — I-18 롤백 후 회귀 가드
 *
 * 브랜치: hotfix/frontend-p0-2nd-2026-04-22
 *
 * 배경:
 *   PR #37 에서 `eef2bbc` (I-2 핫픽스) 가 hasInitialMeld=false 상태에서
 *   서버 확정 런에 직접 append 를 허용했다.
 *   3에이전트 수렴(architect + qa + frontend-dev) 결과:
 *     - 서버 V-04 가 append 된 세트를 30점 미달로 거절하고
 *     - 플레이어에게 패널티 3장 드로우를 부과하는 실제 피해를 확인.
 *   따라서 I-18 롤백으로 해당 append 경로를 제거. (commit: I-18 rollback)
 *
 * 수정 후 정확한 동작:
 *   hasInitialMeld=false + 서버 런 드롭 → treatAsBoardDrop 분기 → 새 pending 그룹 생성
 *   (append 금지, 안전하게 분리)
 *
 * 검증:
 *   SC1 — hasInitialMeld=false + Y2 → 서버 run [Y3-Y6] 드롭 → 새 그룹 분리 (append 금지)
 *   SC2 — hasInitialMeld=false + Y7 → 서버 run [Y3-Y6] 드롭 → 새 그룹 분리 (append 금지)
 *   SC3 — 호환 불가 B5 드롭 → 새 그룹 분리 (기존 동작 유지, 회귀 방지)
 *
 * hasInitialMeld=true + 서버 런 append (정상 경로) 는 별도 E2E 가 보장한다.
 * dnd-kit 실제 거동은 Jest 단위 테스트로 커버 안 되므로 Playwright 필수.
 */

import { test, expect, type Page } from "@playwright/test";
import { cleanupViaPage } from "./helpers/room-cleanup";
import {
  createRoomAndStart,
  waitForGameReady,
  waitForStoreReady,
} from "./helpers/game-helpers";
import { dndDrag } from "./helpers";

// ------------------------------------------------------------------
// 공통 셋업: 서버 run [Y3 Y4 Y5 Y6] + rack, hasInitialMeld=false
// ------------------------------------------------------------------

async function setupRunAppendScenario(
  page: Page,
  myTiles: string[]
): Promise<void> {
  await waitForStoreReady(page);

  await page.evaluate((args) => {
    const store = (
      window as unknown as Record<
        string,
        {
          getState: () => Record<string, unknown>;
          setState: (s: Record<string, unknown>) => void;
        }
      >
    ).__gameStore;
    if (!store) throw new Error("__gameStore not available");

    const current = store.getState();
    const baseGameState = (current.gameState ?? {}) as Record<string, unknown>;

    store.setState({
      mySeat: 0,
      myTiles: args.myTiles,
      // I-18 회귀 핵심: hasInitialMeld=false 상태에서 서버 런 드롭은 새 그룹으로 분리됨
      hasInitialMeld: false,
      pendingTableGroups: null,
      pendingMyTiles: null,
      pendingGroupIds: new Set<string>(),
      pendingRecoveredJokers: [],
      aiThinkingSeat: null,
      gameState: {
        ...baseGameState,
        currentSeat: 0,
        tableGroups: [
          {
            id: "srv-run-yellow",
            tiles: ["Y3a", "Y4a", "Y5a", "Y6a"],
            type: "run",
          },
        ],
        turnTimeoutSec: 600,
        drawPileCount: 90,
      },
    });
  }, { myTiles });

  await page.waitForTimeout(400);
}

// ==================================================================
// SC1 — hasInitialMeld=false: Y2 드롭 → 서버 run 에 append 금지, 새 그룹 분리
// ==================================================================

test.describe("TC-I2-SC1: hasInitialMeld=false 런 드롭 → 새 그룹 분리", () => {
  test.setTimeout(180_000);

  test.afterEach(async ({ page }) => {
    await cleanupViaPage(page).catch(() => {/* best-effort */});
  });

  test("TC-I2-SC1: rack Y2 → 서버 run [Y3-Y6] 드롭(hasInitialMeld=false) → 새 그룹 분리 (append 금지 — I-18 회귀)", async ({
    page,
  }) => {
    await createRoomAndStart(page, {
      playerCount: 2,
      aiCount: 1,
      turnTimeout: 60,
    });
    await waitForGameReady(page);
    await setupRunAppendScenario(page, ["Y2a", "B8a", "K11a"]);

    // 사전: 서버 run 4장
    await expect(
      page.locator('span[aria-label="4개 타일"]')
    ).toHaveCount(1, { timeout: 5000 });

    // When: Y2 를 run 그룹 영역 내부에 드롭 (closestCenter 가 srv-run-yellow 선택)
    const y2 = page.locator('[aria-label="Y2a 타일 (드래그 가능)"]').first();
    const y3Anchor = page.locator('[aria-label*="Y3a 타일"]').first();
    await expect(y2).toBeVisible({ timeout: 5000 });
    await expect(y3Anchor).toBeVisible({ timeout: 5000 });

    await dndDrag(page, y2, y3Anchor);
    await page.waitForTimeout(500);

    // Then: 서버 run 은 4장 그대로 유지, Y2 는 새 pending 그룹으로 분리
    const result = await page.evaluate(() => {
      const store = (
        window as unknown as Record<
          string,
          { getState: () => Record<string, unknown> }
        >
      ).__gameStore;
      const state = store.getState();
      const pending = state.pendingTableGroups as
        | { id: string; tiles: string[] }[]
        | null;
      const gs = state.gameState as
        | { tableGroups?: { id: string; tiles: string[] }[] }
        | null;
      const groups = pending ?? gs?.tableGroups ?? [];
      const srvRun = groups.find((g) => g.id === "srv-run-yellow");
      const pendingMyTiles = state.pendingMyTiles as string[] | null;
      return {
        groupCount: groups.length,
        srvRunTiles: srvRun?.tiles ?? [],
        y2InRack: (pendingMyTiles ?? state.myTiles as string[]).includes("Y2a"),
        y2InAnyGroup: groups.some((g) => g.tiles.includes("Y2a")),
        srvRunHasY2: (srvRun?.tiles ?? []).includes("Y2a"),
      };
    });

    // I-18 핵심 회귀: 서버 run 에 Y2 가 append 되면 안 됨
    expect(result.srvRunHasY2).toBe(false);
    // 서버 run 은 4장 유지
    expect(result.srvRunTiles.length).toBe(4);
    // Y2 는 랙에서 제거되고 새 pending 그룹에 배치됨
    expect(result.y2InRack).toBe(false);
    expect(result.y2InAnyGroup).toBe(true);
    // 그룹 수 2개 (서버 run + Y2 신규 pending 그룹)
    expect(result.groupCount).toBe(2);
  });
});

// ==================================================================
// SC2 — hasInitialMeld=false: Y7 드롭 → 서버 run 에 append 금지, 새 그룹 분리
// ==================================================================

test.describe("TC-I2-SC2: hasInitialMeld=false 런 뒤쪽 드롭 → 새 그룹 분리", () => {
  test.setTimeout(180_000);

  test.afterEach(async ({ page }) => {
    await cleanupViaPage(page).catch(() => {/* best-effort */});
  });

  test("TC-I2-SC2: rack Y7 → 서버 run [Y3-Y6] 드롭(hasInitialMeld=false) → 새 그룹 분리 (I-18 회귀)", async ({
    page,
  }) => {
    await createRoomAndStart(page, {
      playerCount: 2,
      aiCount: 1,
      turnTimeout: 60,
    });
    await waitForGameReady(page);
    await setupRunAppendScenario(page, ["Y7a", "B8a", "K11a"]);

    await expect(
      page.locator('span[aria-label="4개 타일"]')
    ).toHaveCount(1, { timeout: 5000 });

    // When: Y7 을 run 의 Y6 anchor 에 드롭 (hasInitialMeld=false)
    const y7 = page.locator('[aria-label="Y7a 타일 (드래그 가능)"]').first();
    const y6Anchor = page.locator('[aria-label*="Y6a 타일"]').first();
    await expect(y7).toBeVisible({ timeout: 5000 });
    await expect(y6Anchor).toBeVisible({ timeout: 5000 });

    await dndDrag(page, y7, y6Anchor);
    await page.waitForTimeout(500);

    const result = await page.evaluate(() => {
      const store = (
        window as unknown as Record<
          string,
          { getState: () => Record<string, unknown> }
        >
      ).__gameStore;
      const state = store.getState();
      const pending = state.pendingTableGroups as
        | { id: string; tiles: string[] }[]
        | null;
      const gs = state.gameState as
        | { tableGroups?: { id: string; tiles: string[] }[] }
        | null;
      const groups = pending ?? gs?.tableGroups ?? [];
      const srvRun = groups.find((g) => g.id === "srv-run-yellow");
      return {
        groupCount: groups.length,
        srvRunTiles: srvRun?.tiles ?? [],
        srvRunHasY7: (srvRun?.tiles ?? []).includes("Y7a"),
        y7InAnyGroup: groups.some((g) => g.tiles.includes("Y7a")),
      };
    });

    // I-18 핵심 회귀: 서버 run 에 Y7 이 append 되면 안 됨
    expect(result.srvRunHasY7).toBe(false);
    // 서버 run 은 4장 유지
    expect(result.srvRunTiles.length).toBe(4);
    // Y7 은 새 pending 그룹에 배치
    expect(result.y7InAnyGroup).toBe(true);
    // 그룹 수 2개 (서버 run + Y7 신규 pending 그룹)
    expect(result.groupCount).toBe(2);
  });
});

// ==================================================================
// SC3 — 호환 불가 타일 드롭은 새 그룹 생성으로 폴스루 (기존 동작 유지)
// ==================================================================

test.describe("TC-I2-SC3: 호환 불가 타일 폴스루 (기존 동작 회귀 방지)", () => {
  test.setTimeout(180_000);

  test.afterEach(async ({ page }) => {
    await cleanupViaPage(page).catch(() => {/* best-effort */});
  });

  test("TC-I2-SC3: rack B5 → 서버 run [Y3-Y6] 에 드롭 → 새 그룹 분리 (잡종 생성 금지)", async ({
    page,
  }) => {
    await createRoomAndStart(page, {
      playerCount: 2,
      aiCount: 1,
      turnTimeout: 60,
    });
    await waitForGameReady(page);
    await setupRunAppendScenario(page, ["B5a", "Y10a", "K11a"]);

    await expect(
      page.locator('span[aria-label="4개 타일"]')
    ).toHaveCount(1, { timeout: 5000 });

    // When: B5 (blue 5) 를 Y run 의 가운데 anchor 에 드롭 — 색 불일치로 호환 불가
    const b5 = page.locator('[aria-label="B5a 타일 (드래그 가능)"]').first();
    const y4Anchor = page.locator('[aria-label*="Y4a 타일"]').first();
    await expect(b5).toBeVisible({ timeout: 5000 });
    await expect(y4Anchor).toBeVisible({ timeout: 5000 });

    await dndDrag(page, b5, y4Anchor);
    await page.waitForTimeout(500);

    const result = await page.evaluate(() => {
      const store = (
        window as unknown as Record<
          string,
          { getState: () => Record<string, unknown> }
        >
      ).__gameStore;
      const state = store.getState();
      const pending = state.pendingTableGroups as
        | { id: string; tiles: string[] }[]
        | null;
      const gs = state.gameState as
        | { tableGroups?: { id: string; tiles: string[] }[] }
        | null;
      const groups = pending ?? gs?.tableGroups ?? [];
      const srv = groups.find((g) => g.id === "srv-run-yellow");
      return {
        groupCount: groups.length,
        sizes: groups.map((g) => g.tiles.length).sort(),
        srvTiles: srv?.tiles ?? [],
        b5InSeparateGroup: groups.some(
          (g) => g.id !== "srv-run-yellow" && g.tiles.includes("B5a")
        ),
      };
    });

    // 서버 run 은 4장 [Y3-Y6] 원본 유지 (잡종 생성 금지)
    expect(result.srvTiles.sort()).toEqual(["Y3a", "Y4a", "Y5a", "Y6a"].sort());
    // B5 는 새 pending 그룹에 분리
    expect(result.b5InSeparateGroup).toBe(true);
    // 그룹 수 2개 (원본 run + B5 단독)
    expect(result.groupCount).toBe(2);
    expect(result.sizes).toEqual([1, 4]);

    // UI: 4타일 그룹 1개 유지, 5타일 그룹 없음 (흡수되지 않음)
    await expect(
      page.locator('span[aria-label="5개 타일"]')
    ).toHaveCount(0, { timeout: 2000 });
    await expect(
      page.locator('span[aria-label="4개 타일"]')
    ).toHaveCount(1, { timeout: 2000 });
  });
});
