/**
 * MyProfileCard ELO/승률 API 연동 테스트
 *
 * 작성일: 2026-05-06
 * 대상: LobbyClient.tsx MyProfileCard
 *
 * 검증 항목:
 *   - 로딩 중(세션 있으나 API 미응답) → "—" 표시
 *   - API 성공 → rating, winRate 렌더링
 *   - API 에러 → "—" 표시 (에러 토스트 없음)
 *   - 세션 없음 → API 호출하지 않음
 *
 * 테스트 원칙:
 *   - fetch를 jest.fn()으로 mock하여 game-server 불필요
 *   - next-auth useSession mock
 *   - 기존 UI 레이아웃(ELO 라벨, 승률 라벨) 변경 없음 확인
 */

import "@testing-library/jest-dom";
import React from "react";
import { render, screen, waitFor } from "@testing-library/react";

// ------------------------------------------------------------------
// next-auth mock
// ------------------------------------------------------------------

jest.mock("next-auth/react", () => ({
  useSession: jest.fn(),
  signOut: jest.fn(),
}));

// ------------------------------------------------------------------
// lib/api getUserRating mock (apiFetch 내부 fetch를 대체)
// ------------------------------------------------------------------

jest.mock("@/lib/api", () => ({
  ...jest.requireActual("@/lib/api"),
  getUserRating: jest.fn(),
  getRooms: jest.fn().mockResolvedValue([]),
  joinRoom: jest.fn(),
}));

// ------------------------------------------------------------------
// next/navigation mock
// ------------------------------------------------------------------

jest.mock("next/navigation", () => ({
  useRouter: () => ({ push: jest.fn() }),
}));

// ------------------------------------------------------------------
// store mock
// ------------------------------------------------------------------

jest.mock("@/store/roomStore", () => ({
  useRoomStore: () => ({
    rooms: [],
    setRooms: jest.fn(),
    isLoading: false,
    setIsLoading: jest.fn(),
  }),
}));

import { useSession } from "next-auth/react";
import { getUserRating } from "@/lib/api";
import type { UserRatingDetail } from "@/lib/api";

// LobbyClient 전체를 렌더하되, MyProfileCard 부분만 검증한다.
// (MyProfileCard는 file-internal 컴포넌트이므로 LobbyClient를 통해 접근)
import LobbyClient from "@/app/lobby/LobbyClient";

// ------------------------------------------------------------------
// 공통 fixtures
// ------------------------------------------------------------------

const MOCK_SESSION = {
  user: {
    id: "user-uuid-001",
    name: "애벌레",
    email: "k82022603@gmail.com",
    image: null,
  },
  accessToken: "mock-token",
};

const MOCK_RATING: UserRatingDetail = {
  userId: "user-uuid-001",
  rating: 1350,
  tier: "SILVER",
  tierProgress: 60,
  wins: 27,
  losses: 23,
  draws: 0,
  gamesPlayed: 50,
  winRate: 54.0,
  winStreak: 3,
  bestStreak: 7,
  peakRating: 1400,
};

// ------------------------------------------------------------------
// 테스트
// ------------------------------------------------------------------

describe("MyProfileCard ELO/승률 API 연동", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test("세션 없음 → API 호출하지 않고 '—' 표시", async () => {
    (useSession as jest.Mock).mockReturnValue({ data: null });
    (getUserRating as jest.Mock).mockResolvedValue(MOCK_RATING);

    render(<LobbyClient />);

    // 좌측 패널(lg:hidden이 아닌 lg:flex)은 테스트 환경 jsdom에서 CSS 없이 렌더됨
    expect(getUserRating).not.toHaveBeenCalled();

    // ELO/승률 모두 "—"
    const dashes = screen.getAllByText("—");
    expect(dashes.length).toBeGreaterThanOrEqual(2);
  });

  test("세션 있음 + API 성공 → rating/winRate 렌더링", async () => {
    (useSession as jest.Mock).mockReturnValue({ data: MOCK_SESSION });
    (getUserRating as jest.Mock).mockResolvedValue(MOCK_RATING);

    render(<LobbyClient />);

    // API 응답 후 렌더
    await waitFor(() => {
      expect(screen.getByText("1,350")).toBeInTheDocument();
    });
    expect(screen.getByText("54%")).toBeInTheDocument();

    // getUserRating이 올바른 userId로 호출됐는지 확인
    expect(getUserRating).toHaveBeenCalledWith("user-uuid-001", "mock-token");
  });

  test("세션 있음 + API 에러 → '—' 표시, 에러 토스트 없음", async () => {
    (useSession as jest.Mock).mockReturnValue({ data: MOCK_SESSION });
    (getUserRating as jest.Mock).mockRejectedValue(new Error("NOT_FOUND"));

    render(<LobbyClient />);

    // 에러 후에도 "—" 유지
    await waitFor(() => {
      expect(getUserRating).toHaveBeenCalled();
    });

    const dashes = screen.getAllByText("—");
    expect(dashes.length).toBeGreaterThanOrEqual(2);

    // 에러 toast/alert 없음 (role="alert"는 joinError만 사용)
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  test("ELO 라벨과 승률 라벨이 UI에 존재", async () => {
    (useSession as jest.Mock).mockReturnValue({ data: null });
    (getUserRating as jest.Mock).mockResolvedValue(MOCK_RATING);

    render(<LobbyClient />);

    expect(screen.getByText("ELO")).toBeInTheDocument();
    expect(screen.getByText("승률")).toBeInTheDocument();
  });
});
