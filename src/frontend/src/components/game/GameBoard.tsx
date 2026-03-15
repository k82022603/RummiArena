"use client";

import React, { memo } from "react";
import { useDroppable } from "@dnd-kit/core";
import { motion, AnimatePresence } from "framer-motion";
import type { TableGroup } from "@/types/tile";
import Tile from "@/components/tile/Tile";

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
  className?: string;
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
  className = "",
}: GameBoardProps) {
  const { setNodeRef, isOver } = useDroppable({ id: BOARD_DROP_ID });

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
        <div className="flex flex-wrap gap-4">
          <AnimatePresence>
            {tableGroups.map((group) => {
              const isPending = pendingGroupIds.has(group.id);
              const tileCount = group.tiles.length;
              return (
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
                      isPending
                        ? "bg-yellow-400/10 border border-dashed border-yellow-400"
                        : "bg-black/20 border border-board-border",
                    ].join(" ")}
                  >
                    {group.tiles.map((code, idx) => (
                      <Tile
                        key={`${group.id}-${code}-${idx}`}
                        code={code}
                        size="table"
                        aria-label={`${group.type} 그룹의 ${code} 타일${isPending ? " (미확정)" : ""}`}
                      />
                    ))}
                  </div>
                </motion.div>
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
