"use client";

import { create } from "zustand";
import { subscribeWithSelector } from "zustand/middleware";
import type { TileCode, TableGroup } from "@/types/tile";
import type { Player, GameState, Room } from "@/types/game";

interface GameStore {
  // 방 정보
  room: Room | null;
  setRoom: (room: Room | null) => void;

  // 내 seat 번호 (0~3)
  mySeat: number;
  setMySeat: (seat: number) => void;

  // 내 타일 (1인칭 뷰)
  myTiles: TileCode[];
  setMyTiles: (tiles: TileCode[]) => void;

  // 게임 상태
  gameState: GameState | null;
  setGameState: (state: GameState | null) => void;

  // 플레이어 목록
  players: Player[];
  setPlayers: (players: Player[]) => void;

  // 최초 등록 여부
  hasInitialMeld: boolean;
  setHasInitialMeld: (v: boolean) => void;

  // 현재 턴 타이머 (남은 ms)
  remainingMs: number;
  setRemainingMs: (ms: number) => void;

  // 임시 테이블 상태 (턴 확정 전 로컬 편집 중)
  pendingTableGroups: TableGroup[] | null;
  setPendingTableGroups: (groups: TableGroup[] | null) => void;

  // 임시 내 랙 상태 (테이블에 끌어놓은 타일 제거된 상태)
  pendingMyTiles: TileCode[] | null;
  setPendingMyTiles: (tiles: TileCode[] | null) => void;

  // AI 사고 중 표시
  aiThinkingSeat: number | null;
  setAIThinkingSeat: (seat: number | null) => void;

  // 게임 종료 결과
  gameEnded: boolean;
  setGameEnded: (v: boolean) => void;

  // 전체 초기화
  reset: () => void;
}

const initialState = {
  room: null,
  mySeat: 0,
  myTiles: [],
  gameState: null,
  players: [],
  hasInitialMeld: false,
  remainingMs: 0,
  pendingTableGroups: null,
  pendingMyTiles: null,
  aiThinkingSeat: null,
  gameEnded: false,
};

export const useGameStore = create<GameStore>()(
  subscribeWithSelector((set) => ({
    ...initialState,

    setRoom: (room) => set({ room }),
    setMySeat: (mySeat) => set({ mySeat }),
    setMyTiles: (myTiles) => set({ myTiles }),
    setGameState: (gameState) => set({ gameState }),
    setPlayers: (players) => set({ players }),
    setHasInitialMeld: (hasInitialMeld) => set({ hasInitialMeld }),
    setRemainingMs: (remainingMs) => set({ remainingMs }),
    setPendingTableGroups: (pendingTableGroups) => set({ pendingTableGroups }),
    setPendingMyTiles: (pendingMyTiles) => set({ pendingMyTiles }),
    setAIThinkingSeat: (aiThinkingSeat) => set({ aiThinkingSeat }),
    setGameEnded: (gameEnded) => set({ gameEnded }),

    reset: () => set(initialState),
  }))
);
