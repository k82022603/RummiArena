"use client";

import React, { memo } from "react";
import { motion } from "framer-motion";
import { useTurnTimer } from "@/hooks/useTurnTimer";

interface TurnTimerProps {
  /** 전체 턴 타임아웃(초) - 프로그레스바 계산용 */
  totalSec: number;
  className?: string;
}

/**
 * 턴 타이머 컴포넌트
 * - 남은 시간을 프로그레스바와 숫자로 표시
 * - 10초 이하: 경고 색상(warning), 5초 이하: 위험 색상(danger)
 */
const TurnTimer = memo(function TurnTimer({
  totalSec,
  className = "",
}: TurnTimerProps) {
  const { seconds, isWarning, isDanger } = useTurnTimer();

  const progress = totalSec > 0 ? Math.max(0, seconds / totalSec) : 0;

  const barColor = isDanger
    ? "bg-danger"
    : isWarning
      ? "bg-warning"
      : "bg-success";

  const textColor = isDanger
    ? "text-danger"
    : isWarning
      ? "text-warning"
      : "text-text-secondary";

  return (
    <div
      className={`flex items-center gap-2 ${className}`}
      role="timer"
      aria-label={`남은 시간 ${seconds}초`}
      aria-live="polite"
    >
      {/* 프로그레스바 */}
      <div className="flex-1 h-1.5 bg-border rounded-full overflow-hidden">
        <motion.div
          className={`h-full rounded-full ${barColor}`}
          animate={{ width: `${progress * 100}%` }}
          transition={{ ease: "linear", duration: 1 }}
        />
      </div>

      {/* 숫자 */}
      <motion.span
        key={seconds}
        initial={{ scale: isDanger ? 1.3 : 1 }}
        animate={{ scale: 1 }}
        className={`font-mono font-bold text-tile-sm min-w-[24px] text-right ${textColor}`}
        aria-hidden="true"
      >
        {seconds}s
      </motion.span>
    </div>
  );
});

TurnTimer.displayName = "TurnTimer";

export default TurnTimer;
