"use client";

import { memo } from "react";
import { motion, AnimatePresence } from "framer-motion";

export interface ActionBarProps {
  isMyTurn: boolean;
  hasPending: boolean;
  drawPileCount?: number;
  onDraw: () => void;
  onUndo: () => void;
  onConfirm: () => void;
}

/**
 * 게임 액션 버튼 바
 *
 * - 드로우: pending 상태(타일 배치 중)일 때 비활성
 * - 초기화: pending 상태가 아닐 때 비활성 (이번 턴 배치 롤백)
 * - 확정: pending 상태가 아닐 때 비활성 (배치 확정 → 서버 전송)
 * - 내 턴이 아닐 때 AnimatePresence로 전체 숨김
 */
const ActionBar = memo(function ActionBar({
  isMyTurn,
  hasPending,
  drawPileCount,
  onDraw,
  onUndo,
  onConfirm,
}: ActionBarProps) {
  return (
    <AnimatePresence>
      {isMyTurn && (
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: 8 }}
          transition={{ duration: 0.18 }}
          className="flex gap-2 mt-2"
          role="group"
          aria-label="게임 액션"
        >
          {/* 드로우 버튼 */}
          <button
            type="button"
            onClick={onDraw}
            disabled={hasPending || drawPileCount === 0}
            className={[
              "flex-1 py-2.5 rounded-xl font-medium text-tile-sm",
              "bg-card-bg border border-border hover:border-border-active",
              "disabled:opacity-40 disabled:cursor-not-allowed",
              "transition-colors",
            ].join(" ")}
            aria-label="타일 드로우"
          >
            드로우
          </button>

          {/* 초기화 버튼 */}
          <button
            type="button"
            onClick={onUndo}
            disabled={!hasPending}
            className={[
              "px-4 py-2.5 rounded-xl font-medium text-tile-sm",
              "bg-card-bg border border-border",
              "hover:border-danger/60 hover:text-danger",
              "disabled:opacity-40 disabled:cursor-not-allowed",
              "transition-colors",
            ].join(" ")}
            aria-label="이번 턴 배치 초기화 (서버에 RESET_TURN 전송)"
            title="이번 턴에 놓은 타일을 모두 되돌립니다"
          >
            <span aria-hidden="true">&#x21BA;</span> 초기화
          </button>

          {/* 확정 버튼 */}
          <button
            type="button"
            onClick={onConfirm}
            disabled={!hasPending}
            className={[
              "flex-1 py-2.5 rounded-xl font-bold text-tile-sm",
              "bg-warning text-gray-900 hover:bg-yellow-400",
              "disabled:opacity-40 disabled:cursor-not-allowed",
              "transition-colors",
            ].join(" ")}
            aria-label="배치 확정"
          >
            확정
          </button>
        </motion.div>
      )}
    </AnimatePresence>
  );
});

ActionBar.displayName = "ActionBar";

export default ActionBar;
