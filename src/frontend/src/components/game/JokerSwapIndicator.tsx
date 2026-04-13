"use client";

import { memo } from "react";
import { motion, AnimatePresence } from "framer-motion";
import type { TileCode } from "@/types/tile";
import Tile from "@/components/tile/Tile";

interface JokerSwapIndicatorProps {
  recoveredJokers: TileCode[];
}

/**
 * 회수된 조커 표시 컴포넌트 (P3 — §6.2 유형 4)
 *
 * 규칙: 테이블 조커를 실제 타일로 교체해서 회수한 조커는 반드시
 * 같은 턴 내에 다른 세트에 재사용해야 한다. 미사용 시 ConfirmTurn이 차단된다.
 *
 * UX 역할:
 * - 회수된 조커 장수/타일 코드를 시각적으로 강조
 * - 경고 배너로 사용자에게 같은 턴 내 사용 의무 고지
 */
const JokerSwapIndicator = memo(function JokerSwapIndicator({
  recoveredJokers,
}: JokerSwapIndicatorProps) {
  return (
    <AnimatePresence>
      {recoveredJokers.length > 0 && (
        <motion.div
          initial={{ opacity: 0, y: -6 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -6 }}
          role="status"
          aria-live="polite"
          className="flex items-center gap-2 px-3 py-1.5 rounded-lg border-2 border-warning/60 bg-warning/10 shadow-[0_0_8px_rgba(234,179,8,0.35)]"
          data-testid="joker-swap-indicator"
        >
          <span className="text-tile-xs font-semibold text-warning">
            회수한 조커 {recoveredJokers.length}장
          </span>
          <div className="flex gap-1">
            {recoveredJokers.map((code, idx) => (
              <Tile key={`${code}-${idx}`} code={code} size="icon" />
            ))}
          </div>
          <span className="text-[10px] text-warning/80 leading-tight">
            같은 턴에 다른 세트에 사용 필수
          </span>
        </motion.div>
      )}
    </AnimatePresence>
  );
});

JokerSwapIndicator.displayName = "JokerSwapIndicator";

export default JokerSwapIndicator;
