"use client";

import React, { memo } from "react";
import { motion } from "framer-motion";
import { useGameStore } from "@/store/gameStore";

interface TurnTimerProps {
  /** 전체 턴 타임아웃(초) - 프로그레스바 계산용 */
  totalSec: number;
  className?: string;
}

/**
 * 턴 타이머 컴포넌트
 * - 인간 턴: 남은 시간을 프로그레스바와 숫자로 표시
 *   - 10초 이하: 경고 색상(warning), 5초 이하: 위험 색상(danger)
 * - AI 턴: 프로그레스 바 정상 색상(초록) 고정 + "AI 사고 중..." 경과 시간 표시
 */
const TurnTimer = memo(function TurnTimer({
  totalSec,
  className = "",
}: TurnTimerProps) {
  const remainingMs = useGameStore((s) => s.remainingMs);
  const isAITurnRaw = useGameStore((s) => s.isAITurn);
  const aiThinkingSeat = useGameStore((s) => s.aiThinkingSeat);
  const aiElapsedMs = useGameStore((s) => s.aiElapsedMs);

  const isAITurn = isAITurnRaw || aiThinkingSeat !== null;
  const seconds = Math.ceil(remainingMs / 1000);
  const isWarning = !isAITurn && seconds <= 10 && seconds > 0;
  const isDanger = !isAITurn && seconds <= 5 && seconds > 0;
  const elapsedSec = Math.floor(aiElapsedMs / 1000);

  // AI 턴: 프로그레스 바 100% 고정, 정상 색상 유지
  if (isAITurn) {
    return (
      <div
        className={`flex items-center gap-2 ${className}`}
        role="status"
        aria-label="AI 사고 중"
        aria-live="polite"
      >
        {/* 프로그레스바 — 100% 고정, 초록색 */}
        <div className="flex-1 h-1.5 bg-border rounded-full overflow-hidden">
          <motion.div
            className="h-full rounded-full bg-success"
            animate={{ width: "100%", opacity: [0.6, 1, 0.6] }}
            transition={{ opacity: { repeat: Infinity, duration: 2, ease: "easeInOut" } }}
          />
        </div>

        {/* 경과 시간 */}
        <span
          className="font-mono font-bold text-tile-sm min-w-[60px] text-right text-color-ai"
          aria-hidden="true"
        >
          {elapsedSec}s
        </span>
      </div>
    );
  }

  // 인간 턴: 기존 카운트다운 로직
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
