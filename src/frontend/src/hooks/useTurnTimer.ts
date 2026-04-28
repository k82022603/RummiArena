"use client";

import { useEffect, useRef } from "react";
import { useGameStore } from "@/store/gameStore";

/**
 * 턴 타이머 훅
 *
 * 인간 턴: remainingMs 를 1초 간격으로 감소시킨다.
 * AI 턴:   카운트다운 대신 경과 시간(aiElapsedMs)을 1초 간격으로 증가시킨다.
 *          remainingMs는 감소시키지 않는다 (서버 TIMER_UPDATE로만 갱신).
 *
 * 서버 turn:start 이벤트가 오면 setRemainingMs 로 리셋한다.
 *
 * m-5: remainingMs를 useEffect 의존성에서 제거하여 interval 재생성을 방지한다.
 * 타이머 시작/리셋은 resetKey(턴 전환 시 변경)로 제어한다.
 */
export function useTurnTimer() {
  const remainingMs = useGameStore((s) => s.remainingMs);
  const isAITurn = useGameStore((s) => s.isAITurn);
  const aiThinkingSeat = useGameStore((s) => s.aiThinkingSeat);
  const aiElapsedMs = useGameStore((s) => s.aiElapsedMs);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  // 타이머 리셋 감지용: remainingMs가 이전보다 큰 값으로 설정되면 새 턴으로 간주
  const prevRemainingRef = useRef(0);

  // AI 턴 판별: TURN_START.isAITurn 또는 aiThinkingSeat 기반 (서버 미구현 시 폴백)
  const effectiveIsAI = isAITurn || aiThinkingSeat !== null;

  useEffect(() => {
    const isNewTurn = remainingMs > prevRemainingRef.current;
    prevRemainingRef.current = remainingMs;

    // AI 턴: 카운트다운 하지 않고 경과 시간만 증가
    if (effectiveIsAI) {
      // 새 턴이면 경과 시간 리셋
      if (isNewTurn) {
        useGameStore.getState().setAIElapsedMs(0);
      }
      // 기존 interval 정리 후 경과 시간 interval 생성
      if (intervalRef.current) clearInterval(intervalRef.current);

      intervalRef.current = setInterval(() => {
        useGameStore.setState((state) => ({
          aiElapsedMs: state.aiElapsedMs + 1000,
        }));
      }, 1000);

      return () => {
        if (intervalRef.current) {
          clearInterval(intervalRef.current);
          intervalRef.current = null;
        }
      };
    }

    // 인간 턴: 기존 카운트다운 로직
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
  }, [remainingMs, effectiveIsAI]);

  const seconds = Math.ceil(remainingMs / 1000);
  const isWarning = !effectiveIsAI && seconds <= 10 && seconds > 0;
  const isDanger = !effectiveIsAI && seconds <= 5 && seconds > 0;
  const elapsedSec = Math.floor(aiElapsedMs / 1000);

  return {
    remainingMs,
    seconds,
    isWarning,
    isDanger,
    isAITurn: effectiveIsAI,
    aiElapsedMs,
    elapsedSec,
  };
}
