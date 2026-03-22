export const dynamic = "force-dynamic";

import { getGames } from "@/lib/api";
import GameCard from "@/components/GameCard";

export default async function GamesPage() {
  const games = await getGames();

  const active   = games.filter((g) => g.status === "PLAYING").length;
  const waiting  = games.filter((g) => g.status === "WAITING").length;
  const finished = games.filter((g) => g.status === "FINISHED").length;

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-xl font-bold text-white">활성 게임 목록</h1>
        <div className="flex gap-4 text-sm">
          <span className="text-green-400">진행 중 {active}</span>
          <span className="text-yellow-400">대기 중 {waiting}</span>
          <span className="text-slate-400">종료 {finished}</span>
        </div>
      </div>

      <div className="overflow-x-auto rounded-lg border border-slate-700">
        <table className="w-full text-sm" aria-label="활성 게임 목록">
          <thead className="bg-slate-800 text-slate-400 uppercase text-xs tracking-wider">
            <tr>
              <th className="px-4 py-3 text-left">방 코드</th>
              <th className="px-4 py-3 text-left">방 이름</th>
              <th className="px-4 py-3 text-center">참여자</th>
              <th className="px-4 py-3 text-left">상태</th>
              <th className="px-4 py-3 text-left">시작 시각</th>
              <th className="px-4 py-3 text-right">경과 시간</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-700">
            {games.map((game) => (
              <GameCard key={game.id} game={game} />
            ))}
          </tbody>
        </table>
      </div>

      {games.length === 0 && (
        <p className="text-slate-500 text-center py-12">활성 게임이 없습니다.</p>
      )}
    </div>
  );
}
