/**
 * verify-v4-gpt-empirical.ts
 *
 * Day 4 (2026-04-15) — SP5 가설("GPT-5-mini 는 v4 reasoner 지시를 무시한다") 를
 * **실측**으로 검증하기 위한 독립 스크립트.
 *
 * 검증 흐름:
 *   1. v2 프롬프트와 v4 프롬프트를 동일한 fixture 게임 상태로 로드
 *   2. OpenAI Chat Completions API (/v1/chat/completions) 에 직접 axios POST
 *   3. 응답의 usage.completion_tokens_details.reasoning_tokens 등을 수집
 *   4. 응답 본문(JSON move) 을 파싱하여 차이 비교
 *   5. LangSmith Trace 기록 (LANGCHAIN_TRACING_V2=true 일 때만)
 *   6. 결과를 stdout + 마크다운 리포트 파일로 출력
 *
 * 의존성: axios (이미 ai-adapter 에 존재), node:fs/path, dotenv 불필요 (env 직접 사용)
 *
 * 실행:
 *   export OPENAI_API_KEY=...
 *   export LANGSMITH_API_KEY=...
 *   export LANGCHAIN_TRACING_V2=true
 *   export LANGCHAIN_PROJECT=rummiarena-v4-verification
 *   cd src/ai-adapter
 *   ./node_modules/.bin/ts-node --transpile-only scripts/verify-v4-gpt-empirical.ts
 *
 * Redis / game-server / ai-adapter 서비스를 일체 호출하지 않는다.
 *
 * 보고: docs/04-testing/57-v4-gpt-empirical-verification.md
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

// ---------- OpenAI 호출 ----------

interface OpenAiUsage {
  prompt_tokens: number;
  completion_tokens: number;
  total_tokens: number;
  prompt_tokens_details?: {
    cached_tokens?: number;
    audio_tokens?: number;
  };
  completion_tokens_details?: {
    reasoning_tokens?: number;
    audio_tokens?: number;
    accepted_prediction_tokens?: number;
    rejected_prediction_tokens?: number;
  };
}

interface OpenAiCallResult {
  variant: 'v2' | 'v4';
  ok: boolean;
  errorMessage?: string;
  latencyMs: number;
  status?: number;
  rawContent?: string;
  parsed?: unknown;
  parseOk?: boolean;
  parseError?: string;
  usage?: OpenAiUsage;
  systemTokensApprox: number;
  userTokensApprox: number;
  langsmithRunId?: string;
}

const OPENAI_API_KEY = process.env.OPENAI_API_KEY ?? '';
const OPENAI_MODEL = process.env.OPENAI_MODEL ?? 'gpt-5-mini';
const LANGSMITH_API_KEY = process.env.LANGSMITH_API_KEY ?? '';
const LANGSMITH_TRACING = process.env.LANGCHAIN_TRACING_V2 === 'true';
const LANGSMITH_PROJECT =
  process.env.LANGCHAIN_PROJECT ?? 'rummiarena-v4-verification';
const LANGSMITH_ENDPOINT =
  process.env.LANGCHAIN_ENDPOINT ?? 'https://api.smith.langchain.com';

if (!OPENAI_API_KEY) {
  console.error('FATAL: OPENAI_API_KEY env not set');
  process.exit(1);
}

// 대략적 토큰 추정 (영문 4 chars/token)
function approxTokens(text: string): number {
  return Math.ceil(text.length / 4);
}

// LangSmith Run 생성 (best-effort, 실패 시 무시)
async function langsmithStartRun(
  variant: 'v2' | 'v4',
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
        name: `verify-v4-gpt-${variant}`,
        run_type: 'llm',
        inputs: {
          model: OPENAI_MODEL,
          variant,
          system: systemPrompt.slice(0, 8000),
          user: userPrompt.slice(0, 8000),
        },
        start_time: new Date().toISOString(),
        session_name: LANGSMITH_PROJECT,
        extra: {
          metadata: {
            script: 'verify-v4-gpt-empirical',
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
  result: OpenAiCallResult,
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

async function callOpenAi(
  variant: 'v2' | 'v4',
  systemPrompt: string,
  userPrompt: string,
): Promise<OpenAiCallResult> {
  const t0 = Date.now();
  const langsmithRunId = await langsmithStartRun(
    variant,
    systemPrompt,
    userPrompt,
  );

  const result: OpenAiCallResult = {
    variant,
    ok: false,
    latencyMs: 0,
    systemTokensApprox: approxTokens(systemPrompt),
    userTokensApprox: approxTokens(userPrompt),
    langsmithRunId,
  };

  try {
    // gpt-5-mini 추론 모델: max_completion_tokens, temperature 미지정
    const isReasoning = OPENAI_MODEL.startsWith('gpt-5');
    const body: Record<string, unknown> = {
      model: OPENAI_MODEL,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt },
      ],
      response_format: { type: 'json_object' },
    };
    if (isReasoning) {
      body.max_completion_tokens = 8192;
    } else {
      body.max_tokens = 1024;
      body.temperature = 0.0;
    }

    const response = await axios.post(
      'https://api.openai.com/v1/chat/completions',
      body,
      {
        headers: {
          Authorization: `Bearer ${OPENAI_API_KEY}`,
          'Content-Type': 'application/json',
        },
        timeout: 300_000, // 5분 (추론 모델 여유)
      },
    );

    result.latencyMs = Date.now() - t0;
    result.status = response.status;
    result.usage = response.data.usage as OpenAiUsage;
    const content = response.data.choices?.[0]?.message?.content as
      | string
      | undefined;
    result.rawContent = content;
    result.ok = true;

    if (content) {
      try {
        result.parsed = JSON.parse(content);
        result.parseOk = true;
      } catch (err) {
        result.parseOk = false;
        result.parseError = (err as Error).message;
      }
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
  console.log('verify-v4-gpt-empirical.ts');
  console.log('Day 4 — SP5 가설 실측 검증');
  console.log('='.repeat(80));
  console.log(`Model:        ${OPENAI_MODEL}`);
  console.log(
    `LangSmith:    ${LANGSMITH_TRACING ? `ON (project=${LANGSMITH_PROJECT})` : 'OFF'}`,
  );
  console.log(`Fixture turn: ${FIXTURE.turnNumber}`);
  console.log(`Rack size:    ${FIXTURE.myTiles.length}`);
  console.log(`Table groups: ${FIXTURE.tableGroups.length}`);

  const N = parseInt(process.env.N_REPEATS ?? '1', 10);
  console.log(`Repeats:      N=${N} per variant`);
  console.log('='.repeat(80));

  const v2User = buildV2UserPrompt(FIXTURE);
  const v4User = buildV4UserPrompt(FIXTURE);

  console.log(
    `[approx tokens] v2 sys=${approxTokens(V2_REASONING_SYSTEM_PROMPT)} v4 sys=${approxTokens(V4_REASONING_SYSTEM_PROMPT)}`,
  );
  console.log(
    `[approx tokens] v2 user=${approxTokens(v2User)} v4 user=${approxTokens(v4User)}`,
  );

  // N 회 반복하여 stochastic variance 측정
  const v2Runs: OpenAiCallResult[] = [];
  const v4Runs: OpenAiCallResult[] = [];
  for (let i = 0; i < N; i += 1) {
    console.log(`\n[run ${i + 1}/${N}] Calling OpenAI with v2 prompt...`);
    const v2 = await callOpenAi('v2', V2_REASONING_SYSTEM_PROMPT, v2User);
    console.log(
      `  -> ok=${v2.ok} status=${v2.status} latency=${v2.latencyMs}ms reasoning_tokens=${v2.usage?.completion_tokens_details?.reasoning_tokens ?? 'n/a'}`,
    );
    v2Runs.push(v2);

    console.log(`\n[run ${i + 1}/${N}] Calling OpenAI with v4 prompt...`);
    const v4 = await callOpenAi('v4', V4_REASONING_SYSTEM_PROMPT, v4User);
    console.log(
      `  -> ok=${v4.ok} status=${v4.status} latency=${v4.latencyMs}ms reasoning_tokens=${v4.usage?.completion_tokens_details?.reasoning_tokens ?? 'n/a'}`,
    );
    v4Runs.push(v4);
  }

  // 마지막 run 을 "대표 결과"로 사용 (하위 호환), 모든 run 은 리포트에 누적
  const v2Result = v2Runs[v2Runs.length - 1];
  const v4Result = v4Runs[v4Runs.length - 1];

  // 분석
  const v2Analysis = analyzeMove(v2Result.parsed);
  const v4Analysis = analyzeMove(v4Result.parsed);

  // 다중 run 통계
  if (N > 1) {
    console.log('\n' + '='.repeat(80));
    console.log(`MULTI-RUN STATS (N=${N})`);
    console.log('='.repeat(80));
    printMultiRunStats('v2', v2Runs);
    printMultiRunStats('v4', v4Runs);
  }

  // 결과 출력
  console.log('\n' + '='.repeat(80));
  console.log('RESULT SUMMARY');
  console.log('='.repeat(80));
  printResult('v2', v2Result, v2Analysis);
  printResult('v4', v4Result, v4Analysis);

  // 핵심 비교
  console.log('\n' + '='.repeat(80));
  console.log('CORE COMPARISON (v2 vs v4)');
  console.log('='.repeat(80));
  console.log(
    `Latency:           v2=${v2Result.latencyMs}ms  v4=${v4Result.latencyMs}ms  Δ=${v4Result.latencyMs - v2Result.latencyMs}ms`,
  );
  console.log(
    `Prompt tokens:     v2=${v2Result.usage?.prompt_tokens ?? 'n/a'}  v4=${v4Result.usage?.prompt_tokens ?? 'n/a'}`,
  );
  console.log(
    `Completion tokens: v2=${v2Result.usage?.completion_tokens ?? 'n/a'}  v4=${v4Result.usage?.completion_tokens ?? 'n/a'}`,
  );
  const v2Reasoning =
    v2Result.usage?.completion_tokens_details?.reasoning_tokens;
  const v4Reasoning =
    v4Result.usage?.completion_tokens_details?.reasoning_tokens;
  console.log(
    `Reasoning tokens:  v2=${v2Reasoning ?? 'n/a'}  v4=${v4Reasoning ?? 'n/a'}  Δ=${
      v2Reasoning != null && v4Reasoning != null
        ? v4Reasoning - v2Reasoning
        : 'n/a'
    }`,
  );
  console.log(
    `Action:            v2=${v2Analysis.action}  v4=${v4Analysis.action}`,
  );
  console.log(
    `tilesFromRack:     v2=${v2Analysis.tilesFromRackCount ?? 'n/a'}  v4=${v4Analysis.tilesFromRackCount ?? 'n/a'}`,
  );
  console.log(
    `Reasoning length:  v2=${v2Analysis.reasoningLength ?? 'n/a'} chars  v4=${v4Analysis.reasoningLength ?? 'n/a'} chars`,
  );
  console.log('Reasoning mentions (does the GPT response cite v4 keywords?):');
  console.log(
    `  legality:        v2=${v2Analysis.reasoningMentions.legality}  v4=${v4Analysis.reasoningMentions.legality}`,
  );
  console.log(
    `  count:           v2=${v2Analysis.reasoningMentions.count}  v4=${v4Analysis.reasoningMentions.count}`,
  );
  console.log(
    `  point/value:     v2=${v2Analysis.reasoningMentions.point}  v4=${v4Analysis.reasoningMentions.point}`,
  );
  console.log(
    `  residual:        v2=${v2Analysis.reasoningMentions.residual}  v4=${v4Analysis.reasoningMentions.residual}`,
  );
  console.log(
    `  thinking budget: v2=${v2Analysis.reasoningMentions.thinkingBudget}  v4=${v4Analysis.reasoningMentions.thinkingBudget}`,
  );
  console.log(
    `  action bias:     v2=${v2Analysis.reasoningMentions.actionBias}  v4=${v4Analysis.reasoningMentions.actionBias}`,
  );
  console.log(
    `  5-axis ref:      v2=${v2Analysis.reasoningMentions.fiveAxis}  v4=${v4Analysis.reasoningMentions.fiveAxis}`,
  );

  // 판정 (single-run 또는 multi-run aggregate)
  const v2Stats = computeStats('v2', v2Runs);
  const v4Stats = computeStats('v4', v4Runs);
  const verdict =
    N > 1
      ? decideVerdictMulti(v2Stats, v4Stats)
      : decideVerdict(v2Result, v4Result, v2Analysis, v4Analysis);
  console.log('\n' + '='.repeat(80));
  console.log('VERDICT: ' + verdict.label);
  console.log('='.repeat(80));
  for (const line of verdict.rationale) console.log('  - ' + line);

  // 마크다운 리포트 생성 — __dirname 에서 RummiArena 루트를 동적으로 탐색.
  // src/ts 와 .build/scripts 양쪽 실행 위치를 모두 지원하기 위해 docs/ 디렉터리가
  // 발견될 때까지 부모로 거슬러 올라간다.
  let repoRoot = __dirname;
  for (let i = 0; i < 8; i += 1) {
    if (fs.existsSync(path.join(repoRoot, 'docs', '04-testing'))) break;
    repoRoot = path.dirname(repoRoot);
  }
  const reportPath = path.resolve(
    repoRoot,
    'docs',
    '04-testing',
    '57-v4-gpt-empirical-verification.md',
  );
  const report = renderReport(
    v2Result,
    v4Result,
    v2Analysis,
    v4Analysis,
    verdict,
    v2Runs,
    v4Runs,
    v2Stats,
    v4Stats,
  );
  fs.writeFileSync(reportPath, report, 'utf8');
  console.log(`\n[report] ${reportPath}`);
}

function decideVerdictMulti(
  v2: MultiRunStats,
  v4: MultiRunStats,
): Verdict {
  const rationale: string[] = [];
  if (v2.successCount === 0 || v4.successCount === 0) {
    return {
      label: 'INCONCLUSIVE',
      shortLabel: 'API 호출 실패',
      rationale: ['하나 이상의 variant 가 모두 실패'],
    };
  }

  // Welch t-test 의 매우 단순화된 effect-size 비교 (Cohen's d 근사)
  const reasoningPooled =
    Math.sqrt((v2.reasoningTokenStd ** 2 + v4.reasoningTokenStd ** 2) / 2) || 1;
  const reasoningD =
    (v4.reasoningTokenMean - v2.reasoningTokenMean) / reasoningPooled;
  const tilesPooled =
    Math.sqrt((v2.tilesPlacedStd ** 2 + v4.tilesPlacedStd ** 2) / 2) || 1;
  const tilesD = (v4.tilesPlacedMean - v2.tilesPlacedMean) / tilesPooled;

  rationale.push(
    `reasoning_tokens: v2 mean=${v2.reasoningTokenMean.toFixed(0)} std=${v2.reasoningTokenStd.toFixed(0)} | v4 mean=${v4.reasoningTokenMean.toFixed(0)} std=${v4.reasoningTokenStd.toFixed(0)} | Cohen's d=${reasoningD.toFixed(2)}`,
  );
  rationale.push(
    `tiles_placed: v2 mean=${v2.tilesPlacedMean.toFixed(2)} std=${v2.tilesPlacedStd.toFixed(2)} | v4 mean=${v4.tilesPlacedMean.toFixed(2)} std=${v4.tilesPlacedStd.toFixed(2)} | Cohen's d=${tilesD.toFixed(2)}`,
  );
  rationale.push(
    `latency_ms: v2 mean=${v2.latencyMean.toFixed(0)} | v4 mean=${v4.latencyMean.toFixed(0)}`,
  );

  // 변동성 점검: GPT-5-mini 가 동일 prompt 에 대해 stochastic 한가
  const v2RTRange =
    Math.max(...v2.reasoningTokenSamples) -
    Math.min(...v2.reasoningTokenSamples);
  const v4RTRange =
    Math.max(...v4.reasoningTokenSamples) -
    Math.min(...v4.reasoningTokenSamples);
  rationale.push(
    `intra-variant variance: v2 reasoning range=${v2RTRange} | v4 reasoning range=${v4RTRange} (high range = noise dominates signal)`,
  );

  // 판정 규칙
  // |d| >= 0.8 = large, 0.5 = medium, 0.2 = small
  let label: Verdict['label'];
  let shortLabel: string;

  if (Math.abs(reasoningD) < 0.5 && Math.abs(tilesD) < 0.5) {
    label = 'V4_IGNORED';
    shortLabel = 'v4 효과 무의미 — SP5 가설 확인';
    rationale.push(
      'v4 와 v2 의 effect size 가 모두 |d|<0.5 (small 미만). GPT-5-mini 는 v4 지시에 의미 있게 반응하지 않음.',
    );
  } else if (reasoningD >= 0.5 && tilesD >= 0.3) {
    label = 'V4_HONORED';
    shortLabel = 'v4 적용됨 — GPT 가 v4 지시 따름';
    rationale.push(
      'v4 가 reasoning_tokens 와 tiles_placed 양쪽에서 medium+ effect 를 보임.',
    );
  } else if (reasoningD <= -0.5 || tilesD <= -0.3) {
    label = 'V4_IGNORED';
    shortLabel = 'v4 역효과 — v2 가 우세';
    rationale.push(
      'v4 가 v2 보다 더 적은 reasoning 또는 더 적은 tiles 배치. 역효과 가능성.',
    );
  } else {
    label = 'V4_MIXED';
    shortLabel = '혼합 — 신호와 noise 가 비슷한 크기';
    rationale.push(
      '한 metric 만 medium effect, 다른 metric 은 효과 미미. 추가 fixture 필요.',
    );
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

function computeStats(label: string, runs: OpenAiCallResult[]): MultiRunStats {
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

function printMultiRunStats(label: string, runs: OpenAiCallResult[]): void {
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
  result: OpenAiCallResult,
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
  label: 'V4_HONORED' | 'V4_IGNORED' | 'V4_MIXED' | 'INCONCLUSIVE';
  shortLabel: string;
  rationale: string[];
}

function decideVerdict(
  v2: OpenAiCallResult,
  v4: OpenAiCallResult,
  v2a: MoveAnalysis,
  v4a: MoveAnalysis,
): Verdict {
  const rationale: string[] = [];

  if (!v2.ok || !v4.ok) {
    return {
      label: 'INCONCLUSIVE',
      shortLabel: 'API 호출 실패',
      rationale: ['하나 이상의 API 호출이 실패하여 비교 불가'],
    };
  }

  const v2RT = v2.usage?.completion_tokens_details?.reasoning_tokens ?? 0;
  const v4RT = v4.usage?.completion_tokens_details?.reasoning_tokens ?? 0;
  const v2CT = v2.usage?.completion_tokens ?? 0;
  const v4CT = v4.usage?.completion_tokens ?? 0;

  // 신호 1: reasoning tokens 차이
  let reasoningSignal: 'v4_more' | 'similar' | 'v2_more' | 'no_field' =
    'no_field';
  if (v2RT > 0 || v4RT > 0) {
    const ratio = v4RT / Math.max(1, v2RT);
    if (ratio >= 1.3) reasoningSignal = 'v4_more';
    else if (ratio <= 0.7) reasoningSignal = 'v2_more';
    else reasoningSignal = 'similar';
  }

  // 신호 2: tiles placed 차이
  const v2Placed = v2a.tilesFromRackCount ?? 0;
  const v4Placed = v4a.tilesFromRackCount ?? 0;
  const tilesDelta = v4Placed - v2Placed;

  // 신호 3: 응답 길이/추론 키워드
  const v4MentionCount = Object.values(v4a.reasoningMentions).filter(
    Boolean,
  ).length;
  const v2MentionCount = Object.values(v2a.reasoningMentions).filter(
    Boolean,
  ).length;

  rationale.push(
    `reasoning_tokens: v2=${v2RT} v4=${v4RT} (${reasoningSignal})`,
  );
  rationale.push(
    `completion_tokens: v2=${v2CT} v4=${v4CT} (Δ=${v4CT - v2CT})`,
  );
  rationale.push(
    `tiles placed: v2=${v2Placed} v4=${v4Placed} (Δ=${tilesDelta})`,
  );
  rationale.push(
    `v4 keyword mentions in reasoning: v2=${v2MentionCount}/8 v4=${v4MentionCount}/8`,
  );

  let honoredScore = 0;
  let ignoredScore = 0;

  if (reasoningSignal === 'v4_more') honoredScore += 2;
  else if (reasoningSignal === 'similar') ignoredScore += 1;
  else if (reasoningSignal === 'no_field') ignoredScore += 1;

  if (tilesDelta >= 1) honoredScore += 1;
  else if (tilesDelta <= -1) ignoredScore += 1;

  if (v4MentionCount > v2MentionCount) honoredScore += 1;
  else if (v4MentionCount === v2MentionCount) ignoredScore += 1;

  // SP5 가정: GPT 는 reasoning_tokens 필드를 노출하지만 v4 지시로 늘어나지 않음
  if (v4RT > 0 && reasoningSignal === 'similar') {
    rationale.push(
      'GPT-5-mini 가 reasoning_tokens 를 노출하지만 v4 지시로 토큰이 늘어나지 않음 → SP5 가설 일부 확인',
    );
  }

  let label: Verdict['label'];
  let shortLabel: string;
  if (honoredScore >= ignoredScore + 2) {
    label = 'V4_HONORED';
    shortLabel = 'v4 적용됨 — GPT 가 v4 지시 따름';
  } else if (ignoredScore >= honoredScore + 2) {
    label = 'V4_IGNORED';
    shortLabel = 'v4 무시됨 — SP5 가설 확인';
  } else {
    label = 'V4_MIXED';
    shortLabel = '혼합 — 일부 신호만 v4 영향';
  }

  rationale.push(`final score: honored=${honoredScore} ignored=${ignoredScore}`);
  return { label, shortLabel, rationale };
}

function renderReport(
  v2: OpenAiCallResult,
  v4: OpenAiCallResult,
  v2a: MoveAnalysis,
  v4a: MoveAnalysis,
  verdict: Verdict,
  v2Runs: OpenAiCallResult[],
  v4Runs: OpenAiCallResult[],
  v2Stats: MultiRunStats,
  v4Stats: MultiRunStats,
): string {
  const today = new Date().toISOString().slice(0, 10);
  const v2RT = v2.usage?.completion_tokens_details?.reasoning_tokens ?? 0;
  const v4RT = v4.usage?.completion_tokens_details?.reasoning_tokens ?? 0;

  const md: string[] = [];
  md.push(`# 57. v4 vs v2 GPT-5-mini 실측 검증 보고서`);
  md.push('');
  md.push(`- **작성일**: ${today} (Day 4)`);
  md.push(`- **모델**: ${OPENAI_MODEL}`);
  md.push(
    `- **검증 목적**: SP5 (\`docs/03-development/21-prompt-v4-baseline-dry-run-report.md\`) 의 "GPT-5-mini 는 v4 reasoner 지시를 무시한다" 가정을 실 API 호출로 검증`,
  );
  md.push(`- **스크립트**: \`src/ai-adapter/scripts/verify-v4-gpt-empirical.ts\``);
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
  md.push('두 호출에 동일한 게임 상태를 사용했다.');
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

  if (v2Runs.length > 1) {
    md.push('## 2A. Multi-run 통계 (N=' + v2Runs.length + ')');
    md.push('');
    md.push('동일 fixture / 동일 prompt 를 N 회 반복하여 GPT-5-mini 의 stochastic 변동성과 v4 효과를 분리한다.');
    md.push('');
    md.push('| metric | v2 mean | v2 std | v4 mean | v4 std | Δ mean | Cohen d |');
    md.push('|--------|---------|--------|---------|--------|--------|---------|');
    const reasonD =
      (v4Stats.reasoningTokenMean - v2Stats.reasoningTokenMean) /
      (Math.sqrt(
        (v2Stats.reasoningTokenStd ** 2 + v4Stats.reasoningTokenStd ** 2) / 2,
      ) || 1);
    const tilesD =
      (v4Stats.tilesPlacedMean - v2Stats.tilesPlacedMean) /
      (Math.sqrt(
        (v2Stats.tilesPlacedStd ** 2 + v4Stats.tilesPlacedStd ** 2) / 2,
      ) || 1);
    const compD =
      (v4Stats.completionTokenMean - v2Stats.completionTokenMean) /
      (Math.sqrt(
        (v2Stats.completionTokenStd ** 2 + v4Stats.completionTokenStd ** 2) / 2,
      ) || 1);
    md.push(
      `| latency_ms | ${v2Stats.latencyMean.toFixed(0)} | ${v2Stats.latencyStd.toFixed(0)} | ${v4Stats.latencyMean.toFixed(0)} | ${v4Stats.latencyStd.toFixed(0)} | ${(v4Stats.latencyMean - v2Stats.latencyMean).toFixed(0)} | — |`,
    );
    md.push(
      `| completion_tokens | ${v2Stats.completionTokenMean.toFixed(0)} | ${v2Stats.completionTokenStd.toFixed(0)} | ${v4Stats.completionTokenMean.toFixed(0)} | ${v4Stats.completionTokenStd.toFixed(0)} | ${(v4Stats.completionTokenMean - v2Stats.completionTokenMean).toFixed(0)} | ${compD.toFixed(2)} |`,
    );
    md.push(
      `| **reasoning_tokens** | ${v2Stats.reasoningTokenMean.toFixed(0)} | ${v2Stats.reasoningTokenStd.toFixed(0)} | ${v4Stats.reasoningTokenMean.toFixed(0)} | ${v4Stats.reasoningTokenStd.toFixed(0)} | ${(v4Stats.reasoningTokenMean - v2Stats.reasoningTokenMean).toFixed(0)} | **${reasonD.toFixed(2)}** |`,
    );
    md.push(
      `| **tiles_placed** | ${v2Stats.tilesPlacedMean.toFixed(2)} | ${v2Stats.tilesPlacedStd.toFixed(2)} | ${v4Stats.tilesPlacedMean.toFixed(2)} | ${v4Stats.tilesPlacedStd.toFixed(2)} | ${(v4Stats.tilesPlacedMean - v2Stats.tilesPlacedMean).toFixed(2)} | **${tilesD.toFixed(2)}** |`,
    );
    md.push('');
    md.push('### Per-run samples');
    md.push('');
    md.push('| run | v2 reasoning_tok | v2 tiles | v2 latency | v4 reasoning_tok | v4 tiles | v4 latency |');
    md.push('|-----|------------------|----------|------------|------------------|----------|------------|');
    for (let i = 0; i < v2Runs.length; i += 1) {
      const r2 = v2Runs[i];
      const r4 = v4Runs[i];
      const a2 = analyzeMove(r2.parsed);
      const a4 = analyzeMove(r4.parsed);
      md.push(
        `| ${i + 1} | ${r2.usage?.completion_tokens_details?.reasoning_tokens ?? 'n/a'} | ${a2.tilesFromRackCount ?? 'n/a'} | ${r2.latencyMs}ms | ${r4.usage?.completion_tokens_details?.reasoning_tokens ?? 'n/a'} | ${a4.tilesFromRackCount ?? 'n/a'} | ${r4.latencyMs}ms |`,
      );
    }
    md.push('');
    md.push('**Cohen d 해석**: |d|<0.2 = trivial, 0.2~0.5 = small, 0.5~0.8 = medium, >0.8 = large.');
    md.push('');
  }
  md.push('## 2. 마지막 호출 결과 (대표)');
  md.push('');
  md.push('| 항목 | v2 | v4 | Δ |');
  md.push('|------|----|----|---|');
  md.push(
    `| 성공 여부 | ${v2.ok ? 'OK' : 'FAIL'} | ${v4.ok ? 'OK' : 'FAIL'} | — |`,
  );
  md.push(
    `| HTTP status | ${v2.status ?? 'n/a'} | ${v4.status ?? 'n/a'} | — |`,
  );
  md.push(
    `| Latency (ms) | ${v2.latencyMs} | ${v4.latencyMs} | ${v4.latencyMs - v2.latencyMs} |`,
  );
  md.push(
    `| prompt_tokens | ${v2.usage?.prompt_tokens ?? 'n/a'} | ${v4.usage?.prompt_tokens ?? 'n/a'} | ${
      v2.usage && v4.usage
        ? v4.usage.prompt_tokens - v2.usage.prompt_tokens
        : 'n/a'
    } |`,
  );
  md.push(
    `| completion_tokens | ${v2.usage?.completion_tokens ?? 'n/a'} | ${v4.usage?.completion_tokens ?? 'n/a'} | ${
      v2.usage && v4.usage
        ? v4.usage.completion_tokens - v2.usage.completion_tokens
        : 'n/a'
    } |`,
  );
  md.push(
    `| **reasoning_tokens** | ${v2RT} | ${v4RT} | ${v4RT - v2RT} |`,
  );
  md.push(
    `| total_tokens | ${v2.usage?.total_tokens ?? 'n/a'} | ${v4.usage?.total_tokens ?? 'n/a'} | — |`,
  );
  md.push(
    `| cached_prompt_tokens | ${v2.usage?.prompt_tokens_details?.cached_tokens ?? 0} | ${v4.usage?.prompt_tokens_details?.cached_tokens ?? 0} | — |`,
  );
  md.push('');

  md.push('## 3. Move 분석');
  md.push('');
  md.push('| 항목 | v2 | v4 |');
  md.push('|------|----|----|');
  md.push(
    `| action | ${v2a.action ?? 'n/a'} | ${v4a.action ?? 'n/a'} |`,
  );
  md.push(
    `| tableGroups (count) | ${v2a.tableGroupCount ?? 'n/a'} | ${v4a.tableGroupCount ?? 'n/a'} |`,
  );
  md.push(
    `| tilesFromRack (count) | ${v2a.tilesFromRackCount ?? 'n/a'} | ${v4a.tilesFromRackCount ?? 'n/a'} |`,
  );
  md.push(
    `| tilesPlacedTotal | ${v2a.tilesPlacedTotal ?? 'n/a'} | ${v4a.tilesPlacedTotal ?? 'n/a'} |`,
  );
  md.push(
    `| rack 보존성 (rack 외 타일 미사용) | ${v2a.rackTilesPreserved ?? 'n/a'} | ${v4a.rackTilesPreserved ?? 'n/a'} |`,
  );
  md.push(
    `| reasoning 길이 (chars) | ${v2a.reasoningLength ?? 'n/a'} | ${v4a.reasoningLength ?? 'n/a'} |`,
  );
  md.push('');

  md.push('### 3.1 v4 키워드가 reasoning 본문에 등장했는가');
  md.push('');
  md.push('| 키워드 | v2 | v4 |');
  md.push('|--------|----|----|');
  for (const k of Object.keys(v2a.reasoningMentions) as Array<
    keyof typeof v2a.reasoningMentions
  >) {
    md.push(
      `| ${k} | ${v2a.reasoningMentions[k] ? 'yes' : 'no'} | ${v4a.reasoningMentions[k] ? 'yes' : 'no'} |`,
    );
  }
  md.push('');

  md.push('## 4. Raw 응답');
  md.push('');
  md.push('### 4.1 v2 응답');
  md.push('');
  md.push('```json');
  md.push(v2.rawContent ?? '(empty)');
  md.push('```');
  md.push('');
  md.push('### 4.2 v4 응답');
  md.push('');
  md.push('```json');
  md.push(v4.rawContent ?? '(empty)');
  md.push('```');
  md.push('');

  md.push('## 5. 해석 및 권고');
  md.push('');
  if (verdict.label === 'V4_HONORED') {
    md.push(
      '### 권고: OpenAI variant 를 v4 로 전환 검토',
    );
    md.push('');
    md.push(
      '- GPT-5-mini 가 v4 의 Thinking Time Budget / 5축 평가 / Action Bias 지시를 실제로 추종하는 신호가 관측되었다.',
    );
    md.push(
      '- SP5 의 "GPT 제외" 결정은 보수적이었음. 단일 fixture 결과이므로 Round 6 에서 1게임 v4 대조 게임을 추가 권장.',
    );
    md.push(
      '- v4.1 GPT variant 를 별도 분기하지 않고 공통 v4 로 흡수해도 무방한지 추가 검증 필요.',
    );
  } else if (verdict.label === 'V4_IGNORED') {
    md.push('### 권고: SP5 결정 유지 (GPT 는 v3 또는 v2 사용)');
    md.push('');
    md.push(
      '- GPT-5-mini 는 reasoning_tokens 필드를 노출하지만 v4 지시(Thinking Time Budget, 5축 평가)에 의해 토큰 사용량이 유의미하게 변화하지 않았다.',
    );
    md.push(
      '- v4 의 추가 지시는 GPT 에게 효과가 작거나 무시됨. SP5 의 "GPT 제외" 결정은 실측으로 정당화된다.',
    );
    md.push(
      '- 향후 v4.1 GPT variant 는 reasoning 토큰 유도 대신 response_format json_schema 강화 + token efficiency hint 방향으로 분기 권장.',
    );
  } else if (verdict.label === 'V4_MIXED') {
    md.push('### 권고: 추가 fixture 로 N=5+ 반복 검증');
    md.push('');
    md.push(
      '- 단일 fixture 에서 v4 영향 신호가 일부만 관측됨. 표본을 늘려야 결론 가능.',
    );
    md.push(
      '- Round 6 시점에 GPT v4 1게임 대조군을 추가하는 안 권장 (저비용, $0.025/턴).',
    );
  } else {
    md.push('### 권고: API 호출 실패 → 재실행 필요');
    md.push('');
    md.push('- 호출 자체가 실패하여 가설 검증 불가. 키/네트워크 확인 후 재시도.');
  }
  md.push('');
  md.push('## 6. 재현 방법');
  md.push('');
  md.push('```bash');
  md.push(
    'export OPENAI_API_KEY=$(kubectl -n rummikub get secret ai-adapter-secret -o jsonpath=\'{.data.OPENAI_API_KEY}\' | base64 -d)',
  );
  md.push('export LANGSMITH_API_KEY=...   # 사용자 제공');
  md.push('export LANGCHAIN_TRACING_V2=true');
  md.push('export LANGCHAIN_PROJECT=rummiarena-v4-verification');
  md.push('cd src/ai-adapter');
  md.push(
    './node_modules/.bin/ts-node --transpile-only scripts/verify-v4-gpt-empirical.ts',
  );
  md.push('```');
  md.push('');
  md.push('## 7. 한계');
  md.push('');
  md.push(
    '- N=1 fixture 단일 호출. 통계적 유의성 없음. 본 보고서는 "신호 탐지" 목적.',
  );
  md.push(
    '- GPT-5-mini 의 reasoning 은 비공개 chain-of-thought 이므로 본문 분석은 최종 reasoning 필드만 가능.',
  );
  md.push(
    '- 동일 fixture 라도 stochastic sampling 의 영향 가능 (temperature 미지정 = 1.0 reasoning 모델 기본값).',
  );
  md.push('');
  md.push('---');
  md.push('');
  md.push(
    '*본 보고서는 `verify-v4-gpt-empirical.ts` 자동 생성. 수동 편집 금지 (재실행 시 덮어씀).*',
  );

  return md.join('\n') + '\n';
}

main().catch((err) => {
  console.error('FATAL:', err);
  process.exit(1);
});
