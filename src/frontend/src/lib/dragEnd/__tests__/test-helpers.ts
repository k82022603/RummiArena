/**
 * 테스트 헬퍼 -- A1~A21 by-action 단위 테스트 공용 fixture/factory
 *
 * SSOT: docs/02-design/56-action-state-matrix.md
 * band-aid 금지 (G2 게이트): 본 파일에 source guard / invariant validator 검증 X
 *
 * 2026-04-25: dragEndReducer 시그니처 (state, input) 분리 반영
 *   - makeReducerArgs: [DragReducerState, DragInput] 반환
 *   - expectRejected/expectAccepted: DragOutput.rejected 필드 기반
 */

import type { TileCode, TableGroup } from "@/types/tile";
import type {
  DragReducerState,
  DragInput,
  DragOutput,
  DragSource,
  RejectReason,
} from "../dragEndReducer";

// ---------------------------------------------------------------------------
// 그룹 팩토리
// ---------------------------------------------------------------------------

let groupSeq = 0;

/** 서버 확정 그룹 (UUID 형태 ID) */
export function serverGroup(tiles: TileCode[], type: "group" | "run" = "group"): TableGroup {
  groupSeq += 1;
  return {
    id: `aaaaaaaa-bbbb-cccc-dddd-${String(groupSeq).padStart(12, "0")}`,
    tiles,
    type,
  };
}

/** pending 그룹 (pending- prefix ID) */
export function pendingGroup(tiles: TileCode[], type: "group" | "run" = "group"): TableGroup {
  groupSeq += 1;
  return {
    id: `pending-${Date.now()}-${groupSeq}`,
    tiles,
    type,
  };
}

/** 테스트 간 시퀀스 리셋 */
export function resetGroupSeq(): void {
  groupSeq = 0;
}

// ---------------------------------------------------------------------------
// dest -> overId 변환 (테스트의 dest 표현을 실제 reducer의 overId로 변환)
// ---------------------------------------------------------------------------

export interface TestDest {
  kind: "new-group" | "rack" | "pending-group" | "server-group" | "joker-tile";
  groupId?: string;
}

function computeOverId(dest?: Partial<TestDest>): string {
  if (!dest) return "game-board-new-group";
  switch (dest.kind) {
    case "new-group":
      return "game-board-new-group";
    case "rack":
      return "player-rack";
    case "pending-group":
      return dest.groupId ?? "pending-group-1";
    case "server-group":
      return dest.groupId ?? "server-group-1";
    case "joker-tile":
      return dest.groupId ?? "joker-group-1";
    default:
      return "game-board-new-group";
  }
}

// ---------------------------------------------------------------------------
// source 변환 (테스트의 source 표현을 실제 reducer의 DragSource로 변환)
// pending/server -> table kind 로 통합
// ---------------------------------------------------------------------------

export interface TestSource {
  kind: "rack" | "pending" | "server" | "table";
  groupId?: string;
  index?: number;
}

function computeSource(source?: Partial<TestSource>): DragSource {
  if (!source || source.kind === "rack") {
    return { kind: "rack" };
  }
  // pending, server, table -> 모두 { kind: "table" }
  return {
    kind: "table",
    groupId: source.groupId ?? "",
    index: source.index ?? 0,
  };
}

// ---------------------------------------------------------------------------
// makeReducerArgs 팩토리
// ---------------------------------------------------------------------------

export interface InputOverrides {
  tileCode?: TileCode;
  source?: Partial<TestSource>;
  dest?: Partial<TestDest>;
  overId?: string;
  isMyTurn?: boolean;
  hasInitialMeld?: boolean;
  forceNewGroup?: boolean;
  pendingGroupSeq?: number;
  tableGroups?: TableGroup[];
  myTiles?: TileCode[];
  pendingGroupIds?: Set<string>;
  pendingRecoveredJokers?: TileCode[];
  now?: number;
}

/**
 * dragEndReducer(state, input) 에 전달할 [state, input] 튜플 생성.
 *
 * 기존 테스트의 makeInput 호출 패턴을 그대로 수용하면서
 * 실제 reducer 시그니처에 맞게 state/input 을 분리한다.
 */
export function makeReducerArgs(
  overrides: InputOverrides = {},
): [DragReducerState, DragInput] {
  const state: DragReducerState = {
    tableGroups: overrides.tableGroups ?? [],
    myTiles: overrides.myTiles ?? ["R7a" as TileCode],
    pendingGroupIds: overrides.pendingGroupIds ?? new Set<string>(),
    pendingRecoveredJokers: overrides.pendingRecoveredJokers ?? [],
    hasInitialMeld: overrides.hasInitialMeld ?? true,
    forceNewGroup: overrides.forceNewGroup ?? false,
    pendingGroupSeq: overrides.pendingGroupSeq ?? 0,
  };

  const input: DragInput = {
    source: computeSource(overrides.source),
    tileCode: overrides.tileCode ?? ("R7a" as TileCode),
    overId: overrides.overId ?? computeOverId(overrides.dest),
    now: overrides.now ?? Date.now(),
  };

  return [state, input];
}

// ---------------------------------------------------------------------------
// Assertion 헬퍼
// ---------------------------------------------------------------------------

/**
 * 결과가 거절인지 확인.
 *
 * @param output dragEndReducer 출력
 * @param reason 기대하는 RejectReason (선택). 지정 시 정확히 일치 검증.
 */
export function expectRejected(output: DragOutput, reason?: RejectReason | string): void {
  expect(output.rejected).toBeDefined();
  if (reason) {
    expect(output.rejected).toBe(reason);
  }
}

/** 결과가 허용인지 확인 */
export function expectAccepted(output: DragOutput): void {
  expect(output.rejected).toBeUndefined();
}

/** 보드 전체에서 특정 타일 코드가 정확히 N번 등장하는지 확인 (INV-G2 / D-02) */
export function expectTileCountOnBoard(
  groups: TableGroup[],
  tileCode: TileCode,
  expectedCount: number
): void {
  const allTiles = groups.flatMap((g) => g.tiles);
  const count = allTiles.filter((t) => t === tileCode).length;
  expect(count).toBe(expectedCount);
}

/** 모든 그룹 ID가 유니크한지 확인 (INV-G1 / D-01) */
export function expectUniqueGroupIds(groups: TableGroup[]): void {
  const ids = groups.map((g) => g.id);
  expect(new Set(ids).size).toBe(ids.length);
}

/** 보드 전체 타일에 중복이 없는지 확인 (INV-G2 / D-02) */
export function expectNoDuplicateTiles(groups: TableGroup[]): void {
  const allTiles = groups.flatMap((g) => g.tiles);
  const seen = new Set<TileCode>();
  for (const t of allTiles) {
    expect(seen.has(t)).toBe(false);
    seen.add(t);
  }
}

/** 빈 그룹이 없는지 확인 (INV-G3 / D-03) */
export function expectNoEmptyGroups(groups: TableGroup[]): void {
  for (const g of groups) {
    expect(g.tiles.length).toBeGreaterThan(0);
  }
}
