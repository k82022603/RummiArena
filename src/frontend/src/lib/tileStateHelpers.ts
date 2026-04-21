/**
 * 타일 상태 조작 순수 함수 모음 (BUG-UI-006 / G-3)
 *
 * GameClient.tsx 에서 내부 함수로 정의되던 유틸리티를 추출하여
 * 독립 단위 테스트가 가능하도록 분리한다.
 *
 * 수정 이력:
 *   2026-04-21 Day 11  - 최초 추출 (G-3 ghost tile fix)
 */

import type { TileCode, TableGroup } from "@/types/tile";

/**
 * 배열에서 첫 번째 일치 항목만 제거한다.
 *
 * Array.filter()는 모든 일치를 제거하므로 동일 타일 코드가 여러 장일 때
 * 의도치 않게 전부 삭제된다. 이 함수는 첫 번째 1개만 제거한다.
 *
 * @example
 * removeFirstOccurrence(["R1a","B2a","R1a"], "R1a") // → ["B2a","R1a"]
 */
export function removeFirstOccurrence<T>(arr: T[], item: T): T[] {
  const idx = arr.indexOf(item);
  return idx >= 0 ? [...arr.slice(0, idx), ...arr.slice(idx + 1)] : arr;
}

/**
 * pendingTableGroups 내 모든 타일 코드를 수집하여 중복 코드 목록을 반환한다.
 *
 * 루미큐브 물리 규칙: 동일 코드(예: B1a)는 전체 풀에 1장만 존재한다.
 * 같은 코드가 여러 그룹에 걸쳐 2회 이상 등장하면 V-03(중복 타일) 위반이다.
 *
 * BUG-UI-006(G-3): 드래그-반환 루프에서 filter() 대신 removeFirstOccurrence()를
 * 쓰지 않을 경우 동일 코드가 여러 그룹에 잔존(ghost)할 수 있다.
 * 이 함수는 확정 직전 마지막 방어선으로 사용된다.
 *
 * @returns 2회 이상 등장한 tile code 배열. 비어있으면 중복 없음.
 */
export function detectDuplicateTileCodes(groups: TableGroup[]): TileCode[] {
  const seenCodes = new Map<TileCode, number>();
  for (const group of groups) {
    for (const code of group.tiles) {
      seenCodes.set(code, (seenCodes.get(code) ?? 0) + 1);
    }
  }
  return [...seenCodes.entries()]
    .filter(([, count]) => count > 1)
    .map(([code]) => code);
}
