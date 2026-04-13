"use client";

import type { ModelType, PromptVersion, TournamentFilterState } from "@/lib/types";
import { DEFAULT_TOURNAMENT_FILTER } from "@/lib/types";
import {
  DEFAULT_AVAILABLE_MODELS,
  DEFAULT_AVAILABLE_ROUNDS,
  MODEL_COLORS,
  MODEL_NAMES,
} from "./constants";

interface TournamentFilterProps {
  value: TournamentFilterState;
  onChange: (next: TournamentFilterState) => void;
  availableModels?: ModelType[];
  availableRounds?: string[];
}

const PROMPT_OPTIONS: Array<{ value: "all" | PromptVersion; label: string }> = [
  { value: "all", label: "전체" },
  { value: "v1", label: "v1" },
  { value: "v2", label: "v2" },
  { value: "v3", label: "v3" },
];

export default function TournamentFilter({
  value,
  onChange,
  availableModels = DEFAULT_AVAILABLE_MODELS,
  availableRounds = DEFAULT_AVAILABLE_ROUNDS,
}: TournamentFilterProps) {
  const toggleModel = (model: ModelType) => {
    const next = value.selectedModels.includes(model)
      ? value.selectedModels.filter((m) => m !== model)
      : [...value.selectedModels, model];
    onChange({ ...value, selectedModels: next });
  };

  const updateRoundStart = (start: string) => {
    onChange({ ...value, roundRange: [start, value.roundRange[1]] });
  };

  const updateRoundEnd = (end: string) => {
    onChange({ ...value, roundRange: [value.roundRange[0], end] });
  };

  const updatePromptVersion = (pv: "all" | PromptVersion) => {
    onChange({ ...value, promptVersion: pv });
  };

  const reset = () => onChange(DEFAULT_TOURNAMENT_FILTER);

  return (
    <section
      aria-label="토너먼트 필터"
      className="bg-slate-800 border border-slate-700 rounded-lg p-5 mb-6"
    >
      <div className="flex flex-wrap items-center gap-6">
        {/* 모델 체크박스 */}
        <div
          role="group"
          aria-label="표시할 모델"
          className="flex flex-wrap items-center gap-3"
        >
          <span className="text-xs font-semibold uppercase tracking-wide text-slate-400">
            모델
          </span>
          {availableModels.map((model) => {
            const checked = value.selectedModels.includes(model);
            return (
              <label
                key={model}
                className="flex items-center gap-2 cursor-pointer select-none"
              >
                <input
                  type="checkbox"
                  checked={checked}
                  onChange={() => toggleModel(model)}
                  aria-label={`${MODEL_NAMES[model]} 표시`}
                  className="accent-slate-500 w-4 h-4"
                />
                <span
                  aria-hidden="true"
                  className="w-3 h-3 rounded-sm flex-shrink-0"
                  style={{ backgroundColor: MODEL_COLORS[model] }}
                />
                <span
                  className={`text-sm ${
                    checked ? "text-slate-200" : "text-slate-500"
                  }`}
                >
                  {MODEL_NAMES[model]}
                </span>
              </label>
            );
          })}
        </div>

        {/* 라운드 드롭다운 */}
        <div className="flex items-center gap-2">
          <span className="text-xs font-semibold uppercase tracking-wide text-slate-400">
            라운드
          </span>
          <select
            aria-label="시작 라운드"
            value={value.roundRange[0]}
            onChange={(e) => updateRoundStart(e.target.value)}
            className="bg-slate-900 border border-slate-700 rounded-md px-2 py-1 text-sm text-slate-200"
          >
            {availableRounds.map((r) => (
              <option key={r} value={r}>
                {r}
              </option>
            ))}
          </select>
          <span className="text-slate-500" aria-hidden="true">
            ~
          </span>
          <select
            aria-label="종료 라운드"
            value={value.roundRange[1]}
            onChange={(e) => updateRoundEnd(e.target.value)}
            className="bg-slate-900 border border-slate-700 rounded-md px-2 py-1 text-sm text-slate-200"
          >
            {availableRounds.map((r) => (
              <option key={r} value={r}>
                {r}
              </option>
            ))}
          </select>
        </div>

        {/* 프롬프트 버전 세그먼트 */}
        <div
          role="radiogroup"
          aria-label="프롬프트 버전"
          className="flex items-center gap-1 bg-slate-900 border border-slate-700 rounded-md p-1"
        >
          {PROMPT_OPTIONS.map((opt) => {
            const active = value.promptVersion === opt.value;
            return (
              <button
                key={opt.value}
                type="button"
                role="radio"
                aria-checked={active}
                onClick={() => updatePromptVersion(opt.value)}
                className={`px-3 py-1 text-xs font-medium rounded transition-colors ${
                  active
                    ? "bg-slate-700 text-white"
                    : "text-slate-400 hover:text-slate-200"
                }`}
              >
                {opt.label}
              </button>
            );
          })}
        </div>

        {/* 초기화 */}
        <button
          type="button"
          onClick={reset}
          className="ml-auto px-3 py-1.5 text-xs font-medium text-slate-400 hover:text-white border border-slate-700 rounded-md transition-colors"
        >
          초기화
        </button>
      </div>
    </section>
  );
}
