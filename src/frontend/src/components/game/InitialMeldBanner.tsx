"use client";

import { useState, useEffect } from "react";
import { AnimatePresence, motion } from "framer-motion";

interface InitialMeldBannerProps {
  hasInitialMeld: boolean;
  /** 방 ID (sessionStorage 키 생성용 중복 방지) */
  roomId: string;
}

/**
 * UX-004 초기 등록 안내 배너 (최초 진입 1회)
 *
 * - 발동: hasInitialMeld=false 상태로 게임 진입 시 1회만 표시
 * - 소멸: 닫기 버튼 클릭 OR hasInitialMeld=true 전환 시 자동 소멸
 * - 영속: sessionStorage에 ux004-banner-shown-{roomId}=1 저장 → 재접속 시 재표시 안 함
 *
 * 카피 (docs/02-design/53-ux004-extend-lock-copy.md §2.3):
 *   "첫 번째 확정은 내 타일로 30점 이상 새 멜드를 만드는 것부터.
 *    그 다음 턴부터 보드 이어붙이기가 가능해집니다."
 */
export default function InitialMeldBanner({ hasInitialMeld, roomId }: InitialMeldBannerProps) {
  const storageKey = `ux004-banner-shown-${roomId}`;
  const alreadyShown =
    typeof window !== "undefined" && !!sessionStorage.getItem(storageKey);

  const [dismissed, setDismissed] = useState(alreadyShown);

  // hasInitialMeld=true 전환 시 자동 소멸
  useEffect(() => {
    if (hasInitialMeld) {
      setDismissed(true);
    }
  }, [hasInitialMeld]);

  const handleDismiss = () => {
    setDismissed(true);
    if (typeof window !== "undefined") {
      sessionStorage.setItem(storageKey, "1");
    }
  };

  const shouldShow = !hasInitialMeld && !dismissed;

  return (
    <AnimatePresence>
      {shouldShow && (
        <motion.div
          key="initial-meld-banner"
          data-testid="initial-meld-banner"
          initial={{ opacity: 0, y: -8 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -8 }}
          transition={{ duration: 0.2 }}
          className={[
            "flex items-center justify-between gap-3",
            "px-4 py-2 rounded-lg",
            "bg-warning/10 border border-warning/30",
            "text-warning text-tile-xs",
            "flex-shrink-0",
          ].join(" ")}
          role="status"
          aria-live="polite"
          aria-label="초기 등록 안내"
        >
          <div className="flex items-start gap-2 min-w-0">
            <svg
              xmlns="http://www.w3.org/2000/svg"
              viewBox="0 0 20 20"
              fill="currentColor"
              className="w-3.5 h-3.5 flex-shrink-0 mt-0.5"
              aria-hidden="true"
            >
              <path
                fillRule="evenodd"
                d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a.75.75 0 000 1.5h.253a.25.25 0 01.244.304l-.459 2.066A1.75 1.75 0 0010.747 15H11a.75.75 0 000-1.5h-.253a.25.25 0 01-.244-.304l.459-2.066A1.75 1.75 0 009.253 9H9z"
                clipRule="evenodd"
              />
            </svg>
            <p className="leading-relaxed">
              첫 번째 확정은 내 타일로 30점 이상 새 멜드를 만드는 것부터.{" "}
              그 다음 턴부터 보드 이어붙이기가 가능해집니다.
            </p>
          </div>
          <button
            type="button"
            onClick={handleDismiss}
            className="flex-shrink-0 text-warning/60 hover:text-warning transition-colors p-0.5 rounded"
            aria-label="초기 등록 안내 닫기"
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              viewBox="0 0 20 20"
              fill="currentColor"
              className="w-3.5 h-3.5"
              aria-hidden="true"
            >
              <path d="M6.28 5.22a.75.75 0 00-1.06 1.06L8.94 10l-3.72 3.72a.75.75 0 101.06 1.06L10 11.06l3.72 3.72a.75.75 0 101.06-1.06L11.06 10l3.72-3.72a.75.75 0 00-1.06-1.06L10 8.94 6.28 5.22z" />
            </svg>
          </button>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
