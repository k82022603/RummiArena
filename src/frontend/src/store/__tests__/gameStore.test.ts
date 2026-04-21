/**
 * gameStore selectMyTileCount selector 단위 테스트 (P1-3 회귀 방지)
 *
 * 검증 대상: src/store/gameStore.ts:237-246
 *
 * 오늘 버그: PlayerCard 배지 "20장" vs rack 실제 수 "17개" 불일치.
 * 미확정 배치 타일(pendingMyTiles)이 tileCount 계산에서 누락됨.
 *
 * 해결: pendingMyTiles !== null 이면 그 길이를 우선 사용.
 */

import { selectMyTileCount, useGameStore } from "@/store/gameStore";

describe("selectMyTileCount selector", () => {
  beforeEach(() => {
    // 각 테스트마다 스토어 초기화
    useGameStore.getState().reset();
  });

  it("기본 상태 (mySeat=-1, players 비어있음) 은 0 반환", () => {
    const count = selectMyTileCount(useGameStore.getState());
    expect(count).toBe(0);
  });

  it("mySeat 존재 + players 에 내 시트 있으면 tileCount 반환", () => {
    useGameStore.setState({
      mySeat: 0,
      players: [
        { seat: 0, type: "HUMAN", tileCount: 14 },
        { seat: 1, type: "AI_OPENAI", tileCount: 14 },
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
      ] as any,
      pendingMyTiles: null,
    });
    expect(selectMyTileCount(useGameStore.getState())).toBe(14);
  });

  it("mySeat 에 해당하는 플레이어 없으면 0 반환", () => {
    useGameStore.setState({
      mySeat: 99, // 없는 시트
      players: [
        { seat: 0, type: "HUMAN", tileCount: 14 },
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
      ] as any,
      pendingMyTiles: null,
    });
    expect(selectMyTileCount(useGameStore.getState())).toBe(0);
  });

  it("tileCount 필드가 없으면 0 반환 (undefined 안전성)", () => {
    useGameStore.setState({
      mySeat: 0,
      players: [
        { seat: 0, type: "HUMAN" }, // tileCount 없음
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
      ] as any,
      pendingMyTiles: null,
    });
    expect(selectMyTileCount(useGameStore.getState())).toBe(0);
  });

  it("pendingMyTiles 가 존재하면 그 길이를 우선 반환 (P1-3 핵심)", () => {
    useGameStore.setState({
      mySeat: 0,
      players: [
        { seat: 0, type: "HUMAN", tileCount: 20 }, // 서버값
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
      ] as any,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      pendingMyTiles: ["R1a", "R2a", "R3a", "B5a", "Y7a"] as any, // 실제 rack 5개
    });
    // server tileCount 20 이 아니라 pendingMyTiles 길이 5 반환
    expect(selectMyTileCount(useGameStore.getState())).toBe(5);
  });

  it("pendingMyTiles 빈 배열이면 0 반환 (모든 타일 배치 시)", () => {
    useGameStore.setState({
      mySeat: 0,
      players: [
        { seat: 0, type: "HUMAN", tileCount: 14 },
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
      ] as any,
      pendingMyTiles: [], // 빈 배열 != null → 0으로 오버라이드
    });
    expect(selectMyTileCount(useGameStore.getState())).toBe(0);
  });

  it("pendingMyTiles null 은 selector 비활성화 (서버값 사용)", () => {
    useGameStore.setState({
      mySeat: 0,
      players: [
        { seat: 0, type: "HUMAN", tileCount: 14 },
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
      ] as any,
      pendingMyTiles: null,
    });
    expect(selectMyTileCount(useGameStore.getState())).toBe(14);
  });

  it("drift 방지: pendingMyTiles 가 후속 업데이트로 변해도 selector 동기화", () => {
    useGameStore.setState({
      mySeat: 0,
      players: [
        { seat: 0, type: "HUMAN", tileCount: 14 },
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
      ] as any,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      pendingMyTiles: ["R1a", "R2a", "R3a"] as any,
    });
    expect(selectMyTileCount(useGameStore.getState())).toBe(3);

    // 드래그로 타일 1개 추가 반환
    useGameStore.setState({
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      pendingMyTiles: ["R1a", "R2a", "R3a", "B7a"] as any,
    });
    expect(selectMyTileCount(useGameStore.getState())).toBe(4);

    // 확정으로 pending 초기화 (서버 응답으로 tileCount=10 으로 감소)
    useGameStore.setState({
      pendingMyTiles: null,
      players: [
        { seat: 0, type: "HUMAN", tileCount: 10 },
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
      ] as any,
    });
    expect(selectMyTileCount(useGameStore.getState())).toBe(10);
  });
});
