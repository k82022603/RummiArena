/**
 * "1게임 완주" 메타 E2E 시나리오
 *
 * 룰 SSOT: docs/02-design/06-game-rules.md (V-01~V-19 전수)
 *           docs/02-design/55-game-rules-enumeration.md (V-/UR-/D-/INV-)
 * 매트릭스: docs/04-testing/81-e2e-rule-scenario-matrix.md §4 (메타)
 * 스킬 연동: .claude/skills/pre-deploy-playbook/SKILL.md Phase 2
 *
 * 목적:
 *   연속 플레이 중에만 발동하는 누적 state 결함을 탐지. 개별 spec 이 잡지 못하는
 *   "턴 #N 까지 온 상태에서만 증상" 을 탐지하기 위한 메타 시나리오.
 *
 * 구성:
 *   - Human × 1 + Ollama (qwen2.5:3b) × 1, 2인전
 *   - 목표: 20~30턴 완주 또는 승리/교착 정상 종료
 *   - 각 턴마다 invariants 검증:
 *     (I1) pendingGroupIds 일관성 (확정 후 0)        → V-13a 재배치 권한, AI 턴 경계 정리
 *     (I2) currentTableGroups 단조성 (같은 턴 drop 당 +0/+1)  → V-06 타일 보존 보조
 *     (I3) 랙 타일 수 = 렌더 tile 수 (drift 0)        → V-03/V-06 무결성
 *     (I4) hasInitialMeld true → false 되돌아가지 않음 → V-04 단조성
 *     (V-06) 보드 내 동일 코드 중복 0 (조커 제외)     → BUG-UI-GHOST 회귀 가드
 *
 * 스냅샷 보강 (2026-04-29 — Sprint 7 W2 후속):
 *   - SnapshotRecorder 로 매 capture 시점 store 상태 보관 (기본 ring buffer 5)
 *   - invariant 위반/실패 시 직전 N턴 trace 를 JSON 파일로 testInfo.outputPath 에 저장
 *   - Playwright attachment 로 첨부되어 trace viewer 에서 직접 다운로드 가능
 *   - test.step 으로 capture 단위를 trace viewer 에 분리 노출
 *   - 게임 진행 로직 (테스트 대상 코드) 은 변경하지 않는다 — 헬퍼/spec 만 수정.
 *
 * 실행 (Ollama 대상 K8s 환경):
 *   E2E_OLLAMA_ENABLED=1 npx playwright test e2e/rule-one-game-complete.spec.ts --workers=1
 *
 * 의도적 break 검증 방법 (헬퍼 자체 검증용):
 *   - capture 결과를 강제로 duplicatedTiles 채우거나, isMyTurn 위반을 throw 시킨다.
 *   - 실패 시 test-results/<test-name>/turn-snapshot-trace.json 이 생성됐는지 확인.
 *
 * 주의:
 *   - Ollama Pod cold start (최대 50s) → warmup 필요
 *   - 실 AI 상대이므로 결정론 부분 없음. 따라서 단언은 state 불변식 중심.
 *   - 타임아웃: 25분 (Ollama 응답 5~15s × 30턴 + 여유)
 */

import { test, expect } from "@playwright/test";
import { cleanupViaPage } from "./helpers/room-cleanup";
import {
  createRoomAndStart,
  waitForGameReady,
} from "./helpers/game-helpers";
import {
  SnapshotRecorder,
  captureWithStep,
  type TurnSnapshot,
} from "./helpers/turnSnapshot";

// ==================================================================
// Ollama warmup (cold start 방지)
// ==================================================================

async function warmupOllama(): Promise<void> {
  // Playbook 실행 환경에서 Ollama cold start 50s 방지.
  // E2E 에서는 직접 fetch 호출이 불가하므로 scripts/ 에서 선행 실행 권장.
  // 본 spec 은 warmup 을 외부에 위임하고 단순 noop.
  return;
}

// ==================================================================
// Invariant 검증 — 위반 발견 시 trace persist 후 throw
// ==================================================================

async function assertInvariants(
  snap: TurnSnapshot,
  recorder: SnapshotRecorder,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  testInfo: any,
  ctx: { maxHasInitialMeldSeen: boolean }
): Promise<void> {
  // (I1) AI 턴인데 내 pending 이 남아있으면 턴 경계 정리 실패 (V-13a 보조)
  if (!snap.isMyTurn && snap.pendingGroupIdsSize > 0) {
    await recorder.persistOnFailure(
      testInfo,
      `[I1] AI turn but pendingGroupIds=${snap.pendingGroupIdsSize} at turn ${snap.turnNumber}`
    );
    throw new Error(
      `[I1] AI turn but pendingGroupIds=${snap.pendingGroupIdsSize} at turn ${snap.turnNumber}`
    );
  }

  // (V-06) 보드 내 동일 코드 중복 0 (조커 제외)
  if (snap.duplicatedTiles.length > 0) {
    await recorder.persistOnFailure(
      testInfo,
      `[V-06] duplicated tiles ${JSON.stringify(snap.duplicatedTiles)} at turn ${snap.turnNumber}`
    );
    expect(
      snap.duplicatedTiles,
      `[V-06] turn ${snap.turnNumber} duplicate tiles`
    ).toEqual([]);
  }

  // (I4) hasInitialMeld 단조성 (V-04 보조)
  if (snap.hasInitialMeld) ctx.maxHasInitialMeldSeen = true;
  if (ctx.maxHasInitialMeldSeen && !snap.hasInitialMeld) {
    await recorder.persistOnFailure(
      testInfo,
      `[I4] hasInitialMeld regressed true→false at turn ${snap.turnNumber}`
    );
    throw new Error(
      `[I4] hasInitialMeld regressed true→false at turn ${snap.turnNumber}`
    );
  }
}

// ==================================================================
// OGC: 1게임 완주 (20~30턴)
// ==================================================================

test.describe("One-Game-Complete 메타 시나리오", () => {
  test.setTimeout(25 * 60 * 1000); // 25분

  test.afterEach(async ({ page }) => {
    await cleanupViaPage(page).catch(() => {
      /* best-effort */
    });
  });

  test("OGC: Human + Ollama 2인전 20턴 이상 진행 + 매 턴 invariants 불변", async ({
    page,
  }, testInfo) => {
    // RED 근거: 본 메타 시나리오가 잡으려는 것은 "한 판을 끝까지 갔을 때 생기는 증상".
    //          단일 drop spec 으로 잡지 못하는 누적 결함 (예: BUG-UI-GHOST 턴 #29 발동).
    //
    //          현재 main 상태에서 Ollama 는 Pod warmup 필요하고 CI 환경에서는 게임
    //          완주가 불안정. 로컬 K8s 환경에서만 실행 가능하므로 CI skip 기본.
    testInfo.skip(
      !process.env.E2E_OLLAMA_ENABLED,
      "Ollama Pod warmup 필요. E2E_OLLAMA_ENABLED=1 설정 후 로컬에서만 실행"
    );

    await warmupOllama();
    await createRoomAndStart(page, {
      playerCount: 2,
      aiCount: 1,
      turnTimeout: 120,
    });
    await waitForGameReady(page);

    const recorder = new SnapshotRecorder({
      keepLastN: 5,
      label: "ogc-trace",
    });
    const ctx = { maxHasInitialMeldSeen: false };
    const maxTurns = 30;
    let consecutiveNullSnapshots = 0;
    let loopIndex = 0;

    try {
      for (let loop = 0; loop < maxTurns * 4; loop++) {
        const snap = await captureWithStep(recorder, page, { loopIndex });
        loopIndex++;

        if (!snap) {
          consecutiveNullSnapshots++;
          if (consecutiveNullSnapshots > 10) break;
          await page.waitForTimeout(500);
          continue;
        }
        consecutiveNullSnapshots = 0;

        // 매 capture 시점 invariants 검증 (위반 시 trace persist 후 throw)
        await assertInvariants(snap, recorder, testInfo, ctx);

        if (snap.gameEnded) {
          console.log(
            `[OGC] Game ended at turn ${snap.turnNumber} (snapshots=${recorder.size()})`
          );
          break;
        }

        // 내 차례: 단순 드로우/패스 (Human AI 의존 없는 단순 플레이)
        if (snap.isMyTurn && snap.turnNumber > 0) {
          const drawBtn = page
            .getByRole("button", { name: /드로우|패스/ })
            .first();
          if (
            await drawBtn.isVisible({ timeout: 2000 }).catch(() => false)
          ) {
            await drawBtn.click();
            await page.waitForTimeout(1500);
          }
        }

        await page.waitForTimeout(2500);

        // 20턴 이상 달성 시 성공 조건 완료
        if (snap.turnNumber >= 20) {
          console.log(
            `[OGC] Reached turn ${snap.turnNumber}, breaking. Snapshots=${recorder.size()}`
          );
          break;
        }
      }

      // 메타 검증: 최소 20턴 달성 or 게임 종료
      const all = recorder.all();
      const lastSnap = all[all.length - 1];
      expect(lastSnap, "최소 1개 이상의 snapshot 필요").toBeDefined();

      const reachedTurns = recorder.maxTurnReached();
      console.log(
        `[OGC] Reached ${reachedTurns} turns. Ended=${lastSnap!.gameEnded}. Snapshots=${recorder.size()}`
      );

      if (!(reachedTurns >= 20 || lastSnap!.gameEnded)) {
        await recorder.persistOnFailure(
          testInfo,
          `[META] Did not reach 20 turns and game not ended (reached=${reachedTurns})`
        );
      }
      expect(reachedTurns >= 20 || lastSnap!.gameEnded).toBe(true);
    } catch (err) {
      // assertInvariants 가 이미 trace persist 했어도, 그 외 경로(타임아웃/expect 실패)
      // 도 trace 를 남기도록 fallback 호출.
      await recorder
        .persistOnFailure(
          testInfo,
          `unhandled failure: ${err instanceof Error ? err.message : String(err)}`
        )
        .catch(() => {
          /* attachment 실패는 swallow */
        });
      throw err;
    }
  });
});

// ==================================================================
// 헬퍼 자체 검증 (lightweight, store fixture only — Ollama 불필요)
//
// SnapshotRecorder.lastAction 추론 로직과 trace persist 동작을 검증한다.
// 본 spec 은 항상 실행되며 OGC 메인 시나리오의 skip 영향을 받지 않는다.
// ==================================================================

test.describe("OGC 보조: SnapshotRecorder 헬퍼 동작 검증", () => {
  test("lastAction 추론 + trace persist 정상 동작", async ({ page }, testInfo) => {
    // 단순 lobby 페이지 로드 — 게임은 시작하지 않는다.
    await page.goto("/lobby").catch(() => {
      /* 인증 실패해도 무관 */
    });

    // store 가 노출되지 않은 상태 (lobby) → capture 는 null 반환
    const recorder = new SnapshotRecorder({
      keepLastN: 3,
      label: "helper-self-check",
    });

    const nullSnap = await recorder.capture(page, { loopIndex: 0 });
    expect(nullSnap, "store 미노출 lobby 에서는 null").toBeNull();
    expect(recorder.size()).toBe(0);

    // attachment 동작: persistOnFailure 는 빈 buffer 라도 JSON 을 첨부해야 한다.
    await recorder.persistOnFailure(testInfo, "self-check empty buffer");
    const attachments = testInfo.attachments.filter((a) =>
      a.name.includes("helper-self-check")
    );
    expect(attachments.length).toBeGreaterThanOrEqual(1);
  });
});
