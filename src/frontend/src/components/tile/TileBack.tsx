"use client";

import React, { memo } from "react";

interface TileBackProps {
  /** 표시할 타일 수 */
  count: number;
  className?: string;
}

/**
 * 상대방 타일 뒷면 표시 컴포넌트
 * count 개수만큼 미니 타일을 쌓아서 표시한다.
 */
const TileBack = memo(function TileBack({ count, className = "" }: TileBackProps) {
  const displayCount = Math.min(count, 20); // 최대 20개 표시

  return (
    <div
      className={`flex items-end gap-0.5 ${className}`}
      aria-label={`타일 ${count}개`}
      role="img"
    >
      {Array.from({ length: displayCount }).map((_, i) => (
        <div
          key={i}
          aria-hidden="true"
          className="w-[10px] h-[16px] rounded-sm bg-card-bg border border-border shadow-sm"
          style={{ opacity: 0.6 + (i / displayCount) * 0.4 }}
        />
      ))}
      <span className="ml-1 text-tile-sm text-text-secondary font-mono">
        {count}
      </span>
    </div>
  );
});

TileBack.displayName = "TileBack";

export default TileBack;
