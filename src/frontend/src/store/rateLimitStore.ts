"use client";

import { create } from "zustand";

interface RateLimitStore {
  /** 현재 표시할 메시지 (null이면 토스트 숨김) */
  message: string | null;
  setMessage: (msg: string | null) => void;

  /** WebSocket 발신 스로틀링 활성 여부 */
  wsThrottled: boolean;
  setWsThrottled: (v: boolean) => void;

  /** 쿨다운 잔여 초 (0이면 쿨다운 해제) */
  cooldownSec: number;
  setCooldownSec: (sec: number) => void;

  /** 쿨다운 총 초 (원형 프로그레스 비율 계산용) */
  cooldownTotalSec: number;
  setCooldownTotalSec: (sec: number) => void;

  /** 자동 재시도 중 여부 */
  isRetrying: boolean;
  setIsRetrying: (v: boolean) => void;

  /** WS RATE_LIMITED 위반 횟수 (0, 1, 2 -- 3회 시 서버가 종료) */
  wsViolationCount: number;
  incrementWsViolation: () => void;
  resetWsViolation: () => void;

  /** 쿨다운 시작 (총 초 설정 + 매초 카운트다운) */
  startCooldown: (totalSec: number) => void;

  /** 쿨다운 타이머 ID (내부 관리용) */
  _cooldownTimerId: ReturnType<typeof setInterval> | null;
}

export const useRateLimitStore = create<RateLimitStore>()((set, get) => ({
  message: null,
  setMessage: (message) => set({ message }),
  wsThrottled: false,
  setWsThrottled: (wsThrottled) => set({ wsThrottled }),

  cooldownSec: 0,
  setCooldownSec: (cooldownSec) => set({ cooldownSec }),
  cooldownTotalSec: 0,
  setCooldownTotalSec: (cooldownTotalSec) => set({ cooldownTotalSec }),
  isRetrying: false,
  setIsRetrying: (isRetrying) => set({ isRetrying }),

  wsViolationCount: 0,
  incrementWsViolation: () =>
    set((state) => ({ wsViolationCount: Math.min(state.wsViolationCount + 1, 2) })),
  resetWsViolation: () => set({ wsViolationCount: 0 }),

  _cooldownTimerId: null,

  startCooldown: (totalSec: number) => {
    // 기존 타이머 정리
    const existing = get()._cooldownTimerId;
    if (existing) clearInterval(existing);

    set({ cooldownSec: totalSec, cooldownTotalSec: totalSec });

    const timerId = setInterval(() => {
      const current = get().cooldownSec;
      if (current <= 1) {
        clearInterval(timerId);
        set({ cooldownSec: 0, cooldownTotalSec: 0, _cooldownTimerId: null });
      } else {
        set({ cooldownSec: current - 1 });
      }
    }, 1000);

    set({ _cooldownTimerId: timerId });
  },
}));
