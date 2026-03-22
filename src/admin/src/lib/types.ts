/**
 * 관리자 대시보드 공통 타입 정의
 */

// ------------------------------------------------------------------
// 게임 관련 타입
// ------------------------------------------------------------------

export type GameStatus = "WAITING" | "PLAYING" | "FINISHED";
export type PlayerType = "HUMAN" | "AI_CLAUDE" | "AI_OPENAI" | "AI_DEEPSEEK" | "AI_LLAMA";
export type Difficulty = "beginner" | "intermediate" | "expert";
export type Persona = "rookie" | "calculator" | "shark" | "fox" | "wall" | "wildcard";

export interface AdminGame {
  id: string;
  roomCode: string;
  roomName: string;
  status: GameStatus;
  playerCount: number;
  maxPlayers: number;
  startedAt: string | null;
  createdAt: string;
  players: AdminPlayer[];
  recentActions: ActionLog[];
}

export interface AdminPlayer {
  seat: number;
  type: PlayerType;
  displayName: string;
  tileCount: number;
  hasInitialMeld: boolean;
  isCurrentTurn: boolean;
  score?: number;
}

export interface ActionLog {
  seq: number;
  seat: number;
  playerName: string;
  action: string;
  timestamp: string;
}

// ------------------------------------------------------------------
// 유저 관련 타입
// ------------------------------------------------------------------

export interface AdminUser {
  id: string;
  displayName: string;
  email: string;
  provider: "google" | "guest";
  joinedAt: string;
  totalGames: number;
  wins: number;
  losses: number;
}

// ------------------------------------------------------------------
// AI 통계 타입
// ------------------------------------------------------------------

export interface AiModelStats {
  model: string;
  totalGames: number;
  wins: number;
  winRate: number;
  avgScore: number;
  color: string;
}

export interface PersonaStats {
  persona: Persona;
  totalGames: number;
  wins: number;
  winRate: number;
  avgScore: number;
}

export interface DifficultyStats {
  difficulty: Difficulty;
  avgScore: number;
  avgTurns: number;
  totalGames: number;
}

// ------------------------------------------------------------------
// 대시보드 요약 타입
// ------------------------------------------------------------------

export interface DashboardSummary {
  activeGames: number;
  onlineUsers: number;
  todayFinishedGames: number;
  aiVsHumanRatio: { ai: number; human: number };
}

// ------------------------------------------------------------------
// 서버 상태 타입
// ------------------------------------------------------------------

export interface HealthStatus {
  status: "ok" | "degraded" | "unreachable";
  uptime?: number;
  version?: string;
}

// ------------------------------------------------------------------
// ELO 랭킹 타입
// ------------------------------------------------------------------

export type EloTier =
  | "UNRANKED"
  | "BRONZE"
  | "SILVER"
  | "GOLD"
  | "PLATINUM"
  | "DIAMOND";

export interface EloRankingEntry {
  rank: number;
  userId: string;
  displayName: string;
  avatarUrl?: string;
  rating: number;
  tier: EloTier;
  wins: number;
  losses: number;
  draws: number;
  gamesPlayed: number;
  winRate: number;
  winStreak: number;
}

export interface EloRankingsResponse {
  rankings: EloRankingEntry[];
  total: number;
  limit: number;
  offset: number;
}

export interface EloSummary {
  totalRankedUsers: number;
  topRating: number;
  avgRating: number;
}

export interface EloTierDistribution {
  tier: EloTier;
  count: number;
  color: string;
}
