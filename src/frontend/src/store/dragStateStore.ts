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

  /** 드래그 시작 시 호출 */
  setActive(tile: TileCode, source: DragSource): void;
  /** 호버 대상 갱신 */
  setHoverTarget(targetId: string | null): void;
  /** 드래그 종료/취소 시 호출 */
  clearActive(): void;
}

// ---------------------------------------------------------------------------
// Store 구현
// ---------------------------------------------------------------------------

export const useDragStateStore = create<DragStateStore>()((set) => ({
  activeTile: null,
  activeSource: null,
  hoverTarget: null,

  setActive(tile, source) {
    set({ activeTile: tile, activeSource: source });
  },

  setHoverTarget(targetId) {
    set({ hoverTarget: targetId });
  },

  clearActive() {
    set({ activeTile: null, activeSource: null, hoverTarget: null });
  },
}));

// ---------------------------------------------------------------------------
// 타입 재export (외부 사용 편의)
// ---------------------------------------------------------------------------

export type { DragSource };
