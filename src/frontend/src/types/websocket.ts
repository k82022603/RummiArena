import type { TableGroup, TileCode } from "./tile";

/**
 * WebSocket 메시지 envelope (10-websocket-protocol.md 준수)
 */
export interface WSEnvelope<T = unknown> {
  type: string;
  payload: T;
  seq: number;
  timestamp: string;
}

/* ------------------------------------------------------------------ */
/* C2S (Client → Server) 메시지 타입                                   */
/* ------------------------------------------------------------------ */

export type C2SMessageType =
  | "AUTH"
  | "PLACE_TILES"
  | "DRAW_TILE"
  | "CONFIRM_TURN"
  | "RESET_TURN"
  | "PING"
  | "LEAVE_GAME"
  | "CHAT";

/* ------------------------------------------------------------------ */
/* S2C (Server → Client) 메시지 타입                                   */
/* ------------------------------------------------------------------ */

export type S2CMessageType =
  | "AUTH_OK"
  | "GAME_STATE"
  | "TURN_START"
  | "TURN_END"
  | "TILE_PLACED"
  | "TILE_DRAWN"
  | "INVALID_MOVE"
  | "GAME_OVER"
  | "PLAYER_JOIN"
  | "PLAYER_LEAVE"
  | "PLAYER_RECONNECT"
  | "PLAYER_DISCONNECTED"
  | "PLAYER_RECONNECTED"
  | "PLAYER_FORFEITED"
  | "DRAW_PILE_EMPTY"
  | "GAME_DEADLOCK_END"
  | "AI_THINKING"
  | "TIMER_UPDATE"
  | "CHAT_BROADCAST"
  | "ERROR"
  | "PONG";

/* ------------------------------------------------------------------ */
/* C2S 페이로드                                                        */
/* ------------------------------------------------------------------ */

export interface AuthPayload {
  token: string;
}

export interface PlaceTilesPayload {
  tableGroups: TableGroup[];
  tilesFromRack: TileCode[];
}

export interface ConfirmTurnPayload {
  tableGroups: TableGroup[];
  tilesFromRack: TileCode[];
}

export interface ChatPayload {
  message: string;
}

/* ------------------------------------------------------------------ */
/* S2C 페이로드                                                        */
/* ------------------------------------------------------------------ */

export interface AuthOKPayload {
  userId: string;
  seat: number;
  displayName: string;
}

export interface WSPlayerInfo {
  seat: number;
  userId?: string;
  displayName: string;
  playerType: string;
  tileCount: number;
  hasInitialMeld: boolean;
  isConnected: boolean;
}

export interface GameStatePayload {
  gameId: string;
  status: string;
  currentSeat: number;
  tableGroups: TableGroup[];
  myRack: TileCode[];
  players: WSPlayerInfo[];
  drawPileCount: number;
  turnTimeoutSec: number;
  turnStartedAt?: string;
}

export interface TurnStartPayload {
  seat: number;
  turnNumber?: number;
  playerType: string;
  displayName?: string;
  timeoutSec: number;
  turnStartedAt: string;
  /** AI 턴 여부 — 서버가 아직 미전송이면 undefined */
  isAITurn?: boolean;
}

export interface TurnEndPayload {
  seat: number;
  turnNumber?: number;
  action: string;
  tableGroups: TableGroup[];
  tilesPlacedCount: number;
  playerTileCount: number;
  hasInitialMeld: boolean;
  drawPileCount: number;
  nextSeat: number;
  nextTurnNumber?: number;
  /** 서버가 보내는 해당 플레이어의 실제 랙 타일 목록 (본인 턴일 때만 포함) */
  myRack?: string[];
}

export interface TilePlacedPayload {
  seat: number;
  tableGroups: TableGroup[];
  tilesFromRackCount: number;
}

export interface TileDrawnPayload {
  seat: number;
  drawnTile: TileCode | null;
  drawPileCount: number;
  playerTileCount: number;
}

export interface InvalidMovePayload {
  errors: Array<{
    code: string;
    message: string;
  }>;
}

export interface GameOverPayload {
  endType: string;
  winnerId?: string;
  winnerSeat: number;
  results: Array<{
    seat: number;
    playerType: string;
    remainingTiles: TileCode[];
    isWinner: boolean;
  }>;
}

export interface PlayerJoinPayload {
  seat: number;
  userId?: string;
  displayName: string;
  playerType: string;
  totalPlayers: number;
  maxPlayers: number;
}

export interface PlayerLeavePayload {
  seat: number;
  displayName: string;
  reason: string;
  totalPlayers: number;
}

export interface AIThinkingPayload {
  seat: number;
  playerType: string;
  persona?: string;
  displayName?: string;
  thinkingMessage?: string;
}

export interface WSErrorPayload {
  code: string;
  message: string;
  details?: Record<string, unknown>;
}

export interface PongPayload {
  serverTime: string;
}

export interface ChatBroadcastPayload {
  seat: number;
  displayName: string;
  message: string;
  sentAt: string;
}

/** S2C: TIMER_UPDATE - 서버 측 타이머 동기화 */
export interface TimerUpdatePayload {
  /** 남은 시간 (밀리초) */
  remainingMs: number;
  seat: number;
}

/** S2C: PLAYER_DISCONNECTED - 플레이어 연결 끊김, Grace Period 카운트다운 시작 */
export interface PlayerDisconnectedPayload {
  seat: number;
  displayName: string;
  /** Grace Period 초 단위 (서버 전송 기준) */
  graceSec: number;
}

/** S2C: PLAYER_RECONNECTED - 플레이어 Grace Period 내 재연결 */
export interface PlayerReconnectedPayload {
  seat: number;
  displayName: string;
}

/** S2C: PLAYER_FORFEITED - 플레이어 기권 (Grace 초과 또는 명시적 LEAVE_GAME) */
export interface PlayerForfeitedPayload {
  seat: number;
  displayName: string;
  reason: "DISCONNECT_TIMEOUT" | "LEAVE";
  activePlayers: number;
  isGameOver: boolean;
}

/** S2C: DRAW_PILE_EMPTY - 드로우 파일 소진 */
export interface DrawPileEmptyPayload {
  message: string;
}

/** S2C: GAME_DEADLOCK_END - 교착 상태(전원 연속 패스)로 게임 종료 */
export interface GameDeadlockEndPayload {
  reason: "ALL_PASS";
  consecutivePassCount: number;
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
