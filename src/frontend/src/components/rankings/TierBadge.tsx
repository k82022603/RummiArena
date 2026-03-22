"use client";

import { memo } from "react";
import { TIER_COLOR, TIER_LABEL } from "@/lib/rankings-api";
import type { Tier } from "@/lib/rankings-api";

interface TierBadgeProps {
  tier: Tier;
  /** "sm" = 랭킹 테이블용, "md" = 프로필 카드용 */
  size?: "sm" | "md";
}

/**
 * ELO 티어 뱃지 컴포넌트
 * 티어별 색상과 한글 레이블을 표시한다.
 */
export const TierBadge = memo(function TierBadge({
  tier,
  size = "sm",
}: TierBadgeProps) {
  const color = TIER_COLOR[tier];
  const label = TIER_LABEL[tier];

  const sizeClass =
    size === "md"
      ? "px-3 py-1 text-tile-sm font-bold rounded-lg"
      : "px-1.5 py-0.5 text-tile-xs font-semibold rounded";

  return (
    <span
      className={sizeClass}
      style={{
        backgroundColor: `${color}22`,
        color,
        border: `1px solid ${color}55`,
      }}
      aria-label={`티어: ${label}`}
    >
      {label}
    </span>
  );
});
