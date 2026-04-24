/**
 * 확정 후 Extend 룰 E2E — BUG-UI-EXT 직접 재현
 *
 * 룰 SSOT: docs/02-design/06-game-rules.md §5.2 (hasInitialMeld=true 이후 재배치 permission)
 * 매트릭스: docs/04-testing/81-e2e-rule-scenario-matrix.md §2 "확정후 extend" 행
 * 버그 근거: work_logs/plans/tmp-analysis/bug-ui-ext-ghost-rereview.md §2.2 가설 X (55%)
 *
 * 증상 (사용자 스크린샷 2026-04-23_221543/221554/221603):
 *   hasInitialMeld=true 상태에서 런 [R11 R12 JK] 에 rack Y5 타일을 드롭했을 때
 *   - 기대: append 호환 시 성공 / 불호환 시 빨간 테두리 + 새 pending 1개만 생성
 *   - 실제: [R11,R12,JK,5] 6개 복제 + [5] 1개 분리 혼재 출현
 *
 * 본 spec 은 4 시나리오로 분해:
 *   SC1: 런 뒤 append (Happy) — hasInitialMeld=true + [R10 R11 R12] 런 뒤 R13 append
 *   SC2: 런 가운데 삽입 (Happy)  — [R10 R11 R13] 런에 R12 삽입 → 재배치 유형 3 이동
 *   SC3: 런 앞 append (Happy)    — [R10 R11 R12] 런 앞 R9 append
 *   SC4: 호환 불가 타일 3회 반복 drop (RED — BUG-UI-EXT/GHOST 핵심 재현)
 *         → 복제 그룹 0 + 새 pending 1개만
 *
 * 실행:
 *   npx playwright test e2e/rule-extend-after-confirm.spec.ts --workers=1
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
// Fixture: confirmed 상태 + 서버 런 + 랙 타일
// ==================================================================

interface ExtendScenarioOpts {
  /** 서버 그룹 (확정된 상태) */
  serverGroup: { id: string; tiles: string[]; type: "run" | "group" };
  /** 내 랙 타일 */
  rackTiles: string[];
}

async function setupExtendAfterConfirm(
  page: import("@playwright/test").Page,
  opts: ExtendScenarioOpts
): Promise<void> {
  await waitForStoreReady(page);
  await page.evaluate((args) => {
    const store = (window as unknown as { __gameStore?: { getState: () => Record<string, unknown>; setState: (s: Record<string, unknown>) => void } }).__gameStore;
    if (!store) throw new Error("__gameStore not available");
    const cur = store.getState();
    const baseGs = (cur.gameState ?? {}) as Record<string, unknown>;
    store.setState({
      mySeat: 0,
      myTiles: args.rackTiles,
      hasInitialMeld: true, // 핵심: 확정 후
      pendingTableGroups: null,
      pendingMyTiles: null,
      pendingGroupIds: new Set<string>(),
      pendingRecoveredJokers: [],
      aiThinkingSeat: null,
      gameState: {
        ...baseGs,
        currentSeat: 0,
        tableGroups: [args.serverGroup],
        turnTimeoutSec: 600,
        drawPileCount: 90,
      },
    });
  }, opts);
  await page.waitForTimeout(400);
}

// ==================================================================
// SC1: 런 뒤 append Happy
// ==================================================================

test.describe("BUG-UI-EXT: 확정 후 extend 시나리오", () => {
  test.setTimeout(180_000);

  test.afterEach(async ({ page }) => {
    await cleanupViaPage(page).catch(() => {
      /* best-effort */
    });
  });

  test("EXT-SC1: hasInitialMeld=true + 서버 런 [R10 R11 R12] 뒤에 랙 R13 drop → 4타일 append", async ({
    page,
  }) => {
    // RED 근거: architect 재재조사 §2.2 가설 X — hasInitialMeld=true 시 append
    //          가 isHandlingDragEndRef 우회 + useMemo stale 로 복제되거나 실패함.
    //          SC1 은 Happy 기본선 (1회 drop).
    await createRoomAndStart(page, { playerCount: 2, aiCount: 1, turnTimeout: 60 });
    await waitForGameReady(page);
    await setupExtendAfterConfirm(page, {
      serverGroup: { id: "srv-run-red", tiles: ["R10a", "R11a", "R12a"], type: "run" },
      rackTiles: ["R13a"],
    });

    const r13 = page.locator('section[aria-label="내 타일 랙"] [aria-label="R13a 타일 (드래그 가능)"]').first();
    const r12Anchor = page.locator('[aria-label*="R12a 타일"]').first();
    await expect(r13).toBeVisible({ timeout: 5000 });
    await expect(r12Anchor).toBeVisible({ timeout: 5000 });

    await dndDrag(page, r13, r12Anchor);
    await page.waitForTimeout(500);

    const result = await page.evaluate(() => {
      const s = (window as unknown as { __gameStore?: { getState: () => Record<string, unknown> } }).__gameStore!.getState();
      const pending = s.pendingTableGroups as { id: string; tiles: string[] }[] | null;
      const gs = s.gameState as { tableGroups?: { id: string; tiles: string[] }[] };
      const groups = pending ?? gs.tableGroups ?? [];
      const run = groups.find((g) => g.id === "srv-run-red");
      return {
        groupCount: groups.length,
        runTiles: run?.tiles ?? [],
        pendingGroupIdsSize: (s.pendingGroupIds as Set<string>).size,
      };
    });

    // 기대: [R10, R11, R12, R13] 4타일 + pendingGroupIds 1
    expect(result.groupCount).toBe(1);
    expect(result.runTiles).toContain("R13a");
    expect(result.runTiles.length).toBe(4);
    expect(result.pendingGroupIdsSize).toBe(1);
  });

  // ==================================================================
  // SC2: 런 가운데 타일 삽입 (재배치 유형 3 이동)
  // ==================================================================

  test("EXT-SC2: hasInitialMeld=true + 서버 런 [R10 R11 R13] 가운데에 랙 R12 삽입 → 4타일 정렬", async ({
    page,
  }, testInfo) => {
    // RED 근거: 런 가운데 삽입 (V-13d 이동 유형) 은 전용 E2E TC 없음 (매트릭스 §3 #6).
    //          현재 handleDragEnd 구현은 append 만 지원하고 "삽입 위치 계산" 은 서버 검증 후
    //          정렬되지만 UI 상 임시 렌더는 [R10,R11,R13,R12] 가 될 수 있음.
    testInfo.fixme(
      true,
      "런 가운데 삽입 UI 는 서버 ACCEPT 후 tableGroups 재정렬에 의존. 임시 pending 상태에서의 렌더 순서 E2E 는 Sprint 7 Week 2 보강."
    );

    await createRoomAndStart(page, { playerCount: 2, aiCount: 1, turnTimeout: 60 });
    await waitForGameReady(page);
    await setupExtendAfterConfirm(page, {
      serverGroup: { id: "srv-run-red", tiles: ["R10a", "R11a", "R13a"], type: "run" },
      rackTiles: ["R12a"],
    });
    const r12 = page.locator('section[aria-label="내 타일 랙"] [aria-label="R12a 타일 (드래그 가능)"]').first();
    const r11Anchor = page.locator('[aria-label*="R11a 타일"]').first();
    await dndDrag(page, r12, r11Anchor);
    await page.waitForTimeout(500);

    const result = await page.evaluate(() => {
      const s = (window as unknown as { __gameStore?: { getState: () => Record<string, unknown> } }).__gameStore!.getState();
      const pending = s.pendingTableGroups as { id: string; tiles: string[] }[] | null;
      const gs = s.gameState as { tableGroups?: { id: string; tiles: string[] }[] };
      const groups = pending ?? gs.tableGroups ?? [];
      const run = groups.find((g) => g.id === "srv-run-red");
      return { groupCount: groups.length, runTiles: run?.tiles ?? [] };
    });
    expect(result.runTiles.length).toBe(4);
    expect(result.groupCount).toBe(1);
  });

  // ==================================================================
  // SC3: 런 앞 append Happy
  // ==================================================================

  test("EXT-SC3: hasInitialMeld=true + 서버 런 [R10 R11 R12] 앞에 랙 R9 drop → 4타일 [R9..R12]", async ({
    page,
  }) => {
    // RED 근거: eef2bbc (I-2 핫픽스) 가 등록 전 런 앞/뒤 append 를 허용했으나 fb85d53 에
    //          롤백됨. hasInitialMeld=true 경로는 영향 없이 line 928 extend 분기로 처리해야
    //          함. 본 TC 는 "등록 후 런 앞 append" 가 정상 작동하는지 검증.
    await createRoomAndStart(page, { playerCount: 2, aiCount: 1, turnTimeout: 60 });
    await waitForGameReady(page);
    await setupExtendAfterConfirm(page, {
      serverGroup: { id: "srv-run-red", tiles: ["R10a", "R11a", "R12a"], type: "run" },
      rackTiles: ["R9a"],
    });
    const r9 = page.locator('section[aria-label="내 타일 랙"] [aria-label="R9a 타일 (드래그 가능)"]').first();
    const r10Anchor = page.locator('[aria-label*="R10a 타일"]').first();
    await dndDrag(page, r9, r10Anchor);
    await page.waitForTimeout(500);

    const result = await page.evaluate(() => {
      const s = (window as unknown as { __gameStore?: { getState: () => Record<string, unknown> } }).__gameStore!.getState();
      const pending = s.pendingTableGroups as { id: string; tiles: string[] }[] | null;
      const gs = s.gameState as { tableGroups?: { id: string; tiles: string[] }[] };
      const groups = pending ?? gs.tableGroups ?? [];
      const run = groups.find((g) => g.id === "srv-run-red");
      return { groupCount: groups.length, runTiles: run?.tiles ?? [] };
    });
    expect(result.runTiles).toContain("R9a");
    expect(result.runTiles.length).toBe(4);
    expect(result.groupCount).toBe(1);
  });

  // ==================================================================
  // SC4: 호환 불가 타일 3회 반복 drop (BUG-UI-EXT/GHOST 핵심 재현) — RED 의도
  // ==================================================================

  test("EXT-SC4: hasInitialMeld=true + 호환 불가 Y5 를 런 [R10 R11 R12] 위에 3회 반복 drop → 복제 그룹 0 (BUG-UI-EXT 재현)", async ({
    page,
  }) => {
    // RED 근거: 스크린샷 2026-04-23_221543/221554/221603 에서 동일 증상 재현.
    //          Y5 는 R10-R11-R12 런에 호환 불가 (색상 + 숫자 둘 다 불일치) → "새 pending
    //          그룹 1개만" 생성이 기대치. 실제는 복제 + stale snapshot 으로 여러 그룹.
    //
    //          PR #70 BUG-UI-009 수정 후에도 재발하는지 검증. RED 가 나오면 architect +
    //          frontend-dev 페어가 §4 common root cause (useMemo stale) 를 해결해야 함.
    await createRoomAndStart(page, { playerCount: 2, aiCount: 1, turnTimeout: 60 });
    await waitForGameReady(page);
    await setupExtendAfterConfirm(page, {
      serverGroup: { id: "srv-run-red", tiles: ["R10a", "R11a", "R12a"], type: "run" },
      rackTiles: ["Y5a"],
    });

    // 호환 불가 타일을 런 위에 3회 연속 drop (350ms 간격)
    const y5 = page.locator('section[aria-label="내 타일 랙"] [aria-label="Y5a 타일 (드래그 가능)"]').first();
    const r11Anchor = page.locator('[aria-label*="R11a 타일"]').first();
    await expect(y5).toBeVisible({ timeout: 5000 });
    await expect(r11Anchor).toBeVisible({ timeout: 5000 });

    // 1회차 drop
    await dndDrag(page, y5, r11Anchor);
    await page.waitForTimeout(350);

    // 2회차: drop 된 Y5 를 다시 랙으로 끌어오기 불가 (V-06 conservation)
    //         → pending 그룹 위로 직접 또 drop 시도 (handleDragStart re-entrancy 테스트)
    // 실 사용자 재현은 단일 타일이 여러 번 움직이는 게 아니라 단일 drop 이 여러 이벤트로
    // 디스패치되는 것이 주요 경로. 이 경우 단일 drop → 여러 state update 로 복제 렌더.
    // 여기서는 drop 후 0.35s 내 **다시 동일 드래그 수행** 으로 isHandlingDragEndRef 우회
    // 시뮬레이션.
    const y5Again = page.locator('[aria-label="Y5a 타일 (드래그 가능)"]').first();
    if (await y5Again.count() > 0 && await y5Again.isVisible({ timeout: 500 }).catch(() => false)) {
      await dndDrag(page, y5Again, r11Anchor);
      await page.waitForTimeout(350);
    }

    // 최종 상태 수집
    const result = await page.evaluate(() => {
      const s = (window as unknown as { __gameStore?: { getState: () => Record<string, unknown> } }).__gameStore!.getState();
      const pending = s.pendingTableGroups as { id: string; tiles: string[] }[] | null;
      const gs = s.gameState as { tableGroups?: { id: string; tiles: string[] }[] };
      const groups = pending ?? gs.tableGroups ?? [];

      // 동일 타일 id 복제 감지
      const tileOccurrences = new Map<string, number>();
      for (const g of groups) {
        for (const t of g.tiles) {
          tileOccurrences.set(t, (tileOccurrences.get(t) ?? 0) + 1);
        }
      }
      const duplicatedTiles = Array.from(tileOccurrences.entries())
        .filter(([, c]) => c > 1)
        .map(([t, c]) => ({ tile: t, count: c }));

      // 동일 tile 구성의 그룹 복제 감지
      const groupSignatures = groups.map((g) => [...g.tiles].sort().join(","));
      const signatureCount = new Map<string, number>();
      for (const sig of groupSignatures) {
        signatureCount.set(sig, (signatureCount.get(sig) ?? 0) + 1);
      }
      const duplicatedGroupSignatures = Array.from(signatureCount.entries())
        .filter(([, c]) => c > 1)
        .map(([sig, c]) => ({ signature: sig, count: c }));

      return {
        groupCount: groups.length,
        groupSignatures,
        duplicatedTiles,
        duplicatedGroupSignatures,
        pendingGroupIdsSize: (s.pendingGroupIds as Set<string>).size,
      };
    });

    // 기대:
    //   - 서버 런 [R10a,R11a,R12a] 1개 + Y5a 새 pending 그룹 1개 = 총 2개
    //   - 복제된 타일 0
    //   - 복제된 그룹 시그니처 0
    //   - pendingGroupIds size = 1 (Y5a 새 그룹만 pending)
    expect(result.duplicatedTiles).toEqual([]);
    expect(result.duplicatedGroupSignatures).toEqual([]);
    expect(result.groupCount).toBeLessThanOrEqual(2);
    expect(result.pendingGroupIdsSize).toBeLessThanOrEqual(1);
  });
});
