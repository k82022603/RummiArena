"use client";

import { useEffect } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { useRateLimitStore } from "@/store/rateLimitStore";
import CooldownProgress from "@/components/ui/CooldownProgress";

/** 단계별 토스트 표시 시간(ms) */
const TOAST_DURATION_MS_BY_STAGE: Record<number, number> = {
  0: 6000,  // 기본 (HTTP 429 또는 1회 위반)
  1: 6000,  // 1회 위반
  2: 8000,  // 2회 위반 (더 오래 표시)
};

/** 단계별 토스트 스타일 설정 */
interface StageConfig {
  bg: string;
  textColor: string;
  icon: "clock" | "warning";
  ariaLive: "polite" | "assertive";
}

const STAGE_CONFIGS: Record<number, StageConfig> = {
  0: {
    bg: "bg-warning/90",
    textColor: "text-gray-900",
    icon: "clock",
    ariaLive: "polite",
  },
  1: {
    bg: "bg-warning/90",
    textColor: "text-gray-900",
    icon: "clock",
    ariaLive: "polite",
  },
  2: {
    bg: "bg-orange-500/90",
    textColor: "text-white",
    icon: "warning",
    ariaLive: "assertive",
  },
};

/**
 * Rate Limit (429 / WS RATE_LIMITED) 토스트 v2
 *
 * - rateLimitStore.message 를 구독, null 이 아니면 상단 중앙에 표시
 * - 쿨다운 카운트다운 원형 프로그레스 표시
 * - WS 위반 횟수에 따라 단계별 색상/아이콘 변경:
 *   0~1회: 노란(bg-warning/90) + 시계 아이콘
 *   2회: 주황(bg-orange-500/90) + 경고 삼각형 아이콘
 * - 자동 dismiss (단계별 6~8초)
 * - 비차단(non-blocking) 알림
 *
 * 디자인 토큰:
 *   fixed top-28 left-1/2 -translate-x-1/2 z-50
 *   rounded-xl shadow-lg
 *   max-w-md w-max
 */
export default function RateLimitToast() {
  const message = useRateLimitStore((s) => s.message);
  const setMessage = useRateLimitStore((s) => s.setMessage);
  const cooldownSec = useRateLimitStore((s) => s.cooldownSec);
  const cooldownTotalSec = useRateLimitStore((s) => s.cooldownTotalSec);
  const wsViolationCount = useRateLimitStore((s) => s.wsViolationCount);
  const isRetrying = useRateLimitStore((s) => s.isRetrying);

  // 단계 결정: wsViolationCount 기반
  const stage = Math.min(wsViolationCount, 2);
  const stageConfig = STAGE_CONFIGS[stage] ?? STAGE_CONFIGS[0];
  const toastDuration = TOAST_DURATION_MS_BY_STAGE[stage] ?? 6000;

  useEffect(() => {
    if (!message) return;

    // 쿨다운이 활성화되어 있으면 쿨다운 끝날 때까지 토스트 유지
    if (cooldownSec > 0) return;

    const timer = setTimeout(() => {
      setMessage(null);
    }, toastDuration);

    return () => clearTimeout(timer);
  }, [message, setMessage, toastDuration, cooldownSec]);

  // 쿨다운이 끝나면 잠시 후 토스트 소멸
  useEffect(() => {
    if (!message || cooldownSec > 0 || cooldownTotalSec === 0) return;

    const timer = setTimeout(() => {
      setMessage(null);
    }, 2000);

    return () => clearTimeout(timer);
  }, [message, cooldownSec, cooldownTotalSec, setMessage]);

  const hasCooldown = cooldownTotalSec > 0 && cooldownSec > 0;

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
            "flex items-center gap-3",
            stageConfig.bg,
            stageConfig.textColor,
            "rounded-xl shadow-lg",
            "px-4 py-3",
            "text-tile-sm font-medium",
            "max-w-md w-max",
            "pointer-events-none select-none",
          ].join(" ")}
          role="alert"
          aria-live={stageConfig.ariaLive}
          aria-atomic="true"
          data-testid="rate-limit-toast"
        >
          {/* 아이콘: 단계별 변경 */}
          {stageConfig.icon === "clock" ? (
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
          ) : (
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
          )}

          {/* 메시지 텍스트 */}
          <div className="flex flex-col gap-0.5 min-w-0">
            <span>{message}</span>
            {isRetrying && (
              <span className="text-tile-xs opacity-80" data-testid="rate-limit-retrying">
                재시도 중...
              </span>
            )}
          </div>

          {/* 원형 프로그레스 (쿨다운 활성 시) */}
          {hasCooldown && (
            <CooldownProgress
              remainingSec={cooldownSec}
              totalSec={cooldownTotalSec}
            />
          )}
        </motion.div>
      )}
    </AnimatePresence>
  );
}
