import type { TableGroup, TileCode } from "./tile";
import type { Player } from "./game";

/**
 * WebSocket 메시지 공통 구조
 */
export interface WSMessage<T = unknown> {
  event: WSEventType;
  data: T;
}

/**
 * 서버 → 클라이언트 이벤트 타입
 */
export type WSServerEvent =
  | "game:state"
  | "game:started"
  | "turn:start"
  | "turn:action"
  | "turn:timeout"
  | "game:ended"
  | "player:joined"
  | "player:left"
  | "player:reconnected"
  | "ai:thinking"
  | "error";

/**
 * 클라이언트 → 서버 이벤트 타입
 */
export type WSClientEvent =
  | "auth"
  | "turn:place"
  | "turn:draw"
  | "turn:undo"
  | "turn:confirm";

export type WSEventType = WSServerEvent | WSClientEvent;

/* ------------------------------------------------------------------ */
/* 서버 → 클라이언트 페이로드                                          */
/* ------------------------------------------------------------------ */

export interface GameStartedPayload {
  myTiles: TileCode[];
  players: Player[];
  currentPlayerSeat: number;
  turnTimeoutSec: number;
}

export interface TurnStartPayload {
  currentPlayerSeat: number;
  turnNumber: number;
  remainingMs: number;
}

export interface TurnActionPayload {
  seat: number;
  action: "place" | "draw";
  tableGroups: TableGroup[];
  drawnTile?: TileCode; // 내 드로우 시만 포함
  tilesFromRack?: TileCode[];
}

export interface TurnTimeoutPayload {
  seat: number;
  drawnTile?: TileCode;
}

export interface GameEndedPayload {
  winnerSeat: number | null;
  scores: Array<{ seat: number; score: number; isWinner: boolean }>;
  gameId: string;
}

export interface PlayerJoinedPayload {
  seat: number;
  userId?: string;
  displayName?: string;
  type: string;
}

export interface PlayerLeftPayload {
  seat: number;
  userId: string;
}

export interface AIThinkingPayload {
  seat: number;
  playerType: string;
}

export interface WSErrorPayload {
  code: string;
  message: string;
  details?: Record<string, unknown>;
}

/* ------------------------------------------------------------------ */
/* 클라이언트 → 서버 페이로드                                          */
/* ------------------------------------------------------------------ */

export interface AuthPayload {
  token: string;
}

export interface TurnPlacePayload {
  tableGroups: TableGroup[];
  tilesFromRack: TileCode[];
}

/**
 * 연결 상태
 */
export type WSConnectionStatus =
  | "idle"
  | "connecting"
  | "connected"
  | "reconnecting"
  | "disconnected"
  | "error";
