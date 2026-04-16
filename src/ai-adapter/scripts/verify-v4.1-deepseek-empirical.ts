/**
 * verify-v4.1-deepseek-empirical.ts
 *
 * Day 5 (2026-04-16) — Round 6 Phase 2 N=2 에서 확인된 v4 regression
 * (v4 place 25.95% vs v2 30.8%, avg latency +52%, max +94%) 의 원인이
 * Thinking Budget 지시 블록인지 **실측**으로 분리 검증하는 스크립트.
 *
 * 검증 흐름:
 *   1. v2 / v4 / v4.1 프롬프트를 동일 fixture 로 로드 (3-way)
 *   2. DeepSeek Reasoner Chat Completions API (/v1/chat/completions) 에 직접 axios POST
 *   3. 응답의 usage (prompt/completion tokens) + reasoning_content 길이 수집
 *   4. 응답 본문(JSON move) 을 파싱하여 차이 비교
 *   5. LangSmith Trace 기록 (LANGCHAIN_TRACING_V2=true 일 때만)
 *   6. 결과를 stdout + 마크다운 리포트 파일로 출력
 *
 * 성공 기준 (decideV41Verdict):
 *   A. v4.1 avg latency <= v2 latency * 1.20        (허용 오차 +20%)
 *   B. v4.1 tiles_placed_mean >= v2 tiles_placed_mean - 0.5  (noise tolerance)
 *   C. v4.1 reasoning_tokens_mean <= v4 reasoning_tokens_mean * 0.80  (thinking 단축 확인)
 *   Labels:
 *     - V4_1_PASS     : A+B+C 모두 만족 → Thinking Budget 단독 원인 확정
 *     - V4_1_PARTIAL  : A 또는 C 만족하나 B 미달
 *     - V4_1_FAIL     : A 불만족 → thinking 시간 단축 실패
 *     - V4_1_NEUTRAL  : 모두 v2 와 동등 → v4 regression 이 noise 였을 가능성
 *
 * 의존성: axios (이미 ai-adapter 에 존재), node:fs/path, dotenv 불필요 (env 직접 사용)
 *
 * 실행:
 *   export DEEPSEEK_API_KEY=...
 *   export LANGSMITH_API_KEY=...
 *   export LANGCHAIN_TRACING_V2=true
 *   export LANGCHAIN_PROJECT=rummiarena-v4.1-verification
 *   export N_REPEATS=3
 *   cd src/ai-adapter
 *   ./node_modules/.bin/ts-node --transpile-only scripts/verify-v4.1-deepseek-empirical.ts
 *
 * Redis / game-server / ai-adapter 서비스를 일체 호출하지 않는다.
 *
 * 보고: docs/04-testing/58-v4.1-deepseek-empirical-verification.md
 */

import axios, { AxiosError } from 'axios';
import * as fs from 'fs';
import * as path from 'path';

import {
  V2_REASONING_SYSTEM_PROMPT,
  buildV2UserPrompt,
} from '../src/prompt/v2-reasoning-prompt';
import {
  V4_REASONING_SYSTEM_PROMPT,
  buildV4UserPrompt,
} from '../src/prompt/v4-reasoning-prompt';
import {
  V4_1_REASONING_SYSTEM_PROMPT,
  buildV4_1UserPrompt,
} from '../src/prompt/v4-1-reasoning-prompt';

// ---------- Fixture: 중반(turn ~14), 손패 12, 보드 4 melds, 조커 1개 포함 ----------

interface GameState {
  tableGroups: Array<{ tiles: string[] }>;
  myTiles: string[];
  turnNumber: number;
  drawPileCount: number;
  initialMeldDone: boolean;
  opponents: Array<{ playerId: string; remainingTiles: number }>;
}

const FIXTURE: GameState = {
  // 4개 meld 가 이미 깔려 있음 (run × 2 + group × 2)
  tableGroups: [
    { tiles: ['R3a', 'R4a', 'R5a'] }, // Red run 3-4-5
    { tiles: ['B7a', 'Y7a', 'K7a'] }, // 7s group BYK
    { tiles: ['Y10a', 'Y11a', 'Y12a'] }, // Yellow run 10-11-12
    { tiles: ['K1a', 'B1a', 'R1a'] }, // 1s group KBR
  ],
  // 손패 12 — 의도적으로 멀티-수가 가능한 풍부한 상태로 설계:
  //   - R6a 로 Group1 (Red run 3-4-5) 확장 가능
  //   - Y9a 로 Group3 (Yellow run 10-11-12) 앞쪽 확장 가능
  //   - B10a + K10a + Y10a(table) 재배치로 10s group 만들기 가능 (rearrange — 더 깊은 수)
  //   - 그대로 두면 R8a, R9a, JK1 + 무엇 → 신규 셋
  //   - JK1 이 손에 있어 v4 의 5축 평가가 더 활성화될 가능성
  myTiles: [
    'R6a', // Group1 확장
    'R8a', // 신규 가능
    'R9a', // 신규 가능
    'B10a', // rearrange 후보
    'K10a', // rearrange 후보
    'Y9a', // Group3 앞쪽 확장
    'B5b', // 단독
    'Y2b', // 단독
    'K12a', // 단독
    'B13a', // 단독
    'JK1', // 조커
    'R12b', // Group3 와 같은 12 (다른 색 — group 형성 가능)
  ],
  turnNumber: 14,
  drawPileCount: 42,
  initialMeldDone: true, // 중반 상황
  opponents: [
    { playerId: 'P2', remainingTiles: 9 },
    { playerId: 'P3', remainingTiles: 11 },
    { playerId: 'P4', remainingTiles: 7 },
  ],
};

// ---------- DeepSeek 호출 ----------

type VariantLabel = 'v2' | 'v4' | 'v4.1';

/**
 * DeepSeek API usage payload. completion_tokens_details 및 reasoning_tokens 는
 * DeepSeek Reasoner 에서는 제공되지 않는다 (응답의 reasoning_content 필드로 대체).
 * 호환을 위해 OpenAI 형태의 부가 필드는 optional 로 유지.
 */
interface DeepseekUsage {
  prompt_tokens: number;
  completion_tokens: number;
  total_tokens: number;
  prompt_tokens_details?: {
    cached_tokens?: number;
  };
  /**
   * DeepSeek Reasoner 의 reasoning 길이 근사치.
   * content vs reasoning_content 구분은 response 파싱 시 처리하며,
   * "reasoning_tokens" 슬롯은 reasoning_content 를 approxTokens() 로 환산한 값으로 채운다.
   */
  completion_tokens_details?: {
    reasoning_tokens?: number;
  };
}

interface DeepseekCallResult {
  variant: VariantLabel;
  ok: boolean;
  errorMessage?: string;
  latencyMs: number;
  status?: number;
  rawContent?: string;
  reasoningContent?: string;
  parsed?: unknown;
  parseOk?: boolean;
  parseError?: string;
  usage?: DeepseekUsage;
  systemTokensApprox: number;
  userTokensApprox: number;
  langsmithRunId?: string;
}

const DEEPSEEK_API_KEY = process.env.DEEPSEEK_API_KEY ?? '';
const DEEPSEEK_MODEL = process.env.DEEPSEEK_MODEL ?? 'deepseek-reasoner';
const DEEPSEEK_BASE_URL =
  process.env.DEEPSEEK_BASE_URL ?? 'https://api.deepseek.com/v1';
const LANGSMITH_API_KEY = process.env.LANGSMITH_API_KEY ?? '';
const LANGSMITH_TRACING = process.env.LANGCHAIN_TRACING_V2 === 'true';
const LANGSMITH_PROJECT =
  process.env.LANGCHAIN_PROJECT ?? 'rummiarena-v4.1-verification';
const LANGSMITH_ENDPOINT =
  process.env.LANGCHAIN_ENDPOINT ?? 'https://api.smith.langchain.com';

if (!DEEPSEEK_API_KEY) {
  console.error('FATAL: DEEPSEEK_API_KEY env not set');
  process.exit(1);
}

// 대략적 토큰 추정 (영문 4 chars/token)
function approxTokens(text: string): number {
  return Math.ceil(text.length / 4);
}

// LangSmith Run 생성 (best-effort, 실패 시 무시)
async function langsmithStartRun(
  variant: VariantLabel,
  systemPrompt: string,
  userPrompt: string,
): Promise<string | undefined> {
  if (!LANGSMITH_TRACING || !LANGSMITH_API_KEY) return undefined;
  const runId = cryptoRandomUuid();
  try {
    await axios.post(
      `${LANGSMITH_ENDPOINT}/runs`,
      {
        id: runId,
        name: `verify-v4.1-deepseek-${variant}`,
        run_type: 'llm',
        inputs: {
          model: DEEPSEEK_MODEL,
          variant,
          system: systemPrompt.slice(0, 8000),
          user: userPrompt.slice(0, 8000),
        },
        start_time: new Date().toISOString(),
        session_name: LANGSMITH_PROJECT,
        extra: {
          metadata: {
            script: 'verify-v4.1-deepseek-empirical',
            fixture_turn: FIXTURE.turnNumber,
            fixture_rack_size: FIXTURE.myTiles.length,
            fixture_table_groups: FIXTURE.tableGroups.length,
          },
        },
      },
      {
        headers: {
          'x-api-key': LANGSMITH_API_KEY,
          'Content-Type': 'application/json',
        },
        timeout: 5000,
      },
    );
    return runId;
  } catch (err) {
    const e = err as AxiosError;
    console.warn(
      `[langsmith] startRun failed for ${variant}: ${e.message} (${e.response?.status ?? 'n/a'})`,
    );
    return undefined;
  }
}

async function langsmithEndRun(
  runId: string | undefined,
  result: DeepseekCallResult,
): Promise<void> {
  if (!runId || !LANGSMITH_TRACING || !LANGSMITH_API_KEY) return;
  try {
    await axios.patch(
      `${LANGSMITH_ENDPOINT}/runs/${runId}`,
      {
        end_time: new Date().toISOString(),
        outputs: {
          content: result.rawContent?.slice(0, 8000),
          parseOk: result.parseOk,
          parsed: result.parsed,
        },
        error: result.ok ? undefined : result.errorMessage,
        extra: {
          metadata: {
            latency_ms: result.latencyMs,
            usage: result.usage,
            status: result.status,
          },
        },
      },
      {
        headers: {
          'x-api-key': LANGSMITH_API_KEY,
          'Content-Type': 'application/json',
        },
        timeout: 5000,
      },
    );
  } catch (err) {
    const e = err as AxiosError;
    console.warn(
      `[langsmith] endRun failed: ${e.message} (${e.response?.status ?? 'n/a'})`,
    );
  }
}

function cryptoRandomUuid(): string {
  // node 18+ 의 globalThis.crypto.randomUUID 사용
  // (ts-node 환경에서도 동작)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const c = (globalThis as any).crypto;
  if (c?.randomUUID) return c.randomUUID();
  // 폴백: 단순 랜덤
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (ch) => {
    const r = (Math.random() * 16) | 0;
    const v = ch === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

async function callDeepseek(
  variant: VariantLabel,
  systemPrompt: string,
  userPrompt: string,
): Promise<DeepseekCallResult> {
  const t0 = Date.now();
  const langsmithRunId = await langsmithStartRun(
    variant,
    systemPrompt,
    userPrompt,
  );

  const result: DeepseekCallResult = {
    variant,
    ok: false,
    latencyMs: 0,
    systemTokensApprox: approxTokens(systemPrompt),
    userTokensApprox: approxTokens(userPrompt),
    langsmithRunId,
  };

  try {
    // DeepSeek Reasoner: max_tokens=16384, temperature 파라미터 미전송,
    // response_format 미지원 (deepseek.adapter.ts §195 주석 참조).
    const body: Record<string, unknown> = {
      model: DEEPSEEK_MODEL,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt },
      ],
      max_tokens: 16384,
    };

    const response = await axios.post(
      `${DEEPSEEK_BASE_URL}/chat/completions`,
      body,
      {
        headers: {
          Authorization: `Bearer ${DEEPSEEK_API_KEY}`,
          'Content-Type': 'application/json',
        },
        // DeepSeek Reasoner 후반 턴은 ~691s 까지 관측. 15분 여유.
        timeout: 900_000,
      },
    );

    result.latencyMs = Date.now() - t0;
    result.status = response.status;
    const rawUsage = response.data.usage;
    const usage: DeepseekUsage = rawUsage
      ? {
          prompt_tokens: rawUsage.prompt_tokens ?? 0,
          completion_tokens: rawUsage.completion_tokens ?? 0,
          total_tokens: rawUsage.total_tokens ?? 0,
          prompt_tokens_details: rawUsage.prompt_tokens_details,
          completion_tokens_details: rawUsage.completion_tokens_details,
        }
      : {
          prompt_tokens: 0,
          completion_tokens: 0,
          total_tokens: 0,
        };

    const choice = response.data.choices?.[0];
    const content = (choice?.message?.content as string | undefined) ?? '';
    const reasoning =
      (choice?.message?.reasoning_content as string | undefined) ?? '';
    result.rawContent = content;
    result.reasoningContent = reasoning;

    // DeepSeek usage 에는 reasoning_tokens 가 없다. reasoning_content 길이를
    // approxTokens() 로 환산하여 "reasoning_tokens" 슬롯을 채운다 (하위 통계 호환).
    if (reasoning) {
      usage.completion_tokens_details = {
        ...(usage.completion_tokens_details ?? {}),
        reasoning_tokens: approxTokens(reasoning),
      };
    }
    result.usage = usage;
    result.ok = true;

    // DeepSeek Reasoner 의 JSON 은 content 에 섞여 있거나 reasoning_content 에만
    // 있을 수 있다. extractBestJson 은 어댑터 내부에 있으므로, 본 스크립트는
    // 최소한의 복구만 수행한다.
    const candidate = extractJsonLike(content) || extractJsonLike(reasoning);
    if (candidate) {
      try {
        result.parsed = JSON.parse(candidate);
        result.parseOk = true;
      } catch (err) {
        result.parseOk = false;
        result.parseError = (err as Error).message;
      }
    } else {
      result.parseOk = false;
      result.parseError = 'no JSON-like content found in content or reasoning_content';
    }
  } catch (err) {
    result.latencyMs = Date.now() - t0;
    const e = err as AxiosError;
    result.errorMessage = e.message;
    result.status = e.response?.status;
    if (e.response?.data) {
      result.errorMessage += ` | ${JSON.stringify(e.response.data).slice(0, 500)}`;
    }
  }

  await langsmithEndRun(langsmithRunId, result);
  return result;
}

/**
 * 간이 JSON 추출기. content 또는 reasoning_content 에서 첫 번째로 완결된
 * 중괄호 블록을 반환한다. DeepSeek adapter 의 extractBestJson 대비 단순화 버전.
 */
function extractJsonLike(text: string): string | null {
  if (!text) return null;
  let cleaned = text.trim();
  const codeBlock = cleaned.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (codeBlock) cleaned = codeBlock[1].trim();
  const first = cleaned.indexOf('{');
  if (first < 0) return null;
  let depth = 0;
  for (let i = first; i < cleaned.length; i += 1) {
    if (cleaned[i] === '{') depth += 1;
    else if (cleaned[i] === '}') {
      depth -= 1;
      if (depth === 0) return cleaned.slice(first, i + 1);
    }
  }
  return null;
}

// ---------- 분석 헬퍼 ----------

interface MoveAnalysis {
  action?: string;
  reasoning?: string;
  reasoningLength?: number;
  tableGroupCount?: number;
  tilesFromRackCount?: number;
  tilesPlacedTotal?: number;
  rackTilesPreserved?: boolean;
  reasoningMentions: {
    legality: boolean;
    initialMeld: boolean;
    count: boolean;
    point: boolean;
    residual: boolean;
    thinkingBudget: boolean;
    actionBias: boolean;
    fiveAxis: boolean;
  };
}

function analyzeMove(parsed: unknown): MoveAnalysis {
  const empty: MoveAnalysis = {
    reasoningMentions: {
      legality: false,
      initialMeld: false,
      count: false,
      point: false,
      residual: false,
      thinkingBudget: false,
      actionBias: false,
      fiveAxis: false,
    },
  };
  if (!parsed || typeof parsed !== 'object') return empty;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const m = parsed as any;
  const reasoning: string =
    typeof m.reasoning === 'string' ? m.reasoning : '';
  const r = reasoning.toLowerCase();

  let tableGroupCount: number | undefined;
  let tilesFromRackCount: number | undefined;
  let tilesPlacedTotal: number | undefined;
  let rackTilesPreserved: boolean | undefined;

  if (Array.isArray(m.tableGroups)) {
    tableGroupCount = m.tableGroups.length;
    tilesPlacedTotal = m.tableGroups.reduce(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (acc: number, g: any) =>
        acc + (Array.isArray(g?.tiles) ? g.tiles.length : 0),
      0,
    );
  }
  if (Array.isArray(m.tilesFromRack)) {
    tilesFromRackCount = m.tilesFromRack.length;
    rackTilesPreserved = m.tilesFromRack.every((t: unknown) =>
      typeof t === 'string' ? FIXTURE.myTiles.includes(t) : false,
    );
  }

  return {
    action: typeof m.action === 'string' ? m.action : undefined,
    reasoning,
    reasoningLength: reasoning.length,
    tableGroupCount,
    tilesFromRackCount,
    tilesPlacedTotal,
    rackTilesPreserved,
    reasoningMentions: {
      legality: /legal|valid|rule/.test(r),
      initialMeld: /initial meld|initial-meld|>=\s*30|sum/.test(r),
      count: /count|tiles? placed|number of tiles/.test(r),
      point: /point|score|value/.test(r),
      residual: /residual|leftover|remain/.test(r),
      thinkingBudget: /think.*time|budget|deliberat/.test(r),
      actionBias: /action bias|prefer place|good plays/.test(r),
      fiveAxis: /5[\s-]?(axis|axe|criteria|dimension)/.test(r),
    },
  };
}

// ---------- 메인 ----------

async function main(): Promise<void> {
  console.log('='.repeat(80));
  console.log('verify-v4.1-deepseek-empirical.ts');
  console.log('Day 5 — Round 6 v4 regression 원인 분리 검증 (v2 vs v4 vs v4.1)');
  console.log('='.repeat(80));
  console.log(`Model:        ${DEEPSEEK_MODEL}`);
  console.log(
    `LangSmith:    ${LANGSMITH_TRACING ? `ON (project=${LANGSMITH_PROJECT})` : 'OFF'}`,
  );
  console.log(`Fixture turn: ${FIXTURE.turnNumber}`);
  console.log(`Rack size:    ${FIXTURE.myTiles.length}`);
  console.log(`Table groups: ${FIXTURE.tableGroups.length}`);

  const N = parseInt(process.env.N_REPEATS ?? '3', 10);
  console.log(`Repeats:      N=${N} per variant (v2, v4, v4.1)`);
  console.log('='.repeat(80));

  const v2User = buildV2UserPrompt(FIXTURE);
  const v4User = buildV4UserPrompt(FIXTURE);
  const v41User = buildV4_1UserPrompt(FIXTURE);

  console.log(
    `[approx tokens] v2 sys=${approxTokens(V2_REASONING_SYSTEM_PROMPT)} v4 sys=${approxTokens(V4_REASONING_SYSTEM_PROMPT)} v4.1 sys=${approxTokens(V4_1_REASONING_SYSTEM_PROMPT)}`,
  );
  console.log(
    `[approx tokens] v2 user=${approxTokens(v2User)} v4 user=${approxTokens(v4User)} v4.1 user=${approxTokens(v41User)}`,
  );

  // N 회 반복하여 stochastic variance 측정 — v2 → v4 → v4.1 순차
  const v2Runs: DeepseekCallResult[] = [];
  const v4Runs: DeepseekCallResult[] = [];
  const v41Runs: DeepseekCallResult[] = [];
  for (let i = 0; i < N; i += 1) {
    console.log(`\n[run ${i + 1}/${N}] Calling DeepSeek with v2 prompt...`);
    const v2 = await callDeepseek('v2', V2_REASONING_SYSTEM_PROMPT, v2User);
    console.log(
      `  -> ok=${v2.ok} status=${v2.status} latency=${v2.latencyMs}ms reasoning_approx=${v2.usage?.completion_tokens_details?.reasoning_tokens ?? 'n/a'}`,
    );
    v2Runs.push(v2);

    console.log(`\n[run ${i + 1}/${N}] Calling DeepSeek with v4 prompt...`);
    const v4 = await callDeepseek('v4', V4_REASONING_SYSTEM_PROMPT, v4User);
    console.log(
      `  -> ok=${v4.ok} status=${v4.status} latency=${v4.latencyMs}ms reasoning_approx=${v4.usage?.completion_tokens_details?.reasoning_tokens ?? 'n/a'}`,
    );
    v4Runs.push(v4);

    console.log(`\n[run ${i + 1}/${N}] Calling DeepSeek with v4.1 prompt...`);
    const v41 = await callDeepseek(
      'v4.1',
      V4_1_REASONING_SYSTEM_PROMPT,
      v41User,
    );
    console.log(
      `  -> ok=${v41.ok} status=${v41.status} latency=${v41.latencyMs}ms reasoning_approx=${v41.usage?.completion_tokens_details?.reasoning_tokens ?? 'n/a'}`,
    );
    v41Runs.push(v41);
  }

  // 마지막 run 을 "대표 결과"로 사용, 모든 run 은 리포트에 누적
  const v2Result = v2Runs[v2Runs.length - 1];
  const v4Result = v4Runs[v4Runs.length - 1];
  const v41Result = v41Runs[v41Runs.length - 1];

  // 분석
  const v2Analysis = analyzeMove(v2Result.parsed);
  const v4Analysis = analyzeMove(v4Result.parsed);
  const v41Analysis = analyzeMove(v41Result.parsed);

  // 다중 run 통계
  if (N > 1) {
    console.log('\n' + '='.repeat(80));
    console.log(`MULTI-RUN STATS (N=${N})`);
    console.log('='.repeat(80));
    printMultiRunStats('v2', v2Runs);
    printMultiRunStats('v4', v4Runs);
    printMultiRunStats('v4.1', v41Runs);
  }

  // 결과 출력
  console.log('\n' + '='.repeat(80));
  console.log('RESULT SUMMARY');
  console.log('='.repeat(80));
  printResult('v2', v2Result, v2Analysis);
  printResult('v4', v4Result, v4Analysis);
  printResult('v4.1', v41Result, v41Analysis);

  // 판정 (multi-run aggregate) — 3-way
  const v2Stats = computeStats('v2', v2Runs);
  const v4Stats = computeStats('v4', v4Runs);
  const v41Stats = computeStats('v4.1', v41Runs);
  const verdict = decideV41Verdict(v2Stats, v4Stats, v41Stats);
  console.log('\n' + '='.repeat(80));
  console.log('VERDICT: ' + verdict.label);
  console.log('='.repeat(80));
  for (const line of verdict.rationale) console.log('  - ' + line);

  // 마크다운 리포트 생성 — __dirname 에서 RummiArena 루트를 동적으로 탐색.
  let repoRoot = __dirname;
  for (let i = 0; i < 8; i += 1) {
    if (fs.existsSync(path.join(repoRoot, 'docs', '04-testing'))) break;
    repoRoot = path.dirname(repoRoot);
  }
  const reportPath = path.resolve(
    repoRoot,
    'docs',
    '04-testing',
    '58-v4.1-deepseek-empirical-verification.md',
  );
  const report = renderReport(
    v2Result,
    v4Result,
    v41Result,
    v2Analysis,
    v4Analysis,
    v41Analysis,
    verdict,
    v2Runs,
    v4Runs,
    v41Runs,
    v2Stats,
    v4Stats,
    v41Stats,
  );
  fs.writeFileSync(reportPath, report, 'utf8');
  console.log(`\n[report] ${reportPath}`);
}

/**
 * 3-way 판정. v2 를 baseline 으로 v4 regression 을 확인하고,
 * v4.1 이 Thinking Budget 제거만으로 v2 성능을 회복하는지 본다.
 *
 * 성공 기준 (A + B + C 동시 만족 시 V4_1_PASS):
 *   A. v4.1 avg latency <= v2 latency * 1.20
 *   B. v4.1 tiles_placed_mean >= v2 tiles_placed_mean - 0.5
 *   C. v4.1 reasoning_tokens_mean <= v4 reasoning_tokens_mean * 0.80
 */
function decideV41Verdict(
  v2: MultiRunStats,
  v4: MultiRunStats,
  v41: MultiRunStats,
): Verdict {
  const rationale: string[] = [];
  if (v2.successCount === 0 || v4.successCount === 0 || v41.successCount === 0) {
    return {
      label: 'INCONCLUSIVE',
      shortLabel: 'API 호출 실패',
      rationale: [
        `successCounts: v2=${v2.successCount}/${v2.n} v4=${v4.successCount}/${v4.n} v4.1=${v41.successCount}/${v41.n}`,
        '하나 이상의 variant 에서 전 호출 실패 → 비교 불가',
      ],
    };
  }

  // Cohen's d 는 참고용으로만 계산 (N=3 에서는 참고치)
  const reasoningPooled24 =
    Math.sqrt((v2.reasoningTokenStd ** 2 + v4.reasoningTokenStd ** 2) / 2) || 1;
  const reasoningD_v4_vs_v2 =
    (v4.reasoningTokenMean - v2.reasoningTokenMean) / reasoningPooled24;
  const reasoningPooled441 =
    Math.sqrt((v4.reasoningTokenStd ** 2 + v41.reasoningTokenStd ** 2) / 2) || 1;
  const reasoningD_v41_vs_v4 =
    (v41.reasoningTokenMean - v4.reasoningTokenMean) / reasoningPooled441;

  const tilesPooled241 =
    Math.sqrt((v2.tilesPlacedStd ** 2 + v41.tilesPlacedStd ** 2) / 2) || 1;
  const tilesD_v41_vs_v2 =
    (v41.tilesPlacedMean - v2.tilesPlacedMean) / tilesPooled241;

  rationale.push(
    `latency_ms mean: v2=${v2.latencyMean.toFixed(0)} v4=${v4.latencyMean.toFixed(0)} v4.1=${v41.latencyMean.toFixed(0)}`,
  );
  rationale.push(
    `reasoning_tokens mean: v2=${v2.reasoningTokenMean.toFixed(0)} v4=${v4.reasoningTokenMean.toFixed(0)} v4.1=${v41.reasoningTokenMean.toFixed(0)} | Cohen d(v4 vs v2)=${reasoningD_v4_vs_v2.toFixed(2)} | Cohen d(v4.1 vs v4)=${reasoningD_v41_vs_v4.toFixed(2)}`,
  );
  rationale.push(
    `tiles_placed mean: v2=${v2.tilesPlacedMean.toFixed(2)} v4=${v4.tilesPlacedMean.toFixed(2)} v4.1=${v41.tilesPlacedMean.toFixed(2)} | Cohen d(v4.1 vs v2)=${tilesD_v41_vs_v2.toFixed(2)}`,
  );
  rationale.push(
    `completion_tokens mean: v2=${v2.completionTokenMean.toFixed(0)} v4=${v4.completionTokenMean.toFixed(0)} v4.1=${v41.completionTokenMean.toFixed(0)}`,
  );

  // 성공 기준
  const latencyLimit = v2.latencyMean * 1.20;
  const A_latency = v41.latencyMean <= latencyLimit;
  const B_tiles = v41.tilesPlacedMean >= v2.tilesPlacedMean - 0.5;
  // v4 reasoning_tokens 가 0 인 경우(시그널 없음)에는 C 조건을 "v4.1 <= v2*1.1" 로 완화
  const reasoningThreshold =
    v4.reasoningTokenMean > 0
      ? v4.reasoningTokenMean * 0.80
      : Math.max(v2.reasoningTokenMean * 1.1, 1);
  const C_reasoning = v41.reasoningTokenMean <= reasoningThreshold;

  rationale.push(
    `A (v4.1 latency <= v2*1.2): ${A_latency ? 'PASS' : 'FAIL'}  (${v41.latencyMean.toFixed(0)} vs limit ${latencyLimit.toFixed(0)})`,
  );
  rationale.push(
    `B (v4.1 tiles >= v2-0.5):   ${B_tiles ? 'PASS' : 'FAIL'}  (${v41.tilesPlacedMean.toFixed(2)} vs limit ${(v2.tilesPlacedMean - 0.5).toFixed(2)})`,
  );
  rationale.push(
    `C (v4.1 reasoning <= v4*0.8): ${C_reasoning ? 'PASS' : 'FAIL'}  (${v41.reasoningTokenMean.toFixed(0)} vs limit ${reasoningThreshold.toFixed(0)})`,
  );

  // 추가 컨텍스트: v4 가 실제로 v2 대비 regression 인지 확인
  const v4HasLatencyRegression = v4.latencyMean > v2.latencyMean * 1.20;
  const v4HasTilesRegression = v4.tilesPlacedMean < v2.tilesPlacedMean - 0.5;
  if (!v4HasLatencyRegression && !v4HasTilesRegression) {
    rationale.push(
      '주의: 본 fixture 에서는 v4 가 v2 대비 유의한 regression 을 보이지 않음. N=3 fixture 검증의 한계일 수 있음.',
    );
  }

  let label: Verdict['label'];
  let shortLabel: string;

  if (A_latency && B_tiles && C_reasoning) {
    label = 'V4_1_PASS';
    shortLabel =
      'Thinking Budget 제거로 v2 성능 회복 확인 — v4 regression 원인 확정';
  } else if (!A_latency) {
    label = 'V4_1_FAIL';
    shortLabel =
      'latency 단축 실패 — Thinking Budget 외 다른 요소가 v4 regression 원인';
  } else if (A_latency && C_reasoning && !B_tiles) {
    label = 'V4_1_PARTIAL';
    shortLabel =
      'latency/thinking 개선하나 quality 회복 안 됨 — 다른 원인 가능성';
  } else if (!v4HasLatencyRegression && !v4HasTilesRegression) {
    label = 'V4_1_NEUTRAL';
    shortLabel =
      'v4 regression 자체가 본 fixture 에서 관찰되지 않음 — Round 6 결과가 noise 였을 가능성';
  } else {
    label = 'V4_1_PARTIAL';
    shortLabel = '일부 기준만 충족 — 추가 fixture 필요';
  }

  return { label, shortLabel, rationale };
}

function mean(arr: number[]): number {
  if (arr.length === 0) return 0;
  return arr.reduce((a, b) => a + b, 0) / arr.length;
}

function stddev(arr: number[]): number {
  if (arr.length < 2) return 0;
  const m = mean(arr);
  return Math.sqrt(
    arr.reduce((acc, v) => acc + (v - m) * (v - m), 0) / (arr.length - 1),
  );
}

interface MultiRunStats {
  variant: string;
  n: number;
  successCount: number;
  latencyMean: number;
  latencyStd: number;
  reasoningTokenMean: number;
  reasoningTokenStd: number;
  completionTokenMean: number;
  completionTokenStd: number;
  tilesPlacedMean: number;
  tilesPlacedStd: number;
  tilesPlacedSamples: number[];
  reasoningTokenSamples: number[];
}

function computeStats(label: string, runs: DeepseekCallResult[]): MultiRunStats {
  const ok = runs.filter((r) => r.ok);
  const latencies = ok.map((r) => r.latencyMs);
  const reasoningTokens = ok.map(
    (r) => r.usage?.completion_tokens_details?.reasoning_tokens ?? 0,
  );
  const completionTokens = ok.map((r) => r.usage?.completion_tokens ?? 0);
  const tilesPlaced = ok.map((r) => {
    const a = analyzeMove(r.parsed);
    return a.tilesFromRackCount ?? 0;
  });
  return {
    variant: label,
    n: runs.length,
    successCount: ok.length,
    latencyMean: mean(latencies),
    latencyStd: stddev(latencies),
    reasoningTokenMean: mean(reasoningTokens),
    reasoningTokenStd: stddev(reasoningTokens),
    completionTokenMean: mean(completionTokens),
    completionTokenStd: stddev(completionTokens),
    tilesPlacedMean: mean(tilesPlaced),
    tilesPlacedStd: stddev(tilesPlaced),
    tilesPlacedSamples: tilesPlaced,
    reasoningTokenSamples: reasoningTokens,
  };
}

function printMultiRunStats(label: string, runs: DeepseekCallResult[]): void {
  const s = computeStats(label, runs);
  console.log(`\n--- ${label} (N=${s.n}, ok=${s.successCount}) ---`);
  console.log(
    `  latency_ms       mean=${s.latencyMean.toFixed(0)} std=${s.latencyStd.toFixed(0)}`,
  );
  console.log(
    `  completion_tok   mean=${s.completionTokenMean.toFixed(0)} std=${s.completionTokenStd.toFixed(0)}`,
  );
  console.log(
    `  reasoning_tok    mean=${s.reasoningTokenMean.toFixed(0)} std=${s.reasoningTokenStd.toFixed(0)}  samples=[${s.reasoningTokenSamples.join(', ')}]`,
  );
  console.log(
    `  tiles_placed     mean=${s.tilesPlacedMean.toFixed(2)} std=${s.tilesPlacedStd.toFixed(2)}  samples=[${s.tilesPlacedSamples.join(', ')}]`,
  );
}

function printResult(
  label: string,
  result: DeepseekCallResult,
  analysis: MoveAnalysis,
): void {
  console.log(`\n--- ${label} ---`);
  if (!result.ok) {
    console.log(`  ERROR: ${result.errorMessage}`);
    return;
  }
  console.log(`  status:           ${result.status}`);
  console.log(`  latency:          ${result.latencyMs}ms`);
  console.log(
    `  usage:            prompt=${result.usage?.prompt_tokens} completion=${result.usage?.completion_tokens} total=${result.usage?.total_tokens}`,
  );
  console.log(
    `  reasoning_tokens: ${result.usage?.completion_tokens_details?.reasoning_tokens ?? 'absent'}`,
  );
  console.log(`  parseOk:          ${result.parseOk}`);
  if (analysis.action) {
    console.log(`  action:           ${analysis.action}`);
    console.log(`  tableGroups:      ${analysis.tableGroupCount}`);
    console.log(`  tilesFromRack:    ${analysis.tilesFromRackCount}`);
    console.log(
      `  rackTilesPreserved: ${analysis.rackTilesPreserved}`,
    );
    console.log(
      `  reasoning(${analysis.reasoningLength} chars): ${analysis.reasoning?.slice(0, 200)}${(analysis.reasoning?.length ?? 0) > 200 ? '...' : ''}`,
    );
  }
}

interface Verdict {
  label:
    | 'V4_1_PASS'
    | 'V4_1_PARTIAL'
    | 'V4_1_FAIL'
    | 'V4_1_NEUTRAL'
    | 'INCONCLUSIVE';
  shortLabel: string;
  rationale: string[];
}

function renderReport(
  v2: DeepseekCallResult,
  v4: DeepseekCallResult,
  v41: DeepseekCallResult,
  v2a: MoveAnalysis,
  v4a: MoveAnalysis,
  v41a: MoveAnalysis,
  verdict: Verdict,
  v2Runs: DeepseekCallResult[],
  v4Runs: DeepseekCallResult[],
  v41Runs: DeepseekCallResult[],
  v2Stats: MultiRunStats,
  v4Stats: MultiRunStats,
  v41Stats: MultiRunStats,
): string {
  const today = new Date().toISOString().slice(0, 10);

  const md: string[] = [];
  md.push(`# 58. v4.1 vs v4 vs v2 DeepSeek Reasoner 실측 검증 보고서`);
  md.push('');
  md.push(`- **작성일**: ${today}`);
  md.push(`- **모델**: ${DEEPSEEK_MODEL}`);
  md.push(
    `- **검증 목적**: Round 6 Phase 2 N=2 에서 확인된 v4 regression (place 25.95% vs v2 30.8%, avg latency +52%, max +94%) 의 원인이 Thinking Budget 지시 블록인지 single-variable A/B 로 분리 검증`,
  );
  md.push(
    `- **스크립트**: \`src/ai-adapter/scripts/verify-v4.1-deepseek-empirical.ts\``,
  );
  md.push(
    `- **LangSmith**: ${LANGSMITH_TRACING ? `enabled (project=${LANGSMITH_PROJECT})` : 'disabled'}`,
  );
  md.push('');
  md.push('## 결론 (TL;DR)');
  md.push('');
  md.push(`**${verdict.label}** — ${verdict.shortLabel}`);
  md.push('');
  md.push('판정 근거:');
  for (const line of verdict.rationale) md.push(`- ${line}`);
  md.push('');

  md.push('## 1. Fixture');
  md.push('');
  md.push('세 호출(v2 / v4 / v4.1) 에 동일한 게임 상태를 사용했다.');
  md.push('');
  md.push('```json');
  md.push(JSON.stringify(FIXTURE, null, 2));
  md.push('```');
  md.push('');
  md.push(
    `- 턴: ${FIXTURE.turnNumber}, 손패: ${FIXTURE.myTiles.length}, 보드: ${FIXTURE.tableGroups.length} groups, 조커 1개`,
  );
  md.push('- initialMeldDone: true (중반)');
  md.push(
    `- 상대: ${FIXTURE.opponents.map((o) => `${o.playerId}(${o.remainingTiles})`).join(', ')}`,
  );
  md.push('');

  md.push(`## 2. Multi-run 통계 (N=${v2Runs.length})`);
  md.push('');
  md.push(
    '동일 fixture 를 3 variant 에 N 회 반복 호출한 집계. v4.1 의 Thinking Budget 단독 제거가 v2 성능을 회복하는지를 single variable 로 확인한다.',
  );
  md.push('');
  md.push('| metric | v2 mean | v2 std | v4 mean | v4 std | v4.1 mean | v4.1 std |');
  md.push('|--------|---------|--------|---------|--------|-----------|----------|');
  md.push(
    `| latency_ms | ${v2Stats.latencyMean.toFixed(0)} | ${v2Stats.latencyStd.toFixed(0)} | ${v4Stats.latencyMean.toFixed(0)} | ${v4Stats.latencyStd.toFixed(0)} | ${v41Stats.latencyMean.toFixed(0)} | ${v41Stats.latencyStd.toFixed(0)} |`,
  );
  md.push(
    `| completion_tokens | ${v2Stats.completionTokenMean.toFixed(0)} | ${v2Stats.completionTokenStd.toFixed(0)} | ${v4Stats.completionTokenMean.toFixed(0)} | ${v4Stats.completionTokenStd.toFixed(0)} | ${v41Stats.completionTokenMean.toFixed(0)} | ${v41Stats.completionTokenStd.toFixed(0)} |`,
  );
  md.push(
    `| **reasoning_tokens (approx)** | ${v2Stats.reasoningTokenMean.toFixed(0)} | ${v2Stats.reasoningTokenStd.toFixed(0)} | ${v4Stats.reasoningTokenMean.toFixed(0)} | ${v4Stats.reasoningTokenStd.toFixed(0)} | ${v41Stats.reasoningTokenMean.toFixed(0)} | ${v41Stats.reasoningTokenStd.toFixed(0)} |`,
  );
  md.push(
    `| **tiles_placed** | ${v2Stats.tilesPlacedMean.toFixed(2)} | ${v2Stats.tilesPlacedStd.toFixed(2)} | ${v4Stats.tilesPlacedMean.toFixed(2)} | ${v4Stats.tilesPlacedStd.toFixed(2)} | ${v41Stats.tilesPlacedMean.toFixed(2)} | ${v41Stats.tilesPlacedStd.toFixed(2)} |`,
  );
  md.push('');
  md.push('> reasoning_tokens 는 DeepSeek 가 노출하지 않으므로 reasoning_content 길이의 approxTokens() 환산값이다 (4 chars/token).');
  md.push('');
  md.push('### Per-run samples');
  md.push('');
  md.push(
    '| run | v2 reasoning | v2 tiles | v2 latency | v4 reasoning | v4 tiles | v4 latency | v4.1 reasoning | v4.1 tiles | v4.1 latency |',
  );
  md.push(
    '|-----|--------------|----------|------------|--------------|----------|------------|----------------|------------|---------------|',
  );
  for (let i = 0; i < v2Runs.length; i += 1) {
    const r2 = v2Runs[i];
    const r4 = v4Runs[i];
    const r41 = v41Runs[i];
    const a2 = analyzeMove(r2.parsed);
    const a4 = analyzeMove(r4.parsed);
    const a41 = analyzeMove(r41.parsed);
    md.push(
      `| ${i + 1} | ${r2.usage?.completion_tokens_details?.reasoning_tokens ?? 'n/a'} | ${a2.tilesFromRackCount ?? 'n/a'} | ${r2.latencyMs}ms | ${r4.usage?.completion_tokens_details?.reasoning_tokens ?? 'n/a'} | ${a4.tilesFromRackCount ?? 'n/a'} | ${r4.latencyMs}ms | ${r41.usage?.completion_tokens_details?.reasoning_tokens ?? 'n/a'} | ${a41.tilesFromRackCount ?? 'n/a'} | ${r41.latencyMs}ms |`,
    );
  }
  md.push('');

  md.push('## 3. 마지막 호출 결과 (대표)');
  md.push('');
  md.push('| 항목 | v2 | v4 | v4.1 |');
  md.push('|------|----|----|------|');
  md.push(
    `| 성공 여부 | ${v2.ok ? 'OK' : 'FAIL'} | ${v4.ok ? 'OK' : 'FAIL'} | ${v41.ok ? 'OK' : 'FAIL'} |`,
  );
  md.push(
    `| HTTP status | ${v2.status ?? 'n/a'} | ${v4.status ?? 'n/a'} | ${v41.status ?? 'n/a'} |`,
  );
  md.push(
    `| Latency (ms) | ${v2.latencyMs} | ${v4.latencyMs} | ${v41.latencyMs} |`,
  );
  md.push(
    `| prompt_tokens | ${v2.usage?.prompt_tokens ?? 'n/a'} | ${v4.usage?.prompt_tokens ?? 'n/a'} | ${v41.usage?.prompt_tokens ?? 'n/a'} |`,
  );
  md.push(
    `| completion_tokens | ${v2.usage?.completion_tokens ?? 'n/a'} | ${v4.usage?.completion_tokens ?? 'n/a'} | ${v41.usage?.completion_tokens ?? 'n/a'} |`,
  );
  md.push(
    `| reasoning_approx (chars) | ${v2.reasoningContent?.length ?? 0} | ${v4.reasoningContent?.length ?? 0} | ${v41.reasoningContent?.length ?? 0} |`,
  );
  md.push(
    `| total_tokens | ${v2.usage?.total_tokens ?? 'n/a'} | ${v4.usage?.total_tokens ?? 'n/a'} | ${v41.usage?.total_tokens ?? 'n/a'} |`,
  );
  md.push('');

  md.push('## 4. Move 분석');
  md.push('');
  md.push('| 항목 | v2 | v4 | v4.1 |');
  md.push('|------|----|----|------|');
  md.push(
    `| action | ${v2a.action ?? 'n/a'} | ${v4a.action ?? 'n/a'} | ${v41a.action ?? 'n/a'} |`,
  );
  md.push(
    `| tableGroups (count) | ${v2a.tableGroupCount ?? 'n/a'} | ${v4a.tableGroupCount ?? 'n/a'} | ${v41a.tableGroupCount ?? 'n/a'} |`,
  );
  md.push(
    `| tilesFromRack (count) | ${v2a.tilesFromRackCount ?? 'n/a'} | ${v4a.tilesFromRackCount ?? 'n/a'} | ${v41a.tilesFromRackCount ?? 'n/a'} |`,
  );
  md.push(
    `| tilesPlacedTotal | ${v2a.tilesPlacedTotal ?? 'n/a'} | ${v4a.tilesPlacedTotal ?? 'n/a'} | ${v41a.tilesPlacedTotal ?? 'n/a'} |`,
  );
  md.push(
    `| rack 보존성 | ${v2a.rackTilesPreserved ?? 'n/a'} | ${v4a.rackTilesPreserved ?? 'n/a'} | ${v41a.rackTilesPreserved ?? 'n/a'} |`,
  );
  md.push(
    `| reasoning 길이 (chars) | ${v2a.reasoningLength ?? 'n/a'} | ${v4a.reasoningLength ?? 'n/a'} | ${v41a.reasoningLength ?? 'n/a'} |`,
  );
  md.push('');

  md.push('## 5. Raw 응답 (대표 run)');
  md.push('');
  md.push('### 5.1 v2 응답');
  md.push('');
  md.push('```json');
  md.push(v2.rawContent ?? '(empty)');
  md.push('```');
  md.push('');
  md.push('### 5.2 v4 응답');
  md.push('');
  md.push('```json');
  md.push(v4.rawContent ?? '(empty)');
  md.push('```');
  md.push('');
  md.push('### 5.3 v4.1 응답');
  md.push('');
  md.push('```json');
  md.push(v41.rawContent ?? '(empty)');
  md.push('```');
  md.push('');

  md.push('## 6. 해석 및 권고');
  md.push('');
  if (verdict.label === 'V4_1_PASS') {
    md.push('### 권고: v4.1 프로모션 검토 + Round 7 본 대전 편입');
    md.push('');
    md.push(
      '- Thinking Budget 지시 블록 단독 제거로 v2 수준의 latency 및 tiles_placed 가 회복됨.',
    );
    md.push(
      '- v4 의 5축 평가 / Action Bias / Few-shot 5개는 가치 중립 이상이며 (품질 보존) thinking 시간만 단축된 셈.',
    );
    md.push(
      '- Round 7 에 v4.1 DeepSeek/Claude/DashScope 1게임씩 편입하여 N 확대 권장.',
    );
  } else if (verdict.label === 'V4_1_FAIL') {
    md.push('### 권고: Thinking Budget 은 주요 원인이 아님 → 다음 variable 분리');
    md.push('');
    md.push(
      '- Thinking Budget 제거에도 v4.1 latency 가 v2 대비 20% 초과. 다른 요소가 regression 을 야기하고 있음.',
    );
    md.push(
      '- 다음 후보: 5축 평가 지시의 enumerate 요구, Action Bias 의 tie-break rewrite, Few-shot 5개의 token 비용.',
    );
    md.push('- v4.2 — 5축 평가 제거 variant 작성 검토.');
  } else if (verdict.label === 'V4_1_PARTIAL') {
    md.push('### 권고: 일부 개선 — N 확대 필요');
    md.push('');
    md.push(
      '- v4.1 이 일부 기준만 충족. Thinking Budget 이 단일 원인이 아닐 가능성.',
    );
    md.push('- N=10+ 로 확대하여 stochastic noise 분리 후 재판정.');
  } else if (verdict.label === 'V4_1_NEUTRAL') {
    md.push('### 권고: Round 6 결과가 noise 였을 가능성 — Round 7 재측정');
    md.push('');
    md.push(
      '- 본 fixture 에서는 v4 가 v2 대비 regression 을 보이지 않음. Round 6 80턴 avg/max 가 1~2 long-reasoning turn 에 의해 왜곡되었을 가능성.',
    );
    md.push('- Round 7 에서 same-seed 재측정 권장.');
  } else {
    md.push('### 권고: API 호출 실패 → 재실행 필요');
    md.push('');
    md.push('- 호출 자체가 실패하여 가설 검증 불가. 키/네트워크 확인 후 재시도.');
  }
  md.push('');

  md.push('## 7. 재현 방법');
  md.push('');
  md.push('```bash');
  md.push(
    'export DEEPSEEK_API_KEY=$(kubectl -n rummikub get secret ai-adapter-secret -o jsonpath=\'{.data.DEEPSEEK_API_KEY}\' | base64 -d)',
  );
  md.push('export LANGSMITH_API_KEY=...   # 사용자 제공');
  md.push('export LANGCHAIN_TRACING_V2=true');
  md.push('export LANGCHAIN_PROJECT=rummiarena-v4.1-verification');
  md.push('export N_REPEATS=3');
  md.push('cd src/ai-adapter');
  md.push(
    './node_modules/.bin/ts-node --transpile-only scripts/verify-v4.1-deepseek-empirical.ts',
  );
  md.push('```');
  md.push('');
  md.push('## 8. 한계');
  md.push('');
  md.push(
    `- N=${v2Runs.length} single fixture. 통계적 유의성은 제한적이며 "원인 분리 탐침" 목적.`,
  );
  md.push(
    '- DeepSeek 는 usage.completion_tokens_details.reasoning_tokens 를 제공하지 않음. reasoning_content 길이 approximation 사용.',
  );
  md.push(
    '- temperature 파라미터 미전송 (어댑터 호환) — stochastic variance 가 존재.',
  );
  md.push(
    '- 본 검증은 single turn 수준이며, Round 6 의 multi-turn 누적 효과 (후반 복잡도 증가) 는 재현하지 않는다.',
  );
  md.push('');
  md.push('---');
  md.push('');
  md.push(
    '*본 보고서는 `verify-v4.1-deepseek-empirical.ts` 자동 생성. 수동 편집 금지 (재실행 시 덮어씀).*',
  );

  return md.join('\n') + '\n';
}

main().catch((err) => {
  console.error('FATAL:', err);
  process.exit(1);
});
