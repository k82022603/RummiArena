/**
 * Playtest S4 Deterministic Runner — admin client
 *
 * 스펙: docs/04-testing/53-playtest-s4-deterministic-framework.md §10
 *
 * Phase 1 한정:
 * - aiMode는 baseline만 지원. fixture/live는 UI에서 disabled.
 * - 시나리오/실행/이력 3개 엔드포인트는 same-origin Next.js route handler가 처리한다.
 */

export type AiMode = "baseline" | "fixture" | "live";

export type RunStatus = "PASS" | "FAIL" | "ERROR" | "RUNNING";

export interface ScenarioMeta {
  id: string;
  title: string;
  priority: string;
  targetRule: string;
  estimatedSec: number;
  firstSeed: string;
  seedCandidates: string[];
}

export interface ScenariosResponse {
  scenarios: ScenarioMeta[];
}

export interface RunResult {
  scenario: string;
  seed: string;
  seedUint: number;
  status: RunStatus;
  durationMs: number;
  checks: Record<string, boolean>;
  details: Record<string, unknown>;
  error?: string;
}

export interface HistoryEntry {
  runId: string;
  scenarioId: string;
  seed: string;
  status: RunStatus;
  durationMs: number;
  startedAt: string;
  finishedAt: string;
  aiMode: AiMode;
}

export interface HistoryResponse {
  runs: HistoryEntry[];
}

const BASE = "/api/playtest/s4";

async function jsonFetch<T>(input: string, init?: RequestInit): Promise<T> {
  const res = await fetch(input, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...(init?.headers ?? {}),
    },
    cache: "no-store",
  });
  if (!res.ok) {
    let detail = "";
    try {
      const body = await res.json();
      detail = typeof body?.error === "string" ? body.error : JSON.stringify(body);
    } catch {
      detail = await res.text().catch(() => "");
    }
    throw new Error(`HTTP ${res.status}: ${detail || res.statusText}`);
  }
  return res.json() as Promise<T>;
}

export async function fetchScenarios(): Promise<ScenarioMeta[]> {
  const data = await jsonFetch<ScenariosResponse>(`${BASE}/scenarios`);
  return data.scenarios;
}

export async function runScenario(
  scenarioId: string,
  seed?: string,
  aiMode: AiMode = "baseline",
): Promise<RunResult> {
  return jsonFetch<RunResult>(`${BASE}/run`, {
    method: "POST",
    body: JSON.stringify({ scenarioId, seed, aiMode }),
  });
}

export async function fetchHistory(limit = 10): Promise<HistoryEntry[]> {
  const data = await jsonFetch<HistoryResponse>(`${BASE}/history?limit=${limit}`);
  return data.runs;
}

const HEX_RE = /^0x[0-9a-fA-F]{1,16}$/;
const DEC_RE = /^[0-9]{1,20}$/;

export function isValidSeedInput(input: string): boolean {
  const v = input.trim();
  if (v === "") return true;
  if (HEX_RE.test(v)) return true;
  if (DEC_RE.test(v)) {
    try {
      const n = BigInt(v);
      const max = BigInt("18446744073709551615");
      return n >= BigInt(0) && n <= max;
    } catch {
      return false;
    }
  }
  return false;
}

export function normalizeSeed(input: string): string {
  const v = input.trim();
  if (v === "") return "";
  if (HEX_RE.test(v)) return v.toLowerCase().replace(/^0x/, "0x");
  return v;
}

export function generateRandomSeed(): string {
  const arr = new Uint8Array(8);
  if (typeof crypto !== "undefined" && typeof crypto.getRandomValues === "function") {
    crypto.getRandomValues(arr);
  } else {
    for (let i = 0; i < arr.length; i++) arr[i] = Math.floor(Math.random() * 256);
  }
  let hex = "";
  for (const b of arr) hex += b.toString(16).padStart(2, "0");
  return `0x${hex.replace(/^0+/, "") || "0"}`;
}
