"use client";

/**
 * TimerView — 턴 타이머 표시 (L1)
 *
 * SSOT 매핑:
 *   - 58 §1.1 To-Be 디렉터리 트리: TimerView.tsx
 *   - 58 §2 F-15: 턴 타이머 + 자동 드로우
 *   - UR-26: 타이머 표시
 *
 * Phase 3 구현:
 *   기존 TurnTimer.tsx를 내부에서 호출한다.
 *   58 §1.1에서 "기존 TurnTimer.tsx 개명/수정"으로 명시되어 있으므로
 *   Phase 3에서는 re-export 래퍼로 구현하고, Phase 4에서 TurnTimer를 폐기 예정.
 *
 * props 변경:
 *   - TurnTimer의 totalSec prop을 그대로 받는다.
 *   - 향후 remainingMs, isWarning, isCritical props를 직접 받도록 확장 (F-15).
 *
 * 계층 규칙: L2(store/hook)만 import. L3 직접 import 금지.
 */

import TurnTimer from "./TurnTimer";

export interface TimerViewProps {
  /** 전체 턴 타임아웃(초) - 프로그레스바 계산용 */
  totalSec: number;
  className?: string;
}

/**
 * 턴 타이머 표시 컴포넌트.
 *
 * Phase 3: TurnTimer를 내부에서 호출하는 래퍼.
 * useTurnTimer hook은 TurnTimer 내부에서 호출된다.
 * Phase 4에서 TimerView가 useTurnTimer를 직접 호출하도록 개편 예정 (F-15 완전 구현).
 */
export default function TimerView({ totalSec, className }: TimerViewProps) {
  return <TurnTimer totalSec={totalSec} className={className} />;
}
