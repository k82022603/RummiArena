"use client";

import React, { memo } from "react";
import { motion, AnimatePresence } from "framer-motion";
import type { Player } from "@/types/game";
import TileBack from "@/components/tile/TileBack";
import { TierBadge } from "@/components/rankings/TierBadge";
import type { Tier } from "@/lib/rankings-api";
import { getPlayerDisplayName, AI_PERSONA_LABEL } from "@/lib/player-display";

interface PlayerCardProps {
  player: Player;
  isCurrentTurn: boolean;
  isAIThinking: boolean;
  /** 플레이어의 ELO 티어 (없으면 미표시) */
  tier?: Tier;
  /** Grace Period 카운트다운 남은 초 (연결 끊김 시). undefined이면 끊기지 않은 상태. */
  disconnectCountdown?: number;
  className?: string;
}

/**
 * 플레이어 카드 컴포넌트
 *
 * - 플레이어 닉네임, 타일 수, ELO 티어(TierBadge), 연결 상태 표시
 * - AI 플레이어는 AI 아이콘과 페르소나 정보 표시
 * - 타일 수 3장 이하: 빨간 강조로 역전 위험 표시
 * - AI 사고 중 펄싱 애니메이션
 * - FORFEITED: 회색 비활성 + "기권" 배지
 * - DISCONNECTED: "연결 끊김" 배지 + Grace Period 카운트다운
 */
const PlayerCard = memo(function PlayerCard({
  player,
  isCurrentTurn,
  isAIThinking,
  tier,
  disconnectCountdown,
  className = "",
}: PlayerCardProps) {
  const isHuman = player.type === "HUMAN";
  const isAI = !isHuman;
  const playerStatus = (player as { status?: string }).status;
  const isForfeited = playerStatus === "FORFEITED";
  const isDisconnected = !isForfeited && !isAI && playerStatus === "DISCONNECTED";

  const displayName = getPlayerDisplayName(
    {
      type: player.type,
      seat: (player as { seat?: number }).seat,
      displayName: (player as { displayName?: string }).displayName,
      persona: (player as { persona?: string }).persona,
    },
    `Seat ${(player as { seat?: number }).seat ?? "?"}`
  );

  const tileCount = player.tileCount ?? 0;
  const hasInitialMeld = player.hasInitialMeld ?? false;
  const isConnected =
    isAI || playerStatus === "CONNECTED";

  // 타일 수가 3장 이하면 위험 강조 (역전 가능성)
  const isTileCountDanger = tileCount > 0 && tileCount <= 3;

  return (
    <motion.div
      animate={
        isForfeited
          ? { borderColor: "#484F58", boxShadow: "none", opacity: 0.5 }
          : isCurrentTurn
          ? { borderColor: "#F3C623", boxShadow: "0 0 0 2px #F3C623", opacity: 1 }
          : { borderColor: "#30363D", boxShadow: "none", opacity: 1 }
      }
      transition={{ duration: 0.3 }}
      className={[
        "p-3 rounded-xl bg-card-bg border relative",
        "transition-colors",
        isForfeited ? "grayscale" : "",
        className,
      ].join(" ")}
      aria-label={`${displayName} 플레이어 카드${isForfeited ? " (기권)" : isDisconnected ? " (연결 끊김)" : ""}`}
    >
      {/* 기권 오버레이 배지 */}
      {isForfeited && (
        <div
          className="absolute inset-0 rounded-xl flex items-center justify-center z-10 pointer-events-none"
          aria-hidden="true"
        >
          <span className="bg-danger/90 text-white text-tile-xs font-bold px-3 py-1 rounded-lg shadow-lg -rotate-12">
            기권
          </span>
        </div>
      )}

      {/* 연결 끊김 카운트다운 배지 */}
      {isDisconnected && !isForfeited && (
        <div
          className="absolute top-1 right-1 z-10"
          role="status"
          aria-live="polite"
          aria-label={`연결 끊김, ${disconnectCountdown ?? 0}초 후 기권 처리`}
        >
          <span className="bg-amber-500/90 text-gray-900 text-[10px] font-bold px-1.5 py-0.5 rounded animate-pulse">
            끊김 {disconnectCountdown != null ? `${disconnectCountdown}s` : ""}
          </span>
        </div>
      )}

      {/* 상단: 이름 + 턴 표시 */}
      {/* BUG-UI-007: 이름과 배지를 2행으로 분리하여 잘림 방지 */}
      <div className="mb-2">
        <div className="flex items-center gap-2 min-w-0">
          {/* 플레이어 타입 아이콘 */}
          <span
            className={[
              "w-5 h-5 rounded-full flex items-center justify-center flex-shrink-0",
              "text-[9px] font-bold",
              isForfeited
                ? "bg-gray-600/20 text-gray-500"
                : isHuman
                ? "bg-success/20 text-success"
                : "bg-color-ai/20 text-color-ai",
            ].join(" ")}
            aria-hidden="true"
            title={isForfeited ? "기권한 플레이어" : isHuman ? "인간 플레이어" : "AI 플레이어"}
          >
            {isForfeited ? "X" : isHuman ? "H" : "A"}
          </span>

          <span
            className={[
              "text-tile-base font-medium truncate flex-1 min-w-0",
              isForfeited ? "text-text-secondary line-through" : "text-text-primary",
            ].join(" ")}
            title={displayName}
          >
            {displayName}
          </span>

          {/* 현재 턴 표시 -- 아이콘 행에 함께 배치하되 축소된 크기 */}
          {isCurrentTurn && !isForfeited && (
            <motion.span
              initial={{ opacity: 0, scale: 0 }}
              animate={{ opacity: 1, scale: 1 }}
              className="text-[9px] bg-warning/20 text-warning px-1 py-0.5 rounded font-bold flex-shrink-0 whitespace-nowrap"
            >
              내 차례
            </motion.span>
          )}
        </div>
      </div>

      {/* ELO 티어 뱃지 + 연결 상태 */}
      <div className="flex items-center gap-1.5 mb-2">
        {tier && <TierBadge tier={tier} size="sm" />}
        <span
          className={[
            "w-2 h-2 rounded-full flex-shrink-0",
            isForfeited
              ? "bg-gray-500"
              : isDisconnected
              ? "bg-amber-500"
              : isConnected
              ? "bg-success"
              : "bg-danger/70",
          ].join(" ")}
          aria-label={
            isForfeited ? "기권"
            : isDisconnected ? "연결 끊김 (재연결 대기)"
            : isConnected ? "연결됨"
            : "연결 끊김"
          }
          title={
            isForfeited ? "기권"
            : isDisconnected ? "연결 끊김 (재연결 대기)"
            : isConnected ? "연결됨"
            : "연결 끊김"
          }
        />
        <span className="text-tile-xs text-text-secondary">
          {isForfeited ? "기권" : isDisconnected ? "끊김 (대기)" : isConnected ? "연결됨" : "끊김"}
        </span>
      </div>

      {/* 최초 등록 여부 -- 기권 시 숨김 */}
      {!isForfeited && (
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
      )}

      {/* 타일 수 -- 기권 시 숨김 */}
      {!isForfeited && (
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
      )}

      {/* AI 페르소나 정보 -- 기권 시 숨김 */}
      {isAI && !isForfeited && (
        <div className="mt-2 flex items-center gap-1 flex-wrap">
          <span className="text-[9px] text-color-ai/70 bg-color-ai/10 px-1.5 py-0.5 rounded">
            {AI_PERSONA_LABEL[
              (player as { persona: string }).persona
            ] ?? ""}
          </span>
          <span className="text-[9px] text-text-secondary">
            {(() => {
              const diff = (player as { difficulty?: string }).difficulty;
              return diff === "beginner" ? "하수"
                : diff === "intermediate" ? "중수"
                : diff === "expert" ? "고수"
                : "—";
            })()}
          </span>
        </div>
      )}

      {/* AI 사고 중 -- 기권 시 숨김 */}
      <AnimatePresence>
        {isAIThinking && !isForfeited && (
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
