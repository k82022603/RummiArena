/**
 * RoundHistory 통계 유틸 (ADR 45 §6.5)
 */
import type { RoundHistoryEntry, RoundHistoryStats } from "./types";

export function computeStats(entries: RoundHistoryEntry[]): RoundHistoryStats {
  if (entries.length === 0) {
    return {
      count: 0,
      avgPlaceRate: 0,
      stdDevPlaceRate: 0,
      medianPlaceRate: 0,
      totalCostUsd: 0,
      avgFallbackCount: 0,
      avgLatencyMs: 0,
    };
  }

  const rates = entries.map((e) => e.placeRate);
  const avg = rates.reduce((a, b) => a + b, 0) / rates.length;
  const variance =
    rates.reduce((a, b) => a + (b - avg) ** 2, 0) / rates.length;
  const sorted = [...rates].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  const median =
    sorted.length % 2 === 0
      ? (sorted[mid - 1] + sorted[mid]) / 2
      : sorted[mid];

  const latencyEntries = entries.filter((e) => e.avgLatencyMs > 0);
  const avgLatencyMs =
    latencyEntries.length > 0
      ? latencyEntries.reduce((a, e) => a + e.avgLatencyMs, 0) /
        latencyEntries.length
      : 0;

  const avgFallbackCount =
    entries.reduce((a, e) => a + e.fallbackCount, 0) / entries.length;

  return {
    count: entries.length,
    avgPlaceRate: avg,
    stdDevPlaceRate: Math.sqrt(variance),
    medianPlaceRate: median,
    totalCostUsd: entries.reduce((a, e) => a + e.costUsd, 0),
    avgFallbackCount,
    avgLatencyMs,
  };
}
