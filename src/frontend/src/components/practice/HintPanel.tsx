"use client";

import React, { memo } from "react";
import { motion, AnimatePresence } from "framer-motion";

interface HintPanelProps {
  hint: string;
  clearCondition: string;
  isVisible?: boolean;
}

/**
 * 힌트 패널
 * - 현재 힌트 문자열 표시
 * - 클리어 조건 표시
 */
const HintPanel = memo(function HintPanel({
  hint,
  clearCondition,
  isVisible = true,
}: HintPanelProps) {
  return (
    <AnimatePresence>
      {isVisible && (
        <motion.aside
          initial={{ opacity: 0, x: 16 }}
          animate={{ opacity: 1, x: 0 }}
          exit={{ opacity: 0, x: 16 }}
          transition={{ type: "spring", stiffness: 300, damping: 25 }}
          aria-label="힌트 패널"
          className="w-52 flex-shrink-0 bg-panel-bg border border-border rounded-xl p-4 flex flex-col gap-3"
        >
          {/* 클리어 조건 */}
          <div>
            <h3 className="text-xs font-semibold text-[var(--color-warning)] uppercase tracking-wide mb-1">
              클리어 조건
            </h3>
            <p className="text-sm text-text-primary leading-snug">
              {clearCondition}
            </p>
          </div>

          <hr className="border-border" />

          {/* 힌트 */}
          <div>
            <h3 className="text-xs font-semibold text-[var(--color-ai)] uppercase tracking-wide mb-1">
              힌트
            </h3>
            <AnimatePresence mode="wait">
              <motion.p
                key={hint}
                initial={{ opacity: 0, y: 4 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -4 }}
                transition={{ duration: 0.2 }}
                className="text-sm text-text-secondary leading-snug"
                role="status"
                aria-live="polite"
              >
                {hint}
              </motion.p>
            </AnimatePresence>
          </div>
        </motion.aside>
      )}
    </AnimatePresence>
  );
});

HintPanel.displayName = "HintPanel";

export default HintPanel;
