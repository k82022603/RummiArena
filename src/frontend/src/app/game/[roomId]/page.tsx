import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";
import { authOptions } from "@/lib/auth";
import GameClient from "./GameClient";

interface GamePageProps {
  params: Promise<{ roomId: string }>;
}

/**
 * 게임 플레이 페이지 (Server Component)
 * 1인칭 뷰: 내 타일 + 게임 보드 + 사이드 패널
 */
export default async function GamePage({ params }: GamePageProps) {
  const session = await getServerSession(authOptions);
  if (!session) redirect("/login");

  const { roomId } = await params;
  return <GameClient roomId={roomId} />;
}
