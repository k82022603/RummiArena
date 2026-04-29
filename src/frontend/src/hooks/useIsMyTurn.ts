"use client";

/**
 * useIsMyTurn — "내 턴 여부" 단일 selector hook (L2)
 *
 * SSOT 매핑:
 *   - V-08: 자기 턴 확인 (currentSeat === mySeat)
 *   - BUG-UI-011: isMyTurn SSOT 강제 (E2E currentPlayerId 주입 + production fallback)
 *
 * P3-3 Sub-B (2026-04-29) 도입 배경:
 *   GameClient 인라인 IIFE 로 계산되던 isMyTurn 을 hook 으로 추출.
 *   GameRoom 이 DndContext 를 소유(P3-3 Sub-C)하면서 useDragHandlers 옵션
 *   (isMyTurn) 으로 동일 값을 주입해야 하는데, GameClient/GameRoom 양쪽에서
 *   각자 계산하면 stale skew 위험이 있다.
 *
 *   B2 (derived hook) 채택 사유:
 *     - B1 (props passdown) 은 GameRoom→GameClient 단방향이지만,
 *       useDragHandlers 가 GameRoom 에서 호출될 때도 동일 값을 사용해야 함.
 *       props 와 hook 결과가 서로 다른 timing 에서 evaluate 되면 skew 발생.
 *     - B2 는 양쪽 모두 동일 store snapshot 을 구독하므로 React batch 단위로
 *       동기화된다. selector 라이브러리 추가 부담 없음 (zustand 기본 기능).
 *
 * 계층 규칙: L2 store 만 import. L3 turnUtils.computeIsMyTurn (순수 함수) 사용.
 */

import { useGameStore } from "@/store/gameStore";
import { useRoomStore } from "@/store/roomStore";

// ---------------------------------------------------------------------------
// useIsMyTurn
// ---------------------------------------------------------------------------

/**
 * 현재 턴이 내 턴인지 판정한다.
 *
 * 우선순위:
 *   1. currentPlayerId !== null (E2E 테스트 브리지 주입):
 *      players[mySeat].userId === currentPlayerId 비교
 *   2. currentPlayerId === null (production 기본 경로):
 *      gameState.currentSeat === effectiveMySeat 비교
 *
 * effectiveMySeat:
 *   gameStore.mySeat !== -1 이면 그 값, 아니면 roomStore.mySeat (URL 직접 접근 보호)
 *
 * @returns true = 내 턴, false = 상대 턴 또는 미진입
 */
export function useIsMyTurn(): boolean {
  const mySeat = useGameStore((s) => s.mySeat);
  const currentPlayerId = useGameStore((s) => s.currentPlayerId);
  const players = useGameStore((s) => s.players);
  const gameStateCurrentSeat = useGameStore((s) => s.gameState?.currentSeat ?? null);
  const roomMySeat = useRoomStore((s) => s.mySeat);

  const effectiveMySeat = mySeat !== -1 ? mySeat : roomMySeat;

  if (currentPlayerId !== null) {
    const myPlayer = players.find((p) => p.seat === effectiveMySeat);
    if (myPlayer && "userId" in myPlayer) {
      return (myPlayer as { userId: string }).userId === currentPlayerId;
    }
    // myPlayer 가 없거나 userId 미보유 (AI 플레이어) → currentPlayerId 비교 불가
    return false;
  }

  return gameStateCurrentSeat === effectiveMySeat;
}
