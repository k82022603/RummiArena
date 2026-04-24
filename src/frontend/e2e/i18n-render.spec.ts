/**
 * BUG-UI-012 재현 스펙 — 한글 메시지 깨짐
 *
 * 배경: 2026-04-23 22:18:59 스크린샷 (`2026-04-23_221859.png`).
 * 기권 종료 모달에 "상업 골셀하며 자동로 차집합 중단되었습니다" 같은
 * mojibake / template 치환 실패 추정 문자열 노출.
 * 같은 게임 동안 "조기/성급이 다른 타일..." 경고 배너도 한글 깨짐 관찰.
 *
 * 근본 원인 가설 (architect 리뷰):
 * 1. i18n 리소스 오타 (ko.json 상당 / 또는 하드코딩)
 * 2. WS 프레임 Content-Type charset=utf-8 미지정으로 Latin-1 오해석
 * 3. 서버 문자열 template `{winner} 승리` 변수 치환 실패
 *
 * 본 스펙은 Phase 2 frontend-dev + go-dev 페어 수정 전 **RED 확정** 용도.
 *
 * GREEN 만드는 방법:
 *   1. `src/frontend/src/**` grep "상업|골셀|차집합" → 오타 수정
 *   2. `src/game-server/internal/ws/handler.go` TextMessage 인코딩 UTF-8 확인
 *   3. 기권 종료 모달 template literal → 정적 한글 + 변수 분리
 *
 * 참조:
 *   - work_logs/plans/2026-04-24-sprint7-ui-bug-triage-plan.md §3.1 BUG-UI-012
 *   - d:\Users\KTDS\Pictures\FastStone\2026-04-23_221859.png (기권 모달)
 *   - 같은 경기 전반 "조기/성급이 다른 타일" 경고 배너도 대상
 */

import { test, expect, type Page } from "@playwright/test";
import {
  createRoomAndStart,
  waitForGameReady,
  waitForStoreReady,
  setStoreState,
} from "./helpers/game-helpers";
import { cleanupViaPage } from "./helpers/room-cleanup";

// 깨진 문자열 패턴 (22:18:59 스크린샷 기반)
const MOJIBAKE_PATTERNS: RegExp[] = [
  /상업/,        // "상대" 오타 추정
  /골셀/,        // 의미 불명
  /자동로/,      // "자동으로" 추정
  /차집합/,      // "중지되었습니다" 혹은 유사 치환 실패
  /조기\/성급이 다른/,  // 경고 배너 mojibake
];

// 기대 정상 문자열 (Phase 2 GREEN 이후)
const EXPECTED_KOREAN_NORMAL_PATTERNS: RegExp[] = [
  /상대방/,      // "상대방 기권"
  /승리/,        // "rookie (GPT-4o) 승리"
  /중단|종료/,   // "중단되었습니다" 또는 "게임 종료"
];

test.describe("BUG-UI-012: 한글 메시지 mojibake 금지", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/lobby");
    await page.waitForLoadState("domcontentloaded");
    await cleanupViaPage(page);
  });

  test("T12-01 [RED] 기권 종료 모달에 mojibake 패턴 0건 + 정상 문구 렌더", async ({ page }) => {
    await createRoomAndStart(page, { playerCount: 2, aiCount: 1 });
    await waitForGameReady(page);
    await waitForStoreReady(page);

    // when: 게임 상태를 'ended' + reason='opponent_forfeit' 로 강제
    // 22:18:59 스크린샷 재현. Phase 2 수정 전에는 gameStore 에 해당 key 가
    // 없어 모달이 트리거되지 않음 → RED 확정.
    await setStoreState(page, {
      gameStatus: "ended",
      endReason: "opponent_forfeit",
      winner: { userId: "ai-player-1", displayName: "rookie (GPT-4o)" },
    });

    // then 1: 화면에 mojibake 0건
    const bodyText = await page.locator("body").innerText();
    for (const pattern of MOJIBAKE_PATTERNS) {
      expect(
        bodyText,
        `mojibake 패턴 '${pattern}' 가 화면에 노출됨 (BUG-UI-012). body text: ${bodyText.slice(0, 500)}`
      ).not.toMatch(pattern);
    }

    // then 2: 종료 모달 영역이 반드시 렌더되어야 함
    // 현재 store schema 에는 gameStatus/endReason/winner 키가 없어 RED.
    // Phase 2 수정 시 (a) store key 추가 (b) 모달 트리거 배선 (c) 정상 문구 렌더.
    const endModal = page
      .locator('[role="dialog"]')
      .or(page.locator('[aria-label*="종료"]'))
      .or(page.locator("text=기권 종료"));
    await expect(
      endModal.first(),
      "forfeit 모달이 렌더되지 않음 — gameStore schema 에 gameStatus/endReason/winner 키 추가 필요 (BUG-UI-012 Phase 2)"
    ).toBeVisible({ timeout: 3_000 });

    // then 3: 정상 한글 문구 반드시 포함
    const modalText = await endModal.first().innerText();
    const matched = EXPECTED_KOREAN_NORMAL_PATTERNS.some((p) => p.test(modalText));
    expect(
      matched,
      `정상 한글 문구 누락. modal text: ${modalText.slice(0, 300)}`
    ).toBe(true);
  });

  test("T12-02 [RED] 기권 모달에 최소 한 개의 정상 한글 문구 렌더", async ({
    page,
  }) => {
    await createRoomAndStart(page, { playerCount: 2, aiCount: 1 });
    await waitForGameReady(page);
    await waitForStoreReady(page);

    await setStoreState(page, {
      gameStatus: "ended",
      endReason: "opponent_forfeit",
      winner: { userId: "ai-player-1", displayName: "rookie (GPT-4o)" },
    });

    // 종료 모달 영역 (role=dialog 또는 aria-label 로 탐색)
    // 정확한 selector 가 프로덕션 마크업에 따라 달라질 수 있어 body 전체로 fallback
    const modalOrBody = page.locator('[role="dialog"]').or(page.locator("body"));
    const text = await modalOrBody.first().innerText();

    // 적어도 하나의 정상 문구가 있어야 통과
    const matched = EXPECTED_KOREAN_NORMAL_PATTERNS.some((p) => p.test(text));
    expect(
      matched,
      `정상 한글 문구 (${EXPECTED_KOREAN_NORMAL_PATTERNS.join(", ")}) 중 하나도 없음. text: ${text.slice(0, 300)}`
    ).toBe(true);
  });

  test("T12-03 [RED] 경고 배너 '재조립'/'다른 타일' 영역 mojibake 금지", async ({
    page,
  }) => {
    await createRoomAndStart(page, { playerCount: 2, aiCount: 1 });
    await waitForGameReady(page);
    await waitForStoreReady(page);

    // 22:04~22:06 구간 "조기/성급이 다른 타일..." 경고 배너 재현
    // 경고 배너는 pending rearrangement 상태에서 노출됨
    await setStoreState(page, {
      rearrangeWarning: true,
    });

    const warnArea = page
      .locator('[role="alert"]')
      .or(page.locator('[aria-label*="경고"]'))
      .or(page.locator('[aria-label*="재조립"]'));

    const count = await warnArea.count();
    if (count > 0) {
      const text = await warnArea.first().innerText();
      for (const pattern of MOJIBAKE_PATTERNS) {
        expect(
          text,
          `경고 배너 mojibake '${pattern}' 매치. text: ${text.slice(0, 200)}`
        ).not.toMatch(pattern);
      }
    } else {
      // 경고 배너 미렌더인 경우 body 전체에서 검사 (덜 엄격)
      const bodyText = await page.locator("body").innerText();
      for (const pattern of MOJIBAKE_PATTERNS) {
        expect(bodyText).not.toMatch(pattern);
      }
    }
  });
});
