/**
 * turnUtils — 턴 관련 순수 유틸 함수 모음 (L3)
 *
 * SSOT 매핑:
 *   - V-08: 자기 턴 확인 (currentSeat === mySeat)
 *   - V-13a: hasInitialMeld — 재배치 권한 판정
 *   - V-03: tilesAdded >= 1 (랙에서 최소 1장 추가)
 *   - V-04: 30점 초과 확인
 *   - UR-15: canConfirmTurn 종합 조건 (A14)
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

// ---------------------------------------------------------------------------
// canConfirmTurn — UR-15 (A14)
// ---------------------------------------------------------------------------

/**
 * ConfirmTurn 버튼 활성화 판단 입력값 — A14 테스트 SSOT
 *
 * SSOT 매핑: 56 section 3.15 셀 A14, UR-15, V-01~V-04, V-14, V-15
 */
export interface ConfirmTurnInput {
  /** 현재 보드 위 그룹 목록 (pending 포함) */
  pendingTableGroups: TableGroup[];
  /** pending으로 마킹된 그룹 ID Set */
  pendingGroupIds: Set<string>;
  /** 초기 등록 완료 여부 */
  hasInitialMeld: boolean;
  /** 회수됐으나 아직 보드에 미배치된 조커 목록 */
  pendingRecoveredJokers: TileCode[];
  /** 이번 턴에 랙에서 보드로 추가한 타일 수 */
  tilesAddedCount: number;
}

/**
 * ConfirmTurn 버튼 활성화 여부를 판단한다 (클라이언트 사전검증).
 *
 * 서버 검증(V-* 응답)의 클라이언트 미러. 서버가 최종 판정자이며,
 * 이 함수는 불필요한 서버 왕복을 줄이기 위한 선제 차단 목적이다.
 *
 * 조건 (UR-15):
 *   1. tilesAdded >= 1 (V-03: 단순 재배치 금지)
 *   2. pending 그룹이 1개 이상 존재
 *   3. 모든 pending 그룹이 최소 3개 타일 (V-02)
 *   4. hasInitialMeld=false 이면 pending 점수 합계 >= 30점 (V-04)
 *   5. 회수된 조커가 아직 랙에 남아있으면 차단 (V-07)
 *
 * @param input ConfirmTurnInput
 * @returns { enabled: boolean; reason?: string }
 */
export function canConfirmTurn(input: ConfirmTurnInput): { enabled: boolean; reason?: string } {
  const {
    pendingTableGroups,
    pendingGroupIds,
    hasInitialMeld,
    pendingRecoveredJokers,
    tilesAddedCount,
  } = input;

  // V-03: 랙에서 최소 1장 이상 보드에 추가해야 확정 가능
  if (tilesAddedCount < 1) {
    return { enabled: false, reason: "V-03: tilesAdded < 1" };
  }

  // UR-15: pending 그룹이 1개 이상 있어야 함
  const pendingOnlyGroups = pendingTableGroups.filter((g) => pendingGroupIds.has(g.id));
  if (pendingOnlyGroups.length === 0) {
    return { enabled: false, reason: "UR-15: pending 그룹 없음" };
  }

  // V-02: 모든 pending 그룹이 최소 3개 타일을 가져야 함
  for (const group of pendingOnlyGroups) {
    if (group.tiles.length < 3) {
      return { enabled: false, reason: `V-02: 그룹 ${group.id} 타일 수 부족 (${group.tiles.length}/3)` };
    }
  }

  // V-07: 회수된 조커가 아직 배치되지 않았으면 차단
  if (pendingRecoveredJokers.length > 0) {
    return { enabled: false, reason: "V-07: 회수된 조커 미배치" };
  }

  // V-04: 최초 등록 미완료 시 pending 점수 합계 >= 30점 필요
  if (!hasInitialMeld) {
    const score = computePendingScore(pendingOnlyGroups);
    if (score < 30) {
      return { enabled: false, reason: `V-04: 점수 부족 (${score}/30)` };
    }
  }

  return { enabled: true };
}
