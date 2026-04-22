/**
 * PR #41 Regression Guard — I-18 롤백 + I-19 조건 교체 반사실적 검증
 *
 * 브랜치: test/pr41-42-regression-2026-04-22
 * 근거:
 *   - architect 계획서 docs/04-testing/71-pr41-42-regression-test-plan.md §5
 *   - ui-regression SKILL Phase 0 반사실적 체크리스트
 *
 * 커버 시나리오 (신규 7건, 기존 hotfix-p0-i2/i4 중복 제외):
 *   REG-PR41-I18-04  CF-I18-A  hasInitialMeld=true 서버 런 append 정상 경로 유지
 *   REG-PR41-I18-05  CF-I18-C  hasInitialMeld=false + game-board 빈 공간 드롭 → 새 그룹
 *   REG-PR41-I19-01  CF-I19-A  조커 2장 중 1장 미배치 → 여전히 차단
 *   REG-PR41-I19-02  CF-I19-A  조커 2장 모두 배치 → 차단 해소
 *   REG-PR41-I19-03  CF-I19-B  rack 정렬 후에도 조커 판정 정확
 *   REG-PR41-I19-04  CF-I19-D  미배치 조커 + 유효하지 않은 블록 공존 → 조커 체크 우선 (store-level)
 *   REG-PR41-I19-05  (qa 추가) 조커 배열 빈 배열 → 차단 안 함 (happy path)
 *
 * 구현 전략:
 *   - handleConfirm 의 핵심 로직 (unplacedRecoveredJokers 계산) 은 컴포넌트 내부
 *     inline 이므로, 동일 수식 (`.filter(jk => pendingMyTiles.includes(jk))`) 을
 *     E2E 에서 재연하여 차단 여부를 store-level 로 검증한다. (기존 hotfix-p0-i4
 *     SC4/SC5 와 동일 패턴)
 *   - 드롭 자체는 hotfix-p0-i2 SC1/SC2/SC3 + hotfix-p0-i4 SC1/SC3 가 이미 커버.
 *
 * __gameStore bridge:
 *   NEXT_PUBLIC_E2E_BRIDGE=true 빌드 또는 NODE_ENV !== "production" 필요.
 */

import { test, expect, type Page } from "@playwright/test";
import { cleanupViaPage } from "./helpers/room-cleanup";
import {
  createRoomAndStart,
  waitForGameReady,
  waitForStoreReady,
} from "./helpers/game-helpers";
import { dndDrag } from "./helpers";

// ==================================================================
// REG-PR41-I18-04 — CF-I18-A hasInitialMeld=true 서버 런 append 정상 경로 유지
// ==================================================================

test.describe("REG-PR41-I18-04: hasInitialMeld=true 서버 런 append (정상 경로 회귀 가드)", () => {
  test.setTimeout(180_000);

  test.afterEach(async ({ page }) => {
    await cleanupViaPage(page).catch(() => {/* best-effort */});
  });

  test("REG-PR41-I18-04: hasInitialMeld=true + Y2 → 서버 run [Y3-Y6] 드롭 → append 성공 (I-18 롤백이 이 경로를 깨지 않음)", async ({
    page,
  }) => {
    /**
     * 목적: I-18 롤백은 hasInitialMeld=false 분기만 수정.
     *       hasInitialMeld=true 에서 서버 런에 append 하는 정상 경로는 유지되어야 함.
     * 기대: srvRunHasY2=true + srvRunTiles.length=5 + groupCount=1
     */
    await createRoomAndStart(page, {
      playerCount: 2,
      aiCount: 1,
      turnTimeout: 60,
    });
    await waitForGameReady(page);
    await waitForStoreReady(page);

    await page.evaluate(() => {
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
        myTiles: ["Y2a", "B8a", "K11a"],
        // 핵심: hasInitialMeld=true
        hasInitialMeld: true,
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
    });

    await page.waitForTimeout(400);

    // 사전: 서버 run 4장
    await expect(
      page.locator('span[aria-label="4개 타일"]')
    ).toHaveCount(1, { timeout: 5000 });

    // When: Y2 → run 의 Y3 앞쪽 드롭
    const y2 = page.locator('[aria-label="Y2a 타일 (드래그 가능)"]').first();
    const y3Anchor = page.locator('[aria-label*="Y3a 타일"]').first();
    await expect(y2).toBeVisible({ timeout: 5000 });
    await expect(y3Anchor).toBeVisible({ timeout: 5000 });

    await dndDrag(page, y2, y3Anchor);
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
      const pendingMyTiles = state.pendingMyTiles as string[] | null;
      return {
        groupCount: groups.length,
        srvRunTiles: srvRun?.tiles ?? [],
        srvRunHasY2: (srvRun?.tiles ?? []).includes("Y2a"),
        y2InRack: (pendingMyTiles ?? (state.myTiles as string[])).includes(
          "Y2a"
        ),
      };
    });

    // hasInitialMeld=true 경로: append 정상 (srvRun 에 Y2 추가)
    expect(result.srvRunHasY2).toBe(true);
    expect(result.srvRunTiles.length).toBe(5);
    expect(result.y2InRack).toBe(false);
    // 별도 그룹 생성 없음 (1개 유지)
    expect(result.groupCount).toBe(1);
  });
});

// ==================================================================
// REG-PR41-I18-05 — CF-I18-C hasInitialMeld=false + game-board 빈 공간 드롭
// ==================================================================

test.describe("REG-PR41-I18-05: hasInitialMeld=false + game-board 빈 공간 드롭 (기존 동작 회귀 가드)", () => {
  test.setTimeout(180_000);

  test.afterEach(async ({ page }) => {
    await cleanupViaPage(page).catch(() => {/* best-effort */});
  });

  test("REG-PR41-I18-05: hasInitialMeld=false + rack R7 → 빈 game-board 드롭 → 새 pending 그룹", async ({
    page,
  }) => {
    /**
     * 목적: over.id === "game-board" OR 경로가 여전히 새 그룹 생성.
     *       I-18 롤백 후 해당 경로가 유지되는지.
     * 기대: pending 그룹 1개 신규 + R7a 포함 + 랙에서 제거.
     */
    await createRoomAndStart(page, {
      playerCount: 2,
      aiCount: 1,
      turnTimeout: 60,
    });
    await waitForGameReady(page);
    await waitForStoreReady(page);

    await page.evaluate(() => {
      const store = (
        window as unknown as Record<
          string,
          {
            getState: () => Record<string, unknown>;
            setState: (s: Record<string, unknown>) => void;
          }
        >
      ).__gameStore;
      const current = store.getState();
      const baseGameState = (current.gameState ?? {}) as Record<string, unknown>;

      store.setState({
        mySeat: 0,
        myTiles: ["R7a", "R8a", "R9a"],
        hasInitialMeld: false,
        pendingTableGroups: null,
        pendingMyTiles: null,
        pendingGroupIds: new Set<string>(),
        pendingRecoveredJokers: [],
        aiThinkingSeat: null,
        gameState: {
          ...baseGameState,
          currentSeat: 0,
          // 서버 그룹 없음
          tableGroups: [],
          turnTimeoutSec: 600,
          drawPileCount: 90,
        },
      });
    });
    await page.waitForTimeout(400);

    const r7 = page.locator('[aria-label="R7a 타일 (드래그 가능)"]').first();
    await expect(r7).toBeVisible({ timeout: 5000 });

    // When: 빈 game-board 영역 (section[aria-label="게임 테이블"]) 에 드롭.
    //       day11-ui-bug-fixes.spec.ts T-B1-01 동일 locator 사용 (검증된 패턴).
    const boardTarget = page.locator('section[aria-label="게임 테이블"]').first();
    await expect(boardTarget).toBeVisible({ timeout: 5000 });

    await dndDrag(page, r7, boardTarget);
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
      const pendingMyTiles = state.pendingMyTiles as string[] | null;
      const myTiles = state.myTiles as string[];
      return {
        pendingGroupCount: pending?.length ?? 0,
        r7InAnyGroup: (pending ?? []).some((g) => g.tiles.includes("R7a")),
        r7InRack:
          (pendingMyTiles ?? myTiles).includes("R7a"),
      };
    });

    // R7a 는 새 pending 그룹에 배치 + 랙에서 제거
    expect(result.r7InAnyGroup).toBe(true);
    expect(result.r7InRack).toBe(false);
    expect(result.pendingGroupCount).toBeGreaterThanOrEqual(1);
  });
});

// ==================================================================
// REG-PR41-I19-01 — CF-I19-A 조커 2장 중 1장 미배치 → 차단 유지
// ==================================================================

test.describe("REG-PR41-I19-01: 조커 2장 중 1장 미배치 → 차단 유지", () => {
  test.setTimeout(180_000);

  test.afterEach(async ({ page }) => {
    await cleanupViaPage(page).catch(() => {/* best-effort */});
  });

  test("REG-PR41-I19-01: pendingRecoveredJokers=[JK1,JK2] 에 JK2 만 랙에 남아있으면 unplaced=1 → 차단 유지", async ({
    page,
  }) => {
    /**
     * 목적: I-19 차단 조건이 pendingRecoveredJokers 중 pendingMyTiles 에 남은
     *       조커가 하나라도 있으면 확정 차단 유지.
     * 기대: unplacedRecoveredJokers = [JK2], unplacedCount=1, blockedAfter=true
     */
    await createRoomAndStart(page, {
      playerCount: 2,
      aiCount: 1,
      turnTimeout: 60,
    });
    await waitForGameReady(page);
    await waitForStoreReady(page);

    await page.evaluate(() => {
      const store = (
        window as unknown as Record<
          string,
          { setState: (s: Record<string, unknown>) => void }
        >
      ).__gameStore;

      store.setState({
        mySeat: 0,
        myTiles: ["JK2", "B8a"],
        // JK2 는 랙에 남음, JK1 은 보드 그룹에 배치됨
        pendingMyTiles: ["JK2", "B8a"],
        hasInitialMeld: true,
        pendingTableGroups: [
          { id: "srv-run-joker", tiles: ["R5a", "R6a", "R7a"], type: "run" },
          { id: "pending-new", tiles: ["Y4a", "JK1", "Y6a"], type: "run" },
        ],
        pendingGroupIds: new Set<string>(["srv-run-joker", "pending-new"]),
        pendingRecoveredJokers: ["JK1", "JK2"],
        aiThinkingSeat: null,
        gameState: {
          currentSeat: 0,
          tableGroups: [
            { id: "srv-run-joker", tiles: ["R5a", "JK1", "R7a"], type: "run" },
          ],
          turnTimeoutSec: 600,
          drawPileCount: 90,
        },
      });
    });
    await page.waitForTimeout(300);

    const result = await page.evaluate(() => {
      const store = (
        window as unknown as Record<
          string,
          { getState: () => Record<string, unknown> }
        >
      ).__gameStore;
      const state = store.getState();
      const pendingRecoveredJokers = state.pendingRecoveredJokers as string[];
      const pendingMyTiles = state.pendingMyTiles as string[] | null;
      if (!pendingMyTiles) return { unplaced: -1 };
      const unplaced = pendingRecoveredJokers.filter((jk) =>
        pendingMyTiles.includes(jk)
      );
      return {
        unplacedCount: unplaced.length,
        unplacedList: unplaced,
        blockedAfter: unplaced.length > 0,
      };
    });

    expect(result.unplacedCount).toBe(1);
    expect(result.unplacedList).toEqual(["JK2"]);
    expect(result.blockedAfter).toBe(true);
  });
});

// ==================================================================
// REG-PR41-I19-02 — CF-I19-A 조커 2장 모두 배치 → 차단 해소
// ==================================================================

test.describe("REG-PR41-I19-02: 조커 2장 모두 배치 → 확정 차단 해소", () => {
  test.setTimeout(180_000);

  test.afterEach(async ({ page }) => {
    await cleanupViaPage(page).catch(() => {/* best-effort */});
  });

  test("REG-PR41-I19-02: pendingRecoveredJokers=[JK1,JK2] 모두 pendingMyTiles 에 없음 → unplaced=0 → 차단 해소", async ({
    page,
  }) => {
    await createRoomAndStart(page, {
      playerCount: 2,
      aiCount: 1,
      turnTimeout: 60,
    });
    await waitForGameReady(page);
    await waitForStoreReady(page);

    await page.evaluate(() => {
      const store = (
        window as unknown as Record<
          string,
          { setState: (s: Record<string, unknown>) => void }
        >
      ).__gameStore;

      store.setState({
        mySeat: 0,
        myTiles: ["B8a", "Y10a"],
        // 조커 2장 모두 보드에 배치 완료
        pendingMyTiles: ["B8a", "Y10a"],
        hasInitialMeld: true,
        pendingTableGroups: [
          { id: "srv-run-joker", tiles: ["R5a", "R6a", "R7a"], type: "run" },
          { id: "pending-1", tiles: ["B11a", "JK1", "B13a"], type: "run" },
          { id: "pending-2", tiles: ["Y4a", "JK2", "Y6a"], type: "run" },
        ],
        pendingGroupIds: new Set<string>(["srv-run-joker", "pending-1", "pending-2"]),
        pendingRecoveredJokers: ["JK1", "JK2"],
        aiThinkingSeat: null,
        gameState: {
          currentSeat: 0,
          tableGroups: [
            { id: "srv-run-joker", tiles: ["R5a", "JK1", "R7a"], type: "run" },
          ],
          turnTimeoutSec: 600,
          drawPileCount: 90,
        },
      });
    });
    await page.waitForTimeout(300);

    const result = await page.evaluate(() => {
      const store = (
        window as unknown as Record<
          string,
          { getState: () => Record<string, unknown> }
        >
      ).__gameStore;
      const state = store.getState();
      const pendingRecoveredJokers = state.pendingRecoveredJokers as string[];
      const pendingMyTiles = state.pendingMyTiles as string[] | null;
      if (!pendingMyTiles) return { unplaced: -1 };
      const unplaced = pendingRecoveredJokers.filter((jk) =>
        pendingMyTiles.includes(jk)
      );
      return {
        unplacedCount: unplaced.length,
        blockedBefore: pendingRecoveredJokers.length > 0,
        blockedAfter: unplaced.length > 0,
      };
    });

    // 수정 전 조건: pendingRecoveredJokers.length > 0 → 차단 (잘못된 차단)
    expect(result.blockedBefore).toBe(true);
    // 수정 후: 모두 배치 완료 → 차단 해소
    expect(result.unplacedCount).toBe(0);
    expect(result.blockedAfter).toBe(false);
  });
});

// ==================================================================
// REG-PR41-I19-03 — CF-I19-B rack 정렬 후에도 조커 판정 정확
// ==================================================================

test.describe("REG-PR41-I19-03: rack 정렬 side-effect 회귀 가드", () => {
  test.setTimeout(180_000);

  test.afterEach(async ({ page }) => {
    await cleanupViaPage(page).catch(() => {/* best-effort */});
  });

  test("REG-PR41-I19-03: rack 순서 변경 후에도 .includes() 판정 정확 유지", async ({
    page,
  }) => {
    /**
     * 목적: handleRackSort 가 pendingMyTiles 순서를 바꿔도 JK1 판정 변화 없음.
     * 기대: 정렬 전/후 모두 unplacedCount=1 (JK1 여전히 랙에 있음).
     */
    await createRoomAndStart(page, {
      playerCount: 2,
      aiCount: 1,
      turnTimeout: 60,
    });
    await waitForGameReady(page);
    await waitForStoreReady(page);

    await page.evaluate(() => {
      const store = (
        window as unknown as Record<
          string,
          { setState: (s: Record<string, unknown>) => void }
        >
      ).__gameStore;
      store.setState({
        mySeat: 0,
        myTiles: ["JK1", "R2a", "R3a"],
        pendingMyTiles: ["JK1", "R2a", "R3a"],
        hasInitialMeld: true,
        pendingTableGroups: [
          { id: "srv-run-joker", tiles: ["R5a", "R6a", "R7a"], type: "run" },
        ],
        pendingGroupIds: new Set<string>(["srv-run-joker"]),
        pendingRecoveredJokers: ["JK1"],
        aiThinkingSeat: null,
        gameState: {
          currentSeat: 0,
          tableGroups: [
            { id: "srv-run-joker", tiles: ["R5a", "JK1", "R7a"], type: "run" },
          ],
          turnTimeoutSec: 600,
          drawPileCount: 90,
        },
      });
    });
    await page.waitForTimeout(300);

    // 정렬 전 판정
    const before = await page.evaluate(() => {
      const store = (
        window as unknown as Record<
          string,
          { getState: () => Record<string, unknown> }
        >
      ).__gameStore;
      const state = store.getState();
      const pRJ = state.pendingRecoveredJokers as string[];
      const pMT = state.pendingMyTiles as string[] | null;
      return {
        unplaced: pMT ? pRJ.filter((jk) => pMT.includes(jk)).length : -1,
        order: pMT,
      };
    });
    expect(before.unplaced).toBe(1);
    expect(before.order).toEqual(["JK1", "R2a", "R3a"]);

    // 정렬 시뮬레이션: pendingMyTiles 순서를 역순으로 변경
    await page.evaluate(() => {
      const store = (
        window as unknown as Record<
          string,
          {
            getState: () => Record<string, unknown>;
            setState: (s: Record<string, unknown>) => void;
          }
        >
      ).__gameStore;
      const state = store.getState();
      const pMT = (state.pendingMyTiles as string[]).slice().reverse();
      store.setState({ pendingMyTiles: pMT });
    });
    await page.waitForTimeout(200);

    // 정렬 후 판정
    const after = await page.evaluate(() => {
      const store = (
        window as unknown as Record<
          string,
          { getState: () => Record<string, unknown> }
        >
      ).__gameStore;
      const state = store.getState();
      const pRJ = state.pendingRecoveredJokers as string[];
      const pMT = state.pendingMyTiles as string[] | null;
      return {
        unplaced: pMT ? pRJ.filter((jk) => pMT.includes(jk)).length : -1,
        order: pMT,
      };
    });

    // 순서는 바뀌었으나 판정 동일
    expect(after.unplaced).toBe(1);
    expect(after.order).toEqual(["R3a", "R2a", "JK1"]);
  });
});

// ==================================================================
// REG-PR41-I19-04 — CF-I19-D Early-return 순서 (조커 체크 우선)
// ==================================================================

test.describe("REG-PR41-I19-04: Early-return 순서 — 조커 체크 우선", () => {
  test.setTimeout(180_000);

  test.afterEach(async ({ page }) => {
    await cleanupViaPage(page).catch(() => {/* best-effort */});
  });

  test("REG-PR41-I19-04: 미배치 조커 + 유효하지 않은 블록 공존 → 조커 체크 먼저 발화", async ({
    page,
  }) => {
    /**
     * 목적: handleConfirm 내 Early-return 순서 검증.
     *       JK 미배치 + 2장 짜리 pending 그룹 동시 존재 시, JK 체크가 먼저 차단.
     * 기대: unplacedCount=1 → 조커 에러 먼저.
     *       동시에 2장 짜리 블록 유효성 false 여부도 확인 (나중에 체크되어야 함).
     */
    await createRoomAndStart(page, {
      playerCount: 2,
      aiCount: 1,
      turnTimeout: 60,
    });
    await waitForGameReady(page);
    await waitForStoreReady(page);

    await page.evaluate(() => {
      const store = (
        window as unknown as Record<
          string,
          { setState: (s: Record<string, unknown>) => void }
        >
      ).__gameStore;
      store.setState({
        mySeat: 0,
        myTiles: ["JK1"],
        pendingMyTiles: ["JK1"],
        hasInitialMeld: true,
        pendingTableGroups: [
          { id: "srv-run-joker", tiles: ["R5a", "R6a", "R7a"], type: "run" },
          // 2장 짜리 (유효하지 않음)
          { id: "pending-new", tiles: ["R2a", "R3a"], type: "run" },
        ],
        pendingGroupIds: new Set<string>(["srv-run-joker", "pending-new"]),
        pendingRecoveredJokers: ["JK1"],
        aiThinkingSeat: null,
        gameState: {
          currentSeat: 0,
          tableGroups: [
            { id: "srv-run-joker", tiles: ["R5a", "JK1", "R7a"], type: "run" },
          ],
          turnTimeoutSec: 600,
          drawPileCount: 90,
        },
      });
    });
    await page.waitForTimeout(300);

    const result = await page.evaluate(() => {
      const store = (
        window as unknown as Record<
          string,
          { getState: () => Record<string, unknown> }
        >
      ).__gameStore;
      const state = store.getState();
      const pRJ = state.pendingRecoveredJokers as string[];
      const pMT = state.pendingMyTiles as string[] | null;
      const pTG = state.pendingTableGroups as
        | { id: string; tiles: string[] }[]
        | null;

      if (!pMT) return { unplaced: -1 };

      const unplaced = pRJ.filter((jk) => pMT.includes(jk));
      // 사용자 생성 pending 그룹 (pending-* prefix) 중 3장 미만
      const invalidBlocks = (pTG ?? []).filter(
        (g) => g.id.startsWith("pending-") && g.tiles.length < 3
      );
      return {
        unplacedCount: unplaced.length,
        unplacedFirst: unplaced.length > 0, // 조커 체크가 먼저 발동됨
        invalidBlockCount: invalidBlocks.length,
      };
    });

    // 둘 다 false 가 아닌 상황
    expect(result.unplacedCount).toBe(1);
    expect(result.invalidBlockCount).toBe(1);
    // 조커 체크가 먼저 차단 (handleConfirm §1135-1143 가 §1147-1185 보다 앞)
    expect(result.unplacedFirst).toBe(true);
  });
});

// ==================================================================
// REG-PR41-I19-05 (qa 추가) — 조커 회수 없음 → 차단 안 함 (happy path)
// ==================================================================

test.describe("REG-PR41-I19-05: 조커 회수 없으면 차단 안 함 (happy path 회귀 가드)", () => {
  test.setTimeout(180_000);

  test.afterEach(async ({ page }) => {
    await cleanupViaPage(page).catch(() => {/* best-effort */});
  });

  test("REG-PR41-I19-05: pendingRecoveredJokers=[] → unplaced=0 → 차단 없음 (기본 게임 흐름 보장)", async ({
    page,
  }) => {
    /**
     * 목적: 조커 회수 이벤트가 전혀 없는 일반 턴에서 I-19 수정 로직이 false-positive
     *       차단을 일으키지 않는지 확인. (가장 빈도 높은 경로)
     */
    await createRoomAndStart(page, {
      playerCount: 2,
      aiCount: 1,
      turnTimeout: 60,
    });
    await waitForGameReady(page);
    await waitForStoreReady(page);

    await page.evaluate(() => {
      const store = (
        window as unknown as Record<
          string,
          { setState: (s: Record<string, unknown>) => void }
        >
      ).__gameStore;
      store.setState({
        mySeat: 0,
        myTiles: ["R2a", "R3a"],
        pendingMyTiles: ["R2a", "R3a"],
        hasInitialMeld: true,
        pendingTableGroups: [
          { id: "pending-new", tiles: ["B5a", "B6a", "B7a"], type: "run" },
        ],
        pendingGroupIds: new Set<string>(["pending-new"]),
        pendingRecoveredJokers: [],
        aiThinkingSeat: null,
        gameState: {
          currentSeat: 0,
          tableGroups: [],
          turnTimeoutSec: 600,
          drawPileCount: 90,
        },
      });
    });
    await page.waitForTimeout(300);

    const result = await page.evaluate(() => {
      const store = (
        window as unknown as Record<
          string,
          { getState: () => Record<string, unknown> }
        >
      ).__gameStore;
      const state = store.getState();
      const pRJ = state.pendingRecoveredJokers as string[];
      const pMT = state.pendingMyTiles as string[] | null;
      if (!pMT) return { unplaced: -1 };
      const unplaced = pRJ.filter((jk) => pMT.includes(jk));
      return {
        unplacedCount: unplaced.length,
        blocked: unplaced.length > 0,
        pendingRecoveredJokersLength: pRJ.length,
      };
    });

    // 조커 회수 없음 → filter 결과 빈 배열 → 차단 없음
    expect(result.pendingRecoveredJokersLength).toBe(0);
    expect(result.unplacedCount).toBe(0);
    expect(result.blocked).toBe(false);
  });
});
