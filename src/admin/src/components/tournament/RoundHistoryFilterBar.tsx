"use client";

/**
 * RoundHistoryFilterBar — 필터 바 (ADR 45 §6.2)
 *
 * - Round / Model / Variant 드롭다운 (체크박스 멀티셀렉트)
 * - 날짜 범위 (dateFrom / dateTo)
 * - 초기화 버튼
 * - URL 쿼리 동기화는 부모(RoundHistoryTable)가 담당
 */

import { useState, useRef, useEffect } from "react";
import type {
  RoundHistoryFilter,
  RoundHistoryModelType,
  VariantType,
} from "@/lib/types";
import { ModelBadge } from "./ModelBadge";
import { VariantTag } from "./VariantTag";

const AVAILABLE_ROUNDS = [
  "R2",
  "R3",
  "R4",
  "R5-Run1",
  "R5-Run2",
  "R5-Run3",
  "R6-P2-Run1",
  "R7-fixture",
  "R9-P1",
  "R9-P2",
  "R9-P3",
  "R9-P4",
  "R10-v2-Run2",
  "R10-v2-Run3",
  "R10-v3-Run1",
  "R10-v3-Run2",
  "R10-v3-Run3",
];

const AVAILABLE_MODELS: RoundHistoryModelType[] = [
  "deepseek",
  "gpt-5-mini",
  "claude-sonnet-4",
  "ollama",
];

const AVAILABLE_VARIANTS: VariantType[] = [
  "v1",
  "v2",
  "v2-zh",
  "v3",
  "v4",
  "v4.1",
  "v5",
  "v5.1",
];

interface MultiSelectDropdownProps<T extends string> {
  label: string;
  options: T[];
  selected: T[];
  onChange: (values: T[]) => void;
  renderOption?: (value: T) => React.ReactNode;
}

function MultiSelectDropdown<T extends string>({
  label,
  options,
  selected,
  onChange,
  renderOption,
}: MultiSelectDropdownProps<T>) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  function toggle(value: T) {
    if (selected.includes(value)) {
      onChange(selected.filter((v) => v !== value));
    } else {
      onChange([...selected, value]);
    }
  }

  const activeCount = selected.length;

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((prev) => !prev)}
        aria-expanded={open}
        aria-haspopup="listbox"
        className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-md border transition-colors ${
          activeCount > 0
            ? "bg-blue-900/40 border-blue-500/50 text-blue-300"
            : "bg-slate-700 border-slate-600 text-slate-300 hover:border-slate-500"
        }`}
      >
        {label}
        {activeCount > 0 && (
          <span className="bg-blue-500 text-white text-[10px] rounded-full w-4 h-4 flex items-center justify-center">
            {activeCount}
          </span>
        )}
        <svg
          className={`w-3 h-3 transition-transform ${open ? "rotate-180" : ""}`}
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          aria-hidden="true"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M19 9l-7 7-7-7"
          />
        </svg>
      </button>

      {open && (
        <div
          role="listbox"
          aria-multiselectable="true"
          aria-label={`${label} 필터 선택`}
          className="absolute top-full mt-1 left-0 z-30 min-w-[160px] bg-slate-800 border border-slate-600 rounded-lg shadow-xl py-1"
        >
          {options.map((opt) => (
            <label
              key={opt}
              role="option"
              aria-selected={selected.includes(opt)}
              className="flex items-center gap-2 px-3 py-1.5 hover:bg-slate-700 cursor-pointer text-xs"
            >
              <input
                type="checkbox"
                checked={selected.includes(opt)}
                onChange={() => toggle(opt)}
                className="w-3 h-3 rounded border-slate-500 bg-slate-700 checked:bg-blue-500"
                aria-label={String(opt)}
              />
              {renderOption ? renderOption(opt) : (
                <span className="text-slate-300">{opt}</span>
              )}
            </label>
          ))}
        </div>
      )}
    </div>
  );
}

interface RoundHistoryFilterBarProps {
  filter: RoundHistoryFilter;
  onChange: (filter: RoundHistoryFilter) => void;
  onReset: () => void;
}

export function RoundHistoryFilterBar({
  filter,
  onChange,
  onReset,
}: RoundHistoryFilterBarProps) {
  const hasActiveFilter =
    filter.roundIds.length > 0 ||
    filter.models.length > 0 ||
    filter.variants.length > 0 ||
    !!filter.dateFrom ||
    !!filter.dateTo;

  return (
    <div
      className="flex flex-wrap items-center gap-2 mb-4"
      role="search"
      aria-label="라운드 히스토리 필터"
    >
      {/* Round 드롭다운 */}
      <MultiSelectDropdown
        label="Round"
        options={AVAILABLE_ROUNDS}
        selected={filter.roundIds}
        onChange={(roundIds) => onChange({ ...filter, roundIds })}
        renderOption={(r) => (
          <span className="text-slate-300 font-mono">{r}</span>
        )}
      />

      {/* Model 드롭다운 */}
      <MultiSelectDropdown<RoundHistoryModelType>
        label="Model"
        options={AVAILABLE_MODELS}
        selected={filter.models}
        onChange={(models) => onChange({ ...filter, models })}
        renderOption={(m) => <ModelBadge model={m} />}
      />

      {/* Variant 드롭다운 */}
      <MultiSelectDropdown<VariantType>
        label="Variant"
        options={AVAILABLE_VARIANTS}
        selected={filter.variants}
        onChange={(variants) => onChange({ ...filter, variants })}
        renderOption={(v) => <VariantTag variant={v} />}
      />

      {/* 날짜 범위 */}
      <div className="flex items-center gap-1.5">
        <input
          type="date"
          value={filter.dateFrom ?? ""}
          onChange={(e) =>
            onChange({ ...filter, dateFrom: e.target.value || undefined })
          }
          className="bg-slate-700 border border-slate-600 text-slate-300 text-xs rounded px-2 py-1.5 focus:outline-none focus:border-blue-500"
          aria-label="시작일 필터"
        />
        <span className="text-slate-500 text-xs">~</span>
        <input
          type="date"
          value={filter.dateTo ?? ""}
          onChange={(e) =>
            onChange({ ...filter, dateTo: e.target.value || undefined })
          }
          className="bg-slate-700 border border-slate-600 text-slate-300 text-xs rounded px-2 py-1.5 focus:outline-none focus:border-blue-500"
          aria-label="종료일 필터"
        />
      </div>

      {/* 초기화 */}
      {hasActiveFilter && (
        <button
          type="button"
          onClick={onReset}
          className="px-3 py-1.5 text-xs text-slate-400 hover:text-white border border-slate-600 hover:border-slate-400 rounded-md transition-colors"
          aria-label="모든 필터 초기화"
        >
          초기화
        </button>
      )}
    </div>
  );
}
