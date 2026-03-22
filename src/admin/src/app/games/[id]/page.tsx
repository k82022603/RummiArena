import { notFound } from "next/navigation";
import Link from "next/link";
import { getGame } from "@/lib/api";
import type { PlayerType } from "@/lib/types";

const PLAYER_TYPE_LABEL: Record<PlayerType, string> = {
  HUMAN:        "Human",
  AI_CLAUDE:    "Claude",
  AI_OPENAI:    "OpenAI",
  AI_DEEPSEEK:  "DeepSeek",
  AI_LLAMA:     "LLaMA",
};

const PLAYER_TYPE_COLOR: Record<PlayerType, string> = {
  HUMAN:        "bg-blue-900 text-blue-200",
  AI_CLAUDE:    "bg-yellow-900 text-yellow-200",
  AI_OPENAI:    "bg-green-900 text-green-200",
  AI_DEEPSEEK:  "bg-purple-900 text-purple-200",
  AI_LLAMA:     "bg-teal-900 text-teal-200",
};

interface PageProps {
  params: Promise<{ id: string }>;
}

export default async function GameDetailPage({ params }: PageProps) {
  const { id } = await params;
  const game = await getGame(id);

  if (!game) notFound();

  return (
    <div>
      {/* 뒤로가기 + 제목 */}
      <div className="flex items-center gap-3 mb-6">
        <Link
          href="/games"
          className="text-slate-400 hover:text-white text-sm"
          aria-label="게임 목록으로 돌아가기"
        >
          &larr; 목록
        </Link>
        <h1 className="text-xl font-bold text-white">
          {game.roomName}
          <span className="ml-2 text-base text-slate-400 font-mono">[{game.roomCode}]</span>
        </h1>
        <span
          className={[
            "px-2 py-0.5 rounded text-xs font-semibold",
            game.status === "PLAYING"  ? "bg-green-900 text-green-200"  :
            game.status === "WAITING"  ? "bg-yellow-900 text-yellow-200" :
            "bg-slate-700 text-slate-300",
          ].join(" ")}
        >
          {game.status === "PLAYING" ? "진행 중" : game.status === "WAITING" ? "대기 중" : "종료"}
        </span>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* 플레이어 현황 */}
        <section className="bg-slate-800 border border-slate-700 rounded-lg p-5">
          <h2 className="text-sm font-semibold text-slate-300 mb-4 uppercase tracking-wide">
            플레이어 현황
          </h2>
          <ul className="space-y-3">
            {game.players.map((p) => (
              <li
                key={p.seat}
                className={[
                  "flex items-center gap-3 px-3 py-2 rounded-md border",
                  p.isCurrentTurn
                    ? "border-green-600 bg-green-950"
                    : "border-slate-700 bg-slate-900",
                ].join(" ")}
              >
                {/* 자리 번호 */}
                <span className="w-6 h-6 rounded-full bg-slate-700 text-slate-300 text-xs flex items-center justify-center flex-shrink-0">
                  {p.seat + 1}
                </span>

                {/* 이름 + 타입 */}
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-slate-100 truncate">
                    {p.displayName}
                    {p.isCurrentTurn && (
                      <span className="ml-2 text-xs text-green-400">현재 턴</span>
                    )}
                  </p>
                  <span className={`text-xs px-1.5 py-0.5 rounded ${PLAYER_TYPE_COLOR[p.type]}`}>
                    {PLAYER_TYPE_LABEL[p.type]}
                  </span>
                </div>

                {/* 타일 수 + 초기 멜드 */}
                <div className="text-right flex-shrink-0">
                  <p className="text-sm font-semibold text-slate-200">
                    {p.tileCount}
                    <span className="text-xs text-slate-400 ml-1">타일</span>
                  </p>
                  <p className="text-xs text-slate-500">
                    {p.hasInitialMeld ? "초기 멜드 완료" : "미완료"}
                  </p>
                </div>
              </li>
            ))}
          </ul>
        </section>

        {/* 최근 행동 로그 */}
        <section className="bg-slate-800 border border-slate-700 rounded-lg p-5">
          <h2 className="text-sm font-semibold text-slate-300 mb-4 uppercase tracking-wide">
            최근 행동 로그 (최대 5건)
          </h2>
          {game.recentActions.length === 0 ? (
            <p className="text-slate-500 text-sm">아직 기록이 없습니다.</p>
          ) : (
            <ol className="space-y-2">
              {game.recentActions.slice(0, 5).map((log) => (
                <li key={log.seq} className="flex items-start gap-3 text-sm">
                  <span className="text-xs text-slate-500 font-mono w-6 flex-shrink-0 mt-0.5">
                    #{log.seq}
                  </span>
                  <div className="flex-1 min-w-0">
                    <p className="text-slate-200 font-medium truncate">{log.playerName}</p>
                    <p className="text-slate-400 font-mono text-xs truncate">{log.action}</p>
                  </div>
                  <span className="text-xs text-slate-500 flex-shrink-0">
                    {new Date(log.timestamp).toLocaleTimeString("ko-KR", {
                      hour: "2-digit",
                      minute: "2-digit",
                      second: "2-digit",
                    })}
                  </span>
                </li>
              ))}
            </ol>
          )}
        </section>

        {/* 보드 상태 (텍스트 표시) */}
        <section className="lg:col-span-2 bg-slate-800 border border-slate-700 rounded-lg p-5">
          <h2 className="text-sm font-semibold text-slate-300 mb-3 uppercase tracking-wide">
            보드 상태 (타일 분포)
          </h2>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            {game.players.map((p) => (
              <div key={p.seat} className="bg-slate-900 rounded-md p-3 border border-slate-700">
                <p className="text-xs text-slate-400 mb-1 truncate">{p.displayName}</p>
                <p className="text-2xl font-bold text-slate-100">{p.tileCount}</p>
                <p className="text-xs text-slate-500">보유 타일</p>
                {p.score !== undefined && (
                  <p className={`text-sm font-semibold mt-1 ${p.score >= 0 ? "text-green-400" : "text-red-400"}`}>
                    {p.score >= 0 ? `+${p.score}` : `${p.score}`} pts
                  </p>
                )}
              </div>
            ))}
          </div>
        </section>
      </div>
    </div>
  );
}
