"use client";

/**
 * RoundHistoryDetailModal — 행 클릭 시 상세 모달 (ADR 45 §6.3)
 *
 * - role="dialog", aria-modal="true" 접근성 준수
 * - ESC 키, 배경 클릭, 닫기 버튼으로 닫기
 */

import { useEffect, useCallback } from "react";
import type { RoundHistoryEntry } from "@/lib/types";
import { ModelBadge } from "./ModelBadge";
import { VariantTag } from "./VariantTag";
import { fmtPlaceRate, fmtLatency, fmtCost, fmtFallback, placeRateColorClass } from "@/lib/formatters";

interface RoundHistoryDetailModalProps {
  entry: RoundHistoryEntry;
  isOpen: boolean;
  onClose: () => void;
}

export function RoundHistoryDetailModal({
  entry,
  isOpen,
  onClose,
}: RoundHistoryDetailModalProps) {
  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    },
    [onClose],
  );

  useEffect(() => {
    if (isOpen) {
      document.addEventListener("keydown", handleKeyDown);
      return () => document.removeEventListener("keydown", handleKeyDown);
    }
  }, [isOpen, handleKeyDown]);

  if (!isOpen) return null;

  const labelId = `modal-title-${entry.roundId}`;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      aria-modal="true"
      role="dialog"
      aria-labelledby={labelId}
    >
      {/* 배경 오버레이 */}
      <div
        className="absolute inset-0 bg-black/60 backdrop-blur-sm"
        onClick={onClose}
        aria-hidden="true"
      />

      {/* 모달 컨텐츠 */}
      <div className="relative z-10 w-full max-w-lg rounded-xl bg-slate-800 border border-slate-600 shadow-2xl">
        {/* 헤더 */}
        <div className="flex items-start justify-between p-5 border-b border-slate-700">
          <div>
            <h2
              id={labelId}
              className="text-lg font-bold text-white"
            >
              {entry.roundId}
            </h2>
            <p className="text-sm text-slate-400 mt-0.5">{entry.date}</p>
            <div className="flex gap-2 mt-2">
              <ModelBadge model={entry.model} />
              <VariantTag variant={entry.variant} />
              <span className="text-xs text-slate-400 self-center">
                Run #{entry.runNumber}
              </span>
            </div>
          </div>
          <button
            onClick={onClose}
            className="text-slate-400 hover:text-white transition-colors p-1 rounded"
            aria-label="모달 닫기"
          >
            <svg
              className="w-5 h-5"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              aria-hidden="true"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M6 18L18 6M6 6l12 12"
              />
            </svg>
          </button>
        </div>

        {/* 성과 섹션 */}
        <div className="p-5 space-y-4">
          <section aria-label="성과 지표">
            <h3 className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-3">
              성과
            </h3>
            <div className="grid grid-cols-3 gap-3">
              <div className="bg-slate-700/50 rounded-lg p-3">
                <p className="text-xs text-slate-400">Place Rate</p>
                <p
                  className={`text-xl font-bold mt-1 ${placeRateColorClass(entry.placeRate)}`}
                >
                  {fmtPlaceRate(entry.placeRate)}
                </p>
              </div>
              <div className="bg-slate-700/50 rounded-lg p-3">
                <p className="text-xs text-slate-400">Place Count</p>
                <p className="text-xl font-bold text-white mt-1">
                  {entry.placeCount}
                </p>
              </div>
              <div className="bg-slate-700/50 rounded-lg p-3">
                <p className="text-xs text-slate-400">Tile Count</p>
                <p className="text-xl font-bold text-white mt-1">
                  {entry.tileCount || "—"}
                </p>
              </div>
            </div>
          </section>

          {/* 성능 섹션 */}
          <section aria-label="성능 지표">
            <h3 className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-3">
              성능
            </h3>
            <div className="grid grid-cols-2 gap-3">
              <div className="bg-slate-700/50 rounded-lg p-3">
                <p className="text-xs text-slate-400">Fallback</p>
                <p className="text-lg font-semibold text-white mt-1">
                  {fmtFallback(entry.fallbackCount)}
                </p>
              </div>
              <div className="bg-slate-700/50 rounded-lg p-3">
                <p className="text-xs text-slate-400">Elapsed</p>
                <p className="text-lg font-semibold text-white mt-1">
                  {entry.elapsedSec > 0 ? `${entry.elapsedSec}s` : "—"}
                </p>
              </div>
              <div className="bg-slate-700/50 rounded-lg p-3">
                <p className="text-xs text-slate-400">Avg Latency</p>
                <p className="text-lg font-semibold text-white mt-1">
                  {fmtLatency(entry.avgLatencyMs)}
                </p>
              </div>
              <div className="bg-slate-700/50 rounded-lg p-3">
                <p className="text-xs text-slate-400">Max Latency</p>
                <p className="text-lg font-semibold text-white mt-1">
                  {fmtLatency(entry.maxLatencyMs)}
                </p>
              </div>
            </div>
          </section>

          {/* 비용 섹션 */}
          <section aria-label="비용">
            <h3 className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-3">
              비용
            </h3>
            <div className="bg-slate-700/50 rounded-lg p-3">
              <p className="text-2xl font-bold text-white">
                {fmtCost(entry.costUsd)}
              </p>
            </div>
          </section>

          {/* codePathNote */}
          {entry.codePathNote && (
            <section aria-label="코드 경로 메모">
              <h3 className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">
                코드 경로
              </h3>
              <p className="text-sm text-slate-300 bg-slate-700/30 rounded p-2 font-mono">
                {entry.codePathNote}
              </p>
            </section>
          )}
        </div>

        {/* 푸터 — 턴 로그 링크 */}
        <div className="px-5 pb-5">
          {entry.turnLogUrl ? (
            <a
              href={entry.turnLogUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 text-sm text-blue-400 hover:text-blue-300 transition-colors"
            >
              턴 로그 보기
              <svg
                className="w-4 h-4"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                aria-hidden="true"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14"
                />
              </svg>
            </a>
          ) : (
            <span className="text-sm text-slate-600">턴 로그 없음</span>
          )}
        </div>
      </div>
    </div>
  );
}
