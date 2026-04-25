"use client";

/**
 * useDropEligibility — 드래그 중 호환 드롭존 집합 계산 (L2 hook)
 *
 * SSOT 매핑:
 *   - 58 §2 F-21: 호환 드롭존 시각 강조
 *   - UR-10/14: 드롭 호환성 판정
 *
 * 계층 규칙: L2 store + L3 순수 함수만 import. L1/L4 import 금지.
 */

import { useMemo } from "react";
import { useGameStore } from "@/store/gameStore";
import { usePendingStore } from "@/store/pendingStore";
import { computeValidMergeGroups } from "@/lib/mergeCompatibility";
import type { TileCode } from "@/types/tile";

// ---------------------------------------------------------------------------
// Hook 구현
// ---------------------------------------------------------------------------

export interface UseDropEligibilityReturn {
  /** 현재 드래그 타일과 호환되는 그룹 ID 집합 */
  validGroupIds: Set<string>;
  /** 주어진 groupId가 현재 드래그 타일과 호환되는지 확인 */
  isEligible: (groupId: string) => boolean;
}

/**
 * 드래그 중인 activeTile과 모든 테이블 그룹을 비교하여
 * 호환 드롭존 ID를 Set<string>으로 반환한다.
 *
 * dragStateStore.activeTile 구독 → computeValidMergeGroups(mergeCompatibility.ts) 호출 →
 * validGroupIds Set 반환.
 *
 * @param activeTile 현재 드래그 중인 타일 코드 (null이면 드래그 없음)
 */
export function useDropEligibility(
  activeTile: TileCode | null
): UseDropEligibilityReturn {
  // pending 그룹 + 서버 그룹 통합 (보드 위 모든 그룹)
  const draft = usePendingStore((s) => s.draft);
  const tableGroups = useGameStore((s) => s.gameState?.tableGroups ?? []);

  // pending draft가 있으면 draft.groups 우선 (현재 턴 상태 반영)
  const allGroups = draft?.groups ?? tableGroups;

  // activeTile이 null이거나 그룹이 없으면 빈 Set
  const validGroupIds = useMemo(() => {
    if (activeTile === null || allGroups.length === 0) {
      return new Set<string>();
    }
    return computeValidMergeGroups(activeTile, allGroups);
  }, [activeTile, allGroups]);

  const isEligible = useMemo(
    () => (groupId: string) => validGroupIds.has(groupId),
    [validGroupIds]
  );

  return { validGroupIds, isEligible };
}
