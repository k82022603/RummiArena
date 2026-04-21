/**
 * Sprint 7 Prep — hasInitialMeld=true 재배치 회귀 가드
 *
 * Day 11 릴리즈 노트 §5 이관 과제 A6 이행. 빈 공간 드롭 버그(BUG-UI-REARRANGE-003
 * 계열)는 `hasInitialMeld=false` (최초 등록 전) 에만 근본 해결되었다. 최초 등록
 * 이후(`hasInitialMeld=true`) 에는 잘못된 merge 가 재발할 수 있는 잔존 리스크가
 * 남아 있으므로, 이 경계를 지키는 회귀 가드 3개를 선적재한다.
 *
 * 검증 대상:
 *   SC1 — hasInitialMeld=true 상태에서 rack 타일을 "보드 빈 공간" 에 드롭하면
 *         기존 서버 그룹에 잘못 merge 되지 않고 새 pending 그룹으로 분리돼야 한다.
 *         (closestCenter 가 가장 가까운 서버 그룹으로 over.id 를 오매핑하는
 *          경우에도 빈 공간 의도를 지켜야 함)
 *
 *   SC2 — hasInitialMeld=true 상태에서 "색이 부적합한" 타일을 서버 확정 그룹에
 *         직접 드롭하면 A2 호환성 사전 필터(GameClient handleDragEnd:813~830)에
 *         의해 merge 가 차단되고 새 그룹이 생성돼야 한다.
 *
 *   SC3 — hasInitialMeld=true 상태에서 "+ 새 그룹" 드롭존(game-board-new-group)
 *         에 정확히 드롭하면 무조건 새 그룹으로 생성돼야 한다. pointerWithin 기반
 *         정확도(A3 완료 후) 로 의도와 다른 서버 그룹에 흡수되지 않는지 증명.
 *
 * 현재 구현 상태 (2026-04-21):
 *   - SC1, SC2: 현 closestCenter + A2 호환성 필터로 PASS 기대.
 *   - SC3:      GameClient.tsx line 1202 `collisionDetection={closestCenter}` 가
 *               아직 pointerWithin 으로 교체되지 않았다. A3 (Sprint 7 frontend-dev)
 *               완료 전까지 회귀 결과가 비결정적일 수 있으므로 test.skip 으로
 *               시작하고, A3 머지 후 skip 해제한다.
 *
 * 환경 가정:
 *   - K8s NodePort http://localhost:30000 (frontend), :30080 (game-server)
 *   - global-setup.ts 에서 생성한 auth.json 세션 재사용
 *   - window.__gameStore 노출 (NODE_ENV !== "production" 또는
 *     NEXT_PUBLIC_E2E_BRIDGE=true)
 *
 * 참고:
 *   - 기존 패턴: e2e/rearrangement.spec.ts, e2e/pre-deploy-playbook.spec.ts
 *   - SSOT: docs/02-design/game-rules (V-03 합병 호환성)
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
// 공통 셋업: 서버 확정 run [R7 R8 R9] + 여러 랙 타일, hasInitialMeld=true
// ==================================================================

/**
 * 3개 시나리오 공통 기본 상태:
 *   - 서버 확정 그룹: run [R7a R8a R9a] (id: srv-run-red)
 *   - 내 랙: [B5a, Y3a, B11a]
 *   - currentSeat / mySeat = 0
 *   - hasInitialMeld = true (최초 등록 완료 후 재배치 시점)
 *
 * 각 시나리오는 필요 시 additional setState 로 보드/랙을 재조정한다.
 */
async function setupInitialMeldScenario(
  page: import("@playwright/test").Page,
  overrides?: {
    tableGroups?: { id: string; tiles: string[]; type: string }[];
    myTiles?: string[];
  }
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
      hasInitialMeld: true,
      pendingTableGroups: null,
      pendingMyTiles: null,
      pendingGroupIds: new Set<string>(),
      pendingRecoveredJokers: [],
      aiThinkingSeat: null,
      gameState: {
        ...baseGameState,
        currentSeat: 0,
        tableGroups: args.tableGroups,
        turnTimeoutSec: 600,
        drawPileCount: 90,
      },
    });
  }, {
    tableGroups: overrides?.tableGroups ?? [
      { id: "srv-run-red", tiles: ["R7a", "R8a", "R9a"], type: "run" },
    ],
    myTiles: overrides?.myTiles ?? ["B5a", "Y3a", "B11a"],
  });

  // React 렌더 + dnd-kit droppable 등록 대기
  await page.waitForTimeout(400);
}

// ==================================================================
// SC1 — hasInitialMeld=true 에서 빈 공간 드롭은 새 그룹으로 분리돼야 함
// ==================================================================

test.describe("TC-S7A6-SC1: 최초 등록 후 빈 공간 드롭 회귀 가드", () => {
  test.setTimeout(180_000);

  test.afterEach(async ({ page }) => {
    await cleanupViaPage(page).catch(() => {
      /* best-effort cleanup */
    });
  });

  test("TC-S7A6-SC1: hasInitialMeld=true + 빈 공간 드롭 → 서버 그룹과 별개의 새 pending 그룹 생성", async ({
    page,
  }) => {
    // Given: 플레이어가 이미 최초 등록을 완료했고(hasInitialMeld=true),
    //        서버 확정 run [R7 R8 R9] 만 보드에 있는 상태.
    await createRoomAndStart(page, {
      playerCount: 2,
      aiCount: 1,
      turnTimeout: 60,
    });
    await waitForGameReady(page);
    await setupInitialMeldScenario(page);

    // 사전 조건: 보드에 1개 run (3타일)
    await expect(
      page.locator('span[aria-label="3개 타일"]')
    ).toHaveCount(1, { timeout: 5000 });

    // When: rack 의 B11a 를 보드의 "빈 공간" (game-board 드롭존) 에 드롭.
    //   - 의도는 "서버 그룹에 붙이지 말고 별도 새 그룹으로 놓기".
    //   - board 섹션 바운딩박스 중앙에 드롭하지만 기존 run 과는 거리가 있도록
    //     좌측 하단 여백에 드롭한다(섹션 좌하단 1/4 영역).
    const b11 = page
      .locator('[aria-label="B11a 타일 (드래그 가능)"]')
      .first();
    await expect(b11).toBeVisible({ timeout: 5000 });

    const board = page.locator('section[aria-label="게임 테이블"]');
    await expect(board).toBeVisible({ timeout: 5000 });

    // 서버 그룹 [R7 R8 R9] 와 멀리 떨어진 지점으로 수동 드래그.
    // dndDrag 는 중앙→중앙 이동이어서 closestCenter 가 서버 그룹으로 매핑될
    // 수 있으므로, 여기서는 수동 경로로 board 좌하단에 명시적으로 놓는다.
    const srcBox = await b11.boundingBox();
    const boardBox = await board.boundingBox();
    if (!srcBox || !boardBox) throw new Error("boundingBox not found");

    const sx = srcBox.x + srcBox.width / 2;
    const sy = srcBox.y + srcBox.height / 2;
    const targetX = boardBox.x + boardBox.width * 0.15; // 보드 좌측 여백
    const targetY = boardBox.y + boardBox.height * 0.85; // 보드 하단 여백

    await page.mouse.move(sx, sy);
    await page.mouse.down();
    // dnd-kit PointerSensor(distance=8) 활성화
    await page.mouse.move(sx + 3, sy, { steps: 2 });
    await page.mouse.move(sx + 12, sy + 4, { steps: 2 });
    // 목표 지점으로 이동
    await page.mouse.move(targetX, targetY, { steps: 25 });
    await page.waitForTimeout(200);
    await page.mouse.up();
    await page.waitForTimeout(400);

    // Then: 서버 그룹 [R7 R8 R9] 는 3타일 유지되고, 별도 1-타일 pending 그룹이 생긴다.
    //   - 만약 closestCenter 가 서버 그룹으로 over.id 를 오매핑했다면 SC1 이 실패 → 회귀 발생.
    //   - A2 호환성 필터가 동작했다면 `B11a` 는 run [R7 R8 R9] 와 비호환
    //     (R 색 run 에 B 색 추가 불가) → 새 그룹 생성 경로로 폴스루.
    const result = await page.evaluate(() => {
      const store = (
        window as unknown as Record<
          string,
          { getState: () => Record<string, unknown> }
        >
      ).__gameStore;
      const state = store.getState();
      const pending = state.pendingTableGroups as
        | { id: string; tiles: string[]; type: string }[]
        | null;
      const gs = state.gameState as
        | { tableGroups?: { id: string; tiles: string[] }[] }
        | null;
      // pending 이 아직 null 이라면 서버 tableGroups 를 그대로 사용 (주입된 초기 상태)
      const groups = pending ?? gs?.tableGroups ?? [];
      return {
        groupCount: groups.length,
        sizes: groups.map((g) => g.tiles.length).sort(),
        serverGroup: groups.find((g) => g.id === "srv-run-red"),
        b11Placed: groups.some((g) => g.tiles.includes("B11a")),
      };
    });

    // 기대: 서버 run 은 그대로 [R7 R8 R9] 3타일 유지.
    expect(result.serverGroup?.tiles.sort()).toEqual(
      ["R7a", "R8a", "R9a"].sort()
    );

    // 기대: 별도 pending 1-타일 그룹으로 B11a 가 분리 배치.
    //   - 만약 B11a 가 서버 그룹에 잘못 merge 되었다면 serverGroup.tiles.length === 4 → FAIL.
    //   - 정상 케이스: 그룹 2개 ([R7 R8 R9], [B11a])
    expect(result.groupCount).toBe(2);
    expect(result.sizes).toEqual([1, 3]);
    expect(result.b11Placed).toBe(true);
  });
});

// ==================================================================
// SC2 — hasInitialMeld=true + 서버 확정 그룹 직접 드롭 시 호환성 필터
// ==================================================================

test.describe("TC-S7A6-SC2: 최초 등록 후 부적합 타일 직접 드롭 호환성 필터", () => {
  test.setTimeout(180_000);

  test.afterEach(async ({ page }) => {
    await cleanupViaPage(page).catch(() => {
      /* best-effort cleanup */
    });
  });

  test("TC-S7A6-SC2: 서버 run [R7 R8 R9] 에 rack B5a 직접 드롭 → A2 필터로 merge 차단 + 새 그룹 생성", async ({
    page,
  }) => {
    // Given: 서버 확정 run [R7 R8 R9] (red 색 전용 run).
    //        rack 에 B5a (blue 색) — run 의 색 제약상 절대로 호환되지 않는 타일.
    await createRoomAndStart(page, {
      playerCount: 2,
      aiCount: 1,
      turnTimeout: 60,
    });
    await waitForGameReady(page);
    await setupInitialMeldScenario(page);

    await expect(
      page.locator('span[aria-label="3개 타일"]')
    ).toHaveCount(1, { timeout: 5000 });

    // When: rack B5a 를 "서버 확정 run 위" 에 직접 드롭 (over.id === "srv-run-red").
    //   - DroppableGroupWrapper 가 srv-run-red 전체를 droppable 로 등록하므로
    //     run 내 아무 타일이나 타겟으로 삼으면 over.id === "srv-run-red" 로 매핑된다.
    //   - 여기서는 R8a (run 의 중앙 타일) 를 시각 anchor 로 사용.
    const b5 = page
      .locator('[aria-label="B5a 타일 (드래그 가능)"]')
      .first();
    const r8 = page.locator('[aria-label*="R8a 타일"]').first();
    await expect(b5).toBeVisible({ timeout: 5000 });
    await expect(r8).toBeVisible({ timeout: 5000 });

    await dndDrag(page, b5, r8);

    // Then: A2 호환성 필터 (GameClient handleDragEnd:813~830) 가
    //   isCompatibleWithGroup("B5a", run[R7R8R9]) === false 로 판정하여
    //   merge 를 차단하고 새 pending 1-타일 그룹으로 폴스루한다.
    //
    //   정상: 그룹 2개 ([R7 R8 R9] 3타일, [B5a] 1타일).
    //   회귀: 서버 그룹이 4타일 [R7 R8 R9 B5] 이 되거나 3타일 [R7 R8 R5] 같은 잡종 생성.
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
      return {
        groupCount: groups.length,
        sizes: groups.map((g) => g.tiles.length).sort(),
        serverGroupTiles:
          groups.find((g) => g.id === "srv-run-red")?.tiles ?? [],
        b5InSeparateGroup: groups.some(
          (g) => g.id !== "srv-run-red" && g.tiles.includes("B5a")
        ),
      };
    });

    // 서버 run 은 원본 유지 (잡종 생성 금지)
    expect(result.serverGroupTiles.sort()).toEqual(
      ["R7a", "R8a", "R9a"].sort()
    );
    // B5a 는 별도 pending 그룹으로 분리
    expect(result.b5InSeparateGroup).toBe(true);
    // 그룹 수는 2개 (원본 run + 신규 B5 그룹)
    expect(result.groupCount).toBe(2);
    expect(result.sizes).toEqual([1, 3]);

    // 보드 UI 반영 — 3타일 그룹은 여전히 1개, 4타일 그룹은 없어야 함
    await expect(
      page.locator('span[aria-label="4개 타일"]')
    ).toHaveCount(0, { timeout: 2000 });
    await expect(
      page.locator('span[aria-label="3개 타일"]')
    ).toHaveCount(1, { timeout: 2000 });
  });
});

// ==================================================================
// SC3 — hasInitialMeld=true + "+ 새 그룹" 드롭존 정확 드롭
// ==================================================================

test.describe("TC-S7A6-SC3: 최초 등록 후 새 그룹 드롭존 pointerWithin 정확도", () => {
  test.setTimeout(180_000);

  test.afterEach(async ({ page }) => {
    await cleanupViaPage(page).catch(() => {
      /* best-effort cleanup */
    });
  });

  // A3 (Sprint 7 frontend-dev) 가 DndContext collisionDetection 을
  // closestCenter → pointerWithin 으로 교체할 때까지 skip.
  // 현재 (2026-04-21) GameClient.tsx:1202 는 여전히 closestCenter 이므로
  // 드롭 위치에 따라 서버 그룹으로 흡수되는 결과가 나올 수 있다.
  //
  // 활성화 조건:
  //   - frontend-dev A3 PR 머지 완료
  //   - collisionDetection={pointerWithin} 교체 확인
  //   - 위 2개 만족 시 `test.skip` 제거하고 정상 `test` 로 승격.
  //
  // Sprint 7 실행 시 활성화.
  test.skip(
    "TC-S7A6-SC3: hasInitialMeld=true + 새 그룹 드롭존 정확 드롭 → 서버 그룹에 흡수되지 않고 pending 새 그룹 생성",
    async ({ page }) => {
      // Given: 서버 확정 run [R7 R8 R9] + rack [B11a] + hasInitialMeld=true.
      //        보드에 여백이 있고, 드래그 중 "+ 새 그룹" 점선 드롭존이 표시되는 상태.
      await createRoomAndStart(page, {
        playerCount: 2,
        aiCount: 1,
        turnTimeout: 60,
      });
      await waitForGameReady(page);
      await setupInitialMeldScenario(page, {
        myTiles: ["B11a"],
      });

      await expect(
        page.locator('span[aria-label="3개 타일"]')
      ).toHaveCount(1, { timeout: 5000 });

      // When: rack B11a 를 "+ 새 그룹" 드롭존 (aria-label="새 그룹 드롭존",
      //       id="game-board-new-group") 의 정확한 중앙에 드롭.
      const b11 = page
        .locator('[aria-label="B11a 타일 (드래그 가능)"]')
        .first();
      await expect(b11).toBeVisible({ timeout: 5000 });

      // 드래그 시작: B11a mouseDown + 8px 활성화 (드롭존은 드래그 중에만 표시됨).
      const srcBox = await b11.boundingBox();
      if (!srcBox) throw new Error("B11a bounding box not found");
      const sx = srcBox.x + srcBox.width / 2;
      const sy = srcBox.y + srcBox.height / 2;

      await page.mouse.move(sx, sy);
      await page.mouse.down();
      await page.mouse.move(sx + 3, sy, { steps: 2 });
      await page.mouse.move(sx + 12, sy + 4, { steps: 2 });

      // 드래그 활성화 후 "+ 새 그룹" 드롭존 등장 대기 (GameBoard showNewGroupDropZone).
      await page.waitForFunction(
        () => !!document.querySelector('[aria-label="새 그룹 드롭존"]'),
        { timeout: 5000 }
      );
      const dropZone = page.locator('[aria-label="새 그룹 드롭존"]').first();
      const dzBox = await dropZone.boundingBox();
      if (!dzBox) throw new Error("새 그룹 드롭존 bounding box not found");
      const dx = dzBox.x + dzBox.width / 2;
      const dy = dzBox.y + dzBox.height / 2;

      // 드롭존 중앙으로 정확 이동 후 drop.
      //   - closestCenter 였을 때: 드롭존 중앙 좌표가 서버 그룹과 가까우면
      //     over.id === "srv-run-red" 로 오매핑되어 SC3 FAIL (회귀).
      //   - pointerWithin 이면: pointer 가 드롭존 DOM 내부에 있으므로
      //     over.id === "game-board-new-group" 으로 정확 매핑 → 새 그룹 생성.
      await page.mouse.move(dx, dy, { steps: 25 });
      await page.waitForTimeout(200);
      await page.mouse.up();
      await page.waitForTimeout(400);

      // Then: 새 pending 1-타일 그룹 생성 (pending- 접두사).
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
        return {
          groupCount: groups.length,
          sizes: groups.map((g) => g.tiles.length).sort(),
          serverGroupTiles:
            groups.find((g) => g.id === "srv-run-red")?.tiles ?? [],
          newPendingHasB11: groups.some(
            (g) => g.id.startsWith("pending-") && g.tiles.includes("B11a")
          ),
        };
      });

      // 서버 그룹은 그대로 [R7 R8 R9]
      expect(result.serverGroupTiles.sort()).toEqual(
        ["R7a", "R8a", "R9a"].sort()
      );
      // B11a 는 pending- 접두사 새 그룹에 존재
      expect(result.newPendingHasB11).toBe(true);
      // 그룹 수: 2 (원본 run + 새 그룹)
      expect(result.groupCount).toBe(2);
      expect(result.sizes).toEqual([1, 3]);

      // UI: 4타일 그룹은 없어야 함 (흡수되지 않음)
      await expect(
        page.locator('span[aria-label="4개 타일"]')
      ).toHaveCount(0, { timeout: 2000 });
    }
  );
});
