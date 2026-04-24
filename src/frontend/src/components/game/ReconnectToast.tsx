"use client";

import { useEffect } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { useWSStore } from "@/store/wsStore";

const TOAST_DURATION_MS = 3000;

/**
 * PLAYER_RECONNECT 재접속 토스트
 *
 * - wsStore.reconnectNotice 를 구독, null 이 아니면 상단 중앙에 표시
 * - 3초 후 자동 소멸 (Framer Motion AnimatePresence)
 *
 * 디자인 토큰:
 *   bg-emerald-600  text-white
 *   rounded-xl  shadow-lg
 *   fixed top-16 left-1/2 -translate-x-1/2 z-50
 *   (ErrorToast가 top-4를 사용하므로 top-16에 배치)
 */
export default function ReconnectToast() {
  const { reconnectNotice, setReconnectNotice } = useWSStore();

  useEffect(() => {
    if (!reconnectNotice) return;

    const timer = setTimeout(() => {
      setReconnectNotice(null);
    }, TOAST_DURATION_MS);

    return () => clearTimeout(timer);
  }, [reconnectNotice, setReconnectNotice]);

  return (
    <AnimatePresence>
      {reconnectNotice && (
        <motion.div
          key="reconnect-toast"
          initial={{ opacity: 0, y: -12 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -12 }}
          transition={{ type: "spring", stiffness: 400, damping: 30 }}
          className={[
            "fixed top-32 left-1/2 -translate-x-1/2 z-50",
            "flex items-center gap-2",
            "bg-emerald-600 text-white",
            "rounded-xl shadow-lg",
            "px-4 py-2.5",
            "text-tile-sm font-medium",
            "max-w-sm w-max",
            "pointer-events-none select-none",
          ].join(" ")}
          role="status"
          aria-live="polite"
          aria-atomic="true"
        >
          {/* 재접속 아이콘 (사람 실루엣) */}
          <svg
            xmlns="http://www.w3.org/2000/svg"
            viewBox="0 0 20 20"
            fill="currentColor"
            className="w-4 h-4 flex-shrink-0"
            aria-hidden="true"
          >
            <path d="M10 8a3 3 0 100-6 3 3 0 000 6zM3.465 14.493a1.23 1.23 0 00.41 1.412A9.957 9.957 0 0010 18c2.31 0 4.438-.784 6.131-2.1.43-.333.604-.903.408-1.41a7.002 7.002 0 00-13.074.003z" />
          </svg>
          <span>
            {reconnectNotice.displayName}님이 재접속했습니다.
          </span>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
