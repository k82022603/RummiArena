"use client";

import React, { memo } from "react";
import { useDraggable } from "@dnd-kit/core";
import type { TileCode } from "@/types/tile";
import Tile from "./Tile";

interface DraggableTileProps {
  code: TileCode;
  id: string;
  size?: "rack" | "table" | "quad" | "icon";
  selected?: boolean;
  invalid?: boolean;
  disabled?: boolean;
  /** 드래그 시작 시 함께 이동할 타일 목록 (다중 선택) */
  dragData?: Record<string, unknown>;
}

/**
 * dnd-kit 기반 드래그 가능한 타일
 * - 드래그 중 원래 위치는 반투명 고스트로 표시
 * - DragOverlay에 실제 타일이 렌더링됨
 * - DndContext 내부에서만 사용해야 한다.
 */
const DraggableTile = memo(function DraggableTile({
  code,
  id,
  size = "rack",
  selected = false,
  invalid = false,
  disabled = false,
  dragData,
}: DraggableTileProps) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id,
    data: { tileCode: code, ...dragData },
    disabled,
  });

  return (
    <div
      ref={setNodeRef}
      className={[
        "transition-opacity duration-100",
        isDragging ? "opacity-25 pointer-events-none" : "",
      ]
        .filter(Boolean)
        .join(" ")}
      {...listeners}
      {...attributes}
    >
      <Tile
        code={code}
        size={size}
        draggable={!disabled}
        selected={selected}
        invalid={invalid}
        aria-label={`${code} 타일 (드래그 가능)`}
      />
    </div>
  );
});

DraggableTile.displayName = "DraggableTile";

export default DraggableTile;
