import { getDashboard, fetchHealth, fetchRooms } from "@/lib/api";
import ServerStatus from "@/components/ServerStatus";

interface StatCardProps {
  title: string;
  value: string | number;
  sub?: string;
  accent?: string;
}

function StatCard({ title, value, sub, accent = "text-white" }: StatCardProps) {
  return (
    <div className="bg-slate-800 border border-slate-700 rounded-lg p-5">
      <p className="text-sm text-slate-400 mb-1">{title}</p>
      <p className={`text-3xl font-bold ${accent}`}>{value}</p>
      {sub && <p className="text-xs text-slate-500 mt-1">{sub}</p>}
    </div>
  );
}

export default async function DashboardPage() {
  const [data, health, rooms] = await Promise.all([
    getDashboard(),
    fetchHealth(),
    fetchRooms(),
  ]);

  const { ai, human } = data.aiVsHumanRatio;

  return (
    <div>
      <h1 className="text-xl font-bold text-white mb-6">대시보드</h1>

      {/* 서버 상태 배너 */}
      <div className="mb-6">
        <ServerStatus health={health} activeRooms={rooms.length} />
      </div>

      {/* 통계 카드 4개 */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
        <StatCard
          title="활성 게임"
          value={data.activeGames}
          sub="현재 진행 중인 게임 수"
          accent="text-green-400"
        />
        <StatCard
          title="현재 접속 유저"
          value={data.onlineUsers}
          sub="로그인 상태"
          accent="text-blue-400"
        />
        <StatCard
          title="오늘 완료 게임"
          value={data.todayFinishedGames}
          sub="자정 기준 누계"
          accent="text-yellow-400"
        />
        <StatCard
          title="AI vs Human 비율"
          value={`${ai}% / ${human}%`}
          sub="전체 플레이어 중 AI 참여율"
          accent="text-purple-400"
        />
      </div>

      {/* AI vs Human 시각 바 */}
      <div className="bg-slate-800 border border-slate-700 rounded-lg p-5">
        <p className="text-sm text-slate-400 mb-3">AI vs Human 플레이어 비율</p>
        <div className="flex h-6 rounded-full overflow-hidden">
          <div
            className="bg-purple-500 flex items-center justify-center text-xs text-white font-semibold"
            style={{ width: `${ai}%` }}
          >
            AI {ai}%
          </div>
          <div
            className="bg-blue-500 flex items-center justify-center text-xs text-white font-semibold"
            style={{ width: `${human}%` }}
          >
            Human {human}%
          </div>
        </div>
      </div>
    </div>
  );
}
