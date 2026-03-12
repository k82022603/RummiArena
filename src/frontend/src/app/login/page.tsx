import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";
import { authOptions } from "@/lib/auth";
import LoginClient from "./LoginClient";

/**
 * 로그인 페이지 (Server Component)
 * 이미 로그인된 경우 로비로 리다이렉트
 */
export default async function LoginPage() {
  const session = await getServerSession(authOptions);
  if (session) redirect("/lobby");

  return <LoginClient />;
}
