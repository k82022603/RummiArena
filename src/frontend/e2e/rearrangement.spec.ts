/**
 * 재배치(Manipulation) E2E 테스트
 *
 * 루미큐브 §6.2 4유형(분할/합병/이동/조커 교체) 중 합병(merge) 시나리오를 검증한다.
 * 본 스위트는 docs/04-testing/48-game-rule-coverage-audit.md §6.1 즉시 조치 3의
 * 이행이며, "재배치 합병 E2E 0→1"을 달성하기 위한 첫 단계다.
 *
 * 검증 대상:
 *   Case 1 (Happy Path):  최초 등록 완료 후 랙 타일을 서버 확정 그룹에 합병
 *                         → pending 그룹에 머지된 4타일 + groupsDroppable 활성
 *   Case 2 (Negative):    최초 등록 전 동일 시도 → 머지가 일어나지 않음
 *
 * 환경 가정:
 *   - K8s NodePort http://localhost:30000 (frontend), :30080 (game-server)
 *   - global-setup.ts에서 생성한 auth.json 세션 재사용
 *   - window.__gameStore 노출 (NODE_ENV !== "production" 또는 NEXT_PUBLIC_E2E_BRIDGE=true)
 *
 * 시나리오 결정론화 전략:
 *   라이브 게임은 패가 비결정론적이므로, createRoomAndStart로 실제 게임을 시작한 후
 *   window.__gameStore.setState 로 (gameState.tableGroups, myTiles, hasInitialMeld,
 *   currentSeat) 을 강제 주입하여 합병 시나리오를 결정론적으로 재현한다.
 *
 * 한계 (Sprint 6 후반 보강 예정):
 *   - 본 테스트는 UI 머지 동작과 드롭 존 활성화까지만 검증한다.
 *   - 실제 PLAY_TILES 메시지 → 서버 200 OK 검증은 결정론적 시드 기반 인프라 부재로 제외.
 *   - §6.2 유형 1(분할) / 3(이동) / 4(조커 회수 즉시 사용)은 별도 추적성 매트릭스 항목.
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
// 공통 헬퍼: 합병 시나리오 셋업
// ==================================================================

interface MergeScenarioOpts {
  /** 최초 등록 완료 여부 — false 시 재배치 거부 케이스 */
  hasInitialMeld: boolean;
}

/**
 * 게임 페이지에서 store를 강제 주입해 결정론적 합병 시나리오를 만든다.
 *
 * 셋업 결과:
 *   - tableGroups: [{ id: "srv-group-9", tiles: [R9a, B9a, K9b], type: "group" }]
 *   - myTiles: [Y9a, R1a, R2a]    (Y9a가 합병 대상 후보)
 *   - currentSeat: 0               (= mySeat 가정)
 *   - mySeat: 0
 *   - hasInitialMeld: opts에 따라
 *   - pendingTableGroups: null     (편집 시작 전)
 *   - aiThinkingSeat: null
 */
async function setupMergeScenario(
  page: import("@playwright/test").Page,
  opts: MergeScenarioOpts
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
      myTiles: ["Y9a", "R1a", "R2a"],
      hasInitialMeld: args.hasInitialMeld,
      pendingTableGroups: null,
      pendingMyTiles: null,
      pendingGroupIds: new Set<string>(),
      aiThinkingSeat: null,
      gameState: {
        ...baseGameState,
        currentSeat: 0,
        tableGroups: [
          {
            id: "srv-group-9",
            tiles: ["R9a", "B9a", "K9b"],
            type: "group",
          },
        ],
        turnTimeoutSec: 600,
        drawPileCount: 90,
      },
    });
  }, { hasInitialMeld: opts.hasInitialMeld });

  // React 렌더링 반영 + dnd-kit droppable 등록 대기
  await page.waitForTimeout(400);
}

// ==================================================================
// Case 1: Happy Path — 최초 등록 완료 후 합병 성공
// ==================================================================

test.describe("TC-RR: 재배치 합병 (§6.2 유형 2)", () => {
  test.setTimeout(180_000);

  test.afterEach(async ({ page }) => {
    await cleanupViaPage(page).catch(() => {
      /* best-effort cleanup */
    });
  });

  test("TC-RR-01: 최초 등록 완료 후 랙 Y9a를 서버 그룹 [R9 B9 K9]에 합병 → 4타일 그룹", async ({
    page,
  }) => {
    // Sprint 6 Day 2 핫픽스(commit 740a6f8+68203b6) frontend 재배포 완료.
    // BUG-UI-REARRANGE-002(pendingGroupSeqRef 단조 카운터) 반영 확인.
    await createRoomAndStart(page, {
      playerCount: 2,
      aiCount: 1,
      turnTimeout: 60,
    });
    await waitForGameReady(page);

    // 2. store 강제 주입 — 서버 확정 그룹 + 랙 Y9 + 등록 완료 + 내 차례
    await setupMergeScenario(page, { hasInitialMeld: true });

    // 3. 사전 조건 검증 — 보드에 1개 그룹(3타일) 표시
    const groupBadges = page.locator('span[aria-label="3개 타일"]');
    await expect(groupBadges).toHaveCount(1, { timeout: 5000 });

    // 4. 합병 시도 — 랙의 Y9a를 보드의 그룹(설치된 R9/B9/K9) 위로 드래그
    const y9 = page
      .locator('[aria-label="Y9a 타일 (드래그 가능)"]')
      .first();
    await expect(y9).toBeVisible({ timeout: 5000 });

    // 드롭 대상: 그룹의 첫 타일(R9a)을 시각적 anchor로 사용한다.
    // GameBoard의 DroppableGroupWrapper가 group.id="srv-group-9"를 droppable로 등록하므로,
    // 그 영역 내부 어느 타일에든 드롭하면 over.id === "srv-group-9"가 된다.
    const r9 = page
      .locator('[aria-label*="R9a 타일"]')
      .first();
    await expect(r9).toBeVisible({ timeout: 5000 });

    await dndDrag(page, y9, r9);

    // 5. 결과 검증 — 머지된 그룹은 pending 상태로 4타일 표시
    //    (handleDragEnd line 517~530: pendingGroupIds에 등록 + tableGroups 업데이트)
    await expect(
      page.locator('span[aria-label="4개 타일"]')
    ).toHaveCount(1, { timeout: 5000 });

    // 6. 머지된 그룹은 "미확정" 마커가 붙는다 (BUG-UI-REARRANGE-001)
    await expect(
      page.locator("text=미확정").first()
    ).toBeVisible({ timeout: 3000 });

    // 7. 랙에서 Y9a가 사라졌는지 (pendingMyTiles로 이동)
    //    주의: P2-1로 머지된 보드 타일도 drag 가능하므로 aria-label 조건이
    //    보드/랙 양쪽에서 매치된다. 랙 scope으로 한정한다.
    await expect(
      page.locator(
        'section[aria-label="내 타일 랙"] [aria-label="Y9a 타일 (드래그 가능)"]'
      )
    ).toHaveCount(0, { timeout: 3000 });
  });

  // ==================================================================
  // Case 2: Negative Path — 최초 등록 전 합병 거부
  // ==================================================================

  test("TC-RR-02: 최초 등록 전 합병 시도는 머지되지 않고 그룹이 분리됨", async ({
    page,
  }) => {
    await createRoomAndStart(page, {
      playerCount: 2,
      aiCount: 1,
      turnTimeout: 60,
    });
    await waitForGameReady(page);

    // hasInitialMeld=false → handleDragEnd line 517 분기 차단
    await setupMergeScenario(page, { hasInitialMeld: false });

    // 사전 조건: 보드에 1개 그룹(3타일)
    await expect(
      page.locator('span[aria-label="3개 타일"]')
    ).toHaveCount(1, { timeout: 5000 });

    const y9 = page
      .locator('[aria-label="Y9a 타일 (드래그 가능)"]')
      .first();
    const r9 = page
      .locator('[aria-label*="R9a 타일"]')
      .first();
    await expect(y9).toBeVisible({ timeout: 5000 });
    await expect(r9).toBeVisible({ timeout: 5000 });

    await dndDrag(page, y9, r9);

    // 기대: 머지가 일어나지 않으므로
    //   - 서버 그룹 [R9 B9 K9]는 여전히 3타일로 유지 (또는 board fallthrough로
    //     Y9a가 별도 pending 그룹이 됐을 수 있음)
    //   - 4타일 합병 그룹은 존재하지 않아야 함
    await expect(
      page.locator('span[aria-label="4개 타일"]')
    ).toHaveCount(0, { timeout: 2000 });

    // 서버 그룹은 그대로 3타일 유지
    // (참고: §6.1 즉시 조치 1 완료 후 등록 전에는 드롭 자체가 비활성화될 수도 있다.
    //  현재는 handleDragEnd의 가드만으로 합병이 차단되는 동작을 검증한다.)
    await expect(
      page.locator('span[aria-label="3개 타일"]')
    ).toHaveCount(1, { timeout: 2000 });
  });
});

// ==================================================================
// TC-RR-03 / 04: 재배치 분할 (§6.2 유형 1)
// P2-1: server 그룹 런에서 마지막 타일을 떼어내 랙으로 되돌리기
// ==================================================================

interface SplitScenarioOpts {
  hasInitialMeld: boolean;
}

/**
 * 분할 시나리오 셋업: 서버 확정 런 [B10 B11 B12 B13] + 랙 [B9a]
 * - hasInitialMeld=true  → P2-1에 의해 B13을 랙으로 split 가능해야 함
 * - hasInitialMeld=false → split 시도가 no-op 처리되어 런이 그대로 4타일 유지
 */
async function setupSplitScenario(
  page: import("@playwright/test").Page,
  opts: SplitScenarioOpts
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
      myTiles: ["B9a"],
      hasInitialMeld: args.hasInitialMeld,
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
            id: "srv-run-blue",
            tiles: ["B10a", "B11a", "B12a", "B13a"],
            type: "run",
          },
        ],
        turnTimeoutSec: 600,
        drawPileCount: 90,
      },
    });
  }, { hasInitialMeld: opts.hasInitialMeld });
  await page.waitForTimeout(400);
}

test.describe("TC-RR: 재배치 분할 (§6.2 유형 1)", () => {
  test.setTimeout(180_000);

  test.afterEach(async ({ page }) => {
    await cleanupViaPage(page).catch(() => {
      /* best-effort cleanup */
    });
  });

  test("TC-RR-03: 최초 등록 후 서버 런 [B10 B11 B12 B13]의 B13을 랙으로 split → 3타일 런 + pendingMyTiles에 B13", async ({
    page,
  }, testInfo) => {
    // Sprint 6 Day 2 재확인: 현재 구현은 V-06 conservation 가드로 서버 확정 그룹 →
    // 랙 되돌리기를 명시적으로 차단한다(GameClient.tsx handleDragEnd:626
    // `if (!sourceIsPending) return;`). P2-1 "server-split" 기능은 아직 미구현이며,
    // 본 테스트는 구현 완료 전까지 fixme 상태로 둔다.
    testInfo.fixme(
      true,
      "P2-1 server-split 미구현 (V-06 conservation 가드로 차단). 구현 완료 후 fixme 제거."
    );
    await createRoomAndStart(page, {
      playerCount: 2,
      aiCount: 1,
      turnTimeout: 60,
    });
    await waitForGameReady(page);
    await setupSplitScenario(page, { hasInitialMeld: true });

    // 사전 조건: 보드에 1개 런(4타일)
    await expect(
      page.locator('span[aria-label="4개 타일"]')
    ).toHaveCount(1, { timeout: 5000 });

    // 액션: B13a 타일을 랙으로 드래그
    const b13 = page
      .locator('[aria-label*="B13a 타일"]')
      .first();
    await expect(b13).toBeVisible({ timeout: 5000 });
    const rack = page.locator('section[aria-label="내 타일 랙"]');
    await expect(rack).toBeVisible({ timeout: 5000 });

    await dndDrag(page, b13, rack);

    // 결과: 런이 3타일로 축소되고 pending 마커가 붙음
    await expect(
      page.locator('span[aria-label="3개 타일"]')
    ).toHaveCount(1, { timeout: 5000 });
    await expect(
      page.locator("text=미확정").first()
    ).toBeVisible({ timeout: 3000 });

    // 스토어 확인: pendingGroupIds에 원본 그룹 포함, pendingMyTiles에 B13 존재
    const storeCheck = await page.evaluate(() => {
      const store = (
        window as unknown as Record<
          string,
          { getState: () => Record<string, unknown> }
        >
      ).__gameStore;
      const state = store.getState();
      const pendingIds = state.pendingGroupIds as Set<string>;
      const pendingMy = state.pendingMyTiles as string[] | null;
      return {
        containsOriginal: pendingIds?.has?.("srv-run-blue") ?? false,
        myContainsB13: pendingMy?.includes("B13a") ?? false,
      };
    });
    expect(storeCheck.containsOriginal).toBe(true);
    expect(storeCheck.myContainsB13).toBe(true);
  });

  test("TC-RR-04: 최초 등록 전 서버 런 split 시도는 차단되어 런 4타일 유지", async ({
    page,
  }) => {
    await createRoomAndStart(page, {
      playerCount: 2,
      aiCount: 1,
      turnTimeout: 60,
    });
    await waitForGameReady(page);
    await setupSplitScenario(page, { hasInitialMeld: false });

    // 사전 조건: 보드에 1개 런(4타일)
    await expect(
      page.locator('span[aria-label="4개 타일"]')
    ).toHaveCount(1, { timeout: 5000 });

    // 액션: B13a를 랙으로 드래그 시도
    // hasInitialMeld=false 이면 handleDragEnd의 server-split 가드가 no-op 처리하거나,
    // 아예 table 타일이 draggable로 등록되지 않아 드래그 자체가 실패한다.
    const b13 = page
      .locator('[aria-label*="B13a 타일"]')
      .first();
    // draggable 여부는 구현에 따라 달라지므로 존재만 확인하고 시도
    await expect(b13).toBeVisible({ timeout: 5000 });
    const rack = page.locator('section[aria-label="내 타일 랙"]');

    try {
      await dndDrag(page, b13, rack);
    } catch {
      // drag 자체가 차단됐다면 문제 없음 — 다음 검증으로 진행
    }

    // 기대: 런은 여전히 4타일 유지, pendingGroupIds는 비어 있음
    await expect(
      page.locator('span[aria-label="4개 타일"]')
    ).toHaveCount(1, { timeout: 2000 });

    const storeCheck = await page.evaluate(() => {
      const store = (
        window as unknown as Record<
          string,
          { getState: () => Record<string, unknown> }
        >
      ).__gameStore;
      const state = store.getState();
      const pendingIds = state.pendingGroupIds as Set<string>;
      const pendingMy = state.pendingMyTiles as string[] | null;
      return {
        pendingIdsEmpty: (pendingIds?.size ?? 0) === 0,
        noB13InRack: !(pendingMy?.includes("B13a") ?? false),
      };
    });
    expect(storeCheck.pendingIdsEmpty).toBe(true);
    expect(storeCheck.noB13InRack).toBe(true);
  });
});

// ==================================================================
// TC-RR-05: 유효 머지 힌트 (P2-2)
// 드래그 시작 시 compatible 그룹에 ring-green-400/40 animate-pulse 적용
// ==================================================================

test.describe("TC-RR: 머지 호환 힌트 (P2-2)", () => {
  test.setTimeout(180_000);

  test.afterEach(async ({ page }) => {
    await cleanupViaPage(page).catch(() => {
      /* best-effort cleanup */
    });
  });

  test("TC-RR-05: 랙 B5a 드래그 시작 → [R5 Y5 K5] 그룹에 compatible ring 적용, [B10 B11 B12] 런에는 미적용", async ({
    page,
  }) => {
    // Sprint 6 Day 2 핫픽스 반영 후 fixme 해제.
    await createRoomAndStart(page, {
      playerCount: 2,
      aiCount: 1,
      turnTimeout: 60,
    });
    await waitForGameReady(page);
    await waitForStoreReady(page);

    // store 강제 주입: 그룹 [R5 Y5 K5] + 런 [B10 B11 B12] + 랙 [B5a] + 최초 등록 완료
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
        myTiles: ["B5a"],
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
            { id: "srv-group-5", tiles: ["R5a", "Y5a", "K5a"], type: "group" },
            { id: "srv-run-blue", tiles: ["B10a", "B11a", "B12a"], type: "run" },
          ],
          turnTimeoutSec: 600,
          drawPileCount: 90,
        },
      });
    });
    // store 주입 후 React 렌더링이 완료되어 R5a/B10a/B5a 타일이 모두 DOM에 실제로 그려질 때까지 대기.
    // 고정 대기(400ms)는 저부하 장비에서 0.5~1.5초 걸릴 수 있어 플레이키 원인이다.
    await page.waitForFunction(
      () => {
        return (
          !!document.querySelector('[aria-label="B5a 타일 (드래그 가능)"]') &&
          !!document.querySelector('[aria-label*="R5a 타일"]') &&
          !!document.querySelector('[aria-label*="B10a 타일"]')
        );
      },
      { timeout: 10_000 }
    );

    // B5a를 mouseDown + 8px 이상 이동으로 드래그 활성화 (drop 없음)
    const b5 = page.locator('[aria-label="B5a 타일 (드래그 가능)"]').first();
    await expect(b5).toBeVisible({ timeout: 5000 });
    // hover로 pointer 위치 확정(bounding box 계산 직후 레이아웃 shift 방지)
    await b5.hover();
    const box = await b5.boundingBox();
    if (!box) throw new Error("B5a bounding box not found");
    const sx = box.x + box.width / 2;
    const sy = box.y + box.height / 2;
    await page.mouse.move(sx, sy);
    await page.mouse.down();
    // PointerSensor activationConstraint(distance=8) 충족을 위해 여러 단계로 나누어 이동
    await page.mouse.move(sx + 3, sy, { steps: 2 });
    await page.mouse.move(sx + 20, sy + 20, { steps: 5 });
    await page.mouse.move(sx + 40, sy + 40, { steps: 5 });

    // dnd-kit가 activeId를 set하고 DroppableGroupWrapper가 ring class를 렌더할 때까지 폴링.
    // DragOverlay가 존재할 수 있으므로 querySelectorAll로 모든 R5a를 검사한 뒤
    // 하나라도 ring class를 갖는 ancestor를 찾으면 성공으로 판정.
    await page.waitForFunction(
      () => {
        const nodes = document.querySelectorAll('[aria-label*="R5a 타일"]');
        for (const r5 of Array.from(nodes)) {
          let node: Element | null = r5;
          for (let i = 0; i < 10 && node; i++) {
            if (node.className && typeof node.className === "string") {
              if (
                node.className.includes("ring-green-400/40") ||
                node.className.includes("animate-pulse")
              ) {
                return true;
              }
            }
            node = node.parentElement;
          }
        }
        return false;
      },
      { timeout: 10_000 }
    );

    // 호환 그룹 [R5 Y5 K5] 래퍼 DOM에 ring-green-400/40 animate-pulse class 존재 확인
    // DroppableGroupWrapper: <div ref={setNodeRef} className={ringClass}> — 그룹을 감싸는 최외곽 div
    // [aria-label*="R5a"]의 ancestor를 찾는다
    const compatibleRing = await page.evaluate(() => {
      const r5 = document.querySelector('[aria-label*="R5a 타일"]');
      if (!r5) return { found: false, hasRing: false };
      // DroppableGroupWrapper는 그룹을 감싸는 최외곽 div, class에 ring-green-400/40 포함
      let node: Element | null = r5;
      for (let i = 0; i < 8 && node; i++) {
        if (node.className && typeof node.className === "string") {
          if (node.className.includes("ring-green-400/40") || node.className.includes("animate-pulse")) {
            return { found: true, hasRing: true };
          }
        }
        node = node.parentElement;
      }
      return { found: true, hasRing: false };
    });

    const blueRunRing = await page.evaluate(() => {
      const b10 = document.querySelector('[aria-label*="B10a 타일"]');
      if (!b10) return { found: false, hasRing: false };
      let node: Element | null = b10;
      for (let i = 0; i < 8 && node; i++) {
        if (node.className && typeof node.className === "string") {
          if (node.className.includes("ring-green-400/40") || node.className.includes("animate-pulse")) {
            return { found: true, hasRing: true };
          }
        }
        node = node.parentElement;
      }
      return { found: true, hasRing: false };
    });

    // 드래그 종료
    await page.mouse.up();

    expect(compatibleRing.found).toBe(true);
    expect(compatibleRing.hasRing).toBe(true);
    expect(blueRunRing.found).toBe(true);
    expect(blueRunRing.hasRing).toBe(false);
  });
});

// ==================================================================
// TC-RR-06: 조커 교체 MVP (§6.2 유형 4, P3)
// 테이블 [R7 JK1 K7] 그룹에 랙 B7a 드롭 → JK1을 B7a로 교체 + pendingRecoveredJokers에 JK1
// ConfirmTurn 누르면 "회수한 조커(JK)를 같은 턴에..." 경고 표시
// ==================================================================

test.describe("TC-RR: 조커 교체 MVP (§6.2 유형 4)", () => {
  test.setTimeout(180_000);

  test.afterEach(async ({ page }) => {
    await cleanupViaPage(page).catch(() => {
      /* best-effort cleanup */
    });
  });

  test("TC-RR-06: 서버 그룹 [R7 JK1 K7]에 B7a 드롭 → JK1 회수 + ConfirmTurn 차단", async ({
    page,
  }) => {
    // Sprint 6 Day 2 핫픽스 반영 후 fixme 해제.
    await createRoomAndStart(page, {
      playerCount: 2,
      aiCount: 1,
      turnTimeout: 60,
    });
    await waitForGameReady(page);
    await waitForStoreReady(page);

    // store 강제 주입: 그룹 [R7 JK1 K7] + 랙 [B7a] + 최초 등록 완료
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
        myTiles: ["B7a"],
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
            { id: "srv-group-7", tiles: ["R7a", "JK1", "K7a"], type: "group" },
          ],
          turnTimeoutSec: 600,
          drawPileCount: 90,
        },
      });
    });
    await page.waitForTimeout(400);

    // 사전 조건: 보드에 1개 그룹(3타일)
    await expect(
      page.locator('span[aria-label="3개 타일"]')
    ).toHaveCount(1, { timeout: 5000 });

    // 랙의 B7a를 그룹 내 R7a 타일 위로 드래그 (DroppableGroupWrapper가 srv-group-7 전체를 droppable로 등록)
    const b7 = page.locator('[aria-label="B7a 타일 (드래그 가능)"]').first();
    const r7 = page.locator('[aria-label*="R7a 타일"]').first();
    await expect(b7).toBeVisible({ timeout: 5000 });
    await expect(r7).toBeVisible({ timeout: 5000 });
    await dndDrag(page, b7, r7);

    // 결과 1: 그룹 tiles가 [R7 B7 K7]로 변경 (JK1 제거)
    // DOM에서 JK1이 해당 그룹에서 사라졌는지 확인
    const jkInGroup = await page.evaluate(() => {
      const groups = document.querySelectorAll('[aria-label*="그룹"]');
      for (const g of Array.from(groups)) {
        const labels = g.querySelectorAll('[aria-label*="JK1"]');
        if (labels.length > 0) return true;
      }
      return false;
    });
    expect(jkInGroup).toBe(false);

    // 결과 2: pendingRecoveredJokers에 JK1 존재
    const recovered = await page.evaluate(() => {
      const store = (
        window as unknown as Record<
          string,
          { getState: () => Record<string, unknown> }
        >
      ).__gameStore;
      const state = store.getState();
      return state.pendingRecoveredJokers as string[];
    });
    expect(recovered).toContain("JK1");

    // 결과 3: JokerSwapIndicator 배너 표시
    await expect(
      page.locator('[data-testid="joker-swap-indicator"]')
    ).toBeVisible({ timeout: 3000 });

    // 결과 4: ConfirmTurn 버튼 클릭 시 경고 표시
    const confirmBtn = page.getByRole("button", { name: /턴 확정|확정/ }).first();
    if (await confirmBtn.isVisible().catch(() => false)) {
      await confirmBtn.click();
      await expect(
        page.locator('[role="alert"]').filter({ hasText: /회수한 조커/ })
      ).toBeVisible({ timeout: 3000 });
    }
  });
});

// ==================================================================
// TC-RR-07: 혼합 숫자 자동 분리 (BUG-UI-CLASSIFY-001a 회귀 방지)
// 최초 등록 전 랙 [R7a Y4a]를 빈 보드에 순차 드롭 →
// 숫자도 색도 다르므로 하나의 그룹으로 합쳐지지 않고 2개 pending 그룹으로 분리돼야 한다.
// ==================================================================

test.describe("TC-RR: 혼합 숫자 자동 분리 (BUG-UI-CLASSIFY-001a)", () => {
  test.setTimeout(180_000);

  test.afterEach(async ({ page }) => {
    await cleanupViaPage(page).catch(() => {
      /* best-effort cleanup */
    });
  });

  test("TC-RR-07: 빈 보드에 R7a → Y4a 순차 드롭 시 2개 pending 그룹으로 분리", async ({
    page,
  }) => {
    await createRoomAndStart(page, {
      playerCount: 2,
      aiCount: 1,
      turnTimeout: 60,
    });
    await waitForGameReady(page);
    await waitForStoreReady(page);

    // store 강제 주입: 빈 보드 + 랙 [R7a, Y4a] + 최초 등록 전(hasInitialMeld=false)
    // shouldCreateNewGroup 분기는 hasInitialMeld 상관없이 동작하므로 false에서도 검증 가능.
    // 기존 gameState를 spread하여 players/currentTurn 등 필수 필드를 보존한다.
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
        myTiles: ["R7a", "Y4a"],
        hasInitialMeld: false,
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
    });
    await page.waitForTimeout(400);

    const board = page.locator('section[aria-label="게임 테이블"]');
    await expect(board).toBeVisible({ timeout: 5000 });

    // 1. R7a를 빈 보드에 드롭 → 1개 pending 그룹 [R7a]
    const r7 = page.locator('[aria-label="R7a 타일 (드래그 가능)"]').first();
    await expect(r7).toBeVisible({ timeout: 5000 });
    await dndDrag(page, r7, board);
    await page.waitForTimeout(300);

    // 2. Y4a를 빈 보드에 드롭 → [R7a]와 숫자/색 모두 불일치 → 새 그룹 생성
    //    (BUG-UI-CLASSIFY-001a 수정 전이라면 [R7a, Y4a] 하나의 잘못된 그룹에 합쳐졌음)
    const y4 = page.locator('[aria-label="Y4a 타일 (드래그 가능)"]').first();
    await expect(y4).toBeVisible({ timeout: 5000 });
    await dndDrag(page, y4, board);
    await page.waitForTimeout(300);

    // 검증: pendingTableGroups가 2개의 1-타일 그룹으로 구성돼야 한다
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
      if (!pending) return { groupCount: 0, sizes: [] as number[] };
      return {
        groupCount: pending.length,
        sizes: pending.map((g) => g.tiles.length),
        ids: pending.map((g) => g.id),
      };
    });

    // 기대: 2개의 1-타일 pending 그룹
    expect(result.groupCount).toBe(2);
    expect(result.sizes.sort()).toEqual([1, 1]);
    // BUG-UI-REARRANGE-002 회귀 방지: 그룹 ID는 모두 unique
    const uniqueIds = new Set(result.ids ?? []);
    expect(uniqueIds.size).toBe(result.groupCount);
  });
});
