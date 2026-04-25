import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";
import { authOptions } from "@/lib/auth";
import GameRoom from "./GameRoom";

interface GamePageProps {
  params: Promise<{ roomId: string }>;
}

/**
 * 게임 플레이 페이지 (Server Component)
 * 1인칭 뷰: 내 타일 + 게임 보드 + 사이드 패널
 *
 * Phase 3: GameClient → GameRoom으로 교체.
 * GameRoom이 Phase 2 hook(store/hook 연결)을 활성화하고 GameClient를 내부에서 호출한다.
 * GameClient의 기존 기능은 완전 보존된다 (과도기 공존 구조).
 */
export default async function GamePage({ params }: GamePageProps) {
  const session = await getServerSession(authOptions);
  if (!session) redirect("/login");

  const { roomId } = await params;
  return <GameRoom roomId={roomId} />;
}
