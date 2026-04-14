"use client";

import {
  CartesianGrid,
  Cell,
  ComposedChart,
  Legend,
  Line,
  ResponsiveContainer,
  Scatter,
  Tooltip,
  XAxis,
  YAxis,
  ZAxis,
} from "recharts";
import type {
  ModelType,
  PromptVersion,
  TournamentRoundEntry,
} from "@/lib/types";
import { MODEL_COLORS, MODEL_NAMES } from "./constants";
import {
  buildCostEfficiencyPoints,
  computeParetoFrontier,
  type CostEfficiencyPoint,
} from "@/lib/dashboard-data";

interface CostEfficiencyScatterProps {
  data: TournamentRoundEntry[];
  selectedModels: ModelType[];
  promptVersion: "all" | PromptVersion;
  height?: number;
}

/**
 * 스펙: docs/02-design/33-ai-tournament-dashboard-component-spec.md §4.5
 *
 * - X: cost per turn ($) — log scale (모델 간 28~74배 차이)
 * - Y: place rate (%)
 * - Z: 총 턴 수 (버블 크기)
 * - Pareto frontier: 최소 비용 대비 최고 place rate를 잇는 경계선
 */
export default function CostEfficiencyScatter({
  data,
  selectedModels,
  promptVersion,
  height = 320,
}: CostEfficiencyScatterProps) {
  const points: CostEfficiencyPoint[] = buildCostEfficiencyPoints(
    data,
    selectedModels,
    promptVersion,
  );

  if (points.length === 0 || selectedModels.length === 0) {
    return (
      <figure
        role="img"
        aria-labelledby="cost-eff-title"
        aria-describedby="cost-eff-empty"
        className="h-full flex flex-col"
      >
        <figcaption
          id="cost-eff-title"
          className="text-sm font-semibold text-slate-300 uppercase tracking-wide mb-2"
        >
          비용 효율성
        </figcaption>
        <div
          id="cost-eff-empty"
          className="flex-1 flex items-center justify-center border border-dashed border-slate-700 rounded-md text-slate-500 text-sm"
        >
          <span>
            {selectedModels.length === 0
              ? "범례에서 모델을 하나 이상 선택하세요"
              : "선택한 필터에 해당하는 라운드가 없습니다"}
          </span>
        </div>
      </figure>
    );
  }

  const pareto = computeParetoFrontier(points);
  const srSummary = summarizeForSR(points);

  // 모델별로 Scatter 시리즈를 분리 (Legend가 모델별로 토글되도록)
  const seriesByModel = new Map<ModelType, CostEfficiencyPoint[]>();
  for (const m of selectedModels) seriesByModel.set(m, []);
  for (const p of points) {
    const arr = seriesByModel.get(p.modelType);
    if (arr) arr.push(p);
  }

  return (
    <figure
      role="img"
      aria-labelledby="cost-eff-title"
      aria-describedby="cost-eff-desc"
      className="h-full flex flex-col"
    >
      <figcaption
        id="cost-eff-title"
        className="text-sm font-semibold text-slate-300 uppercase tracking-wide mb-2"
      >
        비용 효율성
      </figcaption>
      <p id="cost-eff-desc" className="sr-only">
        {srSummary}
      </p>
      <div className="flex-1 min-h-[240px]" style={{ minHeight: height }}>
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart
            margin={{ top: 12, right: 24, left: 8, bottom: 28 }}
          >
            <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
            <XAxis
              type="number"
              dataKey="costPerTurn"
              name="$/턴"
              scale="log"
              domain={["auto", "auto"]}
              allowDataOverflow={false}
              tickFormatter={(v: number) => formatCost(v)}
              tick={{ fill: "#94a3b8", fontSize: 11 }}
              axisLine={{ stroke: "#475569" }}
              tickLine={false}
              label={{
                value: "$ / 턴 (log scale)",
                position: "insideBottom",
                offset: -16,
                fill: "#94a3b8",
                fontSize: 11,
              }}
            />
            <YAxis
              type="number"
              dataKey="placeRate"
              name="Place Rate"
              tickFormatter={(v: number) => `${v}%`}
              tick={{ fill: "#94a3b8", fontSize: 12 }}
              axisLine={false}
              tickLine={false}
              domain={[0, 50]}
            />
            <ZAxis
              type="number"
              dataKey="turns"
              range={[60, 400]}
              name="총 턴"
            />
            <Tooltip
              cursor={{ strokeDasharray: "3 3", stroke: "#64748b" }}
              contentStyle={{
                backgroundColor: "#1e293b",
                border: "1px solid #475569",
                borderRadius: 8,
                fontSize: 12,
              }}
              content={<CostEffTooltip />}
            />
            <Legend
              verticalAlign="top"
              height={28}
              iconType="circle"
              wrapperStyle={{ fontSize: 11, color: "#94a3b8" }}
              formatter={(value: string) =>
                MODEL_NAMES[value as ModelType] ?? value
              }
            />

            {/* Pareto frontier — 점선 라인 */}
            {pareto.length >= 2 ? (
              <Line
                type="linear"
                data={pareto}
                dataKey="placeRate"
                name="Pareto frontier"
                stroke="#94a3b8"
                strokeWidth={1.5}
                strokeDasharray="6 4"
                dot={{
                  r: 3,
                  stroke: "#94a3b8",
                  fill: "#0f172a",
                  strokeWidth: 1.5,
                }}
                activeDot={false}
                isAnimationActive={false}
                legendType="plainline"
              />
            ) : null}

            {/* 모델별 Scatter 시리즈 */}
            {selectedModels.map((model) => {
              const series = seriesByModel.get(model) ?? [];
              if (series.length === 0) return null;
              return (
                <Scatter
                  key={model}
                  name={model}
                  data={series}
                  fill={MODEL_COLORS[model]}
                  fillOpacity={0.85}
                  stroke="#0f172a"
                  strokeWidth={1.5}
                  isAnimationActive
                  animationDuration={700}
                >
                  {series.map((p) => (
                    <Cell
                      key={`${p.modelType}-${p.round}`}
                      fill={MODEL_COLORS[p.modelType]}
                    />
                  ))}
                </Scatter>
              );
            })}
          </ComposedChart>
        </ResponsiveContainer>
      </div>
    </figure>
  );
}

function formatCost(v: number): string {
  if (v >= 1) return `$${v.toFixed(2)}`;
  if (v >= 0.01) return `$${v.toFixed(3)}`;
  return `$${v.toFixed(4)}`;
}

function summarizeForSR(points: CostEfficiencyPoint[]): string {
  if (points.length === 0) return "표시할 데이터가 없습니다.";
  let bestEff: CostEfficiencyPoint | null = null;
  for (const p of points) {
    if (!bestEff || p.placePerDollar > bestEff.placePerDollar) bestEff = p;
  }
  const summary = bestEff
    ? `최고 비용 효율: ${MODEL_NAMES[bestEff.modelType]} ${bestEff.round} (${bestEff.placePerDollar.toFixed(0)} place/$)`
    : "";
  return `총 ${points.length}개 라운드. ${summary}.`;
}

interface ScatterTooltipPayloadItem {
  name: string;
  value: number;
  payload: CostEfficiencyPoint;
}

function CostEffTooltip({
  active,
  payload,
}: {
  active?: boolean;
  payload?: ScatterTooltipPayloadItem[];
}) {
  if (!active || !payload || payload.length === 0) return null;
  const point = payload[0].payload;
  // Pareto frontier 호버는 모델 정보가 없으므로 단순 라벨만
  if (!point.modelType) {
    return (
      <div
        className="rounded-md border border-slate-600 bg-slate-800/95 px-3 py-2 shadow-lg"
        role="tooltip"
      >
        <p className="text-xs font-semibold text-slate-200">Pareto frontier</p>
        <p className="text-xs text-slate-400 mt-0.5">
          {formatCost(point.costPerTurn)} · {point.placeRate.toFixed(1)}%
        </p>
      </div>
    );
  }

  const color = MODEL_COLORS[point.modelType] ?? "#94a3b8";
  return (
    <div
      className="rounded-md border border-slate-600 bg-slate-800/95 px-3 py-2 shadow-lg"
      role="tooltip"
    >
      <p className="text-xs font-semibold text-slate-200 mb-1.5 flex items-center gap-2">
        <span
          className="inline-block h-2 w-2 rounded-full"
          style={{ backgroundColor: color }}
          aria-hidden="true"
        />
        {MODEL_NAMES[point.modelType]}
        <span className="text-slate-500 font-normal">· {point.round}</span>
        {point.promptVersion ? (
          <span className="text-slate-500 font-normal">
            ({point.promptVersion})
          </span>
        ) : null}
      </p>
      <div className="space-y-0.5 text-xs text-slate-300 tabular-nums">
        <div className="flex justify-between gap-3">
          <span>$/턴</span>
          <span className="font-semibold text-slate-100">
            {formatCost(point.costPerTurn)}
          </span>
        </div>
        <div className="flex justify-between gap-3">
          <span>Place rate</span>
          <span className="font-semibold text-slate-100">
            {point.placeRate.toFixed(1)}%
          </span>
        </div>
        <div className="flex justify-between gap-3">
          <span>총 턴</span>
          <span className="font-semibold text-slate-100">{point.turns}</span>
        </div>
        <div className="flex justify-between gap-3">
          <span>총 비용</span>
          <span className="font-semibold text-slate-100">
            ${point.totalCost.toFixed(3)}
          </span>
        </div>
        <div className="flex justify-between gap-3 pt-1 mt-1 border-t border-slate-700">
          <span>place / $</span>
          <span className="font-semibold text-emerald-400">
            {point.placePerDollar.toFixed(0)}
          </span>
        </div>
      </div>
    </div>
  );
}
