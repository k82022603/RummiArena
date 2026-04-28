"use client";

/**
 * NextPlayerBlock — 다음 차례 플레이어 표시
 * 스펙 §3: playerCount === 2이면 렌더링하지 않음 (호출 측에서 처리)
 * 아바타: 18x18 원형, 이니셜 1글자
 */

interface NextPlayerBlockProps {
  player: {
    playerId: string;
    name: string;
    avatarChar: string;
    estimatedWaitSec: number;
  };
}

export default function NextPlayerBlock({ player }: NextPlayerBlockProps) {
  return (
    <div className="flex flex-col justify-center gap-0.5" aria-label="다음 플레이어">
      {/* 라벨 */}
      <span
        className="leading-none tracking-widest font-bold uppercase"
        style={{
          fontSize: 9,
          color: "#6b7280",
          letterSpacing: "1.2px",
          fontWeight: 700,
        }}
      >
        NEXT
      </span>

      {/* 아바타 + 이름 한 줄 */}
      <div className="flex items-center gap-1.5">
        {/* 원형 아바타 18x18 */}
        <div
          aria-hidden="true"
          className="flex-shrink-0 flex items-center justify-center rounded-full"
          style={{
            width: 18,
            height: 18,
            background: "#06b6d4",
            fontSize: 9,
            color: "#0d121b",
            fontWeight: 700,
          }}
        >
          {player.avatarChar.charAt(0).toUpperCase()}
        </div>

        <span
          className="leading-snug truncate max-w-[80px]"
          style={{ fontSize: 13, color: "#f8fafc", fontWeight: 600 }}
        >
          {player.name}
        </span>
      </div>

      {/* 대기 시간 메타 */}
      <span
        className="leading-none"
        style={{ fontSize: 11, color: "#94a3b8" }}
      >
        ~{player.estimatedWaitSec}s 대기
      </span>
    </div>
  );
}
