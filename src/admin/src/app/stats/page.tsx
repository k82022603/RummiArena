export const dynamic = "force-dynamic";

import { getAiModelStats, getPersonaStats, getDifficultyStats } from "@/lib/api";
import StatsChart from "@/components/StatsChart";

const PERSONA_LABEL: Record<string, string> = {
  shark:      "Shark (공격형)",
  fox:        "Fox (전략형)",
  calculator: "Calculator (분석형)",
  wall:       "Wall (수비형)",
  wildcard:   "Wildcard (변칙형)",
  rookie:     "Rookie (입문형)",
};

const DIFFICULTY_LABEL: Record<string, string> = {
  expert:       "고수",
  intermediate: "중수",
  beginner:     "하수",
};

export default async function StatsPage() {
  const [models, personas, difficulties] = await Promise.all([
    getAiModelStats(),
    getPersonaStats(),
    getDifficultyStats(),
  ]);

  return (
    <div>
      <h1 className="text-xl font-bold text-white mb-6">AI 통계</h1>

      {/* AI 모델별 승률 바 차트 */}
      <section className="bg-slate-800 border border-slate-700 rounded-lg p-5 mb-6">
        <h2 className="text-sm font-semibold text-slate-300 mb-4 uppercase tracking-wide">
          AI 모델별 승률
        </h2>
        <StatsChart data={models} />
        {/* 범례 */}
        <div className="flex gap-4 mt-4 flex-wrap">
          {models.map((m) => (
            <div key={m.model} className="flex items-center gap-1.5">
              <span
                className="w-3 h-3 rounded-sm flex-shrink-0"
                style={{ backgroundColor: m.color }}
                aria-hidden="true"
              />
              <span className="text-xs text-slate-400">
                {m.model} — {m.winRate.toFixed(1)}% ({m.totalGames}게임)
              </span>
            </div>
          ))}
        </div>
      </section>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* 캐릭터별 승률 테이블 */}
        <section className="bg-slate-800 border border-slate-700 rounded-lg p-5">
          <h2 className="text-sm font-semibold text-slate-300 mb-4 uppercase tracking-wide">
            캐릭터별 승률
          </h2>
          <div className="overflow-x-auto">
            <table className="w-full text-sm" aria-label="캐릭터별 승률">
              <thead className="text-slate-400 text-xs uppercase border-b border-slate-700">
                <tr>
                  <th className="py-2 text-left">캐릭터</th>
                  <th className="py-2 text-right">게임 수</th>
                  <th className="py-2 text-right">승</th>
                  <th className="py-2 text-right">승률</th>
                  <th className="py-2 text-right">평균 점수</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-700">
                {personas.map((p, idx) => (
                  <tr
                    key={p.persona}
                    className={idx % 2 === 0 ? "bg-slate-900" : ""}
                  >
                    <td className="py-2 text-slate-200">{PERSONA_LABEL[p.persona] ?? p.persona}</td>
                    <td className="py-2 text-right text-slate-400">{p.totalGames}</td>
                    <td className="py-2 text-right text-green-400">{p.wins}</td>
                    <td className="py-2 text-right text-slate-300">{p.winRate.toFixed(1)}%</td>
                    <td className={`py-2 text-right ${p.avgScore >= 0 ? "text-green-400" : "text-red-400"}`}>
                      {p.avgScore >= 0 ? `+${p.avgScore}` : p.avgScore}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        {/* 난이도별 평균 점수 */}
        <section className="bg-slate-800 border border-slate-700 rounded-lg p-5">
          <h2 className="text-sm font-semibold text-slate-300 mb-4 uppercase tracking-wide">
            난이도별 평균 점수
          </h2>
          <ul className="space-y-4">
            {difficulties.map((d) => {
              const maxScore = 60;
              const pct = Math.max(0, Math.min(100, ((d.avgScore + 30) / (maxScore + 30)) * 100));
              return (
                <li key={d.difficulty}>
                  <div className="flex justify-between text-sm mb-1">
                    <span className="text-slate-300">{DIFFICULTY_LABEL[d.difficulty] ?? d.difficulty}</span>
                    <span className={d.avgScore >= 0 ? "text-green-400" : "text-red-400"}>
                      {d.avgScore >= 0 ? `+${d.avgScore}` : d.avgScore} pts
                    </span>
                  </div>
                  <div className="h-3 bg-slate-700 rounded-full overflow-hidden">
                    <div
                      className={`h-full rounded-full ${d.avgScore >= 0 ? "bg-green-500" : "bg-red-500"}`}
                      style={{ width: `${pct}%` }}
                      role="progressbar"
                      aria-valuenow={d.avgScore}
                      aria-valuemin={-30}
                      aria-valuemax={maxScore}
                      aria-label={`${DIFFICULTY_LABEL[d.difficulty]} 평균 점수 ${d.avgScore}`}
                    />
                  </div>
                  <p className="text-xs text-slate-500 mt-1">
                    평균 {d.avgTurns}턴 &middot; {d.totalGames}게임
                  </p>
                </li>
              );
            })}
          </ul>
        </section>
      </div>
    </div>
  );
}
