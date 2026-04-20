#!/usr/bin/env ts-node
/**
 * SP4 Prompt A/B Eval Harness (TypeScript)
 *
 * 목적:
 *   - PromptRegistry의 variant 오브젝트를 직접 import하여 (NestJS DI 없음)
 *     seed × prompt × model 매트릭스로 system/user/retry 프롬프트 문자열을 생성
 *   - 변형 간 diff 분석, "결정 분기점" 카운트, 토큰 예산 비교
 *   - 실제 LLM 호출 없음 (dry-run)
 *
 * Invocation:
 *   pnpm --filter ai-adapter exec ts-node src/prompt/registry/cli/ab-eval.ts \
 *     --seeds 0x1,0x14,0xB --variants v3,v3-tuned --models deepseek-reasoner
 *
 * 또는 repo-level wrapper:
 *   node scripts/prompt-ab-eval.mjs --seeds 0x1,0x14 --variants v3,v4 --models deepseek-reasoner
 *
 * 설계 문서:
 *   - docs/02-design/39-prompt-registry-architecture.md §7.2 (SP4)
 *   - docs/04-testing/53-playtest-s4-deterministic-framework.md (B3 seeds 재활용)
 */

import { v2Variant } from '../variants/v2.variant';
import { v3Variant } from '../variants/v3.variant';
import { v3TunedVariant } from '../variants/v3-tuned.variant';
import { v4Variant } from '../variants/v4.variant';
import {
  ModelType,
  PromptGameState,
  PromptVariant,
} from '../prompt-registry.types';

type VariantId = 'v2' | 'v3' | 'v3-tuned' | 'v4';

const VARIANTS: Record<VariantId, PromptVariant> = {
  v2: v2Variant,
  v3: v3Variant,
  'v3-tuned': v3TunedVariant,
  v4: v4Variant,
};

const VALID_MODELS: ModelType[] = [
  'openai',
  'claude',
  'deepseek',
  'deepseek-reasoner',
  'dashscope',
  'ollama',
];

// ----------------------------------------------------------------------
// Fake GameState derivation from seed
// ----------------------------------------------------------------------
// SP4는 LLM을 부르지 않으므로 "진짜" 게임 상태는 불필요.
// seed를 이용해 결정론적 fake GameState를 합성한다 (프롬프트 문자열 생성 목적).
// 실제 B3 seed에서 파생된 seat 0 hand는 scripts/playtest-s4/scenarios/*.yaml에
// 주석으로 포함되어 있으며, 여기서는 간단한 결정론 해시 기반으로 대체한다.
// ----------------------------------------------------------------------

function mulberry32(seed: number): () => number {
  let a = seed;
  return function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function seedToGameState(seedHex: string, turnNumber = 1): PromptGameState {
  const seed = parseInt(seedHex.replace(/^0x/i, ''), 16) >>> 0;
  const rnd = mulberry32(seed);
  const colors = ['R', 'B', 'Y', 'K'];
  const sets = ['a', 'b'];
  const deck: string[] = [];
  for (const s of sets) {
    for (const c of colors) {
      for (let n = 1; n <= 13; n++) deck.push(`${c}${n}${s}`);
    }
  }
  deck.push('JK1', 'JK2');
  // 결정론 셔플 (Fisher-Yates)
  for (let i = deck.length - 1; i > 0; i--) {
    const j = Math.floor(rnd() * (i + 1));
    [deck[i], deck[j]] = [deck[j], deck[i]];
  }
  const myTiles = deck.slice(0, 14);
  const opponent = deck.slice(14, 28);

  // turnNumber가 5 이상이면 테이블에 가짜 그룹 하나 추가
  const tableGroups =
    turnNumber >= 5 ? [{ id: 'g1', tiles: ['R7a', 'B7a', 'K7a'] }] : [];

  return {
    tableGroups,
    myTiles,
    turnNumber,
    drawPileCount: 78 - (turnNumber - 1) * 2,
    initialMeldDone: turnNumber >= 5,
    opponents: [
      { playerId: 'seat_1', remainingTiles: 14 - Math.floor(turnNumber / 3) },
    ],
  };
}

// ----------------------------------------------------------------------
// Diff + decision-divergence analysis
// ----------------------------------------------------------------------

interface TextStats {
  charCount: number;
  lineCount: number;
  tokenEstimate: number; // 매우 대략적 (char/4)
}

function textStats(s: string): TextStats {
  return {
    charCount: s.length,
    lineCount: s.split('\n').length,
    tokenEstimate: Math.ceil(s.length / 4),
  };
}

interface LineDiff {
  addedLines: string[];
  removedLines: string[];
  commonLines: number;
}

function lineDiff(a: string, b: string): LineDiff {
  const aLines = a.split('\n');
  const bLines = b.split('\n');
  const aSet = new Set(aLines);
  const bSet = new Set(bLines);
  const added = bLines.filter((l) => !aSet.has(l) && l.trim().length > 0);
  const removed = aLines.filter((l) => !bSet.has(l) && l.trim().length > 0);
  const common = aLines.filter((l) => bSet.has(l)).length;
  return { addedLines: added, removedLines: removed, commonLines: common };
}

// "결정 분기점" 키워드 — 프롬프트 차이가 move 결정에 영향 줄 수 있는 지시어.
// 이 키워드가 포함된 added/removed 라인 카운트 = "decision impact score"
const DECISION_KEYWORDS = [
  'verify',
  'before submitting',
  'rejected',
  'forbidden',
  'must',
  'critical',
  'warning',
  'count check',
  'tilesfromrack',
  'tablegroups',
  'initial meld',
  'draw',
  'place',
  'retry',
  'invalid',
  'validation',
  'checklist',
  'thinking',
  'budget',
  'evaluation',
  'legality',
  'residual',
  'point',
];

function decisionImpactScore(diff: LineDiff): {
  addedDecisionLines: number;
  removedDecisionLines: number;
  samples: { added: string[]; removed: string[] };
} {
  const matches = (line: string) => {
    const low = line.toLowerCase();
    return DECISION_KEYWORDS.some((k) => low.includes(k));
  };
  const addedDecision = diff.addedLines.filter(matches);
  const removedDecision = diff.removedLines.filter(matches);
  return {
    addedDecisionLines: addedDecision.length,
    removedDecisionLines: removedDecision.length,
    samples: {
      added: addedDecision.slice(0, 5),
      removed: removedDecision.slice(0, 5),
    },
  };
}

// ----------------------------------------------------------------------
// Per-cell evaluation
// ----------------------------------------------------------------------

interface CellEval {
  seed: string;
  model: ModelType;
  variant: VariantId;
  system: TextStats;
  user: TextStats;
  retry: TextStats;
  totalTokens: number;
  recommended: boolean; // variant.metadata.recommendedModels 포함 여부
  temperature: number;
  tokenBudget: number;
  warnIfOff: boolean;
  thinkingMode?: string;
}

function evalCell(
  seed: string,
  model: ModelType,
  variantId: VariantId,
): CellEval {
  const variant = VARIANTS[variantId];
  const gameState = seedToGameState(seed, 3);
  const system = variant.systemPromptBuilder();
  const user = variant.userPromptBuilder(gameState);
  const retry = variant.retryPromptBuilder(
    gameState,
    'ERR_GROUP_COLOR_DUP: group [R7a, R7b, B7a] has duplicate color R',
    1,
  );
  const s = textStats(system);
  const u = textStats(user);
  const r = textStats(retry);
  return {
    seed,
    model,
    variant: variantId,
    system: s,
    user: u,
    retry: r,
    totalTokens: s.tokenEstimate + u.tokenEstimate + r.tokenEstimate,
    recommended: variant.metadata.recommendedModels.includes(model),
    temperature: variant.metadata.recommendedTemperature,
    tokenBudget: variant.metadata.tokenBudget,
    warnIfOff: variant.metadata.warnIfOffRecommendation ?? false,
    thinkingMode: variant.metadata.thinkingMode,
  };
}

// ----------------------------------------------------------------------
// Pairwise comparison (A vs B)
// ----------------------------------------------------------------------

interface PairComparison {
  seed: string;
  model: ModelType;
  variantA: VariantId;
  variantB: VariantId;
  systemDiff: LineDiff;
  userDiff: LineDiff;
  retryDiff: LineDiff;
  systemImpact: ReturnType<typeof decisionImpactScore>;
  userImpact: ReturnType<typeof decisionImpactScore>;
  retryImpact: ReturnType<typeof decisionImpactScore>;
  tokenDelta: number;
  identical: boolean;
}

function comparePair(
  seed: string,
  model: ModelType,
  a: VariantId,
  b: VariantId,
): PairComparison {
  const gs = seedToGameState(seed, 3);
  const va = VARIANTS[a];
  const vb = VARIANTS[b];
  const sysA = va.systemPromptBuilder();
  const sysB = vb.systemPromptBuilder();
  const userA = va.userPromptBuilder(gs);
  const userB = vb.userPromptBuilder(gs);
  const retryA = va.retryPromptBuilder(gs, 'ERR_TABLE_TILE_MISSING', 1);
  const retryB = vb.retryPromptBuilder(gs, 'ERR_TABLE_TILE_MISSING', 1);

  const sysDiff = lineDiff(sysA, sysB);
  const userDiff = lineDiff(userA, userB);
  const retryDiff = lineDiff(retryA, retryB);

  const identical = sysA === sysB && userA === userB && retryA === retryB;

  return {
    seed,
    model,
    variantA: a,
    variantB: b,
    systemDiff: sysDiff,
    userDiff: userDiff,
    retryDiff: retryDiff,
    systemImpact: decisionImpactScore(sysDiff),
    userImpact: decisionImpactScore(userDiff),
    retryImpact: decisionImpactScore(retryDiff),
    tokenDelta:
      Math.ceil((sysB.length + userB.length + retryB.length) / 4) -
      Math.ceil((sysA.length + userA.length + retryA.length) / 4),
    identical,
  };
}

// ----------------------------------------------------------------------
// Summary aggregation
// ----------------------------------------------------------------------

interface SummaryRow {
  variantA: VariantId;
  variantB: VariantId;
  model: ModelType;
  seedCount: number;
  identical: boolean;
  totalSystemAdded: number;
  totalSystemRemoved: number;
  totalUserAdded: number;
  totalUserRemoved: number;
  totalSystemDecisionAdded: number;
  totalSystemDecisionRemoved: number;
  avgTokenDelta: number;
  note?: string;
}

function summarizePairs(pairs: PairComparison[]): SummaryRow[] {
  const buckets = new Map<string, PairComparison[]>();
  for (const p of pairs) {
    const key = `${p.variantA}|${p.variantB}|${p.model}`;
    if (!buckets.has(key)) buckets.set(key, []);
    buckets.get(key)!.push(p);
  }
  const rows: SummaryRow[] = [];
  for (const [key, list] of buckets) {
    const [va, vb, model] = key.split('|') as [VariantId, VariantId, ModelType];
    const identical = list.every((p) => p.identical);
    const sumSystemAdded = list.reduce(
      (s, p) => s + p.systemDiff.addedLines.length,
      0,
    );
    const sumSystemRemoved = list.reduce(
      (s, p) => s + p.systemDiff.removedLines.length,
      0,
    );
    const sumUserAdded = list.reduce(
      (s, p) => s + p.userDiff.addedLines.length,
      0,
    );
    const sumUserRemoved = list.reduce(
      (s, p) => s + p.userDiff.removedLines.length,
      0,
    );
    const sumSysDecAdded = list.reduce(
      (s, p) => s + p.systemImpact.addedDecisionLines,
      0,
    );
    const sumSysDecRemoved = list.reduce(
      (s, p) => s + p.systemImpact.removedDecisionLines,
      0,
    );
    const avgDelta = list.reduce((s, p) => s + p.tokenDelta, 0) / list.length;

    const row: SummaryRow = {
      variantA: va,
      variantB: vb,
      model,
      seedCount: list.length,
      identical,
      totalSystemAdded: sumSystemAdded,
      totalSystemRemoved: sumSystemRemoved,
      totalUserAdded: sumUserAdded,
      totalUserRemoved: sumUserRemoved,
      totalSystemDecisionAdded: sumSysDecAdded,
      totalSystemDecisionRemoved: sumSysDecRemoved,
      avgTokenDelta: Math.round(avgDelta),
    };
    if (identical) {
      row.note = `IDENTICAL — ${va} and ${vb} produce byte-exact prompts on ${model}`;
      if (vb === 'v4' || va === 'v4') {
        row.note += ' (expected: v4 is placeholder → v3 body pending SP5)';
      }
    }
    rows.push(row);
  }
  return rows;
}

// ----------------------------------------------------------------------
// CLI
// ----------------------------------------------------------------------

interface CliArgs {
  seeds: string[];
  variants: VariantId[];
  models: ModelType[];
  out?: string;
  format: 'json' | 'markdown' | 'both';
  help: boolean;
}

function parseArgs(argv: string[]): CliArgs {
  const args: CliArgs = {
    seeds: [],
    variants: [],
    models: [],
    format: 'both',
    help: false,
  };
  for (let i = 2; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--seeds') args.seeds = argv[++i].split(',');
    else if (a === '--variants')
      args.variants = argv[++i].split(',') as VariantId[];
    else if (a === '--models')
      args.models = argv[++i].split(',') as ModelType[];
    else if (a === '--out') args.out = argv[++i];
    else if (a === '--format')
      args.format = argv[++i] as 'json' | 'markdown' | 'both';
    else if (a === '--help' || a === '-h') args.help = true;
  }
  return args;
}

function printHelp(): void {
  process.stderr.write(`
SP4 Prompt A/B Eval Harness

Usage:
  ts-node src/prompt/registry/cli/ab-eval.ts [options]

Options:
  --seeds <csv>      시드 목록 (hex). 예: 0x1,0x14,0xB,0xF,0xCAFEBABE
  --variants <csv>   비교할 변형 (v2, v3, v3-tuned, v4). 예: v3,v4
  --models <csv>     모델 타입. 예: openai,claude,deepseek-reasoner,dashscope
  --out <path>       결과 저장 디렉터리 (기본: scripts/ab-eval-results/)
  --format <f>       json | markdown | both (기본 both)
  --help             도움말

기본값:
  --seeds 0x1,0x14,0xB,0xF,0x16,0x1C,0x2,0x3,0xCAFEBABE,0xDEADBEEF
  --variants v2,v3,v3-tuned,v4
  --models openai,claude,deepseek-reasoner,dashscope
`);
}

// ----------------------------------------------------------------------
// Markdown report generation
// ----------------------------------------------------------------------

function renderMarkdown(
  args: CliArgs,
  cells: CellEval[],
  pairs: PairComparison[],
  summary: SummaryRow[],
): string {
  const lines: string[] = [];
  lines.push('# SP4 Prompt A/B Eval — Sample Report');
  lines.push('');
  lines.push(`- **생성일**: ${new Date().toISOString()}`);
  lines.push(`- **모드**: Dry-run (실제 LLM 호출 없음)`);
  lines.push(`- **Seeds (${args.seeds.length})**: ${args.seeds.join(', ')}`);
  lines.push(
    `- **Variants (${args.variants.length})**: ${args.variants.join(', ')}`,
  );
  lines.push(`- **Models (${args.models.length})**: ${args.models.join(', ')}`);
  lines.push(
    `- **Matrix size**: ${args.seeds.length} × ${args.variants.length} × ${args.models.length} = ${cells.length} cells`,
  );
  lines.push('');

  lines.push('## 1. Variant Metadata');
  lines.push('');
  lines.push(
    '| Variant | Version | Token Budget | Recommended Models | Thinking | WarnIfOff |',
  );
  lines.push(
    '|---------|---------|-------------:|---------------------|----------|-----------|',
  );
  for (const vid of args.variants) {
    const v = VARIANTS[vid];
    lines.push(
      `| ${vid} | ${v.version} | ${v.metadata.tokenBudget} | ${v.metadata.recommendedModels.join(', ')} | ${v.metadata.thinkingMode ?? '-'} | ${v.metadata.warnIfOffRecommendation ? 'yes' : 'no'} |`,
    );
  }
  lines.push('');

  lines.push('## 2. Cell Totals (seed × variant × model)');
  lines.push('');
  lines.push(
    '| Seed | Variant | Model | System ~tok | User ~tok | Retry ~tok | Total ~tok | Recommended |',
  );
  lines.push(
    '|------|---------|-------|------------:|----------:|-----------:|-----------:|:-----------:|',
  );
  for (const c of cells) {
    lines.push(
      `| ${c.seed} | ${c.variant} | ${c.model} | ${c.system.tokenEstimate} | ${c.user.tokenEstimate} | ${c.retry.tokenEstimate} | ${c.totalTokens} | ${c.recommended ? 'yes' : 'OFF'} |`,
    );
  }
  lines.push('');

  lines.push('## 3. Pairwise Summary (A → B per model)');
  lines.push('');
  lines.push(
    '| A | B | Model | Seeds | Identical | Sys +/- | Sys Decision +/- | User +/- | Avg Δtok | Note |',
  );
  lines.push(
    '|---|---|-------|------:|:---------:|:-------:|:---------------:|:--------:|--------:|------|',
  );
  for (const r of summary) {
    lines.push(
      `| ${r.variantA} | ${r.variantB} | ${r.model} | ${r.seedCount} | ${r.identical ? 'yes' : 'no'} | +${r.totalSystemAdded}/-${r.totalSystemRemoved} | +${r.totalSystemDecisionAdded}/-${r.totalSystemDecisionRemoved} | +${r.totalUserAdded}/-${r.totalUserRemoved} | ${r.avgTokenDelta >= 0 ? '+' : ''}${r.avgTokenDelta} | ${r.note ?? ''} |`,
    );
  }
  lines.push('');

  lines.push('## 4. Decision Impact Samples (System Prompt)');
  lines.push('');
  lines.push(
    'System prompt 차이에서 "결정 영향 키워드"를 포함한 라인을 샘플로 보여준다.',
  );
  lines.push('');
  const shownPairs = new Set<string>();
  for (const p of pairs) {
    const key = `${p.variantA}|${p.variantB}|${p.model}`;
    if (shownPairs.has(key)) continue;
    shownPairs.add(key);
    if (p.identical) {
      lines.push(`### ${p.variantA} → ${p.variantB} (${p.model}) — IDENTICAL`);
      lines.push('');
      continue;
    }
    lines.push(`### ${p.variantA} → ${p.variantB} (${p.model})`);
    lines.push('');
    if (p.systemImpact.samples.added.length > 0) {
      lines.push(
        `**Added decision lines (${p.systemImpact.addedDecisionLines})**:`,
      );
      for (const ln of p.systemImpact.samples.added) {
        lines.push(`- \`${ln.slice(0, 180)}\``);
      }
      lines.push('');
    }
    if (p.systemImpact.samples.removed.length > 0) {
      lines.push(
        `**Removed decision lines (${p.systemImpact.removedDecisionLines})**:`,
      );
      for (const ln of p.systemImpact.samples.removed) {
        lines.push(`- \`${ln.slice(0, 180)}\``);
      }
      lines.push('');
    }
  }

  lines.push('## 5. Conclusions');
  lines.push('');
  const identicalCount = summary.filter((r) => r.identical).length;
  const realDiffCount = summary.length - identicalCount;
  lines.push(
    `- 비교 쌍 총 ${summary.length}개 중 ${identicalCount}개는 IDENTICAL (즉 동일 프롬프트), ${realDiffCount}개는 실제 차이가 있음.`,
  );
  if (args.variants.includes('v4')) {
    lines.push(
      `- **v4는 현재 placeholder** (v3 본문 재사용). SP5 머지 시 재실행 필요.`,
    );
  }
  const largestDelta = summary.reduce(
    (max, r) =>
      Math.abs(r.avgTokenDelta) > Math.abs(max) ? r.avgTokenDelta : max,
    0,
  );
  lines.push(`- 토큰 델타 최대: ${largestDelta} tokens/cell (대략치)`);
  const maxImpact = summary.reduce(
    (max, r) =>
      Math.max(max, r.totalSystemDecisionAdded + r.totalSystemDecisionRemoved),
    0,
  );
  lines.push(
    `- 결정 영향 라인 총합 최대: ${maxImpact}건 (어느 쌍이 가장 많은 지시어 변경을 포함했는지 판단)`,
  );
  lines.push('');
  lines.push('## 6. SP5 입력 제안');
  lines.push('');
  lines.push(
    '- SP5는 v4 placeholder의 실제 본문을 SP1 §6.1~6.5 기반으로 교체한 뒤 본 harness를 다시 실행해야 함.',
  );
  lines.push(
    '- 재실행 명령: `node scripts/prompt-ab-eval.mjs --variants v3,v4 --models deepseek-reasoner,dashscope,openai,claude`',
  );
  lines.push(
    '- 기대: v4가 더 이상 IDENTICAL이 아니어야 하며 decision impact > 0이어야 함.',
  );
  lines.push('');

  return lines.join('\n');
}

// ----------------------------------------------------------------------
// main
// ----------------------------------------------------------------------

function main(): void {
  const args = parseArgs(process.argv);
  if (args.help) {
    printHelp();
    return;
  }

  // Defaults
  if (args.seeds.length === 0) {
    args.seeds = [
      '0x1',
      '0x14',
      '0xB',
      '0xF',
      '0x16',
      '0x1C',
      '0x2',
      '0x3',
      '0xCAFEBABE',
      '0xDEADBEEF',
    ];
  }
  if (args.variants.length === 0) {
    args.variants = ['v2', 'v3', 'v3-tuned', 'v4'];
  }
  if (args.models.length === 0) {
    args.models = ['openai', 'claude', 'deepseek-reasoner', 'dashscope'];
  }

  // Validate
  for (const v of args.variants) {
    if (!VARIANTS[v]) {
      process.stderr.write(
        `[error] unknown variant '${v}' (valid: ${Object.keys(VARIANTS).join(',')})\n`,
      );
      process.exit(1);
    }
  }
  for (const m of args.models) {
    if (!VALID_MODELS.includes(m)) {
      process.stderr.write(
        `[error] unknown model '${m}' (valid: ${VALID_MODELS.join(',')})\n`,
      );
      process.exit(1);
    }
  }

  // Evaluate all cells
  const cells: CellEval[] = [];
  for (const seed of args.seeds) {
    for (const model of args.models) {
      for (const vid of args.variants) {
        cells.push(evalCell(seed, model, vid));
      }
    }
  }

  // Pairwise comparison: A → B for each pair of variants (lower index → higher)
  const pairs: PairComparison[] = [];
  for (let i = 0; i < args.variants.length; i++) {
    for (let j = i + 1; j < args.variants.length; j++) {
      const a = args.variants[i];
      const b = args.variants[j];
      for (const seed of args.seeds) {
        for (const model of args.models) {
          pairs.push(comparePair(seed, model, a, b));
        }
      }
    }
  }

  const summary = summarizePairs(pairs);

  const payload = {
    generatedAt: new Date().toISOString(),
    args,
    cells,
    pairs,
    summary,
  };

  const outDir = args.out ?? 'scripts/ab-eval-results';
  const path = require('path') as typeof import('path');
  const fs = require('fs') as typeof import('fs');
  fs.mkdirSync(outDir, { recursive: true });

  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const basename = `ab-eval-${timestamp}`;

  if (args.format === 'json' || args.format === 'both') {
    const jsonPath = path.join(outDir, `${basename}.json`);
    fs.writeFileSync(jsonPath, JSON.stringify(payload, null, 2));
    process.stderr.write(`[write] ${jsonPath}\n`);
  }
  if (args.format === 'markdown' || args.format === 'both') {
    const mdPath = path.join(outDir, `${basename}.md`);
    fs.writeFileSync(mdPath, renderMarkdown(args, cells, pairs, summary));
    process.stderr.write(`[write] ${mdPath}\n`);
  }

  // stdout에 짧은 요약
  process.stdout.write(
    `\n=== SP4 A/B Summary ===\n` +
      `matrix: ${args.seeds.length} seeds × ${args.variants.length} variants × ${args.models.length} models = ${cells.length} cells\n` +
      `pairs: ${summary.length} variant-model combinations\n` +
      `identical pairs: ${summary.filter((r) => r.identical).length}/${summary.length}\n\n`,
  );
  for (const r of summary) {
    const mark = r.identical ? 'IDENTICAL' : 'DIFFER';
    process.stdout.write(
      `  ${r.variantA}→${r.variantB} (${r.model}) ${mark} sys=+${r.totalSystemAdded}/-${r.totalSystemRemoved} dec=+${r.totalSystemDecisionAdded}/-${r.totalSystemDecisionRemoved} Δtok=${r.avgTokenDelta}${r.note ? ' — ' + r.note : ''}\n`,
    );
  }
}

main();
