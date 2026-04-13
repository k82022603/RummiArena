"use client";

import { create } from "zustand";
import { subscribeWithSelector } from "zustand/middleware";
import type { TileCode, TableGroup } from "@/types/tile";
import type { Player, GameState, Room } from "@/types/game";
import type { GameOverPayload } from "@/types/websocket";

/** 연결 끊김 플레이어 정보 (Grace Period 카운트다운 표시용) */
export interface DisconnectedPlayerInfo {
  seat: number;
  displayName: string;
  graceSec: number;         // 서버가 보낸 유예 시간 (초)
  disconnectedAt: number;   // 수신 시점 Unix timestamp (ms)
}

/** 턴 히스토리 1건 — 특정 턴에 특정 플레이어가 테이블에 새로 놓은 타일 기록 */
export interface TurnPlacement {
  turnNumber: number;
  seat: number;
  action: string;            // "place" | "draw" | "timeout" 등 (TurnEndPayload.action)
  placedTiles: TileCode[];   // 해당 턴에 테이블에 새로 추가된 타일 코드 (drawGroups diff 결과)
  placedAt: number;          // Unix ms
}

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

  // 연결 끊김 플레이어 목록 (Grace Period 카운트다운 표시용)
  disconnectedPlayers: DisconnectedPlayerInfo[];
  addDisconnectedPlayer: (info: DisconnectedPlayerInfo) => void;
  removeDisconnectedPlayer: (seat: number) => void;

  // 드로우 파일 소진 여부 (교착 처리 UI)
  isDrawPileEmpty: boolean;
  setIsDrawPileEmpty: (v: boolean) => void;

  // 교착 종료 사유 (null이면 교착 아님)
  deadlockReason: string | null;
  setDeadlockReason: (reason: string | null) => void;

  // 턴 히스토리 — 최근 N턴의 플레이어별 placement 기록 (오래된 것부터 정렬)
  turnHistory: TurnPlacement[];
  addTurnPlacement: (placement: TurnPlacement) => void;
  clearTurnHistory: () => void;

  // 최근 턴 하이라이트 — 가장 최근 TURN_END의 placement (현재 턴 동안 표시)
  // 다음 TURN_END가 오면 교체된다. null이면 하이라이트 없음.
  lastTurnPlacement: TurnPlacement | null;
  setLastTurnPlacement: (placement: TurnPlacement | null) => void;

  // pending 상태만 초기화 (INVALID_MOVE 롤백 시 사용)
  resetPending: () => void;

  // 전체 초기화
  reset: () => void;
}

const initialState = {
  room: null as Room | null,
  mySeat: -1,
  myTiles: [] as TileCode[],
  gameState: null as GameState | null,
  players: [] as Player[],
  hasInitialMeld: false,
  remainingMs: 0,
  pendingTableGroups: null as TableGroup[] | null,
  pendingMyTiles: null as TileCode[] | null,
  pendingGroupIds: new Set<string>(),
  aiThinkingSeat: null as number | null,
  turnNumber: 1,
  gameEnded: false,
  gameOverResult: null as GameOverPayload | null,
  disconnectedPlayers: [] as DisconnectedPlayerInfo[],
  isDrawPileEmpty: false,
  deadlockReason: null as string | null,
  turnHistory: [] as TurnPlacement[],
  lastTurnPlacement: null as TurnPlacement | null,
};

// 히스토리 보관 최대 건수 (메모리 절약)
const TURN_HISTORY_MAX = 50;

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

    addDisconnectedPlayer: (info) =>
      set((state) => ({
        disconnectedPlayers: [
          ...state.disconnectedPlayers.filter((d) => d.seat !== info.seat),
          info,
        ],
      })),
    removeDisconnectedPlayer: (seat) =>
      set((state) => ({
        disconnectedPlayers: state.disconnectedPlayers.filter(
          (d) => d.seat !== seat
        ),
      })),

    setIsDrawPileEmpty: (isDrawPileEmpty) => set({ isDrawPileEmpty }),
    setDeadlockReason: (deadlockReason) => set({ deadlockReason }),

    addTurnPlacement: (placement) =>
      set((state) => {
        const next = [...state.turnHistory, placement];
        if (next.length > TURN_HISTORY_MAX) next.splice(0, next.length - TURN_HISTORY_MAX);
        return { turnHistory: next };
      }),
    clearTurnHistory: () => set({ turnHistory: [] }),
    setLastTurnPlacement: (lastTurnPlacement) => set({ lastTurnPlacement }),

    resetPending: () =>
      set({
        pendingTableGroups: null,
        pendingMyTiles: null,
        pendingGroupIds: new Set<string>(),
      }),

    reset: () => set(initialState),
  }))
);

// E2E 테스트 브릿지: Zustand 스토어를 window에 노출
// Playwright page.evaluate에서 window.__gameStore.getState() / setState() 사용 가능
// NEXT_PUBLIC_E2E_BRIDGE=true 일 때 활성화 (빌드 타임 환경변수, 프로덕션 빌드에서도 사용 가능)
// NODE_ENV !== "production" 일 때도 활성화 (로컬 개발 환경)
if (
  typeof window !== "undefined" &&
  (process.env.NODE_ENV !== "production" ||
    process.env.NEXT_PUBLIC_E2E_BRIDGE === "true")
) {
  (window as unknown as Record<string, unknown>).__gameStore = useGameStore;
}
