export default function Loading() {
  return (
    <div
      role="status"
      aria-label="토너먼트 대시보드 로딩 중"
      className="tournament-content"
    >
      {/* 페이지 헤더 skeleton */}
      <div className="mb-6 space-y-2">
        <div className="h-7 w-56 bg-slate-700 rounded animate-pulse" />
        <div className="h-4 w-40 bg-slate-800 rounded animate-pulse" />
      </div>

      {/* 필터 skeleton */}
      <div className="bg-slate-800 border border-slate-700 rounded-lg p-5 mb-6">
        <div className="flex flex-wrap items-center gap-6">
          <div className="h-6 w-64 bg-slate-700 rounded animate-pulse" />
          <div className="h-6 w-40 bg-slate-700 rounded animate-pulse" />
          <div className="h-6 w-32 bg-slate-700 rounded animate-pulse" />
        </div>
      </div>

      {/* 4분할 그리드 skeleton */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {[0, 1, 2, 3].map((i) => (
          <div
            key={i}
            className="bg-slate-800 border border-slate-700 rounded-lg p-5 min-h-[320px]"
          >
            <div className="h-4 w-32 bg-slate-700 rounded animate-pulse mb-4" />
            <div className="h-3 w-48 bg-slate-800 rounded animate-pulse mb-6" />
            <div className="h-52 bg-slate-900 border border-slate-700 rounded animate-pulse" />
          </div>
        ))}
      </div>

      <span className="sr-only">토너먼트 데이터를 불러오는 중입니다.</span>
    </div>
  );
}
