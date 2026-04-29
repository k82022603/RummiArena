"use client";

import { useEffect, useRef } from "react";
import { AnimatePresence, motion } from "framer-motion";

const TOAST_DURATION_MS = 4000;

export interface ExtendLockToastProps {
  /** GameClient에서 제어 (setShowExtendLockToast) */
  visible: boolean;
  /** 4초 후 자동 소멸 콜백 */
  onDismiss?: () => void;
}

/**
 * UX-004 초기 등록 잠금 안내 토스트
 *
 * - 발동: hasInitialMeld=false 상태에서 서버 확정 멜드 위로 드롭 시 (FINDING-01 early-return 직전)
 * - 위치: fixed top-24 (ErrorToast top-16 아래)
 * - 4초 자동 소멸
 * - 같은 턴 내 1회만 표시 (GameClient에서 useRef으로 추적)
 *
 * 카피 (docs/02-design/53-ux004-extend-lock-copy.md §2.1):
 *   "초기 등록(30점)을 확정한 뒤 보드 멜드에 이어붙일 수 있어요.
 *    '확정' 버튼을 먼저 눌러주세요."
 *
 * a11y: role="status" aria-live="polite" aria-atomic="true"
 *   - 에러가 아닌 규칙 안내이므로 assertive 대신 polite 사용
 */
export default function ExtendLockToast({ visible, onDismiss }: ExtendLockToastProps) {
  const onDismissRef = useRef(onDismiss);
  onDismissRef.current = onDismiss;

  useEffect(() => {
    if (!visible) return;

    const timer = setTimeout(() => {
      onDismissRef.current?.();
    }, TOAST_DURATION_MS);

    return () => clearTimeout(timer);
  }, [visible]);

  return (
    <AnimatePresence>
      {visible && (
        <motion.div
          key="extend-lock-toast"
          data-testid="extend-lock-toast"
          initial={{ opacity: 0, y: -12 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -12 }}
          transition={{ type: "spring", stiffness: 400, damping: 30 }}
          className={[
            "fixed top-24 left-1/2 -translate-x-1/2 z-50",
            "flex items-start gap-2",
            "bg-warning/20 border border-warning/60 text-warning",
            "rounded-xl shadow-lg",
            "px-4 py-3",
            "text-tile-sm font-medium",
            "max-w-sm w-max",
            "pointer-events-none select-none",
          ].join(" ")}
          role="status"
          aria-live="polite"
          aria-atomic="true"
          aria-label="초기 등록 미완료 안내: 30점 확정 후 보드 이어붙이기 가능"
        >
          {/* 경고 아이콘 (info 계열) */}
          <svg
            xmlns="http://www.w3.org/2000/svg"
            viewBox="0 0 20 20"
            fill="currentColor"
            className="w-4 h-4 flex-shrink-0 mt-0.5"
            aria-hidden="true"
          >
            <path
              fillRule="evenodd"
              d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a.75.75 0 000 1.5h.253a.25.25 0 01.244.304l-.459 2.066A1.75 1.75 0 0010.747 15H11a.75.75 0 000-1.5h-.253a.25.25 0 01-.244-.304l.459-2.066A1.75 1.75 0 009.253 9H9z"
              clipRule="evenodd"
            />
          </svg>
          <span className="leading-relaxed">
            초기 등록(30점)을 확정한 뒤 보드 멜드에 이어붙일 수 있어요.{" "}
            &apos;확정&apos; 버튼을 먼저 눌러주세요.
          </span>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
