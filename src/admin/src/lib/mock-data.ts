/**
 * 관리자 대시보드 Mock 데이터
 * 백엔드 API 미구현 상태에서 UI 개발 및 데모용으로 사용한다.
 * NEXT_PUBLIC_API_URL 환경변수 설정 후 lib/api.ts를 통해 실제 API로 전환한다.
 */

// ------------------------------------------------------------------
// 타입 정의
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

export interface DashboardSummary {
  activeGames: number;
  onlineUsers: number;
  todayFinishedGames: number;
  aiVsHumanRatio: { ai: number; human: number };
}

export interface HealthStatus {
  status: "ok" | "degraded" | "unreachable";
  uptime?: number;
  version?: string;
}

// ------------------------------------------------------------------
// 대시보드 요약 Mock
// ------------------------------------------------------------------

export const MOCK_DASHBOARD: DashboardSummary = {
  activeGames: 5,
  onlineUsers: 23,
  todayFinishedGames: 41,
  aiVsHumanRatio: { ai: 68, human: 32 },
};

// ------------------------------------------------------------------
// 활성 게임 목록 Mock
// ------------------------------------------------------------------

export const MOCK_GAMES: AdminGame[] = [
  {
    id: "room-001",
    roomCode: "ABCD",
    roomName: "연습방 #1",
    status: "PLAYING",
    playerCount: 4,
    maxPlayers: 4,
    startedAt: new Date(Date.now() - 18 * 60 * 1000).toISOString(),
    createdAt: new Date(Date.now() - 22 * 60 * 1000).toISOString(),
    players: [
      { seat: 0, type: "HUMAN", displayName: "애벌레", tileCount: 11, hasInitialMeld: true, isCurrentTurn: true },
      { seat: 1, type: "AI_CLAUDE", displayName: "Fox (Claude)", tileCount: 8, hasInitialMeld: true, isCurrentTurn: false },
      { seat: 2, type: "AI_OPENAI", displayName: "Shark (GPT-4)", tileCount: 14, hasInitialMeld: false, isCurrentTurn: false },
      { seat: 3, type: "AI_DEEPSEEK", displayName: "Calc (DeepSeek)", tileCount: 12, hasInitialMeld: true, isCurrentTurn: false },
    ],
    recentActions: [
      { seq: 14, seat: 3, playerName: "Calc (DeepSeek)", action: "PLACE_TILES: Y3a-Y4a-Y5a", timestamp: new Date(Date.now() - 45000).toISOString() },
      { seq: 13, seat: 2, playerName: "Shark (GPT-4)", action: "DRAW", timestamp: new Date(Date.now() - 90000).toISOString() },
      { seq: 12, seat: 1, playerName: "Fox (Claude)", action: "PLACE_TILES: R7a-B7a-K7b", timestamp: new Date(Date.now() - 130000).toISOString() },
      { seq: 11, seat: 0, playerName: "애벌레", action: "PLACE_TILES: R1a-R2a-R3b", timestamp: new Date(Date.now() - 180000).toISOString() },
      { seq: 10, seat: 3, playerName: "Calc (DeepSeek)", action: "DRAW", timestamp: new Date(Date.now() - 240000).toISOString() },
    ],
  },
  {
    id: "room-002",
    roomCode: "EFGH",
    roomName: "AI 배틀 #3",
    status: "PLAYING",
    playerCount: 4,
    maxPlayers: 4,
    startedAt: new Date(Date.now() - 35 * 60 * 1000).toISOString(),
    createdAt: new Date(Date.now() - 38 * 60 * 1000).toISOString(),
    players: [
      { seat: 0, type: "AI_CLAUDE", displayName: "Fox (Claude)", tileCount: 6, hasInitialMeld: true, isCurrentTurn: false },
      { seat: 1, type: "AI_OPENAI", displayName: "Shark (GPT-4o)", tileCount: 9, hasInitialMeld: true, isCurrentTurn: true },
      { seat: 2, type: "AI_DEEPSEEK", displayName: "Wall (DeepSeek)", tileCount: 11, hasInitialMeld: true, isCurrentTurn: false },
      { seat: 3, type: "AI_LLAMA", displayName: "Rookie (LLaMA)", tileCount: 16, hasInitialMeld: false, isCurrentTurn: false },
    ],
    recentActions: [
      { seq: 28, seat: 1, playerName: "Shark (GPT-4o)", action: "PLACE_TILES: B10a-B11a-B12a-B13a", timestamp: new Date(Date.now() - 15000).toISOString() },
      { seq: 27, seat: 0, playerName: "Fox (Claude)", action: "PLACE_TILES: K4b-K5b-K6b", timestamp: new Date(Date.now() - 55000).toISOString() },
      { seq: 26, seat: 3, playerName: "Rookie (LLaMA)", action: "DRAW", timestamp: new Date(Date.now() - 95000).toISOString() },
      { seq: 25, seat: 2, playerName: "Wall (DeepSeek)", action: "DRAW", timestamp: new Date(Date.now() - 140000).toISOString() },
      { seq: 24, seat: 1, playerName: "Shark (GPT-4o)", action: "PLACE_TILES: R8b-R9b-R10b", timestamp: new Date(Date.now() - 190000).toISOString() },
    ],
  },
  {
    id: "room-003",
    roomCode: "IJKL",
    roomName: "초보방",
    status: "WAITING",
    playerCount: 1,
    maxPlayers: 3,
    startedAt: null,
    createdAt: new Date(Date.now() - 5 * 60 * 1000).toISOString(),
    players: [
      { seat: 0, type: "HUMAN", displayName: "빠른손", tileCount: 0, hasInitialMeld: false, isCurrentTurn: false },
    ],
    recentActions: [],
  },
  {
    id: "room-004",
    roomCode: "MNOP",
    roomName: "연습방 #2",
    status: "PLAYING",
    playerCount: 2,
    maxPlayers: 2,
    startedAt: new Date(Date.now() - 7 * 60 * 1000).toISOString(),
    createdAt: new Date(Date.now() - 9 * 60 * 1000).toISOString(),
    players: [
      { seat: 0, type: "HUMAN", displayName: "Player2", tileCount: 13, hasInitialMeld: false, isCurrentTurn: true },
      { seat: 1, type: "AI_CLAUDE", displayName: "Calculator (Claude)", tileCount: 10, hasInitialMeld: false, isCurrentTurn: false },
    ],
    recentActions: [
      { seq: 4, seat: 0, playerName: "Player2", action: "DRAW", timestamp: new Date(Date.now() - 20000).toISOString() },
      { seq: 3, seat: 1, playerName: "Calculator (Claude)", action: "DRAW", timestamp: new Date(Date.now() - 75000).toISOString() },
      { seq: 2, seat: 0, playerName: "Player2", action: "DRAW", timestamp: new Date(Date.now() - 150000).toISOString() },
      { seq: 1, seat: 1, playerName: "Calculator (Claude)", action: "DRAW", timestamp: new Date(Date.now() - 210000).toISOString() },
    ],
  },
  {
    id: "room-005",
    roomCode: "QRST",
    roomName: "고수방 #7",
    status: "FINISHED",
    playerCount: 4,
    maxPlayers: 4,
    startedAt: new Date(Date.now() - 90 * 60 * 1000).toISOString(),
    createdAt: new Date(Date.now() - 95 * 60 * 1000).toISOString(),
    players: [
      { seat: 0, type: "AI_CLAUDE", displayName: "Wildcard (Claude)", tileCount: 0, hasInitialMeld: true, isCurrentTurn: false, score: 142 },
      { seat: 1, type: "AI_OPENAI", displayName: "Fox (GPT-4)", tileCount: 3, hasInitialMeld: true, isCurrentTurn: false, score: -24 },
      { seat: 2, type: "HUMAN", displayName: "애벌레", tileCount: 5, hasInitialMeld: true, isCurrentTurn: false, score: -38 },
      { seat: 3, type: "AI_DEEPSEEK", displayName: "Shark (DeepSeek)", tileCount: 7, hasInitialMeld: true, isCurrentTurn: false, score: -80 },
    ],
    recentActions: [],
  },
];

// ------------------------------------------------------------------
// 유저 목록 Mock
// ------------------------------------------------------------------

export const MOCK_USERS: AdminUser[] = [
  { id: "u-001", displayName: "애벌레", email: "k82022603@gmail.com", provider: "google", joinedAt: "2026-03-08T09:00:00Z", totalGames: 47, wins: 19, losses: 28 },
  { id: "u-002", displayName: "빠른손", email: "quick@example.com", provider: "google", joinedAt: "2026-03-10T14:30:00Z", totalGames: 23, wins: 11, losses: 12 },
  { id: "u-003", displayName: "Player2", email: "player2@example.com", provider: "google", joinedAt: "2026-03-12T18:00:00Z", totalGames: 15, wins: 4, losses: 11 },
  { id: "u-004", displayName: "루미고수", email: "master@example.com", provider: "google", joinedAt: "2026-03-08T10:00:00Z", totalGames: 112, wins: 67, losses: 45 },
  { id: "u-005", displayName: "타일마스터", email: "tile@example.com", provider: "google", joinedAt: "2026-03-14T08:00:00Z", totalGames: 8, wins: 2, losses: 6 },
  { id: "u-006", displayName: "Guest_7f3a", email: "", provider: "guest", joinedAt: "2026-03-21T11:00:00Z", totalGames: 1, wins: 0, losses: 1 },
  { id: "u-007", displayName: "전략왕", email: "strategy@example.com", provider: "google", joinedAt: "2026-03-09T16:00:00Z", totalGames: 76, wins: 44, losses: 32 },
  { id: "u-008", displayName: "Guest_2b9c", email: "", provider: "guest", joinedAt: "2026-03-21T10:30:00Z", totalGames: 2, wins: 1, losses: 1 },
  { id: "u-009", displayName: "뉴비123", email: "newbie@example.com", provider: "google", joinedAt: "2026-03-20T09:00:00Z", totalGames: 3, wins: 0, losses: 3 },
  { id: "u-010", displayName: "알고리즘", email: "algo@example.com", provider: "google", joinedAt: "2026-03-11T12:00:00Z", totalGames: 55, wins: 31, losses: 24 },
];

// ------------------------------------------------------------------
// AI 통계 Mock
// ------------------------------------------------------------------

export const MOCK_AI_MODEL_STATS: AiModelStats[] = [
  { model: "Claude",   totalGames: 184, wins: 92,  winRate: 50.0, avgScore: 38,  color: "#f59e0b" },
  { model: "GPT-4",    totalGames: 176, wins: 79,  winRate: 44.9, avgScore: 29,  color: "#3b82f6" },
  { model: "DeepSeek", totalGames: 160, wins: 58,  winRate: 36.3, avgScore: 12,  color: "#8b5cf6" },
  { model: "LLaMA",    totalGames: 148, wins: 41,  winRate: 27.7, avgScore: -8,  color: "#10b981" },
];

export const MOCK_PERSONA_STATS: PersonaStats[] = [
  { persona: "shark",     totalGames: 120, wins: 65, winRate: 54.2, avgScore: 45 },
  { persona: "fox",       totalGames: 115, wins: 58, winRate: 50.4, avgScore: 38 },
  { persona: "calculator",totalGames: 110, wins: 52, winRate: 47.3, avgScore: 31 },
  { persona: "wall",      totalGames: 108, wins: 44, winRate: 40.7, avgScore: 18 },
  { persona: "wildcard",  totalGames: 100, wins: 38, winRate: 38.0, avgScore: 12 },
  { persona: "rookie",    totalGames: 95,  wins: 22, winRate: 23.2, avgScore: -15 },
];

export const MOCK_DIFFICULTY_STATS: DifficultyStats[] = [
  { difficulty: "expert",       avgScore: 52, avgTurns: 31, totalGames: 248 },
  { difficulty: "intermediate", avgScore: 18, avgTurns: 38, totalGames: 195 },
  { difficulty: "beginner",     avgScore: -22, avgTurns: 45, totalGames: 225 },
];

// ------------------------------------------------------------------
// getMockRooms: 활성/대기 게임만 필터링하여 반환 (FINISHED 제외)
// ------------------------------------------------------------------

export function getMockRooms(): AdminGame[] {
  return MOCK_GAMES.filter((g) => g.status !== "FINISHED");
}

// ------------------------------------------------------------------
// ELO 랭킹 타입 정의
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
// ELO Mock 데이터
// ------------------------------------------------------------------

export const TIER_COLORS: Record<EloTier, string> = {
  UNRANKED: "#9CA3AF",
  BRONZE:   "#B45309",
  SILVER:   "#6B7280",
  GOLD:     "#D97706",
  PLATINUM: "#0EA5E9",
  DIAMOND:  "#7C3AED",
};

export const MOCK_ELO_RANKINGS: EloRankingEntry[] = [
  { rank: 1,  userId: "u-101", displayName: "루미고수",   rating: 2041, tier: "DIAMOND",  wins: 98,  losses: 22, draws: 5,  gamesPlayed: 125, winRate: 78.4, winStreak: 7  },
  { rank: 2,  userId: "u-102", displayName: "전략왕",     rating: 1987, tier: "DIAMOND",  wins: 87,  losses: 31, draws: 4,  gamesPlayed: 122, winRate: 71.3, winStreak: 3  },
  { rank: 3,  userId: "u-103", displayName: "타일마스터", rating: 1854, tier: "PLATINUM", wins: 74,  losses: 28, draws: 6,  gamesPlayed: 108, winRate: 68.5, winStreak: 5  },
  { rank: 4,  userId: "u-104", displayName: "AI_CLAUDE",  rating: 1823, tier: "PLATINUM", wins: 71,  losses: 30, draws: 3,  gamesPlayed: 104, winRate: 68.3, winStreak: 2  },
  { rank: 5,  userId: "u-105", displayName: "알고리즘",   rating: 1791, tier: "PLATINUM", wins: 65,  losses: 35, draws: 2,  gamesPlayed: 102, winRate: 63.7, winStreak: 0  },
  { rank: 6,  userId: "u-106", displayName: "AI_OPENAI",  rating: 1734, tier: "PLATINUM", wins: 62,  losses: 38, draws: 4,  gamesPlayed: 104, winRate: 59.6, winStreak: 1  },
  { rank: 7,  userId: "u-107", displayName: "빠른손",     rating: 1682, tier: "PLATINUM", wins: 59,  losses: 41, draws: 3,  gamesPlayed: 103, winRate: 57.3, winStreak: 0  },
  { rank: 8,  userId: "u-108", displayName: "애벌레",     rating: 1523, tier: "GOLD",     wins: 42,  losses: 18, draws: 3,  gamesPlayed: 63,  winRate: 66.7, winStreak: 5  },
  { rank: 9,  userId: "u-109", displayName: "AI_DEEPSEEK",rating: 1487, tier: "GOLD",     wins: 51,  losses: 46, draws: 5,  gamesPlayed: 102, winRate: 50.0, winStreak: 0  },
  { rank: 10, userId: "u-110", displayName: "은빛달",     rating: 1421, tier: "GOLD",     wins: 38,  losses: 35, draws: 2,  gamesPlayed: 75,  winRate: 50.7, winStreak: 2  },
  { rank: 11, userId: "u-111", displayName: "묵직한타일", rating: 1388, tier: "GOLD",     wins: 34,  losses: 38, draws: 4,  gamesPlayed: 76,  winRate: 44.7, winStreak: 0  },
  { rank: 12, userId: "u-112", displayName: "Player2",    rating: 1312, tier: "GOLD",     wins: 28,  losses: 40, draws: 1,  gamesPlayed: 69,  winRate: 40.6, winStreak: 0  },
  { rank: 13, userId: "u-113", displayName: "AI_LLAMA",   rating: 1278, tier: "SILVER",   wins: 44,  losses: 71, draws: 6,  gamesPlayed: 121, winRate: 36.4, winStreak: 0  },
  { rank: 14, userId: "u-114", displayName: "뉴비프로",   rating: 1241, tier: "SILVER",   wins: 22,  losses: 38, draws: 2,  gamesPlayed: 62,  winRate: 35.5, winStreak: 1  },
  { rank: 15, userId: "u-115", displayName: "서울타일러", rating: 1198, tier: "SILVER",   wins: 19,  losses: 41, draws: 3,  gamesPlayed: 63,  winRate: 30.2, winStreak: 0  },
  { rank: 16, userId: "u-116", displayName: "조커달인",   rating: 1153, tier: "SILVER",   wins: 17,  losses: 44, draws: 1,  gamesPlayed: 62,  winRate: 27.4, winStreak: 0  },
  { rank: 17, userId: "u-117", displayName: "Guest_7f3a", rating: 987,  tier: "BRONZE",   wins: 8,   losses: 18, draws: 0,  gamesPlayed: 26,  winRate: 30.8, winStreak: 0  },
  { rank: 18, userId: "u-118", displayName: "뉴비123",    rating: 954,  tier: "BRONZE",   wins: 5,   losses: 21, draws: 1,  gamesPlayed: 27,  winRate: 18.5, winStreak: 0  },
  { rank: 19, userId: "u-119", displayName: "Guest_2b9c", rating: 921,  tier: "BRONZE",   wins: 4,   losses: 22, draws: 0,  gamesPlayed: 26,  winRate: 15.4, winStreak: 0  },
  { rank: 20, userId: "u-120", displayName: "첫발걸음",   rating: 1000, tier: "UNRANKED", wins: 3,   losses: 5,  draws: 0,  gamesPlayed: 8,   winRate: 37.5, winStreak: 0  },
];

export const MOCK_ELO_SUMMARY: EloSummary = {
  totalRankedUsers: 19,
  topRating: 2041,
  avgRating: Math.round(
    MOCK_ELO_RANKINGS.filter((r) => r.tier !== "UNRANKED").reduce((s, r) => s + r.rating, 0) /
    MOCK_ELO_RANKINGS.filter((r) => r.tier !== "UNRANKED").length
  ),
};

export function getMockEloTierDistribution(): EloTierDistribution[] {
  const countByTier: Record<EloTier, number> = {
    UNRANKED: 0, BRONZE: 0, SILVER: 0, GOLD: 0, PLATINUM: 0, DIAMOND: 0,
  };
  for (const entry of MOCK_ELO_RANKINGS) {
    countByTier[entry.tier]++;
  }
  return (Object.entries(countByTier) as [EloTier, number][])
    .filter(([, count]) => count > 0)
    .map(([tier, count]) => ({ tier, count, color: TIER_COLORS[tier] }));
}
