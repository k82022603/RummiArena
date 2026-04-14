#!/usr/bin/env node
/**
 * Playtest S4 결정론적 시드 프레임워크 — Runner
 *
 * 목적:
 *   - scripts/playtest-s4/scenarios/*.yaml 을 로드하고 결정론적으로 실행
 *   - 같은 시드 → 같은 결과 보장
 *   - CI 고정 회귀 세트 + admin UI가 이 runner를 호출
 *
 * 사용:
 *   node scripts/playtest-s4-seeded.mjs --list
 *   node scripts/playtest-s4-seeded.mjs --scenario joker-exchange-v07 --seed 0x14
 *   node scripts/playtest-s4-seeded.mjs --all        # 모든 시나리오의 첫 시드 실행
 *   node scripts/playtest-s4-seeded.mjs --scenario joker-exchange-v07 --ai-mode baseline
 *
 * AI 모드:
 *   - baseline (default) — 순수 엔진 결정론 검증 (WS 호출 없음). 빠르고 완전 결정론.
 *   - fixture            — 사전 녹화된 AI 응답 재생 (scripts/playtest-s4/fixtures/)
 *                           Sprint 6 후반 구현 예정. 현재는 baseline으로 fallback.
 *   - live               — 실제 game-server + LLM 호출. 시드 고정 초기 랙만 보장.
 *                           Sprint 7 구현 예정. 현재 미지원.
 *
 * 의존성: 없음 (Go 바이너리 's4-engine-check'와 YAML 파일만)
 *
 * 참고:
 *   - docs/04-testing/53-playtest-s4-deterministic-framework.md
 *   - docs/02-design/37-playtest-s4-deterministic-ux.md
 *   - docs/04-testing/52-19-rules-full-audit-report.md
 */

import { readFileSync, readdirSync, existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, join, resolve } from 'node:path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const REPO_ROOT = resolve(__dirname, '..');
const SCENARIOS_DIR = join(REPO_ROOT, 'scripts', 'playtest-s4', 'scenarios');
const FIXTURES_DIR = join(REPO_ROOT, 'scripts', 'playtest-s4', 'fixtures');
const GAME_SERVER_DIR = join(REPO_ROOT, 'src', 'game-server');
const HARNESS_BIN = process.env.S4_HARNESS_BIN || '/tmp/s4-engine-check';

// ----------------------------------------------------------------------
// 최소 YAML 파서 — 시나리오 파일 구조 한정 (중첩 list + scalar + map)
// 외부 의존성을 피하기 위한 의도적 선택. 범용 YAML은 지원하지 않음.
// ----------------------------------------------------------------------
function parseYAML(text) {
  const lines = text.split('\n').map((l) => l.replace(/\r$/, ''));
  const root = {};
  const stack = [{ indent: -1, container: root, key: null }];

  function currentContainer() {
    return stack[stack.length - 1].container;
  }

  function parseScalar(v) {
    v = v.trim();
    if (v === '') return '';
    if (v === 'true') return true;
    if (v === 'false') return false;
    if (v === 'null' || v === '~') return null;
    if (/^-?\d+$/.test(v)) return parseInt(v, 10);
    if (/^-?\d+\.\d+$/.test(v)) return parseFloat(v);
    // 인용
    if ((v.startsWith('"') && v.endsWith('"')) ||
        (v.startsWith("'") && v.endsWith("'"))) {
      return v.slice(1, -1);
    }
    return v;
  }

  for (let i = 0; i < lines.length; i++) {
    let raw = lines[i];
    // 완전 빈 줄/주석 스킵
    if (raw.trim() === '' || raw.trim().startsWith('#')) continue;
    // 블록 스칼라 (|) 간단 처리
    const blockMatch = raw.match(/^(\s*)([^:]+):\s*\|\s*$/);
    if (blockMatch) {
      const indent = blockMatch[1].length;
      const key = blockMatch[2].trim();
      // 스택 정리
      while (stack.length > 1 && stack[stack.length - 1].indent >= indent) stack.pop();
      const blockLines = [];
      let j = i + 1;
      let minIndent = -1;
      while (j < lines.length) {
        const bl = lines[j];
        if (bl.trim() === '') { blockLines.push(''); j++; continue; }
        const bIndent = bl.match(/^(\s*)/)[1].length;
        if (bIndent <= indent) break;
        if (minIndent === -1 || bIndent < minIndent) minIndent = bIndent;
        blockLines.push(bl);
        j++;
      }
      const content = blockLines
        .map((l) => (l.length >= minIndent ? l.slice(minIndent) : l))
        .join('\n');
      const container = currentContainer();
      if (Array.isArray(container)) {
        const last = container[container.length - 1];
        if (last && typeof last === 'object') last[key] = content;
      } else {
        container[key] = content;
      }
      i = j - 1;
      continue;
    }

    // list item
    const listMatch = raw.match(/^(\s*)-\s*(.*)$/);
    if (listMatch) {
      const indent = listMatch[1].length;
      const rest = listMatch[2];
      // 스택 정리
      while (stack.length > 1 && stack[stack.length - 1].indent >= indent) stack.pop();
      // 부모 container가 list가 아니라면 새 list 생성
      const parent = stack[stack.length - 1];
      if (parent.key && !Array.isArray(parent.container[parent.key])) {
        parent.container[parent.key] = [];
      }
      const targetList = parent.key ? parent.container[parent.key] : parent.container;
      if (!Array.isArray(targetList)) {
        // root가 list인 경우 미지원 (시나리오 파일은 map이 root)
        continue;
      }
      // inline key: value
      const kvMatch = rest.match(/^([^:]+):\s*(.*)$/);
      if (kvMatch) {
        const obj = {};
        const k = kvMatch[1].trim();
        const v = kvMatch[2];
        if (v.trim() === '') {
          obj[k] = null;
          targetList.push(obj);
          stack.push({ indent, container: obj, key: k });
        } else {
          obj[k] = parseScalar(v);
          targetList.push(obj);
          stack.push({ indent, container: obj, key: null });
        }
      } else {
        // scalar item
        targetList.push(parseScalar(rest));
      }
      continue;
    }

    // key: value
    const kvMatch = raw.match(/^(\s*)([^:]+):\s*(.*)$/);
    if (kvMatch) {
      const indent = kvMatch[1].length;
      const key = kvMatch[2].trim();
      let value = kvMatch[3];
      // 스택 정리
      while (stack.length > 1 && stack[stack.length - 1].indent >= indent) stack.pop();
      const parent = stack[stack.length - 1];
      const container = parent.container;
      if (value.trim() === '') {
        container[key] = null;
        stack.push({ indent, container, key });
      } else {
        container[key] = parseScalar(value);
      }
    }
  }
  return root;
}

// ----------------------------------------------------------------------
// 시나리오 로드
// ----------------------------------------------------------------------
function loadAllScenarios() {
  if (!existsSync(SCENARIOS_DIR)) return [];
  const files = readdirSync(SCENARIOS_DIR).filter((f) => f.endsWith('.yaml') || f.endsWith('.yml'));
  const scenarios = [];
  for (const f of files) {
    const text = readFileSync(join(SCENARIOS_DIR, f), 'utf8');
    try {
      const s = parseYAML(text);
      s._file = f;
      scenarios.push(s);
    } catch (e) {
      console.error(`Failed to parse ${f}: ${e.message}`);
    }
  }
  // 고정 순서로 정렬
  scenarios.sort((a, b) => (a.id || '').localeCompare(b.id || ''));
  return scenarios;
}

function findScenario(id) {
  const all = loadAllScenarios();
  return all.find((s) => s.id === id);
}

// ----------------------------------------------------------------------
// harness 바이너리 빌드/호출
// ----------------------------------------------------------------------
function ensureHarnessBuilt() {
  if (existsSync(HARNESS_BIN)) return;
  console.error(`[build] harness missing, building s4-engine-check → ${HARNESS_BIN}`);
  try {
    execFileSync('go', ['build', '-o', HARNESS_BIN, './cmd/s4-engine-check'], {
      cwd: GAME_SERVER_DIR,
      stdio: 'inherit',
    });
  } catch (e) {
    throw new Error(`harness build failed: ${e.message}`);
  }
}

function runHarness(scenarioId, seed) {
  ensureHarnessBuilt();
  try {
    const out = execFileSync(HARNESS_BIN, ['--scenario', scenarioId, '--seed', seed], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    return { status: 'PASS', raw: out, result: JSON.parse(out) };
  } catch (e) {
    // harness는 FAIL일 때도 stdout에 JSON을 뱉음
    const raw = e.stdout ? e.stdout.toString() : '';
    try {
      const parsed = JSON.parse(raw);
      return { status: parsed.status || 'FAIL', raw, result: parsed };
    } catch {
      return {
        status: 'ERROR',
        raw: raw + '\n' + (e.stderr ? e.stderr.toString() : ''),
        result: null,
      };
    }
  }
}

// ----------------------------------------------------------------------
// CLI
// ----------------------------------------------------------------------
function parseArgs(argv) {
  const args = { aiMode: 'baseline' };
  for (let i = 2; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--list') args.list = true;
    else if (a === '--all') args.all = true;
    else if (a === '--scenario') args.scenario = argv[++i];
    else if (a === '--seed') args.seed = argv[++i];
    else if (a === '--ai-mode') args.aiMode = argv[++i];
    else if (a === '--json') args.json = true;
    else if (a === '--output') args.output = argv[++i];
    else if (a === '--help' || a === '-h') args.help = true;
  }
  return args;
}

function printHelp() {
  console.log(`
Playtest S4 결정론적 시드 프레임워크 Runner

사용:
  node scripts/playtest-s4-seeded.mjs --list
  node scripts/playtest-s4-seeded.mjs --scenario <id> --seed <0x...>
  node scripts/playtest-s4-seeded.mjs --scenario <id>              # 첫 시드 후보 사용
  node scripts/playtest-s4-seeded.mjs --all                         # 모든 시나리오 첫 시드
  node scripts/playtest-s4-seeded.mjs --scenario <id> --ai-mode baseline|fixture|live
  node scripts/playtest-s4-seeded.mjs --output run-log.json         # 결과 JSON 저장

환경변수:
  S4_HARNESS_BIN    s4-engine-check 경로 (기본 /tmp/s4-engine-check)
`);
}

// ----------------------------------------------------------------------
// 결과 출력 포매터
// ----------------------------------------------------------------------
function formatResult(r) {
  if (!r.result) return `  ERROR: ${r.raw.slice(0, 400)}`;
  const lines = [];
  const status = r.result.status;
  const mark = status === 'PASS' ? 'PASS' : status === 'FAIL' ? 'FAIL' : 'ERR ';
  lines.push(`  [${mark}] ${r.result.scenario} seed=${r.result.seed} duration=${r.result.durationMs}ms`);
  for (const [k, v] of Object.entries(r.result.checks || {})) {
    const sym = v ? 'ok ' : 'NO ';
    lines.push(`         ${sym} ${k}`);
  }
  if (r.result.details && r.result.details.seat0_hand) {
    lines.push(`         hand: ${r.result.details.seat0_hand.join(' ')}`);
  }
  return lines.join('\n');
}

// ----------------------------------------------------------------------
// main
// ----------------------------------------------------------------------
async function main() {
  const args = parseArgs(process.argv);

  if (args.help) {
    printHelp();
    return;
  }

  if (args.list) {
    const scenarios = loadAllScenarios();
    if (scenarios.length === 0) {
      console.error('시나리오가 없습니다.');
      process.exit(1);
    }
    console.log(`Scenarios (${scenarios.length}):`);
    for (const s of scenarios) {
      const firstSeed = s.seed_candidates?.[0]?.seed || '(no seed)';
      console.log(`  - ${s.id}  [${s.priority || 'P?'}]  first-seed=${firstSeed}`);
      console.log(`      ${s.title}`);
    }
    return;
  }

  if (args.aiMode === 'fixture' || args.aiMode === 'live') {
    console.error(`[warn] AI mode '${args.aiMode}' not yet implemented — falling back to 'baseline'`);
    args.aiMode = 'baseline';
  }

  const runs = [];

  if (args.all) {
    const scenarios = loadAllScenarios();
    for (const s of scenarios) {
      const seed = s.seed_candidates?.[0]?.seed;
      if (!seed) {
        console.error(`[skip] ${s.id} — no seed_candidates`);
        continue;
      }
      console.error(`[run] ${s.id} seed=${seed}`);
      runs.push(runHarness(s.id, seed));
      console.log(formatResult(runs[runs.length - 1]));
    }
  } else if (args.scenario) {
    const s = findScenario(args.scenario);
    if (!s) {
      console.error(`시나리오 '${args.scenario}' 를 찾을 수 없습니다.`);
      process.exit(1);
    }
    const seed = args.seed || s.seed_candidates?.[0]?.seed;
    if (!seed) {
      console.error(`시나리오 '${args.scenario}'에 시드가 지정되지 않았습니다.`);
      process.exit(1);
    }
    console.error(`[run] ${s.id} seed=${seed} ai-mode=${args.aiMode}`);
    runs.push(runHarness(s.id, seed));
    console.log(formatResult(runs[runs.length - 1]));
  } else {
    printHelp();
    process.exit(2);
  }

  // 결과 요약
  const passed = runs.filter((r) => r.result?.status === 'PASS').length;
  const total = runs.length;
  console.log(`\n=== Summary: ${passed}/${total} PASS ===`);

  // JSON 출력 파일 저장
  if (args.output) {
    const outPath = resolve(args.output);
    mkdirSync(dirname(outPath), { recursive: true });
    const payload = {
      generatedAt: new Date().toISOString(),
      aiMode: args.aiMode,
      runs: runs.map((r) => r.result),
      summary: { total, passed, failed: total - passed },
    };
    writeFileSync(outPath, JSON.stringify(payload, null, 2));
    console.error(`[write] ${outPath}`);
  }

  if (passed < total) process.exit(1);
}

main().catch((e) => {
  console.error(`[error] ${e.stack || e.message}`);
  process.exit(1);
});
