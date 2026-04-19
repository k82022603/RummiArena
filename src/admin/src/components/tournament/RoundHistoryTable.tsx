"use client";

/**
 * RoundHistoryTable — 메인 컴포넌트 (ADR 45 §4, §6, §7, §8)
 *
 * TanStack Table v8 기반 (headless, TailwindCSS와 충돌 없음)
 * - 10개 컬럼 (ADR 45 §4)
 * - sortable headers, client-side sort/filter (useMemo)
 * - 반응형: lg 전체 / md 축소 / sm 카드형
 * - Model badge + Variant tag + placeRate 컬러 스케일
 * - URL 쿼리 sync (ADR 45 §6.4)
 * - 접근성: role="grid", aria-sort, aria-live
 */

import { useMemo, useState, useCallback, useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import {
  useReactTable,
  getCoreRowModel,
  getSortedRowModel,
  type ColumnDef,
  type SortingState,
  flexRender,
} from "@tanstack/react-table";

import type {
  RoundHistoryEntry,
  RoundHistoryFilter,
  RoundHistoryModelType,
  VariantType,
} from "@/lib/types";
import {
  fmtPlaceRate,
  fmtLatency,
  fmtCost,
  fmtFallback,
  placeRateColorClass,
} from "@/lib/formatters";
import { computeStats } from "@/lib/roundHistoryUtils";
import { ModelBadge } from "./ModelBadge";
import { VariantTag } from "./VariantTag";
import { RoundHistoryFilterBar } from "./RoundHistoryFilterBar";
import { RoundHistoryStatsFooter } from "./RoundHistoryStatsFooter";
import { RoundHistoryDetailModal } from "./RoundHistoryDetailModal";

const EMPTY_FILTER: RoundHistoryFilter = {
  roundIds: [],
  models: [],
  variants: [],
  dateFrom: undefined,
  dateTo: undefined,
};

function SortIcon({ direction }: { direction: "asc" | "desc" | false }) {
  if (direction === "asc") {
    return (
      <svg className="w-3 h-3 inline-block ml-1" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 15l7-7 7 7" />
      </svg>
    );
  }
  if (direction === "desc") {
    return (
      <svg className="w-3 h-3 inline-block ml-1" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
      </svg>
    );
  }
  return (
    <svg className="w-3 h-3 inline-block ml-1 text-slate-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16V4m0 0L3 8m4-4l4 4M17 8v12m0 0l4-4m-4 4l-4-4" />
    </svg>
  );
}

interface RoundHistoryTableProps {
  data: RoundHistoryEntry[];
  initialFilter?: Partial<RoundHistoryFilter>;
}

export function RoundHistoryTable({ data, initialFilter }: RoundHistoryTableProps) {
  const router = useRouter();
  const searchParams = useSearchParams();

  // URL에서 초기 필터 복원 (ADR 45 §6.4)
  const [filter, setFilter] = useState<RoundHistoryFilter>(() => {
    const modelParam = searchParams.get("model");
    const variantParam = searchParams.get("variant");
    return {
      roundIds: initialFilter?.roundIds ?? [],
      models: (modelParam?.split(",") as RoundHistoryModelType[]) ?? initialFilter?.models ?? [],
      variants: (variantParam?.split(",") as VariantType[]) ?? initialFilter?.variants ?? [],
      dateFrom: searchParams.get("dateFrom") ?? initialFilter?.dateFrom ?? undefined,
      dateTo: searchParams.get("dateTo") ?? initialFilter?.dateTo ?? undefined,
    };
  });

  const [sorting, setSorting] = useState<SortingState>([
    { id: "roundId", desc: true },
  ]);

  const [selectedEntry, setSelectedEntry] = useState<RoundHistoryEntry | null>(null);

  // 필터 변경 시 URL 쿼리 sync (ADR 45 §6.4)
  const syncUrl = useCallback(
    (f: RoundHistoryFilter) => {
      const params = new URLSearchParams();
      if (f.models.length > 0) params.set("model", f.models.join(","));
      if (f.variants.length > 0) params.set("variant", f.variants.join(","));
      if (f.dateFrom) params.set("dateFrom", f.dateFrom);
      if (f.dateTo) params.set("dateTo", f.dateTo);
      router.replace(`?${params.toString()}`, { scroll: false });
    },
    [router],
  );

  const handleFilterChange = useCallback(
    (newFilter: RoundHistoryFilter) => {
      setFilter(newFilter);
      syncUrl(newFilter);
    },
    [syncUrl],
  );

  const handleFilterReset = useCallback(() => {
    setFilter(EMPTY_FILTER);
    router.replace("?", { scroll: false });
  }, [router]);

  // client-side 필터 (useMemo)
  const filteredData = useMemo(() => {
    return data.filter((e) => {
      if (filter.roundIds.length > 0 && !filter.roundIds.includes(e.roundId))
        return false;
      if (filter.models.length > 0 && !filter.models.includes(e.model))
        return false;
      if (filter.variants.length > 0 && !filter.variants.includes(e.variant))
        return false;
      if (filter.dateFrom && e.date < filter.dateFrom) return false;
      if (filter.dateTo && e.date > filter.dateTo) return false;
      return true;
    });
  }, [data, filter]);

  const stats = useMemo(() => computeStats(filteredData), [filteredData]);

  // aria-live 알림 텍스트
  const [ariaLiveMsg, setAriaLiveMsg] = useState("");

  useEffect(() => {
    setAriaLiveMsg(`${filteredData.length}개 결과 표시 중`);
  }, [filteredData.length]);

  // TanStack Table 컬럼 정의 (ADR 45 §4)
  const columns = useMemo<ColumnDef<RoundHistoryEntry>[]>(
    () => [
      {
        id: "roundId",
        accessorKey: "roundId",
        header: "Round",
        enableSorting: true,
        cell: ({ getValue }) => (
          <span className="font-mono text-slate-200 text-sm">{getValue<string>()}</span>
        ),
      },
      {
        id: "date",
        accessorKey: "date",
        header: "날짜",
        enableSorting: true,
        cell: ({ getValue }) => (
          <span className="text-slate-300 text-sm">{getValue<string>()}</span>
        ),
      },
      {
        id: "model",
        accessorKey: "model",
        header: "Model",
        enableSorting: false,
        cell: ({ getValue }) => <ModelBadge model={getValue<RoundHistoryModelType>()} />,
      },
      {
        id: "variant",
        accessorKey: "variant",
        header: "Variant",
        enableSorting: false,
        cell: ({ getValue }) => <VariantTag variant={getValue<VariantType>()} />,
      },
      {
        id: "runNumber",
        accessorKey: "runNumber",
        header: "Run",
        enableSorting: true,
        cell: ({ getValue }) => (
          <span className="text-slate-300 text-sm text-center block">#{getValue<number>()}</span>
        ),
      },
      {
        id: "placeRate",
        accessorKey: "placeRate",
        header: "Place%",
        enableSorting: true,
        cell: ({ getValue }) => {
          const rate = getValue<number>();
          return (
            <span className={`text-sm ${placeRateColorClass(rate)}`}>
              {fmtPlaceRate(rate)}
            </span>
          );
        },
      },
      {
        id: "fallbackCount",
        accessorKey: "fallbackCount",
        header: "FB",
        enableSorting: true,
        cell: ({ getValue }) => (
          <span className="text-slate-300 text-sm text-center block">
            {fmtFallback(getValue<number>())}
          </span>
        ),
      },
      {
        id: "avgLatencyMs",
        accessorKey: "avgLatencyMs",
        header: "Avg Lat",
        enableSorting: true,
        cell: ({ getValue }) => (
          <span className="text-slate-300 text-sm text-right block">
            {fmtLatency(getValue<number>())}
          </span>
        ),
      },
      {
        id: "maxLatencyMs",
        accessorKey: "maxLatencyMs",
        header: "Max Lat",
        enableSorting: true,
        cell: ({ getValue }) => (
          <span className="text-slate-300 text-sm text-right block">
            {fmtLatency(getValue<number>())}
          </span>
        ),
      },
      {
        id: "costUsd",
        accessorKey: "costUsd",
        header: "Cost",
        enableSorting: true,
        cell: ({ getValue }) => (
          <span className="text-slate-200 text-sm text-right block">
            {fmtCost(getValue<number>())}
          </span>
        ),
      },
    ],
    [],
  );

  const table = useReactTable({
    data: filteredData,
    columns,
    state: { sorting },
    onSortingChange: (updater) => {
      const newSorting = typeof updater === "function" ? updater(sorting) : updater;
      setSorting(newSorting);
      if (newSorting.length > 0) {
        const dir = newSorting[0].desc ? "내림차순" : "오름차순";
        setAriaLiveMsg(`${newSorting[0].id} ${dir}으로 정렬됨`);
      }
    },
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
  });

  return (
    <div className="flex flex-col">
      {/* 필터 바 */}
      <RoundHistoryFilterBar
        filter={filter}
        onChange={handleFilterChange}
        onReset={handleFilterReset}
      />

      {/* aria-live 영역 */}
      <div
        aria-live="polite"
        aria-atomic="true"
        className="sr-only"
      >
        {ariaLiveMsg}
      </div>

      {/* 데스크톱/태블릿 테이블 (md 이상) */}
      <div className="hidden sm:block overflow-x-auto rounded-lg border border-slate-700">
        <table
          role="grid"
          aria-label="라운드 실험 이력 테이블"
          aria-rowcount={filteredData.length + 1}
          aria-colcount={10}
          className="w-full text-sm"
        >
          <caption className="sr-only">
            RummiArena AI 프롬프트 실험 Round 1~10 결과. 모델, 변형, 성공률, 비용 포함.
          </caption>
          <thead>
            {table.getHeaderGroups().map((headerGroup) => (
              <tr key={headerGroup.id} className="border-b border-slate-700 bg-slate-800/80">
                {headerGroup.headers.map((header) => {
                  const isSortable = header.column.getCanSort();
                  const sortDir = header.column.getIsSorted();

                  // 컬럼별 반응형 숨김 (ADR 45 §7.2)
                  const hiddenClass = getColHiddenClass(header.column.id);

                  const ariaSort = sortDir === "asc"
                    ? "ascending"
                    : sortDir === "desc"
                    ? "descending"
                    : "none";

                  return (
                    <th
                      key={header.id}
                      scope="col"
                      aria-sort={isSortable ? ariaSort : undefined}
                      aria-label={isSortable ? `${header.column.columnDef.header as string}, 클릭하여 정렬` : undefined}
                      onClick={isSortable ? header.column.getToggleSortingHandler() : undefined}
                      onKeyDown={
                        isSortable
                          ? (e) => {
                              if (e.key === "Enter" || e.key === " ") {
                                e.preventDefault();
                                header.column.getToggleSortingHandler()?.(e);
                              }
                            }
                          : undefined
                      }
                      tabIndex={isSortable ? 0 : undefined}
                      className={`px-3 py-2 text-left text-xs font-medium text-slate-400 uppercase tracking-wider whitespace-nowrap ${
                        isSortable ? "cursor-pointer hover:text-slate-200 select-none" : ""
                      } ${hiddenClass}`}
                    >
                      {flexRender(header.column.columnDef.header, header.getContext())}
                      {isSortable && <SortIcon direction={sortDir} />}
                    </th>
                  );
                })}
              </tr>
            ))}
          </thead>
          <tbody>
            {table.getRowModel().rows.map((row) => {
              const entry = row.original;
              const ariaLabel = `${entry.roundId} ${entry.date} ${entry.model} ${entry.variant} Run ${entry.runNumber}, Place Rate ${fmtPlaceRate(entry.placeRate)}`;
              return (
                <tr
                  key={row.id}
                  role="row"
                  tabIndex={0}
                  aria-label={ariaLabel}
                  onClick={() => setSelectedEntry(entry)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " ") {
                      e.preventDefault();
                      setSelectedEntry(entry);
                    }
                  }}
                  className="border-b border-slate-700/50 hover:bg-slate-700/30 cursor-pointer transition-colors focus:outline-none focus:bg-slate-700/40"
                >
                  {row.getVisibleCells().map((cell) => {
                    const hiddenClass = getColHiddenClass(cell.column.id);
                    const rate = entry.placeRate;
                    const isPlaceRate = cell.column.id === "placeRate";
                    return (
                      <td
                        key={cell.id}
                        aria-label={
                          isPlaceRate
                            ? `Place Rate ${fmtPlaceRate(rate)}, ${rate >= 0.28 ? "상위 등급" : rate >= 0.2 ? "보통 등급" : "하위 등급"}`
                            : undefined
                        }
                        className={`px-3 py-2 ${hiddenClass}`}
                      >
                        {flexRender(cell.column.columnDef.cell, cell.getContext())}
                      </td>
                    );
                  })}
                </tr>
              );
            })}
            {filteredData.length === 0 && (
              <tr>
                <td
                  colSpan={10}
                  className="px-4 py-8 text-center text-slate-500 text-sm"
                >
                  필터 조건에 맞는 결과가 없습니다.
                </td>
              </tr>
            )}
          </tbody>
        </table>

        {/* 통계 요약 */}
        <RoundHistoryStatsFooter stats={stats} />
      </div>

      {/* 모바일 카드형 (sm 미만) — ADR 45 §7.3 */}
      <div className="sm:hidden space-y-3">
        {filteredData.length === 0 && (
          <p className="text-center text-slate-500 text-sm py-8">
            필터 조건에 맞는 결과가 없습니다.
          </p>
        )}
        {table.getRowModel().rows.map((row) => {
          const entry = row.original;
          return (
            <button
              key={row.id}
              type="button"
              onClick={() => setSelectedEntry(entry)}
              className="w-full text-left bg-slate-800 border border-slate-700 rounded-lg p-3 hover:border-slate-500 transition-colors focus:outline-none focus:ring-1 focus:ring-blue-500"
              aria-label={`${entry.roundId} ${entry.date}, Place Rate ${fmtPlaceRate(entry.placeRate)}, 클릭하여 상세 보기`}
            >
              <div className="flex items-center justify-between mb-2">
                <span className="font-mono text-slate-200 text-sm font-semibold">
                  {entry.roundId}
                </span>
                <span className="text-xs text-slate-400">{entry.date}</span>
              </div>
              <div className="flex items-center gap-2 mb-2">
                <ModelBadge model={entry.model} />
                <VariantTag variant={entry.variant} />
                <span className="text-xs text-slate-500">Run #{entry.runNumber}</span>
              </div>
              <div className="flex items-center justify-between">
                <div>
                  <span className="text-xs text-slate-400">Place Rate </span>
                  <span className={`text-sm font-semibold ${placeRateColorClass(entry.placeRate)}`}>
                    {fmtPlaceRate(entry.placeRate)}
                  </span>
                </div>
                <div>
                  <span className="text-xs text-slate-400">Cost </span>
                  <span className="text-sm text-slate-200">{fmtCost(entry.costUsd)}</span>
                </div>
                {entry.maxLatencyMs > 0 && (
                  <div>
                    <span className="text-xs text-slate-400">Max </span>
                    <span className="text-sm text-slate-300">{fmtLatency(entry.maxLatencyMs)}</span>
                  </div>
                )}
              </div>
            </button>
          );
        })}

        {/* 모바일 통계 요약 */}
        {filteredData.length > 0 && (
          <div className="border-t border-slate-700 pt-2 flex justify-between text-xs text-slate-400">
            <span>평균 {fmtPlaceRate(stats.avgPlaceRate)}</span>
            <span>총 {fmtCost(stats.totalCostUsd)}</span>
          </div>
        )}
      </div>

      {/* 상세 모달 */}
      {selectedEntry && (
        <RoundHistoryDetailModal
          entry={selectedEntry}
          isOpen={true}
          onClose={() => setSelectedEntry(null)}
        />
      )}
    </div>
  );
}

/** 컬럼 ID에 따른 반응형 숨김 CSS 클래스 (ADR 45 §7.2) */
function getColHiddenClass(colId: string): string {
  switch (colId) {
    case "runNumber":
      // md: 숨김, lg: 표시
      return "hidden lg:table-cell";
    case "fallbackCount":
    case "avgLatencyMs":
      // sm 이상: 숨김, lg: 표시
      return "hidden lg:table-cell";
    case "maxLatencyMs":
      // md: 표시, lg: 표시 (sm에서는 카드로 대체)
      return "hidden md:table-cell";
    case "costUsd":
      // md 이상 표시 (sm 카드에서 별도 표시)
      return "hidden md:table-cell";
    default:
      return "";
  }
}
