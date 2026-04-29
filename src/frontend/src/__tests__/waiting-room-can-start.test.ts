/**
 * WaitingRoomClient canStart 조건 단위 테스트
 *
 * 작성일: 2026-04-28 (A-2단계: 빈 슬롯 차단)
 * 근거: 4인방에 2명만 있어도 시작 가능한 버그 수정.
 *       canStart = currentPlayers >= requiredPlayers && requiredPlayers > 0
 *
 * 관련 파일: src/app/room/[roomId]/WaitingRoomClient.tsx (257~260행)
 */

/**
 * canStart 판별 순수 함수 (WaitingRoomClient.tsx 내부 로직 추출)
 */
function resolveCanStart(
  playerCount: number | undefined,
  settingsPlayerCount: number | undefined
): boolean {
  const requiredPlayers = settingsPlayerCount ?? 0;
  const currentPlayers = playerCount ?? 0;
  return currentPlayers >= requiredPlayers && requiredPlayers > 0;
}

// ------------------------------------------------------------------
// 1. 4인방
// ------------------------------------------------------------------
describe("canStart — 4인방 (settings.playerCount = 4)", () => {
  const required = 4;

  it("4/4명 → canStart=true", () => {
    expect(resolveCanStart(4, required)).toBe(true);
  });

  it("3/4명 → canStart=false (빈 슬롯 1개)", () => {
    expect(resolveCanStart(3, required)).toBe(false);
  });

  it("2/4명 → canStart=false (빈 슬롯 2개, 어제 사고 원인)", () => {
    expect(resolveCanStart(2, required)).toBe(false);
  });

  it("1/4명 → canStart=false", () => {
    expect(resolveCanStart(1, required)).toBe(false);
  });

  it("0/4명 → canStart=false", () => {
    expect(resolveCanStart(0, required)).toBe(false);
  });
});

// ------------------------------------------------------------------
// 2. 3인방
// ------------------------------------------------------------------
describe("canStart — 3인방 (settings.playerCount = 3)", () => {
  const required = 3;

  it("3/3명 → canStart=true", () => {
    expect(resolveCanStart(3, required)).toBe(true);
  });

  it("2/3명 → canStart=false", () => {
    expect(resolveCanStart(2, required)).toBe(false);
  });

  it("1/3명 → canStart=false", () => {
    expect(resolveCanStart(1, required)).toBe(false);
  });
});

// ------------------------------------------------------------------
// 3. 2인방
// ------------------------------------------------------------------
describe("canStart — 2인방 (settings.playerCount = 2)", () => {
  const required = 2;

  it("2/2명 → canStart=true", () => {
    expect(resolveCanStart(2, required)).toBe(true);
  });

  it("1/2명 → canStart=false", () => {
    expect(resolveCanStart(1, required)).toBe(false);
  });
});

// ------------------------------------------------------------------
// 4. 방 데이터 null/undefined 방어
// ------------------------------------------------------------------
describe("canStart — room 데이터 없는 경우 방어", () => {
  it("playerCount=undefined, settings.playerCount=4 → canStart=false", () => {
    expect(resolveCanStart(undefined, 4)).toBe(false);
  });

  it("playerCount=4, settings.playerCount=undefined → canStart=false (requiredPlayers=0)", () => {
    expect(resolveCanStart(4, undefined)).toBe(false);
  });

  it("둘 다 undefined → canStart=false", () => {
    expect(resolveCanStart(undefined, undefined)).toBe(false);
  });

  it("requiredPlayers=0이면 절대 canStart=false (0명 방 방어)", () => {
    expect(resolveCanStart(0, 0)).toBe(false);
  });
});
