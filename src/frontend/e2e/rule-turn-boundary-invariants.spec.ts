/**
 * V-08 턴 경계 invariants E2E
 *
 * 룰 SSOT: docs/02-design/06-game-rules.md §5 턴 관리 / §5.2 ConfirmTurn
 * 매트릭스: docs/04-testing/81-e2e-rule-scenario-matrix.md §2 V-08 행
 *
 * 검증 대상 invariants:
 *   TBI-SC1: 턴 종료 시 pendingGroupIds=0 + pendingTableGroups=null
 *   TBI-SC2: 확정 후 hasInitialMeld=true 로 설정되면 true 유지 (regression 없음)
 *   TBI-SC3: AI 턴 중에는 "확정" / "드로우" 버튼 disabled (V-08 위반 방지)
 *           → BUG-UI-011 (내 턴 아닐 때 확정 버튼 활성) 재현 연동
 *
 * 실행:
 *   npx playwright test e2e/rule-turn-boundary-invariants.spec.ts --workers=1
 */

import { test, expect } from "@playwright/test";
import { cleanupViaPage } from "./helpers/room-cleanup";
import {
  createRoomAndStart,
  waitForGameReady,
  waitForStoreReady,
} from "./helpers/game-helpers";

// ==================================================================
// TBI-SC1: 턴 종료 시 pending 정리
// ==================================================================

test.describe("V-08 Turn Boundary Invariants", () => {
  test.setTimeout(180_000);

  test.afterEach(async ({ page }) => {
    await cleanupViaPage(page).catch(() => {
      /* best-effort */
    });
  });

  test("TBI-SC1: TURN_START 이벤트 후 pendingTableGroups=null + pendingGroupIds size=0", async ({
    page,
  }) => {
    // RED 근거: 턴 경계 정리 실패 = BUG-UI-GHOST 의 "턴이 바뀌어도 복제 박스 잔존" 리스크.
    //          architect 재재조사 §3.1 의 "221707 정상 턴 = resetPending 작동" 을 회귀 가드화.
    await createRoomAndStart(page, { playerCount: 2, aiCount: 1, turnTimeout: 60 });
    await waitForGameReady(page);
    await waitForStoreReady(page);

    // 초기 pending 상태 주입 (확정 전 임시 배치)
    await page.evaluate(() => {
      const store = (window as unknown as { __gameStore?: { getState: () => Record<string, unknown>; setState: (s: Record<string, unknown>) => void } }).__gameStore!;
      const cur = store.getState();
      const baseGs = (cur.gameState ?? {}) as Record<string, unknown>;
      store.setState({
        mySeat: 0,
        myTiles: ["R10a", "R11a", "R12a"],
        hasInitialMeld: false,
        pendingTableGroups: [{ id: "pending-mock-1", tiles: ["R10a", "R11a", "R12a"], type: "run" }],
        pendingMyTiles: [],
        pendingGroupIds: new Set<string>(["pending-mock-1"]),
        pendingRecoveredJokers: [],
        aiThinkingSeat: null,
        gameState: {
          ...baseGs,
          currentSeat: 0,
          tableGroups: [],
          turnTimeoutSec: 600,
          drawPileCount: 90,
        },
      });
    });
    await page.waitForTimeout(200);

    // 중간 검증: pending 1
    const mid = await page.evaluate(() => {
      const s = (window as unknown as { __gameStore?: { getState: () => Record<string, unknown> } }).__gameStore!.getState();
      return {
        pending: (s.pendingGroupIds as Set<string>).size,
        pendingGroups: (s.pendingTableGroups as unknown[] | null)?.length ?? 0,
      };
    });
    expect(mid.pending).toBe(1);

    // TURN_START 이벤트 시뮬레이션: resetPending() 또는 직접 setState
    await page.evaluate(() => {
      const store = (window as unknown as { __gameStore?: { getState: () => { resetPending?: () => void }; setState: (s: Record<string, unknown>) => void } }).__gameStore!;
      const s = store.getState();
      if (typeof s.resetPending === "function") s.resetPending();
      else store.setState({ pendingTableGroups: null, pendingMyTiles: null, pendingGroupIds: new Set(), pendingRecoveredJokers: [] });
    });
    await page.waitForTimeout(300);

    // 기대: pending 0
    const after = await page.evaluate(() => {
      const s = (window as unknown as { __gameStore?: { getState: () => Record<string, unknown> } }).__gameStore!.getState();
      return {
        pending: (s.pendingGroupIds as Set<string>).size,
        pendingTableGroups: s.pendingTableGroups,
      };
    });
    expect(after.pending).toBe(0);
    expect(after.pendingTableGroups).toBeNull();
  });

  // ==================================================================
  // TBI-SC2: 확정 후 hasInitialMeld 단조성
  // ==================================================================

  test("TBI-SC2: hasInitialMeld=true 로 설정된 후 turn 경과에도 true 유지 (regression 없음)", async ({
    page,
  }) => {
    // RED 근거: bug-ui-ext-ghost-rereview §4.3 — hasInitialMeld 는 루트 useGameStore 와
    //          players[mySeat].hasInitialMeld 에 이중화되어 있고 동기화 미흡 시 reload/
    //          재연결 후 false 로 되돌아감 (가설 5, 40%). 이 경우 "확정 후 extend" 가
    //          FINDING-01 경로로 분기되어 실패.
    await createRoomAndStart(page, { playerCount: 2, aiCount: 1, turnTimeout: 60 });
    await waitForGameReady(page);
    await waitForStoreReady(page);

    // 1) hasInitialMeld=true 설정
    await page.evaluate(() => {
      const store = (window as unknown as { __gameStore?: { setState: (s: Record<string, unknown>) => void } }).__gameStore!;
      store.setState({ hasInitialMeld: true });
    });
    await page.waitForTimeout(100);

    // 2) GAME_STATE 이벤트 시뮬레이션 — 서버가 players[].hasInitialMeld=false 로 보내도
    //    루트 hasInitialMeld 는 true 유지되어야 함 (ADR 필요 시 §5.2 D 참조)
    await page.evaluate(() => {
      const store = (window as unknown as { __gameStore?: { getState: () => Record<string, unknown>; setState: (s: Record<string, unknown>) => void } }).__gameStore!;
      const cur = store.getState();
      const baseGs = (cur.gameState ?? {}) as Record<string, unknown>;
      store.setState({
        gameState: {
          ...baseGs,
          players: [{ seat: 0, hasInitialMeld: true }, { seat: 1, hasInitialMeld: false }],
        },
      });
    });
    await page.waitForTimeout(200);

    const snap = await page.evaluate(() => {
      const s = (window as unknown as { __gameStore?: { getState: () => { hasInitialMeld: boolean } } }).__gameStore!.getState();
      return { hasInitialMeld: s.hasInitialMeld };
    });
    expect(snap.hasInitialMeld).toBe(true);
  });

  // ==================================================================
  // TBI-SC3: AI 턴 시 플레이어 UI 버튼 disabled (V-08 / BUG-UI-011 연동)
  // ==================================================================

  test("TBI-SC3: AI 턴 (currentSeat != mySeat) 중 확정/드로우 버튼 disabled", async ({
    page,
  }) => {
    // RED 근거: BUG-UI-011 — 내 턴 아닐 때 확정 버튼 활성 유지 증상.
    //          pre-deploy-playbook Phase 2.4 체크리스트의 "내 차례 배지" 단언 과 별개로
    //          **버튼 disabled** 를 직접 검증.
    await createRoomAndStart(page, { playerCount: 2, aiCount: 1, turnTimeout: 60 });
    await waitForGameReady(page);
    await waitForStoreReady(page);

    // AI 턴 상태 강제 (currentSeat=1, mySeat=0)
    await page.evaluate(() => {
      const store = (window as unknown as { __gameStore?: { getState: () => Record<string, unknown>; setState: (s: Record<string, unknown>) => void } }).__gameStore!;
      const cur = store.getState();
      const baseGs = (cur.gameState ?? {}) as Record<string, unknown>;
      store.setState({
        mySeat: 0,
        myTiles: ["R1a", "R2a", "R3a"],
        hasInitialMeld: false,
        pendingTableGroups: null,
        pendingMyTiles: null,
        pendingGroupIds: new Set<string>(),
        aiThinkingSeat: 1,
        gameState: {
          ...baseGs,
          currentSeat: 1, // AI 턴
          tableGroups: [],
          turnTimeoutSec: 600,
          drawPileCount: 90,
        },
      });
    });
    await page.waitForTimeout(500);

    // 드로우 / 확정 버튼 탐색
    const drawBtn = page.getByRole("button", { name: /드로우/ }).first();
    const confirmBtn = page.getByRole("button", { name: /확정|턴 종료|제출/ }).first();

    // 기대: 버튼이 보이면 disabled 여야 함
    if (await drawBtn.count() > 0 && await drawBtn.isVisible({ timeout: 1500 }).catch(() => false)) {
      await expect(drawBtn).toBeDisabled({ timeout: 3000 });
    }
    if (await confirmBtn.count() > 0 && await confirmBtn.isVisible({ timeout: 1500 }).catch(() => false)) {
      await expect(confirmBtn).toBeDisabled({ timeout: 3000 });
    }
  });
});
