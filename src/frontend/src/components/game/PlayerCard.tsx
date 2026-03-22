"use client";

import React, { memo } from "react";
import { motion, AnimatePresence } from "framer-motion";
import type { Player } from "@/types/game";
import TileBack from "@/components/tile/TileBack";
import { TierBadge } from "@/components/rankings/TierBadge";
import type { Tier } from "@/lib/rankings-api";

interface PlayerCardProps {
  player: Player;
  isCurrentTurn: boolean;
  isAIThinking: boolean;
  /** 플레이어의 ELO 티어 (없으면 미표시) */
  tier?: Tier;
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
 *
 * - 플레이어 닉네임, 타일 수, ELO 티어(TierBadge), 연결 상태 표시
 * - AI 플레이어는 AI 아이콘과 페르소나 정보 표시
 * - 타일 수 3장 이하: 빨간 강조로 역전 위험 표시
 * - AI 사고 중 펄싱 애니메이션
 */
const PlayerCard = memo(function PlayerCard({
  player,
  isCurrentTurn,
  isAIThinking,
  tier,
  className = "",
}: PlayerCardProps) {
  const isHuman = player.type === "HUMAN";
  const isAI = !isHuman;

  const displayName = isHuman
    ? (player as { displayName: string }).displayName
    : `${AI_TYPE_LABEL[player.type] ?? player.type} (${AI_PERSONA_LABEL[(player as { persona: string }).persona] ?? ""})`;

  const tileCount = player.tileCount ?? 0;
  const hasInitialMeld = player.hasInitialMeld ?? false;
  const isConnected =
    isAI || (player as { status: string }).status === "CONNECTED";

  // 타일 수가 3장 이하면 위험 강조 (역전 가능성)
  const isTileCountDanger = tileCount > 0 && tileCount <= 3;

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
        <div className="flex items-center gap-2 min-w-0">
          {/* 플레이어 타입 아이콘 */}
          <span
            className={[
              "w-6 h-6 rounded-full flex items-center justify-center flex-shrink-0",
              "text-[10px] font-bold",
              isHuman
                ? "bg-success/20 text-success"
                : "bg-color-ai/20 text-color-ai",
            ].join(" ")}
            aria-hidden="true"
            title={isHuman ? "인간 플레이어" : "AI 플레이어"}
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
            className="text-[10px] bg-warning/20 text-warning px-1.5 py-0.5 rounded font-bold flex-shrink-0"
          >
            내 차례
          </motion.span>
        )}
      </div>

      {/* ELO 티어 뱃지 + 연결 상태 */}
      <div className="flex items-center gap-1.5 mb-2">
        {tier && <TierBadge tier={tier} size="sm" />}
        <span
          className={[
            "w-2 h-2 rounded-full flex-shrink-0",
            isConnected ? "bg-success" : "bg-danger/70",
          ].join(" ")}
          aria-label={isConnected ? "연결됨" : "연결 끊김"}
          title={isConnected ? "연결됨" : "연결 끊김"}
        />
        <span className="text-tile-xs text-text-secondary">
          {isConnected ? "연결됨" : "끊김"}
        </span>
      </div>

      {/* 최초 등록 여부 */}
      <div className="flex items-center gap-1 mb-2">
        <span
          className={`w-2 h-2 rounded-full ${
            hasInitialMeld ? "bg-success" : "bg-danger/50"
          }`}
          aria-label={hasInitialMeld ? "최초 등록 완료" : "최초 등록 미완료"}
        />
        <span className="text-tile-xs text-text-secondary">
          {hasInitialMeld ? "등록 완료" : "등록 전"}
        </span>
      </div>

      {/* 타일 수 — 3장 이하면 빨간 강조 */}
      <div
        className={[
          "rounded-lg px-2 py-1",
          isTileCountDanger
            ? "bg-danger/10 border border-danger/30"
            : "",
        ]
          .filter(Boolean)
          .join(" ")}
      >
        {isTileCountDanger && (
          <p
            className="text-[9px] text-danger font-bold mb-0.5 text-center tracking-wide"
            aria-live="polite"
          >
            위험! {tileCount}장
          </p>
        )}
        <TileBack count={tileCount} />
      </div>

      {/* AI 페르소나 정보 */}
      {isAI && (
        <div className="mt-2 flex items-center gap-1 flex-wrap">
          <span className="text-[9px] text-color-ai/70 bg-color-ai/10 px-1.5 py-0.5 rounded">
            {AI_PERSONA_LABEL[
              (player as { persona: string }).persona
            ] ?? ""}
          </span>
          <span className="text-[9px] text-text-secondary">
            {(player as { difficulty: string }).difficulty === "beginner"
              ? "하수"
              : (player as { difficulty: string }).difficulty ===
                "intermediate"
              ? "중수"
              : "고수"}
          </span>
        </div>
      )}

      {/* AI 사고 중 */}
      <AnimatePresence>
        {isAIThinking && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            className="mt-2 flex items-center gap-1"
            role="status"
            aria-live="polite"
          >
            <motion.div
              animate={{ opacity: [0.4, 1, 0.4] }}
              transition={{ repeat: Infinity, duration: 1.2 }}
              className="w-1.5 h-1.5 rounded-full bg-color-ai"
              aria-hidden="true"
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
