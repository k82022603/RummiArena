#!/usr/bin/env node
/**
 * SP4 Prompt A/B Eval — Node.js wrapper
 *
 * 이 스크립트는 src/ai-adapter 의 TypeScript harness(ab-eval.ts)를
 * ts-node 를 통해 실행하는 얇은 래퍼다. 모든 인자는 harness에 그대로 전달된다.
 *
 * 실제 로직은 src/ai-adapter/src/prompt/registry/cli/ab-eval.ts 에 있다.
 *
 * 사용:
 *   node scripts/prompt-ab-eval.mjs                                    # 기본값 전체 매트릭스
 *   node scripts/prompt-ab-eval.mjs --variants v3,v4 --models deepseek-reasoner
 *   node scripts/prompt-ab-eval.mjs --seeds 0x14,0xB --out /tmp/ab
 *
 * 기본값:
 *   --seeds 0x1,0x14,0xB,0xF,0x16,0x1C,0x2,0x3,0xCAFEBABE,0xDEADBEEF  (B3 seed 10개)
 *   --variants v2,v3,v3-tuned,v4
 *   --models openai,claude,deepseek-reasoner,dashscope
 *
 * 결과:
 *   - scripts/ab-eval-results/ab-eval-<timestamp>.json
 *   - scripts/ab-eval-results/ab-eval-<timestamp>.md
 *
 * 실제 LLM 호출은 없다 (dry-run). registry의 variant 오브젝트에서
 * system/user/retry 프롬프트 문자열만 생성하여 diff + decision impact 분석.
 */

import { execFileSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve, join } from 'node:path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const REPO_ROOT = resolve(__dirname, '..');
const AI_ADAPTER_DIR = join(REPO_ROOT, 'src', 'ai-adapter');
const TS_NODE_BIN = join(AI_ADAPTER_DIR, 'node_modules', '.bin', 'ts-node');
const HARNESS_TS = join(
  AI_ADAPTER_DIR,
  'src',
  'prompt',
  'registry',
  'cli',
  'ab-eval.ts',
);
const DEFAULT_OUT = join(REPO_ROOT, 'scripts', 'ab-eval-results');

function abort(msg) {
  process.stderr.write(`[error] ${msg}\n`);
  process.exit(1);
}

if (!existsSync(TS_NODE_BIN)) {
  abort(
    `ts-node not found at ${TS_NODE_BIN}\n` +
      `→ cd src/ai-adapter && npm install`,
  );
}

if (!existsSync(HARNESS_TS)) {
  abort(`harness not found at ${HARNESS_TS}`);
}

// --out 기본값 주입 (사용자가 명시하지 않았다면)
const userArgs = process.argv.slice(2);
const hasOut = userArgs.includes('--out');
const finalArgs = ['--transpile-only', HARNESS_TS, ...userArgs];
if (!hasOut) {
  finalArgs.push('--out', DEFAULT_OUT);
}

try {
  execFileSync(TS_NODE_BIN, finalArgs, {
    cwd: AI_ADAPTER_DIR,
    stdio: 'inherit',
  });
} catch (e) {
  process.exit(e.status ?? 1);
}
