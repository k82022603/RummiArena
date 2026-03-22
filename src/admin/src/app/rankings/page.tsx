/**
 * /rankings — ELO 랭킹 관리자 페이지 (Server Component)
 *
 * 데이터를 서버에서 패치한 뒤 EloRankingPanel(Client Component)에 주입한다.
 */

import { getEloRankings, getEloSummary, getEloTierDistribution } from "@/lib/api";
import EloRankingPanel from "@/components/EloRankingPanel";

export const revalidate = 30;

export default async function RankingsPage() {
  const [rankings, summary, tierDistribution] = await Promise.all([
    getEloRankings(100, 0),
    getEloSummary(),
    getEloTierDistribution(),
  ]);

  return (
    <EloRankingPanel
      initialRankings={rankings}
      summary={summary}
      tierDistribution={tierDistribution}
    />
  );
}
