"use client";

import { memo } from "react";
import { motion, AnimatePresence } from "framer-motion";

export interface ActionBarProps {
  isMyTurn: boolean;
  hasPending: boolean;
  /** 모든 pending 그룹의 타일 수가 3개 이상인지 여부 */
  allGroupsValid?: boolean;
  drawPileCount?: number;
  onDraw: () => void;
  onUndo: () => void;
  onConfirm: () => void;
  /** 패스 전용 핸들러 (드로우 파일 소진 시). 미제공 시 onDraw 사용. */
  onPass?: () => void;
}

/**
 * 게임 액션 버튼 바
 *
 * - 드로우: pending 상태(타일 배치 중)일 때 비활성
 * - 드로우 파일 소진 시: 드로우 버튼이 "패스" 버튼으로 전환
 *   (서버에 DRAW_TILE 전송 -> 서버에서 패스로 처리)
 * - 초기화: pending 상태가 아닐 때 비활성 (이번 턴 배치 롤백)
 * - 확정: pending 상태가 아닐 때 비활성 (배치 확정 -> 서버 전송)
 * - 내 턴이 아닐 때 AnimatePresence로 전체 숨김
 *
 * @see docs/02-design/12-player-lifecycle-design.md 섹션 3.6
 */
const ActionBar = memo(function ActionBar({
  isMyTurn,
  hasPending,
  allGroupsValid = true,
  drawPileCount,
  onDraw,
  onUndo,
  onConfirm,
  onPass,
}: ActionBarProps) {
  const isDrawPileEmpty = drawPileCount === 0;

  return (
    <AnimatePresence>
      {isMyTurn && (
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: 8 }}
          transition={{ duration: 0.18 }}
          className="flex flex-col gap-2 mt-2"
          role="group"
          aria-label="게임 액션"
        >
          {/* 드로우 파일 소진 안내 */}
          {isDrawPileEmpty && (
            <div
              className="text-tile-xs text-center text-warning bg-warning/10 border border-warning/30 rounded-lg px-3 py-1.5"
              role="status"
              aria-live="polite"
            >
              드로우 파일이 소진되었습니다. 타일을 배치하거나 패스하세요.
            </div>
          )}

          <div className="flex gap-2">
            {/* 드로우 / 패스 버튼 */}
            {isDrawPileEmpty ? (
              <button
                type="button"
                onClick={onPass ?? onDraw}
                disabled={hasPending}
                className={[
                  "flex-1 py-2.5 rounded-xl font-medium text-tile-sm",
                  "bg-amber-600/20 border border-amber-500/50 text-amber-400",
                  "hover:bg-amber-600/30 hover:border-amber-400",
                  "disabled:opacity-40 disabled:cursor-not-allowed",
                  "transition-colors",
                ].join(" ")}
                aria-label="턴 패스 (드로우 파일 소진)"
                title="드로우할 타일이 없습니다. 턴을 넘깁니다."
              >
                &#x23ED; 패스
              </button>
            ) : (
              <button
                type="button"
                onClick={onDraw}
                disabled={hasPending}
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
            )}

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

            {/* 확정 버튼: C-3: hasPending이고 모든 그룹이 3개 이상 타일일 때만 활성 */}
            <button
              type="button"
              onClick={onConfirm}
              disabled={!hasPending || !allGroupsValid}
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
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
});

ActionBar.displayName = "ActionBar";

export default ActionBar;
