"use client";

import { create } from "zustand";

interface RateLimitStore {
  /** 현재 표시할 메시지 (null이면 토스트 숨김) */
  message: string | null;
  setMessage: (msg: string | null) => void;

  /** WebSocket 발신 스로틀링 활성 여부 */
  wsThrottled: boolean;
  setWsThrottled: (v: boolean) => void;
}

export const useRateLimitStore = create<RateLimitStore>()((set) => ({
  message: null,
  setMessage: (message) => set({ message }),
  wsThrottled: false,
  setWsThrottled: (wsThrottled) => set({ wsThrottled }),
}));
