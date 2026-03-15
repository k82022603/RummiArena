"use client";

import React, { memo } from "react";
import { useDraggable } from "@dnd-kit/core";
import type { TileCode } from "@/types/tile";
import { parseTileCode } from "@/types/tile";
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
 * - 드래그 중 원래 위치: 반투명 + 점선 테두리 고스트로 표시
 * - DragOverlay에 실제 타일이 렌더링됨 (scale 1.1 + 강화 그림자)
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

  const tile = parseTileCode(code);

  // 드래그 중 원본 위치 시각화:
  // - 타일을 반투명 처리하고 점선 테두리로 "빈 자리" 임을 표시
  const sizeStyle: Record<string, string> = {
    rack: "w-[42px] h-[58px]",
    table: "w-[34px] h-[46px]",
    quad: "w-[28px] h-[38px]",
    icon: "w-[20px] h-[26px]",
  };

  if (isDragging) {
    return (
      <div
        ref={setNodeRef}
        className={[
          "rounded-md border-2 border-dashed",
          tile.isJoker
            ? "border-purple-400/50 bg-purple-400/10"
            : "border-border/50 bg-card-bg/20",
          sizeStyle[size] ?? sizeStyle.rack,
          "flex items-center justify-center",
          "pointer-events-none",
        ].join(" ")}
        aria-hidden="true"
        {...listeners}
        {...attributes}
      >
        {/* 점선 박스 내부 희미한 타일 실루엣 */}
        <span className="text-[8px] text-text-secondary/40 font-mono select-none">
          {tile.isJoker ? "JK" : tile.number}
        </span>
      </div>
    );
  }

  return (
    <div
      ref={setNodeRef}
      className="transition-transform duration-100"
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
