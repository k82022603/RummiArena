"use client";

/**
 * NowPlayingBlock — 현재 차례 플레이어 표시
 * 스펙 §4.1:
 *   - 내 차례: label-color-active = #f59e0b
 *   - 상대 차례: accent-opponent = #06b6d4
 */

interface NowPlayingBlockProps {
  player: {
    playerId: string;
    name: string;
    isMe: boolean;
    avatarColor: string;
  };
  contextLine: string;
}

export default function NowPlayingBlock({ player, contextLine }: NowPlayingBlockProps) {
  const labelColor = player.isMe ? "#f59e0b" : "#06b6d4";
  const labelText = player.isMe ? "YOUR TURN" : "PLAYING";

  return (
    <div className="flex flex-col justify-center gap-0.5">
      {/* 라벨 */}
      <span
        className="leading-none tracking-widest font-bold uppercase"
        style={{
          fontSize: 9,
          color: labelColor,
          letterSpacing: "1.2px",
          fontWeight: 700,
        }}
        aria-label={player.isMe ? "내 차례" : "상대 차례"}
      >
        {labelText}
      </span>

      {/* 플레이어 이름 */}
      <span
        className="leading-snug truncate max-w-[120px]"
        style={{ fontSize: 18, color: "#f8fafc", fontWeight: 700 }}
      >
        {player.name}
      </span>

      {/* 컨텍스트 라인 */}
      <span
        className="leading-none truncate max-w-[140px]"
        style={{ fontSize: 11, color: "#94a3b8" }}
      >
        {contextLine}
      </span>
    </div>
  );
}
