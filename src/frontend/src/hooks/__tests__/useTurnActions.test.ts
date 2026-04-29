/**
 * useTurnActions 테스트 — Phase 2 L2 hook
 *
 * SSOT 매핑:
 *   - 58 §2 F-09: ConfirmTurn 사전검증 + WS 발신
 *   - 58 §2 F-11: DRAW 버튼 활성 조건
 *   - UR-15: confirmEnabled 종합 조건
 *   - UR-22: drawEnabled = isMyTurn && pending 없음
 *   - UR-36: confirmValidator 외 임의 게이트 금지
 *
 * [2026-04-28 Phase B] pendingStore.draft SSOT 재전환:
 *   GameClient.handleDragEnd 9개 분기에 pendingStore.applyMutation dual-write가
 *   추가되었고 useGameSync가 TURN_START 시 saveTurnStartSnapshot()을 호출하므로,
 *   useTurnActions를 다시 pendingStore.draft 기반으로 전환.
 *   - confirmEnabled: selectHasPending && tilesAdded>=1 && allGroupsValid && (hasInitialMeld || score>=30)
 *   - drawEnabled: isMyTurn && !selectHasPending(pendingStore)
 *   - resetEnabled: selectHasPending(pendingStore)
 *   setup 함수들도 pendingStore.applyMutation()/saveTurnStartSnapshot() 기반으로 수정.
 */

import { act, renderHook } from "@testing-library/react";
import {
  useTurnActions,
  registerWSSendBridge,
  unregisterWSSendBridge,
} from "../useTurnActions";
import { usePendingStore } from "@/store/pendingStore";
import { useGameStore } from "@/store/gameStore";
import type { TableGroup, TileCode } from "@/types/tile";

// ---------------------------------------------------------------------------
// 헬퍼
// ---------------------------------------------------------------------------

function makeGroup(id: string, tiles: TileCode[]): TableGroup {
  return { id, tiles, type: "run" };
}

/**
 * 내 턴 상태 설정 — gameState.currentSeat === mySeat(0)
 * useTurnActions의 isMyTurn = computeIsMyTurn(currentSeat, mySeat) 조건 충족
 */
function setupMyTurnIdle(hasInitialMeld: boolean = false) {
  // Phase C 단계 4: gameStore.pending* deprecated 필드 제거.
  // pendingStore.reset()으로 pending 없음 상태 보장.
  usePendingStore.setState({ draft: null });
  useGameStore.setState({
    mySeat: 0,
    hasInitialMeld,
    players: [{
      seat: 0,
      type: "HUMAN" as const,
      userId: "u0",
      displayName: "P0",
      tileCount: 5,
      hasInitialMeld,
      status: "CONNECTED" as const,
    }],
    myTiles: ["R5a", "R6a", "R7a", "R8a", "R9a"] as TileCode[],
    gameState: {
      currentSeat: 0,        // isMyTurn=true (mySeat=0과 일치)
      tableGroups: [],
      drawPileCount: 10,
      turnStartedAt: new Date().toISOString(),
      turnTimeoutSec: 60,
    } as import("@/types/game").GameState,
  });
}

/**
 * pending 상태 설정 — pendingStore.draft에 그룹이 있는 상태
 *
 * [2026-04-28 Phase B] useTurnActions가 pendingStore.draft를 직접 읽으므로
 * saveTurnStartSnapshot() + applyMutation() 기반으로 설정한다.
 *
 * 턴 시작 랙(turnStartRack): 5장
 * 보드에 3장 배치 후 랙(myTiles)에 2장 남음 → selectTilesAdded = 5-2 = 3
 */
function setupPendingBuilding(hasInitialMeld: boolean = true) {
  setupMyTurnIdle(hasInitialMeld);

  const ps = usePendingStore.getState();
  // 턴 시작 스냅샷 저장: 랙 5장, 빈 테이블
  ps.saveTurnStartSnapshot(
    ["R5a", "R6a", "R7a", "R8a", "R9a"] as TileCode[],
    []
  );
  // pending 그룹 추가: 랙에서 3장 → 보드 새 그룹
  ps.applyMutation({
    nextTableGroups: [makeGroup("pending-x", ["R5a", "R6a", "R7a"])],
    nextPendingGroupIds: new Set(["pending-x"]),
    nextMyTiles: ["R8a", "R9a"] as TileCode[],
    nextPendingRecoveredJokers: [],
    nextPendingGroupSeq: 1,
    branch: "test/setupPendingBuilding",
  });
}

/**
 * pending 상태 설정 (setupPendingBuilding 동일 — PRE_CHECK_PASS는 더 이상 필요 없음)
 */
function setupPendingReady(hasInitialMeld: boolean = true) {
  setupPendingBuilding(hasInitialMeld);
}

// ---------------------------------------------------------------------------
// 초기화
// ---------------------------------------------------------------------------

beforeEach(() => {
  act(() => {
    // Phase C 단계 4: gameStore deprecated pending 필드 제거.
    // pendingStore.reset()으로 pending 없음 상태 보장.
    usePendingStore.setState({ draft: null });
    useGameStore.setState({
      mySeat: 0,
      hasInitialMeld: false,
      players: [],
      myTiles: [],
      gameState: null,
    });
  });
  unregisterWSSendBridge();
});

afterEach(() => {
  unregisterWSSendBridge();
});

// ---------------------------------------------------------------------------
// 1. confirmEnabled — pending 없을 때 false
// ---------------------------------------------------------------------------

test("confirmEnabled = false when draft is null (my turn, no pending)", () => {
  act(() => {
    setupMyTurnIdle(true);
  });

  const { result } = renderHook(() => useTurnActions());
  expect(result.current.confirmEnabled).toBe(false);
});

// ---------------------------------------------------------------------------
// 2. confirmEnabled — 내 턴 + 유효한 세트 + hasInitialMeld=true → true
// ---------------------------------------------------------------------------

test("confirmEnabled = true when my turn, valid groups, hasInitialMeld=true", () => {
  act(() => {
    setupPendingReady(true);
  });

  const { result } = renderHook(() => useTurnActions());
  // isMyTurn + hasPending + tilesAdded>=1 + allGroupsValid + hasInitialMeld
  expect(result.current.confirmEnabled).toBe(true);
});

// ---------------------------------------------------------------------------
// 3. drawEnabled — 내 턴 && pending 없음 → true
// ---------------------------------------------------------------------------

test("drawEnabled = true when my turn and no pending draft", () => {
  act(() => {
    setupMyTurnIdle(false);
  });

  const { result } = renderHook(() => useTurnActions());
  expect(result.current.drawEnabled).toBe(true);
});

// ---------------------------------------------------------------------------
// 4. drawEnabled — pending 있을 때 → false
// ---------------------------------------------------------------------------

test("drawEnabled = false when pending exists", () => {
  act(() => {
    setupPendingBuilding(true);
  });

  const { result } = renderHook(() => useTurnActions());
  expect(result.current.drawEnabled).toBe(false);
});

// ---------------------------------------------------------------------------
// 5. handleUndo — gameStore pending 초기화
// ---------------------------------------------------------------------------

test("handleUndo → pendingStore.reset 호출됨", () => {
  act(() => {
    setupPendingBuilding(true);
  });

  const { result } = renderHook(() => useTurnActions());
  expect(result.current.resetEnabled).toBe(true);

  act(() => {
    result.current.handleUndo();
  });

  const ps = usePendingStore.getState();
  expect(ps.draft).not.toBeNull();
  expect(ps.draft!.pendingGroupIds.size).toBe(0);
  expect(ps.draft!.groups).toEqual([]);
});

// ---------------------------------------------------------------------------
// 6. handleDraw — WS 브릿지 호출
// ---------------------------------------------------------------------------

test("handleDraw → WS DRAW_TILE 발신", () => {
  act(() => {
    setupMyTurnIdle(false);
  });

  const sent: Array<{ type: string; payload: unknown }> = [];
  registerWSSendBridge((type, payload) => {
    sent.push({ type, payload });
  });

  const { result } = renderHook(() => useTurnActions());
  expect(result.current.drawEnabled).toBe(true);

  act(() => {
    result.current.handleDraw();
  });

  expect(sent).toHaveLength(1);
  expect(sent[0].type).toBe("DRAW_TILE");
});

// ---------------------------------------------------------------------------
// 7. confirmEnabled — V-04 미충족 시 false (hasInitialMeld=false, score 18 < 30)
// ---------------------------------------------------------------------------

test("confirmEnabled = false when score < 30 and hasInitialMeld=false", () => {
  // 내 턴이지만 hasInitialMeld=false, score=18 (30점 미만)
  act(() => {
    setupPendingReady(false); // hasInitialMeld=false
  });

  const { result } = renderHook(() => useTurnActions());
  // score 5+6+7=18 < 30 이므로 false
  expect(result.current.confirmEnabled).toBe(false);
});

// ---------------------------------------------------------------------------
// 8. drawEnabled — 내 턴이 아닐 때 false
// ---------------------------------------------------------------------------

test("drawEnabled = false when not my turn", () => {
  act(() => {
    // Phase C 단계 4: pendingStore.reset()으로 pending 없음 보장.
    usePendingStore.setState({ draft: null });
    useGameStore.setState({
      mySeat: 0,
      gameState: {
        currentSeat: 1,  // 상대방 턴
        tableGroups: [],
        drawPileCount: 10,
        turnStartedAt: new Date().toISOString(),
        turnTimeoutSec: 60,
      } as import("@/types/game").GameState,
    });
  });

  const { result } = renderHook(() => useTurnActions());
  expect(result.current.drawEnabled).toBe(false);
});
