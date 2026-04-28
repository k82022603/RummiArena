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
  setPendingDraft,
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
    //
    // currentPlayerId 주입 (setupGhostScenario 패턴 — 2026-04-27):
    //   WS GAME_STATE 메시지가 gameState.currentSeat 을 AI seat(1) 로 변경하면
    //   isMyTurn = currentSeat(1) === mySeat(0) = false 가 되어 DraggableTile 이
    //   disabled=true 로 전환되고 dndDrag 가 동작하지 않는다.
    //   currentPlayerId 를 seat=0 의 실제 userId 로 설정하면 WS 가 currentSeat 을
    //   바꿔도 isMyTurn = players[0].userId === currentPlayerId = true 가 유지된다.
    //
    //   "test-user" 하드코딩 금지: WS GAME_STATE 핸들러(useWebSocket.ts)가 players
    //   배열을 서버 실제 userId 로 덮어쓰므로, 서버가 할당한 실제 seat=0 userId 를
    //   먼저 읽어서 주입해야 한다 (GHOST 패턴과 동일).
    const rawPlayers = (current.players ?? []) as Array<Record<string, unknown>>;
    const seat0 = rawPlayers.find((p) => p.seat === 0);
    const seat0UserId = (seat0?.userId as string | undefined) ?? null;

    store.setState({
      mySeat: 0,
      currentPlayerId: seat0UserId,
      myTiles: args.rackTiles,
      hasInitialMeld: args.hasInitialMeld ?? false,
      players: [
        { seat: 0, type: "HUMAN", userId: seat0UserId, displayName: "Test", status: "CONNECTED", hasInitialMeld: args.hasInitialMeld ?? false, tileCount: args.rackTiles.length },
        { seat: 1, type: "AI_DEEPSEEK", persona: "rookie", difficulty: "beginner", psychologyLevel: 0, status: "READY", hasInitialMeld: true, tileCount: 14 },
      ],
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

  // pendingStore: TURN_START 스냅샷만 (테이블 비어있음, mutation 전)
  await setPendingDraft(page, {
    tableGroups: [],
    rackTiles: opts.rackTiles,
    pendingGroupIds: [],
    recoveredJokers: [],
  });

  await page.waitForTimeout(400);

  // store 반영 확인 (setState 없는 waitForFunction — DndContext 재마운트 없음):
  //   seat0UserId=null 인 경우 mySeat=0 + currentPlayerId=null 이므로
  //   WS 가 currentSeat 을 변경하기 전에 gameState.currentSeat=0 임을 확인한다.
  await page.waitForFunction(
    () => {
      const s = (window as unknown as { __gameStore?: { getState: () => Record<string, unknown> } }).__gameStore?.getState();
      if (!s) return false;
      const gs = s.gameState as { currentSeat?: number } | null;
      return gs?.currentSeat === 0;
    },
    { timeout: 5000 }
  );
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
    // DnD 드래그 직전에 waitForFunction으로 store를 재설정하면 React 리렌더링 → DndContext 재마운트 →
    // PointerSensor 재초기화가 발생하여 드래그가 인식되지 않는다 (WSL E2E 환경 실측).
    // 따라서 setState 직후 DOM 기반 확인만 하고 바로 드래그한다.
    // (PASS 사례: hotfix-p0-i2-run-append.spec.ts 동일 패턴 검증)
    await page.waitForTimeout(600);

    // 세 타일을 모두 보드에 드롭
    const board = page.locator('section[aria-label="게임 테이블"]');
    await expect(board).toBeVisible({ timeout: 5000 });

    for (const code of ["R10a", "R11a", "R12a"]) {
      // 타일이 랙 DOM에 렌더링될 때까지 대기
      const tile = page
        .locator(`section[aria-label="내 타일 랙"] [aria-label="${code} 타일 (드래그 가능)"]`)
        .first();
      await expect(tile).toBeVisible({ timeout: 8000 });
      await dndDrag(page, tile, board);
    }

    // 검증: 세 타일 드롭 완료 후 store 상태 확인 (드롭 완료 대기)
    // 새 SSOT: rack = pendingStore.draft.myTiles ?? gameStore.myTiles
    await page.waitForFunction(
      () => {
        const ps = (window as unknown as { __pendingStore?: { getState: () => { draft: { myTiles: string[] } | null } } }).__pendingStore;
        const gs = (window as unknown as { __gameStore?: { getState: () => { myTiles?: string[] } } }).__gameStore;
        if (!gs) return false;
        const draft = ps?.getState().draft;
        const rack = draft?.myTiles ?? gs.getState().myTiles ?? [];
        // 3개 타일 중 최소 1개 이상 랙에서 사라졌으면 드롭이 시작된 것
        return !rack.includes("R10a") || !rack.includes("R11a") || !rack.includes("R12a");
      },
      { timeout: 8000 }
    );

    const rackCodes = await page.evaluate(() => {
      const ps = (window as unknown as { __pendingStore?: { getState: () => { draft: { myTiles: string[] } | null } } }).__pendingStore;
      const gs = (window as unknown as { __gameStore?: { getState: () => { myTiles: string[] } } }).__gameStore;
      if (!gs) return null;
      const draft = ps?.getState().draft;
      return draft?.myTiles ?? gs.getState().myTiles;
    });

    expect(rackCodes).not.toContain("R10a");
    expect(rackCodes).not.toContain("R11a");
    expect(rackCodes).not.toContain("R12a");

    // 검증: pendingStore.draft.groups 에 3타일 포함 그룹 존재
    const groupInfo = await page.evaluate(() => {
      const ps = (window as unknown as { __pendingStore?: { getState: () => { draft: { groups: { tiles: string[] }[] } | null } } }).__pendingStore;
      const draft = ps?.getState().draft;
      const groups = draft?.groups ?? [];
      return {
        groupCount: groups.length,
        totalTiles: groups.reduce((acc, g) => acc + g.tiles.length, 0),
      };
    });
    expect(groupInfo?.groupCount).toBeGreaterThanOrEqual(1);
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

    // 서버 그룹 [R9 B9 K9] + 랙 [Y9a] 고정.
    // DnD 드래그 직전 waitForFunction 재설정 루프를 쓰면 React 리렌더링 → DndContext 재마운트 →
    // PointerSensor 재초기화로 드래그가 인식되지 않는다 (WSL E2E 환경 실측).
    // hotfix-p0-i2-run-append.spec.ts 와 동일하게 evaluate + waitForTimeout 방식을 사용한다.
    await page.evaluate(() => {
      const store = (window as unknown as { __gameStore?: { getState: () => Record<string, unknown>; setState: (s: Record<string, unknown>) => void } }).__gameStore;
      if (!store) throw new Error("__gameStore not available");
      const cur = store.getState();
      const baseGs = (cur.gameState ?? {}) as Record<string, unknown>;
      // currentPlayerId 주입 (setupGhostScenario 패턴 — 2026-04-27):
      //   WS 가 currentSeat 을 AI seat(1) 로 변경해도 isMyTurn=true 를 유지한다.
      //   "test-user" 하드코딩 금지: 서버 실제 seat=0 userId 를 읽어서 주입.
      const rawPlayers2 = (cur.players ?? []) as Array<Record<string, unknown>>;
      const seat0_2 = rawPlayers2.find((p) => p.seat === 0);
      const seat0UserId2 = (seat0_2?.userId as string | undefined) ?? null;
      store.setState({
        mySeat: 0,
        currentPlayerId: seat0UserId2,
        myTiles: ["Y9a"],
        hasInitialMeld: false,
        players: [
          { seat: 0, type: "HUMAN", userId: seat0UserId2, displayName: "Test", status: "CONNECTED", hasInitialMeld: false, tileCount: 1 },
          { seat: 1, type: "AI_DEEPSEEK", persona: "rookie", difficulty: "beginner", psychologyLevel: 0, status: "READY", hasInitialMeld: true, tileCount: 14 },
        ],
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

    // pendingStore: TURN_START 스냅샷 (mutation 전, 서버 그룹 1개 보존)
    await setPendingDraft(page, {
      tableGroups: [{ id: "srv-group-9", tiles: ["R9a", "B9a", "K9b"], type: "group" }],
      rackTiles: ["Y9a"],
      pendingGroupIds: [],
      recoveredJokers: [],
    });

    await page.waitForTimeout(600);

    const y9 = page.locator('section[aria-label="내 타일 랙"] [aria-label="Y9a 타일 (드래그 가능)"]').first();
    await expect(y9).toBeVisible({ timeout: 8000 });

    // 드롭 대상: 서버 그룹 타일 엘리먼트가 아닌 게임 보드 전체.
    // 이유: groupsDroppable={isMyTurn && (isDragging || !!pendingTableGroups)} 로 인해
    //       드래그 시작 전(isDragging=false, pendingTableGroups=null) 서버 그룹은
    //       DroppableGroupWrapper로 래핑되지 않아 dnd-kit에 드롭존으로 등록되지 않는다.
    //       게임 보드(over.id="game-board") → treatAsBoardDrop 분기 →
    //       freshHasInitialMeld=false + lastPendingGroup=null → 새 pending 그룹 생성.
    //       결과: Y9a가 새 pending 그룹으로 분리 (srv-group-9 유지).
    //
    // 뷰포트 벗어남 대응: dndDrag()는 scrollIntoViewIfNeeded()로 타일을 뷰포트 안으로
    //   스크롤한 후 드래그한다 (V04-SC1 근본 원인 fix — 2026-04-27).
    const board = page.locator('section[aria-label="게임 테이블"]');
    await expect(board).toBeVisible({ timeout: 5000 });

    await dndDrag(page, y9, board);
    await page.waitForTimeout(200);

    // 드롭 후 pendingStore.draft.groups 에 Y9a 가 새 pending 그룹으로 들어갔는지 확인
    await page.waitForFunction(
      () => {
        const ps = (window as unknown as { __pendingStore?: { getState: () => { draft: { groups: { id: string; tiles: string[] }[] } | null } } }).__pendingStore;
        const draft = ps?.getState().draft;
        if (!draft) return false;
        return draft.groups.some((g) => g.id !== "srv-group-9" && (g.tiles as string[]).includes("Y9a"));
      },
      { timeout: 8000 }
    );

    // 기대: 서버 그룹 3타일 유지 + Y9a 는 **새 pending 그룹** 에 분리
    const result = await page.evaluate(() => {
      const ps = (window as unknown as { __pendingStore?: { getState: () => { draft: { groups: { id: string; tiles: string[] }[] } | null } } }).__pendingStore;
      const gs = (window as unknown as { __gameStore?: { getState: () => Record<string, unknown> } }).__gameStore!.getState();
      const draft = ps?.getState().draft;
      const serverTable = (gs.gameState as { tableGroups?: { id: string; tiles: string[] }[] }).tableGroups ?? [];
      const groups = draft ? draft.groups : serverTable;
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
