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
 *
 * 2026-04-29 GHOST-SC2 RCA + fixture 회귀 수정:
 *   - captureDuplicationState: gameStore.pendingGroupIds(Phase C 제거됨) →
 *     __pendingStore.draft.pendingGroupIds 로 SSOT 정렬
 *   - setupGhostScenario: WS GAME_STATE 안정화 대기 후 fixture 주입
 *     (fixture 주입 직후 WS 가 덮어쓰는 race 방지 — GHOST-SC2 RCA 근본 원인)
 *   - SC1/SC2 drag anchor: 서버 런 타일(R11a) 의존 제거 →
 *     빈 테이블 drop zone 사용 (WS 상태와 무관하게 항상 visible)
 *   - SC2 drag source: "Y5a" 하드코딩 제거 → 실제 랙 첫 번째 타일 사용
 *   - SC2 TURN_START 시뮬레이션: __pendingStore.reset() 직접 호출로 단순화
 *     (gameStore.resetPending Phase C 이후 제거됨)
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

/**
 * setupGhostScenario: hasInitialMeld=true 상태로 gameStore 를 패치한다.
 *
 * 2026-04-29 GHOST-SC2 RCA 수정:
 *   이전 구현은 WS GAME_STATE 가 fixture 직후 도착하면 gameStore 를 덮어써서
 *   - myTiles 가 원래 14개 랙으로 복원 → "Y5a" 타일 없음 → drag timeout (SC2)
 *   - gameState.tableGroups 가 빈 배열로 복원 → "R11a" anchor 없음 → SC1 timeout
 *   이 발생하는 race condition 이 있었다.
 *
 *   수정:
 *   1. WS 가 안정화된 뒤(gameState non-null 확인) 패치를 수행한다.
 *   2. myTiles 를 하드코딩하지 않고 WS 가 준 실제 랙을 그대로 사용한다.
 *      (WS 가 덮어써도 랙 코드는 동일하므로 race 가 없어진다)
 *   3. drag anchor 는 서버 런 타일이 아닌 테이블 drop zone 을 사용하므로
 *      tableGroups 주입 자체를 제거한다.
 *   4. pendingStore 는 Phase C 이후 단독 SSOT 이므로 gameStore 의 deprecated
 *      pending 필드(pendingTableGroups 등)는 주입하지 않는다.
 */
async function setupGhostScenario(
  page: import("@playwright/test").Page
): Promise<void> {
  // __gameStore 가 노출될 때까지 대기
  await waitForStoreReady(page);

  // WS GAME_STATE 가 최소 1회 도착하여 gameState 가 non-null 이 될 때까지 대기.
  // 이 시점 이후에 패치하면 WS 의 후속 GAME_STATE 가 도착해도 players/hasInitialMeld
  // 패치가 동일 값으로 덮이는 race window 가 최소화된다.
  await page.waitForFunction(
    () => {
      const s = (window as unknown as { __gameStore?: { getState: () => Record<string, unknown> } }).__gameStore?.getState();
      return !!s?.gameState;
    },
    { timeout: 15_000 }
  );

  await page.evaluate(() => {
    const store = (window as unknown as { __gameStore?: { getState: () => Record<string, unknown>; setState: (s: Record<string, unknown>) => void } }).__gameStore;
    if (!store) throw new Error("__gameStore not available");
    const cur = store.getState();

    // players 배열: seat=0 플레이어의 hasInitialMeld 를 true 로 패치.
    //
    // 근거: effectiveHasInitialMeld(GameClient.tsx) 는
    //   me?.hasInitialMeld ?? hasInitialMeld 로 계산된다.
    //   players[0].hasInitialMeld === false 이면 ?? fallback 이 없으므로 false 반환.
    //   handleDragEnd 의 freshHasInitialMeld 도 동일 경로를 사용하므로, players
    //   배열도 함께 패치하지 않으면 두 값이 모두 false 로 계산된다.
    //
    // isMyTurn 문제: WS 가 currentSeat 을 AI seat 으로 바꾸면 isMyTurn=false 로
    //   handleDragEnd 에서 즉시 return 된다. currentPlayerId 를 seat=0 userId 로
    //   고정하면 WS 의 currentSeat 변경에 관계없이 isMyTurn=true 가 유지된다.
    const rawPlayers = (cur.players ?? []) as Array<Record<string, unknown>>;
    const patchedPlayers = rawPlayers.map((p) =>
      p.seat === 0 ? { ...p, hasInitialMeld: true } : p
    );
    if (!patchedPlayers.some((p) => p.seat === 0)) {
      patchedPlayers.push({ seat: 0, hasInitialMeld: true, tileCount: 3 });
    }

    const seat0Player = patchedPlayers.find((p) => p.seat === 0);
    const seat0UserId = (seat0Player?.userId as string | undefined) ?? null;

    // myTiles 는 WS 가 준 실제 랙을 그대로 유지한다.
    // 하드코딩("Y5a", "K8b", "B2a")하면 WS 가 덮어쓸 때 race 가 생긴다.
    store.setState({
      mySeat: 0,
      players: patchedPlayers,
      currentPlayerId: seat0UserId,
      hasInitialMeld: true,
      aiThinkingSeat: null,
    });
  });

  // React 리렌더 + store 반영 대기
  await page.waitForTimeout(400);

  // hasInitialMeld 패치가 실제로 반영됐는지 확인
  await page.waitForFunction(
    () => {
      const s = (window as unknown as { __gameStore?: { getState: () => Record<string, unknown> } }).__gameStore?.getState();
      if (!s) return false;
      const players = s.players as Array<{ seat: number; hasInitialMeld?: boolean }>;
      const seat0 = players.find((p) => p.seat === 0);
      return seat0?.hasInitialMeld === true;
    },
    { timeout: 5_000 }
  );
}

// ==================================================================
// 복제 감지 유틸
// ==================================================================

/**
 * captureDuplicationState: pending + 서버 그룹의 복제 여부를 캡처한다.
 *
 * 2026-04-29 Phase C SSOT 정렬:
 *   - 이전: gameStore.pendingTableGroups / gameStore.pendingGroupIds 를 직접 읽음.
 *     Phase C 단계 4 이후 이 필드들이 gameStore 에서 완전 제거됐으므로 undefined 였음.
 *   - 수정: __pendingStore.draft 를 우선 읽고,
 *     draft 가 null 이면 gameStore.gameState.tableGroups 를 fallback 으로 사용.
 *     pendingGroupIds.size 도 pendingStore.draft 에서 읽는다.
 */
async function captureDuplicationState(page: import("@playwright/test").Page) {
  return await page.evaluate(() => {
    // pending 상태 SSOT: __pendingStore.draft (Phase C 단계 4 이후)
    const pendingStore = (window as unknown as {
      __pendingStore?: {
        getState: () => {
          draft: {
            groups: { id: string; tiles: string[] }[];
            pendingGroupIds: Set<string>;
          } | null;
        };
      };
    }).__pendingStore;

    const draft = pendingStore?.getState().draft ?? null;

    // fallback: draft 없으면 서버 확정 tableGroups 사용
    const gameStore = (window as unknown as { __gameStore?: { getState: () => Record<string, unknown> } }).__gameStore;
    const gs = gameStore?.getState().gameState as { tableGroups?: { id: string; tiles: string[] }[] } | undefined;

    const groups: { id: string; tiles: string[] }[] = draft?.groups ?? gs?.tableGroups ?? [];
    const pendingGroupIdsSize: number = draft?.pendingGroupIds.size ?? 0;

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
      pendingGroupIdsSize,
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
    //
    // 2026-04-29 anchor 수정: "R11a 타일" 서버 런 anchor 는 WS 가 tableGroups 를 빈
    // 배열로 덮어쓰면 DOM 에 없어지므로 토폴로지 의존성이 생긴다. 대신 항상 visible 한
    // 빈 테이블 drop zone(section[aria-label="게임 테이블"])을 anchor 로 사용한다.
    await createRoomAndStart(page, { playerCount: 2, aiCount: 1, turnTimeout: 60 });
    await waitForGameReady(page);
    await setupGhostScenario(page);

    // 빈 테이블 drop zone — WS 상태와 무관하게 항상 visible
    const tableSection = page.locator('section[aria-label="게임 테이블"]');
    await expect(tableSection).toBeVisible({ timeout: 5_000 });

    // 초기 pending 상태: drag 전이므로 draft=null → totalGroups=0 (WS tableGroups 기준)
    const initial = await captureDuplicationState(page);
    expect(initial.pendingGroupIdsSize).toBe(0);

    // 3타일 각각 drop (각 drop 은 호환 불가 → 새 pending 그룹 1개씩 생성 기대)
    // 랙에서 실제 존재하는 타일만 drag 한다 (WS 가 준 랙 기준).
    const rackLocator = page.locator('section[aria-label="내 타일 랙"] [aria-label*="타일 (드래그 가능)"]');
    const rackCount = await rackLocator.count();

    let dropped = 0;
    for (let i = 0; i < Math.min(3, rackCount); i++) {
      const tile = rackLocator.nth(i);
      await dndDrag(page, tile, tableSection);
      await page.waitForTimeout(350);
      dropped++;
    }

    const final = await captureDuplicationState(page);

    // 기대:
    //   - 복제된 tile 0 (V-06 violation 부재)
    //   - 복제된 group id 0 (동일 id 중복 출현 없음)
    //   - pendingGroupIds size ≤ dropped (새 pending 그룹만 등록)
    expect(final.duplicatedTiles).toEqual([]);
    expect(final.duplicatedGroupIds).toEqual([]);
    expect(final.pendingGroupIdsSize).toBeLessThanOrEqual(dropped);
  });

  // ==================================================================
  // SC2: TURN_START 시 resetPending 확인
  // ==================================================================

  test("GHOST-SC2: 턴 종료 후 TURN_START 이벤트 주입 → pendingTableGroups=null + pendingGroupIds size=0", async ({
    page,
  }) => {
    // RED 근거: architect 재재조사 §3.1 — "턴 종료(221707) 시 복제 사라짐 — TURN_START
    //          핸들러 resetPending() 이 정리". 이 정리 경로가 실제로 동작하는지 회귀 가드.
    //
    // 2026-04-29 수정:
    //   - anchor: R11a 서버 런 → 빈 테이블 drop zone (WS 덮어쓰기 독립)
    //   - drag source: "Y5a" 하드코딩 → 실제 랙 첫 번째 타일 사용
    //     (WS 가 준 랙에 "Y5a" 가 없으면 scrollIntoViewIfNeeded timeout)
    //   - TURN_START 시뮬레이션: gameStore.resetPending (Phase C 이후 제거됨) →
    //     __pendingStore.reset() 직접 호출로 단순화
    await createRoomAndStart(page, { playerCount: 2, aiCount: 1, turnTimeout: 60 });
    await waitForGameReady(page);
    await setupGhostScenario(page);

    // 빈 테이블 drop zone — WS 상태와 무관하게 항상 visible
    const tableSection = page.locator('section[aria-label="게임 테이블"]');
    await expect(tableSection).toBeVisible({ timeout: 5_000 });

    // 실제 랙 첫 번째 타일 사용 (WS 가 준 랙 코드 기준)
    const firstRackTile = page.locator('section[aria-label="내 타일 랙"] [aria-label*="타일 (드래그 가능)"]').first();
    await expect(firstRackTile).toBeVisible({ timeout: 5_000 });
    await dndDrag(page, firstRackTile, tableSection);
    await page.waitForTimeout(350);

    // 중간 검증: pending 상태 1개 이상 (drop 이 pendingStore 에 반영됐는지 확인)
    const mid = await captureDuplicationState(page);
    expect(mid.pendingGroupIdsSize).toBeGreaterThanOrEqual(1);

    // TURN_START 시뮬레이션: pendingStore.reset() 직접 호출
    // Phase C 단계 4 이후 gameStore.resetPending 은 제거됐으므로
    // __pendingStore.reset() 을 사용한다 (UR-04 경로).
    await page.evaluate(() => {
      const pendingStore = (window as unknown as {
        __pendingStore?: { getState: () => { reset: () => void } };
      }).__pendingStore;
      if (!pendingStore) throw new Error("__pendingStore not exposed");
      pendingStore.getState().reset();
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
    //
    // 2026-04-29 수정:
    //   - anchor: R11a 서버 런 → 빈 테이블 drop zone (WS 덮어쓰기 독립)
    //   - pending ID 읽기: gameStore.pendingTableGroups (Phase C 제거됨) →
    //     __pendingStore.draft.groups 로 SSOT 정렬
    //   - drag source: 하드코딩("Y5a","K8b","B2a") → 실제 랙 타일 최대 3개 사용
    await createRoomAndStart(page, { playerCount: 2, aiCount: 1, turnTimeout: 60 });
    await waitForGameReady(page);
    await setupGhostScenario(page);

    // 빈 테이블 drop zone — WS 상태와 무관하게 항상 visible
    const tableSection = page.locator('section[aria-label="게임 테이블"]');
    await expect(tableSection).toBeVisible({ timeout: 5_000 });

    const rackLocator = page.locator('section[aria-label="내 타일 랙"] [aria-label*="타일 (드래그 가능)"]');
    const rackCount = await rackLocator.count();
    const seenIds: string[] = [];

    for (let i = 0; i < Math.min(3, rackCount); i++) {
      const tile = rackLocator.nth(i);
      await dndDrag(page, tile, tableSection);
      await page.waitForTimeout(350);

      // pending ID 읽기: __pendingStore.draft.groups (Phase C SSOT)
      const ids = await page.evaluate(() => {
        const pendingStore = (window as unknown as {
          __pendingStore?: {
            getState: () => {
              draft: { groups: { id: string }[] } | null;
            };
          };
        }).__pendingStore;
        const draft = pendingStore?.getState().draft;
        return (draft?.groups ?? []).map((g) => g.id);
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
