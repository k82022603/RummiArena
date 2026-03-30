"use client";

import { useEffect } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { useWSStore } from "@/store/wsStore";
import { useGameStore } from "@/store/gameStore";

const TOAST_DURATION_MS = 5000;

/**
 * INVALID_MOVE 에러 토스트
 *
 * - wsStore.lastError 를 구독, null 이 아니면 상단 중앙에 표시
 * - 3초 후 자동 소멸 (Framer Motion AnimatePresence)
 * - 노출 시 pendingTableGroups / pendingMyTiles 를 null 로 초기화 (스냅샷 롤백)
 *
 * 디자인 토큰:
 *   bg-danger  (#F85149)  text-white
 *   rounded-xl  shadow-lg
 *   fixed top-4 left-1/2 -translate-x-1/2 z-50
 */
export default function ErrorToast() {
  const { lastError, setLastError } = useWSStore();
  const { resetPending } = useGameStore();

  // 에러가 표시될 때 pending 상태 롤백 + 타이머 설정
  useEffect(() => {
    if (!lastError) return;

    // 스냅샷 롤백
    resetPending();

    const timer = setTimeout(() => {
      setLastError(null);
    }, TOAST_DURATION_MS);

    return () => clearTimeout(timer);
  }, [lastError, resetPending, setLastError]);

  return (
    <AnimatePresence>
      {lastError && (
        <motion.div
          key="error-toast"
          initial={{ opacity: 0, y: -12 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -12 }}
          transition={{ type: "spring", stiffness: 400, damping: 30 }}
          className={[
            "fixed top-4 left-1/2 -translate-x-1/2 z-50",
            "flex items-center gap-2",
            "bg-danger text-white",
            "rounded-xl shadow-lg",
            "px-4 py-2.5",
            "text-tile-sm font-medium",
            "max-w-sm w-max",
            "pointer-events-none select-none",
          ].join(" ")}
          role="alert"
          aria-live="assertive"
          aria-atomic="true"
        >
          {/* 경고 아이콘 */}
          <svg
            xmlns="http://www.w3.org/2000/svg"
            viewBox="0 0 20 20"
            fill="currentColor"
            className="w-4 h-4 flex-shrink-0"
            aria-hidden="true"
          >
            <path
              fillRule="evenodd"
              d="M8.485 2.495c.673-1.167 2.357-1.167 3.03 0l6.28 10.875c.673 1.167-.17 2.625-1.516 2.625H3.72c-1.347 0-2.189-1.458-1.515-2.625L8.485 2.495zM10 5a.75.75 0 01.75.75v3.5a.75.75 0 01-1.5 0v-3.5A.75.75 0 0110 5zm0 9a1 1 0 100-2 1 1 0 000 2z"
              clipRule="evenodd"
            />
          </svg>
          <span>{lastError}</span>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
