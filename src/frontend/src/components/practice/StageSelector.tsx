"use client";

import React, { memo } from "react";
import { motion } from "framer-motion";
import type { StageNumber } from "@/lib/practice/stage-configs";
import { STAGE_CONFIGS, STAGE_NUMBERS } from "@/lib/practice/stage-configs";

interface StageSelectorProps {
  /** 잠금 해제된 스테이지 번호 목록 */
  unlockedStages: StageNumber[];
  /** 스테이지별 최고 점수 (없으면 null) */
  bestScores: Partial<Record<StageNumber, number>>;
  onSelect: (stage: StageNumber) => void;
}

const GOAL_LABEL: Record<string, string> = {
  group: "그룹",
  run: "런",
  joker: "조커",
  multi: "복합",
  master: "마스터",
};

/**
 * 스테이지 1~6 선택 카드 목록
 * STAGE_NUMBERS와 STAGE_CONFIGS를 동적으로 읽어 렌더링한다.
 */
const StageSelector = memo(function StageSelector({
  unlockedStages,
  bestScores,
  onSelect,
}: StageSelectorProps) {
  return (
    <div
      className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4"
      role="list"
      aria-label="스테이지 목록"
    >
      {STAGE_NUMBERS.map((num, idx) => {
        const config = STAGE_CONFIGS[num];
        const unlocked = unlockedStages.includes(num);
        const best = bestScores[num] ?? null;

        return (
          <motion.div
            key={num}
            role="listitem"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: idx * 0.07 }}
            onClick={() => unlocked && onSelect(num)}
            onKeyDown={(e) => {
              if ((e.key === "Enter" || e.key === " ") && unlocked) {
                e.preventDefault();
                onSelect(num);
              }
            }}
            tabIndex={unlocked ? 0 : -1}
            aria-label={`Stage ${num}: ${config.name}${!unlocked ? " (잠김)" : ""}`}
            aria-disabled={!unlocked}
            className={[
              "relative p-5 rounded-2xl border select-none",
              "focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--border-active)]",
              unlocked
                ? "bg-card-bg border-border hover:border-[var(--border-active)] cursor-pointer transition-colors"
                : "bg-card-bg/40 border-border/40 cursor-not-allowed opacity-60",
            ].join(" ")}
          >
            {/* 잠금 뱃지 */}
            {!unlocked && (
              <span
                aria-hidden="true"
                className="absolute top-3 right-3 text-xs text-text-secondary"
              >
                잠금
              </span>
            )}

            {/* 최고 점수 뱃지 */}
            {unlocked && best !== null && (
              <span className="absolute top-3 right-3 text-xs text-[var(--color-success)] font-semibold">
                최고 {best}점
              </span>
            )}

            {/* 스테이지 번호 */}
            <div className="flex items-center gap-2 mb-3">
              <span
                className={[
                  "text-xs font-mono px-2 py-0.5 rounded-full border",
                  unlocked
                    ? "border-[var(--border-active)] text-[var(--border-active)]"
                    : "border-border text-text-secondary",
                ].join(" ")}
              >
                STAGE {num}
              </span>
              <span
                className={[
                  "text-xs px-1.5 py-0.5 rounded font-medium",
                  unlocked
                    ? "bg-[var(--border-active)]/10 text-[var(--border-active)]"
                    : "bg-border/10 text-text-secondary",
                ].join(" ")}
              >
                {GOAL_LABEL[config.goal]}
              </span>
            </div>

            {/* 이름 & 설명 */}
            <h3 className="font-bold text-base text-text-primary mb-1">
              {config.name}
            </h3>
            <p className="text-sm text-text-secondary leading-snug">
              {config.description}
            </p>

            {/* 초기 패 미리보기 (타일 수) */}
            <div className="mt-3 flex items-center gap-1.5">
              <span className="text-xs text-text-secondary">
                초기 패 {config.hand.length}개
              </span>
              {config.hand.some((t) => t === "JK1" || t === "JK2") && (
                <span className="text-xs text-purple-400 font-medium">
                  + 조커
                </span>
              )}
            </div>
          </motion.div>
        );
      })}
    </div>
  );
});

StageSelector.displayName = "StageSelector";

export default StageSelector;
