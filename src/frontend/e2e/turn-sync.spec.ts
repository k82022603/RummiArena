/**
 * BUG-UI-011 재현 스펙 — 턴 동기화 실패
 *
 * 배경: 2026-04-23 22:12:37 스크린샷 (`2026-04-23_221237.png`).
 * AI 턴이 진행 중인데 플레이어 측 action 버튼(제출하기 / 되돌리기 / 새 그룹)
 * 이 활성화되어 있는 상태로 촬영됨. 동시에 그룹 멜드(7 triplet)가 일시 소실.
 *
 * 근본 원인 가설 (architect 리뷰):
 * - `isMyTurn = game.currentPlayerId === session.userId` 계산이
 *   WebSocket `TURN_CHANGED` 이벤트 수신 후 useMemo 재계산 타이밍에서 누락
 * - 또는 `ActionBar` 렌더 조건에 `disabled={!isMyTurn}` 전수 적용 안 됨
 *
 * 본 스펙은 Phase 2 frontend-dev 구현 전 **RED 확정** 용도.
 * 현재 (qa/pre-deploy-playbook-gate 브랜치, pre-fix) 에서는 FAIL 이어야 정상.
 *
 * GREEN 만드는 방법 (Phase 2 담당 frontend-dev 참고):
 *   1. `src/frontend/src/app/game/[roomId]/GameClient.tsx` 의 isMyTurn SSOT 강제
 *   2. `ActionBar` 및 자식 버튼 모두 `disabled={!isMyTurn}`
 *   3. WS `TURN_CHANGED` 수신 시 `currentPlayerId` store 업데이트 직후 렌더 강제
 *
 * 참조:
 *   - work_logs/plans/2026-04-24-sprint7-ui-bug-triage-plan.md §3.1 BUG-UI-011
 *   - work_logs/scrums/2026-04-24-01.md §5 QA 반성
 *   - d:\Users\KTDS\Pictures\FastStone\2026-04-23_221237.png
 */

import { test, expect, type Page } from "@playwright/test";
import {
  createRoomAndStart,
  waitForGameReady,
  waitForStoreReady,
  setStoreState,
} from "./helpers/game-helpers";
import { cleanupViaPage } from "./helpers/room-cleanup";

test.describe("BUG-UI-011: AI 턴 중 플레이어 버튼 활성화 금지", () => {
  test.beforeEach(async ({ page }) => {
    // 이전 테스트 잔존 방 정리
    await page.goto("/lobby");
    await page.waitForLoadState("domcontentloaded");
    await cleanupViaPage(page);
  });

  test("T11-01 [RED] AI 턴 상태일 때 ActionBar 모든 버튼은 disabled", async ({
    page,
  }) => {
    // given: 2인 방 생성 (사용자 + AI 1명), 게임 시작
    await createRoomAndStart(page, {
      playerCount: 2,
      aiCount: 1,
      turnTimeout: 120,
    });
    await waitForGameReady(page);
    await waitForStoreReady(page);

    // when: store 의 currentPlayerId 를 AI 로 강제 세팅 (22:12:37 재현)
    // 실제 사용자 플레이에서는 WS TURN_CHANGED 로 진입하는 상태이나
    // E2E 에서는 store bridge 를 통해 동일 상태 모사
    await setStoreState(page, {
      currentPlayerId: "ai-player-1", // 사용자 userId 와 달라야 isMyTurn=false
    });

    // then: ActionBar 가 보이면 안 됨 (또는 모든 버튼 disabled)
    // 현재 구현은 isMyTurn=false 시 ActionBar 를 숨기거나 disabled 해야 함
    const actionBar = page.locator('[aria-label="게임 액션"]');

    // RED 확정 포인트 1: ActionBar 가 AI 턴에도 보이면 안 되는데
    // 버그 환경에서는 보인다. hidden 이 기대값.
    await expect(actionBar).toBeHidden({ timeout: 3_000 });
  });

  test("T11-02 [RED] AI 턴 중 '제출하기' 버튼 disabled 또는 미렌더", async ({
    page,
  }) => {
    await createRoomAndStart(page, { playerCount: 2, aiCount: 1 });
    await waitForGameReady(page);
    await waitForStoreReady(page);

    await setStoreState(page, {
      currentPlayerId: "ai-player-1",
    });

    // 제출하기 버튼 탐색
    const submitBtn = page.getByRole("button", { name: /제출/ });
    const count = await submitBtn.count();

    if (count === 0) {
      // 미렌더도 GREEN 조건 (isMyTurn=false 시 ActionBar 자체 숨김)
      expect(count).toBe(0);
    } else {
      // 렌더되어 있다면 반드시 disabled
      await expect(submitBtn.first()).toBeDisabled({ timeout: 3_000 });
    }
  });

  test("T11-03 [RED] AI 턴 중 '되돌리기' + '새 그룹' 버튼 모두 disabled", async ({
    page,
  }) => {
    await createRoomAndStart(page, { playerCount: 2, aiCount: 1 });
    await waitForGameReady(page);
    await waitForStoreReady(page);

    await setStoreState(page, {
      currentPlayerId: "ai-player-1",
    });

    // 되돌리기 + 새 그룹 버튼 각각 점검
    const undoBtn = page.getByRole("button", { name: /되돌리기/ });
    const newGroupBtn = page.getByRole("button", { name: /새 그룹|새그룹/ });

    for (const btn of [undoBtn, newGroupBtn]) {
      const cnt = await btn.count();
      if (cnt > 0) {
        await expect(btn.first()).toBeDisabled({ timeout: 3_000 });
      }
    }

    // F5 결정 (architect 옵션 C): T11-01 ActionBar hidden 정책과 정합.
    // AI 턴에는 ActionBar 전체 hidden (PR #78 isMyTurn SSOT) 이므로
    // 되돌리기/새 그룹 버튼이 totalCount=0 이어도 FAIL 이 아니다.
    // T11-01 이 이미 hidden 을 검증하므로 여기서 중복 가드는 자기 모순.
    // 버튼이 렌더된 경우에만 disabled 검증 (방어적) — 가드 삭제.
    // 참조: work_logs/plans/tmp-analysis/f3-f4-f5-architect-guide.md §3.3
  });
});
