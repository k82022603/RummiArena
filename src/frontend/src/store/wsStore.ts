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
}

export const useWSStore = create<WSStore>()((set) => ({
  status: "idle",
  setStatus: (status) => set({ status }),
  lastError: null,
  setLastError: (lastError) => set({ lastError }),
  reconnectNotice: null,
  setReconnectNotice: (reconnectNotice) => set({ reconnectNotice }),
  clearReconnectNotice: () => set({ reconnectNotice: null }),
}));
