"use client";

import React, { memo, useMemo } from "react";
import { useDroppable } from "@dnd-kit/core";
import { motion, AnimatePresence } from "framer-motion";
import type { TableGroup } from "@/types/tile";
import { parseTileCode } from "@/types/tile";
import Tile, { type TileHighlightVariant } from "@/components/tile/Tile";

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
   * 최근 턴에 배치된 타일 코드 세트 (UX 개선: 누가 방금 놓았는지 시각화).
   * 여기에 포함된 타일은 highlightVariant에 따라 glow 효과가 적용된다.
   */
  recentTileCodes?: Set<string>;
  /** 최근 턴 하이라이트 색상 (mine=녹색, opponent=주황) */
  recentTileVariant?: TileHighlightVariant;
  /** true이면 각 그룹도 droppable zone으로 등록 (연습 모드에서 그룹 합치기 지원) */
  groupsDroppable?: boolean;
  className?: string;
}

/** 그룹 하나를 droppable zone으로 래핑하는 서브 컴포넌트 */
function DroppableGroupWrapper({
  groupId,
  children,
}: {
  groupId: string;
  children: React.ReactNode;
}) {
  const { setNodeRef, isOver } = useDroppable({ id: groupId });
  return (
    <div
      ref={setNodeRef}
      className={isOver ? "ring-2 ring-green-400/60 rounded-lg" : undefined}
    >
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
  recentTileCodes,
  recentTileVariant = null,
  groupsDroppable = false,
  className = "",
}: GameBoardProps) {
  const { setNodeRef, isOver } = useDroppable({ id: BOARD_DROP_ID });

  // 그룹별 동일 색상 중복 경고 맵 (메모이제이션)
  const duplicateColorWarnings = useMemo(() => {
    const warnings: Record<string, string> = {};
    for (const group of tableGroups) {
      const warning = detectDuplicateColors(group.tiles);
      if (warning) {
        warnings[group.id] = warning;
      }
    }
    return warnings;
  }, [tableGroups]);

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
              const groupContent = (
                <motion.div
                  key={group.id}
                  layout
                  initial={{ opacity: 0, scale: 0.8 }}
                  animate={{ opacity: isPending ? 0.55 : 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.8 }}
                  transition={{ type: "spring", stiffness: 300, damping: 25 }}
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
                        isPending
                          ? "text-yellow-400 font-semibold"
                          : "text-text-secondary",
                      ].join(" ")}
                    >
                      {group.type === "run" ? "런" : "그룹"}
                      {isPending && (
                        <span className="ml-1 text-[9px] normal-case tracking-normal">
                          (미확정)
                        </span>
                      )}
                    </span>
                    {/* 타일 수 배지 */}
                    <span
                      className={[
                        "text-[9px] font-bold px-1 py-0.5 rounded-full leading-none min-w-[18px] text-center",
                        isPending
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
                      isPending && colorWarning
                        ? "bg-red-500/10 border-2 border-red-500/70"
                        : isPending
                        ? "bg-yellow-400/10 border border-dashed border-yellow-400"
                        : "bg-black/20 border border-board-border",
                    ].join(" ")}
                  >
                    {group.tiles.map((code, idx) => {
                      const isRecent = !isPending && recentTileCodes?.has(code);
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

                  {/* 동일 색상 중복 경고: m-3: pending 그룹에서만 표시 */}
                  {isPending && colorWarning && (
                    <span
                      className="text-[10px] text-red-400 font-medium"
                      role="alert"
                    >
                      {colorWarning}
                    </span>
                  )}
                </motion.div>
              );
              return groupsDroppable ? (
                <DroppableGroupWrapper key={group.id} groupId={group.id}>
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
