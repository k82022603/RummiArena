"use client";

import { create } from "zustand";
import { subscribeWithSelector } from "zustand/middleware";
import type { TileCode, TableGroup } from "@/types/tile";
import type { Player, GameState, Room } from "@/types/game";
import type { GameOverPayload } from "@/types/websocket";

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

  // 이번 턴에 새로 추가된 그룹 ID 세트 (프리뷰 표시용, 서버 미확정)
  pendingGroupIds: Set<string>;
  addPendingGroupId: (id: string) => void;
  clearPendingGroupIds: () => void;

  // AI 사고 중 표시
  aiThinkingSeat: number | null;
  setAIThinkingSeat: (seat: number | null) => void;

  // 턴 번호
  turnNumber: number;
  setTurnNumber: (n: number) => void;

  // 게임 종료 결과
  gameEnded: boolean;
  setGameEnded: (v: boolean) => void;

  // GAME_OVER 페이로드 (승자/패자 상세)
  gameOverResult: GameOverPayload | null;
  setGameOverResult: (result: GameOverPayload | null) => void;

  // pending 상태만 초기화 (INVALID_MOVE 롤백 시 사용)
  resetPending: () => void;

  // 전체 초기화
  reset: () => void;
}

const initialState = {
  room: null,
  mySeat: -1,
  myTiles: [],
  gameState: null,
  players: [],
  hasInitialMeld: false,
  remainingMs: 0,
  pendingTableGroups: null,
  pendingMyTiles: null,
  pendingGroupIds: new Set<string>(),
  aiThinkingSeat: null,
  turnNumber: 1,
  gameEnded: false,
  gameOverResult: null,
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
    addPendingGroupId: (id) =>
      set((state) => ({
        pendingGroupIds: new Set([...state.pendingGroupIds, id]),
      })),
    clearPendingGroupIds: () => set({ pendingGroupIds: new Set<string>() }),
    setAIThinkingSeat: (aiThinkingSeat) => set({ aiThinkingSeat }),
    setTurnNumber: (turnNumber) => set({ turnNumber }),
    setGameEnded: (gameEnded) => set({ gameEnded }),
    setGameOverResult: (gameOverResult) => set({ gameOverResult }),

    resetPending: () =>
      set({
        pendingTableGroups: null,
        pendingMyTiles: null,
        pendingGroupIds: new Set<string>(),
      }),

    reset: () => set(initialState),
  }))
);
