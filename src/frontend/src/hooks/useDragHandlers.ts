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
 *
 * P3-2 (2026-04-28): GameClient.handleDragEnd 의 9개 인라인 분기 + re-entrancy guard
 *   + UI 부수효과를 모두 이 hook 으로 이전했다. 옵션은 모두 optional 이므로
 *   no-args 호출 (GameRoom 마운트, 단위 테스트) 은 dragEndReducer 단일 경로만 사용한다.
 *   GameClient 가 옵션을 주입하면 9개 분기 + guard 가 활성화되어 행동 등가 보장.
 */

import { useCallback, useMemo, useRef } from "react";
import type { MutableRefObject } from "react";
import type { DragStartEvent, DragEndEvent } from "@dnd-kit/core";
import { useDragStateStore } from "@/store/dragStateStore";
import { usePendingStore } from "@/store/pendingStore";
import { useTurnStateStore } from "@/store/turnStateStore";
import { useGameStore } from "@/store/gameStore";
import { useWSStore } from "@/store/wsStore";
import { dragEndReducer } from "@/lib/dragEnd/dragEndReducer";
import { isCompatibleWithGroup, computeValidMergeGroups } from "@/lib/mergeCompatibility";
import { computePendingScore } from "@/lib/turnUtils";
import { detectDuplicateTileCodes } from "@/lib/tileStateHelpers";
import {
  parseTileCode,
  type TileCode,
  type TileNumber,
  type TableGroup,
  type GroupType,
} from "@/types/tile";

// ---------------------------------------------------------------------------
// 내부 헬퍼 (GameClient 의 m-1/§6.2 헬퍼를 hook 내부로 이전)
// ---------------------------------------------------------------------------

/**
 * m-1: 배열에서 첫 번째 일치 항목만 제거하는 헬퍼.
 * filter() 는 모든 일치를 제거하므로 동일 타일 코드가 여러 장일 때 문제가 된다.
 */
function removeFirstOccurrence<T>(arr: T[], item: T): T[] {
  const idx = arr.indexOf(item);
  return idx >= 0 ? [...arr.slice(0, idx), ...arr.slice(idx + 1)] : arr;
}

/**
 * BUG-UI-005: 타일 목록으로 그룹/런 자동 분류 (GameClient 헬퍼 이전).
 * 기본값 "group" — pending 라벨은 validatePendingBlock 결과를 사용하므로 표시에 무영향.
 */
function classifySetType(tiles: TileCode[]): GroupType {
  const regular = tiles.filter((t) => t !== "JK1" && t !== "JK2");
  if (regular.length === 0) return "run";
  if (regular.length === 1) return "run";

  const parsed = regular.map((t) => parseTileCode(t));
  const numbers = new Set(parsed.map((t) => t.number));
  const colors = new Set(parsed.map((t) => t.color));

  if (colors.size === 1) return "run";
  if (numbers.size === 1) return "group";
  return "group";
}

interface JokerSwapResult {
  nextTiles: TileCode[];
  recoveredJoker: TileCode;
}

/**
 * §6.2 유형 4: 조커 교체 후보 탐색.
 * GameClient 의 tryJokerSwap 헬퍼를 hook 내부로 이전.
 */
function tryJokerSwap(
  groupTiles: TileCode[],
  rackTile: TileCode
): JokerSwapResult | null {
  const rackParsed = parseTileCode(rackTile);
  if (rackParsed.isJoker) return null;

  const jokerIdx = groupTiles.findIndex((t) => t === "JK1" || t === "JK2");
  if (jokerIdx < 0) return null;

  const nonJokers = groupTiles
    .filter((t) => t !== "JK1" && t !== "JK2")
    .map((t) => parseTileCode(t));
  if (nonJokers.length === 0) return null;

  const numbers = new Set(nonJokers.map((t) => t.number));
  const colors = new Set(nonJokers.map((t) => t.color));
  const isGroup = numbers.size === 1;
  const isRun = colors.size === 1;

  if (isGroup && !isRun) {
    const groupNumber = nonJokers[0].number;
    if (rackParsed.number !== groupNumber) return null;
    if (colors.has(rackParsed.color as typeof nonJokers[number]["color"])) return null;
  } else if (isRun && !isGroup) {
    const runColor = nonJokers[0].color;
    if (rackParsed.color !== runColor) return null;
    if (rackParsed.number === null) return null;

    const sortedNums = nonJokers
      .map((t) => t.number)
      .filter((n): n is TileNumber => n !== null)
      .sort((a, b) => a - b);
    if (sortedNums.length === 0) return null;

    const candidateNumbers = new Set<number>();
    for (let i = 1; i < sortedNums.length; i++) {
      for (let n = sortedNums[i - 1] + 1; n < sortedNums[i]; n++) {
        candidateNumbers.add(n);
      }
    }
    if (sortedNums[0] > 1) candidateNumbers.add(sortedNums[0] - 1);
    if (sortedNums[sortedNums.length - 1] < 13)
      candidateNumbers.add(sortedNums[sortedNums.length - 1] + 1);

    if (!candidateNumbers.has(rackParsed.number)) return null;
  } else {
    return null;
  }

  const recoveredJoker = groupTiles[jokerIdx];
  const nextTiles = [...groupTiles];
  nextTiles[jokerIdx] = rackTile;
  return { nextTiles, recoveredJoker: recoveredJoker as TileCode };
}

// ---------------------------------------------------------------------------
// 타입 정의
// ---------------------------------------------------------------------------

export interface UseDragHandlersReturn {
  handleDragStart: (event: DragStartEvent) => void;
  handleDragEnd: (event: DragEndEvent) => void;
  handleDragCancel: () => void;
}

/**
 * P3-2: GameClient.handleDragEnd 행동 등가 옵션.
 *
 * 모든 필드는 optional. 하나라도 제공되면 GameClient 와 동일한 9개 분기 + guard 활성화.
 * 미제공 시 (GameRoom 마운트 / 단위 테스트) dragEndReducer 단일 경로만 사용.
 */
export interface UseDragHandlersOptions {
  /** "+ 새 그룹" 토글 — game-board 직접 드롭 시 강제 새 그룹 분기 활성화 */
  forceNewGroup?: boolean;
  setForceNewGroup?: (val: boolean) => void;

  /** BUG-UI-009 re-entrancy guard. dnd-kit listener 다중 등록 차단 */
  isHandlingDragEndRef?: MutableRefObject<boolean>;
  /** BUG-UI-EXT timestamp dedup. activatorEvent.timeStamp 동일 시 차단 */
  lastDragEndTimestampRef?: MutableRefObject<number>;
  /** BUG-UI-REARRANGE-002 단조 카운터 — 동일 ms 내 ID 충돌 방지 */
  pendingGroupSeqRef?: MutableRefObject<number>;

  /** UX-004: 같은 턴 내 1회 ExtendLockToast 표시 추적 */
  extendLockToastShownRef?: MutableRefObject<boolean>;
  /** ExtendLockToast 표시 콜백 (FINDING-01 분기) */
  showExtendLockToast?: () => void;

  /** 내 턴 가드 — false 면 드롭 차단 */
  isMyTurn?: boolean;

  /** activeDragSourceRef — 드래그 소스 타입 추적 (rack/table) */
  activeDragSourceRef?: MutableRefObject<ActiveDragSource | null>;

  /**
   * @deprecated P3-3 Step 2 (2026-04-29) — activeDragCode React state 가
   *   dragStateStore.activeTile 로 통합되며 옵션 제거. setActive/clearActive 로
   *   hook 이 직접 store 를 갱신하므로 별도 동기화 불필요.
   *   기존 호출자 호환을 위해 시그니처는 잠정 유지하되 본 hook 은 무시한다.
   */
  setActiveDragCode?: (code: TileCode | null) => void;
}

export type ActiveDragSource =
  | { kind: "rack" }
  | { kind: "table"; groupId: string; index: number };

// ---------------------------------------------------------------------------
// Hook 구현
// ---------------------------------------------------------------------------

/**
 * dnd-kit DragStart/End/Cancel 이벤트를 store 전이 + dragEndReducer 호출로 연결한다.
 *
 * 옵션 미제공 시 dragEndReducer 단일 경로만 사용 (테스트/GameRoom 마운트).
 * 옵션 제공 시 GameClient 와 동일한 9개 분기 + BUG-UI-009/010/EXT guard 활성화.
 */
export function useDragHandlers(
  options: UseDragHandlersOptions = {}
): UseDragHandlersReturn {
  // 개별 action selector 구독 — 전체 store 객체 구독은 무한 루프 유발 방지
  const setActive = useDragStateStore((s) => s.setActive);
  const clearActive = useDragStateStore((s) => s.clearActive);
  const turnTransition = useTurnStateStore((s) => s.transition);

  // 옵션이 없을 때를 위한 내부 fallback ref (테스트/GameRoom no-args 호출 호환)
  const fallbackSourceRef = useRef<ActiveDragSource | null>(null);
  const fallbackHandlingRef = useRef<boolean>(false);
  const fallbackTimestampRef = useRef<number>(-1);

  // P3-3 Sub-C (2026-04-29): pendingGroupSeq + extendLockToastShown SSOT 를
  //   dragStateStore 로 이전하면서 hook 본체가 store-backed ref-like 를 직접 생성하도록 변경.
  //   GameClient/GameRoom 양쪽이 동일 단조 카운터를 공유. 옵션 주입 가능 (테스트 격리용).
  const storePendingGroupSeqRef = useMemo<MutableRefObject<number>>(
    () => ({
      get current() {
        return useDragStateStore.getState().pendingGroupSeq;
      },
      set current(v: number) {
        useDragStateStore.getState().setPendingGroupSeq(v);
      },
    }),
    []
  );
  const storeExtendLockToastShownRef = useMemo<MutableRefObject<boolean>>(
    () => ({
      get current() {
        return useDragStateStore.getState().extendLockToastShown;
      },
      set current(v: boolean) {
        useDragStateStore.getState().setExtendLockToastShown(v);
      },
    }),
    []
  );

  const {
    forceNewGroup = false,
    setForceNewGroup,
    isHandlingDragEndRef = fallbackHandlingRef,
    lastDragEndTimestampRef = fallbackTimestampRef,
    pendingGroupSeqRef = storePendingGroupSeqRef,
    extendLockToastShownRef = storeExtendLockToastShownRef,
    showExtendLockToast,
    isMyTurn,
    activeDragSourceRef = fallbackSourceRef,
    setActiveDragCode,
  } = options;

  // ---------------------------------------------------------------------------
  // handleDragStart
  // ---------------------------------------------------------------------------
  const handleDragStart = useCallback(
    (event: DragStartEvent) => {
      const { active } = event;
      if (!active) return;

      // BUG-UI-009/010: 이전 드래그 잔재 defensive clear —
      // onDragCancel 이 누락됐거나 ESC/blur 이후 잔존한 state 를 안전하게 초기화한다.
      activeDragSourceRef.current = null;

      const tileCode = active.data.current?.tileCode as TileCode | undefined;
      // GameClient 는 source/sourceKind 둘 다 사용 — 양쪽 모두 지원
      const sourceKind =
        (active.data.current?.sourceKind as string | undefined) ??
        (active.data.current?.source as string | undefined);
      const groupId = active.data.current?.groupId as string | undefined;
      const tileIndex = active.data.current?.index as number | undefined;

      if (!tileCode) return;

      // GameClient 측 React state (activeDragCode) 동기화 — 옵션 제공 시
      if (setActiveDragCode) setActiveDragCode(tileCode);

      // dragStateStore 에 활성 드래그 정보 저장
      if (sourceKind === "rack") {
        setActive(tileCode, { kind: "rack" });
        activeDragSourceRef.current = { kind: "rack" };
        // S1/S5/S6 → S2 (랙에서 드래그 시작)
        turnTransition("DRAG_START_RACK");
      } else if (sourceKind === "table" && groupId !== undefined && tileIndex !== undefined) {
        setActive(tileCode, { kind: "table", groupId, index: tileIndex });
        activeDragSourceRef.current = { kind: "table", groupId, index: tileIndex };

        // 출발 그룹이 pending 인지 확인
        const draft = usePendingStore.getState().draft;
        const isPendingSource = draft?.pendingGroupIds.has(groupId) ?? false;

        if (isPendingSource) {
          // S5 → S3 (pending 그룹에서 드래그 시작)
          turnTransition("DRAG_START_PENDING");
        } else {
          // S5/S6 → S4 (서버 확정 그룹에서 드래그 시작 — POST_MELD 만)
          const { players, mySeat } = useGameStore.getState();
          const me = players.find((p) => p.seat === mySeat);
          turnTransition("DRAG_START_SERVER", {
            hasInitialMeld: me?.hasInitialMeld === true,
          });
        }
      } else {
        // 소스 정보 부족 — rack 으로 안전 fallback
        activeDragSourceRef.current = { kind: "rack" };
      }
    },
    [setActive, turnTransition, activeDragSourceRef, setActiveDragCode]
  );

  // ---------------------------------------------------------------------------
  // handleDragCancel
  // ---------------------------------------------------------------------------
  const handleDragCancel = useCallback(() => {
    clearActive();
    if (setActiveDragCode) setActiveDragCode(null);
    activeDragSourceRef.current = null;
    // BUG-UI-009: 취소 시에도 re-entrancy guard 해제
    isHandlingDragEndRef.current = false;
    // UR-17: 드래그 취소 시 상태 변경 없음 (타일/그룹 상태 불변)
    // S2 → S1, S3/S4 → S5
    turnTransition("DRAG_CANCEL");
  }, [
    clearActive,
    turnTransition,
    setActiveDragCode,
    activeDragSourceRef,
    isHandlingDragEndRef,
  ]);

  // ---------------------------------------------------------------------------
  // handleDragEnd
  // ---------------------------------------------------------------------------
  const handleDragEnd = useCallback(
    (event: DragEndEvent) => {
      // BUG-UI-009: re-entrancy guard
      if (isHandlingDragEndRef.current) {
        if (process.env.NODE_ENV !== "production") {
          console.warn("[BUG-UI-009] handleDragEnd re-entrancy 감지 — 중복 dispatch 차단");
        }
        return;
      }

      // BUG-UI-EXT 수정 2: activatorEvent.timeStamp dedup
      const activatorTs =
        (event.activatorEvent as PointerEvent | undefined)?.timeStamp ?? -1;
      if (activatorTs !== -1 && activatorTs === lastDragEndTimestampRef.current) {
        if (process.env.NODE_ENV !== "production") {
          console.warn(
            "[BUG-UI-EXT] handleDragEnd 동일 timeStamp 중복 dispatch 차단 ts=%f",
            activatorTs
          );
        }
        return;
      }
      lastDragEndTimestampRef.current = activatorTs;

      isHandlingDragEndRef.current = true;
      try {
        const { active, over } = event;

        // 드롭 타겟 없음 (옵션 미제공 = 테스트 경로)
        if (!over) {
          clearActive();
          if (setActiveDragCode) setActiveDragCode(null);
          activeDragSourceRef.current = null;
          // GameClient 행동 등가: isMyTurn 인 경우 안내 토스트
          if (isMyTurn === true) {
            useWSStore.getState().setLastError("드롭 위치를 확인하세요");
          }
          turnTransition("DRAG_CANCEL");
          return;
        }

        const tileCode = active.data.current?.tileCode as TileCode | undefined;
        if (!tileCode) {
          clearActive();
          if (setActiveDragCode) setActiveDragCode(null);
          activeDragSourceRef.current = null;
          return;
        }

        // GameClient 행동 등가: 내 턴이 아니면 조용히 return
        if (isMyTurn === false) {
          clearActive();
          if (setActiveDragCode) setActiveDragCode(null);
          activeDragSourceRef.current = null;
          return;
        }

        // BUG-UI-EXT 수정 1: 매 분기 진입 전 store.getState() 로 최신 값 1회 획득.
        // useMemo derived state 의 stale snapshot 을 근본적으로 차단.
        const latestGameState = useGameStore.getState();
        const latestDraft = usePendingStore.getState().draft;
        const freshPendingTableGroups: TableGroup[] | null = latestDraft
          ? latestDraft.groups
          : null;
        const freshTableGroups: TableGroup[] =
          freshPendingTableGroups ?? latestGameState.gameState?.tableGroups ?? [];
        const freshMyTiles: TileCode[] =
          latestDraft?.myTiles ?? latestGameState.myTiles;
        const freshPendingGroupIds: Set<string> =
          latestDraft?.pendingGroupIds ?? new Set<string>();
        const freshPendingRecoveredJokers: TileCode[] =
          latestDraft?.recoveredJokers ?? [];

        // F4 (FINDING-01): players[mySeat].hasInitialMeld 를 1차 SSOT 로 사용 (루트는 fallback).
        const freshHasInitialMeld = (() => {
          const seat = latestGameState.mySeat;
          if (seat >= 0) {
            const me = latestGameState.players.find((p) => p.seat === seat);
            if (me?.hasInitialMeld !== undefined) return me.hasInitialMeld;
          }
          return latestGameState.hasInitialMeld;
        })();

        const sourceKind =
          (active.data.current?.sourceKind as string | undefined) ??
          (active.data.current?.source as string | undefined);
        const dragGroupId = active.data.current?.groupId as string | undefined;
        const dragIndex = active.data.current?.index as number | undefined;

        // dragSource: activeDragSourceRef (handleDragStart 가 채움) 우선,
        // 없으면 event.active.data 에서 재구성 (테스트 경로 호환)
        let dragSource: ActiveDragSource | null = activeDragSourceRef.current;
        if (!dragSource) {
          if (sourceKind === "rack") {
            dragSource = { kind: "rack" };
          } else if (
            sourceKind === "table" &&
            dragGroupId !== undefined &&
            dragIndex !== undefined
          ) {
            dragSource = { kind: "table", groupId: dragGroupId, index: dragIndex };
          }
        }
        activeDragSourceRef.current = null;
        if (setActiveDragCode) setActiveDragCode(null);

        // ----------------------------------------------------------------
        // P2-1: 테이블 타일 드래그 (§6.2 유형 1/3 재배치)
        // ----------------------------------------------------------------
        if (dragSource?.kind === "table") {
          const sourceGroup = freshTableGroups.find((g) => g.id === dragSource!.groupId);
          if (!sourceGroup) {
            clearActive();
            return;
          }
          const sourceIsPending = freshPendingGroupIds.has(dragSource.groupId);

          // 같은 그룹 위로 떨어뜨리면 no-op
          if (over.id === dragSource.groupId) {
            clearActive();
            return;
          }

          // 테이블 → 랙 되돌리기
          if (over.id === "player-rack") {
            if (!sourceIsPending) {
              clearActive();
              return;
            }

            const baseTiles = [...sourceGroup.tiles];
            const [removed] = baseTiles.splice(dragSource.index, 1);
            if (removed !== tileCode) {
              clearActive();
              return;
            }

            const nextTableGroups = freshTableGroups
              .map((g) =>
                g.id === dragSource!.groupId
                  ? { ...g, tiles: baseTiles, type: classifySetType(baseTiles) }
                  : g
              )
              .filter((g) => g.tiles.length > 0);

            const stillHasPending = nextTableGroups.some((g) =>
              freshPendingGroupIds.has(g.id)
            );
            const nextGroupIds = stillHasPending
              ? new Set(
                  [...freshPendingGroupIds].filter((id) =>
                    nextTableGroups.some((g) => g.id === id)
                  )
                )
              : new Set<string>();
            usePendingStore.getState().applyMutation({
              nextTableGroups: stillHasPending ? nextTableGroups : null,
              nextMyTiles: [...freshMyTiles, tileCode],
              nextPendingGroupIds: nextGroupIds,
              nextPendingRecoveredJokers: freshPendingRecoveredJokers,
              nextPendingGroupSeq: pendingGroupSeqRef.current,
              branch: "hook-table→rack",
            });
            turnTransition("DROP_OK");
            clearActive();
            return;
          }

          // A4/A8: table source → game-board / game-board-new-group → reducer 위임
          if (over.id === "game-board" || over.id === "game-board-new-group") {
            const result = dragEndReducer(
              {
                tableGroups: freshTableGroups,
                myTiles: freshMyTiles,
                pendingGroupIds: freshPendingGroupIds,
                pendingRecoveredJokers: freshPendingRecoveredJokers,
                hasInitialMeld: freshHasInitialMeld,
                forceNewGroup: false,
                pendingGroupSeq: pendingGroupSeqRef.current,
              },
              {
                source: {
                  kind: "table",
                  groupId: dragSource.groupId,
                  index: dragSource.index,
                },
                tileCode,
                overId: String(over.id),
                now: Date.now(),
              }
            );
            if (!result.rejected) {
              pendingGroupSeqRef.current = result.nextPendingGroupSeq;
              usePendingStore.getState().applyMutation(result);
              turnTransition("DROP_OK");
            } else {
              turnTransition("DRAG_CANCEL");
            }
            clearActive();
            return;
          }

          // 테이블 → 다른 그룹 이동 (유형 3)
          if (!freshHasInitialMeld) {
            clearActive();
            return;
          }
          const targetGroup = freshTableGroups.find((g) => g.id === over.id);
          if (!targetGroup) {
            clearActive();
            return;
          }
          if (targetGroup.id === sourceGroup.id) {
            clearActive();
            return;
          }

          const updatedSourceTiles = [...sourceGroup.tiles];
          const [removed] = updatedSourceTiles.splice(dragSource.index, 1);
          if (removed !== tileCode) {
            clearActive();
            return;
          }

          const updatedTargetTiles = [...targetGroup.tiles, tileCode];

          const nextTableGroups = freshTableGroups
            .map((g) => {
              if (g.id === sourceGroup.id)
                return {
                  ...g,
                  tiles: updatedSourceTiles,
                  type: classifySetType(updatedSourceTiles),
                };
              if (g.id === targetGroup.id)
                return {
                  ...g,
                  tiles: updatedTargetTiles,
                  type: classifySetType(updatedTargetTiles),
                };
              return g;
            })
            .filter((g) => g.tiles.length > 0);

          if (process.env.NODE_ENV !== "production") {
            const ids = nextTableGroups.map((g) => g.id);
            if (new Set(ids).size !== ids.length) {
              console.error("[BUG-UI-REARRANGE-002] 그룹 ID 중복 감지", ids);
            }
          }

          {
            const nextGroupIdSet = new Set(nextTableGroups.map((g) => g.id));
            const updatedPendingIds = new Set(
              [...freshPendingGroupIds, sourceGroup.id, targetGroup.id].filter(
                (id) => nextGroupIdSet.has(id)
              )
            );
            usePendingStore.getState().applyMutation({
              nextTableGroups,
              nextMyTiles: freshMyTiles,
              nextPendingGroupIds: updatedPendingIds,
              nextPendingRecoveredJokers: freshPendingRecoveredJokers,
              nextPendingGroupSeq: pendingGroupSeqRef.current,
              branch: "hook-table→table:merge",
            });
          }
          turnTransition("DROP_OK");
          clearActive();
          return;
        }

        // ----------------------------------------------------------------
        // P3: 조커 교체 (§6.2 유형 4)
        // ----------------------------------------------------------------
        const swapCandidate = freshTableGroups.find((g) => g.id === over.id);
        if (swapCandidate) {
          const hasJoker = swapCandidate.tiles.some(
            (t) => t === "JK1" || t === "JK2"
          );
          if (hasJoker) {
            const isPending = freshPendingGroupIds.has(swapCandidate.id);
            if (isPending || freshHasInitialMeld) {
              const swap = tryJokerSwap(swapCandidate.tiles, tileCode);
              if (swap) {
                const nextTableGroups = freshTableGroups.map((g) =>
                  g.id === swapCandidate.id
                    ? {
                        ...g,
                        tiles: swap.nextTiles,
                        type: classifySetType(swap.nextTiles),
                      }
                    : g
                );
                const nextMyTilesAfterSwap = [
                  ...removeFirstOccurrence(freshMyTiles, tileCode),
                  swap.recoveredJoker,
                ];
                {
                  const nextPendingGroupIds = new Set([
                    ...freshPendingGroupIds,
                    swapCandidate.id,
                  ]);
                  const nextPendingRecoveredJokers = [
                    ...freshPendingRecoveredJokers,
                    swap.recoveredJoker,
                  ];
                  usePendingStore.getState().applyMutation({
                    nextTableGroups,
                    nextMyTiles: nextMyTilesAfterSwap,
                    nextPendingGroupIds,
                    nextPendingRecoveredJokers,
                    nextPendingGroupSeq: pendingGroupSeqRef.current,
                    addedJoker: swap.recoveredJoker,
                    branch: "hook-rack→joker-swap",
                  });
                }
                turnTransition("DROP_OK");
                clearActive();
                return;
              }
            }
          }
        }

        // ----------------------------------------------------------------
        // 기존 pending 그룹에 드롭한 경우
        // ----------------------------------------------------------------
        const existingPendingGroup = freshPendingTableGroups?.find(
          (g) => g.id === over.id && freshPendingGroupIds.has(g.id)
        );

        if (existingPendingGroup) {
          // BUG-UI-009(F-2): 호환성 검증 — 호환 안 되면 새 그룹 생성
          if (!isCompatibleWithGroup(tileCode, existingPendingGroup)) {
            pendingGroupSeqRef.current += 1;
            const newGroupId = `pending-${Date.now()}-${pendingGroupSeqRef.current}`;
            const newGroup: TableGroup = {
              id: newGroupId,
              tiles: [tileCode],
              type: classifySetType([tileCode]),
            };
            const nextTableGroups = [...freshTableGroups, newGroup];
            const nextMyTiles = removeFirstOccurrence(freshMyTiles, tileCode);
            const isJokerRecovered = freshPendingRecoveredJokers.includes(tileCode);
            {
              const nextPendingGroupIds = new Set([
                ...freshPendingGroupIds,
                newGroupId,
              ]);
              const nextPendingRecoveredJokers = isJokerRecovered
                ? freshPendingRecoveredJokers.filter((j) => j !== tileCode)
                : freshPendingRecoveredJokers;
              usePendingStore.getState().applyMutation({
                nextTableGroups,
                nextMyTiles,
                nextPendingGroupIds,
                nextPendingRecoveredJokers,
                nextPendingGroupSeq: pendingGroupSeqRef.current,
                ...(isJokerRecovered ? { removedJoker: tileCode } : {}),
                branch: "hook-rack→pending-group:incompatible-new-group",
              });
            }
            turnTransition("DROP_OK");
            clearActive();
            return;
          }
          // 호환되면 기존 pending 그룹에 append
          const nextTableGroups = freshTableGroups.map((g) => {
            if (g.id !== existingPendingGroup.id) return g;
            const updatedTiles = [...g.tiles, tileCode];
            return { ...g, tiles: updatedTiles, type: classifySetType(updatedTiles) };
          });
          // I-1 핫픽스: 중복 타일 감지 방어
          {
            const dupes = detectDuplicateTileCodes(nextTableGroups);
            if (dupes.length > 0) {
              useWSStore.getState().setLastError(
                `타일 중복 감지: ${dupes.join(", ")} — 되돌리기 후 다시 배치하세요`
              );
              turnTransition("DRAG_CANCEL");
              clearActive();
              return;
            }
          }
          const nextMyTiles = removeFirstOccurrence(freshMyTiles, tileCode);
          const isJokerRecovered = freshPendingRecoveredJokers.includes(tileCode);
          {
            const nextPendingRecoveredJokers = isJokerRecovered
              ? freshPendingRecoveredJokers.filter((j) => j !== tileCode)
              : freshPendingRecoveredJokers;
            usePendingStore.getState().applyMutation({
              nextTableGroups,
              nextMyTiles,
              nextPendingGroupIds: freshPendingGroupIds,
              nextPendingRecoveredJokers,
              nextPendingGroupSeq: pendingGroupSeqRef.current,
              ...(isJokerRecovered ? { removedJoker: tileCode } : {}),
              branch: "hook-rack→pending-group:compatible-append",
            });
          }
          turnTransition("DROP_OK");
          clearActive();
          return;
        }

        // ----------------------------------------------------------------
        // 서버 확정 그룹에 드롭한 경우 (BUG-UI-REARRANGE-001)
        // ----------------------------------------------------------------
        const targetServerGroup = freshTableGroups.find((g) => g.id === over.id);

        // FINDING-01: 초기 등록 전 서버 그룹 영역 드롭 → 새 pending 그룹 생성
        if (targetServerGroup && !freshHasInitialMeld) {
          // UX-004: 같은 턴 내 1회 ExtendLockToast 표시
          if (!extendLockToastShownRef.current) {
            extendLockToastShownRef.current = true;
            if (showExtendLockToast) showExtendLockToast();
          }
          pendingGroupSeqRef.current += 1;
          const newGroupId = `pending-${Date.now()}-${pendingGroupSeqRef.current}`;
          const newGroup: TableGroup = {
            id: newGroupId,
            tiles: [tileCode],
            type: classifySetType([tileCode]),
          };
          const nextTableGroups = [...freshTableGroups, newGroup];
          const nextMyTiles = removeFirstOccurrence(freshMyTiles, tileCode);
          const isJokerRecovered = freshPendingRecoveredJokers.includes(tileCode);
          {
            const nextPendingGroupIds = new Set([...freshPendingGroupIds, newGroupId]);
            const nextPendingRecoveredJokers = isJokerRecovered
              ? freshPendingRecoveredJokers.filter((j) => j !== tileCode)
              : freshPendingRecoveredJokers;
            usePendingStore.getState().applyMutation({
              nextTableGroups,
              nextMyTiles,
              nextPendingGroupIds,
              nextPendingRecoveredJokers,
              nextPendingGroupSeq: pendingGroupSeqRef.current,
              ...(isJokerRecovered ? { removedJoker: tileCode } : {}),
              branch: "hook-server-group→new-group:before-initial-meld",
            });
          }
          turnTransition("DROP_OK");
          clearActive();
          return;
        }

        // 서버 확정 그룹 + 초기 등록 후
        if (targetServerGroup && freshHasInitialMeld) {
          if (!isCompatibleWithGroup(tileCode, targetServerGroup)) {
            // 호환 안 됨: 새 그룹 생성 (옵션 A 폴스루)
            pendingGroupSeqRef.current += 1;
            const newGroupId = `pending-${Date.now()}-${pendingGroupSeqRef.current}`;
            const newGroup: TableGroup = {
              id: newGroupId,
              tiles: [tileCode],
              type: classifySetType([tileCode]),
            };
            const nextTableGroups = [...freshTableGroups, newGroup];
            const nextMyTiles = removeFirstOccurrence(freshMyTiles, tileCode);
            const isJokerRecovered = freshPendingRecoveredJokers.includes(tileCode);
            {
              const nextPendingGroupIds = new Set([
                ...freshPendingGroupIds,
                newGroupId,
              ]);
              const nextPendingRecoveredJokers = isJokerRecovered
                ? freshPendingRecoveredJokers.filter((j) => j !== tileCode)
                : freshPendingRecoveredJokers;
              usePendingStore.getState().applyMutation({
                nextTableGroups,
                nextMyTiles,
                nextPendingGroupIds,
                nextPendingRecoveredJokers,
                nextPendingGroupSeq: pendingGroupSeqRef.current,
                ...(isJokerRecovered ? { removedJoker: tileCode } : {}),
                branch: "hook-server-group→new-group:incompatible",
              });
            }
            turnTransition("DROP_OK");
            clearActive();
            return;
          }
          // 호환: 서버 확정 그룹에 append
          const updatedTiles = [...targetServerGroup.tiles, tileCode];
          const nextTableGroups = freshTableGroups.map((g) =>
            g.id === targetServerGroup.id
              ? { ...g, tiles: updatedTiles, type: classifySetType(updatedTiles) }
              : g
          );
          {
            const dupes = detectDuplicateTileCodes(nextTableGroups);
            if (dupes.length > 0) {
              useWSStore.getState().setLastError(
                `타일 중복 감지: ${dupes.join(", ")} — 되돌리기 후 다시 배치하세요`
              );
              turnTransition("DRAG_CANCEL");
              clearActive();
              return;
            }
          }
          const nextMyTiles = removeFirstOccurrence(freshMyTiles, tileCode);
          const isJokerRecovered = freshPendingRecoveredJokers.includes(tileCode);
          {
            const nextPendingGroupIds = new Set([
              ...freshPendingGroupIds,
              targetServerGroup.id,
            ]);
            const nextPendingRecoveredJokers = isJokerRecovered
              ? freshPendingRecoveredJokers.filter((j) => j !== tileCode)
              : freshPendingRecoveredJokers;
            usePendingStore.getState().applyMutation({
              nextTableGroups,
              nextMyTiles,
              nextPendingGroupIds,
              nextPendingRecoveredJokers,
              nextPendingGroupSeq: pendingGroupSeqRef.current,
              ...(isJokerRecovered ? { removedJoker: tileCode } : {}),
              branch: "hook-server-group:compatible-append",
            });
          }
          turnTransition("DROP_OK");
          clearActive();
          return;
        }

        // ----------------------------------------------------------------
        // game-board / game-board-new-group / player-rack 드롭존
        // ----------------------------------------------------------------
        const treatAsBoardDrop = over.id === "game-board";

        if (treatAsBoardDrop) {
          // BUG-NEW-001: 서버 확정 그룹은 명시적 드롭존을 통해서만 → "pending-" 접두사만 고려
          const pendingOnlyGroups = freshPendingTableGroups?.filter(
            (g) =>
              freshPendingGroupIds.has(g.id) && g.id.startsWith("pending-")
          );
          const lastPendingGroup = pendingOnlyGroups?.at(-1);

          // BUG-UI-001 / CLASSIFY-001a: 자동 새 그룹 생성 조건 판단
          const shouldCreateNewGroup = (() => {
            if (forceNewGroup) return true;
            if (!lastPendingGroup) return false;

            const newTile = parseTileCode(tileCode);
            const existingTiles = lastPendingGroup.tiles
              .filter((t) => t !== "JK1" && t !== "JK2")
              .map((t) => parseTileCode(t));

            if (existingTiles.length === 0 || newTile.isJoker) return false;

            const existingNumbers = new Set(existingTiles.map((t) => t.number));
            const isGroupCandidate = existingNumbers.size === 1;

            const existingColors = new Set(existingTiles.map((t) => t.color));
            const isRunCandidate = existingColors.size === 1;

            if (isGroupCandidate && isRunCandidate) {
              const refNumber = existingTiles[0].number;
              const refColor = existingTiles[0].color;
              const numberMatches = newTile.number === refNumber;
              const colorMatches = newTile.color === refColor;
              if (!numberMatches && !colorMatches) return true;
              if (!numberMatches && colorMatches) {
                if (newTile.number === null) return false;
                const refNum = refNumber ?? 0;
                if (Math.abs(newTile.number - refNum) !== 1) return true;
              }
            }

            if (isGroupCandidate && !isRunCandidate) {
              const groupNumber = existingTiles[0].number;
              if (newTile.number !== groupNumber) return true;
              if (existingColors.has(newTile.color)) return true;
              if (lastPendingGroup.tiles.length >= 4) return true;
            }

            if (isRunCandidate && !isGroupCandidate) {
              const runColor = existingTiles[0].color;
              if (newTile.color !== runColor) return true;
              if (newTile.number !== null) {
                const allNums = existingTiles
                  .map((t) => t.number)
                  .filter((n): n is TileNumber => n !== null);
                allNums.push(newTile.number);
                allNums.sort((a, b) => a - b);
                for (let i = 1; i < allNums.length; i++) {
                  if (allNums[i] - allNums[i - 1] !== 1) return true;
                }
              }
            }

            if (!isGroupCandidate && !isRunCandidate) return true;

            return false;
          })();

          const effectiveShouldCreate = shouldCreateNewGroup
            && lastPendingGroup
            ? !isCompatibleWithGroup(tileCode, lastPendingGroup)
            : shouldCreateNewGroup;

          if (lastPendingGroup && !effectiveShouldCreate) {
            const updatedTiles = [...lastPendingGroup.tiles, tileCode];
            const nextTableGroups = freshTableGroups.map((g) =>
              g.id === lastPendingGroup.id
                ? { ...g, tiles: updatedTiles, type: classifySetType(updatedTiles) }
                : g
            );
            const nextMyTiles = removeFirstOccurrence(freshMyTiles, tileCode);
            const isJokerRecovered = freshPendingRecoveredJokers.includes(tileCode);
            {
              const nextPendingRecoveredJokers = isJokerRecovered
                ? freshPendingRecoveredJokers.filter((j) => j !== tileCode)
                : freshPendingRecoveredJokers;
              usePendingStore.getState().applyMutation({
                nextTableGroups,
                nextMyTiles,
                nextPendingGroupIds: freshPendingGroupIds,
                nextPendingRecoveredJokers,
                nextPendingGroupSeq: pendingGroupSeqRef.current,
                ...(isJokerRecovered ? { removedJoker: tileCode } : {}),
                branch: "hook-board→last-pending:append",
              });
            }
          } else {
            pendingGroupSeqRef.current += 1;
            const newGroupId = `pending-${Date.now()}-${pendingGroupSeqRef.current}`;
            const newGroup: TableGroup = {
              id: newGroupId,
              tiles: [tileCode],
              type: classifySetType([tileCode]),
            };
            const nextTableGroups = [...freshTableGroups, newGroup];
            if (process.env.NODE_ENV !== "production") {
              const ids = nextTableGroups.map((g) => g.id);
              if (new Set(ids).size !== ids.length) {
                console.error("[BUG-UI-REARRANGE-002] 그룹 ID 중복 감지", ids);
              }
            }
            const nextMyTiles = removeFirstOccurrence(freshMyTiles, tileCode);
            // forceNewGroup 토글 리셋 (사용자 수동 토글 유지가 의도이므로 true 인 경우에만)
            if (forceNewGroup && setForceNewGroup) setForceNewGroup(false);
            const isJokerRecovered = freshPendingRecoveredJokers.includes(tileCode);
            {
              const nextPendingGroupIds = new Set([
                ...freshPendingGroupIds,
                newGroupId,
              ]);
              const nextPendingRecoveredJokers = isJokerRecovered
                ? freshPendingRecoveredJokers.filter((j) => j !== tileCode)
                : freshPendingRecoveredJokers;
              usePendingStore.getState().applyMutation({
                nextTableGroups,
                nextMyTiles,
                nextPendingGroupIds,
                nextPendingRecoveredJokers,
                nextPendingGroupSeq: pendingGroupSeqRef.current,
                ...(isJokerRecovered ? { removedJoker: tileCode } : {}),
                branch: "hook-board→new-group:auto",
              });
            }
          }
          turnTransition("DROP_OK");
          clearActive();
          return;
        } else if (over.id === "game-board-new-group") {
          // G-5: 새 그룹 드롭존 직접 드롭 → 무조건 새 그룹
          pendingGroupSeqRef.current += 1;
          const newGroupId = `pending-${Date.now()}-${pendingGroupSeqRef.current}`;
          const newGroup: TableGroup = {
            id: newGroupId,
            tiles: [tileCode],
            type: classifySetType([tileCode]),
          };
          const nextTableGroups = [...freshTableGroups, newGroup];
          if (process.env.NODE_ENV !== "production") {
            const ids = nextTableGroups.map((g) => g.id);
            if (new Set(ids).size !== ids.length) {
              console.error(
                "[BUG-UI-REARRANGE-002] 그룹 ID 중복 감지 (new-group-dropzone)",
                ids
              );
            }
          }
          const nextMyTiles = removeFirstOccurrence(freshMyTiles, tileCode);
          const isJokerRecovered = freshPendingRecoveredJokers.includes(tileCode);
          {
            const nextPendingGroupIds = new Set([
              ...freshPendingGroupIds,
              newGroupId,
            ]);
            const nextPendingRecoveredJokers = isJokerRecovered
              ? freshPendingRecoveredJokers.filter((j) => j !== tileCode)
              : freshPendingRecoveredJokers;
            usePendingStore.getState().applyMutation({
              nextTableGroups,
              nextMyTiles,
              nextPendingGroupIds,
              nextPendingRecoveredJokers,
              nextPendingGroupSeq: pendingGroupSeqRef.current,
              ...(isJokerRecovered ? { removedJoker: tileCode } : {}),
              branch: "hook-new-group-dropzone:force",
            });
          }
          turnTransition("DROP_OK");
          clearActive();
          return;
        } else if (over.id === "player-rack") {
          // 보드 → 랙: pending 그룹에 실제로 있는 타일만 회수
          if (freshPendingTableGroups) {
            const sourceGroupIdx = freshPendingTableGroups.findIndex(
              (g) =>
                freshPendingGroupIds.has(g.id) && g.tiles.includes(tileCode)
            );
            if (sourceGroupIdx < 0) {
              clearActive();
              return;
            }

            // BUG-UI-006(G-3): removeFirstOccurrence 로 1개만 정확히 제거
            const updated = freshPendingTableGroups
              .map((g, idx) => {
                if (idx !== sourceGroupIdx) return g;
                return { ...g, tiles: removeFirstOccurrence(g.tiles, tileCode) };
              })
              .filter((g) => g.tiles.length > 0);

            const stillHasPending = updated.some((g) =>
              freshPendingGroupIds.has(g.id)
            );
            const nextMyTiles = [...freshMyTiles, tileCode];
            {
              const nextGroupIds = stillHasPending
                ? new Set(
                    [...freshPendingGroupIds].filter((id) =>
                      updated.some((g) => g.id === id)
                    )
                  )
                : new Set<string>();
              usePendingStore.getState().applyMutation({
                nextTableGroups: stillHasPending ? updated : null,
                nextMyTiles,
                nextPendingGroupIds: nextGroupIds,
                nextPendingRecoveredJokers: freshPendingRecoveredJokers,
                nextPendingGroupSeq: pendingGroupSeqRef.current,
                branch: "hook-board→rack:recover-pending-tile",
              });
            }
            turnTransition("DROP_OK");
          }
          clearActive();
          return;
        }

        // 어느 분기에도 해당하지 않음 → 안전 fallback (취소 처리)
        clearActive();
        turnTransition("DRAG_CANCEL");
      } finally {
        // BUG-UI-009: queueMicrotask 로 unlock — React commit 이후 해제
        queueMicrotask(() => {
          isHandlingDragEndRef.current = false;
        });
      }
    },
    [
      clearActive,
      turnTransition,
      forceNewGroup,
      setForceNewGroup,
      isMyTurn,
      isHandlingDragEndRef,
      lastDragEndTimestampRef,
      pendingGroupSeqRef,
      extendLockToastShownRef,
      showExtendLockToast,
      activeDragSourceRef,
      setActiveDragCode,
    ]
  );

  return {
    handleDragStart,
    handleDragEnd,
    handleDragCancel,
  };
}

// 의존성 주입용 deps 타입 재export (테스트에서 mock 사용)
export { isCompatibleWithGroup, computeValidMergeGroups, computePendingScore };
