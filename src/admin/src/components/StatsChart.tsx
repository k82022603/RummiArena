"use client";

import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Cell,
} from "recharts";
import type { AiModelStats } from "@/lib/types";

interface StatsChartProps {
  data: AiModelStats[];
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function formatTooltip(value: any): [string, string] {
  const num = typeof value === "number" ? value : parseFloat(String(value ?? 0));
  return [`${num.toFixed(1)}%`, "승률"];
}

export default function StatsChart({ data }: StatsChartProps) {
  return (
    <div className="w-full h-72" role="img" aria-label="AI 모델별 승률 바 차트">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} margin={{ top: 8, right: 16, left: 0, bottom: 8 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
          <XAxis
            dataKey="model"
            tick={{ fill: "#94a3b8", fontSize: 13 }}
            axisLine={{ stroke: "#475569" }}
            tickLine={false}
          />
          <YAxis
            tickFormatter={(v: number) => `${v}%`}
            tick={{ fill: "#94a3b8", fontSize: 12 }}
            axisLine={false}
            tickLine={false}
            domain={[0, 100]}
          />
          <Tooltip
            contentStyle={{ backgroundColor: "#1e293b", border: "1px solid #475569", borderRadius: 8 }}
            labelStyle={{ color: "#e2e8f0", fontWeight: 600 }}
            itemStyle={{ color: "#94a3b8" }}
            formatter={formatTooltip}
          />
          <Bar dataKey="winRate" radius={[4, 4, 0, 0]}>
            {data.map((entry) => (
              <Cell key={entry.model} fill={entry.color} />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
