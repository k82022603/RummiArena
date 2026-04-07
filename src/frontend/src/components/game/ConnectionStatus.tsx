"use client";

import React, { memo } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useWSStore } from "@/store/wsStore";

/** Close Code별 사유 메시지 */
const CLOSE_CODE_MESSAGES: Record<number, string> = {
  4001: "인증에 실패했습니다. 다시 로그인해주세요.",
  4002: "게임 방을 찾을 수 없습니다.",
  4003: "인증 시간이 초과되었습니다.",
  4004: "다른 탭에서 같은 게임에 접속 중입니다.",
  4005: "메시지를 너무 빠르게 보내서 연결이 제한되었습니다.",
};

/**
 * WebSocket 연결 상태 배너 컴포넌트
 *
 * - 연결 중/끊김/재연결 중 상태를 사용자에게 표시
 * - Close 4005(Rate Limit) 시 사유 메시지 + 재연결 진행 상황 표시
 * - 재연결 카운트다운 및 시도 횟수 표시
 */
const ConnectionStatus = memo(function ConnectionStatus() {
  const status = useWSStore((s) => s.status);
  const lastError = useWSStore((s) => s.lastError);
  const lastCloseCode = useWSStore((s) => s.lastCloseCode);
  const reconnectAttemptCount = useWSStore((s) => s.reconnectAttemptCount);
  const reconnectNextDelaySec = useWSStore((s) => s.reconnectNextDelaySec);

  const isVisible =
    status === "connecting" ||
    status === "reconnecting" ||
    status === "disconnected" ||
    status === "error";

  // Close Code별 사유가 있으면 해당 메시지 사용
  const closeCodeMessage =
    lastCloseCode != null ? CLOSE_CODE_MESSAGES[lastCloseCode] ?? null : null;

  const config = {
    connecting: {
      bg: "bg-warning/10 border-warning/30",
      text: "text-warning",
      message: "서버에 연결 중...",
      showSpinner: true,
      showReconnectInfo: false,
    },
    reconnecting: {
      bg: "bg-warning/10 border-warning/30",
      text: "text-warning",
      message: closeCodeMessage
        ? `${closeCodeMessage} 재연결 시도 중...`
        : "재연결 시도 중...",
      showSpinner: true,
      showReconnectInfo: true,
    },
    disconnected: {
      bg: "bg-danger/10 border-danger/30",
      text: "text-danger",
      message: lastError ?? closeCodeMessage ?? "서버와 연결이 끊어졌습니다.",
      showSpinner: false,
      showReconnectInfo: false,
    },
    error: {
      bg: "bg-danger/10 border-danger/30",
      text: "text-danger",
      message: lastError ?? "연결 오류가 발생했습니다.",
      showSpinner: false,
      showReconnectInfo: false,
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
            "flex flex-col items-center gap-1 text-tile-sm",
            currentConfig.bg,
            currentConfig.text,
          ].join(" ")}
          role="alert"
          aria-live="assertive"
        >
          <div className="flex items-center gap-2">
            {/* 스피너 (connecting/reconnecting) */}
            {currentConfig.showSpinner && (
              <motion.div
                animate={{ rotate: 360 }}
                transition={{ repeat: Infinity, duration: 1, ease: "linear" }}
                className="w-3 h-3 rounded-full border-2 border-current border-t-transparent"
                aria-hidden="true"
              />
            )}
            <span>{currentConfig.message}</span>
            {/* 재연결 시도 횟수 */}
            {currentConfig.showReconnectInfo && reconnectAttemptCount > 0 && (
              <span className="text-tile-xs opacity-80">
                ({reconnectAttemptCount}/5)
              </span>
            )}
          </div>

          {/* 재연결 카운트다운 (백오프 대기 시간) */}
          {currentConfig.showReconnectInfo && reconnectNextDelaySec > 0 && (
            <span className="text-tile-xs opacity-70">
              다음 시도까지 {reconnectNextDelaySec}초...
            </span>
          )}
        </motion.div>
      )}
    </AnimatePresence>
  );
});

ConnectionStatus.displayName = "ConnectionStatus";

export default ConnectionStatus;
