/**
 * turnUtils — 턴 관련 순수 유틸 함수 모음 (L3)
 *
 * SSOT 매핑:
 *   - V-08: 자기 턴 확인 (currentSeat === mySeat)
 *   - V-13a: hasInitialMeld — 재배치 권한 판정
 *   - V-03: tilesAdded >= 1 (랙에서 최소 1장 추가)
 *   - V-04: 30점 초과 확인
 *   - 56b §3.2: computeIsMyTurn → S0 / S1 진입 조건
 *
 * 금지: store, WS, DOM import 불가 (L3 계층 규칙)
 */

import type { TileCode, TableGroup } from "@/types/tile";
import type { Player } from "@/types/game";
import { parseTileCode } from "@/types/tile";

// ---------------------------------------------------------------------------
// computeIsMyTurn — V-08
// ---------------------------------------------------------------------------

/**
 * 현재 턴이 내 턴인지 판정한다.
 *
 * @param currentSeat 현재 행동해야 할 플레이어 seat (TURN_START payload)
 * @param mySeat 나의 seat 번호
 * @returns true = 내 턴 (S1), false = 상대 턴 (S0)
 */
export function computeIsMyTurn(currentSeat: number, mySeat: number): boolean {
  return currentSeat === mySeat;
}

// ---------------------------------------------------------------------------
// computeEffectiveMeld — V-13a, 7지점 통합
// ---------------------------------------------------------------------------

/**
 * 나의 effectiveHasInitialMeld 값을 계산한다.
 *
 * "7지점" 분산 참조를 이 함수 한 곳으로 통합 (W2-A 해소).
 * 서버 응답의 player.hasInitialMeld를 single source로 사용한다.
 *
 * @param players 현재 게임의 전체 플레이어 배열
 * @param mySeat 나의 seat 번호
 * @returns true = 초기 등록 완료 (재배치 가능), false = 미완료
 */
export function computeEffectiveMeld(players: Player[], mySeat: number): boolean {
  const me = players.find((p) => p.seat === mySeat);
  return me?.hasInitialMeld === true;
}

// ---------------------------------------------------------------------------
// computeTilesAdded — V-03
// ---------------------------------------------------------------------------

/**
 * 턴 시작 시점 랙과 현재 랙을 비교하여 보드에 추가된 타일 수를 계산한다.
 *
 * V-03: 턴 확정 시 tilesAdded >= 1 이어야 함 (단순 재배치 금지).
 *
 * @param turnStartRack TURN_START 시점의 랙 타일 배열 (스냅샷)
 * @param currentRack 현재 랙 타일 배열
 * @returns 보드로 옮긴 타일 수 (음수 불가, 드로우로 늘어난 경우는 0으로 클램프)
 */
export function computeTilesAdded(
  turnStartRack: TileCode[],
  currentRack: TileCode[],
): number {
  const diff = turnStartRack.length - currentRack.length;
  return Math.max(0, diff);
}

// ---------------------------------------------------------------------------
// computePendingScore — V-04
// ---------------------------------------------------------------------------

/**
 * 조커가 아닌 타일의 숫자값 합산 (조커는 실제 대체 숫자 사용 불가 → 0 처리)
 */
function scoreTile(code: TileCode): number {
  const parsed = parseTileCode(code);
  if (parsed.isJoker || parsed.number === null) return 0;
  return parsed.number;
}

/**
 * pending 전용 그룹들의 점수 합계를 계산한다 (V-04 클라이언트 미러).
 *
 * V-04: 초기 등록 시 자신의 랙 타일만으로 구성한 세트 합계 >= 30점.
 * 조커는 대체 타일의 숫자값으로 계산해야 하지만, 클라이언트 미러에서는
 * 보수적으로 0점 처리한다. 서버가 최종 판정자임.
 *
 * @param pendingOnlyGroups pending 전용 그룹 배열 (pendingGroupIds에 포함된 그룹만)
 * @returns 합산 점수
 */
export function computePendingScore(pendingOnlyGroups: TableGroup[]): number {
  let total = 0;
  for (const group of pendingOnlyGroups) {
    for (const tile of group.tiles) {
      total += scoreTile(tile);
    }
  }
  return total;
}
