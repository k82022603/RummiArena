"use client";

import React, { memo } from "react";
import { motion, AnimatePresence } from "framer-motion";
import type { Player } from "@/types/game";
import TileBack from "@/components/tile/TileBack";

interface PlayerCardProps {
  player: Player;
  isCurrentTurn: boolean;
  isAIThinking: boolean;
  className?: string;
}

const AI_TYPE_LABEL: Record<string, string> = {
  AI_OPENAI: "GPT",
  AI_CLAUDE: "Claude",
  AI_DEEPSEEK: "DeepSeek",
  AI_LLAMA: "LLaMA",
};

const AI_PERSONA_LABEL: Record<string, string> = {
  rookie: "루키",
  calculator: "계산기",
  shark: "샤크",
  fox: "폭스",
  wall: "벽",
  wildcard: "와일드카드",
};

/**
 * 플레이어 카드 컴포넌트
 * 사이드패널에 플레이어 정보와 타일 수, 현재 턴 표시
 */
const PlayerCard = memo(function PlayerCard({
  player,
  isCurrentTurn,
  isAIThinking,
  className = "",
}: PlayerCardProps) {
  const isHuman = player.type === "HUMAN";
  const displayName =
    isHuman
      ? (player as { displayName: string }).displayName
      : `${AI_TYPE_LABEL[player.type] ?? player.type} (${AI_PERSONA_LABEL[(player as { persona: string }).persona] ?? ""})`;

  const tileCount = player.tileCount ?? 0;
  const hasInitialMeld = player.hasInitialMeld ?? false;

  return (
    <motion.div
      animate={
        isCurrentTurn
          ? { borderColor: "#F3C623", boxShadow: "0 0 0 2px #F3C623" }
          : { borderColor: "#30363D", boxShadow: "none" }
      }
      transition={{ duration: 0.3 }}
      className={[
        "p-3 rounded-xl bg-card-bg border",
        "transition-colors",
        className,
      ].join(" ")}
      aria-label={`${displayName} 플레이어 카드`}
    >
      {/* 상단: 이름 + 턴 표시 */}
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2">
          {/* 플레이어 타입 아이콘 */}
          <span
            className={[
              "w-6 h-6 rounded-full flex items-center justify-center",
              "text-[10px] font-bold",
              isHuman ? "bg-success/20 text-success" : "bg-color-ai/20 text-color-ai",
            ].join(" ")}
            aria-hidden="true"
          >
            {isHuman ? "H" : "A"}
          </span>

          <span className="text-tile-base text-text-primary font-medium truncate max-w-[100px]">
            {displayName}
          </span>
        </div>

        {/* 현재 턴 표시 */}
        {isCurrentTurn && (
          <motion.span
            initial={{ opacity: 0, scale: 0 }}
            animate={{ opacity: 1, scale: 1 }}
            className="text-[10px] bg-warning/20 text-warning px-1.5 py-0.5 rounded font-bold"
          >
            내 차례
          </motion.span>
        )}
      </div>

      {/* 최초 등록 여부 */}
      <div className="flex items-center gap-1 mb-2">
        <span
          className={`w-2 h-2 rounded-full ${hasInitialMeld ? "bg-success" : "bg-danger/50"}`}
          aria-label={hasInitialMeld ? "최초 등록 완료" : "최초 등록 미완료"}
        />
        <span className="text-tile-xs text-text-secondary">
          {hasInitialMeld ? "등록 완료" : "등록 전"}
        </span>
      </div>

      {/* 타일 수 */}
      <TileBack count={tileCount} />

      {/* AI 사고 중 */}
      <AnimatePresence>
        {isAIThinking && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            className="mt-2 flex items-center gap-1"
          >
            <motion.div
              animate={{ opacity: [0.4, 1, 0.4] }}
              transition={{ repeat: Infinity, duration: 1.2 }}
              className="w-1.5 h-1.5 rounded-full bg-color-ai"
            />
            <span className="text-tile-xs text-color-ai">사고 중...</span>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
});

PlayerCard.displayName = "PlayerCard";

export default PlayerCard;
