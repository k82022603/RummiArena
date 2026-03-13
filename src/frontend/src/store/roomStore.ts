"use client";

import { create } from "zustand";
import type { Room } from "@/types/game";

interface RoomStore {
  // Room 목록
  rooms: Room[];
  setRooms: (rooms: Room[]) => void;

  // 현재 참가/호스트 중인 Room
  currentRoom: Room | null;
  setCurrentRoom: (room: Room | null) => void;

  // 로딩 / 오류 상태
  isLoading: boolean;
  setIsLoading: (v: boolean) => void;
  error: string | null;
  setError: (msg: string | null) => void;

  // 내 seat 번호 (Room 참가 시 서버가 할당)
  mySeat: number;
  setMySeat: (seat: number) => void;

  // 전체 초기화
  reset: () => void;
}

const initialState = {
  rooms: [],
  currentRoom: null,
  isLoading: false,
  error: null,
  mySeat: 0,
};

export const useRoomStore = create<RoomStore>()((set) => ({
  ...initialState,

  setRooms: (rooms) => set({ rooms }),
  setCurrentRoom: (currentRoom) => set({ currentRoom }),
  setIsLoading: (isLoading) => set({ isLoading }),
  setError: (error) => set({ error }),
  setMySeat: (mySeat) => set({ mySeat }),

  reset: () => set(initialState),
}));
