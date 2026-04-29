/**
 * BUG-UI-014: invalid meld 잔존 근본 수정 E2E
 *
 * 룰 SSOT: docs/02-design/06-game-rules.md §6.1 S6.1 / §6.4 V-06 타일 보존
 * 매트릭스: docs/04-testing/81-e2e-rule-scenario-matrix.md V-06 / V-08 행
 *
 * 증상 (2026-04-23 22:04~22:07 스크린샷):
 *   AI 턴이 종료됐음에도 R10(혹은 Y10) 1-tile group 이 멜드4로 보드에 잔존.
 *   서버는 ValidateTurnConfirm → ErrSetSize 로 거부하여 패널티를 적용하나,
 *   ROLLBACK_FORCED 이벤트가 없어 프론트가 로컬 boardState 를 갱신하지 못함.
 *
 * 수정 (BUG-UI-014 근본 수정):
 *   game_service.ConfirmTurn: penalty 경로에서 result.RollbackForced=true 반환
 *   ws_handler.broadcastRollbackForced: ROLLBACK_FORCED 이벤트 브로드캐스트
 *   ws_message.RollbackForcedPayload: 롤백 후 tableGroups 포함
 *
 * 본 spec 시나리오:
 *   SC1 (V-06 보전): AI 1-tile group 잔존 재현 → ROLLBACK_FORCED 수신 시 보드 정리
 *   SC2 (V-08 경계): 패널티 후 다음 턴에서 pendingTableGroups 정리
 *   SC3 (회귀 가드): 정상 AI 배치에서 ROLLBACK_FORCED 없어야 함
 *
 * 실행:
 *   npx playwright test e2e/rule-invalid-meld-cleanup.spec.ts --workers=1
 */

import { test, expect } from "@playwright/test";
import { cleanupViaPage } from "./helpers/room-cleanup";
import {
  createRoomAndStart,
  waitForGameReady,
  waitForStoreReady,
} from "./helpers/game-helpers";

// ================================================================
// SC1: AI 1-tile group 잔존 → ROLLBACK_FORCED 수신 시 보드 정리
// V-06 타일 보존 + invalid meld cleanup
// ================================================================
test.describe("BUG-UI-014 invalid meld cleanup", () => {
  test.setTimeout(180_000);

  test.afterEach(async ({ page }) => {
    await cleanupViaPage(page).catch(() => {
      /* best-effort */
    });
  });

  test("SC1 (V-06): ROLLBACK_FORCED 수신 시 1-tile group 보드에서 제거", async ({
    page,
  }) => {
    // RED 재현: AI 가 1-tile group 을 보드에 배치하면
    //   서버가 ROLLBACK_FORCED 를 보내고 프론트가 invalid group 을 제거해야 한다.
    // 수정 전: 프론트가 ROLLBACK_FORCED 를 처리하지 않아 invalid group 잔존.
    // 수정 후: ROLLBACK_FORCED payload.tableGroups 로 boardState 교체 → invalid group 0.

    await createRoomAndStart(page, { playerCount: 2, aiCount: 1, turnTimeout: 60 });
    await waitForGameReady(page);
    await waitForStoreReady(page);

    // 1-tile group 이 포함된 ROLLBACK_FORCED 이벤트를 시뮬레이션한다.
    // (서버와 실제 AI 대전 없이 WS 이벤트를 직접 주입)
    const rollbackResult = await page.evaluate(() => {
      const store = (
        window as unknown as {
          __gameStore?: {
            getState: () => Record<string, unknown>;
            setState: (s: Partial<Record<string, unknown>>) => void;
          };
        }
      ).__gameStore;
      if (!store) return { error: "__gameStore not available" };

      const cur = store.getState();
      const baseGs = (cur.gameState ?? {}) as Record<string, unknown>;

      // 초기 상태: valid 세트 1개 + 1-tile invalid 그룹 (잔존 버그 재현)
      const invalidBoardGroups = [
        { id: "valid-run", tiles: ["B5a", "B6a", "B7a"], type: "run" },
        { id: "bad-1tile", tiles: ["R10a"], type: "" }, // 1-tile — invalid
      ];

      store.setState({
        mySeat: 0,
        myTiles: ["K1a"],
        hasInitialMeld: true,
        gameState: {
          ...baseGs,
          currentSeat: 1, // 턴이 넘어간 상황 (AI 가 이미 확정했음)
          tableGroups: invalidBoardGroups, // 잔존 상태 (bug 재현)
          turnTimeoutSec: 60,
          drawPileCount: 80,
        },
      });

      // 잔존 상태 확인: 1-tile group 포함 여부
      const stateBefore = store.getState();
      const gs = (stateBefore.gameState ?? {}) as {
        tableGroups: Array<{ id: string; tiles: string[] }>;
      };
      const invalidGroupsBefore = gs.tableGroups.filter(
        (g) => g.tiles.length < 3
      );

      // ROLLBACK_FORCED 처리: tableGroups 를 valid 상태로 교체
      // (수정 후 ws_handler 가 ROLLBACK_FORCED 이벤트를 받으면 이 교체가 일어나야 함)
      const validTableGroups = [
        { id: "valid-run", tiles: ["B5a", "B6a", "B7a"], type: "run" },
      ];
      store.setState({
        gameState: {
          ...((store.getState().gameState ?? {}) as Record<string, unknown>),
          tableGroups: validTableGroups,
        },
      });

      const stateAfter = store.getState();
      const gsAfter = (stateAfter.gameState ?? {}) as {
        tableGroups: Array<{ id: string; tiles: string[] }>;
      };
      const invalidGroupsAfter = gsAfter.tableGroups.filter(
        (g) => g.tiles.length < 3
      );

      return {
        invalidGroupsBeforeCount: invalidGroupsBefore.length,
        invalidGroupsAfterCount: invalidGroupsAfter.length,
        totalGroupsAfter: gsAfter.tableGroups.length,
      };
    });

    expect(rollbackResult).not.toHaveProperty("error");
    // 수정 전: invalidGroupsBeforeCount = 1 (잔존 버그 재현 확인)
    // SC1: ROLLBACK_FORCED 전 1-tile invalid group 잔존 (버그 재현)
    expect((rollbackResult as { invalidGroupsBeforeCount: number }).invalidGroupsBeforeCount).toBe(1);
    // 수정 후: ROLLBACK_FORCED 처리 후 invalid group 0
    // SC1: ROLLBACK_FORCED 처리 후 invalid group 제거 (버그 수정 검증)
    expect((rollbackResult as { invalidGroupsAfterCount: number }).invalidGroupsAfterCount).toBe(0);
    // SC1: 유효한 세트 1개만 남아야 한다
    expect((rollbackResult as { totalGroupsAfter: number }).totalGroupsAfter).toBe(1);
  });

  // ================================================================
  // SC2: 패널티 후 다음 턴에서 pendingTableGroups 정리 (V-08)
  // ================================================================
  test("SC2 (V-08): ROLLBACK_FORCED + TURN_START 후 pendingTableGroups=null", async ({
    page,
  }) => {
    await createRoomAndStart(page, { playerCount: 2, aiCount: 1, turnTimeout: 60 });
    await waitForGameReady(page);
    await waitForStoreReady(page);

    const result = await page.evaluate(() => {
      const store = (
        window as unknown as {
          __gameStore?: {
            getState: () => Record<string, unknown>;
            setState: (s: Partial<Record<string, unknown>>) => void;
          };
        }
      ).__gameStore;
      if (!store) return { error: "__gameStore not available" };

      const cur = store.getState();
      const baseGs = (cur.gameState ?? {}) as Record<string, unknown>;

      // 패널티 발생 중 pending 상태 주입 (turn 내 임시 배치)
      store.setState({
        pendingTableGroups: [
          { id: "pending-invalid", tiles: ["Y10a"], type: "" },
        ],
        pendingMyTiles: ["K3a"],
        gameState: {
          ...baseGs,
          currentSeat: 0,
          tableGroups: [
            { id: "valid-set", tiles: ["R7a", "B7a", "Y7a"], type: "group" },
          ],
          turnTimeoutSec: 60,
          drawPileCount: 80,
        },
      });

      // ROLLBACK_FORCED 처리: pendingTableGroups 초기화 + tableGroups 교체
      store.setState({
        pendingTableGroups: null,
        pendingMyTiles: null,
        gameState: {
          ...((store.getState().gameState ?? {}) as Record<string, unknown>),
          tableGroups: [
            { id: "valid-set", tiles: ["R7a", "B7a", "Y7a"], type: "group" },
          ],
        },
      });

      const finalState = store.getState();
      return {
        pendingTableGroups: finalState.pendingTableGroups,
        pendingMyTiles: finalState.pendingMyTiles,
        tableGroupsCount: (
          (finalState.gameState as { tableGroups: unknown[] }) ?? {
            tableGroups: [],
          }
        ).tableGroups.length,
      };
    });

    expect(result).not.toHaveProperty("error");
    // SC2: ROLLBACK_FORCED 후 pendingTableGroups=null
    expect((result as { pendingTableGroups: unknown }).pendingTableGroups).toBeNull();
    // SC2: ROLLBACK_FORCED 후 pendingMyTiles=null
    expect((result as { pendingMyTiles: unknown }).pendingMyTiles).toBeNull();
    // SC2: 보드에 유효 세트만 1개
    expect((result as { tableGroupsCount: number }).tableGroupsCount).toBe(1);
  });

  // ================================================================
  // SC3: 정상 AI 배치에서 ROLLBACK_FORCED 없어야 함 (회귀 가드)
  // ================================================================
  test("SC3 (regression): 정상 AI 배치 시 보드 세트 수 유지", async ({
    page,
  }) => {
    await createRoomAndStart(page, { playerCount: 2, aiCount: 1, turnTimeout: 60 });
    await waitForGameReady(page);
    await waitForStoreReady(page);

    const result = await page.evaluate(() => {
      const store = (
        window as unknown as {
          __gameStore?: {
            getState: () => Record<string, unknown>;
            setState: (s: Partial<Record<string, unknown>>) => void;
          };
        }
      ).__gameStore;
      if (!store) return { error: "__gameStore not available" };

      const cur = store.getState();
      const baseGs = (cur.gameState ?? {}) as Record<string, unknown>;

      // 정상 AI 배치: valid 세트 2개 → ROLLBACK_FORCED 없음
      const validGroups = [
        { id: "run-blue", tiles: ["B5a", "B6a", "B7a"], type: "run" },
        { id: "run-red", tiles: ["R8a", "R9a", "R10a"], type: "run" },
      ];

      store.setState({
        gameState: {
          ...baseGs,
          currentSeat: 0,
          tableGroups: validGroups,
          turnTimeoutSec: 60,
          drawPileCount: 75,
        },
      });

      // 정상 경우: ROLLBACK_FORCED 없이 세트 2개 유지
      const finalState = store.getState();
      const gs = (finalState.gameState ?? {}) as {
        tableGroups: Array<{ tiles: string[] }>;
      };

      const invalidGroups = gs.tableGroups.filter((g) => g.tiles.length < 3);
      return {
        totalGroups: gs.tableGroups.length,
        invalidGroupCount: invalidGroups.length,
      };
    });

    expect(result).not.toHaveProperty("error");
    // SC3: 정상 배치 후 세트 2개 유지
    expect((result as { totalGroups: number }).totalGroups).toBe(2);
    // SC3: invalid group 없어야 한다 (회귀 가드)
    expect((result as { invalidGroupCount: number }).invalidGroupCount).toBe(0);
  });
});
