"use client";

import React, { memo } from "react";
import { motion } from "framer-motion";
import type { TileCode } from "@/types/tile";
import {
  parseTileCode,
  TILE_COLOR_CLASS,
  TILE_ACCESSIBILITY_SYMBOL,
} from "@/types/tile";

type TileSize = "rack" | "table" | "mini" | "quad" | "icon";

interface TileProps {
  code: TileCode;
  size?: TileSize;
  draggable?: boolean;
  selected?: boolean;
  invalid?: boolean;
  className?: string;
  onClick?: () => void;
  "aria-label"?: string;
}

const SIZE_CLASS: Record<TileSize, string> = {
  rack: "w-[42px] h-[58px] text-tile-xl",
  table: "w-[34px] h-[46px] text-tile-lg",
  mini: "w-[10px] h-[16px] text-[6px]",
  quad: "w-[28px] h-[38px] text-tile-base",
  icon: "w-[20px] h-[26px] text-[10px]",
};

/**
 * 타일 컴포넌트
 *
 * - 색상·심볼 이중 인코딩 (색약 접근성)
 * - Framer Motion 애니메이션
 * - 메모이제이션으로 불필요한 리렌더 방지
 */
const Tile = memo(function Tile({
  code,
  size = "rack",
  draggable = false,
  selected = false,
  invalid = false,
  className = "",
  onClick,
  "aria-label": ariaLabel,
}: TileProps) {
  const tile = parseTileCode(code);
  const colorClass = TILE_COLOR_CLASS[tile.color];
  const symbol = TILE_ACCESSIBILITY_SYMBOL[tile.color];
  const sizeClass = SIZE_CLASS[size];

  const borderClass = invalid
    ? "ring-2 ring-danger"
    : selected
      ? "ring-2 ring-border-active"
      : "";

  const label =
    ariaLabel ??
    (tile.isJoker ? "조커" : `${tile.color}${tile.number} 타일`);

  return (
    <motion.button
      type="button"
      role="img"
      aria-label={label}
      aria-pressed={selected}
      aria-disabled={!draggable && !onClick}
      onClick={onClick}
      whileHover={draggable || onClick ? { scale: 1.08, y: -2 } : undefined}
      whileTap={draggable || onClick ? { scale: 0.95 } : undefined}
      animate={selected ? { y: -6 } : { y: 0 }}
      transition={{ type: "spring", stiffness: 400, damping: 20 }}
      className={[
        "relative flex flex-col items-center justify-center",
        "rounded-md shadow-md select-none",
        "font-mono font-bold leading-none",
        colorClass,
        sizeClass,
        borderClass,
        draggable ? "cursor-grab active:cursor-grabbing" : "",
        onClick ? "cursor-pointer" : "",
        className,
      ]
        .filter(Boolean)
        .join(" ")}
    >
      {/* 숫자 (조커는 빈칸) */}
      {tile.isJoker ? (
        <span aria-hidden="true" className="text-sm font-bold">
          JK
        </span>
      ) : (
        <span aria-hidden="true">{tile.number}</span>
      )}

      {/* 접근성 심볼 (좌하단, mini 크기에서는 생략) */}
      {size !== "mini" && (
        <span
          aria-hidden="true"
          className="absolute bottom-0.5 left-0.5 text-[8px] opacity-60"
        >
          {symbol}
        </span>
      )}
    </motion.button>
  );
});

Tile.displayName = "Tile";

export default Tile;
