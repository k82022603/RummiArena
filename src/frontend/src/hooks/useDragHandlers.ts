"use client";

/**
 * useDragHandlers — dnd-kit onDragStart/End/Cancel 어댑터 (L2 hook)
 *
 * SSOT 매핑:
 *   - 58 §2 F-02~F-06: 드래그 유형별 처리
 *   - 56b A1~A12: dragEndReducer 행동 매핑
 *   - UR-06/07/08: 드래그 소스별 상태 전이
 *   - UR-17: 드래그 취소 시 상태 변경 없음
 *
 * 계층 규칙: L2 store + L3 순수 함수만 import. L1 컴포넌트/L4 WS import 금지.
 * dragEndReducer(L3) 직접 호출은 이 hook에서만 허용 — 컴포넌트에서 직접 호출 금지.
 */

import { useCallback } from "react";
import type { DragStartEvent, DragEndEvent } from "@dnd-kit/core";
import { useDragStateStore } from "@/store/dragStateStore";
import { usePendingStore } from "@/store/pendingStore";
import { useTurnStateStore } from "@/store/turnStateStore";
import { useGameStore } from "@/store/gameStore";
import { dragEndReducer } from "@/lib/dragEnd/dragEndReducer";
import { isCompatibleWithGroup, computeValidMergeGroups } from "@/lib/mergeCompatibility";
import { computePendingScore } from "@/lib/turnUtils";
import type { TileCode } from "@/types/tile";

// ---------------------------------------------------------------------------
// 타입 정의
// ---------------------------------------------------------------------------

export interface UseDragHandlersReturn {
  handleDragStart: (event: DragStartEvent) => void;
  handleDragEnd: (event: DragEndEvent) => void;
  handleDragCancel: () => void;
}

// ---------------------------------------------------------------------------
// Hook 구현
// ---------------------------------------------------------------------------

/**
 * dnd-kit DragStart/End/Cancel 이벤트를 store 전이 + dragEndReducer 호출로 연결한다.
 *
 * F-02~F-06 드래그 유형 모두 이 hook 하나로 처리한다.
 * dragEndReducer의 deps(isCompatible, computeScore, generatePendingId)는
 * 이 hook이 주입한다 — 테스트에서 mock 교체 가능 (58 §6.3 원칙 3).
 */
export function useDragHandlers(): UseDragHandlersReturn {
  // 개별 action selector 구독 — 전체 store 객체 구독은 무한 루프 유발 방지
  const setActive = useDragStateStore((s) => s.setActive);
  const clearActive = useDragStateStore((s) => s.clearActive);
  const turnTransition = useTurnStateStore((s) => s.transition);

  // ---------------------------------------------------------------------------
  // handleDragStart
  // ---------------------------------------------------------------------------
  const handleDragStart = useCallback(
    (event: DragStartEvent) => {
      const { active } = event;
      if (!active) return;

      const tileCode = active.data.current?.tileCode as TileCode | undefined;
      const sourceKind = active.data.current?.sourceKind as string | undefined;
      const groupId = active.data.current?.groupId as string | undefined;
      const tileIndex = active.data.current?.index as number | undefined;

      if (!tileCode) return;

      // dragStateStore에 활성 드래그 정보 저장
      if (sourceKind === "rack") {
        setActive(tileCode, { kind: "rack" });
        // S1/S5/S6 → S2 (랙에서 드래그 시작)
        turnTransition("DRAG_START_RACK");
      } else if (sourceKind === "table" && groupId !== undefined && tileIndex !== undefined) {
        setActive(tileCode, { kind: "table", groupId, index: tileIndex });

        // 출발 그룹이 pending인지 확인
        const draft = usePendingStore.getState().draft;
        const isPendingSource = draft?.pendingGroupIds.has(groupId) ?? false;

        if (isPendingSource) {
          // S5 → S3 (pending 그룹에서 드래그 시작)
          turnTransition("DRAG_START_PENDING");
        } else {
          // S5/S6 → S4 (서버 확정 그룹에서 드래그 시작 — POST_MELD만)
          const { players, mySeat } = useGameStore.getState();
          const me = players.find((p) => p.seat === mySeat);
          turnTransition("DRAG_START_SERVER", {
            hasInitialMeld: me?.hasInitialMeld === true,
          });
        }
      }
    },
    [setActive, turnTransition]
  );

  // ---------------------------------------------------------------------------
  // handleDragEnd
  // ---------------------------------------------------------------------------
  const handleDragEnd = useCallback(
    (event: DragEndEvent) => {
      const { active, over } = event;

      // 드롭 타겟 없음 → 취소와 동일 처리
      if (!over) {
        clearActive();
        turnTransition("DRAG_CANCEL");
        return;
      }

      const tileCode = active.data.current?.tileCode as TileCode | undefined;
      const sourceKind = active.data.current?.sourceKind as string | undefined;
      const groupId = active.data.current?.groupId as string | undefined;
      const tileIndex = active.data.current?.index as number | undefined;
      const overId = String(over.id);

      if (!tileCode) {
        clearActive();
        return;
      }

      // 리듀서 입력 상태 구성 (gameStore + pendingStore에서 읽기)
      const gameState = useGameStore.getState();
      const draft = usePendingStore.getState().draft;

      // pending 그룹 + 서버 그룹 통합 (리듀서는 전체 테이블 그룹을 본다)
      const tableGroups =
        draft?.groups ?? gameState.gameState?.tableGroups ?? [];
      const myTiles = draft?.myTiles ?? gameState.myTiles;
      const pendingGroupIds = draft?.pendingGroupIds ?? new Set<string>();
      const pendingRecoveredJokers = draft?.recoveredJokers ?? [];

      const { players, mySeat } = gameState;
      const me = players.find((p) => p.seat === mySeat);
      const hasInitialMeld = me?.hasInitialMeld === true;

      // pendingGroupSeq: draft에 없으면 0으로 시작
      const pendingGroupSeq = draft
        ? [...draft.pendingGroupIds].filter((id) => id.startsWith("pending-")).length
        : 0;

      const source =
        sourceKind === "rack"
          ? ({ kind: "rack" } as const)
          : sourceKind === "table" && groupId !== undefined && tileIndex !== undefined
          ? ({ kind: "table", groupId, index: tileIndex } as const)
          : null;

      if (!source) {
        clearActive();
        return;
      }

      // dragEndReducer 호출 (L3 순수 함수)
      const result = dragEndReducer(
        {
          tableGroups,
          myTiles,
          pendingGroupIds,
          pendingRecoveredJokers,
          hasInitialMeld,
          forceNewGroup: false,
          pendingGroupSeq,
        },
        {
          source,
          tileCode,
          overId,
          now: Date.now(),
        }
      );

      // 결과를 pendingStore에 atomic 적용
      if (!result.rejected) {
        usePendingStore.getState().applyMutation(result);
        // S2/S3/S4 → S5 (드롭 성공)
        turnTransition("DROP_OK");
      } else {
        // reject 시 상태 복원
        turnTransition("DRAG_CANCEL");
      }

      // 드래그 상태 초기화
      clearActive();
    },
    [clearActive, turnTransition]
  );

  // ---------------------------------------------------------------------------
  // handleDragCancel
  // ---------------------------------------------------------------------------
  const handleDragCancel = useCallback(() => {
    clearActive();
    // UR-17: 드래그 취소 시 상태 변경 없음 (타일/그룹 상태 불변)
    // S2 → S1, S3/S4 → S5
    turnTransition("DRAG_CANCEL");
  }, [clearActive, turnTransition]);

  return {
    handleDragStart,
    handleDragEnd,
    handleDragCancel,
  };
}

// 의존성 주입용 deps 타입 재export (테스트에서 mock 사용)
export { isCompatibleWithGroup, computeValidMergeGroups, computePendingScore };
