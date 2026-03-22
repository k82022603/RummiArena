import type { AdminUser } from "@/lib/types";

interface UserTableProps {
  users: AdminUser[];
}

export default function UserTable({ users }: UserTableProps) {
  return (
    <div className="overflow-x-auto rounded-lg border border-slate-700">
      <table className="w-full text-sm" aria-label="유저 목록">
        <thead className="bg-slate-800 text-slate-400 uppercase text-xs tracking-wider">
          <tr>
            <th className="px-4 py-3 text-left">닉네임</th>
            <th className="px-4 py-3 text-left">이메일</th>
            <th className="px-4 py-3 text-left">가입 방식</th>
            <th className="px-4 py-3 text-left">가입일</th>
            <th className="px-4 py-3 text-right">게임 수</th>
            <th className="px-4 py-3 text-right">승</th>
            <th className="px-4 py-3 text-right">패</th>
            <th className="px-4 py-3 text-right">승률</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-700">
          {users.map((user, idx) => {
            const winRate =
              user.totalGames > 0
                ? ((user.wins / user.totalGames) * 100).toFixed(1)
                : "0.0";
            return (
              <tr
                key={user.id}
                className={[
                  "transition-colors hover:bg-slate-800",
                  idx % 2 === 0 ? "bg-slate-900" : "bg-slate-850",
                ].join(" ")}
              >
                <td className="px-4 py-3 text-slate-200 font-medium">{user.displayName}</td>
                <td className="px-4 py-3 text-slate-400">{user.email || "-"}</td>
                <td className="px-4 py-3">
                  <span
                    className={[
                      "px-2 py-0.5 rounded text-xs font-semibold",
                      user.provider === "google"
                        ? "bg-blue-900 text-blue-200"
                        : "bg-slate-700 text-slate-300",
                    ].join(" ")}
                  >
                    {user.provider === "google" ? "Google" : "Guest"}
                  </span>
                </td>
                <td className="px-4 py-3 text-slate-400">
                  {new Date(user.joinedAt).toLocaleDateString("ko-KR")}
                </td>
                <td className="px-4 py-3 text-slate-300 text-right">{user.totalGames}</td>
                <td className="px-4 py-3 text-green-400 text-right">{user.wins}</td>
                <td className="px-4 py-3 text-red-400 text-right">{user.losses}</td>
                <td className="px-4 py-3 text-slate-300 text-right">{winRate}%</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
