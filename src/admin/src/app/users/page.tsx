export const dynamic = "force-dynamic";

import { getUsers } from "@/lib/api";
import UserTable from "@/components/UserTable";

export default async function UsersPage() {
  const users = await getUsers();

  const google = users.filter((u) => u.provider === "google").length;
  const guest  = users.filter((u) => u.provider === "guest").length;

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-xl font-bold text-white">유저 목록</h1>
        <div className="flex gap-4 text-sm">
          <span className="text-blue-400">Google {google}명</span>
          <span className="text-slate-400">Guest {guest}명</span>
          <span className="text-slate-300">총 {users.length}명</span>
        </div>
      </div>

      <UserTable users={users} />
    </div>
  );
}
