"use client";

import React, { memo } from "react";
import { motion, AnimatePresence } from "framer-motion";

interface ScoreDisplayProps {
  score: number;
  isCleared: boolean;
  stageNum: number;
  totalStages: number;
  onNextStage?: () => void;
  onRetry: () => void;
  onBackToList: () => void;
  /** 처음부터 다시 (Stage 1으로 이동) — 마지막 스테이지 완료 후 표시 */
  onRestartAll?: () => void;
}

/**
 * 점수 표시 및 스테이지 클리어 결과 화면
 * - 클리어 시: 축하 애니메이션 + 점수 + 다음 스테이지 버튼
 * - 마지막 스테이지 클리어 시: "모든 스테이지 완료!" 메시지 + 처음부터 다시 버튼
 * - 미클리어 시: 현재 점수만 표시 (인라인)
 */
const ScoreDisplay = memo(function ScoreDisplay({
  score,
  isCleared,
  stageNum,
  totalStages,
  onNextStage,
  onRetry,
  onBackToList,
  onRestartAll,
}: ScoreDisplayProps) {
  const hasNext = stageNum < totalStages;
  const isLastStage = stageNum === totalStages;

  return (
    <AnimatePresence>
      {isCleared && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-50 bg-black/65 flex items-center justify-center p-4"
          role="dialog"
          aria-modal="true"
          aria-label={isLastStage ? "모든 스테이지 완료" : "스테이지 클리어"}
        >
          <motion.div
            initial={{ scale: 0.82, opacity: 0, y: 16 }}
            animate={{ scale: 1, opacity: 1, y: 0 }}
            exit={{ scale: 0.82, opacity: 0 }}
            transition={{ type: "spring", stiffness: 300, damping: 24 }}
            className="bg-card-bg border border-[var(--color-success)]/40 rounded-2xl p-8 max-w-sm w-full shadow-2xl text-center"
          >
            {/* 성공 아이콘 */}
            <motion.div
              initial={{ scale: 0 }}
              animate={{ scale: 1 }}
              transition={{
                type: "spring",
                stiffness: 400,
                damping: 18,
                delay: 0.1,
              }}
              className="w-16 h-16 rounded-full bg-[var(--color-success)]/15 border-2 border-[var(--color-success)]/60 flex items-center justify-center mx-auto mb-4"
              aria-hidden="true"
            >
              <span className="text-3xl text-[var(--color-success)]">
                {isLastStage ? "!!" : "OK"}
              </span>
            </motion.div>

            {isLastStage ? (
              <>
                <h2 className="text-xl font-bold text-text-primary mb-1">
                  모든 스테이지 완료!
                </h2>
                <p className="text-sm text-text-secondary mb-4">
                  축하합니다! Stage 1~{totalStages}을 모두 클리어했습니다.
                </p>
              </>
            ) : (
              <h2 className="text-xl font-bold text-text-primary mb-1">
                Stage {stageNum} 클리어!
              </h2>
            )}

            {/* 점수 */}
            <motion.div
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.2 }}
              className="mb-6"
            >
              <p className="text-sm text-text-secondary mb-1">획득 점수</p>
              <p className="text-4xl font-bold text-[var(--color-warning)]">
                {score}
                <span className="text-base font-normal text-text-secondary ml-1">
                  점
                </span>
              </p>
            </motion.div>

            {/* 버튼 영역 */}
            <div className="flex flex-col gap-2">
              {hasNext && onNextStage && (
                <button
                  type="button"
                  onClick={onNextStage}
                  className="w-full py-3 rounded-xl font-bold text-sm bg-[var(--color-warning)] text-gray-900 hover:bg-yellow-400 transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--border-active)]"
                >
                  다음 스테이지
                </button>
              )}
              {isLastStage && onRestartAll && (
                <button
                  type="button"
                  onClick={onRestartAll}
                  className="w-full py-3 rounded-xl font-bold text-sm bg-[var(--color-warning)] text-gray-900 hover:bg-yellow-400 transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--border-active)]"
                >
                  처음부터 다시
                </button>
              )}
              <button
                type="button"
                onClick={onRetry}
                className="w-full py-2.5 rounded-xl font-medium text-sm bg-card-bg border border-border hover:border-[var(--border-active)] transition-colors text-text-primary"
              >
                다시 하기
              </button>
              <button
                type="button"
                onClick={onBackToList}
                className="w-full py-2.5 rounded-xl font-medium text-sm text-text-secondary hover:text-text-primary transition-colors"
              >
                스테이지 목록으로
              </button>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
});

ScoreDisplay.displayName = "ScoreDisplay";

export default ScoreDisplay;
