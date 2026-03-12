"use client";

import React, { memo } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useWSStore } from "@/store/wsStore";

/**
 * WebSocket 연결 상태 배너 컴포넌트
 * 연결 중/끊김/재연결 중 상태를 사용자에게 표시한다.
 */
const ConnectionStatus = memo(function ConnectionStatus() {
  const { status, lastError } = useWSStore();

  const isVisible =
    status === "connecting" ||
    status === "reconnecting" ||
    status === "disconnected" ||
    status === "error";

  const config = {
    connecting: {
      bg: "bg-warning/10 border-warning/30",
      text: "text-warning",
      message: "서버에 연결 중...",
    },
    reconnecting: {
      bg: "bg-warning/10 border-warning/30",
      text: "text-warning",
      message: "재연결 시도 중...",
    },
    disconnected: {
      bg: "bg-danger/10 border-danger/30",
      text: "text-danger",
      message: lastError ?? "서버와 연결이 끊어졌습니다.",
    },
    error: {
      bg: "bg-danger/10 border-danger/30",
      text: "text-danger",
      message: lastError ?? "연결 오류가 발생했습니다.",
    },
  };

  const currentConfig = config[status as keyof typeof config];

  return (
    <AnimatePresence>
      {isVisible && currentConfig && (
        <motion.div
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -20 }}
          className={[
            "fixed top-4 left-1/2 -translate-x-1/2 z-50",
            "px-4 py-2 rounded-lg border",
            "flex items-center gap-2 text-tile-sm",
            currentConfig.bg,
            currentConfig.text,
          ].join(" ")}
          role="alert"
          aria-live="assertive"
        >
          {/* 스피너 (connecting/reconnecting) */}
          {(status === "connecting" || status === "reconnecting") && (
            <motion.div
              animate={{ rotate: 360 }}
              transition={{ repeat: Infinity, duration: 1, ease: "linear" }}
              className="w-3 h-3 rounded-full border-2 border-current border-t-transparent"
              aria-hidden="true"
            />
          )}
          <span>{currentConfig.message}</span>
        </motion.div>
      )}
    </AnimatePresence>
  );
});

ConnectionStatus.displayName = "ConnectionStatus";

export default ConnectionStatus;
