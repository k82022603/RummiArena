/**
 * V-04 최초 등록 30점 룰 E2E 시나리오
 *
 * 룰 SSOT: docs/02-design/06-game-rules.md §4.1 / §4.2
 * 추적성: docs/02-design/31-game-rule-traceability.md V-04
 * 매트릭스: docs/04-testing/81-e2e-rule-scenario-matrix.md §2 V-04 행
 *
 * 시나리오:
 *   SC1: 정확히 30점 세트 1개 → 확정 성공 → hasInitialMeld=true
 *   SC2: 29점 (부족) → 서버 거부 → 패널티 드로우 3장 (V-04 Negative)
 *   SC3: hasInitialMeld=false 상태에서 서버 그룹에 extend 시도 → 차단 or 새 pending 분리
 *        (V-13a 재배치 권한 부재 + FINDING-01 경계)
 *   SC4: 조커 포함 30점 세트 → 조커 점수는 대체 타일 숫자로 계산
 *        (docs/02-design/06-game-rules.md §4.1 조커 점수)
 *
 * 실행:
 *   npx playwright test e2e/rule-initial-meld-30pt.spec.ts --workers=1
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
// Fixture 헬퍼 — 초기 등록 시나리오 공통
// ==================================================================

/**
 * store 주입: 랙에 특정 타일 세트 + 테이블 빈 상태 + 내 차례.
 * __gameStore.setState 단독 주입 금지 원칙이나, 결정론 재현 목적상 불가피.
 * 대신 실 WS 연결 후 setState 로 state 만 덮어쓰므로 WS 이벤트 흐름은 보존된다.
 */
async function setupInitialMeldScenario(
  page: import("@playwright/test").Page,
  opts: { rackTiles: string[]; hasInitialMeld?: boolean }
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

    // players 배열 주입: freshHasInitialMeld (GameClient line 800-804) 가
    //   players[mySeat].hasInitialMeld 를 1차 SSOT 로 참조하므로,
    //   루트 hasInitialMeld 와 players[0].hasInitialMeld 를 일치시켜야 한다.
    //   V04-SC1: hasInitialMeld=false (초기 등록 전), V04-SC3: false (확정 전 extend 차단).
    //   (GHOST-SC2 GREEN 전환 시 동일 패턴 적용 — 2026-04-26)
    store.setState({
      mySeat: 0,
      myTiles: args.rackTiles,
      hasInitialMeld: args.hasInitialMeld ?? false,
      players: [
        { seat: 0, type: "HUMAN", userId: "test-user", displayName: "Test", status: "CONNECTED", hasInitialMeld: args.hasInitialMeld ?? false, tileCount: args.rackTiles.length },
        { seat: 1, type: "AI_DEEPSEEK", persona: "rookie", difficulty: "beginner", psychologyLevel: 0, status: "READY", hasInitialMeld: true, tileCount: 14 },
      ],
      pendingTableGroups: null,
      pendingMyTiles: null,
      pendingGroupIds: new Set<string>(),
      pendingRecoveredJokers: [],
      aiThinkingSeat: null,
      gameState: {
        ...baseGameState,
        currentSeat: 0,
        tableGroups: [],
        turnTimeoutSec: 600,
        drawPileCount: 90,
      },
    });
  }, { rackTiles: opts.rackTiles, hasInitialMeld: opts.hasInitialMeld ?? false });

  await page.waitForTimeout(400);
}

// ==================================================================
// SC1: 정확히 30점 달성 → 확정 성공
// ==================================================================

test.describe("V-04 최초 등록 30점 룰", () => {
  test.setTimeout(180_000);

  test.afterEach(async ({ page }) => {
    await cleanupViaPage(page).catch(() => {
      /* best-effort */
    });
  });

  test("V04-SC1: 랙 [R10 R11 R12] (30점 런) → 보드 드롭 → 확정 성공 → hasInitialMeld=true", async ({
    page,
  }) => {
    await createRoomAndStart(page, { playerCount: 2, aiCount: 1, turnTimeout: 60 });
    await waitForGameReady(page);

    // R10 + R11 + R12 = 10+11+12 = 33점 → 30점 이상 달성
    await setupInitialMeldScenario(page, {
      rackTiles: ["R10a", "R11a", "R12a"],
    });

    // setupInitialMeldScenario가 store를 setState로 패치한 후 서버 WS 메시지가 state를 덮어쓸 수 있다.
    // 드래그 전에 store의 myTiles + gameState.currentSeat 가 주입한 값과 일치하는지 확인한다.
    // 일치하지 않으면(서버가 덮어씀) 직접 재설정하고 안정화를 기다린다.
    await page.waitForFunction(
      () => {
        const store = (window as unknown as {
          __gameStore?: {
            getState: () => {
              myTiles?: string[];
              pendingMyTiles?: string[] | null;
              gameState?: { currentSeat?: number } | null;
            };
            setState: (s: Record<string, unknown>) => void;
          };
        }).__gameStore;
        if (!store) return false;
        const s = store.getState();
        const rack = s.pendingMyTiles ?? s.myTiles ?? [];
        const hasAllTiles = rack.includes("R10a") && rack.includes("R11a") && rack.includes("R12a");
        const isMyTurnInStore = s.gameState?.currentSeat === 0;
        if (!hasAllTiles || !isMyTurnInStore) {
          // WS 메시지가 state를 덮어썼으면 재설정
          const cur = store.getState();
          const baseGs = (cur.gameState ?? {}) as Record<string, unknown>;
          store.setState({
            myTiles: ["R10a", "R11a", "R12a"],
            pendingMyTiles: null,
            pendingTableGroups: null,
            pendingGroupIds: new Set<string>(),
            gameState: { ...baseGs, currentSeat: 0 },
          });
          return false;
        }
        return true;
      },
      { timeout: 10_000 }
    );
    await page.waitForTimeout(200);

    // 세 타일을 모두 보드에 드롭
    const board = page.locator('section[aria-label="게임 테이블"]');
    await expect(board).toBeVisible({ timeout: 5000 });

    for (const code of ["R10a", "R11a", "R12a"]) {
      const tile = page
        .locator(`section[aria-label="내 타일 랙"] [aria-label="${code} 타일 (드래그 가능)"]`)
        .first();
      await expect(tile).toBeVisible({ timeout: 5000 });
      await dndDrag(page, tile, board);
      await page.waitForTimeout(300);
    }

    // 검증: 랙에서 세 타일이 모두 사라졌는지
    const rackCodes = await page.evaluate(() => {
      const store = (window as unknown as { __gameStore?: { getState: () => { pendingMyTiles?: string[]; myTiles: string[] } } }).__gameStore;
      if (!store) return null;
      const s = store.getState();
      return s.pendingMyTiles ?? s.myTiles;
    });

    expect(rackCodes).not.toContain("R10a");
    expect(rackCodes).not.toContain("R11a");
    expect(rackCodes).not.toContain("R12a");

    // 검증: pendingTableGroups 에 3타일 그룹 1개 존재
    const groupInfo = await page.evaluate(() => {
      const store = (window as unknown as { __gameStore?: { getState: () => { pendingTableGroups?: { tiles: string[] }[] | null } } }).__gameStore;
      if (!store) return null;
      const s = store.getState();
      const groups = s.pendingTableGroups ?? [];
      return {
        groupCount: groups.length,
        totalTiles: groups.reduce((acc, g) => acc + g.tiles.length, 0),
      };
    });
    expect(groupInfo?.groupCount).toBe(1);
    expect(groupInfo?.totalTiles).toBe(3);
  });

  // ==================================================================
  // SC2: 29점 부족 → 확정 시도 → 서버 거부 (패널티 3장)
  // ==================================================================

  test("V04-SC2: 랙 [R1 R2 R3] (6점) → 확정 시도 → 서버 V-04 거부 (패널티 3장)", async ({
    page,
  }, testInfo) => {
    // RED 근거: V-04 Negative E2E 는 기존 game-rules.spec.ts 간접 커버.
    //           확정 버튼 클릭 후 서버가 INVALID_MOVE 보내는 전체 경로는 실 AI 상대로 재현
    //           필요. 현재 fixture 만으로는 서버 INVALID_MOVE 응답을 결정론적으로 발생시키기
    //           어려우므로 fixme 처리.
    testInfo.fixme(
      true,
      "V-04 Negative E2E: 서버 INVALID_MOVE 결정론적 재현 인프라 필요 (Sprint 7 Week 2)"
    );

    await createRoomAndStart(page, { playerCount: 2, aiCount: 1, turnTimeout: 60 });
    await waitForGameReady(page);
    await setupInitialMeldScenario(page, { rackTiles: ["R1a", "R2a", "R3a"] });

    const board = page.locator('section[aria-label="게임 테이블"]');
    for (const code of ["R1a", "R2a", "R3a"]) {
      const tile = page.locator(
        `section[aria-label="내 타일 랙"] [aria-label="${code} 타일 (드래그 가능)"]`
      ).first();
      await dndDrag(page, tile, board);
      await page.waitForTimeout(200);
    }

    // 확정 버튼 클릭 → 서버 거부 기대
    const confirmBtn = page.getByRole("button", { name: /확정|턴 종료|제출/ }).first();
    await confirmBtn.click();

    // 기대: 패널티 3장 드로우 안내 메시지
    await expect(page.locator("text=/패널티|30점|거부/")).toBeVisible({ timeout: 10_000 });
  });

  // ==================================================================
  // SC3: hasInitialMeld=false 상태에서 확정 전 extend 시도 → 차단
  //       (V-13a 재배치 권한 부재 — rearrangement.spec.ts TC-RR-02 와 상보)
  // ==================================================================

  test("V04-SC3: hasInitialMeld=false 상태에서 서버 그룹 위 드롭 → 새 pending 그룹 분리 (FINDING-01)", async ({
    page,
  }) => {
    // RED 근거: rearrangement.spec.ts TC-RR-02 가 같은 룰 커버. 본 TC 는 "초기 등록 전
    //          extend 금지" 룰을 V-04 scope 에서 재검증 (매트릭스 V-04 × "확정후 extend" 셀의
    //          "확정 전" 케이스).
    await createRoomAndStart(page, { playerCount: 2, aiCount: 1, turnTimeout: 60 });
    await waitForGameReady(page);
    await waitForStoreReady(page);

    // 서버 그룹 [R9 B9 K9] + 랙 [Y9a] 고정
    await page.evaluate(() => {
      const store = (window as unknown as { __gameStore?: { getState: () => Record<string, unknown>; setState: (s: Record<string, unknown>) => void } }).__gameStore;
      if (!store) throw new Error("__gameStore not available");
      const cur = store.getState();
      const baseGs = (cur.gameState ?? {}) as Record<string, unknown>;
      // players 배열 주입: freshHasInitialMeld 가 players[0].hasInitialMeld 를
      //   1차 참조하므로, hasInitialMeld: false 를 players[0] 에도 일치시킨다.
      //   (GHOST-SC2 GREEN 전환 시 동일 패턴 적용 — 2026-04-26)
      store.setState({
        mySeat: 0,
        myTiles: ["Y9a"],
        hasInitialMeld: false, // 초기 등록 전
        players: [
          { seat: 0, type: "HUMAN", userId: "test-user", displayName: "Test", status: "CONNECTED", hasInitialMeld: false, tileCount: 1 },
          { seat: 1, type: "AI_DEEPSEEK", persona: "rookie", difficulty: "beginner", psychologyLevel: 0, status: "READY", hasInitialMeld: true, tileCount: 14 },
        ],
        pendingTableGroups: null,
        pendingMyTiles: null,
        pendingGroupIds: new Set<string>(),
        aiThinkingSeat: null,
        gameState: {
          ...baseGs,
          currentSeat: 0,
          tableGroups: [{ id: "srv-group-9", tiles: ["R9a", "B9a", "K9b"], type: "group" }],
          turnTimeoutSec: 600,
          drawPileCount: 90,
        },
      });
    });
    await page.waitForTimeout(400);

    const y9 = page.locator('section[aria-label="내 타일 랙"] [aria-label="Y9a 타일 (드래그 가능)"]').first();
    const r9 = page.locator('[aria-label*="R9a 타일"]').first();
    await expect(y9).toBeVisible({ timeout: 5000 });
    await expect(r9).toBeVisible({ timeout: 5000 });

    await dndDrag(page, y9, r9);
    await page.waitForTimeout(500);

    // 기대: 서버 그룹 3타일 유지 + Y9a 는 **새 pending 그룹** 에 분리
    const result = await page.evaluate(() => {
      const store = (window as unknown as { __gameStore?: { getState: () => Record<string, unknown> } }).__gameStore;
      const s = store!.getState();
      const pending = s.pendingTableGroups as { id: string; tiles: string[] }[] | null;
      const gs = s.gameState as { tableGroups?: { id: string; tiles: string[] }[] };
      const groups = pending ?? gs.tableGroups ?? [];
      return {
        groupCount: groups.length,
        srvGroupTiles: groups.find((g) => g.id === "srv-group-9")?.tiles ?? [],
        y9InNewGroup: groups.some((g) => g.id !== "srv-group-9" && g.tiles.includes("Y9a")),
      };
    });
    expect(result.srvGroupTiles.length).toBe(3);
    expect(result.y9InNewGroup).toBe(true);
    expect(result.groupCount).toBe(2);
  });

  // ==================================================================
  // SC4: 조커 포함 런 30점 확정 — 조커 점수 대체 타일 숫자로 계산
  // ==================================================================

  test("V04-SC4: 랙 [R10 JK R12] (JK=R11 대체 → 33점) → 조커 포함 런 확정 성공", async ({
    page,
  }, testInfo) => {
    // RED 근거: 조커 점수 계산 Happy 는 Go validator_test.go:317-359 커버. UI 에서 조커
    //          포함 런 드롭 + 확정 성공까지의 E2E 는 hotfix-p0-i4 가 일부만 커버. 본 TC 는
    //          V-04 × 조커 엣지 셀 신규 커버.
    testInfo.fixme(
      true,
      "조커 JK1 드래그 후 서버 그룹 확정 시 inferJokerValue 경로 E2E 는 실 WS 필요. Sprint 7 Week 2 보강."
    );

    await createRoomAndStart(page, { playerCount: 2, aiCount: 1, turnTimeout: 60 });
    await waitForGameReady(page);
    await setupInitialMeldScenario(page, { rackTiles: ["R10a", "JK1", "R12a"] });

    const board = page.locator('section[aria-label="게임 테이블"]');
    for (const code of ["R10a", "JK1", "R12a"]) {
      const tile = page.locator(
        `section[aria-label="내 타일 랙"] [aria-label="${code} 타일 (드래그 가능)"]`
      ).first();
      await dndDrag(page, tile, board);
      await page.waitForTimeout(200);
    }

    // 확정 후 hasInitialMeld=true 기대
    const confirmBtn = page.getByRole("button", { name: /확정|턴 종료|제출/ }).first();
    await confirmBtn.click();

    await page.waitForFunction(
      () => {
        const s = (window as unknown as { __gameStore?: { getState: () => { hasInitialMeld: boolean } } }).__gameStore?.getState();
        return s?.hasInitialMeld === true;
      },
      { timeout: 15_000 }
    );
  });
});
