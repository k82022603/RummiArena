"use client";

import type { ModelType } from "@/lib/types";
import { MODEL_COLORS, MODEL_MARKERS, MODEL_NAMES } from "./constants";

interface ModelLegendProps {
  selectedModels: ModelType[];
  showPromptVersion?: boolean;
  showCompletion?: boolean;
}

/** 마커 형태별 SVG 렌더 (색약 보조) */
function MarkerIcon({ type, color }: { type: ModelType; color: string }) {
  const shape = MODEL_MARKERS[type];
  if (shape === "circle") {
    return (
      <svg width="12" height="12" viewBox="0 0 12 12" aria-hidden="true">
        <circle cx="6" cy="6" r="5" fill={color} />
      </svg>
    );
  }
  if (shape === "square") {
    return (
      <svg width="12" height="12" viewBox="0 0 12 12" aria-hidden="true">
        <rect x="1" y="1" width="10" height="10" fill={color} />
      </svg>
    );
  }
  if (shape === "triangle") {
    return (
      <svg width="12" height="12" viewBox="0 0 12 12" aria-hidden="true">
        <polygon points="6,1 11,11 1,11" fill={color} />
      </svg>
    );
  }
  return (
    <svg width="12" height="12" viewBox="0 0 12 12" aria-hidden="true">
      <polygon points="6,1 11,6 6,11 1,6" fill={color} />
    </svg>
  );
}

export default function ModelLegend({
  selectedModels,
  showPromptVersion = true,
  showCompletion = true,
}: ModelLegendProps) {
  const active = selectedModels.length > 0
    ? (["openai", "claude", "deepseek", "ollama"] as ModelType[]).filter((m) =>
        selectedModels.includes(m),
      )
    : (["openai", "claude", "deepseek", "ollama"] as ModelType[]);

  return (
    <div
      role="group"
      aria-label="차트 범례"
      className="flex flex-wrap items-center gap-x-5 gap-y-2 text-xs text-slate-400 mt-4"
    >
      {active.map((m) => (
        <span key={m} className="flex items-center gap-1.5">
          <MarkerIcon type={m} color={MODEL_COLORS[m]} />
          <span>{MODEL_NAMES[m]}</span>
        </span>
      ))}

      {showPromptVersion && (
        <span className="flex items-center gap-3 pl-3 border-l border-slate-700">
          <span className="flex items-center gap-1.5">
            <svg width="20" height="6" aria-hidden="true">
              <line
                x1="0"
                y1="3"
                x2="20"
                y2="3"
                stroke="#94A3B8"
                strokeWidth="2"
                strokeDasharray="4 2"
              />
            </svg>
            <span>v1 프롬프트</span>
          </span>
          <span className="flex items-center gap-1.5">
            <svg width="20" height="6" aria-hidden="true">
              <line x1="0" y1="3" x2="20" y2="3" stroke="#94A3B8" strokeWidth="2" />
            </svg>
            <span>v2 프롬프트</span>
          </span>
        </span>
      )}

      {showCompletion && (
        <span className="flex items-center gap-3 pl-3 border-l border-slate-700">
          <span className="flex items-center gap-1.5">
            <svg width="12" height="12" viewBox="0 0 12 12" aria-hidden="true">
              <circle cx="6" cy="6" r="4" fill="none" stroke="#94A3B8" strokeWidth="2" />
            </svg>
            <span>미완주</span>
          </span>
          <span className="flex items-center gap-1.5">
            <svg width="12" height="12" viewBox="0 0 12 12" aria-hidden="true">
              <circle cx="6" cy="6" r="5" fill="#94A3B8" />
            </svg>
            <span>완주</span>
          </span>
        </span>
      )}
    </div>
  );
}
