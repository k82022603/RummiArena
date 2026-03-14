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
        <div className="flex items-center justify-center h-full text-text-secondary text-tile-base">
          아직 놓인 타일이 없습니다
        </div>
      ) : (
        <div className="flex flex-wrap gap-4">
          <AnimatePresence>
            {tableGroups.map((group) => (
              <motion.div
                key={group.id}
                layout
                initial={{ opacity: 0, scale: 0.8 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.8 }}
                transition={{ type: "spring", stiffness: 300, damping: 25 }}
                className="flex flex-col gap-1"
              >
                {/* 그룹 타입 레이블 */}
                <span className="text-tile-xs text-text-secondary uppercase tracking-wider">
                  {group.type === "run" ? "런" : "그룹"}
                </span>

                {/* 타일 목록 */}
                <div
                  className={[
                    "flex gap-0.5 p-1.5 rounded-lg",
                    "bg-black/20 border border-board-border",
                  ].join(" ")}
                >
                  {group.tiles.map((code, idx) => (
                    <Tile
                      key={`${group.id}-${code}-${idx}`}
                      code={code}
                      size="table"
                      aria-label={`${group.type} 그룹의 ${code} 타일`}
                    />
                  ))}
                </div>
              </motion.div>
            ))}
          </AnimatePresence>
        </div>
      )}
    </section>
  );
});

GameBoard.displayName = "GameBoard";

export default GameBoard;
