"use client";

import { useEffect } from "react";

interface ErrorProps {
  error: Error & { digest?: string };
  reset: () => void;
}

export default function TournamentError({ error, reset }: ErrorProps) {
  useEffect(() => {
    console.error("[tournament] failed to load", error);
  }, [error]);

  return (
    <div
      role="alert"
      className="bg-slate-800 border border-red-500/40 rounded-lg p-8 text-center"
    >
      <h2 className="text-lg font-bold text-red-400 mb-2">
        토너먼트 데이터를 불러오지 못했습니다
      </h2>
      <p className="text-sm text-slate-400 mb-6">
        game-server가 일시적으로 응답하지 않을 수 있습니다. 잠시 후 다시 시도해주세요.
      </p>
      {error.digest && (
        <p className="text-xs text-slate-500 font-mono mb-4">ref: {error.digest}</p>
      )}
      <button
        type="button"
        onClick={reset}
        className="px-4 py-2 bg-slate-700 hover:bg-slate-600 text-white text-sm font-medium rounded-md transition-colors"
      >
        다시 시도
      </button>
    </div>
  );
}
