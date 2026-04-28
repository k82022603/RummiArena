"use client";

import { memo } from "react";
import { motion, AnimatePresence } from "framer-motion";

export interface ActionBarProps {
  isMyTurn: boolean;
  drawPileCount?: number;
  /** CONFIRM_TURN 전송 후 서버 응답 대기 중 여부 — 중복 클릭 방지 (Issue #48) */
  confirmBusy?: boolean;
  onDraw: () => void;
  onUndo: () => void;
  onConfirm: () => void;
  /** 패스 전용 핸들러 (드로우 파일 소진 시). 미제공 시 onDraw 사용. */
  onPass?: () => void;

  /**
   * ConfirmTurn 버튼 활성 여부 — useTurnActions.confirmEnabled (SSOT)
   */
  confirmEnabled: boolean;
  /**
   * RESET 버튼 활성 여부 — useTurnActions.resetEnabled (SSOT)
   */
  resetEnabled: boolean;
  /**
   * DRAW 버튼 활성 여부 — useTurnActions.drawEnabled (SSOT)
   */
  drawEnabled: boolean;
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
 * UX-004: 확정 버튼에 aria-describedby 툴팁 추가
 *   "내 타일로 30점 이상 새 멜드를 만들면 확정 가능.
 *    확정 후엔 보드 기존 멜드에도 이어붙일 수 있어요."
 *
 * @see docs/02-design/12-player-lifecycle-design.md 섹션 3.6
 * @see docs/02-design/53-ux004-extend-lock-copy.md §2.2
 */
const ActionBar = memo(function ActionBar({
  isMyTurn,
  drawPileCount,
  confirmBusy = false,
  onDraw,
  onUndo,
  onConfirm,
  onPass,
  confirmEnabled,
  resetEnabled,
  drawEnabled,
}: ActionBarProps) {
  const isDrawPileEmpty = drawPileCount === 0;

  // useTurnActions가 SSOT — prop 값을 그대로 사용한다.
  // confirmBusy는 Issue #48 중복 클릭 방지용 추가 gate로만 사용.
  const effectiveConfirmEnabled = confirmEnabled && !confirmBusy;
  const effectiveResetEnabled = resetEnabled;
  const effectiveDrawEnabled = drawEnabled;

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
                disabled={!effectiveDrawEnabled}
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
                disabled={!effectiveDrawEnabled}
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
              disabled={!effectiveResetEnabled}
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

            {/* 확정 버튼: C-3: 내 턴이고, pending 배치가 있고, 모든 그룹이 유효할 때만 활성 */}
            {/* Issue #48: confirmBusy=true 이면 서버 응답 대기 중 — 중복 클릭 차단 */}
            {/* UX-004: aria-describedby 툴팁 — hover/focus 시 초기 등록 규칙 안내 */}
            <div className="relative group flex-1">
              <button
                type="button"
                onClick={onConfirm}
                disabled={!effectiveConfirmEnabled}
                className={[
                  "w-full py-2.5 rounded-xl font-bold text-tile-sm",
                  "bg-warning text-gray-900 hover:bg-yellow-400",
                  "disabled:opacity-40 disabled:cursor-not-allowed",
                  "transition-colors",
                ].join(" ")}
                aria-label="배치 확정"
                aria-describedby="confirm-tooltip"
              >
                확정
              </button>
              {/* UX-004 툴팁 (docs/02-design/53-ux004-extend-lock-copy.md §2.2) */}
              <div
                id="confirm-tooltip"
                role="tooltip"
                className={[
                  "absolute bottom-full mb-2 left-1/2 -translate-x-1/2",
                  "invisible group-hover:visible group-focus-within:visible",
                  "w-56 bg-card-bg border border-border rounded-lg px-3 py-2",
                  "text-tile-xs text-text-secondary text-center z-50",
                  "pointer-events-none",
                ].join(" ")}
              >
                내 타일로 30점 이상 새 멜드를 만들면 확정 가능.{" "}
                확정 후엔 보드 기존 멜드에도 이어붙일 수 있어요.
              </div>
            </div>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
});

ActionBar.displayName = "ActionBar";

export default ActionBar;
