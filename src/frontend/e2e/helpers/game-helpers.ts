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
