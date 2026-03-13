import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";
import { authOptions } from "@/lib/auth";
import WaitingRoomClient from "./WaitingRoomClient";

interface WaitingRoomPageProps {
  params: Promise<{ roomId: string }>;
}

/**
 * 대기실 페이지 (Server Component)
 * 미인증 시 로그인으로 리다이렉트
 */
export default async function WaitingRoomPage({
  params,
}: WaitingRoomPageProps) {
  const session = await getServerSession(authOptions);
  if (!session) redirect("/login");

  const { roomId } = await params;
  return <WaitingRoomClient roomId={roomId} />;
}
