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
 * DndContext 내부에서만 사용해야 한다.
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
  const { attributes, listeners, setNodeRef, isDragging, transform } =
    useDraggable({
      id,
      data: { tileCode: code, ...dragData },
      disabled,
    });

  const style = transform
    ? {
        transform: `translate3d(${transform.x}px, ${transform.y}px, 0)`,
        zIndex: 50,
      }
    : undefined;

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={isDragging ? "opacity-40" : ""}
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
