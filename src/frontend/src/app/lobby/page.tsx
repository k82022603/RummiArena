import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";
import { authOptions } from "@/lib/auth";
import LobbyClient from "./LobbyClient";

/**
 * 로비 페이지 (Server Component)
 * 미인증 시 로그인으로 리다이렉트
 */
export default async function LobbyPage() {
  const session = await getServerSession(authOptions);
  if (!session) redirect("/login");

  return <LobbyClient />;
}
