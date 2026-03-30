"use client";

import { useEffect, useCallback } from "react";

interface UseGameLeaveGuardOptions {
  /** 게임 상태가 PLAYING인지 (true일 때만 경고 활성화) */
  isPlaying: boolean;
  /** 사용자가 나가기를 확인했을 때 콜백 (LEAVE_GAME 전송 등) */
  onLeaveConfirmed?: () => void;
}

/**
 * 게임 이탈 방지 훅
 *
 * 게임 진행 중(PLAYING 상태)에서만 활성화되며 두 가지 시나리오를 처리한다:
 *
 * 1. **beforeunload**: 탭 닫기, 새로고침, 외부 URL 이동 시 브라우저 표준 경고
 * 2. **popstate**: 뒤로가기 시 window.confirm 확인 다이얼로그
 *
 * WAITING, FINISHED, CANCELLED 상태에서는 비활성 (자유 이동).
 *
 * @see docs/02-design/12-player-lifecycle-design.md 섹션 4
 */
export function useGameLeaveGuard({
  isPlaying,
  onLeaveConfirmed,
}: UseGameLeaveGuardOptions) {
  // 1. beforeunload: 탭 닫기, 새로고침, 외부 URL 이동
  useEffect(() => {
    if (!isPlaying) return;

    const handler = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      // 최신 브라우저는 returnValue를 무시하고 표준 경고를 표시한다.
      // 호환성을 위해 설정.
      e.returnValue = "게임이 진행 중입니다. 나가시겠습니까?";
      return e.returnValue;
    };

    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [isPlaying]);

  // onLeaveConfirmed를 안정적으로 참조하기 위한 콜백
  const stableOnLeave = useCallback(() => {
    onLeaveConfirmed?.();
  }, [onLeaveConfirmed]);

  // 2. Next.js App Router: 뒤로가기(popstate) 가드
  //    App Router에서는 router.events가 없으므로
  //    popstate + history.pushState로 뒤로가기를 가로챈다.
  useEffect(() => {
    if (!isPlaying) return;

    const handlePopState = () => {
      const confirmed = window.confirm(
        "게임이 진행 중입니다. 나가시겠습니까?"
      );
      if (!confirmed) {
        // 뒤로가기 취소: history를 앞으로 밀어넣어 현재 페이지 유지
        window.history.pushState(null, "", window.location.href);
      } else {
        stableOnLeave();
      }
    };

    // 현재 상태를 history에 추가하여 popstate를 가로챌 수 있게 한다.
    window.history.pushState(null, "", window.location.href);
    window.addEventListener("popstate", handlePopState);

    return () => window.removeEventListener("popstate", handlePopState);
  }, [isPlaying, stableOnLeave]);
}
