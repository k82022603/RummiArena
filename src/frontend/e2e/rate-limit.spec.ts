/**
 * Rate Limit (429) 처리 E2E 테스트
 *
 * 검증 대상:
 * 1. TC-RL-001: REST API 429 응답 시 토스트 표시
 * 2. TC-RL-002: 토스트에 올바른 한글 메시지 표시
 * 3. TC-RL-003: Retry-After 헤더 값이 메시지에 반영
 * 4. TC-RL-004: 토스트가 자동 소멸 (6초)
 * 5. TC-RL-005: 429 후 자동 재시도 성공
 *
 * 환경: K8s NodePort http://localhost:30000
 * 인증: global-setup.ts에서 생성된 auth.json 세션 재사용
 */

import { test, expect } from "@playwright/test";

test.describe("Rate Limit (429) 처리", () => {
  // ----------------------------------------------------------------
  // TC-RL-001: 로비에서 방 목록 요청 시 429 → 토스트 표시
  // ----------------------------------------------------------------
  test("TC-RL-001: 429 응답 시 rate limit 토스트가 표시된다", async ({
    page,
  }) => {
    // 첫 번째 /api/rooms 요청을 429로 응답하도록 가로채기
    let intercepted = false;
    await page.route("**/api/rooms", (route) => {
      if (!intercepted) {
        intercepted = true;
        return route.fulfill({
          status: 429,
          headers: {
            "Content-Type": "application/json",
            "Retry-After": "3",
          },
          body: JSON.stringify({
            error: {
              code: "RATE_LIMIT",
              message: "Too Many Requests",
            },
          }),
        });
      }
      // 재시도 시 정상 응답
      return route.fulfill({
        status: 200,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ rooms: [], total: 0 }),
      });
    });

    await page.goto("/lobby");
    await page.waitForLoadState("domcontentloaded");

    // 토스트가 나타날 때까지 대기
    const toast = page.locator('[data-testid="rate-limit-toast"]');
    await expect(toast).toBeVisible({ timeout: 10_000 });
  });

  // ----------------------------------------------------------------
  // TC-RL-002: 토스트 메시지가 한글로 표시된다
  // ----------------------------------------------------------------
  test("TC-RL-002: 토스트에 한글 안내 메시지가 표시된다", async ({ page }) => {
    let intercepted = false;
    await page.route("**/api/rooms", (route) => {
      if (!intercepted) {
        intercepted = true;
        return route.fulfill({
          status: 429,
          headers: {
            "Content-Type": "application/json",
            "Retry-After": "5",
          },
          body: JSON.stringify({
            error: { code: "RATE_LIMIT", message: "Too Many Requests" },
          }),
        });
      }
      return route.fulfill({
        status: 200,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ rooms: [], total: 0 }),
      });
    });

    await page.goto("/lobby");
    await page.waitForLoadState("domcontentloaded");

    const toast = page.locator('[data-testid="rate-limit-toast"]');
    await expect(toast).toBeVisible({ timeout: 10_000 });
    await expect(toast).toContainText("요청이 너무 많습니다");
  });

  // ----------------------------------------------------------------
  // TC-RL-003: Retry-After 값이 메시지에 반영된다
  // ----------------------------------------------------------------
  test("TC-RL-003: Retry-After 헤더 값이 토스트 메시지에 반영된다", async ({
    page,
  }) => {
    let intercepted = false;
    await page.route("**/api/rooms", (route) => {
      if (!intercepted) {
        intercepted = true;
        return route.fulfill({
          status: 429,
          headers: {
            "Content-Type": "application/json",
            "Retry-After": "7",
          },
          body: JSON.stringify({
            error: { code: "RATE_LIMIT", message: "Too Many Requests" },
          }),
        });
      }
      return route.fulfill({
        status: 200,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ rooms: [], total: 0 }),
      });
    });

    await page.goto("/lobby");
    await page.waitForLoadState("domcontentloaded");

    const toast = page.locator('[data-testid="rate-limit-toast"]');
    await expect(toast).toBeVisible({ timeout: 10_000 });
    // "7초"가 메시지에 포함
    await expect(toast).toContainText("7초");
  });

  // ----------------------------------------------------------------
  // TC-RL-004: 토스트가 일정 시간 후 자동 소멸된다
  // ----------------------------------------------------------------
  test("TC-RL-004: 토스트가 자동 소멸된다", async ({ page }) => {
    let intercepted = false;
    await page.route("**/api/rooms", (route) => {
      if (!intercepted) {
        intercepted = true;
        return route.fulfill({
          status: 429,
          headers: {
            "Content-Type": "application/json",
            "Retry-After": "1",
          },
          body: JSON.stringify({
            error: { code: "RATE_LIMIT", message: "Too Many Requests" },
          }),
        });
      }
      return route.fulfill({
        status: 200,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ rooms: [], total: 0 }),
      });
    });

    await page.goto("/lobby");
    await page.waitForLoadState("domcontentloaded");

    const toast = page.locator('[data-testid="rate-limit-toast"]');
    await expect(toast).toBeVisible({ timeout: 10_000 });

    // 토스트 지속 시간(6초) + 애니메이션 여유 후 소멸 확인
    await expect(toast).not.toBeVisible({ timeout: 10_000 });
  });

  // ----------------------------------------------------------------
  // TC-RL-005: 429 후 자동 재시도로 정상 데이터 로드
  // ----------------------------------------------------------------
  test("TC-RL-005: 429 후 자동 재시도하여 정상 응답을 처리한다", async ({
    page,
  }) => {
    let callCount = 0;
    await page.route("**/api/rooms", (route) => {
      callCount++;
      if (callCount === 1) {
        // 첫 번째: 429
        return route.fulfill({
          status: 429,
          headers: {
            "Content-Type": "application/json",
            "Retry-After": "1",
          },
          body: JSON.stringify({
            error: { code: "RATE_LIMIT", message: "Too Many Requests" },
          }),
        });
      }
      // 재시도: 정상 응답 (빈 방 목록)
      return route.fulfill({
        status: 200,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ rooms: [], total: 0 }),
      });
    });

    await page.goto("/lobby");
    await page.waitForLoadState("domcontentloaded");

    // 토스트 먼저 표시
    const toast = page.locator('[data-testid="rate-limit-toast"]');
    await expect(toast).toBeVisible({ timeout: 10_000 });

    // 재시도 후 방 목록 영역이 정상 로드 (빈 목록 메시지)
    await expect(
      page.getByText("진행 중인 게임이 없습니다.")
    ).toBeVisible({ timeout: 15_000 });

    // API가 2번 이상 호출되었음을 확인 (재시도 발생)
    expect(callCount).toBeGreaterThanOrEqual(2);
  });

  // ----------------------------------------------------------------
  // TC-RL-006: role="alert" 접근성 속성 존재 확인
  // ----------------------------------------------------------------
  test("TC-RL-006: 토스트에 role=alert aria-live 접근성 속성이 있다", async ({
    page,
  }) => {
    let intercepted = false;
    await page.route("**/api/rooms", (route) => {
      if (!intercepted) {
        intercepted = true;
        return route.fulfill({
          status: 429,
          headers: {
            "Content-Type": "application/json",
            "Retry-After": "3",
          },
          body: JSON.stringify({
            error: { code: "RATE_LIMIT", message: "Too Many Requests" },
          }),
        });
      }
      return route.fulfill({
        status: 200,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ rooms: [], total: 0 }),
      });
    });

    await page.goto("/lobby");
    await page.waitForLoadState("domcontentloaded");

    const toast = page.locator('[data-testid="rate-limit-toast"]');
    await expect(toast).toBeVisible({ timeout: 10_000 });
    await expect(toast).toHaveAttribute("role", "alert");
    await expect(toast).toHaveAttribute("aria-live", "polite");
  });
});
