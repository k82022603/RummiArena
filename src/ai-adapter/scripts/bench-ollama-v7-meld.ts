/**
 * Sprint 7 hotfix 실증 벤치마크: v2 (기존 baseline) vs v7-ollama-meld
 *
 * 목적: qwen2.5:3b 가 "30점 이상 initial meld" 를 얻어걸리게라도 성공하는지 측정
 *
 * 방법:
 *   - 동일 시나리오 5건(랜덤 rack)을 각 variant 에 투입
 *   - action=place 이고 tiles 점수합 >= 30 인 응답을 "meld 성공" 으로 기록
 *   - 성공 지표: v7 이 v2 대비 최소 1/5 이상 더 성공
 *
 * 실행 예:
 *   # 1) K8s port-forward 로 접근:
 *   kubectl -n rummikub port-forward svc/ollama 11435:11434 &
 *   OLLAMA_BASE_URL=http://localhost:11435 \
 *     npx ts-node --transpile-only scripts/bench-ollama-v7-meld.ts
 *
 *   # 2) 로컬 ollama 로 접근:
 *   OLLAMA_BASE_URL=http://localhost:11434 \
 *     npx ts-node --transpile-only scripts/bench-ollama-v7-meld.ts
 *
 * 주의 (2026-04-22 실행 경험):
 *   - qwen2.5:3b 는 CPU 추론 환경에서 2000+ token 입력에 300s+ 소요
 *   - Round 4/5 실측과 동일하게 처음 호출은 모델 로드로 추가 ~70s
 *   - GPU 환경이 아니면 한 시나리오당 수분 소요 가능 — 긴 세션 필요
 *   - timeout 은 이 스크립트에서 300s (기본값). 필요 시 callOllama() 내부 수정
 */

import axios from 'axios';
import { V2_REASONING_SYSTEM_PROMPT, buildV2UserPrompt } from '../src/prompt/v2-reasoning-prompt';
import {
  V7_OLLAMA_MELD_SYSTEM_PROMPT,
  buildV7OllamaMeldUserPrompt,
} from '../src/prompt/v7-ollama-meld-prompt';

interface Scenario {
  name: string;
  myTiles: string[];
  // expectedMeldable: 이 rack 으로 30점 이상 initial meld 가 실제 가능한가 (ground truth)
  expectedMeldable: boolean;
}

// 5개 시나리오 — 명시적으로 meldable / non-meldable 혼합
const SCENARIOS: Scenario[] = [
  {
    name: 'S1 clear group of 10s (30 pts, trivial)',
    myTiles: ['R10a', 'B10a', 'K10a', 'R5a', 'B7b', 'Y2a', 'Y3a', 'K4a'],
    expectedMeldable: true,
  },
  {
    name: 'S2 run R8-R11 (38 pts, trivial)',
    myTiles: ['R8a', 'R9a', 'R10a', 'R11a', 'B2a', 'K4a', 'Y1a', 'K3a'],
    expectedMeldable: true,
  },
  {
    name: 'S3 combined group+run (7*3 + B3+B4+B5 = 33, step 3)',
    myTiles: ['R7a', 'B7a', 'K7a', 'B3a', 'B4a', 'B5a', 'Y1a', 'K2a'],
    expectedMeldable: true,
  },
  {
    name: 'S4 group of 11s (33 pts)',
    myTiles: ['R11a', 'B11a', 'Y11a', 'R2a', 'B4a', 'K5b', 'Y6a', 'K8a'],
    expectedMeldable: true,
  },
  {
    name: 'S5 no 30+ combo possible (must draw)',
    myTiles: ['R5a', 'B3a', 'K9a', 'Y1a', 'R2b', 'B8b', 'K11a', 'Y13a'],
    expectedMeldable: false,
  },
];

const BASE_URL = process.env.OLLAMA_BASE_URL ?? 'http://localhost:11435';
const MODEL = process.env.OLLAMA_DEFAULT_MODEL ?? 'qwen2.5:3b';

interface TileScore {
  number: number;
}
function tileNumber(code: string): number {
  if (code === 'JK1' || code === 'JK2') return 0;
  const m = code.match(/^[RBYK](\d+)/);
  return m ? parseInt(m[1], 10) : 0;
}

interface PlaceResult {
  action: 'place' | 'draw' | 'other';
  totalPoints: number;
  tilesFromRack: string[];
  raw: string;
  error?: string;
}

function parseMove(content: string): PlaceResult {
  try {
    // JSON 추출
    const match = content.match(/\{[\s\S]*\}/);
    const jsonStr = match ? match[0] : content;
    const obj = JSON.parse(jsonStr);
    if (obj.action === 'place' && Array.isArray(obj.tilesFromRack)) {
      const pts = obj.tilesFromRack.reduce(
        (s: number, t: string) => s + tileNumber(t),
        0,
      );
      return {
        action: 'place',
        totalPoints: pts,
        tilesFromRack: obj.tilesFromRack,
        raw: content,
      };
    }
    if (obj.action === 'draw') {
      return { action: 'draw', totalPoints: 0, tilesFromRack: [], raw: content };
    }
    return { action: 'other', totalPoints: 0, tilesFromRack: [], raw: content };
  } catch (e) {
    return {
      action: 'other',
      totalPoints: 0,
      tilesFromRack: [],
      raw: content,
      error: String(e),
    };
  }
}

async function callOllama(
  systemPrompt: string,
  userPrompt: string,
): Promise<string> {
  const resp = await axios.post(
    `${BASE_URL}/api/chat`,
    {
      model: MODEL,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt },
      ],
      format: 'json',
      stream: false,
      options: { temperature: 0.0, num_predict: 512 },
    },
    { timeout: 300_000 },
  );
  return (resp.data.message?.content as string) ?? '';
}

async function runScenario(
  scenario: Scenario,
  variant: 'v2' | 'v7',
): Promise<PlaceResult> {
  const gameState = {
    tableGroups: [] as { tiles: string[] }[],
    myTiles: scenario.myTiles,
    turnNumber: 1,
    drawPileCount: 80,
    initialMeldDone: false,
    opponents: [{ playerId: 'p2', remainingTiles: 14 }],
  };
  const systemPrompt =
    variant === 'v2' ? V2_REASONING_SYSTEM_PROMPT : V7_OLLAMA_MELD_SYSTEM_PROMPT;
  const userPrompt =
    variant === 'v2'
      ? buildV2UserPrompt(gameState)
      : buildV7OllamaMeldUserPrompt(gameState);
  const t0 = Date.now();
  try {
    const content = await callOllama(systemPrompt, userPrompt);
    const parsed = parseMove(content);
    return { ...parsed, raw: `(${Date.now() - t0}ms) ${parsed.raw.slice(0, 180)}` };
  } catch (e: any) {
    return {
      action: 'other',
      totalPoints: 0,
      tilesFromRack: [],
      raw: `error after ${Date.now() - t0}ms`,
      error: String(e.message ?? e),
    };
  }
}

async function main() {
  console.log(`\n=== Bench v2 vs v7-ollama-meld @ ${MODEL} ===\n`);
  const results: Record<string, { v2: PlaceResult; v7: PlaceResult }> = {};
  for (const s of SCENARIOS) {
    console.log(`[${s.name}]`);
    console.log(`  rack: ${s.myTiles.join(',')}`);
    console.log(`  ground truth: expectedMeldable=${s.expectedMeldable}`);

    const v2Res = await runScenario(s, 'v2');
    console.log(
      `  v2: action=${v2Res.action} pts=${v2Res.totalPoints} tiles=${v2Res.tilesFromRack.join(',')}`,
    );
    console.log(`       raw: ${v2Res.raw.slice(0, 160)}`);

    const v7Res = await runScenario(s, 'v7');
    console.log(
      `  v7: action=${v7Res.action} pts=${v7Res.totalPoints} tiles=${v7Res.tilesFromRack.join(',')}`,
    );
    console.log(`       raw: ${v7Res.raw.slice(0, 160)}`);

    results[s.name] = { v2: v2Res, v7: v7Res };
    console.log();
  }

  // 집계: 성공 = action=place AND totalPoints >= 30 AND expectedMeldable=true
  //       draw 정확도 = action=draw AND expectedMeldable=false
  let v2Meld = 0, v7Meld = 0;
  let v2DrawCorrect = 0, v7DrawCorrect = 0;
  for (const s of SCENARIOS) {
    const r = results[s.name];
    if (s.expectedMeldable) {
      if (r.v2.action === 'place' && r.v2.totalPoints >= 30) v2Meld++;
      if (r.v7.action === 'place' && r.v7.totalPoints >= 30) v7Meld++;
    } else {
      if (r.v2.action === 'draw') v2DrawCorrect++;
      if (r.v7.action === 'draw') v7DrawCorrect++;
    }
  }

  const meldable = SCENARIOS.filter((s) => s.expectedMeldable).length;
  const nonMeldable = SCENARIOS.length - meldable;

  console.log('=== SUMMARY ===');
  console.log(
    `Meld success (>=30 pts in meldable rack): v2=${v2Meld}/${meldable}  v7=${v7Meld}/${meldable}`,
  );
  console.log(
    `Correct draw (on non-meldable rack):      v2=${v2DrawCorrect}/${nonMeldable}  v7=${v7DrawCorrect}/${nonMeldable}`,
  );
  console.log();
  console.log(
    `Target: v7 >= 1 meld success AND v7 >= v2 (at minimum "얻어걸리게" 라도)`,
  );

  const passed = v7Meld >= 1 && v7Meld >= v2Meld;
  console.log(passed ? '✅ PASSED' : '❌ FAILED');
  process.exit(passed ? 0 : 2);
}

main().catch((e) => {
  console.error('Benchmark error:', e);
  process.exit(1);
});
