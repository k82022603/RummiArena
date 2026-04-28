/**
 * gameStore selectMyTileCount selector 단위 테스트 (P1-3 회귀 방지)
 *
 * 검증 대상: src/store/gameStore.ts selectMyTileCount
 *
 * 오늘 버그: PlayerCard 배지 "20장" vs rack 실제 수 "17개" 불일치.
 * 미확정 배치 타일이 tileCount 계산에서 누락됨.
 *
 * Phase C 단계 4 (2026-04-28):
 *   gameStore.pendingMyTiles / addRecoveredJoker / resetPending 등 deprecated 필드 제거.
 *   selectMyTileCount 는 이제 pendingStore.draft.myTiles 를 우선 사용한다.
 *   기존 테스트는 pendingStore 기반으로 마이그레이션.
 */

import { selectMyTileCount, useGameStore } from "@/store/gameStore";
import { usePendingStore } from "@/store/pendingStore";
import type { TileCode } from "@/types/tile";

describe("selectMyTileCount selector", () => {
  beforeEach(() => {
    // 각 테스트마다 두 store 모두 초기화
    useGameStore.getState().reset();
    usePendingStore.getState().reset();
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
    });
    expect(selectMyTileCount(useGameStore.getState())).toBe(0);
  });

  it("pendingStore.draft.myTiles 가 존재하면 그 길이를 우선 반환 (P1-3 핵심)", () => {
    useGameStore.setState({
      mySeat: 0,
      players: [
        { seat: 0, type: "HUMAN", tileCount: 20 }, // 서버값
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
      ] as any,
    });
    // pendingStore.draft 에 직접 myTiles 주입
    usePendingStore.setState({
      draft: {
        groups: [],
        pendingGroupIds: new Set<string>(),
        myTiles: ["R1a", "R2a", "R3a", "B5a", "Y7a"] as TileCode[],
        recoveredJokers: [],
        turnStartRack: [],
        turnStartTableGroups: [],
      },
    });
    // server tileCount 20 이 아니라 draft.myTiles 길이 5 반환
    expect(selectMyTileCount(useGameStore.getState())).toBe(5);
  });

  it("pendingStore.draft.myTiles 빈 배열이면 0 반환 (모든 타일 배치 시)", () => {
    useGameStore.setState({
      mySeat: 0,
      players: [
        { seat: 0, type: "HUMAN", tileCount: 14 },
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
      ] as any,
    });
    usePendingStore.setState({
      draft: {
        groups: [],
        pendingGroupIds: new Set<string>(),
        myTiles: [], // 빈 배열 != null → 0으로 오버라이드
        recoveredJokers: [],
        turnStartRack: [],
        turnStartTableGroups: [],
      },
    });
    expect(selectMyTileCount(useGameStore.getState())).toBe(0);
  });

  it("pendingStore.draft 가 null 이면 selector 비활성화 (서버값 사용)", () => {
    useGameStore.setState({
      mySeat: 0,
      players: [
        { seat: 0, type: "HUMAN", tileCount: 14 },
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
      ] as any,
    });
    // pendingStore.draft = null (beforeEach 에서 reset)
    expect(selectMyTileCount(useGameStore.getState())).toBe(14);
  });

  it("drift 방지: draft.myTiles 가 후속 업데이트로 변해도 selector 동기화", () => {
    useGameStore.setState({
      mySeat: 0,
      players: [
        { seat: 0, type: "HUMAN", tileCount: 14 },
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
      ] as any,
    });
    usePendingStore.setState({
      draft: {
        groups: [],
        pendingGroupIds: new Set<string>(),
        myTiles: ["R1a", "R2a", "R3a"] as TileCode[],
        recoveredJokers: [],
        turnStartRack: [],
        turnStartTableGroups: [],
      },
    });
    expect(selectMyTileCount(useGameStore.getState())).toBe(3);

    // 드래그로 타일 1개 추가 반환
    usePendingStore.setState((state) => ({
      draft: state.draft
        ? { ...state.draft, myTiles: ["R1a", "R2a", "R3a", "B7a"] as TileCode[] }
        : state.draft,
    }));
    expect(selectMyTileCount(useGameStore.getState())).toBe(4);

    // 확정으로 pending 초기화 (서버 응답으로 tileCount=10 으로 감소)
    usePendingStore.getState().reset();
    useGameStore.setState({
      players: [
        { seat: 0, type: "HUMAN", tileCount: 10 },
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
      ] as any,
    });
    expect(selectMyTileCount(useGameStore.getState())).toBe(10);
  });
});

// ---------------------------------------------------------------------------
// G-4 회귀 방지: tileCount drift 시나리오
//
// qa 실측에서 관찰된 진동(9→7→9→10→7) 재현 조건:
//   1. 드래그 중 draft.myTiles가 myTiles와 달라짐
//   2. board→rack 역방향 이동 후 pending이 되돌아가는 경우
//   3. TURN_END 수신 후 pendingStore.reset 전 window에서 drift
//
// 수정(G-4): GameClient에서 내 PlayerCard tileCount를 currentMyTiles.length로 override.
// selector는 여전히 유효하며, 이 테스트는 selector 레이어의 회귀를 감지한다.
// ---------------------------------------------------------------------------
describe("G-4 tileCount drift 회귀 시나리오", () => {
  beforeEach(() => {
    useGameStore.getState().reset();
    usePendingStore.getState().reset();
  });

  it("board→rack 되돌리기 후 draft.myTiles 증가가 selector에 반영된다", () => {
    /* eslint-disable @typescript-eslint/no-explicit-any */
    // 초기: 내 랙 14장, server tileCount=14
    useGameStore.setState({
      mySeat: 0,
      players: [{ seat: 0, type: "HUMAN", tileCount: 14 }] as any,
      myTiles: ["R1a", "R2a", "R3a", "B5a", "Y7a", "K9a", "R4a", "B6a", "Y8a", "K10a", "R11a", "B12a", "Y13a", "K1b"] as any,
    });

    // step1: 타일 3개 드래그해서 보드에 배치 → draft.myTiles 11개
    usePendingStore.setState({
      draft: {
        groups: [],
        pendingGroupIds: new Set<string>(),
        myTiles: ["R2a", "R3a", "B5a", "Y7a", "K9a", "R4a", "B6a", "Y8a", "K10a", "R11a", "B12a"] as any,
        recoveredJokers: [],
        turnStartRack: [],
        turnStartTableGroups: [],
      },
    });
    expect(selectMyTileCount(useGameStore.getState())).toBe(11);

    // step2: 보드에서 타일 1개 랙으로 되돌림 → draft.myTiles 12개
    usePendingStore.setState((state) => ({
      draft: state.draft
        ? { ...state.draft, myTiles: ["R2a", "R3a", "B5a", "Y7a", "K9a", "R4a", "B6a", "Y8a", "K10a", "R11a", "B12a", "Y13a"] as any }
        : state.draft,
    }));
    expect(selectMyTileCount(useGameStore.getState())).toBe(12);

    // step3: 다시 1개 더 배치 → draft.myTiles 11개
    usePendingStore.setState((state) => ({
      draft: state.draft
        ? { ...state.draft, myTiles: ["R2a", "R3a", "B5a", "Y7a", "K9a", "R4a", "B6a", "Y8a", "K10a", "R11a", "B12a"] as any }
        : state.draft,
    }));
    expect(selectMyTileCount(useGameStore.getState())).toBe(11);
    /* eslint-enable @typescript-eslint/no-explicit-any */

    // 서버 tileCount(14)가 아닌 pending 기준 11이어야 함
    expect(selectMyTileCount(useGameStore.getState())).not.toBe(14);
  });

  it("TURN_END 수신 후 myRack 업데이트 시 draft가 null이면 서버값 반영", () => {
    // 초기 draft=null 상태 (턴 시작 직후)
    useGameStore.setState({
      mySeat: 1,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      players: [{ seat: 1, type: "HUMAN", tileCount: 14 }] as any,
    });
    expect(selectMyTileCount(useGameStore.getState())).toBe(14);

    // TURN_END: 내가 드로우해서 15장이 됨. draft=null이므로 서버값(15) 반영.
    useGameStore.setState({
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      players: [{ seat: 1, type: "HUMAN", tileCount: 15 }] as any,
    });
    expect(selectMyTileCount(useGameStore.getState())).toBe(15);
  });

  it("pendingStore.reset 호출 후 draft null → 서버 tileCount 기준으로 복귀", () => {
    /* eslint-disable @typescript-eslint/no-explicit-any */
    useGameStore.setState({
      mySeat: 0,
      players: [{ seat: 0, type: "HUMAN", tileCount: 11 }] as any,
    });
    usePendingStore.setState({
      draft: {
        groups: [],
        pendingGroupIds: new Set<string>(),
        myTiles: ["R1a", "R2a", "B3a"] as any, // pending 3개
        recoveredJokers: [],
        turnStartRack: [],
        turnStartTableGroups: [],
      },
    });
    /* eslint-enable @typescript-eslint/no-explicit-any */
    expect(selectMyTileCount(useGameStore.getState())).toBe(3); // pending 우선

    // pendingStore.reset() 호출 (TURN_START 수신 시 호출됨)
    usePendingStore.getState().reset();
    expect(selectMyTileCount(useGameStore.getState())).toBe(11); // 서버 기준 복귀
  });
});
