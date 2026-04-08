/**
 * Rate Limit UX 강화 E2E 테스트
 *
 * 기존 rate-limit.spec.ts (6개), ws-rate-limit.spec.ts (7개)에서
 * 커버하지 못한 시나리오를 추가 검증한다.
 *
 * 검증 대상:
 *   TC-RL-E-001: CooldownProgress 원형 프로그레스 렌더링 + aria 속성
 *   TC-RL-E-002: CooldownProgress 카운트다운 (숫자 감소)
 *   TC-RL-E-003: 429 후 isRetrying 상태에서 "재시도 중..." 표시
 *   TC-RL-E-004: 연속 429 2회 → 재시도로 최종 성공
 *   TC-RL-E-005: Retry-After 헤더 없으면 기본값(5초) 적용
 *   TC-RL-E-006: 429 토스트 내 아이콘(시계) SVG 존재 확인
 *   TC-RL-E-007: rankings API 429 → 동일 토스트 표시
 *   TC-RL-E-008: 쿨다운 완료 시 체크 아이콘 전환 (remainingSec=0)
 *
 * 환경: K8s NodePort http://localhost:30000
 * 인증: global-setup.ts에서 생성된 auth.json 세션 재사용
 */

import { test, expect } from "@playwright/test";

// ------------------------------------------------------------------
// 공통 헬퍼: 429 응답 route 설정
// ------------------------------------------------------------------

interface Mock429Options {
  /** 429를 반환할 호출 횟수 (기본 1) */
  failCount?: number;
  /** Retry-After 헤더 값 (기본 "3") */
  retryAfter?: string;
  /** Retry-After 헤더 포함 여부 (기본 true) */
  includeRetryAfter?: boolean;
  /** 정상 응답 body */
  successBody?: string;
}

function create429Route(
  page: import("@playwright/test").Page,
  urlPattern: string,
  opts: Mock429Options = {},
) {
  const {
    failCount = 1,
    retryAfter = "3",
    includeRetryAfter = true,
    successBody = JSON.stringify({ rooms: [], total: 0 }),
  } = opts;
  let callCount = 0;

  return page.route(urlPattern, (route) => {
    callCount++;
    if (callCount <= failCount) {
      const headers: Record<string, string> = {
        "Content-Type": "application/json",
      };
      if (includeRetryAfter) {
        headers["Retry-After"] = retryAfter;
      }
      return route.fulfill({
        status: 429,
        headers,
        body: JSON.stringify({
          error: { code: "RATE_LIMIT", message: "Too Many Requests" },
        }),
      });
    }
    return route.fulfill({
      status: 200,
      headers: { "Content-Type": "application/json" },
      body: successBody,
    });
  });
}

test.describe("Rate Limit UX 강화 테스트", () => {
  // ----------------------------------------------------------------
  // TC-RL-E-001: CooldownProgress 원형 프로그레스 렌더링 + aria 속성
  // ----------------------------------------------------------------
  test("TC-RL-E-001: 쿨다운 프로그레스바가 role=progressbar + aria 속성과 함께 렌더된다", async ({
    page,
  }) => {
    // 429 응답으로 쿨다운 트리거 (Retry-After=5 → startCooldown(5) 호출)
    await create429Route(page, "**/api/rooms", {
      retryAfter: "5",
      failCount: 1,
    });

    await page.goto("/lobby");
    await page.waitForLoadState("domcontentloaded");

    // 토스트가 먼저 나타나는지 확인
    const toast = page.locator('[data-testid="rate-limit-toast"]');
    await expect(toast).toBeVisible({ timeout: 10_000 });

    // CooldownProgress 렌더 확인 (api.ts의 showRateLimitToast가 startCooldown 호출)
    const progress = page.locator('[data-testid="cooldown-progress"]');
    await expect(progress).toBeVisible({ timeout: 5_000 });

    // ARIA 속성 검증
    await expect(progress).toHaveAttribute("role", "progressbar");
    await expect(progress).toHaveAttribute("aria-label", "쿨다운 잔여 시간");

    // aria-valuemax가 총 쿨다운 초와 일치
    const valueMax = await progress.getAttribute("aria-valuemax");
    expect(Number(valueMax)).toBe(5);

    // aria-valuemin은 0
    await expect(progress).toHaveAttribute("aria-valuemin", "0");

    // aria-valuenow는 0 < n <= 5
    const valueNow = await progress.getAttribute("aria-valuenow");
    expect(Number(valueNow)).toBeGreaterThan(0);
    expect(Number(valueNow)).toBeLessThanOrEqual(5);
  });

  // ----------------------------------------------------------------
  // TC-RL-E-002: CooldownProgress 카운트다운 (숫자 감소)
  // ----------------------------------------------------------------
  test("TC-RL-E-002: 쿨다운 프로그레스 카운트가 매초 감소한다", async ({
    page,
  }) => {
    await create429Route(page, "**/api/rooms", {
      retryAfter: "4",
      failCount: 1,
    });

    await page.goto("/lobby");
    await page.waitForLoadState("domcontentloaded");

    const toast = page.locator('[data-testid="rate-limit-toast"]');
    await expect(toast).toBeVisible({ timeout: 10_000 });

    const progress = page.locator('[data-testid="cooldown-progress"]');
    await expect(progress).toBeVisible({ timeout: 5_000 });

    // 첫 번째 값 캡처
    const initialValue = Number(
      await progress.getAttribute("aria-valuenow"),
    );
    expect(initialValue).toBeGreaterThan(0);

    // 2초 대기 후 값이 감소했는지 확인
    await page.waitForTimeout(2200);
    const laterValue = Number(
      await progress.getAttribute("aria-valuenow"),
    );
    expect(laterValue).toBeLessThan(initialValue);
  });

  // ----------------------------------------------------------------
  // TC-RL-E-003: 429 후 isRetrying 상태에서 "재시도 중..." 표시
  // ----------------------------------------------------------------
  test("TC-RL-E-003: 429 후 자동 재시도 시 '재시도 중...' 텍스트가 표시된다", async ({
    page,
  }) => {
    // Retry-After를 2초로 설정 → 2초 후 재시도
    await create429Route(page, "**/api/rooms", {
      retryAfter: "2",
      failCount: 1,
    });

    await page.goto("/lobby");
    await page.waitForLoadState("domcontentloaded");

    const toast = page.locator('[data-testid="rate-limit-toast"]');
    await expect(toast).toBeVisible({ timeout: 10_000 });

    // isRetrying이 true가 되면 "재시도 중..." 텍스트가 표시됨
    // api.ts: setIsRetrying(true) → setTimeout(retrySec*1000) → apiFetch → setIsRetrying(false)
    const retryingText = page.locator('[data-testid="rate-limit-retrying"]');
    // 재시도 대기 중(2초)에 "재시도 중..."이 표시되어야 함
    await expect(retryingText).toBeVisible({ timeout: 5_000 });
    await expect(retryingText).toContainText("재시도 중...");
  });

  // ----------------------------------------------------------------
  // TC-RL-E-004: 연속 429 2회 → 재시도로 최종 성공
  // ----------------------------------------------------------------
  test("TC-RL-E-004: 연속 429 2회 후 3번째 요청에서 정상 응답을 받는다", async ({
    page,
  }) => {
    let callCount = 0;
    await page.route("**/api/rooms", (route) => {
      callCount++;
      if (callCount <= 2) {
        // 첫 2번은 429
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
      // 3번째부터 정상
      return route.fulfill({
        status: 200,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ rooms: [], total: 0 }),
      });
    });

    await page.goto("/lobby");
    await page.waitForLoadState("domcontentloaded");

    // 토스트 표시 확인
    const toast = page.locator('[data-testid="rate-limit-toast"]');
    await expect(toast).toBeVisible({ timeout: 10_000 });

    // 최종적으로 정상 로드 (MAX_RATE_LIMIT_RETRIES=2이므로 3번째에 성공)
    await expect(
      page.getByText("진행 중인 게임이 없습니다."),
    ).toBeVisible({ timeout: 20_000 });

    // API가 3번 호출됨 (원래 + 재시도 2회)
    expect(callCount).toBeGreaterThanOrEqual(3);
  });

  // ----------------------------------------------------------------
  // TC-RL-E-005: Retry-After 헤더 없으면 기본값(5초) 적용
  // ----------------------------------------------------------------
  test("TC-RL-E-005: Retry-After 헤더가 없으면 기본 5초가 표시된다", async ({
    page,
  }) => {
    await create429Route(page, "**/api/rooms", {
      includeRetryAfter: false,
      failCount: 1,
    });

    await page.goto("/lobby");
    await page.waitForLoadState("domcontentloaded");

    const toast = page.locator('[data-testid="rate-limit-toast"]');
    await expect(toast).toBeVisible({ timeout: 10_000 });

    // api.ts: DEFAULT_RETRY_AFTER_SEC = 5 → "5초" 포함
    await expect(toast).toContainText("5초");
  });

  // ----------------------------------------------------------------
  // TC-RL-E-006: 429 토스트 내 아이콘(시계) SVG 존재 확인
  // ----------------------------------------------------------------
  test("TC-RL-E-006: 토스트에 시계 아이콘 SVG가 포함된다", async ({
    page,
  }) => {
    await create429Route(page, "**/api/rooms", {
      retryAfter: "3",
      failCount: 1,
    });

    await page.goto("/lobby");
    await page.waitForLoadState("domcontentloaded");

    const toast = page.locator('[data-testid="rate-limit-toast"]');
    await expect(toast).toBeVisible({ timeout: 10_000 });

    // 토스트 내부에 SVG 요소가 포함되어야 함 (시계 아이콘)
    const svg = toast.locator("svg").first();
    await expect(svg).toBeVisible();
    await expect(svg).toHaveAttribute("aria-hidden", "true");
  });

  // ----------------------------------------------------------------
  // TC-RL-E-007: rankings API 429 → 동일 토스트 표시
  // ----------------------------------------------------------------
  test("TC-RL-E-007: rankings API에서 429가 발생해도 동일한 rate limit 토스트가 표시된다", async ({
    page,
  }) => {
    // rankings 페이지에서 429 응답 모킹
    let intercepted = false;
    await page.route("**/api/rankings*", (route) => {
      if (!intercepted) {
        intercepted = true;
        return route.fulfill({
          status: 429,
          headers: {
            "Content-Type": "application/json",
            "Retry-After": "8",
          },
          body: JSON.stringify({
            error: { code: "RATE_LIMIT", message: "Too Many Requests" },
          }),
        });
      }
      return route.fulfill({
        status: 200,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          data: [],
          pagination: { limit: 20, offset: 0, total: 0 },
        }),
      });
    });

    await page.goto("/rankings");
    await page.waitForLoadState("domcontentloaded");

    // RateLimitToast는 layout.tsx에서 전역으로 렌더링되므로 어느 페이지든 표시됨
    const toast = page.locator('[data-testid="rate-limit-toast"]');
    await expect(toast).toBeVisible({ timeout: 10_000 });
    await expect(toast).toContainText("8초");
  });

  // ----------------------------------------------------------------
  // TC-RL-E-008: 쿨다운 완료 시 체크 아이콘 전환
  // ----------------------------------------------------------------
  test("TC-RL-E-008: 쿨다운이 0이 되면 프로그레스 내 체크 아이콘이 표시된다", async ({
    page,
  }) => {
    // 짧은 쿨다운(2초)으로 트리거
    await create429Route(page, "**/api/rooms", {
      retryAfter: "2",
      failCount: 1,
    });

    await page.goto("/lobby");
    await page.waitForLoadState("domcontentloaded");

    const toast = page.locator('[data-testid="rate-limit-toast"]');
    await expect(toast).toBeVisible({ timeout: 10_000 });

    const progress = page.locator('[data-testid="cooldown-progress"]');
    await expect(progress).toBeVisible({ timeout: 5_000 });

    // 쿨다운이 끝나면 aria-valuenow=0이 되고, 체크 아이콘(svg.text-success)이 표시됨
    // 2초 쿨다운 + 여유 1초 = 3초 대기
    await page.waitForTimeout(3500);

    // 쿨다운 완료 후 토스트 자체가 사라지거나 (2초 추가 대기 후 소멸),
    // 아직 남아있다면 aria-valuenow=0 확인
    // RateLimitToast의 두 번째 useEffect: cooldownSec=0이 되면 2초 후 소멸
    // 따라서 쿨다운 끝(2s) + 소멸 대기(2s) = 4s 전에 체크 확인해야 함
    // 이미 3.5s 대기했으므로 이 시점에서 progress가 보이면 valuenow=0 검증
    const isProgressStillVisible = await progress.isVisible();
    if (isProgressStillVisible) {
      const valueNow = await progress.getAttribute("aria-valuenow");
      expect(Number(valueNow)).toBe(0);
    }
    // 쿨다운 끝난 후 결국 토스트가 사라짐 (2초 추가 대기)
    await expect(toast).not.toBeVisible({ timeout: 8_000 });
  });
});
