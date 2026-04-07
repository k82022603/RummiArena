"use client";

import { memo } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { useRateLimitStore } from "@/store/rateLimitStore";

/**
 * WS 스로틀 활성 상태 배지
 *
 * - rateLimitStore.wsThrottled가 true이면 게임 헤더에 표시
 * - false가 되면 fade-out (300ms)
 * - "느린 전송 모드" 텍스트 + 시계 아이콘
 *
 * 디자인 토큰:
 *   bg-warning/20 border border-warning/40 rounded-md
 *   px-2 py-0.5
 *   text-warning text-tile-xs font-medium
 *   flex items-center gap-1
 *
 * 접근성:
 *   role="status", aria-live="polite"
 */
const ThrottleBadge = memo(function ThrottleBadge() {
  const wsThrottled = useRateLimitStore((s) => s.wsThrottled);

  return (
    <AnimatePresence>
      {wsThrottled && (
        <motion.div
          key="throttle-badge"
          initial={{ opacity: 0, scale: 0.9 }}
          animate={{ opacity: 1, scale: 1 }}
          exit={{ opacity: 0, scale: 0.9 }}
          transition={{ duration: 0.3 }}
          className={[
            "flex items-center gap-1",
            "bg-warning/20 border border-warning/40 rounded-md",
            "px-2 py-0.5",
            "text-warning text-tile-xs font-medium",
          ].join(" ")}
          role="status"
          aria-live="polite"
          aria-label="메시지 전송 속도가 제한되어 있습니다"
        >
          {/* 시계 아이콘 */}
          <svg
            xmlns="http://www.w3.org/2000/svg"
            viewBox="0 0 20 20"
            fill="currentColor"
            className="w-3 h-3 flex-shrink-0"
            aria-hidden="true"
          >
            <path
              fillRule="evenodd"
              d="M10 18a8 8 0 100-16 8 8 0 000 16zm.75-13a.75.75 0 00-1.5 0v5c0 .414.336.75.75.75h4a.75.75 0 000-1.5H10.75V5z"
              clipRule="evenodd"
            />
          </svg>
          <span>느린 전송 모드</span>
        </motion.div>
      )}
    </AnimatePresence>
  );
});

ThrottleBadge.displayName = "ThrottleBadge";

export default ThrottleBadge;
