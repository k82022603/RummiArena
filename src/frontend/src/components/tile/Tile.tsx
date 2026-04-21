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

/**
 * 최근 턴에 배치된 타일 시각적 강조 variant.
 * - "mine": 내가 최근 턴에 놓은 타일 (녹색 글로우)
 * - "opponent": 상대가 최근 턴에 놓은 타일 (주황색 글로우)
 * - null/undefined: 강조 없음
 */
export type TileHighlightVariant = "mine" | "opponent" | null;

interface TileProps {
  code: TileCode;
  size?: TileSize;
  draggable?: boolean;
  selected?: boolean;
  invalid?: boolean;
  highlightVariant?: TileHighlightVariant;
  className?: string;
  onClick?: () => void;
  "aria-label"?: string;
}

const SIZE_CLASS: Record<TileSize, string> = {
  rack: "w-[52px] h-[72px] text-tile-2xl",   // 42x58 → 52x72 (+24%)
  table: "w-[44px] h-[60px] text-tile-xl",   // 34x46 → 44x60 (+24%)
  mini: "w-[10px] h-[16px] text-[6px]",      // 유지
  quad: "w-[34px] h-[46px] text-tile-lg",    // 28x38 → 34x46 (+24%)
  icon: "w-[24px] h-[32px] text-[12px]",     // 20x26 → 24x32 (+24%)
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
  highlightVariant = null,
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

  // 최근 턴 하이라이트 (invalid/selected보다 우선순위 낮음)
  const highlightGlowStyle: React.CSSProperties | undefined =
    highlightVariant === "mine"
      ? { boxShadow: "0 0 0 2px rgba(74,222,128,0.9), 0 0 10px 2px rgba(74,222,128,0.55)" }
      : highlightVariant === "opponent"
        ? { boxShadow: "0 0 0 2px rgba(251,146,60,0.9), 0 0 10px 2px rgba(251,146,60,0.55)" }
        : undefined;

  const label =
    ariaLabel ??
    (tile.isJoker ? "조커" : `${tile.color}${tile.number} 타일`);

  // 조커 타일에 무지개 ring 색상을 인라인으로 지정
  const jokerStyle = tile.isJoker
    ? { boxShadow: "0 0 0 2px transparent, 0 0 0 3px #c084fc, 0 0 8px 2px rgba(192,132,252,0.5)" }
    : undefined;

  // 스타일 병합: highlight가 있으면 조커 ring을 덮어쓴다 (조커도 하이라이트 가능)
  const mergedStyle = highlightGlowStyle ?? jokerStyle;

  return (
    <motion.div
      role="img"
      aria-label={label}
      aria-roledescription={selected ? "selected tile" : "tile"}
      onClick={onClick}
      whileHover={draggable || onClick ? { scale: 1.08, y: -2 } : undefined}
      whileTap={draggable || onClick ? { scale: 0.95 } : undefined}
      animate={selected ? { y: -6 } : { y: 0 }}
      transition={{ type: "spring", stiffness: 400, damping: 20 }}
      style={mergedStyle}
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
          className="absolute -top-1 -right-1 text-[10px] bg-border-active text-white rounded-full w-4 h-4 flex items-center justify-center leading-none z-10"
        >
          ⬆
        </span>
      )}

      {/* 조커 별표 강조 (상단 우측, 크기가 작지 않을 때) */}
      {tile.isJoker && size !== "mini" && (
        <span
          aria-hidden="true"
          className="absolute -top-1 -right-1 text-[11px] text-yellow-300 drop-shadow-[0_0_4px_rgba(253,224,71,0.8)] z-10"
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
            "absolute bottom-0.5 left-0.5 text-[10px] opacity-75",
            tile.isJoker ? "text-yellow-200 opacity-80" : "",
          ]
            .filter(Boolean)
            .join(" ")}
        >
          {symbol}
        </span>
      )}

      {/* b 세트 식별 도트 (우하단, mini/icon 크기에서는 생략) */}
      {tile.set === "b" && size !== "mini" && size !== "icon" && (
        <span
          aria-hidden="true"
          className="absolute bottom-0.5 right-0.5 w-2 h-2 rounded-full bg-current opacity-65"
          title="b 세트"
        />
      )}
    </motion.div>
  );
});

Tile.displayName = "Tile";

export default Tile;
