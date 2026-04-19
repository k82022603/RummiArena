/**
 * RoundHistoryTable 포맷 함수 (ADR 45 §4.1)
 */

export const fmtPlaceRate = (v: number): string =>
  v === 0 ? "—" : `${(v * 100).toFixed(1)}%`;

export const fmtLatency = (ms: number): string =>
  ms === 0 ? "—" : `${Math.round(ms / 1000)}s`;

export const fmtCost = (usd: number): string => `$${usd.toFixed(3)}`;

export const fmtFallback = (n: number): string => (n === 0 ? "—" : String(n));

/** placeRate 컬러 클래스 (ADR 45 §5.3) */
export function placeRateColorClass(rate: number): string {
  if (rate >= 0.28) return "text-green-400 font-semibold";
  if (rate >= 0.2) return "text-yellow-400";
  return "text-red-400";
}
