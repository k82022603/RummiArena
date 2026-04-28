"use client";

import { create } from "zustand";
import { subscribeWithSelector } from "zustand/middleware";
import type { TileCode } from "@/types/tile";
import type { Player, GameState, Room } from "@/types/game";
import type { GameOverPayload } from "@/types/websocket";
import { computeEffectiveMeld } from "@/lib/turnUtils";

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

  // ---------------------------------------------------------------------------
  // [2026-04-28 Phase C 단계 4] pending 관련 필드/setter 완전 제거 완료.
  //   pendingTableGroups, pendingMyTiles, pendingGroupIds, pendingRecoveredJokers
  //   setPendingTableGroups, setPendingMyTiles, addPendingGroupId,
  //   clearPendingGroupIds, setPendingGroupIds, addRecoveredJoker,
  //   removeRecoveredJoker, clearRecoveredJokers, resetPending
  //   → 모두 usePendingStore (src/store/pendingStore.ts) 로 이전.
  //   selectMyTileCount 는 usePendingStore.getState().draft?.myTiles 를 우선 참조.
  // ---------------------------------------------------------------------------

  // AI 사고 중 표시
  aiThinkingSeat: number | null;
  setAIThinkingSeat: (seat: number | null) => void;

  // I2: AI 턴 여부 (TURN_START.isAITurn 또는 aiThinkingSeat 기반 판별)
  isAITurn: boolean;
  setIsAITurn: (v: boolean) => void;

  // I2: AI 턴 경과 시간 (밀리초) — useTurnTimer에서 1초 간격 증가
  aiElapsedMs: number;
  setAIElapsedMs: (ms: number) => void;

  // 현재 턴 플레이어 ID (E2E 테스트 브리지 + SSOT 보조)
  // setStoreState({ currentPlayerId: "ai-player-1" }) 형태로 주입 가능.
  // null 이면 gameState.currentSeat 기반으로 isMyTurn 계산 (기본 경로).
  currentPlayerId: string | null;
  setCurrentPlayerId: (id: string | null) => void;

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

  // F1/F2 (BUG-UI-012 Phase 2): 게임 종료 상태 스키마
  // GAME_ENDED / PLAYER_FORFEITED 이벤트 수신 시 모달 트리거에 사용.
  // gameEnded(boolean) 는 GAME_OVER 이벤트 기반이므로 별도 유지.
  gameStatus: "waiting" | "playing" | "ended";
  setGameStatus: (status: "waiting" | "playing" | "ended") => void;
  endReason: string | null;
  setEndReason: (reason: string | null) => void;
  winner: { userId: string; displayName: string } | null;
  setWinner: (winner: { userId: string; displayName: string } | null) => void;

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
  // Phase C 단계 4: pending* deprecated 필드 제거. usePendingStore 사용.
  aiThinkingSeat: null as number | null,
  isAITurn: false,
  aiElapsedMs: 0,
  currentPlayerId: null as string | null,
  turnNumber: 1,
  gameEnded: false,
  gameOverResult: null as GameOverPayload | null,
  disconnectedPlayers: [] as DisconnectedPlayerInfo[],
  isDrawPileEmpty: false,
  deadlockReason: null as string | null,
  turnHistory: [] as TurnPlacement[],
  lastTurnPlacement: null as TurnPlacement | null,
  // F1/F2 (BUG-UI-012 Phase 2)
  gameStatus: "waiting" as "waiting" | "playing" | "ended",
  endReason: null as string | null,
  winner: null as { userId: string; displayName: string } | null,
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
    // Phase C 단계 4: pending* setter 제거. usePendingStore.applyMutation/reset 사용.
    setAIThinkingSeat: (aiThinkingSeat) => set({ aiThinkingSeat }),
    setIsAITurn: (isAITurn) => set({ isAITurn }),
    setAIElapsedMs: (aiElapsedMs) => set({ aiElapsedMs }),
    setCurrentPlayerId: (currentPlayerId) => set({ currentPlayerId }),
    setTurnNumber: (turnNumber) => set({ turnNumber }),
    setGameEnded: (gameEnded) => set({ gameEnded }),
    setGameOverResult: (gameOverResult) => set({ gameOverResult }),
    // F1/F2 (BUG-UI-012 Phase 2) setters
    setGameStatus: (gameStatus) => set({ gameStatus }),
    setEndReason: (endReason) => set({ endReason }),
    setWinner: (winner) => set({ winner }),

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

    // Phase C 단계 4: resetPending 제거. usePendingStore.reset() 사용.
    reset: () => set(initialState),
  }))
);

// ---------------------------------------------------------------------------
// Selector: 내 플레이어의 실제 타일 수
//
// 문제: PlayerCard 배지(player.tileCount)는 서버 기준값.
//       미확정 배치(pendingStore.draft.myTiles)가 있으면 rack 실제 수와 다를 수 있음.
// 해결: 내 시트에 한해 pendingStore.draft.myTiles 길이를 우선 사용.
//       여러 WS 이벤트(TURN_ENDED/DRAW_TILE/PLACE_COMMIT)에서 drift 방지.
//
// Phase C 단계 4 (2026-04-28): gameStore.pendingMyTiles 필드 제거.
//   pendingStore.draft.myTiles 가 단일 SSOT.
// ---------------------------------------------------------------------------

/**
 * 내 플레이어의 실제 타일 수 selector.
 *
 * - pendingStore.draft.myTiles 가 있으면 그 길이를 우선 반환 (rack과 동기화)
 * - 없으면 서버 기준 player.tileCount 반환
 *
 * 주의: 이 selector는 gameStore와 pendingStore 양쪽을 참조하므로 reactive 구독
 *      대상이 아니라 단발 호출(getState 기반)로만 사용한다. 기존 호출처는 모두
 *      `selectMyTileCount(useGameStore.getState())` 패턴이며, 그 호출 시점의
 *      pendingStore 스냅샷도 함께 읽는다.
 */
export function selectMyTileCount(
  state: ReturnType<typeof useGameStore.getState>
): number {
  const { mySeat, players } = state;
  // pendingStore는 별도 store이므로 module-level singleton getState로 참조한다.
  // 순환 참조 방지: 함수 내부에서 lazy require 패턴 (top-level import 금지).
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { usePendingStore } = require("@/store/pendingStore") as typeof import("@/store/pendingStore");
  const pendingMyTiles = usePendingStore.getState().draft?.myTiles ?? null;
  if (pendingMyTiles !== null) {
    return pendingMyTiles.length;
  }
  const me = players.find((p) => (p as { seat?: number }).seat === mySeat);
  return me?.tileCount ?? 0;
}

// ---------------------------------------------------------------------------
// Selector: effectiveHasInitialMeld
//
// 문제: effectiveHasInitialMeld 가 7개 지점에서 중복 참조됨 (W2-A 사고).
// 해결: computeEffectiveMeld 순수 함수를 단일 selector로 래핑.
//   hasInitialMeld 필드 대신 이 selector를 사용하면 7지점 산포 제거 가능.
//   Phase 3에서 hasInitialMeld 필드 완전 제거 예정.
// ---------------------------------------------------------------------------

/**
 * 나의 effectiveHasInitialMeld — V-13a (재배치 권한 판정) SSOT.
 *
 * players 배열의 서버 응답값을 단일 소스로 사용한다.
 * hasInitialMeld 필드(서버 전달 boolean)보다 이 selector 우선.
 */
export function selectEffectiveMeld(
  state: ReturnType<typeof useGameStore.getState>
): boolean {
  return computeEffectiveMeld(state.players, state.mySeat);
}

/**
 * 내 플레이어 객체 selector.
 */
export function selectMyPlayer(
  state: ReturnType<typeof useGameStore.getState>
): Player | undefined {
  return state.players.find((p) => p.seat === state.mySeat);
}

/**
 * 현재 턴 seat selector.
 */
export function selectCurrentSeat(
  state: ReturnType<typeof useGameStore.getState>
): number {
  return state.gameState?.currentSeat ?? -1;
}

/**
 * 내 턴 여부 selector — V-08.
 */
export function selectIsMyTurn(
  state: ReturnType<typeof useGameStore.getState>
): boolean {
  const currentSeat = selectCurrentSeat(state);
  if (currentSeat < 0) return false;
  return currentSeat === state.mySeat;
}

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
