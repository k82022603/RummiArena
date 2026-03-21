import { getServerSession } from "next-auth";
import { redirect, notFound } from "next/navigation";
import { authOptions } from "@/lib/auth";
import StagePlayClient from "./StagePlayClient";
import { STAGE_CONFIGS, STAGE_NUMBERS } from "@/lib/practice/stage-configs";
import type { StageNumber } from "@/lib/practice/stage-configs";

interface PageProps {
  params: Promise<{ stage: string }>;
}

/**
 * 연습 모드 스테이지 플레이 페이지 (Server Component)
 *
 * - 인증 확인 → 미로그인 시 /login 리디렉션
 * - stage 파라미터 유효성 검사 → STAGE_CONFIGS에 없으면 404
 */
export default async function StagePlayPage({ params }: PageProps) {
  const session = await getServerSession(authOptions);
  if (!session) redirect("/login");

  const { stage: stageParam } = await params;
  const stageNum = parseInt(stageParam, 10) as StageNumber;

  if (!STAGE_CONFIGS[stageNum]) {
    notFound();
  }

  return <StagePlayClient stageNum={stageNum} />;
}

export function generateStaticParams() {
  return STAGE_NUMBERS.map((n) => ({ stage: String(n) }));
}
