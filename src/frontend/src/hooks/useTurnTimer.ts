"use client";

import { useEffect, useRef } from "react";
import { useGameStore } from "@/store/gameStore";

/**
 * 턴 타이머 훅
 * remainingMs 를 1초 간격으로 감소시킨다.
 * 서버 turn:start 이벤트가 오면 setRemainingMs 로 리셋한다.
 *
 * m-5: remainingMs를 useEffect 의존성에서 제거하여 interval 재생성을 방지한다.
 * 타이머 시작/리셋은 resetKey(턴 전환 시 변경)로 제어한다.
 */
export function useTurnTimer() {
  const remainingMs = useGameStore((s) => s.remainingMs);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  // 타이머 리셋 감지용: remainingMs가 이전보다 큰 값으로 설정되면 새 턴으로 간주
  const prevRemainingRef = useRef(0);

  useEffect(() => {
    // 타이머가 새로 시작되어야 하는 경우만 interval을 (재)생성
    // 조건: remainingMs > 0 이고, 이전 값보다 크거나(새 턴 시작) 아직 interval이 없는 경우
    const isNewTurn = remainingMs > prevRemainingRef.current;
    prevRemainingRef.current = remainingMs;

    if (remainingMs <= 0) {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
      return;
    }

    // 새 턴이 아니면 기존 interval 유지
    if (!isNewTurn && intervalRef.current) return;

    // 기존 interval 정리 후 새로 생성
    if (intervalRef.current) clearInterval(intervalRef.current);

    intervalRef.current = setInterval(() => {
      useGameStore.setState((state) => {
        const next = Math.max(0, state.remainingMs - 1000);
        if (next <= 0 && intervalRef.current) {
          clearInterval(intervalRef.current);
          intervalRef.current = null;
        }
        return { remainingMs: next };
      });
    }, 1000);

    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
    };
  }, [remainingMs]);

  const seconds = Math.ceil(remainingMs / 1000);
  const isWarning = seconds <= 10 && seconds > 0;
  const isDanger = seconds <= 5 && seconds > 0;

  return { remainingMs, seconds, isWarning, isDanger };
}
