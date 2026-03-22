import Link from "next/link";
import type { AdminGame, GameStatus } from "@/lib/types";

interface GameCardProps {
  game: AdminGame;
}

const STATUS_LABEL: Record<GameStatus, string> = {
  WAITING:  "대기 중",
  PLAYING:  "진행 중",
  FINISHED: "종료",
};

const STATUS_CLASS: Record<GameStatus, string> = {
  WAITING:  "bg-yellow-900 text-yellow-200",
  PLAYING:  "bg-green-900 text-green-200",
  FINISHED: "bg-slate-700 text-slate-300",
};

function elapsedMinutes(isoDate: string | null): string {
  if (!isoDate) return "-";
  const diff = Math.floor((Date.now() - new Date(isoDate).getTime()) / 60000);
  if (diff < 60) return `${diff}분`;
  return `${Math.floor(diff / 60)}시간 ${diff % 60}분`;
}

export default function GameCard({ game }: GameCardProps) {
  return (
    <tr className="border-b border-slate-700 hover:bg-slate-800 transition-colors">
      <td className="px-4 py-3">
        <Link
          href={`/games/${game.id}`}
          className="text-slate-200 font-medium hover:text-white hover:underline"
        >
          {game.roomCode}
        </Link>
      </td>
      <td className="px-4 py-3 text-slate-300">{game.roomName}</td>
      <td className="px-4 py-3 text-slate-300 text-center">
        {game.playerCount} / {game.maxPlayers}
      </td>
      <td className="px-4 py-3">
        <span className={`px-2 py-0.5 rounded text-xs font-semibold ${STATUS_CLASS[game.status]}`}>
          {STATUS_LABEL[game.status]}
        </span>
      </td>
      <td className="px-4 py-3 text-slate-400 text-sm">
        {game.startedAt ? new Date(game.startedAt).toLocaleTimeString("ko-KR", { hour: "2-digit", minute: "2-digit" }) : "-"}
      </td>
      <td className="px-4 py-3 text-slate-400 text-sm text-right">
        {elapsedMinutes(game.startedAt)}
      </td>
    </tr>
  );
}
