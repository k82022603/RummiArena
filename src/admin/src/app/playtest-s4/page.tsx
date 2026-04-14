import PlaytestS4Page from "@/components/playtest-s4/PlaytestS4Page";
import { getHistory, loadScenarios } from "@/lib/playtest-s4-server";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export const metadata = {
  title: "Playtest S4 — RummiArena Admin",
  description: "결정론적 시드 기반 회귀 시나리오 실행기",
};

export default async function Page() {
  let initialScenarios: Awaited<ReturnType<typeof loadScenarios>> = [];
  let initialHistory: Awaited<ReturnType<typeof getHistory>> = [];

  try {
    initialScenarios = await loadScenarios();
  } catch {
    // 비어있으면 클라이언트가 새로고침 버튼 노출
  }

  try {
    initialHistory = await getHistory(10);
  } catch {
    // ignore
  }

  return (
    <main aria-labelledby="playtest-s4-heading">
      <PlaytestS4Page
        initialScenarios={initialScenarios}
        initialHistory={initialHistory}
      />
    </main>
  );
}
