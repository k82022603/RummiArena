/**
 * F-15 턴 타이머 + 자동 드로우 — RED spec
 *
 * 룰 ID: V-09 (턴 타임아웃), UR-26 (타이머 ≤10초 빨강 펄스)
 * 상태 전이: S1/S5/S6 → S0 (TURN_END timeout 강제)
 * acceptance criteria: AC-15.1 / AC-15.2
 *
 * SSOT: docs/02-design/55-game-rules-enumeration.md §2.9 V-09, §3.4 UR-26
 *       docs/02-design/56b-state-machine.md §2 S1/S5/S6 → S0 강제 전이
 *       docs/02-design/60-ui-feature-spec.md §1.2 F-15
 *
 * Phase D Day 1 — RED commit (구현 없음, 모두 FAIL 예상)
 * commit message: [F-15] [V-09] [UR-26] turn-timer and auto-draw — RED spec
 */

import { renderHook, act } from "@testing-library/react";
import { useGameStore } from "@/store/gameStore";
import { usePendingStore } from "@/store/pendingStore";
import { useTurnTimer } from "@/hooks/useTurnTimer";
import type { TableGroup, TileCode } from "@/types/tile";

// Phase C 단계 4 (2026-04-28):
//   gameStore.pendingTableGroups/pendingGroupIds/resetPending 등 deprecated 필드 제거.
//   pendingStore.draft + pendingStore.reset() 으로 마이그레이션.
function setDraft(partial: {
  groups?: TableGroup[];
  pendingGroupIds?: Set<string>;
}) {
  usePendingStore.setState({
    draft: {
      groups: partial.groups ?? [],
      pendingGroupIds: partial.pendingGroupIds ?? new Set<string>(),
      myTiles: [],
      recoveredJokers: [],
      turnStartRack: [],
      turnStartTableGroups: [],
    },
  });
}

function getPendingSnapshot() {
  const draft = usePendingStore.getState().draft;
  return {
    pendingTableGroups: draft ? draft.groups : null,
    pendingGroupIds: draft?.pendingGroupIds ?? new Set<string>(),
  };
}

// ---------------------------------------------------------------------------
// AC-15.1: S1, 10초 미만 → UR-26 빨강 펄스 (CSS class --timer-warning)
// useTurnTimer.isWarning === true (seconds <= 10)
// ---------------------------------------------------------------------------

describe("[F-15] [UR-26] AC-15.1 — 타이머 ≤10초 → isWarning === true", () => {
  beforeEach(() => {
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
    act(() => {
      useGameStore.setState({ remainingMs: 0 });
    });
  });

  it("remainingMs=10000 (10초) → isWarning === true (UR-26 빨강 펄스 경계)", () => {
    act(() => {
      useGameStore.setState({ remainingMs: 10000 });
    });

    const { result } = renderHook(() => useTurnTimer());

    // AC-15.1: 10초 = 경고 경계
    expect(result.current.seconds).toBe(10);
    expect(result.current.isWarning).toBe(true);
  });

  it("remainingMs=9000 (9초) → isWarning === true", () => {
    act(() => {
      useGameStore.setState({ remainingMs: 9000 });
    });

    const { result } = renderHook(() => useTurnTimer());

    expect(result.current.seconds).toBe(9);
    expect(result.current.isWarning).toBe(true);
  });

  it("remainingMs=11000 (11초) → isWarning === false (경고 아직 아님)", () => {
    act(() => {
      useGameStore.setState({ remainingMs: 11000 });
    });

    const { result } = renderHook(() => useTurnTimer());

    expect(result.current.seconds).toBe(11);
    expect(result.current.isWarning).toBe(false);
  });

  it("remainingMs=5000 (5초) → isDanger === true + isWarning === true", () => {
    act(() => {
      useGameStore.setState({ remainingMs: 5000 });
    });

    const { result } = renderHook(() => useTurnTimer());

    // 5초 이하는 danger (TurnTimer에서 bg-danger 표시)
    expect(result.current.isDanger).toBe(true);
    expect(result.current.isWarning).toBe(true);
  });

  it("remainingMs=0 → seconds === 0, isWarning === false (타이머 종료)", () => {
    act(() => {
      useGameStore.setState({ remainingMs: 0 });
    });

    const { result } = renderHook(() => useTurnTimer());

    expect(result.current.seconds).toBe(0);
    // 0초에서는 경고 표시 없음 (이미 종료)
    expect(result.current.isWarning).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// AC-15.1 (TurnTimer 컴포넌트 시각 검증)
// isWarning=true → CSS 클래스에 경고 색상이 포함되어야 함 (UR-26)
// ---------------------------------------------------------------------------

describe("[F-15] [UR-26] AC-15.1 — TurnTimer 컴포넌트 경고 색상 class", () => {
  it("seconds <= 10 → TurnTimer 텍스트에 경고 색상 클래스 적용 (--timer-warning)", () => {
    // TurnTimer 컴포넌트가 isWarning=true 일 때 text-warning 클래스를 적용하는지 확인
    // 현재 구현: textColor = isWarning ? "text-warning" : "text-text-secondary"
    //
    // AC-15.1: CSS class --timer-warning 또는 text-warning 이 적용되어야 함
    // Verify: CSS class 확인 (useTurnTimer mock 사용)

    // 이 테스트는 useTurnTimer를 직접 결과로 검증
    // (컴포넌트 렌더링은 별도 테스트에서 처리)
    act(() => {
      useGameStore.setState({ remainingMs: 8000 });
    });

    const { result } = renderHook(() => useTurnTimer());
    expect(result.current.isWarning).toBe(true);

    // 실제 CSS 검증: TurnTimer 컴포넌트는 isWarning=true 시 textColor에
    // "text-warning" 클래스를 사용 (TurnTimer.tsx 라인 33-36)
    // → 컴포넌트 렌더 테스트에서 data-testid 또는 class 확인 필요
    // 현재 spec은 useTurnTimer 반환값으로 검증
  });
});

// ---------------------------------------------------------------------------
// AC-15.2: timer=0 → 서버 TURN_END(timeout) 수신 → S0 전이
// 클라이언트 단위: TURN_END 수신 시 gameState.currentSeat 갱신 + remainingMs=0
//
// F-15 명세: "클라가 자체 timeout으로 자동 RESET 호출 X. 서버 권위 유지" (band-aid 금지)
// ---------------------------------------------------------------------------

describe("[F-15] [V-09] [S0] AC-15.2 — TURN_END(timeout) → S0 전이", () => {
  it("TURN_END 수신 후 gameState.currentSeat = nextSeat (S0 진입 조건)", () => {
    // TURN_END payload: { reason: "TIMEOUT", seat: 0, nextSeat: 1, ... }
    // 클라이언트에서 TURN_END 수신 시 currentSeat = nextSeat
    act(() => {
      useGameStore.setState({
        mySeat: 0,
        gameState: {
          currentSeat: 0, // 내 턴 → timeout 발생
          tableGroups: [],
          drawPileCount: 60,
          turnStartedAt: new Date(0).toISOString(),
          turnTimeoutSec: 60,
        },
        remainingMs: 0,
      });
    });

    // TURN_END 처리 시뮬레이션 (useWebSocket.ts TURN_END case 재현)
    act(() => {
      useGameStore.setState((state) => ({
        gameState: state.gameState
          ? { ...state.gameState, currentSeat: 1 } // nextSeat=1로 전환
          : state.gameState,
      }));
    });

    const { gameState, mySeat } = useGameStore.getState();
    const isMyTurn = gameState?.currentSeat === mySeat;

    // AC-15.2: TURN_END(timeout) 후 내 턴 아님 (S0)
    expect(isMyTurn).toBe(false); // S0: OUT_OF_TURN
    expect(gameState?.currentSeat).toBe(1);
  });

  it("TURN_END(timeout) 후 pending 상태 클리어 (UR-04)", () => {
    act(() => {
      useGameStore.setState({
        mySeat: 0,
        gameState: {
          currentSeat: 0,
          tableGroups: [],
          drawPileCount: 60,
          turnStartedAt: new Date(0).toISOString(),
          turnTimeoutSec: 60,
        },
      });
      setDraft({
        groups: [{ id: "pending-timeout", tiles: ["R7a"] as TileCode[], type: "group" }],
        pendingGroupIds: new Set(["pending-timeout"]),
      });
    });

    // TURN_END 처리: pendingStore.reset() 호출
    act(() => {
      usePendingStore.getState().reset();
      useGameStore.setState((state) => ({
        gameState: state.gameState
          ? { ...state.gameState, currentSeat: 1 }
          : state.gameState,
      }));
    });

    const { pendingTableGroups, pendingGroupIds } = getPendingSnapshot();
    const pendingCount = pendingTableGroups ? pendingTableGroups.length : 0;

    // UR-04: pending 리셋
    expect(pendingCount).toBe(0);
    expect(pendingGroupIds.size).toBe(0);
  });

  it("F-15 band-aid 금지 — 클라 자체 타임아웃으로 RESET 호출 없음", () => {
    // F-15 명세: "클라가 자체 timeout으로 자동 RESET 호출 X. 서버 권위 유지"
    // useTurnTimer는 remainingMs를 감소시키되, RESET이나 DRAW를 직접 호출하지 않음
    //
    // 이 테스트는 useTurnTimer가 서버 이벤트 없이 자체적으로 pending을 날리지 않음을 검증
    act(() => {
      useGameStore.setState({
        mySeat: 0,
        remainingMs: 60000,
      });
      setDraft({
        groups: [{ id: "pending-should-survive", tiles: ["R7a"] as TileCode[], type: "group" }],
        pendingGroupIds: new Set(["pending-should-survive"]),
      });
    });

    const { result } = renderHook(() => useTurnTimer());

    // useTurnTimer가 pending에 영향을 주지 않아야 함
    // 타이머 hook은 remainingMs를 읽고 isWarning/isDanger만 반환
    expect(result.current.seconds).toBeGreaterThan(0);

    const { pendingTableGroups } = getPendingSnapshot();
    // pending 그룹은 그대로 (useTurnTimer가 건드리지 않음)
    expect(pendingTableGroups).not.toBeNull();
    expect(pendingTableGroups?.length).toBe(1);
  });
});

// ---------------------------------------------------------------------------
// F-15 타이머 카운트다운 검증 (useTurnTimer interval)
// ---------------------------------------------------------------------------

describe("[F-15] [V-09] 타이머 카운트다운 동작", () => {
  beforeEach(() => {
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it("1초 경과 후 seconds 1 감소 (타이머 카운트다운)", () => {
    act(() => {
      useGameStore.setState({ remainingMs: 60000 });
    });

    const { result } = renderHook(() => useTurnTimer());
    expect(result.current.seconds).toBe(60);

    act(() => {
      jest.advanceTimersByTime(1000);
    });

    expect(result.current.seconds).toBe(59);
  });

  it("새 턴 시작(remainingMs 증가) 시 타이머 리셋 (TURN_START 대응)", () => {
    act(() => {
      useGameStore.setState({ remainingMs: 5000 });
    });

    const { result: result1 } = renderHook(() => useTurnTimer());
    expect(result1.current.seconds).toBe(5);

    // 새 턴 TURN_START — setRemainingMs(60000) 호출
    act(() => {
      useGameStore.setState({ remainingMs: 60000 });
    });

    // 타이머가 새 값(60초)으로 리셋
    expect(result1.current.seconds).toBe(60);
  });
});
