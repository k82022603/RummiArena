"use client";

import { useEffect } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { useRateLimitStore } from "@/store/rateLimitStore";

const TOAST_DURATION_MS = 6000;

/**
 * Rate Limit (429) 토스트
 *
 * - rateLimitStore.message 를 구독, null 이 아니면 상단 중앙에 표시
 * - 6초 후 자동 소멸 (Framer Motion AnimatePresence)
 * - 비차단(non-blocking) 알림 — 모달 아님
 *
 * 디자인 토큰:
 *   bg-warning/90  text-gray-900
 *   rounded-xl  shadow-lg
 *   fixed top-28 left-1/2 -translate-x-1/2 z-50
 *   (ErrorToast=top-4, ReconnectToast=top-16이므로 top-28 배치)
 */
export default function RateLimitToast() {
  const { message, setMessage } = useRateLimitStore();

  useEffect(() => {
    if (!message) return;

    const timer = setTimeout(() => {
      setMessage(null);
    }, TOAST_DURATION_MS);

    return () => clearTimeout(timer);
  }, [message, setMessage]);

  return (
    <AnimatePresence>
      {message && (
        <motion.div
          key="rate-limit-toast"
          initial={{ opacity: 0, y: -12 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -12 }}
          transition={{ type: "spring", stiffness: 400, damping: 30 }}
          className={[
            "fixed top-28 left-1/2 -translate-x-1/2 z-50",
            "flex items-center gap-2",
            "bg-warning/90 text-gray-900",
            "rounded-xl shadow-lg",
            "px-4 py-2.5",
            "text-tile-sm font-medium",
            "max-w-sm w-max",
            "pointer-events-none select-none",
          ].join(" ")}
          role="alert"
          aria-live="polite"
          aria-atomic="true"
          data-testid="rate-limit-toast"
        >
          {/* 시계 아이콘 (속도 제한 의미) */}
          <svg
            xmlns="http://www.w3.org/2000/svg"
            viewBox="0 0 20 20"
            fill="currentColor"
            className="w-4 h-4 flex-shrink-0"
            aria-hidden="true"
          >
            <path
              fillRule="evenodd"
              d="M10 18a8 8 0 100-16 8 8 0 000 16zm.75-13a.75.75 0 00-1.5 0v5c0 .414.336.75.75.75h4a.75.75 0 000-1.5H10.75V5z"
              clipRule="evenodd"
            />
          </svg>
          <span>{message}</span>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
