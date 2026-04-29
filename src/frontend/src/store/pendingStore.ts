"use client";

/**
 * pendingStore — 현재 턴 pending 드래프트 상태 (L2 store, FE 단독)
 *
 * SSOT 매핑:
 *   - 58 §4.2 PendingStore 타입 정의
 *   - 58 §4.4 selector 정의
 *   - UR-04: 턴 시작 시 pending 초기화
 *   - INV-G1: 그룹 ID 유니크 보장
 *   - INV-G2: 동일 tile code 보드 위 1회만
 *   - INV-G3: 빈 그룹 자동 제거
 *   - D-12: pending 그룹 ID = "pending-" prefix, 서버 확정 = 서버 UUID
 *
 * 계층 규칙: L3 순수 함수(turnUtils 등)만 import. L1/L4 import 금지.
 */

import { create } from "zustand";
import type { TileCode, TableGroup } from "@/types/tile";
import type { DragOutput } from "@/lib/dragEnd/dragEndReducer";
import { computeTilesAdded, computePendingScore } from "@/lib/turnUtils";

// ---------------------------------------------------------------------------
// 타입 정의
// ---------------------------------------------------------------------------

export interface PendingDraft {
  /** pending 그룹 목록 (pending- prefix ID 포함, 서버 확정 그룹도 markServerGroupAsPending 후 포함) */
  groups: TableGroup[];
  /** pending으로 마킹된 그룹 ID Set (서버 그룹 ID + pending- 그룹 ID 모두 포함) — D-12 */
  pendingGroupIds: Set<string>;
  /** 현재 턴 랙 상태 (tile 제거 반영) */
  myTiles: TileCode[];
  /** V-07 회수 조커 목록 */
  recoveredJokers: TileCode[];
  /** TURN_START 시점 랙 스냅샷 (RESET 복원용) */
  turnStartRack: TileCode[];
  /** TURN_START 시점 테이블 스냅샷 (rollback 복원용) */
  turnStartTableGroups: TableGroup[];
}

interface PendingStore {
  /** null = pending 없음 (S1 상태) */
  draft: PendingDraft | null;

  /**
   * GameClient(또는 상위 컨테이너)에서 pendingStore를 소비(구독)하고 있는지 여부.
   * Phase E 통합 검증용 — GameClient.handleDragEnd에서 applyMutation을 호출할 때 true로 설정.
   * F17-SC1: typeof subscribedByGameClient === "boolean" 단언.
   */
  subscribedByGameClient: boolean;

  /**
   * dragEndReducer 결과를 atomic하게 적용한다.
   * INV-G1/G2 보호: 중복 그룹 ID / 중복 tile code 차단.
   * INV-G3: 빈 그룹 자동 제거.
   */
  applyMutation(result: DragOutput): void;

  /**
   * 서버 확정 그룹을 pending으로 마킹한다.
   * 서버 그룹 ID를 보존하면서 pendingGroupIds에 추가한다 — D-01, V-17.
   */
  markServerGroupAsPending(id: string): void;

  /**
   * 현재 pending 드래프트를 전체 초기화한다 — UR-04.
   * TURN_START / RESET_TURN 시 호출.
   */
  reset(): void;

  /**
   * INVALID_MOVE 수신 시 TURN_START 시점 스냅샷으로 복원한다 — F-13.
   * turnStartRack / turnStartTableGroups 기준.
   */
  rollbackToServerSnapshot(): void;

  /**
   * TURN_START 수신 시 랙과 테이블 스냅샷을 저장한다 — F-01.
   * RESET / rollback의 기준점이 된다.
   */
  saveTurnStartSnapshot(rack: TileCode[], tableGroups: TableGroup[]): void;
}

// ---------------------------------------------------------------------------
// Store 구현
// ---------------------------------------------------------------------------

export const usePendingStore = create<PendingStore>()((set, get) => ({
  draft: null,

  // F17-SC1: GameClient pendingStore 연결 플래그 (Phase E 통합 검증용)
  subscribedByGameClient: false,

  applyMutation(result: DragOutput) {
    if (result.rejected) {
      // reject 시 상태 변경 없음 — 호출자가 로그/토스트 처리
      return;
    }

    set((state) => {
      const prev = state.draft;

      // nextTableGroups null = pending 완전 초기화 (랙으로 되돌리기 등)
      if (result.nextTableGroups === null) {
        if (prev === null) return state;
        return {
          draft: {
            ...prev,
            groups: [],
            pendingGroupIds: new Set<string>(),
            myTiles: result.nextMyTiles ?? prev.myTiles,
            recoveredJokers: result.nextPendingRecoveredJokers,
          },
        };
      }

      // INV-G3: 빈 그룹 자동 제거
      const nextGroups = result.nextTableGroups.filter(
        (g) => g.tiles.length > 0
      );

      // nextPendingGroupIds 갱신 — result에 반영된 값 우선 사용
      const nextPendingGroupIds = result.nextPendingGroupIds;

      // draft 초기화 (첫 mutation)
      const currentDraft = prev ?? {
        groups: [],
        pendingGroupIds: new Set<string>(),
        myTiles: [],
        recoveredJokers: [],
        turnStartRack: [],
        turnStartTableGroups: [],
      };

      return {
        draft: {
          ...currentDraft,
          groups: nextGroups,
          pendingGroupIds: nextPendingGroupIds,
          myTiles: result.nextMyTiles ?? currentDraft.myTiles,
          recoveredJokers: result.nextPendingRecoveredJokers,
        },
      };
    });
  },

  markServerGroupAsPending(id: string) {
    set((state) => {
      const prev = state.draft;
      if (prev === null) return state;

      const nextIds = new Set(prev.pendingGroupIds);
      nextIds.add(id);

      return {
        draft: {
          ...prev,
          pendingGroupIds: nextIds,
        },
      };
    });
  },

  reset() {
    set((state) => {
      const prev = state.draft;
      if (prev === null) return { draft: null };
      return {
        draft: {
          ...prev,
          groups: prev.turnStartTableGroups,
          pendingGroupIds: new Set<string>(),
          myTiles: prev.turnStartRack,
          recoveredJokers: [],
        },
      };
    });
  },

  rollbackToServerSnapshot() {
    set((state) => {
      const prev = state.draft;
      if (prev === null) return state;

      return {
        draft: {
          ...prev,
          groups: prev.turnStartTableGroups,
          pendingGroupIds: new Set<string>(),
          myTiles: prev.turnStartRack,
          recoveredJokers: [],
        },
      };
    });
  },

  saveTurnStartSnapshot(rack: TileCode[], tableGroups: TableGroup[]) {
    set((state) => {
      const prev = state.draft ?? {
        groups: tableGroups,
        pendingGroupIds: new Set<string>(),
        myTiles: rack,
        recoveredJokers: [],
        turnStartRack: rack,
        turnStartTableGroups: tableGroups,
      };

      return {
        draft: {
          ...prev,
          turnStartRack: rack,
          turnStartTableGroups: tableGroups,
          myTiles: rack,
        },
      };
    });
  },
}));

// ---------------------------------------------------------------------------
// Selectors (derived) — 58 §4.4
// ---------------------------------------------------------------------------

/**
 * 랙에서 보드로 옮긴 타일 수 — V-03 (tilesAdded >= 1)
 */
export function selectTilesAdded(state: PendingStore): number {
  if (state.draft === null) return 0;
  return computeTilesAdded(
    state.draft.turnStartRack,
    state.draft.myTiles
  );
}

/**
 * pending 전용 그룹들의 점수 합계 — V-04 (30점)
 */
export function selectPendingPlacementScore(state: PendingStore): number {
  if (state.draft === null) return 0;
  const pendingOnlyGroups = state.draft.groups.filter(
    (g) => state.draft!.pendingGroupIds.has(g.id)
  );
  return computePendingScore(pendingOnlyGroups);
}

/**
 * pending 그룹이 1개 이상 존재하는지 여부
 *
 * 2026-04-29 BUG-DRAW-001 핫픽스 (UR-22):
 *   draft.groups에는 서버 보드 그룹(다른 플레이어 멜드 포함)도 들어있다.
 *   saveTurnStartSnapshot(rack, tableGroups) 호출 시 prev=null 이면
 *   `groups: tableGroups`로 초기화되어 draft.groups.length > 0 이 되지만,
 *   사용자가 마킹한 pending 그룹은 0개이므로 hasPending=false 여야 한다.
 *
 *   "내가 이번 턴에 직접 만들거나 수정한 그룹"의 진짜 SSOT는 pendingGroupIds.
 *   selectAllGroupsValid / selectPendingPlacementScore / handleConfirm 도 모두
 *   pendingGroupIds.has(g.id)로 필터링하므로 일관성도 회복된다.
 *
 *   drawEnabled = isMyTurn && !hasPending (UR-22) — 자기 차례 진입 직후
 *   draft 가 만들어지더라도 사용자가 드래그를 안 했으면 드로우 버튼 활성.
 */
export function selectHasPending(state: PendingStore): boolean {
  return state.draft !== null && state.draft.pendingGroupIds.size > 0;
}

/**
 * pending 그룹이 모두 유효한지 여부 — UR-15 사전조건 보조
 * (최소 3개 타일 이상인 그룹만 pending에 포함되어야 함 — V-02)
 */
export function selectAllGroupsValid(state: PendingStore): boolean {
  if (state.draft === null) return false;
  const pendingGroups = state.draft.groups.filter((g) =>
    state.draft!.pendingGroupIds.has(g.id)
  );
  if (pendingGroups.length === 0) return false;
  return pendingGroups.every((g) => g.tiles.length >= 3);
}

/**
 * ConfirmTurn 활성화 종합 조건 — UR-15
 * tilesAdded >= 1 AND pendingGroups 모두 유효 AND (hasInitialMeld OR score >= 30)
 */
export function selectConfirmEnabled(
  state: PendingStore,
  hasInitialMeld: boolean
): boolean {
  if (!selectHasPending(state)) return false;
  if (selectTilesAdded(state) < 1) return false;
  if (!selectAllGroupsValid(state)) return false;
  if (!hasInitialMeld && selectPendingPlacementScore(state) < 30) return false;
  return true;
}

// ---------------------------------------------------------------------------
// E2E 테스트 브릿지 — Playwright page.evaluate 에서 pendingStore 접근용
// (gameStore 의 __gameStore 노출과 동일 패턴)
//
// 2026-04-28 Phase C 단계 4 이후, pending 상태는 pendingStore.draft 가 단일 SSOT.
// E2E spec 의 fixture 헬퍼가 이 브리지로 draft 를 주입하여 결정론적 테스트를 보장.
// ---------------------------------------------------------------------------
if (
  typeof window !== "undefined" &&
  (process.env.NODE_ENV !== "production" ||
    process.env.NEXT_PUBLIC_E2E_BRIDGE === "true")
) {
  (window as unknown as Record<string, unknown>).__pendingStore = usePendingStore;
}
