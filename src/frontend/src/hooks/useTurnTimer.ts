"use client";

import { useEffect, useRef } from "react";
import { useGameStore } from "@/store/gameStore";

/**
 * 턴 타이머 훅
 * remainingMs 를 1초 간격으로 감소시킨다.
 * 서버 turn:start 이벤트가 오면 setRemainingMs 로 리셋한다.
 */
export function useTurnTimer() {
  const remainingMs = useGameStore((s) => s.remainingMs);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    if (intervalRef.current) clearInterval(intervalRef.current);

    if (remainingMs <= 0) return;

    intervalRef.current = setInterval(() => {
      useGameStore.setState((state) => ({
        remainingMs: Math.max(0, state.remainingMs - 1000),
      }));
    }, 1000);

    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [remainingMs]);

  const seconds = Math.ceil(remainingMs / 1000);
  const isWarning = seconds <= 10 && seconds > 0;
  const isDanger = seconds <= 5 && seconds > 0;

  return { remainingMs, seconds, isWarning, isDanger };
}
