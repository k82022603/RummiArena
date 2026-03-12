import { redirect } from "next/navigation";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";

/**
 * 루트 페이지
 * 로그인 여부에 따라 로비 또는 로그인 페이지로 리다이렉트
 */
export default async function RootPage() {
  const session = await getServerSession(authOptions);

  if (session) {
    redirect("/lobby");
  } else {
    redirect("/login");
  }
}
