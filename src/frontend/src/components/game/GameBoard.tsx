"use client";

import React, { memo } from "react";
import { useDroppable } from "@dnd-kit/core";
import { motion, AnimatePresence } from "framer-motion";
import type { TableGroup } from "@/types/tile";
import Tile from "@/components/tile/Tile";

interface GameBoardProps {
  tableGroups: TableGroup[];
  isMyTurn: boolean;
  className?: string;
}

const BOARD_DROP_ID = "game-board";

/**
 * 게임 테이블 보드 컴포넌트
 * - 현재 테이블 위의 모든 타일 그룹 표시
 * - Droppable 영역 (내 타일을 이곳에 드롭)
 * - 그룹 구분선과 run/group 레이블 표시
 */
const GameBoard = memo(function GameBoard({
  tableGroups,
  isMyTurn,
  className = "",
}: GameBoardProps) {
  const { setNodeRef, isOver } = useDroppable({ id: BOARD_DROP_ID });

  return (
    <section
      aria-label="게임 테이블"
      ref={setNodeRef}
      className={[
        "flex-1 p-4 rounded-xl overflow-auto",
        "bg-board-bg border-2",
        isOver && isMyTurn ? "border-border-active" : "border-board-border",
        "min-h-[300px] transition-colors",
        className,
      ].join(" ")}
    >
      <h2 className="sr-only">게임 테이블 ({tableGroups.length}개 그룹)</h2>

      {tableGroups.length === 0 ? (
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
