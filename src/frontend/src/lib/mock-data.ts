/**
 * Mock 데이터
 * game-server 스텁 상태에서 프론트엔드 UI 개발 및 데모용으로 사용한다.
 * API 호출 실패 시 이 데이터를 fallback으로 반환한다.
 */

import type { Room, GameState, Player } from "@/types/game";
import type { TableGroup } from "@/types/tile";

// ------------------------------------------------------------------
// Room Mock 데이터
// ------------------------------------------------------------------

export const MOCK_ROOMS: Room[] = [
  {
    id: "room-001",
    roomCode: "ABCD",
    status: "WAITING",
    hostUserId: "user-host-1",
    playerCount: 2,
    settings: {
      playerCount: 4,
      turnTimeoutSec: 60,
      initialMeldThreshold: 30,
    },
    players: [
      {
        seat: 0,
        type: "HUMAN",
        userId: "user-host-1",
        displayName: "애벌레",
        status: "READY",
        tileCount: 0,
        hasInitialMeld: false,
      },
      {
        seat: 1,
        type: "AI_CLAUDE",
        persona: "fox",
        difficulty: "expert",
        psychologyLevel: 2,
        status: "READY",
        tileCount: 0,
        hasInitialMeld: false,
      },
    ],
    createdAt: new Date(Date.now() - 3 * 60 * 1000).toISOString(),
  },
  {
    id: "room-002",
    roomCode: "EFGH",
    status: "PLAYING",
    hostUserId: "user-host-2",
    playerCount: 4,
    settings: {
      playerCount: 4,
      turnTimeoutSec: 90,
      initialMeldThreshold: 30,
    },
    players: [
      {
        seat: 0,
        type: "HUMAN",
        userId: "user-host-2",
        displayName: "Player2",
        status: "CONNECTED",
        tileCount: 11,
        hasInitialMeld: true,
      },
      {
        seat: 1,
        type: "AI_OPENAI",
        persona: "shark",
        difficulty: "expert",
        psychologyLevel: 3,
        status: "READY",
        tileCount: 8,
        hasInitialMeld: true,
      },
      {
        seat: 2,
        type: "AI_DEEPSEEK",
        persona: "calculator",
        difficulty: "intermediate",
        psychologyLevel: 1,
        status: "READY",
        tileCount: 14,
        hasInitialMeld: false,
      },
      {
        seat: 3,
        type: "AI_LLAMA",
        persona: "rookie",
        difficulty: "beginner",
        psychologyLevel: 0,
        status: "READY",
        tileCount: 12,
        hasInitialMeld: true,
      },
    ],
    createdAt: new Date(Date.now() - 18 * 60 * 1000).toISOString(),
  },
  {
    id: "room-003",
    roomCode: "WXYZ",
    status: "WAITING",
    hostUserId: "user-host-3",
    playerCount: 1,
    settings: {
      playerCount: 3,
      turnTimeoutSec: 30,
      initialMeldThreshold: 30,
    },
    players: [
      {
        seat: 0,
        type: "HUMAN",
        userId: "user-host-3",
        displayName: "빠른손",
        status: "READY",
        tileCount: 0,
        hasInitialMeld: false,
      },
    ],
    createdAt: new Date(Date.now() - 1 * 60 * 1000).toISOString(),
  },
];

// ------------------------------------------------------------------
// GameState Mock 데이터
// ------------------------------------------------------------------

export const MOCK_TABLE_GROUPS: TableGroup[] = [
  {
    id: "group-001",
    type: "group",
    tiles: ["R7a", "B7a", "K7b"],
  },
  {
    id: "group-002",
    type: "run",
    tiles: ["Y3a", "Y4a", "Y5a", "Y6b"],
  },
  {
    id: "group-003",
    type: "run",
    tiles: ["R1a", "R2a", "R3b"],
  },
];

export const MOCK_GAME_STATE: GameState = {
  currentSeat: 0,
  tableGroups: MOCK_TABLE_GROUPS,
  drawPileCount: 28,
  turnStartedAt: new Date().toISOString(),
  turnTimeoutSec: 60,
};

export const MOCK_MY_TILES = [
  "R7b",
  "B3a",
  "B4b",
  "Y11a",
  "K5a",
  "K5b",
  "R12a",
  "JK1",
  "B9b",
  "Y2a",
  "K13a",
  "R6b",
  "Y8a",
  "B1a",
] as const;

export const MOCK_PLAYERS: Player[] = [
  {
    seat: 0,
    type: "HUMAN",
    userId: "user-me",
    displayName: "애벌레",
    status: "CONNECTED",
    tileCount: 14,
    hasInitialMeld: false,
  },
  {
    seat: 1,
    type: "AI_CLAUDE",
    persona: "fox",
    difficulty: "expert",
    psychologyLevel: 2,
    status: "READY",
    tileCount: 11,
    hasInitialMeld: true,
  },
  {
    seat: 2,
    type: "AI_OPENAI",
    persona: "shark",
    difficulty: "expert",
    psychologyLevel: 3,
    status: "READY",
    tileCount: 8,
    hasInitialMeld: true,
  },
  {
    seat: 3,
    type: "AI_DEEPSEEK",
    persona: "calculator",
    difficulty: "intermediate",
    psychologyLevel: 1,
    status: "READY",
    tileCount: 14,
    hasInitialMeld: false,
  },
];

// ------------------------------------------------------------------
// 통계 Mock 데이터 (로비 우측 패널)
// ------------------------------------------------------------------

export const MOCK_LOBBY_STATS = {
  onlineCount: 12,
  activeGames: 3,
  waitingRooms: 2,
  todayGames: 18,
  recentWinners: [
    { name: "애벌레", eloChange: "+24", result: "1위" },
    { name: "Fox (Claude)", eloChange: "AI", result: "1위" },
    { name: "빠른손", eloChange: "+12", result: "1위" },
  ],
};

// ------------------------------------------------------------------
// 헬퍼 함수
// ------------------------------------------------------------------

/** Room 생성 Mock 응답 */
export function createMockRoom(params: {
  playerCount: 2 | 3 | 4;
  turnTimeoutSec: number;
}): Room {
  const codes = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";
  const randomCode = Array.from({ length: 4 }, () =>
    codes[Math.floor(Math.random() * codes.length)]
  ).join("");

  return {
    id: `room-${Date.now()}`,
    roomCode: randomCode,
    status: "WAITING",
    hostUserId: "user-me",
    playerCount: 1,
    settings: {
      playerCount: params.playerCount,
      turnTimeoutSec: params.turnTimeoutSec,
      initialMeldThreshold: 30,
    },
    players: [
      {
        seat: 0,
        type: "HUMAN",
        userId: "user-me",
        displayName: "나",
        status: "READY",
        tileCount: 0,
        hasInitialMeld: false,
      },
    ],
    createdAt: new Date().toISOString(),
  };
}
