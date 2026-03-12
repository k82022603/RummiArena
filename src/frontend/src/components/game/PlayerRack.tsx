"use client";

import React, { memo } from "react";
import { useDroppable } from "@dnd-kit/core";
import type { TileCode } from "@/types/tile";
import DraggableTile from "@/components/tile/DraggableTile";

interface PlayerRackProps {
  tiles: TileCode[];
  /** 현재 내 턴 여부 */
  isMyTurn: boolean;
  /** 선택된 타일 코드 세트 */
  selectedTiles?: Set<TileCode>;
  className?: string;
}

const RACK_DROP_ID = "player-rack";

/**
 * 내 타일 랙 컴포넌트 (1인칭 뷰 하단)
 * - dnd-kit Droppable (테이블에서 타일 되돌리기 가능)
 * - 내 턴에만 드래그 활성화
 */
const PlayerRack = memo(function PlayerRack({
  tiles,
  isMyTurn,
  selectedTiles = new Set(),
  className = "",
}: PlayerRackProps) {
  const { setNodeRef, isOver } = useDroppable({ id: RACK_DROP_ID });

  return (
    <section
      aria-label="내 타일 랙"
      className={[
        "flex flex-wrap items-center gap-1.5 p-3 rounded-xl",
        "bg-panel-bg border",
        isOver ? "border-border-active" : "border-border",
        "min-h-[80px] transition-colors",
        className,
      ].join(" ")}
      ref={setNodeRef}
    >
      <h2 className="sr-only">내 타일 ({tiles.length}개)</h2>

      {tiles.length === 0 ? (
        <p className="text-text-secondary text-tile-sm w-full text-center py-2">
          타일 없음
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

      <div className="ml-auto text-text-secondary text-tile-sm">
        {tiles.length}장
      </div>
    </section>
  );
});

PlayerRack.displayName = "PlayerRack";

export default PlayerRack;
