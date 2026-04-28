import type { TileCode, TableGroup } from "./tile";

/**
 * 게임 세션 상태
 */
export type GameStatus = "WAITING" | "PLAYING" | "FINISHED" | "CANCELLED";

/**
 * AI 플레이어 타입
 */
export type AIPlayerType = "AI_OPENAI" | "AI_CLAUDE" | "AI_DEEPSEEK" | "AI_LLAMA";

/**
 * 플레이어 타입
 */
export type PlayerType = "HUMAN" | AIPlayerType;

/**
 * AI 캐릭터 페르소나
 */
export type AIPersona = "rookie" | "calculator" | "shark" | "fox" | "wall" | "wildcard";

/**
 * AI 난이도
 */
export type AIDifficulty = "beginner" | "intermediate" | "expert";

/**
 * 플레이어 연결 상태
 * EMPTY: 서버가 빈 좌석을 나타낼 때 사용하는 상태값
 */
export type PlayerStatus = "CONNECTED" | "DISCONNECTED" | "READY" | "FORFEITED" | "EMPTY";

/**
 * 플레이어 (Human)
 */
export interface HumanPlayer {
  seat: number;
  type: "HUMAN";
  userId: string;
  displayName: string;
  avatarUrl?: string;
  status: PlayerStatus;
  tileCount?: number;
  hasInitialMeld?: boolean;
}

/**
 * 플레이어 (AI)
 */
export interface AIPlayer {
  seat: number;
  type: AIPlayerType;
  persona: AIPersona;
  difficulty: AIDifficulty;
  psychologyLevel: 0 | 1 | 2 | 3;
  status: "READY" | "THINKING" | "CONNECTED" | "DISCONNECTED" | "FORFEITED" | "EMPTY";
  tileCount?: number;
  hasInitialMeld?: boolean;
}

export type Player = HumanPlayer | AIPlayer;

/**
 * 게임 설정
 */
export interface GameSettings {
  playerCount: 2 | 3 | 4;
  turnTimeoutSec: number;
  initialMeldThreshold: number;
}

/**
 * 게임 상태 (실시간)
 */
export interface GameState {
  currentSeat: number;
  tableGroups: TableGroup[];
  drawPileCount: number;
  turnStartedAt: string;
  turnTimeoutSec: number;
}

/**
 * Room (게임 방) 객체
 */
export interface Room {
  id: string;
  roomCode: string;
  status: GameStatus;
  hostUserId: string;
  playerCount: number;
  settings: GameSettings;
  players: Player[];
  createdAt: string;
}

/**
 * 1인칭 뷰에서 사용하는 내 타일 정보
 */
export interface MyGameView {
  myTiles: TileCode[];
  myTileCount: number;
  hasInitialMeld: boolean;
  gameState: GameState;
  players: Player[];
}

/**
 * 게임 결과 (FINISHED 상태)
 */
export interface GameResult {
  id: string;
  roomCode: string;
  status: "FINISHED";
  gameMode: "NORMAL" | "PRACTICE";
  turnCount: number;
  settings: GameSettings;
  players: Array<
    Player & { score: number; isWinner: boolean }
  >;
  startedAt: string;
  finishedAt: string;
}

/**
 * 사용자 정보
 */
export interface UserInfo {
  id: string;
  email: string;
  displayName: string;
  avatarUrl?: string;
  role: "ROLE_USER" | "ROLE_ADMIN";
  eloRating: number;
}

/**
 * ELO 이력 항목
 */
export interface EloHistoryEntry {
  gameId: string;
  ratingBefore: number;
  ratingAfter: number;
  delta: number;
  createdAt: string;
}

/**
 * 내 통계
 */
export interface UserStats {
  userId: string;
  displayName: string;
  eloRating: number;
  totalGames: number;
  wins: number;
  winRate: number;
  avgScore: number;
  vsAiStats: Record<AIPlayerType, { games: number; wins: number }>;
  recentEloHistory: EloHistoryEntry[];
}
