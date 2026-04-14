"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  fetchHistory,
  fetchScenarios,
  generateRandomSeed,
  isValidSeedInput,
  normalizeSeed,
  runScenario,
  type AiMode,
  type HistoryEntry,
  type RunResult,
  type ScenarioMeta,
} from "@/lib/playtest-s4-data";
import {
  CVD,
  PRIORITY_BADGE,
  RECENT_SEEDS_KEY,
  RECENT_SEEDS_MAX,
  STATUS_VISUAL,
} from "./constants";

interface PlaytestS4PageProps {
  initialScenarios: ScenarioMeta[];
  initialHistory: HistoryEntry[];
}

interface RecentSeed {
  seed: string;
  scenarioId: string;
  ts: number;
}

const AI_MODES: Array<{ id: AiMode; label: string; tooltip: string; disabled: boolean }> = [
  {
    id: "baseline",
    label: "baseline",
    tooltip: "Phase 1 — 엔진 레벨 결정론 검증 (항상 사용 가능)",
    disabled: false,
  },
  {
    id: "fixture",
    label: "fixture",
    tooltip: "Phase 2 예정: 사전 녹화된 AI 응답 재생 — Sprint 6 후반",
    disabled: true,
  },
  {
    id: "live",
    label: "live",
    tooltip: "Phase 3 예정: 실제 LLM 호출 — Sprint 7",
    disabled: true,
  },
];

export default function PlaytestS4Page({
  initialScenarios,
  initialHistory,
}: PlaytestS4PageProps) {
  const [scenarios, setScenarios] = useState<ScenarioMeta[]>(initialScenarios);
  const [history, setHistory] = useState<HistoryEntry[]>(initialHistory);
  const [scenariosError, setScenariosError] = useState<string | null>(null);

  const [selectedScenarioId, setSelectedScenarioId] = useState<string>(
    initialScenarios[0]?.id ?? "",
  );
  const [seedInput, setSeedInput] = useState<string>(
    initialScenarios[0]?.firstSeed ?? "",
  );
  const [aiMode, setAiMode] = useState<AiMode>("baseline");
  const [isRunning, setIsRunning] = useState(false);
  const [result, setResult] = useState<RunResult | null>(null);
  const [runError, setRunError] = useState<string | null>(null);
  const [recentSeeds, setRecentSeeds] = useState<RecentSeed[]>([]);
  const [copied, setCopied] = useState<string | null>(null);

  const selectedScenario = useMemo(
    () => scenarios.find((s) => s.id === selectedScenarioId) ?? null,
    [scenarios, selectedScenarioId],
  );

  const seedValid = isValidSeedInput(seedInput);
  const canRun =
    !isRunning &&
    selectedScenario !== null &&
    seedInput.trim() !== "" &&
    seedValid;

  // ----- localStorage 복원 -----
  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      const raw = window.localStorage.getItem(RECENT_SEEDS_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed)) {
          setRecentSeeds(
            parsed.filter(
              (e): e is RecentSeed =>
                typeof e?.seed === "string" &&
                typeof e?.scenarioId === "string" &&
                typeof e?.ts === "number",
            ),
          );
        }
      }
    } catch {
      // ignore
    }
  }, []);

  const persistRecent = useCallback((entries: RecentSeed[]) => {
    setRecentSeeds(entries);
    if (typeof window !== "undefined") {
      try {
        window.localStorage.setItem(RECENT_SEEDS_KEY, JSON.stringify(entries));
      } catch {
        // ignore quota errors
      }
    }
  }, []);

  const pushRecent = useCallback(
    (seed: string, scenarioId: string) => {
      const next: RecentSeed[] = [
        { seed, scenarioId, ts: Date.now() },
        ...recentSeeds.filter((e) => !(e.seed === seed && e.scenarioId === scenarioId)),
      ].slice(0, RECENT_SEEDS_MAX);
      persistRecent(next);
    },
    [recentSeeds, persistRecent],
  );

  // ----- 시나리오 변경 시 시드 자동 채움 -----
  const handleScenarioChange = (id: string) => {
    setSelectedScenarioId(id);
    const meta = scenarios.find((s) => s.id === id);
    if (meta) setSeedInput(meta.firstSeed);
    setResult(null);
    setRunError(null);
  };

  // ----- 시나리오 새로고침 -----
  const refreshScenarios = useCallback(async () => {
    try {
      const list = await fetchScenarios();
      setScenarios(list);
      setScenariosError(null);
      if (!selectedScenarioId && list[0]) {
        setSelectedScenarioId(list[0].id);
        setSeedInput(list[0].firstSeed);
      }
    } catch (err) {
      setScenariosError((err as Error).message);
    }
  }, [selectedScenarioId]);

  // ----- 이력 새로고침 -----
  const refreshHistory = useCallback(async () => {
    try {
      const list = await fetchHistory(10);
      setHistory(list);
    } catch {
      // 이력 실패는 무시
    }
  }, []);

  // ----- 실행 -----
  const handleRun = useCallback(async () => {
    if (!selectedScenario) return;
    const seed = normalizeSeed(seedInput);
    setIsRunning(true);
    setResult(null);
    setRunError(null);
    try {
      const r = await runScenario(selectedScenario.id, seed, aiMode);
      setResult(r);
      pushRecent(seed, selectedScenario.id);
      // 비동기 이력 새로고침
      refreshHistory();
    } catch (err) {
      setRunError((err as Error).message);
    } finally {
      setIsRunning(false);
    }
  }, [aiMode, pushRecent, refreshHistory, seedInput, selectedScenario]);

  const handleRandomSeed = () => {
    setSeedInput(generateRandomSeed());
  };

  const handleCopy = async (text: string, key: string) => {
    if (typeof navigator === "undefined" || !navigator.clipboard) return;
    try {
      await navigator.clipboard.writeText(text);
      setCopied(key);
      setTimeout(() => setCopied((c) => (c === key ? null : c)), 1500);
    } catch {
      // ignore
    }
  };

  const handleApplyRecent = (entry: RecentSeed) => {
    if (scenarios.some((s) => s.id === entry.scenarioId)) {
      setSelectedScenarioId(entry.scenarioId);
    }
    setSeedInput(entry.seed);
    setResult(null);
    setRunError(null);
  };

  const handleClearRecent = () => {
    persistRecent([]);
  };

  const seedHelpText = seedInput.trim() === ""
    ? "0x로 시작하는 hex 또는 10진수 uint64를 입력하세요"
    : seedValid
      ? "유효한 64-bit 시드"
      : "유효하지 않은 시드 형식 (0x[0-9a-f]{1,16} 또는 10진수)";

  return (
    <div className="space-y-6" data-testid="playtest-s4-page">
      <header className="flex items-end justify-between gap-4 flex-wrap">
        <div>
          <h1
            id="playtest-s4-heading"
            className="text-2xl font-bold text-white"
          >
            Playtest S4 — Deterministic Runner
          </h1>
          <p className="text-sm text-slate-400 mt-1">
            결정론적 시드로 엔진 레벨 회귀 시나리오를 즉시 재현한다.
            <span className="ml-2 text-slate-500">
              총 {scenarios.length}개 시나리오 · 이력 {history.length}건
            </span>
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={refreshScenarios}
            className="text-xs px-3 py-1.5 rounded-md border border-slate-600 text-slate-300 hover:bg-slate-800"
          >
            시나리오 새로고침
          </button>
          <button
            type="button"
            onClick={refreshHistory}
            className="text-xs px-3 py-1.5 rounded-md border border-slate-600 text-slate-300 hover:bg-slate-800"
          >
            이력 새로고침
          </button>
        </div>
      </header>

      {scenariosError ? (
        <div
          role="alert"
          className="border border-amber-500/40 bg-amber-500/10 text-amber-200 text-sm rounded-md p-3"
        >
          시나리오를 불러올 수 없습니다: {scenariosError}
        </div>
      ) : null}

      {/* === 입력 카드 === */}
      <section
        aria-labelledby="playtest-s4-input-heading"
        className="grid grid-cols-1 lg:grid-cols-2 gap-4"
      >
        <h2 id="playtest-s4-input-heading" className="sr-only">
          실행 입력
        </h2>

        {/* 시드 입력 */}
        <div className="bg-slate-900 border border-slate-700 rounded-lg p-5">
          <label
            htmlFor="playtest-s4-seed-input"
            className="block text-xs uppercase tracking-wide text-slate-400 mb-2"
          >
            시드 (64-bit)
          </label>
          <div className="flex gap-2">
            <input
              id="playtest-s4-seed-input"
              type="text"
              value={seedInput}
              onChange={(e) => {
                setSeedInput(e.target.value);
                setResult(null);
                setRunError(null);
              }}
              placeholder="0x14"
              spellCheck={false}
              className={[
                "flex-1 bg-slate-950 border rounded-md px-3 py-2 text-sm font-mono text-slate-100 focus:outline-none focus:ring-2",
                seedInput.trim() === "" || seedValid
                  ? "border-slate-600 focus:ring-sky-500/50"
                  : "border-rose-500 focus:ring-rose-500/50",
              ].join(" ")}
              aria-invalid={!seedValid && seedInput.trim() !== ""}
              aria-describedby="playtest-s4-seed-help"
              data-testid="seed-input"
            />
            <button
              type="button"
              onClick={handleRandomSeed}
              className="px-3 py-2 text-sm rounded-md border border-slate-600 text-slate-200 hover:bg-slate-800"
              aria-label="새 랜덤 시드 생성"
              data-testid="random-seed-btn"
            >
              랜덤
            </button>
            <button
              type="button"
              onClick={() => handleCopy(seedInput, "seed-input")}
              className="px-3 py-2 text-sm rounded-md border border-slate-600 text-slate-200 hover:bg-slate-800"
              aria-label="현재 시드 복사"
              disabled={seedInput.trim() === ""}
            >
              {copied === "seed-input" ? "복사됨" : "복사"}
            </button>
          </div>
          <p
            id="playtest-s4-seed-help"
            className={`text-xs mt-2 ${
              seedInput.trim() === "" || seedValid
                ? "text-slate-500"
                : "text-rose-300"
            }`}
          >
            {seedHelpText}
          </p>
        </div>

        {/* 시나리오 선택 */}
        <div className="bg-slate-900 border border-slate-700 rounded-lg p-5">
          <label
            htmlFor="playtest-s4-scenario-select"
            className="block text-xs uppercase tracking-wide text-slate-400 mb-2"
          >
            시나리오
          </label>
          <select
            id="playtest-s4-scenario-select"
            value={selectedScenarioId}
            onChange={(e) => handleScenarioChange(e.target.value)}
            className="w-full bg-slate-950 border border-slate-600 rounded-md px-3 py-2 text-sm text-slate-100 focus:outline-none focus:ring-2 focus:ring-sky-500/50"
            data-testid="scenario-select"
          >
            {scenarios.length === 0 ? (
              <option value="">(시나리오 없음)</option>
            ) : (
              scenarios.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.id} — {s.title}
                </option>
              ))
            )}
          </select>

          {selectedScenario ? (
            <dl className="mt-3 space-y-1 text-xs">
              <div className="flex items-center gap-2">
                <dt className="text-slate-500">우선순위</dt>
                <dd>
                  <span
                    className={[
                      "inline-block px-2 py-0.5 rounded-full border text-[10px] font-semibold",
                      PRIORITY_BADGE[selectedScenario.priority] ??
                        "bg-slate-500/15 text-slate-300 border-slate-500/40",
                    ].join(" ")}
                  >
                    {selectedScenario.priority}
                  </span>
                </dd>
                <dt className="text-slate-500 ml-3">대상 규칙</dt>
                <dd className="text-slate-200 font-mono">
                  {selectedScenario.targetRule || "—"}
                </dd>
              </div>
              <div className="flex items-center gap-2">
                <dt className="text-slate-500">기본 시드</dt>
                <dd className="font-mono text-slate-200">
                  {selectedScenario.firstSeed}
                </dd>
                <dt className="text-slate-500 ml-3">예상 시간</dt>
                <dd className="text-slate-200">
                  {selectedScenario.estimatedSec}s
                </dd>
              </div>
              {selectedScenario.seedCandidates.length > 1 ? (
                <div className="flex items-center gap-2 flex-wrap">
                  <dt className="text-slate-500">시드 후보</dt>
                  <dd className="flex gap-1.5 flex-wrap">
                    {selectedScenario.seedCandidates.map((s) => (
                      <button
                        key={s}
                        type="button"
                        onClick={() => setSeedInput(s)}
                        className="font-mono text-[11px] px-2 py-0.5 rounded border border-slate-700 text-slate-300 hover:bg-slate-800"
                      >
                        {s}
                      </button>
                    ))}
                  </dd>
                </div>
              ) : null}
            </dl>
          ) : null}
        </div>
      </section>

      {/* === AI 모드 === */}
      <section
        aria-labelledby="playtest-s4-aimode-heading"
        className="bg-slate-900 border border-slate-700 rounded-lg p-5"
      >
        <h2
          id="playtest-s4-aimode-heading"
          className="text-xs uppercase tracking-wide text-slate-400 mb-3"
        >
          AI 모드
        </h2>
        <div
          role="radiogroup"
          aria-labelledby="playtest-s4-aimode-heading"
          className="flex flex-wrap gap-3"
        >
          {AI_MODES.map((mode) => {
            const isSelected = aiMode === mode.id;
            return (
              <label
                key={mode.id}
                title={mode.tooltip}
                className={[
                  "flex items-center gap-2 px-3 py-2 rounded-md border text-sm cursor-pointer transition-colors",
                  mode.disabled
                    ? "border-slate-700 bg-slate-800/30 text-slate-500 cursor-not-allowed"
                    : isSelected
                      ? "border-sky-500/60 bg-sky-500/10 text-sky-200"
                      : "border-slate-600 text-slate-300 hover:bg-slate-800",
                ].join(" ")}
                data-testid={`aimode-${mode.id}`}
              >
                <input
                  type="radio"
                  name="aimode"
                  value={mode.id}
                  checked={isSelected}
                  disabled={mode.disabled}
                  onChange={() => setAiMode(mode.id)}
                  className="accent-sky-500"
                />
                <span className="font-mono">{mode.label}</span>
                {mode.disabled ? (
                  <span className="text-[10px] uppercase tracking-wide text-slate-500">
                    Phase 2+
                  </span>
                ) : null}
              </label>
            );
          })}
        </div>
        <p className="text-xs text-slate-500 mt-3">
          Phase 1: baseline만 사용 가능. fixture/live는 Sprint 6 후반(Phase 2) 및
          Sprint 7(Phase 3)에서 활성화됩니다.
        </p>
      </section>

      {/* === 실행 버튼 === */}
      <div className="flex justify-center">
        <button
          type="button"
          onClick={handleRun}
          disabled={!canRun}
          data-testid="run-btn"
          className={[
            "px-8 py-3 rounded-md text-sm font-semibold transition-colors flex items-center gap-2 border",
            canRun
              ? "bg-sky-600 hover:bg-sky-500 border-sky-500 text-white"
              : "bg-slate-800 border-slate-700 text-slate-500 cursor-not-allowed",
          ].join(" ")}
        >
          {isRunning ? (
            <>
              <span
                aria-hidden="true"
                className="inline-block h-3 w-3 rounded-full border-2 border-white/40 border-t-white animate-spin"
              />
              실행 중...
            </>
          ) : (
            <>▶ 실행 (Run)</>
          )}
        </button>
      </div>

      {/* === 결과 패널 === */}
      <ResultPanel
        result={result}
        error={runError}
        isRunning={isRunning}
        onCopySeed={(s) => handleCopy(s, "result-seed")}
        copied={copied === "result-seed"}
      />

      {/* === 최근 시드 + 이력 === */}
      <section className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <RecentSeedsPanel
          entries={recentSeeds}
          scenarios={scenarios}
          onApply={handleApplyRecent}
          onClear={handleClearRecent}
        />
        <HistoryPanel entries={history} />
      </section>
    </div>
  );
}

// ----------------------------------------------------------------------
// ResultPanel
// ----------------------------------------------------------------------

function ResultPanel({
  result,
  error,
  isRunning,
  onCopySeed,
  copied,
}: {
  result: RunResult | null;
  error: string | null;
  isRunning: boolean;
  onCopySeed: (seed: string) => void;
  copied: boolean;
}) {
  if (isRunning && !result) {
    return (
      <section
        aria-labelledby="playtest-s4-result-heading"
        className="border border-slate-700 bg-slate-900 rounded-lg p-5"
        data-testid="result-panel"
      >
        <h2
          id="playtest-s4-result-heading"
          className="text-xs uppercase tracking-wide text-slate-400 mb-2"
        >
          실행 결과
        </h2>
        <div className="flex items-center gap-3 text-slate-300">
          <span
            aria-hidden="true"
            className="inline-block h-4 w-4 rounded-full border-2 border-slate-500 border-t-sky-400 animate-spin"
          />
          시나리오 실행 중...
        </div>
      </section>
    );
  }

  if (error) {
    return (
      <section
        aria-labelledby="playtest-s4-result-heading"
        className="border border-rose-500/40 bg-rose-500/10 rounded-lg p-5"
        data-testid="result-panel"
      >
        <h2
          id="playtest-s4-result-heading"
          className="text-xs uppercase tracking-wide text-rose-300 mb-2"
        >
          실행 오류
        </h2>
        <div className="flex items-center gap-2 text-rose-200 text-sm">
          <span
            aria-hidden="true"
            className="inline-flex w-5 h-5 items-center justify-center rounded-full text-white text-[11px]"
            style={{ backgroundColor: STATUS_VISUAL.ERROR.color }}
          >
            {STATUS_VISUAL.ERROR.icon}
          </span>
          <span className="font-medium">ERROR</span>
          <span className="text-rose-300/80">— {error}</span>
        </div>
      </section>
    );
  }

  if (!result) {
    return (
      <section
        aria-labelledby="playtest-s4-result-heading"
        className="border border-dashed border-slate-700 rounded-lg p-5 text-slate-500 text-sm"
        data-testid="result-panel"
      >
        <h2
          id="playtest-s4-result-heading"
          className="text-xs uppercase tracking-wide text-slate-400 mb-2"
        >
          실행 결과
        </h2>
        시드 + 시나리오를 선택한 뒤 <strong className="text-slate-400">실행</strong>
        을 누르면 결과가 여기에 표시됩니다.
      </section>
    );
  }

  const visual = STATUS_VISUAL[result.status] ?? STATUS_VISUAL.ERROR;
  const checkEntries = Object.entries(result.checks ?? {});
  const passedChecks = checkEntries.filter(([, v]) => v).length;

  return (
    <section
      aria-labelledby="playtest-s4-result-heading"
      className={`border rounded-lg p-5 ${visual.bgClass}`}
      data-testid="result-panel"
    >
      <h2
        id="playtest-s4-result-heading"
        className="text-xs uppercase tracking-wide text-slate-400 mb-3"
      >
        실행 결과
      </h2>
      <div className="flex flex-wrap items-center gap-3 mb-4">
        <span
          aria-hidden="true"
          className="inline-flex w-7 h-7 items-center justify-center rounded-full text-white text-sm font-bold"
          style={{ backgroundColor: visual.color }}
        >
          {visual.icon}
        </span>
        <span
          className={`text-lg font-bold ${visual.textClass}`}
          data-testid="result-status"
        >
          {visual.label}
        </span>
        <span className="text-slate-400 text-sm">
          ({result.durationMs}ms)
        </span>
        <span className="text-slate-500 text-sm font-mono">
          {result.scenario}
        </span>
        <span className="text-slate-500 text-sm font-mono">
          seed=
          <span className="text-slate-300">{result.seed}</span>
        </span>
        <button
          type="button"
          onClick={() => onCopySeed(result.seed)}
          className="text-xs px-2 py-1 rounded border border-slate-600 text-slate-300 hover:bg-slate-800"
        >
          {copied ? "복사됨" : "시드 복사"}
        </button>
        <span className="ml-auto text-xs text-slate-400">
          체크 {passedChecks}/{checkEntries.length}
        </span>
      </div>

      <ul className="space-y-1.5 mb-4" data-testid="result-checks">
        {checkEntries.map(([name, ok]) => (
          <li
            key={name}
            className="flex items-center gap-2 text-sm font-mono"
          >
            <span
              aria-hidden="true"
              className="inline-flex w-4 h-4 items-center justify-center rounded-full text-white text-[10px]"
              style={{
                backgroundColor: ok ? CVD.success : CVD.error,
              }}
            >
              {ok ? "✓" : "✗"}
            </span>
            <span className={ok ? "text-emerald-200" : "text-rose-200"}>
              {ok ? "ok " : "NO "} {name}
            </span>
          </li>
        ))}
      </ul>

      {result.details && Object.keys(result.details).length > 0 ? (
        <details className="text-xs">
          <summary className="cursor-pointer text-slate-400 hover:text-slate-200">
            상세 (details)
          </summary>
          <pre
            className="mt-2 p-3 bg-slate-950 border border-slate-700 rounded-md text-slate-300 font-mono whitespace-pre-wrap break-words overflow-x-auto"
            data-testid="result-details"
          >
            {JSON.stringify(result.details, null, 2)}
          </pre>
        </details>
      ) : null}
    </section>
  );
}

// ----------------------------------------------------------------------
// RecentSeedsPanel (localStorage)
// ----------------------------------------------------------------------

function RecentSeedsPanel({
  entries,
  scenarios,
  onApply,
  onClear,
}: {
  entries: RecentSeed[];
  scenarios: ScenarioMeta[];
  onApply: (entry: RecentSeed) => void;
  onClear: () => void;
}) {
  return (
    <section
      aria-labelledby="playtest-s4-recent-heading"
      className="bg-slate-900 border border-slate-700 rounded-lg p-5"
      data-testid="recent-seeds-panel"
    >
      <div className="flex items-center justify-between mb-3">
        <h2
          id="playtest-s4-recent-heading"
          className="text-xs uppercase tracking-wide text-slate-400"
        >
          최근 시드 (브라우저 저장)
        </h2>
        {entries.length > 0 ? (
          <button
            type="button"
            onClick={onClear}
            className="text-xs text-slate-400 hover:text-slate-200"
          >
            지우기
          </button>
        ) : null}
      </div>
      {entries.length === 0 ? (
        <p className="text-sm text-slate-500" data-testid="recent-seeds-empty">
          아직 실행한 시드가 없습니다. 첫 실행 후 자동으로 추가됩니다.
        </p>
      ) : (
        <ul className="space-y-1.5">
          {entries.map((entry, idx) => {
            const meta = scenarios.find((s) => s.id === entry.scenarioId);
            return (
              <li
                key={`${entry.seed}-${entry.scenarioId}-${idx}`}
                className="flex items-center gap-2 text-xs"
              >
                <span className="text-slate-500 w-4 text-right">{idx + 1}</span>
                <button
                  type="button"
                  onClick={() => onApply(entry)}
                  className="font-mono text-slate-200 hover:text-sky-300 underline-offset-2 hover:underline"
                >
                  {entry.seed}
                </button>
                <span className="text-slate-500">·</span>
                <span className="text-slate-400 truncate">
                  {meta?.title ?? entry.scenarioId}
                </span>
                <span className="ml-auto text-slate-500 tabular-nums">
                  {formatTime(entry.ts)}
                </span>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}

// ----------------------------------------------------------------------
// HistoryPanel (서버)
// ----------------------------------------------------------------------

function HistoryPanel({ entries }: { entries: HistoryEntry[] }) {
  return (
    <section
      aria-labelledby="playtest-s4-history-heading"
      className="bg-slate-900 border border-slate-700 rounded-lg p-5"
      data-testid="history-panel"
    >
      <h2
        id="playtest-s4-history-heading"
        className="text-xs uppercase tracking-wide text-slate-400 mb-3"
      >
        서버 실행 이력 (최근 {entries.length || 0}건)
      </h2>
      {entries.length === 0 ? (
        <p className="text-sm text-slate-500">
          이력이 비어 있습니다. 첫 실행 후 자동 누적됩니다.
        </p>
      ) : (
        <ul className="space-y-1.5">
          {entries.map((entry) => {
            const visual = STATUS_VISUAL[entry.status] ?? STATUS_VISUAL.ERROR;
            return (
              <li
                key={entry.runId}
                className="flex items-center gap-2 text-xs"
              >
                <span
                  aria-hidden="true"
                  className="inline-flex w-4 h-4 items-center justify-center rounded-full text-white text-[10px]"
                  style={{ backgroundColor: visual.color }}
                >
                  {visual.icon}
                </span>
                <span className={`font-semibold ${visual.textClass}`}>
                  {visual.label}
                </span>
                <span className="text-slate-400 truncate">
                  {entry.scenarioId}
                </span>
                <span className="text-slate-500 font-mono">
                  {entry.seed}
                </span>
                <span className="ml-auto text-slate-500 tabular-nums">
                  {entry.durationMs}ms
                </span>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}

// ----------------------------------------------------------------------
// helpers
// ----------------------------------------------------------------------

function formatTime(ts: number): string {
  try {
    const d = new Date(ts);
    return d.toLocaleTimeString("ko-KR", {
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hour12: false,
    });
  } catch {
    return "—";
  }
}
