"use client";

/**
 * useInitialMeldGuard — hasInitialMeld SSOT 단일화 hook (L2)
 *
 * SSOT 매핑:
 *   - 58 §2 F-04: 랙에서 서버 확정 그룹에 extend
 *   - 58 §2 F-17: V-04 초기 등록 진행 표시
 *   - V-13a: hasInitialMeld 재배치 권한 판정 단일 소스
 *
 * 역할:
 *   GameClient.tsx에 흩어진 7지점 hasInitialMeld 참조를 이 hook으로 통합 (W2-A 해소).
 *   컴포넌트에서 players[mySeat].hasInitialMeld를 직접 참조 금지.
 *   이 hook이 V-13a 관련 판단의 단일 소스다.
 *
 * 계층 규칙: L2 store + L3 순수 함수만 import. L1/L4 import 금지.
 */

import { useGameStore } from "@/store/gameStore";
import { usePendingStore, selectPendingPlacementScore } from "@/store/pendingStore";
import { computeEffectiveMeld } from "@/lib/turnUtils";

// ---------------------------------------------------------------------------
// Hook 인터페이스
// ---------------------------------------------------------------------------

export interface UseInitialMeldGuardReturn {
  /**
   * 서버 확정 hasInitialMeld 값 (gameStore에서 직접 읽음)
   * GAME_STATE / TURN_END에서 서버 동기화됨.
   */
  hasInitialMeld: boolean;

  /**
   * 실효 hasInitialMeld — V-13a 판단에 사용하는 SSOT 값.
   * players 배열의 내 seat 기준으로 계산 (7지점 통합).
   * gameStore.hasInitialMeld와 players[mySeat].hasInitialMeld 중 더 신뢰할 수 있는 값.
   */
  effectiveHasInitialMeld: boolean;

  /**
   * 현재 turnState 기준 pending 그룹들의 점수 합계 — V-04 계산 (pendingStore에서 파생).
   * InitialMeldBanner에서 "N점 / 30점" 표시용.
   */
  pendingPlacementScore: number;
}

// ---------------------------------------------------------------------------
// Hook 구현
// ---------------------------------------------------------------------------

/**
 * hasInitialMeld 7지점을 단일 hook으로 통합한다.
 *
 * 사용처:
 *   - GroupDropZone: disabled = !effectiveHasInitialMeld (V-13a)
 *   - InitialMeldBanner: score = pendingPlacementScore, visible = !hasInitialMeld
 *   - useTurnActions: confirmEnabled 계산에서 호출
 *   - useDragHandlers: DRAG_START_SERVER 전이에서 컨텍스트 제공
 *
 * 컴포넌트에서 직접 players[mySeat].hasInitialMeld 참조 금지 (이 hook 사용 필수).
 *
 * 참고: 인라인 객체 selector({ players, mySeat }) 방식은 React 19 useSyncExternalStore에서
 *       매 렌더마다 새 참조를 반환해 무한 루프를 유발한다. 필드별 개별 selector 사용.
 */
export function useInitialMeldGuard(): UseInitialMeldGuardReturn {
  // 필드별 개별 selector — 인라인 객체 selector 무한 루프 방지
  const players = useGameStore((s) => s.players);
  const mySeat = useGameStore((s) => s.mySeat);
  const storedHasInitialMeld = useGameStore((s) => s.hasInitialMeld);

  const pendingStoreState = usePendingStore();

  // effectiveHasInitialMeld: players 배열 기준 (더 정확한 값) — V-13a SSOT
  // computeEffectiveMeld는 L3 순수 함수 (turnUtils.ts)
  const effectiveHasInitialMeld = computeEffectiveMeld(players, mySeat);

  // hasInitialMeld: players 기준 OR gameStore.hasInitialMeld fallback
  const hasInitialMeld = effectiveHasInitialMeld || storedHasInitialMeld;

  // pendingPlacementScore: pendingStore에서 파생 (V-04 초기 등록 점수)
  const pendingPlacementScore = selectPendingPlacementScore(pendingStoreState);

  return {
    hasInitialMeld,
    effectiveHasInitialMeld,
    pendingPlacementScore,
  };
}
