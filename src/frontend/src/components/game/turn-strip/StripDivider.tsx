"use client";

/**
 * StripDivider — TurnStatusStrip 내부 세로 구분선
 * 스펙 §4.1: linear-gradient(180deg, transparent, #1e2532, transparent)
 */
export default function StripDivider() {
  return (
    <div
      aria-hidden="true"
      className="flex-shrink-0 w-px self-stretch"
      style={{
        background:
          "linear-gradient(180deg, transparent 0%, #1e2532 50%, transparent 100%)",
      }}
    />
  );
}
