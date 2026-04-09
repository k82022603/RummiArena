"use client";

import { create } from "zustand";
import type { WSConnectionStatus } from "@/types/websocket";

interface WSStore {
  status: WSConnectionStatus;
  setStatus: (s: WSConnectionStatus) => void;
  lastError: string | null;
  setLastError: (e: string | null) => void;
  reconnectNotice: { displayName: string; seat: number } | null;
  setReconnectNotice: (n: { displayName: string; seat: number } | null) => void;
  /** 재연결 알림 배너를 닫을 때 사용 */
  clearReconnectNotice: () => void;

  /** 현재 재연결 시도 횟수 (Close 4005 등 비정상 종료 후) */
  reconnectAttemptCount: number;
  setReconnectAttemptCount: (n: number) => void;
  /** 다음 재연결 시도까지 남은 초 */
  reconnectNextDelaySec: number;
  setReconnectNextDelaySec: (n: number) => void;
  /** Close code (마지막 비정상 종료 사유 추적) */
  lastCloseCode: number | null;
  setLastCloseCode: (code: number | null) => void;

  /** 전체 초기화 */
  reset: () => void;
}

const wsInitialState = {
  status: "idle" as WSConnectionStatus,
  lastError: null as string | null,
  reconnectNotice: null as { displayName: string; seat: number } | null,
  reconnectAttemptCount: 0,
  reconnectNextDelaySec: 0,
  lastCloseCode: null as number | null,
};

export const useWSStore = create<WSStore>()((set) => ({
  ...wsInitialState,
  setStatus: (status) => set({ status }),
  setLastError: (lastError) => set({ lastError }),
  setReconnectNotice: (reconnectNotice) => set({ reconnectNotice }),
  clearReconnectNotice: () => set({ reconnectNotice: null }),

  setReconnectAttemptCount: (reconnectAttemptCount) => set({ reconnectAttemptCount }),
  setReconnectNextDelaySec: (reconnectNextDelaySec) => set({ reconnectNextDelaySec }),
  setLastCloseCode: (lastCloseCode) => set({ lastCloseCode }),

  reset: () => set(wsInitialState),
}));
