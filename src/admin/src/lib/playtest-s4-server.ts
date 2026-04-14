/**
 * Playtest S4 — server-side runner integration
 *
 * 스펙: docs/04-testing/53-playtest-s4-deterministic-framework.md §10
 *
 * 책임:
 * - scripts/playtest-s4/scenarios/*.yaml 디렉터리 탐색 후 메타 추출
 * - scripts/playtest-s4-seeded.mjs 실행 (--output 으로 JSON 결과 수집)
 * - 이력 파일(JSON) 기반 LRU 10 관리
 *
 * 환경변수:
 * - PLAYTEST_S4_REPO_ROOT : repo root 경로 override (기본: src/admin 부모)
 * - PLAYTEST_S4_RUNNER_PATH: runner mjs 절대 경로 override
 * - PLAYTEST_S4_HISTORY_PATH: 이력 JSON 파일 경로 (기본: /tmp/playtest-s4-history.json)
 * - S4_HARNESS_BIN: harness 바이너리 경로 (runner가 자체 build)
 */

import { execFile } from "node:child_process";
import { promises as fs } from "node:fs";
import { existsSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";

import type {
  AiMode,
  HistoryEntry,
  RunResult,
  RunStatus,
  ScenarioMeta,
} from "./playtest-s4-data";

const execFileP = promisify(execFile);

// ----------------------------------------------------------------------
// Path resolution
// ----------------------------------------------------------------------

function findRepoRoot(): string {
  if (process.env.PLAYTEST_S4_REPO_ROOT) {
    return resolve(process.env.PLAYTEST_S4_REPO_ROOT);
  }
  // dev/standalone: cwd가 src/admin 또는 repo root일 수 있음. 양쪽 다 시도.
  const cwd = process.cwd();
  const candidates = [
    cwd,
    resolve(cwd, ".."),
    resolve(cwd, "..", ".."),
    resolve(cwd, "..", "..", ".."),
  ];
  for (const c of candidates) {
    if (existsSync(join(c, "scripts", "playtest-s4-seeded.mjs"))) return c;
  }
  // 마지막 fallback — 본 파일 기준
  try {
    const here = dirname(fileURLToPath(import.meta.url));
    const guess = resolve(here, "..", "..", "..", "..", "..");
    if (existsSync(join(guess, "scripts", "playtest-s4-seeded.mjs"))) return guess;
  } catch {
    // ignore
  }
  return cwd;
}

function getRunnerPath(): string {
  if (process.env.PLAYTEST_S4_RUNNER_PATH) {
    return resolve(process.env.PLAYTEST_S4_RUNNER_PATH);
  }
  return join(findRepoRoot(), "scripts", "playtest-s4-seeded.mjs");
}

function getScenariosDir(): string {
  return join(findRepoRoot(), "scripts", "playtest-s4", "scenarios");
}

function getHistoryPath(): string {
  return process.env.PLAYTEST_S4_HISTORY_PATH ?? "/tmp/playtest-s4-history.json";
}

// ----------------------------------------------------------------------
// YAML 시나리오 메타 로더 (runner와 동일한 minimal subset 파서)
// ----------------------------------------------------------------------

function parseScenarioMeta(text: string): Partial<ScenarioMeta> {
  const meta: Partial<ScenarioMeta> & { seedCandidates: string[] } = {
    seedCandidates: [],
  };

  const lines = text.split("\n");
  let inSeedCandidates = false;
  let seedCandidatesIndent = -1;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (line.trim() === "" || line.trim().startsWith("#")) continue;

    if (inSeedCandidates) {
      const m = line.match(/^(\s*)-\s*seed:\s*(.+)$/);
      if (m && m[1].length > seedCandidatesIndent) {
        meta.seedCandidates.push(stripQuotes(m[2].trim()));
        continue;
      }
      // 들여쓰기로 같은 list 내부의 다른 키 (condition, hand 등) — 무시
      const indentMatch = line.match(/^(\s*)\S/);
      if (indentMatch && indentMatch[1].length <= seedCandidatesIndent) {
        inSeedCandidates = false;
        // fall through and parse as top-level
      } else {
        continue;
      }
    }

    // 톱 레벨 필드만 파싱
    const kv = line.match(/^(\S+):\s*(.*)$/);
    if (!kv) continue;
    const key = kv[1].trim();
    const val = kv[2].trim();

    switch (key) {
      case "id":
        meta.id = stripQuotes(val);
        break;
      case "title":
        meta.title = stripQuotes(val);
        break;
      case "priority":
        meta.priority = stripQuotes(val);
        break;
      case "target_rule":
        meta.targetRule = stripQuotes(val);
        break;
      case "estimated_sec": {
        const n = parseInt(val, 10);
        if (!Number.isNaN(n)) meta.estimatedSec = n;
        break;
      }
      case "seed_candidates":
        inSeedCandidates = true;
        seedCandidatesIndent = (line.match(/^(\s*)/)?.[1].length) ?? 0;
        break;
    }
  }

  return meta;
}

function stripQuotes(v: string): string {
  if (v.length >= 2) {
    const first = v[0];
    const last = v[v.length - 1];
    if ((first === '"' && last === '"') || (first === "'" && last === "'")) {
      return v.slice(1, -1);
    }
  }
  return v;
}

export async function loadScenarios(): Promise<ScenarioMeta[]> {
  const dir = getScenariosDir();
  if (!existsSync(dir)) return [];
  const files = (await fs.readdir(dir)).filter(
    (f) => f.endsWith(".yaml") || f.endsWith(".yml"),
  );
  const scenarios: ScenarioMeta[] = [];
  for (const f of files) {
    const text = await fs.readFile(join(dir, f), "utf8");
    const meta = parseScenarioMeta(text);
    if (!meta.id || !meta.seedCandidates || meta.seedCandidates.length === 0) {
      continue;
    }
    scenarios.push({
      id: meta.id,
      title: meta.title ?? meta.id,
      priority: meta.priority ?? "P?",
      targetRule: meta.targetRule ?? "",
      estimatedSec: meta.estimatedSec ?? 1,
      firstSeed: meta.seedCandidates[0],
      seedCandidates: meta.seedCandidates,
    });
  }
  scenarios.sort((a, b) => a.id.localeCompare(b.id));
  return scenarios;
}

// ----------------------------------------------------------------------
// Seed 검증 (route 핸들러 공용)
// ----------------------------------------------------------------------

const HEX_RE = /^0x[0-9a-fA-F]{1,16}$/;
const DEC_RE = /^[0-9]{1,20}$/;

export function validateSeed(input: string): { ok: true; value: string } | { ok: false; reason: string } {
  const v = input.trim();
  if (v === "") return { ok: false, reason: "seed is empty" };
  if (HEX_RE.test(v)) return { ok: true, value: v };
  if (DEC_RE.test(v)) {
    try {
      const n = BigInt(v);
      const max = BigInt("18446744073709551615");
      if (n < BigInt(0) || n > max) {
        return { ok: false, reason: "seed out of uint64 range" };
      }
      return { ok: true, value: v };
    } catch {
      return { ok: false, reason: "seed parse failed" };
    }
  }
  return { ok: false, reason: "seed must be 0x-hex or decimal uint64" };
}

// ----------------------------------------------------------------------
// Runner 호출
// ----------------------------------------------------------------------

interface RunnerOutput {
  generatedAt: string;
  aiMode: AiMode;
  runs: Array<{
    scenario: string;
    seed: string;
    seedUint: number;
    status: RunStatus;
    durationMs: number;
    checks: Record<string, boolean>;
    details: Record<string, unknown>;
  } | null>;
  summary: { total: number; passed: number; failed: number };
}

const TMP_DIR = "/tmp";

export async function runScenarioServer(
  scenarioId: string,
  seed: string,
  aiMode: AiMode,
): Promise<RunResult> {
  const runnerPath = getRunnerPath();
  if (!existsSync(runnerPath)) {
    throw new Error(`runner not found at ${runnerPath} (set PLAYTEST_S4_RUNNER_PATH)`);
  }
  const repoRoot = findRepoRoot();
  const outPath = join(
    TMP_DIR,
    `playtest-s4-${scenarioId}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}.json`,
  );

  const args = [
    runnerPath,
    "--scenario",
    scenarioId,
    "--seed",
    seed,
    "--ai-mode",
    aiMode,
    "--output",
    outPath,
  ];

  let runnerError: Error | null = null;
  try {
    await execFileP("node", args, {
      cwd: repoRoot,
      timeout: 60_000,
      maxBuffer: 4 * 1024 * 1024,
      env: process.env,
    });
  } catch (err) {
    // runner는 FAIL이어도 output 파일을 작성한 뒤 exit 1 — 파일 존재 시 진행
    runnerError = err as Error;
  }

  let payload: RunnerOutput | null = null;
  try {
    const text = await fs.readFile(outPath, "utf8");
    payload = JSON.parse(text);
  } catch (err) {
    if (runnerError) {
      throw new Error(
        `runner failed and no output: ${runnerError.message} (${(err as Error).message})`,
      );
    }
    throw new Error(`runner output unreadable: ${(err as Error).message}`);
  } finally {
    fs.unlink(outPath).catch(() => undefined);
  }

  const first = payload?.runs?.[0];
  if (!first) {
    throw new Error("runner produced no run results");
  }

  return first as RunResult;
}

// ----------------------------------------------------------------------
// History (JSON 파일 기반 LRU)
// ----------------------------------------------------------------------

const MAX_HISTORY = 50;

async function readHistoryFile(): Promise<HistoryEntry[]> {
  const path = getHistoryPath();
  try {
    const text = await fs.readFile(path, "utf8");
    const parsed = JSON.parse(text);
    if (Array.isArray(parsed)) return parsed as HistoryEntry[];
    if (Array.isArray(parsed?.runs)) return parsed.runs as HistoryEntry[];
    return [];
  } catch {
    return [];
  }
}

async function writeHistoryFile(entries: HistoryEntry[]): Promise<void> {
  const path = getHistoryPath();
  await fs.writeFile(path, JSON.stringify(entries, null, 2), "utf8");
}

export async function appendHistory(entry: HistoryEntry): Promise<void> {
  const entries = await readHistoryFile();
  entries.unshift(entry);
  if (entries.length > MAX_HISTORY) entries.length = MAX_HISTORY;
  await writeHistoryFile(entries);
}

export async function getHistory(limit = 10): Promise<HistoryEntry[]> {
  const entries = await readHistoryFile();
  return entries.slice(0, Math.max(0, limit));
}

export function newRunId(): string {
  return `run_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
}
