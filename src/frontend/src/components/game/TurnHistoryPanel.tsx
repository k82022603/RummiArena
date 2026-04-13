"use client";

import React, { memo, useMemo } from "react";
import type { TileCode } from "@/types/tile";
import type { Player } from "@/types/game";
import type { TurnPlacement } from "@/store/gameStore";
import Tile from "@/components/tile/Tile";

interface TurnHistoryPanelProps {
  history: TurnPlacement[];
  players: Player[];
  mySeat: number;
  className?: string;
}

const AI_TYPE_LABEL: Record<string, string> = {
  AI_OPENAI: "GPT",
  AI_CLAUDE: "Claude",
  AI_DEEPSEEK: "DeepSeek",
  AI_LLAMA: "LLaMA",
};

function getPlayerLabel(seat: number, players: Player[], mySeat: number): string {
  if (seat === mySeat) return "나";
  const p = players.find((pl) => pl.seat === seat);
  if (!p) return `Seat ${seat}`;
  if (p.type === "HUMAN") return p.displayName;
  return AI_TYPE_LABEL[p.type] ?? p.type;
}

function formatRelativeTime(placedAt: number, now: number): string {
  const diffSec = Math.max(0, Math.floor((now - placedAt) / 1000));
  if (diffSec < 60) return `${diffSec}초 전`;
  const diffMin = Math.floor(diffSec / 60);
  if (diffMin < 60) return `${diffMin}분 전`;
  const diffHr = Math.floor(diffMin / 60);
  return `${diffHr}시간 전`;
}

const TurnHistoryPanel = memo(function TurnHistoryPanel({
  history,
  players,
  mySeat,
  className = "",
}: TurnHistoryPanelProps) {
  // 최신 턴을 상단에 표시 (역순)
  const reversed = useMemo(() => [...history].reverse(), [history]);
  const now = Date.now();

  return (
    <aside
      className={[
        "flex flex-col bg-panel-bg border-l border-border overflow-hidden",
        className,
      ].join(" ")}
      aria-label="턴 히스토리"
    >
      <div className="flex-shrink-0 px-3 py-2 border-b border-border">
        <h2 className="text-tile-sm font-semibold text-text-primary">
          턴 히스토리
        </h2>
        <p className="text-[10px] text-text-secondary mt-0.5">
          최근 {history.length}턴 · 스크롤 가능
        </p>
      </div>

      <div className="flex-1 overflow-y-auto px-3 py-2 space-y-2">
        {reversed.length === 0 ? (
          <p className="text-tile-xs text-text-secondary/70 text-center py-8">
            아직 턴 기록 없음
          </p>
        ) : (
          reversed.map((entry) => {
            const label = getPlayerLabel(entry.seat, players, mySeat);
            const isMine = entry.seat === mySeat;
            const hasPlaced = entry.placedTiles.length > 0;
            return (
              <div
                key={`${entry.turnNumber}-${entry.seat}-${entry.placedAt}`}
                className={[
                  "rounded-lg border p-2",
                  isMine
                    ? "bg-green-500/5 border-green-500/30"
                    : "bg-orange-500/5 border-orange-500/30",
                ].join(" ")}
              >
                {/* 상단 메타 */}
                <div className="flex items-center justify-between gap-2 mb-1">
                  <div className="flex items-center gap-1.5 min-w-0">
                    <span className="text-[10px] font-mono text-text-secondary">
                      턴 #{entry.turnNumber}
                    </span>
                    <span
                      className={[
                        "text-tile-xs font-semibold truncate",
                        isMine ? "text-green-400" : "text-orange-400",
                      ].join(" ")}
                    >
                      {label}
                    </span>
                  </div>
                  <span className="text-[9px] text-text-secondary/70 flex-shrink-0">
                    {formatRelativeTime(entry.placedAt, now)}
                  </span>
                </div>

                {/* 액션 및 타일 */}
                {hasPlaced ? (
                  <>
                    <p className="text-[10px] text-text-secondary mb-1">
                      배치 {entry.placedTiles.length}장
                    </p>
                    <div className="flex flex-wrap gap-0.5">
                      {entry.placedTiles.map((code, idx) => (
                        <Tile
                          key={`${code}-${idx}`}
                          code={code as TileCode}
                          size="icon"
                        />
                      ))}
                    </div>
                  </>
                ) : (
                  <p className="text-[10px] text-text-secondary/70 italic">
                    {entry.action === "draw"
                      ? "드로우"
                      : entry.action === "timeout"
                        ? "시간 초과 → 자동 드로우"
                        : entry.action === "forfeit"
                          ? "기권"
                          : entry.action}
                  </p>
                )}
              </div>
            );
          })
        )}
      </div>
    </aside>
  );
});

TurnHistoryPanel.displayName = "TurnHistoryPanel";

export default TurnHistoryPanel;
