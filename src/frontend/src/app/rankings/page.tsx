import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import RankingsClient from "./RankingsClient";

/**
 * ELO 리더보드 페이지 (Server Component)
 * 비로그인 상태에서도 열람 가능 (리다이렉트 없음)
 */
export default async function RankingsPage() {
  // 세션은 클라이언트에서 useSession으로도 접근 가능하지만
  // 서버에서 미리 확인하여 AuthProvider에 전달
  await getServerSession(authOptions);

  return <RankingsClient />;
}
