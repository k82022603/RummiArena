"use client";

import type {
  ModelType,
  PromptVersion,
  TournamentRoundEntry,
} from "@/lib/types";
import {
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { MODEL_COLORS, MODEL_NAMES } from "./constants";
import {
  pivotRoundsByRound,
  summarizeForScreenReader,
  type PivotMeta,
  type PivotRow,
} from "@/lib/dashboard-data";

interface PlaceRateChartProps {
  data: TournamentRoundEntry[];
  selectedModels: ModelType[];
  promptVersion: "all" | PromptVersion;
  height?: number;
}

/**
 * 스펙: docs/02-design/33-ai-tournament-dashboard-component-spec.md §4.4
 *
 * - X: `round-promptVersion` 복합 키 (PivotRow.round)
 * - Y: placeRate 0~50 (실측 상한 ~34%, 여유 두고 50)
 * - 모델별 `<Line>` 분리, v1은 `strokeDasharray="8 4"`, v2/v3는 실선
 * - 툴팁: tiles placed / turn count / cost / status / grade
 */
export default function PlaceRateChart({
  data,
  selectedModels,
  promptVersion,
  height = 320,
}: PlaceRateChartProps) {
  // Empty state
  if (data.length === 0 || selectedModels.length === 0) {
    return (
      <figure
        role="img"
        aria-labelledby="place-rate-title"
        aria-describedby="place-rate-empty"
        className="h-full flex flex-col"
      >
        <figcaption
          id="place-rate-title"
          className="text-sm font-semibold text-slate-300 uppercase tracking-wide mb-2"
        >
          Place Rate 추이
        </figcaption>
        <div
          id="place-rate-empty"
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

  const rows: PivotRow[] = pivotRoundsByRound(data, selectedModels, promptVersion);
  const srSummary = summarizeForScreenReader(data, selectedModels);

  return (
    <figure
      role="img"
      aria-labelledby="place-rate-title"
      aria-describedby="place-rate-desc"
      className="h-full flex flex-col"
    >
      <figcaption
        id="place-rate-title"
        className="text-sm font-semibold text-slate-300 uppercase tracking-wide mb-2"
      >
        Place Rate 추이
      </figcaption>
      <p id="place-rate-desc" className="sr-only">
        {srSummary}
      </p>
      <div className="flex-1 min-h-[240px]" style={{ minHeight: height }}>
        <ResponsiveContainer width="100%" height="100%">
          <LineChart
            data={rows}
            margin={{ top: 8, right: 16, left: 0, bottom: 8 }}
          >
            <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
            <XAxis
              dataKey="round"
              tick={{ fill: "#94a3b8", fontSize: 11 }}
              axisLine={{ stroke: "#475569" }}
              tickLine={false}
              interval={0}
              angle={-20}
              textAnchor="end"
              height={50}
            />
            <YAxis
              tickFormatter={(v: number) => `${v}%`}
              tick={{ fill: "#94a3b8", fontSize: 12 }}
              axisLine={false}
              tickLine={false}
              domain={[0, 50]}
            />
            <Tooltip
              contentStyle={{
                backgroundColor: "#1e293b",
                border: "1px solid #475569",
                borderRadius: 8,
                fontSize: 12,
              }}
              labelStyle={{ color: "#e2e8f0", fontWeight: 600 }}
              content={<PlaceRateTooltip />}
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
            {selectedModels.map((model) => (
              <Line
                key={model}
                type="monotone"
                dataKey={model}
                name={model}
                stroke={MODEL_COLORS[model]}
                strokeWidth={2.25}
                dot={{ r: 4, strokeWidth: 1, stroke: "#0f172a" }}
                activeDot={{ r: 6, strokeWidth: 2, stroke: "#0f172a" }}
                connectNulls
                isAnimationActive
                animationDuration={800}
                animationEasing="ease-out"
              />
            ))}
          </LineChart>
        </ResponsiveContainer>
      </div>
    </figure>
  );
}

interface TooltipPayloadItem {
  dataKey: string;
  value: number | null;
  payload: PivotRow;
}

function PlaceRateTooltip({
  active,
  payload,
  label,
}: {
  active?: boolean;
  payload?: TooltipPayloadItem[];
  label?: string;
}) {
  if (!active || !payload || payload.length === 0) return null;
  const first = payload[0];
  const row = first.payload;

  return (
    <div
      className="rounded-md border border-slate-600 bg-slate-800/95 px-3 py-2 shadow-lg"
      role="tooltip"
    >
      <p className="text-xs font-semibold text-slate-200 mb-1.5">
        {label}
        {row.__v ? (
          <span className="ml-1.5 text-slate-500">({row.__v})</span>
        ) : null}
      </p>
      <div className="space-y-1">
        {payload
          .filter((p) => p.value !== null && p.value !== undefined)
          .map((p) => {
            const model = p.dataKey as ModelType;
            const metaRaw = row[`${model}_meta`];
            const meta =
              metaRaw && typeof metaRaw === "object"
                ? (metaRaw as PivotMeta)
                : null;
            const color = MODEL_COLORS[model] ?? "#94a3b8";
            return (
              <div key={model} className="flex items-center gap-2 text-xs">
                <span
                  className="inline-block h-2 w-2 rounded-full"
                  style={{ backgroundColor: color }}
                  aria-hidden="true"
                />
                <span className="text-slate-300">{MODEL_NAMES[model]}</span>
                <span className="ml-auto font-semibold tabular-nums text-slate-100">
                  {(p.value as number).toFixed(1)}%
                </span>
                {meta ? (
                  <span className="text-slate-500 tabular-nums">
                    · {meta.tiles}타일 · {meta.turns}턴 · ${meta.cost.toFixed(2)}
                  </span>
                ) : null}
              </div>
            );
          })}
      </div>
    </div>
  );
}
