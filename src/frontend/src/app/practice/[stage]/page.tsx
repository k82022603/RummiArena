import { getServerSession } from "next-auth";
import { redirect, notFound } from "next/navigation";
import { authOptions } from "@/lib/auth";
import StagePlayClient from "./StagePlayClient";
import { STAGE_CONFIGS } from "@/lib/practice/stage-configs";

interface PageProps {
  params: Promise<{ stage: string }>;
}

/**
 * 연습 모드 스테이지 플레이 페이지 (Server Component)
 *
 * - 인증 확인 → 미로그인 시 /login 리디렉션
 * - stage 파라미터 유효성 검사 → 1~3 외에는 404
 */
export default async function StagePlayPage({ params }: PageProps) {
  const session = await getServerSession(authOptions);
  if (!session) redirect("/login");

  const { stage: stageParam } = await params;
  const stageNum = parseInt(stageParam, 10) as 1 | 2 | 3;

  if (!STAGE_CONFIGS[stageNum]) {
    notFound();
  }

  return <StagePlayClient stageNum={stageNum} />;
}

export function generateStaticParams() {
  return [{ stage: "1" }, { stage: "2" }, { stage: "3" }];
}
