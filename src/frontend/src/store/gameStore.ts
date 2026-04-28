"use client";

import { create } from "zustand";
import { subscribeWithSelector } from "zustand/middleware";
import type { TileCode, TableGroup } from "@/types/tile";
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
  // @deprecated Phase 1: 아래 pending 관련 필드는 pendingStore로 이전됨.
  //   현재 상태 (2026-04-28):
  //     - GameClient.handleDragEnd의 inline 분기(6곳)가 아직 이 필드들을 직접 업데이트
  //     - useTurnActions가 이 필드들에서 읽음 (confirmEnabled/drawEnabled/resetEnabled 계산)
  //     - useWebSocket.ts TURN_START/INVALID_MOVE 핸들러가 resetPending() 호출
  //     - pendingStore에는 dragEndReducer 경로(2곳)와 jokerSwap(1곳)만 dual-write 중
  //   완전 제거 전제조건:
  //     1. handleDragEnd 나머지 6개 inline 분기에 pendingStore.applyMutation 추가
  //     2. useTurnActions를 pendingStore.draft 기반으로 전환
  //     3. useWebSocket.ts resetPending()을 pendingStore.reset() + rollback으로 대체
  //   신규 코드에서는 usePendingStore를 사용할 것 (src/store/pendingStore.ts).
  // ---------------------------------------------------------------------------

  // 임시 테이블 상태 (턴 확정 전 로컬 편집 중)
  // @deprecated → usePendingStore().draft.groups
  pendingTableGroups: TableGroup[] | null;
  setPendingTableGroups: (groups: TableGroup[] | null) => void;

  // 임시 내 랙 상태 (테이블에 끌어놓은 타일 제거된 상태)
  // @deprecated → usePendingStore().draft.myTiles
  pendingMyTiles: TileCode[] | null;
  setPendingMyTiles: (tiles: TileCode[] | null) => void;

  // P3: 테이블 조커 교체로 회수한 조커 대기 풀
  // 규칙 §3.3/§6.2 유형 4 — 회수한 조커는 같은 턴 내에 다른 세트에 반드시 사용해야 한다.
  // @deprecated → usePendingStore().draft.recoveredJokers
  pendingRecoveredJokers: TileCode[];
  addRecoveredJoker: (code: TileCode) => void;
  removeRecoveredJoker: (code: TileCode) => void;
  clearRecoveredJokers: () => void;

  // 이번 턴에 새로 추가된 그룹 ID 세트 (프리뷰 표시용, 서버 미확정)
  // @deprecated → usePendingStore().draft.pendingGroupIds
  pendingGroupIds: Set<string>;
  addPendingGroupId: (id: string) => void;
  clearPendingGroupIds: () => void;
  // BUG-UI-EXT 수정 4: 재배치 시 소스 그룹 제거 + 타겟 그룹 등록을 atomic 하게 처리
  // @deprecated → usePendingStore().applyMutation()
  setPendingGroupIds: (ids: Set<string>) => void;

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

  // pending 상태만 초기화 (INVALID_MOVE 롤백 / TURN_START 초기화 시 사용)
  // @deprecated → usePendingStore().reset()
  // 호출처 (2026-04-28):
  //   - useWebSocket.ts: TURN_START, BUG-WS-001 fallback, INVALID_MOVE, AI_THINKING fallback
  //   - useTurnActions.ts: handleUndo
  //   - useGameSync.ts는 pendingStore.reset()을 별도 호출 (이 함수와 보완 관계, 중복 아님)
  resetPending: () => void;

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
  pendingTableGroups: null as TableGroup[] | null,
  pendingMyTiles: null as TileCode[] | null,
  pendingGroupIds: new Set<string>(),
  pendingRecoveredJokers: [] as TileCode[],
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
    setPendingTableGroups: (pendingTableGroups) => set({ pendingTableGroups }),
    setPendingMyTiles: (pendingMyTiles) => set({ pendingMyTiles }),
    addPendingGroupId: (id) =>
      set((state) => ({
        pendingGroupIds: new Set([...state.pendingGroupIds, id]),
      })),
    clearPendingGroupIds: () => set({ pendingGroupIds: new Set<string>() }),
    // BUG-UI-EXT 수정 4: atomic 교체 — 재배치 후 소스 ID 제거 + 타겟 ID 등록을 한 번에
    setPendingGroupIds: (ids) => set({ pendingGroupIds: ids }),

    addRecoveredJoker: (code) =>
      set((state) => {
        // WARN-03: 중복 push guard — 동일 code가 이미 존재하면 no-op
        if (state.pendingRecoveredJokers.includes(code)) return state;
        return { pendingRecoveredJokers: [...state.pendingRecoveredJokers, code] };
      }),
    removeRecoveredJoker: (code) =>
      set((state) => {
        const idx = state.pendingRecoveredJokers.indexOf(code);
        if (idx < 0) return {};
        const next = [...state.pendingRecoveredJokers];
        next.splice(idx, 1);
        return { pendingRecoveredJokers: next };
      }),
    clearRecoveredJokers: () => set({ pendingRecoveredJokers: [] }),
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

    resetPending: () =>
      set({
        pendingTableGroups: null,
        pendingMyTiles: null,
        pendingGroupIds: new Set<string>(),
        pendingRecoveredJokers: [],
      }),

    reset: () => set(initialState),
  }))
);

// ---------------------------------------------------------------------------
// Selector: 내 플레이어의 실제 타일 수
//
// 문제: PlayerCard 배지(player.tileCount)는 서버 기준값.
//       미확정 배치(pendingMyTiles)가 있으면 rack 실제 수와 다를 수 있음.
// 해결: 내 시트에 한해 pendingMyTiles 길이를 우선 사용.
//       여러 WS 이벤트(TURN_ENDED/DRAW_TILE/PLACE_COMMIT)에서 drift 방지.
// ---------------------------------------------------------------------------

/**
 * 내 플레이어의 실제 타일 수 selector.
 *
 * - pendingMyTiles 가 있으면 그 길이를 우선 반환 (rack과 동기화)
 * - 없으면 서버 기준 player.tileCount 반환
 */
export function selectMyTileCount(
  state: ReturnType<typeof useGameStore.getState>
): number {
  const { mySeat, players, pendingMyTiles } = state;
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
