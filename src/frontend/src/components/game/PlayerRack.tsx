"use client";

import React, { memo, useCallback, useMemo } from "react";
import { useDroppable } from "@dnd-kit/core";
import { motion, AnimatePresence } from "framer-motion";
import type { TileCode } from "@/types/tile";
import { parseTileCode } from "@/types/tile";
import DraggableTile from "@/components/tile/DraggableTile";

interface PlayerRackProps {
  tiles: TileCode[];
  /** 현재 내 턴 여부 */
  isMyTurn: boolean;
  /** 선택된 타일 코드 세트 */
  selectedTiles?: Set<TileCode>;
  /** 현재 드래그 중 타일이 있는지 여부 */
  isDragging?: boolean;
  /** 타일 정렬 콜백 (정렬된 타일 목록을 상위로 전달) */
  onSort?: (sorted: TileCode[]) => void;
  className?: string;
}

const RACK_DROP_ID = "player-rack";

/**
 * 타일 정렬 함수
 * - 일반 타일: 숫자 오름차순 → 같은 숫자 내에서 색상 알파벳순
 * - 조커: 항상 마지막
 */
function sortTiles(tiles: TileCode[]): TileCode[] {
  return [...tiles].sort((a, b) => {
    const ta = parseTileCode(a);
    const tb = parseTileCode(b);

    // 조커는 항상 뒤
    if (ta.isJoker && tb.isJoker) return 0;
    if (ta.isJoker) return 1;
    if (tb.isJoker) return -1;

    // 숫자 오름차순
    const numA = ta.number ?? 0;
    const numB = tb.number ?? 0;
    if (numA !== numB) return numA - numB;

    // 같은 숫자면 색상 알파벳순 (B, K, R, Y)
    return (ta.color as string).localeCompare(tb.color as string);
  });
}

/**
 * 내 타일 랙 컴포넌트 (1인칭 뷰 하단)
 * - dnd-kit Droppable (테이블에서 타일 되돌리기 가능)
 * - 내 턴에만 드래그 활성화
 * - 정렬 버튼으로 숫자 오름차순 정렬 (조커 마지막)
 * - 드래그 중 되돌리기 힌트 표시
 */
const PlayerRack = memo(function PlayerRack({
  tiles,
  isMyTurn,
  selectedTiles = new Set(),
  isDragging = false,
  onSort,
  className = "",
}: PlayerRackProps) {
  const { setNodeRef, isOver } = useDroppable({ id: RACK_DROP_ID });

  const handleSort = useCallback(() => {
    if (!onSort) return;
    const sorted = sortTiles(tiles);
    onSort(sorted);
  }, [tiles, onSort]);

  // 이미 정렬되어 있는지 확인 (정렬 버튼 비활성화 조건)
  const isSorted = useMemo(() => {
    const sorted = sortTiles(tiles);
    return sorted.every((code, i) => code === tiles[i]);
  }, [tiles]);

  // 드롭 존 테두리 계산
  // - 드래그 중 + 오버: 파란 강조
  // - 드래그 중 (오버 안 함): 점선 힌트
  // - 기본: 일반 테두리
  const borderClass = (() => {
    if (!isDragging) return isOver ? "border-border-active" : "border-border";
    if (isOver) return "border-blue-400 shadow-[0_0_10px_2px_rgba(96,165,250,0.3)]";
    return "border-blue-500/40 border-dashed";
  })();

  return (
    <section
      aria-label="내 타일 랙"
      ref={setNodeRef}
      className={[
        "rounded-xl",
        "bg-panel-bg border",
        borderClass,
        "min-h-[80px] transition-all duration-150",
        className,
      ].join(" ")}
    >
      <h2 className="sr-only">내 타일 ({tiles.length}개)</h2>

      {/* 랙 헤더: 정렬 버튼 */}
      <div className="flex items-center justify-between px-3 pt-2 pb-1">
        <span className="text-tile-xs text-text-secondary">
          랙{" "}
          <span className="text-text-primary font-mono">{tiles.length}</span>장
        </span>

        {/* 정렬 버튼: 내 턴이고 타일이 2개 이상일 때만 활성 */}
        <AnimatePresence>
          {isMyTurn && tiles.length >= 2 && (
            <motion.button
              key="sort-btn"
              type="button"
              initial={{ opacity: 0, scale: 0.8 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.8 }}
              transition={{ type: "spring", stiffness: 400, damping: 20 }}
              onClick={handleSort}
              disabled={isSorted || !onSort}
              aria-label="타일 숫자 오름차순 정렬"
              className={[
                "flex items-center gap-1 px-2.5 py-1 rounded-lg text-tile-xs font-medium",
                "border transition-colors",
                isSorted || !onSort
                  ? "border-border text-text-secondary opacity-40 cursor-not-allowed"
                  : "border-border-active text-border-active hover:bg-border-active/10 cursor-pointer",
              ].join(" ")}
            >
              <span aria-hidden="true">↑↓</span>
              정렬
            </motion.button>
          )}
        </AnimatePresence>
      </div>

      {/* 타일 목록 */}
      <div className="flex flex-wrap items-center gap-1.5 p-3 pt-1">
        {tiles.length === 0 ? (
          <p className="text-text-secondary text-tile-sm w-full text-center py-2">
            {isDragging ? "여기로 되돌리기" : "타일 없음"}
          </p>
        ) : (
          tiles.map((code, idx) => (
            <DraggableTile
              key={`rack-${code}-${idx}`}
              id={`rack-${code}-${idx}`}
              code={code}
              size="rack"
              selected={selectedTiles.has(code)}
              disabled={!isMyTurn}
              dragData={{ source: "rack", index: idx }}
            />
          ))
        )}
      </div>
    </section>
  );
});

PlayerRack.displayName = "PlayerRack";

export default PlayerRack;
