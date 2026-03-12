import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";
import { authOptions } from "@/lib/auth";
import PracticeClient from "./PracticeClient";

/**
 * 연습 모드 스테이지 선택 페이지 (Server Component)
 */
export default async function PracticePage() {
  const session = await getServerSession(authOptions);
  if (!session) redirect("/login");

  return <PracticeClient />;
}
