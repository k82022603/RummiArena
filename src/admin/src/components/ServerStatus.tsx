/**
 * game-server 헬스 상태 표시 컴포넌트 (Server Component)
 *
 * - ok: 초록 배지
 * - degraded: 노랑 배지
 * - unreachable: 빨강 배지
 */

import type { HealthStatus } from "@/lib/types";

interface ServerStatusProps {
  health: HealthStatus;
  /** 활성 방 수 (fetchRooms 결과) */
  activeRooms: number;
}

const STATUS_STYLES: Record<HealthStatus["status"], string> = {
  ok: "bg-green-500/15 border-green-500/40 text-green-400",
  degraded: "bg-yellow-500/15 border-yellow-500/40 text-yellow-400",
  unreachable: "bg-red-500/15 border-red-500/40 text-red-400",
};

const STATUS_DOT: Record<HealthStatus["status"], string> = {
  ok: "bg-green-400",
  degraded: "bg-yellow-400",
  unreachable: "bg-red-400",
};

const STATUS_LABEL: Record<HealthStatus["status"], string> = {
  ok: "정상",
  degraded: "일부 장애",
  unreachable: "연결 불가",
};

export default function ServerStatus({
  health,
  activeRooms,
}: ServerStatusProps) {
  const styleClass = STATUS_STYLES[health.status];
  const dotClass = STATUS_DOT[health.status];
  const label = STATUS_LABEL[health.status];

  return (
    <div
      className={`rounded-lg border px-5 py-4 flex items-center justify-between ${styleClass}`}
      role="status"
      aria-label={`서버 상태: ${label}`}
    >
      <div className="flex items-center gap-3">
        {/* 상태 점 (pulse 애니메이션은 ok 때만) */}
        <span className="relative flex h-3 w-3" aria-hidden="true">
          {health.status === "ok" && (
            <span
              className={`animate-ping absolute inline-flex h-full w-full rounded-full opacity-75 ${dotClass}`}
            />
          )}
          <span
            className={`relative inline-flex rounded-full h-3 w-3 ${dotClass}`}
          />
        </span>

        <div>
          <p className="text-sm font-semibold">
            Game Server &mdash; {label}
          </p>
          {health.version && (
            <p className="text-xs opacity-70 mt-0.5">
              v{health.version}
              {health.uptime !== undefined && health.uptime > 0
                ? ` · 업타임 ${Math.floor(health.uptime / 60)}분`
                : ""}
            </p>
          )}
        </div>
      </div>

      <div className="text-right">
        <p className="text-2xl font-bold">{activeRooms}</p>
        <p className="text-xs opacity-70">활성 방</p>
      </div>
    </div>
  );
}
