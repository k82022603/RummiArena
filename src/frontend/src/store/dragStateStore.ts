"use client";

/**
 * dragStateStore — 활성 드래그 상태 (L2 store)
 *
 * SSOT 매핑:
 *   - 58 §4.2 DragStateStore 타입 정의
 *   - UR-06/07/08: 드래그 소스별 상태
 *   - F-21: 호환 드롭존 시각 강조 (activeTile 구독)
 *
 * 계층 규칙: L3 순수 함수만 import. L1/L4 import 금지.
 */

import { create } from "zustand";
import type { TileCode } from "@/types/tile";
import type { DragSource } from "@/lib/dragEnd/dragEndReducer";

// ---------------------------------------------------------------------------
// 인터페이스 정의
// ---------------------------------------------------------------------------

interface DragStateStore {
  /** 현재 드래그 중인 타일 코드 (null = 드래그 없음) */
  activeTile: TileCode | null;
  /** 현재 드래그의 출발 소스 */
  activeSource: DragSource | null;
  /** 현재 호버 중인 drop target ID */
  hoverTarget: string | null;

  /**
   * "+ 새 그룹" 모드 토글.
   * P3-3 Step 1 (2026-04-29): GameClient.useState 에서 dragStateStore 로 흡수.
   * useDragHandlers 가 game-board 직접 드롭 시 강제 새 그룹 분기 진입에 사용.
   */
  forceNewGroup: boolean;

  /**
   * UX-004: ExtendLockToast 표시 상태.
   * P3-3 Step 3a (2026-04-29): GameClient.useState 에서 dragStateStore 로 흡수.
   * 초기 등록 전 서버 그룹 영역 드롭 시 1회 표시. handleUndo / TURN_START 시 false.
   */
  showExtendLockToast: boolean;

  /**
   * BUG-UI-REARRANGE-002 단조 카운터 — 동일 ms 내 ID 충돌 방지.
   * P3-3 Step 3b (2026-04-29): GameClient.useRef + useDragHandlers fallback 분리에서
   *   dragStateStore 로 흡수하여 hook 호출 위치(GameClient → GameRoom)가 바뀌어도
   *   단일 카운터를 공유한다. handleRackSort 가 read-only 로 사용.
   */
  pendingGroupSeq: number;

  /**
   * UX-004: ExtendLockToast 같은 턴 내 1회 표시 추적 플래그.
   * P3-3 Step 3b (2026-04-29): GameClient.useRef 에서 흡수.
   * TURN_START / handleUndo 시 false. hook 본체가 true 로 toggle 후 toast 표시.
   */
  extendLockToastShown: boolean;

  /** 드래그 시작 시 호출 */
  setActive(tile: TileCode, source: DragSource): void;
  /** 호버 대상 갱신 */
  setHoverTarget(targetId: string | null): void;
  /** 드래그 종료/취소 시 호출 */
  clearActive(): void;
  /** "+ 새 그룹" 모드 토글 setter (수동 토글 + 자동 리셋 양쪽 사용) */
  setForceNewGroup(val: boolean): void;
  /** ExtendLockToast 표시/해제 setter */
  setShowExtendLockToast(val: boolean): void;
  /** pendingGroupSeq 갱신 setter (단조 증가 의무) */
  setPendingGroupSeq(val: number): void;
  /** extendLockToastShown 토글 setter */
  setExtendLockToastShown(val: boolean): void;
}

// ---------------------------------------------------------------------------
// Store 구현
// ---------------------------------------------------------------------------

export const useDragStateStore = create<DragStateStore>()((set) => ({
  activeTile: null,
  activeSource: null,
  hoverTarget: null,
  forceNewGroup: false,
  showExtendLockToast: false,
  pendingGroupSeq: 0,
  extendLockToastShown: false,

  setActive(tile, source) {
    set({ activeTile: tile, activeSource: source });
  },

  setHoverTarget(targetId) {
    set({ hoverTarget: targetId });
  },

  clearActive() {
    set({ activeTile: null, activeSource: null, hoverTarget: null });
  },

  setForceNewGroup(val) {
    set({ forceNewGroup: val });
  },

  setShowExtendLockToast(val) {
    set({ showExtendLockToast: val });
  },

  setPendingGroupSeq(val) {
    set({ pendingGroupSeq: val });
  },

  setExtendLockToastShown(val) {
    set({ extendLockToastShown: val });
  },
}));

// ---------------------------------------------------------------------------
// 타입 재export (외부 사용 편의)
// ---------------------------------------------------------------------------

export type { DragSource };
