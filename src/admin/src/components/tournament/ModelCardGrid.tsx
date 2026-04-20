"use client";

/**
 * ModelCardGrid — 대시보드 PR 4 skeleton
 *
 * 스펙: docs/02-design/33-ai-tournament-dashboard-component-spec.md §4.6
 * 실행 계획: docs/01-planning/20-sprint6-day4-execution-plan.md §3
 *
 * ## 이번 PR의 범위 (skeleton)
 * - 모델 카드 5개 렌더 (OpenAI / Claude / DeepSeek / DashScope / Ollama)
 * - 각 카드: 색상 바 + 모델명 + 등급 배지 + place rate + fallback count + cost/turn
 *   + sparkline + "최근 대전 보기" 링크 (placeholder href)
 * - 반응형 grid: mobile 1col / tablet 2col / desktop 3col (shell layout 일관성)
 * - 기본 정렬: place rate 내림차순
 * - **Mock 데이터 내장** (`MOCK_MODEL_CARDS`) — 실제 API 연결은 Round 6 리포트 이후 PR
 *
 * ## 범위 밖 (후속 PR)
 * - TournamentSummary 필터(selectedModels) 완전 연동 — filteredCards 매핑은 이미
 *   TournamentPageClient에서 수행되지만, 본 skeleton은 mock fallback을 우선 제공해
 *   E2E와 디자인 검증이 API 유무와 무관하게 가능하도록 한다.
 * - Framer Motion stagger 애니메이션 (스펙 §8.2.1, 후속 PR에서 추가)
 * - GradeBadge / StatusBadge 공용 컴포넌트 분리 (skeleton에서는 inline)
 * - 클릭 시 라운드 상세 모달 (Sprint 7)
 *
 * ## 색각 안전 팔레트 메모 (docs/02-design/38 참조)
 * - OpenAI / Claude / DeepSeek / Ollama 는 `constants.ts`의 MODEL_COLORS 재활용
 * - DashScope는 ModelType에 아직 없으므로 스켈레톤 전용 stub color 사용:
 *   `#CC79A7` (Reddish Purple, Okabe-Ito 팔레트 — CVD 안전, 기존 4색과 충돌 없음)
 *   이유: Bluish Green `#009E73`는 playtest UI 상태색(isOver)과 의미 충돌,
 *        Orange `#E69F00`는 incompatible 경고색과 의미 충돌 → 중립 purple 선택
 * - DashScope가 ModelType에 편입되는 Sprint 7에서 constants.ts로 이관.
 */

import type { ModelType, ModelGrade, PromptVersion, TournamentStatus } from "@/lib/types";
import { MODEL_COLORS, MODEL_MARKERS, MODEL_NAMES, GRADE_COLORS, STATUS_COLORS, STATUS_LABELS } from "./constants";

// ============================================================================
// 로컬 타입 — ModelCardGrid 전용 (스펙 §4.6 ModelLatestStats의 부분 집합 + 확장)
// ============================================================================

/**
 * 카드 1장에 필요한 데이터.
 *
 * 스펙 §4.6의 `ModelLatestStats`를 확장 — skeleton 단계에서는 DashScope 같은
 * **ModelType 미편입 모델**도 렌더해야 하므로 `modelKey`를 string으로 열어둔다.
 * 색상/마커는 MODEL_COLORS에 키가 있으면 재활용, 없으면 stub으로 대체.
 */
export interface ModelCardEntry {
  /** openai / claude / deepseek / ollama / dashscope 등. MODEL_COLORS 키와 매칭 시 재활용. */
  modelKey: string;
  modelName: string;
  latestRound: string;
  latestRate: number;
  grade: ModelGrade;
  /** fallback 횟수 (재요청 3회 실패 → draw 강제 전환 누적) */
  fallbackCount: number;
  costPerTurn: number;
  avgResponseTimeSec: number;
  totalTilesPlaced: number;
  completed: boolean;
  promptVersion: PromptVersion;
  /** 라운드별 Place Rate 시계열. null = 데이터 없음. */
  sparkline: (number | null)[];
  /** "최근 대전 보기" 링크. skeleton 단계에서는 placeholder. */
  recentBattleHref: string;
}

interface ModelCardGridProps {
  /** 비어 있으면 MOCK_MODEL_CARDS로 fallback (skeleton 단계 전용 동작) */
  cards?: ModelCardEntry[];
  /**
   * 현재 필터에서 선택된 modelKey 목록.
   * 포함되지 않은 카드는 opacity-40 grayscale 처리 (스펙 §4.6).
   * 비어 있거나 미전달 시 모든 카드를 active로 간주.
   */
  selectedModelKeys?: string[];
  /** place rate 내림차순 정렬 여부 (default: true) */
  sortByPlaceRateDesc?: boolean;
}

// ============================================================================
// DashScope stub 색상 — 색각 안전 Okabe-Ito 팔레트
// docs/02-design/38-colorblind-safe-palette.md §4 표 참조
// ============================================================================

const DASHSCOPE_STUB_COLOR = "#CC79A7"; // Reddish Purple

/** modelKey → 색상 (stub 포함) */
function resolveColor(modelKey: string): string {
  if (modelKey in MODEL_COLORS) return MODEL_COLORS[modelKey as ModelType];
  if (modelKey === "dashscope") return DASHSCOPE_STUB_COLOR;
  return "#64748B"; // slate-500 fallback
}

/** modelKey → 표시명 */
function resolveName(modelKey: string, fallback: string): string {
  if (modelKey in MODEL_NAMES) return MODEL_NAMES[modelKey as ModelType];
  return fallback;
}

// ============================================================================
// Mock 데이터 — Round 4~5 실측 + DashScope 는 placeholder
// ============================================================================

/**
 * skeleton 단계 전용 mock.
 *
 * 실측값 출처:
 * - OpenAI GPT-5-mini: Round 4v2 (docs/04-testing/47)
 * - Claude Sonnet 4: Round 4 (R4)
 * - DeepSeek Reasoner: Round 5 Run 3 (timeout 500s)
 * - Ollama qwen2.5:3b: Round 4 (성능 낮음, 0%대)
 * - DashScope qwen3-max: Round 6 Phase 2에서 첫 측정 예정 → 현재는 추정치
 *
 * Round 6 완료 후 실제 API `GET /admin/stats/ai/tournament`로 교체.
 */
export const MOCK_MODEL_CARDS: ModelCardEntry[] = [
  {
    modelKey: "openai",
    modelName: "GPT-5-mini",
    latestRound: "R4v2",
    latestRate: 30.8,
    grade: "A+",
    fallbackCount: 2,
    costPerTurn: 0.025,
    avgResponseTimeSec: 64.6,
    totalTilesPlaced: 29,
    completed: true,
    promptVersion: "v2",
    sparkline: [28.0, null, 33.3, 30.8],
    recentBattleHref: "#/tournament/R4v2/openai",
  },
  {
    modelKey: "claude",
    modelName: "Claude Sonnet 4",
    latestRound: "R5-CL-run3",
    latestRate: 20.0,
    grade: "A",
    fallbackCount: 3,
    costPerTurn: 0.074,
    avgResponseTimeSec: 83.1,
    totalTilesPlaced: 10,
    completed: false,
    promptVersion: "v2",
    sparkline: [23.0, null, 20.0, 20.0],
    recentBattleHref: "#/tournament/R5-CL-run3/claude",
  },
  {
    modelKey: "deepseek",
    modelName: "DeepSeek Reasoner",
    latestRound: "R5-DS-run3",
    latestRate: 30.8,
    grade: "A+",
    fallbackCount: 0,
    costPerTurn: 0.001,
    avgResponseTimeSec: 211.0,
    totalTilesPlaced: 32,
    completed: true,
    promptVersion: "v2",
    sparkline: [5.0, 12.5, 23.1, 30.8],
    recentBattleHref: "#/tournament/R5-DS-run3/deepseek",
  },
  {
    // DashScope는 현재 ModelType에 없음 — skeleton 전용 stub
    modelKey: "dashscope",
    modelName: "DashScope qwen3-max",
    latestRound: "R6-pending",
    latestRate: 0.0,
    grade: "C",
    fallbackCount: 0,
    costPerTurn: 0.02,
    avgResponseTimeSec: 0,
    totalTilesPlaced: 0,
    completed: false,
    promptVersion: "v3",
    sparkline: [null, null, null, null],
    recentBattleHref: "#/tournament/R6-pending/dashscope",
  },
  {
    modelKey: "ollama",
    modelName: "Ollama qwen2.5:3b",
    latestRound: "R4",
    latestRate: 0.0,
    grade: "F",
    fallbackCount: 12,
    costPerTurn: 0,
    avgResponseTimeSec: 6.2,
    totalTilesPlaced: 0,
    completed: false,
    promptVersion: "v2",
    sparkline: [0, 0, 0, 0],
    recentBattleHref: "#/tournament/R4/ollama",
  },
];

// ============================================================================
// 내부 subcomponent — Sparkline (순수 SVG, recharts 의존성 없음)
// 스펙 §4.7 구현 지침 따름
// ============================================================================

interface SparklineProps {
  data: (number | null)[];
  color: string;
  width?: number;
  height?: number;
}

function Sparkline({ data, color, width = 200, height = 36 }: SparklineProps) {
  const validValues = data.filter((v): v is number => v !== null);
  if (validValues.length < 2) {
    return (
      <svg
        width="100%"
        height={height}
        viewBox={`0 0 ${width} ${height}`}
        aria-hidden="true"
        className="text-slate-600"
      >
        <line
          x1="0"
          y1={height / 2}
          x2={width}
          y2={height / 2}
          stroke="currentColor"
          strokeWidth="1"
          strokeDasharray="3 3"
        />
      </svg>
    );
  }

  const max = Math.max(...validValues, 1); // 0 division 방지
  const step = data.length > 1 ? width / (data.length - 1) : width;

  // 선분 path 생성 (null 은 gap)
  let d = "";
  let needMove = true;
  data.forEach((v, i) => {
    if (v === null) {
      needMove = true;
      return;
    }
    const x = i * step;
    const y = height - (v / max) * height;
    d += needMove ? `M ${x.toFixed(1)} ${y.toFixed(1)}` : ` L ${x.toFixed(1)} ${y.toFixed(1)}`;
    needMove = false;
  });

  // 포인트 원 (null 은 제외)
  const points = data
    .map((v, i) => (v === null ? null : { x: i * step, y: height - (v / max) * height }))
    .filter((p): p is { x: number; y: number } => p !== null);

  return (
    <svg
      width="100%"
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      preserveAspectRatio="none"
      aria-hidden="true"
    >
      <path d={d} stroke={color} strokeWidth="2" fill="none" strokeLinecap="round" />
      {points.map((p, i) => (
        <circle
          key={i}
          cx={p.x}
          cy={p.y}
          r={2.5}
          fill={color}
          stroke="#0f172a"
          strokeWidth="1"
        />
      ))}
    </svg>
  );
}

// ============================================================================
// 내부 subcomponent — ModelMarkerIcon (ModelLegend 로직 간소 복제)
// ============================================================================

function ModelMarkerIcon({ modelKey, color }: { modelKey: string; color: string }) {
  const shape =
    modelKey in MODEL_MARKERS ? MODEL_MARKERS[modelKey as ModelType] : "circle";
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
  if (shape === "diamond") {
    return (
      <svg width="12" height="12" viewBox="0 0 12 12" aria-hidden="true">
        <polygon points="6,1 11,6 6,11 1,6" fill={color} />
      </svg>
    );
  }
  return (
    <svg width="12" height="12" viewBox="0 0 12 12" aria-hidden="true">
      <circle cx="6" cy="6" r="5" fill={color} />
    </svg>
  );
}

// ============================================================================
// 내부 subcomponent — GradeBadge (inline, 후속 PR에서 shared/로 분리)
// ============================================================================

function GradeBadge({ grade }: { grade: ModelGrade }) {
  const cls = GRADE_COLORS[grade] ?? GRADE_COLORS.F;
  return (
    <span
      className={`inline-flex items-center px-2 py-0.5 rounded border text-xs font-semibold tabular-nums ${cls}`}
      aria-label={`등급 ${grade}`}
    >
      {grade}
    </span>
  );
}

// ============================================================================
// 내부 subcomponent — StatusBadge (inline, 후속 PR에서 shared/로 분리)
// 스펙 §4.10.4
// ============================================================================

/**
 * completed 플래그를 TournamentStatus 에 매핑한다.
 * ModelCardEntry는 completed: boolean만 가지므로, 단순 2-상태 변환을 사용한다.
 * WS_CLOSED / WS_TIMEOUT 구분이 필요한 경우 ModelCardEntry에 status 필드를 추가할 것.
 */
function completedToStatus(completed: boolean): TournamentStatus {
  return completed ? "COMPLETED" : "WS_TIMEOUT";
}

interface StatusBadgeProps {
  status: TournamentStatus;
}

function StatusBadge({ status }: StatusBadgeProps) {
  const cls = STATUS_COLORS[status] ?? STATUS_COLORS.UNKNOWN;
  const label = STATUS_LABELS[status] ?? STATUS_LABELS.UNKNOWN;
  return (
    <span
      className={`inline-flex items-center px-2 py-0.5 rounded border text-xs font-medium ${cls}`}
      aria-label={`완료 상태: ${label}`}
    >
      {label}
    </span>
  );
}

// ============================================================================
// 메인 subcomponent — ModelCard
// ============================================================================

interface ModelCardProps {
  stats: ModelCardEntry;
  /** 필터에서 선택된 모델인지 여부. false이면 opacity-40 grayscale (스펙 §4.6) */
  active: boolean;
}

function ModelCard({ stats, active }: ModelCardProps) {
  const color = resolveColor(stats.modelKey);
  const displayName = resolveName(stats.modelKey, stats.modelName);
  const inactiveClass = active ? "" : "opacity-40 grayscale";

  return (
    <article
      className={`relative bg-slate-800 border border-slate-700 rounded-lg p-5 overflow-hidden transition-opacity ${inactiveClass}`}
      aria-label={`${displayName} 모델 카드`}
      aria-disabled={!active}
      data-testid="model-card"
      data-model-key={stats.modelKey}
      data-place-rate={stats.latestRate}
    >
      {/* 상단 색상 바 */}
      <div
        className="absolute top-0 left-0 right-0 h-1 rounded-t-lg"
        style={{ backgroundColor: color }}
        aria-hidden="true"
      />

      {/* 헤더: 마커 + 모델명 + 등급 */}
      <header className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2 min-w-0">
          <ModelMarkerIcon modelKey={stats.modelKey} color={color} />
          <h3 className="text-sm font-semibold text-slate-200 truncate">{displayName}</h3>
        </div>
        <GradeBadge grade={stats.grade} />
      </header>

      {/* 주 지표: place rate */}
      <div className="mb-3">
        <p
          className="text-4xl font-bold text-white tabular-nums"
          aria-label={`최신 Place Rate ${stats.latestRate.toFixed(1)} 퍼센트`}
        >
          {stats.latestRate.toFixed(1)}
          <span className="text-xl font-semibold text-slate-400 ml-1">%</span>
        </p>
        <p className="text-xs text-slate-500 mt-1">
          Place Rate ({stats.latestRound})
        </p>
      </div>

      {/* Sparkline */}
      <Sparkline data={stats.sparkline} color={color} />

      {/* 보조 지표 3종: 응답시간 / cost / tiles (스펙 §4.6 순서) */}
      <dl className="grid grid-cols-3 gap-2 mt-4 text-center">
        <div>
          <dt className="text-xs text-slate-500">응답 시간</dt>
          <dd className="text-sm font-medium text-slate-200 tabular-nums">
            {stats.avgResponseTimeSec > 0
              ? `${stats.avgResponseTimeSec.toFixed(1)}s`
              : "—"}
          </dd>
        </div>
        <div>
          <dt className="text-xs text-slate-500">비용/턴</dt>
          <dd className="text-sm font-medium text-slate-200 tabular-nums">
            ${stats.costPerTurn.toFixed(3)}
          </dd>
        </div>
        <div>
          <dt className="text-xs text-slate-500">총 타일</dt>
          <dd className="text-sm font-medium text-slate-200 tabular-nums">
            {stats.totalTilesPlaced}
          </dd>
        </div>
      </dl>

      {/* 푸터: 상태 배지 + prompt version + 최근 대전 보기 링크 (스펙 §4.6) */}
      <footer className="flex items-center justify-between gap-2 mt-4 pt-3 border-t border-slate-700">
        <div className="flex items-center gap-1.5 min-w-0">
          <StatusBadge status={completedToStatus(stats.completed)} />
          <span className="text-xs px-2 py-0.5 rounded bg-slate-700 text-slate-300 shrink-0">
            {stats.promptVersion}
          </span>
        </div>
        <a
          href={stats.recentBattleHref}
          className="text-xs text-sky-400 hover:text-sky-300 hover:underline focus:outline-none focus:ring-2 focus:ring-sky-500 rounded"
          aria-label={`${displayName} 최근 대전 보기`}
        >
          최근 대전 →
        </a>
      </footer>
    </article>
  );
}

// ============================================================================
// 메인 export — ModelCardGrid
// ============================================================================

export default function ModelCardGrid({
  cards,
  selectedModelKeys,
  sortByPlaceRateDesc = true,
}: ModelCardGridProps) {
  // props.cards가 비어 있으면 mock fallback (skeleton 단계)
  const source = cards && cards.length > 0 ? cards : MOCK_MODEL_CARDS;

  const rendered = sortByPlaceRateDesc
    ? [...source].sort((a, b) => b.latestRate - a.latestRate)
    : source;

  // selectedModelKeys가 비어 있거나 미전달 시 전체 active 처리
  const activeSet =
    selectedModelKeys && selectedModelKeys.length > 0
      ? new Set(selectedModelKeys)
      : null;

  const activeCount = activeSet
    ? rendered.filter((c) => activeSet.has(c.modelKey)).length
    : rendered.length;

  return (
    <section
      aria-labelledby="model-card-grid-title"
      className="h-full flex flex-col"
      data-testid="model-card-grid"
    >
      <h2
        id="model-card-grid-title"
        className="text-sm font-semibold text-slate-300 uppercase tracking-wide mb-3"
      >
        모델 카드
      </h2>
      <p className="sr-only">
        총 {rendered.length}개 모델 중 {activeCount}개 선택됨.
        Place Rate 내림차순으로 정렬되어 있습니다.
      </p>

      {/*
        반응형 레이아웃 (스펙 §4.6):
        - mobile (< sm): 가로 스와이프 캐러셀 (overflow-x-auto snap-x)
        - tablet (sm+): grid 2열
        - desktop (lg+): grid 4열 (dashboard 4분할 내에서 compact하게)
      */}

      {/* 모바일 캐러셀 (sm 미만에서만 표시) */}
      <div
        className="flex sm:hidden gap-3 overflow-x-auto snap-x snap-mandatory pb-2 -mx-1 px-1"
        role="list"
        aria-label="모델 카드 목록 (스와이프)"
      >
        {rendered.map((c) => {
          const isActive = activeSet ? activeSet.has(c.modelKey) : true;
          return (
            <div
              key={c.modelKey}
              role="listitem"
              className="snap-start shrink-0 w-64"
            >
              <ModelCard stats={c} active={isActive} />
            </div>
          );
        })}
      </div>

      {/* 태블릿 이상: 그리드 (스펙 §4.6 tablet 2col / desktop 4col) */}
      <div
        className="hidden sm:grid sm:grid-cols-2 xl:grid-cols-4 gap-3 flex-1 auto-rows-min"
        role="list"
      >
        {rendered.map((c) => {
          const isActive = activeSet ? activeSet.has(c.modelKey) : true;
          return (
            <div key={c.modelKey} role="listitem">
              <ModelCard stats={c} active={isActive} />
            </div>
          );
        })}
      </div>
    </section>
  );
}
