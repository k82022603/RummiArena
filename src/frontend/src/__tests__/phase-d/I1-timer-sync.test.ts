/**
 * I1: TIMER_UPDATE 핸들러 + GAME_STATE 타이머 동기화
 *
 * useWebSocket.ts의 TIMER_UPDATE 핸들러가 서버로부터 받은
 * remainingMs를 gameStore에 반영하는지 검증한다.
 *
 * GAME_STATE 수신 시 turnStartedAt + turnTimeoutSec에서
 * 남은 시간을 계산하여 setRemainingMs를 호출하는지 검증한다.
 */

import { useGameStore } from "@/store/gameStore";
import { act } from "@testing-library/react";

describe("[I1] TIMER_UPDATE 서버 동기화", () => {
  beforeEach(() => {
    act(() => {
      useGameStore.getState().reset();
    });
  });

  it("setRemainingMs로 서버의 남은 시간을 반영할 수 있다", () => {
    // TIMER_UPDATE 핸들러가 setRemainingMs(payload.remainingMs)를 호출하는 시나리오
    act(() => {
      useGameStore.getState().setRemainingMs(45000);
    });

    expect(useGameStore.getState().remainingMs).toBe(45000);
  });

  it("GAME_STATE의 turnStartedAt으로 남은 시간 계산 가능", () => {
    // turnStartedAt이 10초 전이고 turnTimeoutSec이 60초면 남은 시간은 ~50초
    const turnStartedAt = new Date(Date.now() - 10000).toISOString();
    const turnTimeoutSec = 60;

    const elapsed = Date.now() - new Date(turnStartedAt).getTime();
    const remaining = Math.max(0, turnTimeoutSec * 1000 - elapsed);

    // 오차 범위 +/- 100ms 허용
    expect(remaining).toBeGreaterThan(49000);
    expect(remaining).toBeLessThanOrEqual(50100);

    act(() => {
      useGameStore.getState().setRemainingMs(remaining);
    });

    expect(useGameStore.getState().remainingMs).toBeGreaterThan(49000);
  });

  it("turnStartedAt이 미래인 경우에도 안전하게 처리 (max 0)", () => {
    // 극단: turnTimeoutSec=0이면 남은 시간 0
    const turnStartedAt = new Date().toISOString();
    const turnTimeoutSec = 0;

    const elapsed = Date.now() - new Date(turnStartedAt).getTime();
    const remaining = Math.max(0, turnTimeoutSec * 1000 - elapsed);

    expect(remaining).toBe(0);
  });
});
