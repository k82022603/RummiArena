import { NextRequest, NextResponse } from "next/server";
import {
  appendHistory,
  loadScenarios,
  newRunId,
  runScenarioServer,
  validateSeed,
} from "@/lib/playtest-s4-server";
import type { AiMode } from "@/lib/playtest-s4-data";

export const dynamic = "force-dynamic";
export const revalidate = 0;
export const maxDuration = 60;

interface RunRequestBody {
  scenarioId?: string;
  seed?: string;
  aiMode?: AiMode;
}

export async function POST(req: NextRequest) {
  let body: RunRequestBody;
  try {
    body = (await req.json()) as RunRequestBody;
  } catch {
    return NextResponse.json({ error: "invalid JSON body" }, { status: 400 });
  }

  const scenarioId = body.scenarioId?.trim();
  if (!scenarioId) {
    return NextResponse.json({ error: "scenarioId is required" }, { status: 400 });
  }

  const scenarios = await loadScenarios();
  const meta = scenarios.find((s) => s.id === scenarioId);
  if (!meta) {
    return NextResponse.json(
      { error: `unknown scenarioId: ${scenarioId}` },
      { status: 400 },
    );
  }

  const seed = body.seed?.trim() || meta.firstSeed;
  const seedCheck = validateSeed(seed);
  if (!seedCheck.ok) {
    return NextResponse.json({ error: seedCheck.reason }, { status: 400 });
  }

  // Phase 1: fixture/live → baseline fallback (warning kept server-side)
  const requestedMode: AiMode = body.aiMode ?? "baseline";
  const aiMode: AiMode = requestedMode === "baseline" ? "baseline" : "baseline";

  const startedAt = new Date().toISOString();
  try {
    const result = await runScenarioServer(scenarioId, seedCheck.value, aiMode);
    const finishedAt = new Date().toISOString();

    await appendHistory({
      runId: newRunId(),
      scenarioId,
      seed: seedCheck.value,
      status: result.status,
      durationMs: result.durationMs,
      startedAt,
      finishedAt,
      aiMode,
    });

    return NextResponse.json(result);
  } catch (err) {
    return NextResponse.json(
      {
        error: (err as Error).message,
        scenario: scenarioId,
        seed: seedCheck.value,
        status: "ERROR" as const,
      },
      { status: 500 },
    );
  }
}
