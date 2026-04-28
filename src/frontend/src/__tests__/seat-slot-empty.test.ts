/**
 * SeatSlot isEmpty 판별 로직 단위 테스트
 *
 * 버그 근거: 서버가 빈 좌석을 { seat: N, type: "HUMAN", status: "EMPTY" }로 보낼 때
 * isEmpty = !player 만으로는 빈 좌석을 판별할 수 없어 "준비 완료"로 잘못 표시되는 문제.
 *
 * 수정 내용: isEmpty = !player || player.status === "EMPTY"
 * 관련 파일: src/app/room/[roomId]/WaitingRoomClient.tsx (SeatSlot, 44행)
 *            src/types/game.ts (PlayerStatus, AIPlayer.status)
 */

import type { Player, HumanPlayer, AIPlayer } from "../types/game";

/**
 * SeatSlot isEmpty 판별 순수 함수 (WaitingRoomClient.tsx SeatSlot 내부 로직 추출)
 */
function resolveIsEmpty(player: Player | undefined): boolean {
  return !player || player.status === "EMPTY";
}

// ------------------------------------------------------------------
// 1. player가 undefined인 경우 (서버가 해당 seat을 아예 보내지 않음)
// ------------------------------------------------------------------
describe("SeatSlot isEmpty — player undefined", () => {
  it("player가 undefined이면 isEmpty=true", () => {
    expect(resolveIsEmpty(undefined)).toBe(true);
  });
});

// ------------------------------------------------------------------
// 2. HUMAN 플레이어 — status별 isEmpty 판별
// ------------------------------------------------------------------
describe("SeatSlot isEmpty — HumanPlayer", () => {
  const base: Omit<HumanPlayer, "status"> = {
    seat: 0,
    type: "HUMAN",
    userId: "u1",
    displayName: "테스터",
  };

  it('status="EMPTY" → isEmpty=true (버그 수정 핵심)', () => {
    const player: HumanPlayer = { ...base, status: "EMPTY" };
    expect(resolveIsEmpty(player)).toBe(true);
  });

  it('status="CONNECTED" → isEmpty=false', () => {
    const player: HumanPlayer = { ...base, status: "CONNECTED" };
    expect(resolveIsEmpty(player)).toBe(false);
  });

  it('status="READY" → isEmpty=false', () => {
    const player: HumanPlayer = { ...base, status: "READY" };
    expect(resolveIsEmpty(player)).toBe(false);
  });

  it('status="DISCONNECTED" → isEmpty=false', () => {
    const player: HumanPlayer = { ...base, status: "DISCONNECTED" };
    expect(resolveIsEmpty(player)).toBe(false);
  });

  it('status="FORFEITED" → isEmpty=false', () => {
    const player: HumanPlayer = { ...base, status: "FORFEITED" };
    expect(resolveIsEmpty(player)).toBe(false);
  });
});

// ------------------------------------------------------------------
// 3. AI 플레이어 — status별 isEmpty 판별
// ------------------------------------------------------------------
describe("SeatSlot isEmpty — AIPlayer", () => {
  const base: Omit<AIPlayer, "status"> = {
    seat: 1,
    type: "AI_OPENAI",
    persona: "shark",
    difficulty: "expert",
    psychologyLevel: 0,
  };

  it('AI status="EMPTY" → isEmpty=true', () => {
    const player: AIPlayer = { ...base, status: "EMPTY" };
    expect(resolveIsEmpty(player)).toBe(true);
  });

  it('AI status="READY" → isEmpty=false', () => {
    const player: AIPlayer = { ...base, status: "READY" };
    expect(resolveIsEmpty(player)).toBe(false);
  });

  it('AI status="THINKING" → isEmpty=false', () => {
    const player: AIPlayer = { ...base, status: "THINKING" };
    expect(resolveIsEmpty(player)).toBe(false);
  });

  it('AI status="CONNECTED" → isEmpty=false', () => {
    const player: AIPlayer = { ...base, status: "CONNECTED" };
    expect(resolveIsEmpty(player)).toBe(false);
  });

  it('AI status="DISCONNECTED" → isEmpty=false', () => {
    const player: AIPlayer = { ...base, status: "DISCONNECTED" };
    expect(resolveIsEmpty(player)).toBe(false);
  });

  it('AI status="FORFEITED" → isEmpty=false', () => {
    const player: AIPlayer = { ...base, status: "FORFEITED" };
    expect(resolveIsEmpty(player)).toBe(false);
  });
});

// ------------------------------------------------------------------
// 4. 서버 응답 시뮬레이션 — 실제 페이로드 형태
// ------------------------------------------------------------------
describe("SeatSlot isEmpty — 서버 빈 좌석 페이로드 시뮬레이션", () => {
  it('서버 페이로드 { seat:2, type:"HUMAN", status:"EMPTY" } → isEmpty=true', () => {
    const serverPayload = {
      seat: 2,
      type: "HUMAN" as const,
      userId: "",
      displayName: "",
      status: "EMPTY" as const,
    } satisfies HumanPlayer;
    expect(resolveIsEmpty(serverPayload)).toBe(true);
  });

  it("정상 플레이어가 있는 좌석 → isEmpty=false", () => {
    const serverPayload: HumanPlayer = {
      seat: 0,
      type: "HUMAN",
      userId: "u-host",
      displayName: "애벌레",
      status: "CONNECTED",
    };
    expect(resolveIsEmpty(serverPayload)).toBe(false);
  });
});
