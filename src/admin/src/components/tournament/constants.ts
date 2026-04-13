/**
 * AI 토너먼트 대시보드 — 디자인 토큰 및 색상 맵
 *
 * 스펙: docs/02-design/33-ai-tournament-dashboard-component-spec.md §7
 *
 * - 루미큐브 4색은 "모델"을 나타냄 (데이터)
 * - 한복 팔레트는 "UI 상태"를 나타냄 (시스템)
 * - 두 색 체계는 겹치지 않도록 분리한다.
 */

import type { ModelType, ModelGrade, TournamentStatus } from "@/lib/types";

/** 모델별 주색상 (루미큐브 타일 4색 재활용) */
export const MODEL_COLORS: Record<ModelType, string> = {
  openai: "#E74C3C", // Red — GPT
  claude: "#3498DB", // Blue — Claude
  deepseek: "#F1C40F", // Yellow — DeepSeek
  ollama: "#7F8C8D", // Gray — Ollama
};

/** 모델별 보조색상 (차트 그라데이션, 호버 배경) */
export const MODEL_COLORS_LIGHT: Record<ModelType, string> = {
  openai: "#FF6B6B",
  claude: "#5DADE2",
  deepseek: "#F7DC6F",
  ollama: "#BDC3C7",
};

/** 모델 표시 이름 */
export const MODEL_NAMES: Record<ModelType, string> = {
  openai: "GPT-5-mini",
  claude: "Claude Sonnet 4",
  deepseek: "DeepSeek Reasoner",
  ollama: "Ollama qwen2.5:3b",
};

/** 모델 마커 형태 (색약 보조) */
export const MODEL_MARKERS: Record<ModelType, "circle" | "square" | "triangle" | "diamond"> = {
  openai: "circle",
  claude: "square",
  deepseek: "triangle",
  ollama: "diamond",
};

/** 등급별 Tailwind 클래스 */
export const GRADE_COLORS: Record<ModelGrade, string> = {
  "A+": "bg-emerald-500/15 text-emerald-400 border-emerald-500/30",
  A: "bg-emerald-500/15 text-emerald-400 border-emerald-500/30",
  B: "bg-yellow-500/15 text-yellow-400 border-yellow-500/30",
  C: "bg-orange-500/15 text-orange-400 border-orange-500/30",
  D: "bg-red-500/15 text-red-400 border-red-500/30",
  F: "bg-slate-500/15 text-slate-400 border-slate-500/30",
};

/** 상태별 Tailwind 클래스 */
export const STATUS_COLORS: Record<TournamentStatus, string> = {
  COMPLETED: "bg-emerald-500/15 text-emerald-400 border-emerald-500/30",
  WS_TIMEOUT: "bg-yellow-500/15 text-yellow-400 border-yellow-500/30",
  WS_CLOSED: "bg-red-500/15 text-red-400 border-red-500/30",
  UNKNOWN: "bg-slate-500/15 text-slate-400 border-slate-500/30",
};

/** 상태별 한글 라벨 */
export const STATUS_LABELS: Record<TournamentStatus, string> = {
  COMPLETED: "완주",
  WS_TIMEOUT: "타임아웃",
  WS_CLOSED: "WS 종료",
  UNKNOWN: "불명",
};

/** 필터 드롭다운에 노출할 기본 라운드 목록 */
export const DEFAULT_AVAILABLE_ROUNDS: string[] = [
  "R2",
  "R3",
  "R4",
  "R4v2",
  "R5-DS-run1",
  "R5-DS-run2",
  "R5-DS-run3",
  "R5-GPT-run3",
  "R5-CL-run3",
];

/** 필터에 노출할 모델 목록 (ollama는 기본 비선택) */
export const DEFAULT_AVAILABLE_MODELS: ModelType[] = [
  "openai",
  "claude",
  "deepseek",
  "ollama",
];
