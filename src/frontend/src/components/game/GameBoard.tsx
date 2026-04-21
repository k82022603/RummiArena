"use client";

import React, { memo, useMemo } from "react";
import { useDroppable } from "@dnd-kit/core";
import { motion, AnimatePresence } from "framer-motion";
import type { TableGroup, TileCode, TileNumber } from "@/types/tile";
import { parseTileCode } from "@/types/tile";
import Tile, { type TileHighlightVariant } from "@/components/tile/Tile";
import DraggableTile from "@/components/tile/DraggableTile";

/**
 * 그룹 내 동일 색상 타일 중복 감지
 * 같은 색상 타일이 2개 이상이면 경고를 반환한다.
 * (그룹 타입에서만 의미 있지만, 런에서도 같은 색상+같은 숫자 중복은 항상 무효)
 */
function detectDuplicateColors(tiles: string[]): string | null {
  const regular = tiles.filter((t) => t !== "JK1" && t !== "JK2");
  if (regular.length < 2) return null;

  const parsed = regular.map((t) => parseTileCode(t as import("@/types/tile").TileCode));
  const colorCount = new Map<string, number>();
  for (const tile of parsed) {
    const c = tile.color as string;
    colorCount.set(c, (colorCount.get(c) ?? 0) + 1);
  }

  const duplicates: string[] = [];
  const COLOR_LABEL: Record<string, string> = { R: "빨강", B: "파랑", Y: "노랑", K: "검정" };
  for (const [color, count] of colorCount) {
    if (count >= 2) {
      duplicates.push(COLOR_LABEL[color] ?? color);
    }
  }

  if (duplicates.length > 0) {
    return `같은 색상(${duplicates.join(", ")}) 중복!`;
  }
  return null;
}

// ------------------------------------------------------------------
// G-1: pending 블록 실시간 유효성 판정
//
// 반환 값:
//   "valid-run"   — 유효한 런 (같은 색, 연속 숫자, 3개 이상)
//   "valid-group" — 유효한 그룹 (같은 숫자, 다른 색, 3~4개)
//   "partial"     — 2개 이하 (아직 판정 불가, 미완성 상태)
//   "invalid"     — 규칙 위반 (색 혼합+비연속, 색 중복, 숫자 비일치 등)
// ------------------------------------------------------------------
export type PendingBlockValidity = "valid-run" | "valid-group" | "partial" | "invalid";

export function validatePendingBlock(tiles: TileCode[]): PendingBlockValidity {
  const regular = tiles.filter((t) => t !== "JK1" && t !== "JK2");

  // 타일이 2개 이하면 partial (조커 포함 2장 = 아직 판단 불가)
  if (tiles.length < 3) return "partial";

  // 조커만으로 구성된 경우는 partial
  if (regular.length === 0) return "partial";

  const parsed = regular.map((t) => parseTileCode(t));
  const numbers = parsed.map((t) => t.number).filter((n): n is TileNumber => n !== null);
  const colors = parsed.map((t) => t.color);
  const uniqueNumbers = new Set(numbers);
  const uniqueColors = new Set(colors);

  // 그룹 판정: 모든 비조커 타일의 숫자가 같아야 함
  if (uniqueNumbers.size === 1) {
    // 그룹: 색상 중복이 있으면 무효
    if (uniqueColors.size !== colors.length) return "invalid";
    // 그룹 최대 4개
    if (tiles.length > 4) return "invalid";
    return "valid-group";
  }

  // 런 판정: 모든 비조커 타일의 색상이 같아야 함
  if (uniqueColors.size === 1) {
    // 런: 조커를 고려하여 연속 숫자 검증
    const sortedNums = numbers.slice().sort((a, b) => a - b);
    const jokerCount = tiles.length - regular.length;
    // 최소~최대 범위가 (타일 수 - 1) 이하이면 연속 (조커가 빈 슬롯을 채움)
    const span = sortedNums[sortedNums.length - 1] - sortedNums[0];
    if (span > tiles.length - 1) return "invalid";
    // 중복 숫자 검사 (조커 제외)
    if (uniqueNumbers.size < numbers.length) return "invalid";
    // 조커 개수가 범위 내 빈 슬롯 수보다 많은지 확인
    const gaps = span + 1 - numbers.length;
    if (jokerCount < gaps) return "invalid";
    return "valid-run";
  }

  // 색도 숫자도 일치하지 않으면 무효
  return "invalid";
}

interface GameBoardProps {
  tableGroups: TableGroup[];
  isMyTurn: boolean;
  /** 현재 드래그 중 타일이 있는지 여부 (DragOverlay 활성 여부) */
  isDragging?: boolean;
  /**
   * 이번 턴에 새로 추가된(서버 미확정) 그룹 ID 세트.
   * 여기에 포함된 그룹은 반투명 + 노란 점선 테두리(프리뷰)로 표시된다.
   */
  pendingGroupIds?: Set<string>;
  /**
   * G-2: 확정 실패 시 무효로 판정된 pending 그룹 ID 세트.
   * 포함된 그룹은 빨간 ring + shake 애니메이션으로 강조된다.
   * 사용자가 해당 그룹을 수정하기 전까지 유지된다.
   */
  invalidPendingGroupIds?: Set<string>;
  /**
   * 최근 턴에 배치된 타일 코드 세트 (UX 개선: 누가 방금 놓았는지 시각화).
   * 여기에 포함된 타일은 highlightVariant에 따라 glow 효과가 적용된다.
   */
  recentTileCodes?: Set<string>;
  /** 최근 턴 하이라이트 색상 (mine=녹색, opponent=주황) */
  recentTileVariant?: TileHighlightVariant;
  /** true이면 각 그룹도 droppable zone으로 등록 (연습 모드에서 그룹 합치기 지원) */
  groupsDroppable?: boolean;
  /**
   * true이면 테이블 위 타일을 드래그 원점으로 사용할 수 있다 (§6.2 유형 1/3 재배치 UX).
   * 최초 등록 완료 전에는 pending 그룹의 타일만 되돌릴 수 있도록 false로 둔다.
   */
  tilesDraggable?: boolean;
  /**
   * P2-2: 현재 드래그 중인 타일이 유효하게 머지될 수 있는 그룹 ID 집합.
   * 드래그 중일 때만 의미 있으며, 포함된 그룹은 녹색 pulse ring으로 강조된다.
   */
  validMergeGroupIds?: Set<string>;
  className?: string;
}

/** 그룹 하나를 droppable zone으로 래핑하는 서브 컴포넌트 */
function DroppableGroupWrapper({
  groupId,
  isCompatible,
  children,
}: {
  groupId: string;
  isCompatible?: boolean;
  children: React.ReactNode;
}) {
  const { setNodeRef, isOver } = useDroppable({ id: groupId });
  const ringClass = isOver
    ? "ring-2 ring-green-400/80 rounded-lg"
    : isCompatible
      ? "ring-2 ring-green-400/40 rounded-lg animate-pulse"
      : undefined;
  return (
    <div ref={setNodeRef} className={ringClass}>
      {children}
    </div>
  );
}

const BOARD_DROP_ID = "game-board";

/**
 * 게임 테이블 보드 컴포넌트
 * - 현재 테이블 위의 모든 타일 그룹 표시
 * - Droppable 영역 (내 타일을 이곳에 드롭)
 * - 드래그 중: 내 턴이면 초록 테두리, 아니면 빨강 테두리로 드롭 가능 여부 표시
 * - 그룹 구분선과 run/group 레이블 표시
 */
const GameBoard = memo(function GameBoard({
  tableGroups,
  isMyTurn,
  isDragging = false,
  pendingGroupIds = new Set<string>(),
  invalidPendingGroupIds = new Set<string>(),
  recentTileCodes,
  recentTileVariant = null,
  groupsDroppable = false,
  tilesDraggable = false,
  validMergeGroupIds,
  className = "",
}: GameBoardProps) {
  const { setNodeRef, isOver } = useDroppable({ id: BOARD_DROP_ID });

  // 그룹별 동일 색상 중복 경고 맵 (메모이제이션)
  // BUG-UI-CLASSIFY-001b: 런에는 같은 색상이 정상이므로 그룹 타입에만 적용
  const duplicateColorWarnings = useMemo(() => {
    const warnings: Record<string, string> = {};
    for (const group of tableGroups) {
      if (group.type !== "group") continue;
      const warning = detectDuplicateColors(group.tiles);
      if (warning) {
        warnings[group.id] = warning;
      }
    }
    return warnings;
  }, [tableGroups]);

  // G-1: pending 블록별 실시간 유효성 판정 맵
  const pendingBlockValidity = useMemo(() => {
    const result: Record<string, PendingBlockValidity> = {};
    for (const group of tableGroups) {
      if (!pendingGroupIds.has(group.id)) continue;
      result[group.id] = validatePendingBlock(group.tiles as TileCode[]);
    }
    return result;
  }, [tableGroups, pendingGroupIds]);

  // 드롭 존 테두리 상태 계산
  // - 드래그 중 + 내 턴 + 오버: 초록 강조
  // - 드래그 중 + 내 턴 (오버 안 함): 초록 점선 힌트
  // - 드래그 중 + 내 턴 아님: 빨강 (드롭 불가)
  // - 기본: 보드 테두리
  const borderClass = (() => {
    if (!isDragging) return "border-board-border";
    if (!isMyTurn) return "border-danger/70";
    if (isOver) return "border-green-400 shadow-[0_0_12px_2px_rgba(74,222,128,0.35)]";
    return "border-green-500/50 border-dashed";
  })();

  const bgOverlayClass =
    isDragging && isMyTurn && isOver ? "bg-green-500/5" : "";

  return (
    <section
      aria-label="게임 테이블"
      ref={setNodeRef}
      className={[
        "flex-1 p-4 rounded-xl overflow-auto",
        "bg-board-bg border-2",
        borderClass,
        bgOverlayClass,
        "min-h-[300px] transition-all duration-150",
        className,
      ]
        .filter(Boolean)
        .join(" ")}
    >
      <h2 className="sr-only">게임 테이블 ({tableGroups.length}개 그룹)</h2>

      {/* 드래그 중 + 내 턴: 드롭 힌트 오버레이 텍스트 */}
      <AnimatePresence>
        {isDragging && isMyTurn && tableGroups.length === 0 && (
          <motion.div
            key="drop-hint"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="flex items-center justify-center h-full"
          >
            <span className="text-green-400/70 text-tile-base font-medium">
              여기에 내려놓기
            </span>
          </motion.div>
        )}
      </AnimatePresence>

      {tableGroups.length === 0 && !isDragging ? (
        /* 빈 보드 플레이스홀더 */
        <div className="flex flex-col items-center justify-center h-full gap-3 pointer-events-none select-none">
          <div className="w-16 h-16 rounded-2xl border-2 border-dashed border-board-border/50 flex items-center justify-center">
            <span className="text-3xl text-board-border/40" aria-hidden="true">+</span>
          </div>
          <p className="text-text-secondary text-tile-sm font-medium">
            타일을 여기에 드롭하세요
          </p>
          <p className="text-text-secondary/50 text-tile-xs">
            랙에서 타일을 끌어다 테이블에 올려놓으세요
          </p>
        </div>
      ) : (
        <div className="flex flex-wrap gap-6">
          <AnimatePresence>
            {tableGroups.map((group) => {
              const isPending = pendingGroupIds.has(group.id);
              const tileCount = group.tiles.length;
              const colorWarning = duplicateColorWarnings[group.id] ?? null;

              // G-1: pending 블록 유효성 판정
              const validity = isPending
                ? (pendingBlockValidity[group.id] ?? "partial")
                : null;
              const isInvalidBlock = validity === "invalid";

              // G-2: 확정 실패로 명시적으로 무효 지정된 그룹
              const isExplicitlyInvalid = invalidPendingGroupIds.has(group.id);
              const showErrorRing = isPending && (isInvalidBlock || isExplicitlyInvalid);

              // G-1: 라벨 텍스트 결정
              const pendingLabelText = (() => {
                if (!isPending) return null;
                if (validity === "valid-run") return "런 (미확정)";
                if (validity === "valid-group") return "그룹 (미확정)";
                if (validity === "partial") {
                  return group.type === "run" ? "런 (미확정)" : "그룹 (미확정)";
                }
                return "무효 세트";
              })();

              const groupContent = (
                <motion.div
                  key={group.id}
                  layout
                  initial={{ opacity: 0, scale: 0.8 }}
                  animate={
                    showErrorRing
                      ? {
                          opacity: 1,
                          scale: 1,
                          x: [0, -6, 6, -4, 4, -2, 2, 0],
                        }
                      : { opacity: isPending ? 0.55 : 1, scale: 1, x: 0 }
                  }
                  exit={{ opacity: 0, scale: 0.8 }}
                  transition={
                    showErrorRing
                      ? {
                          x: { duration: 0.3, ease: "easeInOut" },
                          opacity: { duration: 0 },
                          scale: { duration: 0 },
                        }
                      : { type: "spring", stiffness: 300, damping: 25 }
                  }
                  className="flex flex-col gap-1"
                  aria-label={
                    isPending
                      ? `미확정 ${group.type === "run" ? "런" : "그룹"} (제출 대기 중)`
                      : undefined
                  }
                >
                  {/* 그룹 타입 레이블 + 타일 수 배지 */}
                  <div className="flex items-center gap-1.5">
                    <span
                      className={[
                        "text-tile-xs uppercase tracking-wider",
                        isPending && isInvalidBlock
                          ? "text-red-400 font-semibold"
                          : isPending
                          ? "text-yellow-400 font-semibold"
                          : "text-text-secondary",
                      ].join(" ")}
                    >
                      {isPending
                        ? pendingLabelText
                        : group.type === "run"
                        ? "런"
                        : "그룹"}
                    </span>
                    {/* 타일 수 배지 */}
                    <span
                      className={[
                        "text-[9px] font-bold px-1 py-0.5 rounded-full leading-none min-w-[18px] text-center",
                        isPending && isInvalidBlock
                          ? "bg-red-400/20 text-red-300"
                          : isPending
                          ? "bg-yellow-400/20 text-yellow-300"
                          : "bg-board-border/30 text-text-secondary",
                      ].join(" ")}
                      aria-label={`${tileCount}개 타일`}
                    >
                      {tileCount}개
                    </span>
                  </div>

                  {/* 타일 목록 */}
                  <div
                    className={[
                      "flex gap-0.5 p-1.5 rounded-lg",
                      showErrorRing
                        ? "bg-red-500/10 border-2 border-red-400/60 ring-2 ring-red-400"
                        : isPending && colorWarning
                        ? "bg-red-500/10 border-2 border-red-500/70"
                        : isPending
                        ? "bg-yellow-400/10 border border-dashed border-yellow-400"
                        : "bg-black/20 border border-board-border",
                    ].join(" ")}
                  >
                    {group.tiles.map((code, idx) => {
                      const isRecent = !isPending && recentTileCodes?.has(code);
                      if (tilesDraggable) {
                        return (
                          <DraggableTile
                            key={`${group.id}-${code}-${idx}`}
                            id={`table-${group.id}-${idx}`}
                            code={code as TileCode}
                            size="table"
                            dragData={{
                              source: "table",
                              groupId: group.id,
                              index: idx,
                            }}
                          />
                        );
                      }
                      return (
                        <Tile
                          key={`${group.id}-${code}-${idx}`}
                          code={code}
                          size="table"
                          highlightVariant={isRecent ? recentTileVariant : null}
                          aria-label={`${group.type} 그룹의 ${code} 타일${isPending ? " (미확정)" : ""}${isRecent ? " (방금 배치됨)" : ""}`}
                        />
                      );
                    })}
                  </div>

                  {/* 동일 색상 중복 경고: m-3: pending 그룹에서만 표시 (invalid 라벨과 중복 방지) */}
                  {isPending && colorWarning && !isInvalidBlock && (
                    <span
                      className="text-[10px] text-red-400 font-medium"
                      role="alert"
                    >
                      {colorWarning}
                    </span>
                  )}
                  {/* G-1: 무효 세트 상세 경고 */}
                  {isPending && isInvalidBlock && (
                    <span
                      className="text-[10px] text-red-400 font-medium"
                      role="alert"
                    >
                      색 혼합 또는 숫자 불연속
                    </span>
                  )}
                </motion.div>
              );
              return groupsDroppable ? (
                <DroppableGroupWrapper
                  key={group.id}
                  groupId={group.id}
                  isCompatible={
                    isDragging && !!validMergeGroupIds?.has(group.id)
                  }
                >
                  {groupContent}
                </DroppableGroupWrapper>
              ) : (
                groupContent
              );
            })}
          </AnimatePresence>
        </div>
      )}
    </section>
  );
});

GameBoard.displayName = "GameBoard";

export default GameBoard;
