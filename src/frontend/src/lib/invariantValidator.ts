/**
 * invariantValidator — INV-G1~G5 개발 모드 assert (L3 순수 함수)
 *
 * SSOT 매핑:
 *   - INV-G1: D-01 그룹 ID 유니크
 *   - INV-G2: D-02 동일 tile code 보드 위 1회만
 *   - INV-G3: D-03 빈 그룹 없음
 *   - 56b §4.3: 개발 환경 console.error + throw, 프로덕션 silent
 *   - UR-34: 사용자에게 invariant validator 류 토스트 절대 노출 금지
 *
 * 사용 정책:
 *   - 개발 모드 (NODE_ENV !== "production"): throw Error
 *   - 프로덕션: console.error만 (Sentry alert 대상)
 *   - 토스트 노출 금지 (UR-34)
 *
 * 금지: store, WS, DOM import 불가 (L3 계층 규칙)
 */

import type { TileCode, TableGroup } from "@/types/tile";

// ---------------------------------------------------------------------------
// 환경 판별
// ---------------------------------------------------------------------------

const IS_DEV = process.env.NODE_ENV !== "production";

function invariantFail(message: string): void {
  console.error(`[INVARIANT VIOLATION] ${message}`);
  if (IS_DEV) {
    throw new Error(`[INVARIANT] ${message}`);
  }
  // 프로덕션: console.error만 (Sentry 연동은 호출자 책임)
}

// ---------------------------------------------------------------------------
// INV-G1: 그룹 ID 유니크 (D-01)
// ---------------------------------------------------------------------------

/**
 * 그룹 ID 중복이 없는지 검사한다.
 *
 * INV-G1 (D-01): 모든 pendingTableGroups[].id + tableGroups[].id 는 유일해야 한다.
 * 위반 시 개발 모드에서 throw. 프로덕션에서 console.error.
 *
 * @param groups 검사할 그룹 배열
 */
export function assertGroupIdUnique(groups: TableGroup[]): void {
  const ids = groups.map((g) => g.id);
  const idSet = new Set(ids);

  if (idSet.size !== ids.length) {
    const duplicates = ids.filter((id, index) => ids.indexOf(id) !== index);
    invariantFail(
      `INV-G1 위반 (D-01): 그룹 ID 중복 검출 — ${JSON.stringify([...new Set(duplicates)])}`,
    );
  }
}

// ---------------------------------------------------------------------------
// INV-G2: tile code 중복 없음 (D-02)
// ---------------------------------------------------------------------------

/**
 * 모든 그룹에 걸쳐 동일 tile code가 1회 이상 중복되지 않는지 검사한다.
 *
 * INV-G2 (D-02): 동일 tile code는 보드 위 1회만 등장.
 * 위반 = INC-T11-DUP 사고 유형.
 *
 * @param groups 검사할 그룹 배열
 */
export function assertNoTileCodeDuplicate(groups: TableGroup[]): void {
  const codeCount = new Map<TileCode, number>();

  for (const group of groups) {
    for (const code of group.tiles) {
      codeCount.set(code, (codeCount.get(code) ?? 0) + 1);
    }
  }

  const duplicates = [...codeCount.entries()]
    .filter(([, count]) => count > 1)
    .map(([code]) => code);

  if (duplicates.length > 0) {
    invariantFail(
      `INV-G2 위반 (D-02): tile code 중복 검출 — ${JSON.stringify(duplicates)}`,
    );
  }
}

// ---------------------------------------------------------------------------
// INV-G3: 빈 그룹 없음 (D-03)
// ---------------------------------------------------------------------------

/**
 * 빈 그룹(tiles.length === 0)이 없는지 검사한다.
 *
 * INV-G3 (D-03): 빈 그룹은 그룹 배열에서 즉시 제거되어야 한다.
 * setter에서 자동 정리하는 것이 명세이므로 이 assert는 버그 검출용.
 *
 * @param groups 검사할 그룹 배열
 */
export function assertNoEmptyGroup(groups: TableGroup[]): void {
  const emptyGroups = groups.filter((g) => g.tiles.length === 0);

  if (emptyGroups.length > 0) {
    const ids = emptyGroups.map((g) => g.id);
    invariantFail(
      `INV-G3 위반 (D-03): 빈 그룹 검출 — ${JSON.stringify(ids)}`,
    );
  }
}

// ---------------------------------------------------------------------------
// 통합 검사 (편의 함수)
// ---------------------------------------------------------------------------

/**
 * INV-G1 + INV-G2 + INV-G3 를 한 번에 검사한다.
 *
 * dragEndReducer 출력 직후, pendingStore.applyMutation() 직후 등
 * 상태 변경 직후 호출하면 빠른 버그 검출이 가능하다.
 *
 * @param groups 검사할 그룹 배열
 */
export function assertGroupsInvariant(groups: TableGroup[]): void {
  assertGroupIdUnique(groups);
  assertNoTileCodeDuplicate(groups);
  assertNoEmptyGroup(groups);
}
