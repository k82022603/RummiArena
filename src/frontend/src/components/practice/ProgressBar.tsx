"use client";

import React, { memo } from "react";
import { motion } from "framer-motion";

interface ProgressBarProps {
  /** 전체 스테이지 수 */
  total: number;
  /** 현재 스테이지 번호 (1-based) */
  current: number;
  /** 완료된 스테이지 번호 목록 */
  completed: number[];
}

/**
 * 스테이지 진행도 표시
 * - 전체 스테이지를 점(dot)으로 표시
 * - 현재 스테이지: 강조 색상
 * - 완료 스테이지: 성공 색상 + 체크
 * - 미진행 스테이지: 회색
 */
const ProgressBar = memo(function ProgressBar({
  total,
  current,
  completed,
}: ProgressBarProps) {
  return (
    <nav aria-label="스테이지 진행도" className="flex items-center gap-2">
      {Array.from({ length: total }, (_, i) => {
        const stageNum = i + 1;
        const isDone = completed.includes(stageNum);
        const isCurrent = stageNum === current;

        return (
          <React.Fragment key={stageNum}>
            {/* 연결선 (첫 스테이지 이후) */}
            {i > 0 && (
              <div
                aria-hidden="true"
                className={[
                  "flex-1 h-0.5 rounded",
                  isDone || completed.includes(stageNum - 1)
                    ? "bg-[var(--color-success)]/50"
                    : "bg-border",
                ].join(" ")}
              />
            )}

            {/* 스테이지 점 */}
            <motion.div
              aria-current={isCurrent ? "step" : undefined}
              aria-label={`Stage ${stageNum}${isDone ? " (완료)" : isCurrent ? " (현재)" : ""}`}
              animate={
                isCurrent ? { scale: [1, 1.15, 1] } : { scale: 1 }
              }
              transition={
                isCurrent
                  ? { repeat: Infinity, duration: 2, ease: "easeInOut" }
                  : {}
              }
              className={[
                "w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold flex-shrink-0",
                "border-2 transition-colors",
                isDone
                  ? "bg-[var(--color-success)]/20 border-[var(--color-success)] text-[var(--color-success)]"
                  : isCurrent
                  ? "bg-[var(--border-active)]/20 border-[var(--border-active)] text-[var(--border-active)]"
                  : "bg-card-bg border-border text-text-secondary",
              ].join(" ")}
            >
              {isDone ? (
                <span aria-hidden="true">V</span>
              ) : (
                <span aria-hidden="true">{stageNum}</span>
              )}
            </motion.div>
          </React.Fragment>
        );
      })}
    </nav>
  );
});

ProgressBar.displayName = "ProgressBar";

export default ProgressBar;
