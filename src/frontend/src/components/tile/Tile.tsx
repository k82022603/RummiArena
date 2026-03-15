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
 * - 조커 타일: 무지개 그라디언트 border + 별표 심볼 강조
 * - 선택된 타일: 위로 이동 + 상단에 "⬆" 배지 표시
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

  // 조커: 무지개 그라디언트 ring
  const jokerRingClass = tile.isJoker
    ? "ring-2 ring-offset-1 ring-offset-transparent"
    : "";

  const borderClass = invalid
    ? "ring-2 ring-danger"
    : selected
      ? "ring-2 ring-border-active"
      : jokerRingClass;

  const label =
    ariaLabel ??
    (tile.isJoker ? "조커" : `${tile.color}${tile.number} 타일`);

  // 조커 타일에 무지개 ring 색상을 인라인으로 지정
  const jokerStyle = tile.isJoker
    ? { boxShadow: "0 0 0 2px transparent, 0 0 0 3px #c084fc, 0 0 8px 2px rgba(192,132,252,0.5)" }
    : undefined;

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
      style={jokerStyle}
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
      {/* 선택됨 배지: 상단 우측에 "⬆" 표시 (mini 크기 제외) */}
      {selected && size !== "mini" && (
        <span
          aria-hidden="true"
          className="absolute -top-1 -right-1 text-[8px] bg-border-active text-white rounded-full w-3.5 h-3.5 flex items-center justify-center leading-none z-10"
        >
          ⬆
        </span>
      )}

      {/* 조커 별표 강조 (상단 우측, 크기가 작지 않을 때) */}
      {tile.isJoker && size !== "mini" && (
        <span
          aria-hidden="true"
          className="absolute -top-1 -right-1 text-[9px] text-yellow-300 drop-shadow-[0_0_4px_rgba(253,224,71,0.8)] z-10"
        >
          ★
        </span>
      )}

      {/* 숫자 (조커는 빈칸) */}
      {tile.isJoker ? (
        <span aria-hidden="true" className="text-sm font-bold drop-shadow-sm">
          JK
        </span>
      ) : (
        <span aria-hidden="true">{tile.number}</span>
      )}

      {/* 접근성 심볼 (좌하단, mini 크기에서는 생략) */}
      {size !== "mini" && (
        <span
          aria-hidden="true"
          className={[
            "absolute bottom-0.5 left-0.5 text-[8px] opacity-60",
            tile.isJoker ? "text-yellow-200 opacity-80" : "",
          ]
            .filter(Boolean)
            .join(" ")}
        >
          {symbol}
        </span>
      )}
    </motion.button>
  );
});

Tile.displayName = "Tile";

export default Tile;
