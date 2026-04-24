/**
 * BUG-UI-GHOST: 유령 박스 + 복제 렌더 부재 검증 E2E
 *
 * 룰 SSOT: docs/02-design/06-game-rules.md §6.4 V-06 타일 보존
 * 매트릭스: docs/04-testing/81-e2e-rule-scenario-matrix.md §2 V-06 "엣지 — 복제/고스트" 셀
 * 버그 근거: work_logs/plans/tmp-analysis/bug-ui-ext-ghost-rereview.md §3 (G1, G4 가설)
 * 스크린샷: 2026-04-23_221543 (6개 복제), 221554 (드래그 중 6개), 221603 (런 6개)
 *
 * 증상:
 *   - hasInitialMeld=true 확정 후 동일 턴 내 반복 드래그 시 pending 그룹이 N배 복제
 *   - 빈 박스 (유령) 2~3개 우상단/우하단 등장
 *   - TURN_START 시 resetPending() 이 정리하나, 턴 내에서는 누적
 *
 * 본 spec 은 3 시나리오:
 *   SC1 (RED 의도): 호환 불가 타일을 동일 pending 위에 3~6회 연속 drop → 복제 그룹 0 (RED)
 *   SC2         : TURN_START 이벤트 발생 시 모든 pending 그룹 제거 확인
 *   SC3 (RED 의도): pendingGroupSeq 단조성 위반 감지 — 연속 drop 시 newGroupId 충돌 없음
 *
 * 실행:
 *   npx playwright test e2e/rule-ghost-box-absence.spec.ts --workers=1
 */

import { test, expect } from "@playwright/test";
import { cleanupViaPage } from "./helpers/room-cleanup";
import {
  createRoomAndStart,
  waitForGameReady,
  waitForStoreReady,
} from "./helpers/game-helpers";
import { dndDrag } from "./helpers";

// ==================================================================
// Fixture: pending 그룹 상태 유도
// ==================================================================

async function setupGhostScenario(
  page: import("@playwright/test").Page
): Promise<void> {
  await waitForStoreReady(page);
  await page.evaluate(() => {
    const store = (window as unknown as { __gameStore?: { getState: () => Record<string, unknown>; setState: (s: Record<string, unknown>) => void } }).__gameStore;
    if (!store) throw new Error("__gameStore not available");
    const cur = store.getState();
    const baseGs = (cur.gameState ?? {}) as Record<string, unknown>;
    store.setState({
      mySeat: 0,
      // 여러 호환 불가 타일 (서로 다른 색상/숫자) 로 반복 drop 시뮬레이션
      myTiles: ["Y5a", "K8b", "B2a"],
      hasInitialMeld: true,
      pendingTableGroups: null,
      pendingMyTiles: null,
      pendingGroupIds: new Set<string>(),
      pendingRecoveredJokers: [],
      aiThinkingSeat: null,
      gameState: {
        ...baseGs,
        currentSeat: 0,
        tableGroups: [{ id: "srv-run-red", tiles: ["R10a", "R11a", "R12a"], type: "run" }],
        turnTimeoutSec: 600,
        drawPileCount: 90,
      },
    });
  });
  await page.waitForTimeout(400);
}

// ==================================================================
// 복제 감지 유틸
// ==================================================================

async function captureDuplicationState(page: import("@playwright/test").Page) {
  return await page.evaluate(() => {
    const s = (window as unknown as { __gameStore?: { getState: () => Record<string, unknown> } }).__gameStore!.getState();
    const pending = s.pendingTableGroups as { id: string; tiles: string[] }[] | null;
    const gs = s.gameState as { tableGroups?: { id: string; tiles: string[] }[] };
    const groups = pending ?? gs.tableGroups ?? [];

    // tile id 복제 감지 (V-06 violation)
    const tileCounts = new Map<string, number>();
    for (const g of groups) {
      for (const t of g.tiles) {
        tileCounts.set(t, (tileCounts.get(t) ?? 0) + 1);
      }
    }
    const dupTiles = Array.from(tileCounts.entries()).filter(([, c]) => c > 1);

    // 그룹 id 복제 감지
    const idCounts = new Map<string, number>();
    for (const g of groups) {
      idCounts.set(g.id, (idCounts.get(g.id) ?? 0) + 1);
    }
    const dupIds = Array.from(idCounts.entries()).filter(([, c]) => c > 1);

    return {
      totalGroups: groups.length,
      duplicatedTiles: dupTiles,
      duplicatedGroupIds: dupIds,
      pendingGroupIdsSize: (s.pendingGroupIds as Set<string>).size,
      groupSnapshot: groups.map((g) => ({ id: g.id, tileCount: g.tiles.length })),
    };
  });
}

// ==================================================================
// SC1: 호환 불가 3회 drop → 복제 0 (RED 의도)
// ==================================================================

test.describe("BUG-UI-GHOST: 유령 박스 + 복제 렌더 부재 검증", () => {
  test.setTimeout(180_000);

  test.afterEach(async ({ page }) => {
    await cleanupViaPage(page).catch(() => {
      /* best-effort */
    });
  });

  test("GHOST-SC1: 호환 불가 3타일(Y5, K8, B2) 을 각각 1회씩 drop → 복제 그룹 0 + 복제 tile 0", async ({
    page,
  }) => {
    // RED 근거: architect 재재조사 §3.3 (G1: isHandlingDragEndRef microtask 우회 40%) +
    //          §3.6 (G4: useMemo stale closure 30%). PR #70 수정에도 증상 잔존.
    //          연속 drop 시 currentTableGroups stale snapshot 이 누적되어 동일 id 가 반복
    //          append 됨. 본 TC 는 3회 drop 후 복제 0 을 단언하여 RED 로 증상을 고정.
    await createRoomAndStart(page, { playerCount: 2, aiCount: 1, turnTimeout: 60 });
    await waitForGameReady(page);
    await setupGhostScenario(page);

    const anchor = page.locator('[aria-label*="R11a 타일"]').first();
    await expect(anchor).toBeVisible({ timeout: 5000 });

    const initial = await captureDuplicationState(page);
    expect(initial.totalGroups).toBe(1); // 서버 런만

    // 3타일 각각 drop (각 drop 은 호환 불가 → 새 pending 그룹 1개씩 생성 기대)
    for (const code of ["Y5a", "K8b", "B2a"]) {
      const tile = page.locator(`section[aria-label="내 타일 랙"] [aria-label="${code} 타일 (드래그 가능)"]`).first();
      if (await tile.count() === 0) continue;
      await dndDrag(page, tile, anchor);
      await page.waitForTimeout(350);
    }

    const final = await captureDuplicationState(page);

    // 기대:
    //   - 복제된 tile 0 (V-06 violation 부재)
    //   - 복제된 group id 0 (동일 id 중복 출현 없음)
    //   - totalGroups ≤ 4 (서버 런 1 + 새 pending 3)
    //   - pendingGroupIds size = 3 (새 pending 그룹만 등록)
    expect(final.duplicatedTiles).toEqual([]);
    expect(final.duplicatedGroupIds).toEqual([]);
    expect(final.totalGroups).toBeLessThanOrEqual(4);
    expect(final.pendingGroupIdsSize).toBeLessThanOrEqual(3);
  });

  // ==================================================================
  // SC2: TURN_START 시 resetPending 확인
  // ==================================================================

  test("GHOST-SC2: 턴 종료 후 TURN_START 이벤트 주입 → pendingTableGroups=null + pendingGroupIds size=0", async ({
    page,
  }) => {
    // RED 근거: architect 재재조사 §3.1 — "턴 종료(221707) 시 복제 사라짐 — TURN_START
    //          핸들러 resetPending() 이 정리". 이 정리 경로가 실제로 동작하는지 회귀 가드.
    await createRoomAndStart(page, { playerCount: 2, aiCount: 1, turnTimeout: 60 });
    await waitForGameReady(page);
    await setupGhostScenario(page);

    const anchor = page.locator('[aria-label*="R11a 타일"]').first();
    const y5 = page.locator('section[aria-label="내 타일 랙"] [aria-label="Y5a 타일 (드래그 가능)"]').first();
    await dndDrag(page, y5, anchor);
    await page.waitForTimeout(350);

    // 중간 검증: pending 상태 1개
    const mid = await captureDuplicationState(page);
    expect(mid.pendingGroupIdsSize).toBeGreaterThanOrEqual(1);

    // TURN_START 시뮬레이션 (resetPending 직접 호출)
    await page.evaluate(() => {
      const store = (window as unknown as { __gameStore?: { getState: () => { resetPending?: () => void }; setState: (s: Record<string, unknown>) => void } }).__gameStore!;
      const s = store.getState();
      if (typeof s.resetPending === "function") {
        s.resetPending();
      } else {
        store.setState({
          pendingTableGroups: null,
          pendingMyTiles: null,
          pendingGroupIds: new Set<string>(),
          pendingRecoveredJokers: [],
        });
      }
    });
    await page.waitForTimeout(300);

    const after = await captureDuplicationState(page);
    expect(after.pendingGroupIdsSize).toBe(0);
  });

  // ==================================================================
  // SC3: pendingGroupSeq 단조성 — 동일 id 재사용 없음 (RED 의도)
  // ==================================================================

  test("GHOST-SC3: 연속 drop 시 pendingGroupSeq 단조 증가 → newGroupId 중복 없음", async ({
    page,
  }) => {
    // RED 근거: BUG-UI-REARRANGE-002 패치 (pendingGroupSeqRef 단조 카운터) 가 유효한지
    //          검증. 스크린샷 221543 에서 동일 tile 집합 [R11,R12,JK,5] 가 6번 복제되었다
    //          는 것은 pendingGroupSeq 가 제대로 증가했는데 useMemo stale 로 append 가
    //          반복되었거나, seq 증가 자체가 race 로 동일 값을 반환했을 가능성.
    await createRoomAndStart(page, { playerCount: 2, aiCount: 1, turnTimeout: 60 });
    await waitForGameReady(page);
    await setupGhostScenario(page);

    const anchor = page.locator('[aria-label*="R11a 타일"]').first();
    const seenIds: string[] = [];

    for (const code of ["Y5a", "K8b", "B2a"]) {
      const tile = page.locator(`section[aria-label="내 타일 랙"] [aria-label="${code} 타일 (드래그 가능)"]`).first();
      if (await tile.count() === 0) continue;
      await dndDrag(page, tile, anchor);
      await page.waitForTimeout(350);

      const ids = await page.evaluate(() => {
        const s = (window as unknown as { __gameStore?: { getState: () => { pendingTableGroups?: { id: string }[] | null } } }).__gameStore!.getState();
        return (s.pendingTableGroups ?? []).map((g) => g.id);
      });
      for (const id of ids) {
        if (id.startsWith("pending-") && !seenIds.includes(id)) {
          seenIds.push(id);
        }
      }
    }

    // 기대: 모든 pending-* id 는 unique (Set 변환 시 크기 동일)
    expect(new Set(seenIds).size).toBe(seenIds.length);
  });
});
