/**
 * Playtest S4 admin UI 상수
 *
 * 색각 안전 팔레트는 designer-1 §38 Okabe-Ito 권장값을 인라인으로 사용한다.
 * (admin 전역 tailwind 토큰은 frontend 측에 정의되어 있으나 admin 패키지엔 미포함이라
 *  중복을 피하기 위해 색을 직접 적는다.)
 */

import type { RunStatus } from "@/lib/playtest-s4-data";

export const CVD = {
  success: "#009E73", // Bluish Green
  info: "#56B4E9", // Sky Blue
  warning: "#E69F00", // Orange
  error: "#D55E00", // Vermillion
  neutral: "#94A3B8", // slate-400
} as const;

export interface StatusVisual {
  label: string;
  color: string;
  icon: string;
  textClass: string;
  bgClass: string;
}

export const STATUS_VISUAL: Record<RunStatus, StatusVisual> = {
  PASS: {
    label: "PASS",
    color: CVD.success,
    icon: "✓",
    textClass: "text-emerald-300",
    bgClass: "bg-emerald-500/15 border-emerald-500/40",
  },
  FAIL: {
    label: "FAIL",
    color: CVD.error,
    icon: "✗",
    textClass: "text-rose-300",
    bgClass: "bg-rose-500/15 border-rose-500/40",
  },
  ERROR: {
    label: "ERROR",
    color: CVD.warning,
    icon: "⚠",
    textClass: "text-amber-300",
    bgClass: "bg-amber-500/15 border-amber-500/40",
  },
  RUNNING: {
    label: "RUNNING",
    color: CVD.neutral,
    icon: "⟳",
    textClass: "text-slate-300",
    bgClass: "bg-slate-500/15 border-slate-500/40",
  },
};

export const PRIORITY_BADGE: Record<string, string> = {
  P0: "bg-rose-500/15 text-rose-300 border-rose-500/40",
  P1: "bg-amber-500/15 text-amber-300 border-amber-500/40",
  P2: "bg-sky-500/15 text-sky-300 border-sky-500/40",
};

export const RECENT_SEEDS_KEY = "playtest-s4:recent-seeds";
export const RECENT_SEEDS_MAX = 10;
