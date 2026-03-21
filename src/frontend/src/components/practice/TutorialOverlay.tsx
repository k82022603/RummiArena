"use client";

import React, { memo } from "react";
import { motion, AnimatePresence } from "framer-motion";

interface TutorialOverlayProps {
  isVisible: boolean;
  stageName: string;
  message: string;
  onDismiss: () => void;
}

/**
 * 스테이지 첫 진입 시 표시하는 튜토리얼 오버레이
 * - 반투명 배경 위에 메시지 카드 표시
 * - "시작하기" 버튼 클릭 또는 배경 클릭으로 닫힘
 */
const TutorialOverlay = memo(function TutorialOverlay({
  isVisible,
  stageName,
  message,
  onDismiss,
}: TutorialOverlayProps) {
  return (
    <AnimatePresence>
      {isVisible && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.2 }}
          className="fixed inset-0 z-40 bg-black/60 flex items-center justify-center p-4"
          role="dialog"
          aria-modal="true"
          aria-label={`${stageName} 튜토리얼`}
          onClick={onDismiss}
        >
          <motion.div
            initial={{ scale: 0.88, opacity: 0, y: 12 }}
            animate={{ scale: 1, opacity: 1, y: 0 }}
            exit={{ scale: 0.88, opacity: 0, y: 12 }}
            transition={{ type: "spring", stiffness: 320, damping: 26 }}
            onClick={(e) => e.stopPropagation()}
            className="bg-card-bg border border-border rounded-2xl p-8 max-w-md w-full shadow-2xl text-center"
          >
            {/* 아이콘 */}
            <div
              aria-hidden="true"
              className="w-14 h-14 rounded-full bg-[var(--border-active)]/15 border-2 border-[var(--border-active)]/50 flex items-center justify-center mx-auto mb-4"
            >
              <span className="text-2xl text-[var(--border-active)]">?</span>
            </div>

            {/* 스테이지 이름 */}
            <p className="text-xs font-mono text-text-secondary mb-1 uppercase tracking-widest">
              {stageName}
            </p>

            {/* 튜토리얼 메시지 */}
            <p className="text-base text-text-primary leading-relaxed mb-6">
              {message}
            </p>

            {/* 시작 버튼 */}
            <button
              type="button"
              onClick={onDismiss}
              className="w-full py-3 rounded-xl font-bold text-sm bg-[var(--color-warning)] text-gray-900 hover:bg-yellow-400 transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--border-active)]"
            >
              시작하기
            </button>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
});

TutorialOverlay.displayName = "TutorialOverlay";

export default TutorialOverlay;
