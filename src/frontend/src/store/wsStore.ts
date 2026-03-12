"use client";

import { create } from "zustand";
import type { WSConnectionStatus } from "@/types/websocket";

interface WSStore {
  status: WSConnectionStatus;
  setStatus: (s: WSConnectionStatus) => void;
  lastError: string | null;
  setLastError: (e: string | null) => void;
}

export const useWSStore = create<WSStore>()((set) => ({
  status: "idle",
  setStatus: (status) => set({ status }),
  lastError: null,
  setLastError: (lastError) => set({ lastError }),
}));
