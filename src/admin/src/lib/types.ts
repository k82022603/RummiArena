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

// ------------------------------------------------------------------
// AI 토너먼트 대시보드 타입
// ------------------------------------------------------------------
//
// 스펙: docs/02-design/33-ai-tournament-dashboard-component-spec.md §5
// Sprint 6 W1: game-server가 `GET /admin/stats/ai/tournament`를 옵션 B
// (정적 JSON 프록시) 방식으로 먼저 제공. Sprint 6 W2에서 DB 집계로 교체.

/** 지원 모델 타입 (기존 PlayerType에서 HUMAN 제외) */
export type ModelType = "openai" | "claude" | "deepseek" | "ollama";

/** 프롬프트 버전 */
export type PromptVersion = "v1" | "v2" | "v3";

/** 대전 상태 */
export type TournamentStatus =
  | "COMPLETED" // 80턴 완주
  | "WS_TIMEOUT" // WebSocket 타임아웃
  | "WS_CLOSED" // WebSocket 연결 종료
  | "UNKNOWN"; // 측정 불가

/** 등급 */
export type ModelGrade = "A+" | "A" | "B" | "C" | "D" | "F";

/**
 * 단일 라운드 x 모델 결과 엔트리.
 * PlaceRateChart, RoundHistoryTable 공통 사용.
 */
export interface TournamentRoundEntry {
  /** 'R2' | 'R3' | 'R4' | 'R4v2' | 'R5-DS-run1' 등 */
  round: string;
  promptVersion: PromptVersion;
  modelType: ModelType;
  modelName: string;
  placeRate: number; // 0~100
  placeCount: number;
  drawCount: number;
  totalTiles: number;
  totalTurns: number;
  completed: boolean;
  status: TournamentStatus;
  totalCost: number;
  avgResponseTimeSec: number;
  p50ResponseTimeSec: number;
  minResponseTimeSec: number;
  maxResponseTimeSec: number;
  grade: ModelGrade;
}

/** CostEfficiencyScatter 전용 (산점도 1점) */
export interface CostEfficiencyEntry {
  modelType: ModelType;
  modelName: string;
  round: string;
  promptVersion: PromptVersion;
  costPerGame: number; // X축
  placeRate: number; // Y축
  totalTilesPlaced: number; // Z축 (버블 크기)
  placePerDollar: number;
}

/** ModelCard 전용 (최신 라운드 기준) */
export interface ModelLatestStats {
  modelType: ModelType;
  modelName: string;
  latestRound: string;
  latestRate: number;
  grade: ModelGrade;
  avgResponseTimeSec: number;
  costPerTurn: number;
  totalTilesPlaced: number;
  completed: boolean;
  promptVersion: PromptVersion;
  /** 라운드별 Place Rate 시계열 (R2→R3→R4→R5 순). 데이터 없음은 null. */
  sparkline: (number | null)[];
}

/** 토너먼트 전체 요약 (GET /admin/stats/ai/tournament 응답) */
export interface TournamentSummary {
  rounds: TournamentRoundEntry[];
  modelStats: ModelLatestStats[];
  costEfficiency: CostEfficiencyEntry[];
  /** ISO8601 */
  lastUpdated: string;
  totalBattles: number;
  totalCostUsd: number;
}

/** 필터 상태 (URL 쿼리 동기화 대상) */
export interface TournamentFilterState {
  selectedModels: ModelType[];
  roundRange: [string, string];
  promptVersion: "all" | PromptVersion;
}

/** 기본 필터 값 */
export const DEFAULT_TOURNAMENT_FILTER: TournamentFilterState = {
  selectedModels: ["openai", "claude", "deepseek"],
  roundRange: ["R2", "R5-CL-run3"],
  promptVersion: "all",
};

/** Empty fallback (API 실패 시) */
export const EMPTY_TOURNAMENT: TournamentSummary = {
  rounds: [],
  modelStats: [],
  costEfficiency: [],
  lastUpdated: new Date(0).toISOString(),
  totalBattles: 0,
  totalCostUsd: 0,
};

// ------------------------------------------------------------------
// Round History Table 타입 (ADR 45 §2)
// ------------------------------------------------------------------

export type RoundHistoryModelType =
  | "deepseek"
  | "gpt-5-mini"
  | "claude-sonnet-4"
  | "ollama";

export type VariantType =
  | "v1"
  | "v2"
  | "v2-zh"
  | "v3"
  | "v4"
  | "v4.1"
  | "v5"
  | "v5.1";

export type SortDirection = "asc" | "desc" | null;

export interface RoundHistoryEntry {
  roundId: string; // "R4", "R5-Run1", "R10-v2-Run2"
  date: string; // "2026-04-06" (ISO 8601 date)
  model: RoundHistoryModelType;
  variant: VariantType;
  runNumber: number; // 1~N (동일 라운드 내 반복 순번)
  placeCount: number; // 성공 내려놓기 횟수 (절댓값)
  tileCount: number; // 내려놓은 타일 총수
  placeRate: number; // 0.308 (소수, 백분율이 아님)
  fallbackCount: number; // 강제 드로우 횟수
  avgLatencyMs: number; // 평균 응답시간 (ms 단위, 0 = 미기록)
  maxLatencyMs: number; // 최대 응답시간 (ms 단위, 0 = 미기록)
  elapsedSec: number; // 대전 총 경과시간 (초)
  costUsd: number; // 비용 (USD)
  codePathNote?: string; // "hardcoded V2" | "Registry.resolve()" 등 선택 메모
  turnLogUrl?: string; // 상세 턴 로그 링크 (없으면 undefined)
}

export interface RoundHistoryFilter {
  roundIds: string[]; // 선택된 roundId 목록 (빈 배열 = 전체)
  models: RoundHistoryModelType[];
  variants: VariantType[];
  dateFrom?: string; // ISO date
  dateTo?: string;
}

export interface RoundHistorySortState {
  column: keyof RoundHistoryEntry | null;
  direction: SortDirection;
}

export interface RoundHistoryStats {
  count: number;
  avgPlaceRate: number;
  stdDevPlaceRate: number;
  medianPlaceRate: number;
  totalCostUsd: number;
  avgFallbackCount: number;
  avgLatencyMs: number;
}
