import { getTournamentSummary } from "@/lib/api";
import TournamentPageClient from "@/components/tournament/TournamentPageClient";

export const revalidate = 30;

export const metadata = {
  title: "AI 토너먼트 결과 — RummiArena Admin",
  description: "LLM 모델별 루미큐브 대전 결과와 성능 지표",
};

export default async function TournamentPage() {
  const summary = await getTournamentSummary();
  return (
    <main aria-labelledby="tournament-heading">
      <TournamentPageClient initialSummary={summary} />
    </main>
  );
}
