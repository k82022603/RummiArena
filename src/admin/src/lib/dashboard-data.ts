/**
 * 대시보드 데이터 변환 헬퍼
 *
 * 스펙: docs/02-design/33-ai-tournament-dashboard-component-spec.md §4.4
 *
 * - TournamentRoundEntry[] → recharts PivotRow[] (라운드 × 모델 피벗)
 * - SR 요약 문자열 (ARIA sr-only)
 * - 빈 데이터 / 에러 상태는 PlaceRateChart가 처리.
 */

import type {
  ModelType,
  PromptVersion,
  TournamentRoundEntry,
} from "./types";
import { MODEL_NAMES } from "@/components/tournament/constants";

/** CostEfficiencyScatter 차트의 단일 점 — recharts 입력 */
export interface CostEfficiencyPoint {
  modelType: ModelType;
  round: string;
  promptVersion: PromptVersion;
  costPerTurn: number;
  totalCost: number;
  turns: number;
  placeRate: number;
  placePerDollar: number;
}

/**
 * TournamentRoundEntry[] → CostEfficiencyPoint[] 변환.
 *
 * - X축은 "$/턴"이므로 totalCost / totalTurns 로 도출
 * - 비용 0(Ollama)이거나 turns 0 인 라운드는 log scale 호환을 위해 제외
 * - placePerDollar = placeRate / costPerTurn
 */
export function buildCostEfficiencyPoints(
  rows: TournamentRoundEntry[],
  selectedModels: ModelType[],
  promptVersion: "all" | PromptVersion,
): CostEfficiencyPoint[] {
  const selected = new Set(selectedModels);
  const out: CostEfficiencyPoint[] = [];
  for (const r of rows) {
    if (!selected.has(r.modelType)) continue;
    if (promptVersion !== "all" && r.promptVersion !== promptVersion) continue;
    if (r.totalTurns <= 0) continue;
    const costPerTurn = r.totalCost / r.totalTurns;
    if (costPerTurn <= 0) continue;
    out.push({
      modelType: r.modelType,
      round: r.round,
      promptVersion: r.promptVersion,
      costPerTurn,
      totalCost: r.totalCost,
      turns: r.totalTurns,
      placeRate: r.placeRate,
      placePerDollar: r.placeRate / costPerTurn,
    });
  }
  return out;
}

/**
 * Pareto frontier 계산 — 비용은 낮을수록, place rate는 높을수록 우월.
 *
 * 알고리즘:
 *   1. costPerTurn 오름차순 정렬
 *   2. placeRate 누적 최대값(running max)을 따라 점을 채택
 */
export function computeParetoFrontier(
  points: CostEfficiencyPoint[],
): CostEfficiencyPoint[] {
  if (points.length === 0) return [];
  const sorted = [...points].sort((a, b) => a.costPerTurn - b.costPerTurn);
  const frontier: CostEfficiencyPoint[] = [];
  let bestRate = -Infinity;
  for (const p of sorted) {
    if (p.placeRate > bestRate) {
      frontier.push(p);
      bestRate = p.placeRate;
    }
  }
  return frontier;
}

/** 라운드-프롬프트 조합별 모델 placeRate 매핑 */
export interface PivotRow {
  /** X축 라벨: round (promptVersion이 섞여 있으면 "R4 v2" 형태로 노출) */
  round: string;
  /** 프롬프트 구분을 위해 보조 필드 (라벨과 툴팁에서 활용) */
  __v?: PromptVersion;
  /** 모델 타입별 placeRate 값 (0~100) — 누락 시 null */
  [modelType: string]: number | string | PivotMeta | null | undefined;
}

export interface PivotMeta {
  tiles: number;
  turns: number;
  cost: number;
  completed: boolean;
  grade: string;
  status: string;
}

/**
 * TournamentRoundEntry[] → recharts 용 PivotRow[] 변환.
 *
 * 라운드 정렬: 원본 JSON 순서를 따른다 (R2 → R3 → R4 → R4v2 → R5-*).
 * 동일 round + 동일 promptVersion은 하나의 X축 포인트로 병합.
 */
export function pivotRoundsByRound(
  rows: TournamentRoundEntry[],
  selectedModels: ModelType[],
  promptVersion: "all" | PromptVersion,
): PivotRow[] {
  const selected = new Set(selectedModels);
  const byKey = new Map<string, PivotRow>();
  const orderKeys: string[] = [];

  for (const row of rows) {
    if (!selected.has(row.modelType)) continue;
    if (promptVersion !== "all" && row.promptVersion !== promptVersion) continue;

    // 프롬프트 버전이 여러 개 섞여 있을 경우에만 접미사로 구분
    const label = formatRoundLabel(row.round, row.promptVersion);
    const key = `${row.round}__${row.promptVersion}`;

    if (!byKey.has(key)) {
      byKey.set(key, { round: label, __v: row.promptVersion });
      orderKeys.push(key);
    }
    const pivot = byKey.get(key)!;
    pivot[row.modelType] = row.placeRate;
    const meta: PivotMeta = {
      tiles: row.totalTiles,
      turns: row.totalTurns,
      cost: row.totalCost,
      completed: row.completed,
      grade: row.grade,
      status: row.status,
    };
    pivot[`${row.modelType}_meta`] = meta;
  }

  // 누락된 모델에 대해서는 null을 명시적으로 채워 `connectNulls` + 라인 끊김을 제어
  for (const key of orderKeys) {
    const pivot = byKey.get(key)!;
    for (const m of selectedModels) {
      if (pivot[m] === undefined) pivot[m] = null;
    }
  }

  return orderKeys.map((k) => byKey.get(k)!);
}

/** 라운드 식별자 + 프롬프트 버전을 읽기 좋은 라벨로 변환 */
export function formatRoundLabel(
  round: string,
  promptVersion: PromptVersion,
): string {
  // R4 / R4v2 는 이미 접미사 포함 → 중복 없이 그대로
  if (round.endsWith(promptVersion)) return round;
  // R5-DS-run3 같은 상세 라운드는 프롬프트 버전을 생략 (혼잡 방지)
  if (round.startsWith("R5-")) return round;
  return `${round} ${promptVersion}`;
}

/**
 * 스크린 리더용 요약 텍스트.
 *
 * 예: "총 9개 라운드. 최고 place rate: DeepSeek Reasoner 30.8% (R5-DS-run3).
 *      GPT-5-mini 평균 28.2%, Claude Sonnet 4 평균 23.1%, DeepSeek Reasoner 평균 19.5%."
 */
export function summarizeForScreenReader(
  rows: TournamentRoundEntry[],
  selectedModels: ModelType[],
): string {
  if (rows.length === 0) return "표시할 데이터가 없습니다.";

  const selected = new Set(selectedModels);
  const filtered = rows.filter((r) => selected.has(r.modelType));
  if (filtered.length === 0) return "선택한 모델에 해당하는 데이터가 없습니다.";

  const roundCount = new Set(filtered.map((r) => `${r.round}__${r.promptVersion}`)).size;

  // 최고 place rate
  let best: TournamentRoundEntry | null = null;
  for (const r of filtered) {
    if (!best || r.placeRate > best.placeRate) best = r;
  }

  // 모델별 평균
  const byModel = new Map<ModelType, number[]>();
  for (const r of filtered) {
    if (!byModel.has(r.modelType)) byModel.set(r.modelType, []);
    byModel.get(r.modelType)!.push(r.placeRate);
  }
  const averages: string[] = [];
  for (const [model, rates] of byModel.entries()) {
    const avg = rates.reduce((a, b) => a + b, 0) / rates.length;
    averages.push(`${MODEL_NAMES[model]} 평균 ${avg.toFixed(1)}%`);
  }

  const bestStr = best
    ? `최고 place rate: ${MODEL_NAMES[best.modelType]} ${best.placeRate.toFixed(1)}% (${best.round})`
    : "";

  return `총 ${roundCount}개 라운드. ${bestStr}. ${averages.join(", ")}.`;
}
