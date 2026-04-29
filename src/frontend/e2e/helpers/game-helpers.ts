/**
 * 게임 생명주기 E2E 헬퍼
 *
 * 방 생성 -> 대기실 -> 게임 시작까지의 공통 플로우를 제공한다.
 * 방 생성 409 오류 시 재시도 로직 포함.
 */

import { expect, type Page } from "@playwright/test";
import { cleanupViaPage } from "./room-cleanup";

// ------------------------------------------------------------------
// 방 생성 + 게임 시작
// ------------------------------------------------------------------

export interface CreateRoomOpts {
  playerCount?: 2 | 3 | 4;
  aiCount?: number;
  turnTimeout?: number;
  /** 방 생성 재시도 횟수 (기본 4) */
  maxRetries?: number;
}

/**
 * 방 생성 -> 대기실 -> 게임 시작까지 진행한다.
 * 완료 후 page는 /game/{roomId}에 위치한다.
 *
 * 409 ALREADY_IN_ROOM 오류 시 cleanup 재시도 후 다시 방을 생성한다.
 *
 * @returns roomId (URL에서 추출)
 */
export async function createRoomAndStart(
  page: Page,
  opts: CreateRoomOpts = {}
): Promise<string> {
  const {
    playerCount = 2,
    aiCount = 1,
    turnTimeout = 120,
    maxRetries = 4,
  } = opts;

  // [E2E-RACE 로그 보강] E2E_RACE_DEBUG=true 환경변수가 설정된 경우
  // page.addInitScript 로 window.__E2E_RACE_DEBUG__=true 를 페이지 로드 초기부터 주입한다.
  // addInitScript 는 등록 후 모든 페이지 네비게이션(goto)에 자동 적용되므로
  // GAME_STATE 첫 도착 시점부터 로그가 캡처된다.
  if (process.env.E2E_RACE_DEBUG === "true") {
    await page.addInitScript(() => {
      (window as unknown as Record<string, unknown>).__E2E_RACE_DEBUG__ = true;
      (window as unknown as Record<string, unknown>).__E2E_RACE_LOGS__ = [];
    });
  }

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    // 이전 테스트에서 남은 활성 방 정리
    await page.goto("/lobby");
    await page.waitForLoadState("domcontentloaded");
    await cleanupViaPage(page);

    // 재시도 시 추가 대기 (서버 상태 안정화)
    if (attempt > 0) {
      await page.waitForTimeout(1000 * attempt);
    }

    await page.goto("/room/create");
    await page.waitForLoadState("domcontentloaded");
    await expect(
      page.locator('form[aria-label="게임 방 생성 폼"]')
    ).toBeVisible({ timeout: 10_000 });

    await page.getByRole("button", { name: `${playerCount}인` }).click();
    await page.getByRole("button", { name: `${turnTimeout}초` }).click();

    // AI 슬롯 수 조정
    const currentSlots = await page.locator('[aria-label^="AI 슬롯"]').count();
    for (let i = currentSlots; i < aiCount; i++) {
      const addBtn = page.getByLabel("AI 플레이어 추가");
      if (await addBtn.isVisible()) await addBtn.click();
    }
    for (let i = currentSlots; i > aiCount; i--) {
      const removeBtn = page.getByLabel(`AI ${i} 제거`);
      if (await removeBtn.isVisible()) await removeBtn.click();
    }

    // 게임 방 만들기 버튼 클릭
    await page.getByRole("button", { name: "게임 방 만들기" }).click();

    // 대기실로 이동 대기 (409 시 에러 토스트가 뜰 수 있음)
    try {
      await page.waitForURL(/\/room\//, { timeout: 15_000 });
      await expect(page.locator('main[aria-label="대기실"]')).toBeVisible({
        timeout: 15_000,
      });
    } catch {
      // 방 생성 실패 (409 등) -- 재시도
      if (attempt < maxRetries) {
        console.log(
          `[game-helpers] Room creation failed (attempt ${attempt + 1}/${maxRetries + 1}), retrying...`
        );
        continue;
      }
      throw new Error(
        `[game-helpers] Room creation failed after ${maxRetries + 1} attempts`
      );
    }

    // 게임 시작
    const startBtn = page.getByLabel("게임 시작");
    await expect(startBtn).toBeVisible({ timeout: 15_000 });
    await startBtn.click();

    await page.waitForURL(/\/game\//, { timeout: 30_000 });

    const url = page.url();
    return url.split("/game/")[1]?.split("?")[0] ?? "";
  }

  throw new Error("[game-helpers] Unreachable");
}

// ------------------------------------------------------------------
// 게임 상태 대기 헬퍼
// ------------------------------------------------------------------

/** 게임 화면이 초기화될 때까지 대기 (WebSocket GAME_STATE 수신 후) */
export async function waitForGameReady(page: Page): Promise<void> {
  await expect(
    page.locator('section[aria-label="내 타일 랙"]')
  ).toBeVisible({ timeout: 30_000 });

  await page.waitForFunction(
    () => {
      const rack = document.querySelector('[aria-label="내 타일 랙"]');
      if (!rack) return false;
      const tiles = rack.querySelectorAll('[aria-label*="타일 (드래그"]');
      return tiles.length >= 1;
    },
    { timeout: 30_000 }
  );
}

/** 내 차례를 대기한다. "내 차례" 배지가 2곳에 동시에 뜨므로 .first() 사용 */
export async function waitForMyTurn(
  page: Page,
  timeoutMs = 90_000
): Promise<void> {
  await expect(
    page.locator("text=내 차례").first()
  ).toBeVisible({ timeout: timeoutMs });
}

/**
 * window.__gameStore 가 로드될 때까지 대기한다.
 * gameStore.ts에서 비프로덕션 환경에서 window.__gameStore를 노출한다.
 */
export async function waitForStoreReady(page: Page): Promise<void> {
  await page.waitForFunction(
    () => !!(window as unknown as Record<string, unknown>).__gameStore,
    { timeout: 15_000 }
  );
}

/**
 * Zustand 스토어 상태를 업데이트한다.
 * window.__gameStore.setState(partial) 호출.
 */
export async function setStoreState(
  page: Page,
  partial: Record<string, unknown>
): Promise<void> {
  await page.evaluate((p) => {
    const store = (
      window as unknown as Record<
        string,
        { setState: (s: Record<string, unknown>) => void }
      >
    ).__gameStore;
    if (store) store.setState(p);
  }, partial);
  // React 렌더링 반영 대기
  await page.waitForTimeout(300);
}

// ------------------------------------------------------------------
// pendingStore fixture 주입 (2026-04-28 Phase C 단계 4 이후 새 SSOT)
//
// Phase C 단계 4 (commit f9c2147) 이후 gameStore 의
//   pendingTableGroups / pendingMyTiles / pendingGroupIds / pendingRecoveredJokers
// 4개 필드는 완전 제거됐다. pending 상태는 usePendingStore.draft 가 단일 SSOT.
//
// E2E spec 은 이 헬퍼로 결정론적 fixture 를 주입한다:
//   - gameStore 에는 myTiles / mySeat / players / gameState 등 게임 메타만 setState
//   - pendingStore 에는 draft (groups, pendingGroupIds, myTiles, recoveredJokers,
//     turnStartRack, turnStartTableGroups 스냅샷) 를 setState 로 통째 주입
// ------------------------------------------------------------------

export interface PendingDraftFixture {
  /** 현재 보드에 있는 그룹들 (서버 확정 + pending 모두 포함) */
  tableGroups?: { id: string; tiles: string[]; type: "run" | "group" }[];
  /** 현재 턴 랙 (현재 myTiles 와 동일하게 두면 tilesAdded=0) */
  rackTiles: string[];
  /** TURN_START 시점 랙 스냅샷 (RESET 복원용). 미지정 시 rackTiles 와 동일. */
  turnStartRack?: string[];
  /** TURN_START 시점 테이블 스냅샷 (rollback 용). 미지정 시 tableGroups 와 동일. */
  turnStartTableGroups?: { id: string; tiles: string[]; type: "run" | "group" }[];
  /** pending 으로 마킹할 그룹 ID 목록. 미지정 시 빈 Set. */
  pendingGroupIds?: string[];
  /** V-07 회수 조커 목록. 미지정 시 빈 배열. */
  recoveredJokers?: string[];
}

/**
 * pendingStore.draft 를 직접 주입한다.
 *
 * 사용 시점: setupGameWithRack 등 fixture 헬퍼에서 store 주입 직후 호출.
 * gameStore 의 myTiles 와 pendingStore 의 draft.myTiles 를 동일하게 두면
 * pending 미적용 상태(첫 mutation 전)와 동등.
 */
export async function setPendingDraft(
  page: Page,
  draft: PendingDraftFixture | null
): Promise<void> {
  await page.evaluate((args: PendingDraftFixture | null) => {
    const pendingStore = (
      window as unknown as Record<
        string,
        { setState: (s: Record<string, unknown>) => void }
      >
    ).__pendingStore;
    if (!pendingStore) {
      throw new Error("__pendingStore not exposed (NEXT_PUBLIC_E2E_BRIDGE off?)");
    }

    if (args === null) {
      pendingStore.setState({ draft: null });
      return;
    }

    const tableGroups = args.tableGroups ?? [];
    const turnStartTableGroups = args.turnStartTableGroups ?? tableGroups;
    const turnStartRack = args.turnStartRack ?? args.rackTiles;
    const idsArr: string[] = args.pendingGroupIds ?? [];
    const pendingGroupIds = new Set<string>(idsArr);
    const recoveredJokers = args.recoveredJokers ?? [];

    pendingStore.setState({
      draft: {
        groups: tableGroups,
        pendingGroupIds,
        myTiles: args.rackTiles,
        recoveredJokers,
        turnStartRack,
        turnStartTableGroups,
      },
    });
  }, draft);
  await page.waitForTimeout(150);
}

// ------------------------------------------------------------------
// 재배치 시나리오 fixture 헬퍼 (2026-04-29)
//
// rearrangement.spec.ts 6 FAIL RCA 결과 추가된 헬퍼.
//
// 기존 setupMergeScenario / setupSplitScenario 등은 gameStore.setState 로
//   - gameState.tableGroups (서버 그룹)
//   - myTiles (랙)
//   - hasInitialMeld
//   - currentSeat
// 를 한 번 주입하고 page.waitForTimeout(400) 으로 React 렌더링을 기다렸다.
//
// 그러나 useWebSocket.ts 의 GAME_STATE 핸들러는 setMyTiles + setGameState +
// setPlayers 를 매번 덮어쓰므로, fixture 주입 직후 GAME_STATE 가 도착하면
//   - myTiles 가 14장 원본으로 복원 → 1~3장 fixture 의도된 랙 코드 부재
//   - gameState.tableGroups 가 빈 배열로 복원 → "3개 타일" / "4개 타일" 그룹 미표시
// 이 race 가 6 FAIL 의 진짜 원인.
//
// 본 헬퍼는 W1 GHOST-SC2 RCA 와 동일한 옵션 A 패턴 +
// "DOM 폴링 + 자동 재주입" 으로 강건성을 확보한다:
//   1. WS GAME_STATE 가 최소 1회 도착해 gameState non-null 안정화 대기
//   2. pendingStore.draft = null 명시 초기화
//   3. gameStore.setState 로 fixture 주입 (myTiles, gameState.tableGroups,
//      players[seat=0].hasInitialMeld, currentPlayerId)
//   4. DOM 에 실제 그룹/랙 타일이 그려질 때까지 폴링 (최대 5초)
//      미반영 시 1회 재주입 후 재폴링 (WS 가 덮어쓴 경우 복구)
// ------------------------------------------------------------------

export interface RearrangementFixtureOpts {
  /** 보드에 강제 주입할 서버 그룹들 (id, tiles, type) */
  tableGroups: { id: string; tiles: string[]; type: "run" | "group" }[];
  /** 랙에 강제 주입할 타일 코드 */
  rackTiles: string[];
  /** seat=0 플레이어의 hasInitialMeld 패치 값 */
  hasInitialMeld: boolean;
  /** turnTimeoutSec (기본 600) */
  turnTimeoutSec?: number;
  /** drawPileCount (기본 90) */
  drawPileCount?: number;
}

/**
 * 재배치(merge/split/joker-swap) E2E 시나리오용 결정론적 fixture 주입.
 *
 * 사용 예:
 *   await setupRearrangementFixture(page, {
 *     tableGroups: [{ id: "srv-group-9", tiles: ["R9a","B9a","K9b"], type: "group" }],
 *     rackTiles: ["Y9a", "R1a", "R2a"],
 *     hasInitialMeld: true,
 *   });
 *
 * 주의: 호출 전 createRoomAndStart + waitForGameReady 가 완료돼 있어야 한다.
 */
export async function setupRearrangementFixture(
  page: Page,
  opts: RearrangementFixtureOpts
): Promise<void> {
  const turnTimeoutSec = opts.turnTimeoutSec ?? 600;
  const drawPileCount = opts.drawPileCount ?? 90;

  await waitForStoreReady(page);

  // [E2E-RACE 로그 보강] E2E_RACE_DEBUG=true 환경변수가 설정된 경우
  // window.__E2E_RACE_DEBUG__=true 를 page context 에 주입한다.
  // 이로써 inject 내부의 page.evaluate 코드가 로그를 출력하게 된다.
  if (process.env.E2E_RACE_DEBUG === "true") {
    await page.evaluate(() => {
      (window as unknown as Record<string, unknown>).__E2E_RACE_DEBUG__ = true;
    });
  }

  // 1. WS GAME_STATE 가 최소 1회 도착해 gameState 가 non-null 이 될 때까지 대기.
  //    이 시점 이후에 패치하면 후속 GAME_STATE 가 도착해도 동일 값 덮어쓰기는
  //    무해하고, race window 가 최소화된다 (W1 GHOST-SC2 RCA 패턴).
  await page.waitForFunction(
    () => {
      const s = (window as unknown as {
        __gameStore?: { getState: () => Record<string, unknown> };
      }).__gameStore?.getState();
      return !!s?.gameState;
    },
    { timeout: 15_000 }
  );

  // 2. pendingStore.draft = null 명시 초기화 (이전 테스트 잔재 차단)
  await setPendingDraft(page, null);

  // 3. gameStore 패치 함수 — 재주입 가능하도록 함수화
  const inject = async (): Promise<void> => {
    await page.evaluate((args: RearrangementFixtureOpts & { turnTimeoutSec: number; drawPileCount: number }) => {
      // [E2E-RACE 로그 보강] fixture inject 시작 시점 기록
      if ((window as unknown as Record<string, unknown>).__E2E_RACE_DEBUG__) {
        const store = (window as unknown as {
          __gameStore?: { getState: () => Record<string, unknown> };
        }).__gameStore;
        const cur = store?.getState();
        const gs = cur?.gameState as { tableGroups?: { id: string }[] } | undefined;
        console.info(
          "[E2E-RACE] fixture inject start",
          JSON.stringify({
            t: performance.now().toFixed(2),
            tableGroupsCount: args.tableGroups.length,
            rackTilesCount: args.rackTiles.length,
            storeBefore: {
              tableGroupsCount: gs?.tableGroups?.length ?? null,
              tableGroupsIds: gs?.tableGroups?.map((g) => g.id) ?? null,
              myTilesCount: (cur?.myTiles as string[] | undefined)?.length ?? null,
            },
          })
        );
      }

      const store = (
        window as unknown as {
          __gameStore?: {
            getState: () => Record<string, unknown>;
            setState: (s: Record<string, unknown>) => void;
          };
        }
      ).__gameStore;
      if (!store) throw new Error("__gameStore not available");

      const cur = store.getState();
      const baseGameState = (cur.gameState ?? {}) as Record<string, unknown>;

      // players[seat=0].hasInitialMeld 패치 + currentPlayerId 고정 (W1 GHOST-SC2 패턴)
      const rawPlayers = (cur.players ?? []) as Array<Record<string, unknown>>;
      const patchedPlayers = rawPlayers.map((p) =>
        p.seat === 0
          ? { ...p, hasInitialMeld: args.hasInitialMeld, tileCount: args.rackTiles.length }
          : p
      );
      if (!patchedPlayers.some((p) => p.seat === 0)) {
        patchedPlayers.push({
          seat: 0,
          hasInitialMeld: args.hasInitialMeld,
          tileCount: args.rackTiles.length,
          type: "HUMAN",
          userId: "fixture-seat-0",
          displayName: "fixture",
          status: "CONNECTED",
        });
      }
      const seat0Player = patchedPlayers.find((p) => p.seat === 0);
      const seat0UserId = (seat0Player?.userId as string | undefined) ?? null;

      store.setState({
        mySeat: 0,
        myTiles: args.rackTiles,
        hasInitialMeld: args.hasInitialMeld,
        players: patchedPlayers,
        currentPlayerId: seat0UserId,
        aiThinkingSeat: null,
        gameState: {
          ...baseGameState,
          currentSeat: 0,
          tableGroups: args.tableGroups,
          turnTimeoutSec: args.turnTimeoutSec,
          drawPileCount: args.drawPileCount,
        },
      });

      // [E2E-RACE 로그 보강] fixture inject 완료 (store.setState 직후)
      if ((window as unknown as Record<string, unknown>).__E2E_RACE_DEBUG__) {
        const afterCur = store.getState();
        const afterGs = afterCur?.gameState as { tableGroups?: { id: string }[] } | undefined;
        console.info(
          "[E2E-RACE] fixture inject done",
          JSON.stringify({
            t: performance.now().toFixed(2),
            storeAfter: {
              tableGroupsCount: afterGs?.tableGroups?.length ?? null,
              tableGroupsIds: afterGs?.tableGroups?.map((g) => g.id) ?? null,
              myTilesCount: (afterCur?.myTiles as string[] | undefined)?.length ?? null,
            },
          })
        );
      }
    }, { ...opts, turnTimeoutSec, drawPileCount });
  };

  await inject();

  // [E2E-RACE 로그 보강] inject 직후 store 상태를 100ms 간격으로 샘플링해
  // race (GAME_STATE 덮어쓰기) 발생 여부를 Node.js 레벨에서 관찰한다.
  // 배포된 번들 수정 없이도 작동 (page.evaluate 기반).
  if (process.env.E2E_RACE_DEBUG === "true") {
    const injectedGroupIds = opts.tableGroups.map((g) => g.id);
    const injectedRackCount = opts.rackTiles.length;

    // inject 직후 스냅샷 기록
    const snapAfterInject = await page.evaluate(() => {
      const store = (window as unknown as {
        __gameStore?: { getState: () => Record<string, unknown> };
      }).__gameStore?.getState();
      const gs = store?.gameState as { tableGroups?: { id: string }[] } | undefined;
      return {
        t: performance.now().toFixed(2),
        tableGroupsCount: gs?.tableGroups?.length ?? null,
        tableGroupsIds: gs?.tableGroups?.map((g) => g.id) ?? null,
        myTilesCount: (store?.myTiles as string[] | undefined)?.length ?? null,
      };
    });
    console.log(
      `[E2E-RACE] store snapshot t+0ms (after inject): tableGroups=${snapAfterInject.tableGroupsCount} ids=${JSON.stringify(snapAfterInject.tableGroupsIds)} rack=${snapAfterInject.myTilesCount}`
    );

    // 100ms, 250ms, 500ms 후 스냅샷 — race 발생 시 이 시점에 덮어써짐
    for (const delay of [100, 250, 500]) {
      await page.waitForTimeout(delay === 100 ? 100 : delay - (delay === 250 ? 100 : 250));
      const snap = await page.evaluate(() => {
        const store = (window as unknown as {
          __gameStore?: { getState: () => Record<string, unknown> };
        }).__gameStore?.getState();
        const gs = store?.gameState as { tableGroups?: { id: string }[] } | undefined;
        return {
          t: performance.now().toFixed(2),
          tableGroupsCount: gs?.tableGroups?.length ?? null,
          tableGroupsIds: gs?.tableGroups?.map((g) => g.id) ?? null,
          myTilesCount: (store?.myTiles as string[] | undefined)?.length ?? null,
        };
      });

      const idsMatch =
        snap.tableGroupsIds !== null &&
        injectedGroupIds.every((id) => snap.tableGroupsIds!.includes(id));
      const raceDetected =
        !idsMatch || snap.myTilesCount !== injectedRackCount;

      console.log(
        `[E2E-RACE] store snapshot t+${delay}ms: tableGroups=${snap.tableGroupsCount} ids=${JSON.stringify(snap.tableGroupsIds)} rack=${snap.myTilesCount}` +
        (raceDetected ? " *** RACE DETECTED (fixture overwritten) ***" : " [OK - fixture intact]")
      );
    }
  }

  // 4. DOM 폴링 — fixture 가 실제로 렌더되었는지 확인.
  //    그룹 0개일 때(빈 보드 시나리오)는 그룹 검증 생략, 첫 랙 타일만 검증.
  const expectGroupCounts = opts.tableGroups.map((g) => g.tiles.length);
  const expectFirstRackTile = opts.rackTiles[0];

  const verify = async (): Promise<boolean> => {
    return await page.evaluate(
      (args: { expectGroupCounts: number[]; expectFirstRackTile: string | undefined }) => {
        // 그룹 배지 카운트 검증
        for (const cnt of args.expectGroupCounts) {
          const badges = document.querySelectorAll(`span[aria-label="${cnt}개 타일"]`);
          if (badges.length < 1) return false;
        }
        // 첫 랙 타일이 랙 섹션에 그려졌는지 검증
        if (args.expectFirstRackTile) {
          const rack = document.querySelector('section[aria-label="내 타일 랙"]');
          if (!rack) return false;
          const tile = rack.querySelector(
            `[aria-label="${args.expectFirstRackTile} 타일 (드래그 가능)"]`
          );
          if (!tile) return false;
        }
        return true;
      },
      { expectGroupCounts, expectFirstRackTile }
    );
  };

  // 최대 5초 폴링, 1회 재주입 허용
  const deadline = Date.now() + 5_000;
  let reinjected = false;
  while (Date.now() < deadline) {
    if (await verify()) {
      // dnd-kit droppable 등록 안정화를 위한 짧은 대기
      await page.waitForTimeout(200);

      // [E2E-RACE 로그 보강] 폴링 성공 시 window.__E2E_RACE_LOGS__ 를 Node.js stdout 으로 출력
      if (process.env.E2E_RACE_DEBUG === "true") {
        const raceLogs = await page.evaluate(() => {
          const w = window as unknown as Record<string, unknown>;
          const logs = w.__E2E_RACE_LOGS__;
          // 읽은 후 초기화 (다음 테스트와 혼재 방지)
          w.__E2E_RACE_LOGS__ = [];
          return Array.isArray(logs) ? (logs as unknown[]) : [];
        });
        if (raceLogs.length > 0) {
          console.log(`[setupRearrangementFixture] [E2E-RACE] captured ${raceLogs.length} GAME_STATE events:`);
          for (const entry of raceLogs) {
            console.log(`  [E2E-RACE]`, JSON.stringify(entry));
          }
        } else {
          console.log("[setupRearrangementFixture] [E2E-RACE] 0 GAME_STATE events captured (race did not occur or debug flag not active in browser)");
        }
      }

      return;
    }
    await page.waitForTimeout(150);
    // 2.5초 경과 후에도 미반영이면 1회 재주입 (WS GAME_STATE 가 덮어쓴 경우)
    if (!reinjected && Date.now() - (deadline - 5_000) > 2_500) {
      // [E2E-RACE 로그 보강] 재주입 발동 기록
      await page.evaluate(() => {
        if ((window as unknown as Record<string, unknown>).__E2E_RACE_DEBUG__) {
          const store = (window as unknown as {
            __gameStore?: { getState: () => Record<string, unknown> };
          }).__gameStore;
          const cur = store?.getState();
          const gs = cur?.gameState as { tableGroups?: { id: string }[] } | undefined;
          console.info(
            "[E2E-RACE] fixture re-inject triggered",
            JSON.stringify({
              t: performance.now().toFixed(2),
              storeAtReinject: {
                tableGroupsCount: gs?.tableGroups?.length ?? null,
                tableGroupsIds: gs?.tableGroups?.map((g) => g.id) ?? null,
                myTilesCount: (cur?.myTiles as string[] | undefined)?.length ?? null,
              },
            })
          );
        }
      });
      await inject();
      reinjected = true;
    }
  }

  // 폴링 실패 — 진단 정보를 포함한 에러 throw
  const diagnostic = await page.evaluate(() => {
    const store = (window as unknown as {
      __gameStore?: { getState: () => Record<string, unknown> };
    }).__gameStore?.getState();
    const gs = store?.gameState as { tableGroups?: { id: string; tiles: string[] }[] } | undefined;
    const myTiles = store?.myTiles as string[] | undefined;
    return {
      tableGroups: gs?.tableGroups ?? null,
      myTilesLen: myTiles?.length ?? -1,
      myTilesFirst: (myTiles ?? []).slice(0, 5),
    };
  });
  throw new Error(
    `[setupRearrangementFixture] DOM verify timed out. diagnostic=${JSON.stringify(diagnostic)}`
  );
}

/** 랙의 타일 코드 목록을 반환한다 */
export async function getRackTileCodes(page: Page): Promise<string[]> {
  const tiles = page.locator(
    'section[aria-label="내 타일 랙"] [aria-label*="타일 (드래그 가능)"]'
  );
  const count = await tiles.count();
  const codes: string[] = [];
  for (let i = 0; i < count; i++) {
    const label = await tiles.nth(i).getAttribute("aria-label");
    if (label) {
      const code = label.replace(" 타일 (드래그 가능)", "");
      codes.push(code);
    }
  }
  return codes;
}
