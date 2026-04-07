"use client";

import { memo } from "react";

interface CooldownProgressProps {
  /** 남은 초 */
  remainingSec: number;
  /** 전체 초 (비율 계산) */
  totalSec: number;
  /** SVG 크기 (px, 기본 28) */
  size?: number;
  /** 원 테두리 두께 (px, 기본 3) */
  strokeWidth?: number;
  className?: string;
}

/**
 * SVG 원형 쿨다운 카운트다운 컴포넌트
 *
 * - stroke-dashoffset으로 잔여 비율을 시각적으로 표현
 * - 내부에 잔여 초 숫자를 표시
 * - remainingSec이 0이면 체크 아이콘으로 전환
 * - prefers-reduced-motion 시 원형 애니메이션 제거, 숫자만 표시
 *
 * 디자인 토큰:
 *   색상: text-warning (#F3C623)
 *   배경: text-warning/20
 *   크기: 28x28px
 *   두께: 3px
 *   내부 텍스트: text-tile-xs, font-mono, font-bold
 */
const CooldownProgress = memo(function CooldownProgress({
  remainingSec,
  totalSec,
  size = 28,
  strokeWidth = 3,
  className = "",
}: CooldownProgressProps) {
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const ratio = totalSec > 0 ? remainingSec / totalSec : 0;
  const dashOffset = circumference * (1 - ratio);
  const center = size / 2;
  const isComplete = remainingSec <= 0;

  return (
    <div
      className={`relative flex-shrink-0 ${className}`}
      style={{ width: size, height: size }}
      role="progressbar"
      aria-valuenow={remainingSec}
      aria-valuemin={0}
      aria-valuemax={totalSec}
      aria-label="쿨다운 잔여 시간"
    >
      <svg
        width={size}
        height={size}
        className="motion-safe:block motion-reduce:hidden"
        style={{ transform: "rotate(-90deg)" }}
      >
        {/* 배경 트랙 */}
        <circle
          cx={center}
          cy={center}
          r={radius}
          fill="none"
          stroke="currentColor"
          strokeWidth={strokeWidth}
          className="text-warning/20"
        />
        {/* 진행 원호 */}
        {!isComplete && (
          <circle
            cx={center}
            cy={center}
            r={radius}
            fill="none"
            stroke="currentColor"
            strokeWidth={strokeWidth}
            strokeDasharray={circumference}
            strokeDashoffset={dashOffset}
            strokeLinecap="round"
            className="text-warning transition-[stroke-dashoffset] duration-1000 ease-linear"
          />
        )}
      </svg>

      {/* 중앙 텍스트 / 체크 아이콘 */}
      <div className="absolute inset-0 flex items-center justify-center">
        {isComplete ? (
          <svg
            xmlns="http://www.w3.org/2000/svg"
            viewBox="0 0 20 20"
            fill="currentColor"
            className="w-3.5 h-3.5 text-success"
            aria-hidden="true"
          >
            <path
              fillRule="evenodd"
              d="M16.704 4.153a.75.75 0 01.143 1.052l-8 10.5a.75.75 0 01-1.127.075l-4.5-4.5a.75.75 0 011.06-1.06l3.894 3.893 7.48-9.817a.75.75 0 011.05-.143z"
              clipRule="evenodd"
            />
          </svg>
        ) : (
          <span className="text-tile-xs font-mono font-bold text-warning leading-none">
            {remainingSec}
          </span>
        )}
      </div>

      {/* reduced-motion 대체: 숫자만 표시 */}
      <span className="motion-safe:hidden motion-reduce:inline text-tile-xs font-mono font-bold text-warning">
        {isComplete ? "" : `${remainingSec}s`}
      </span>
    </div>
  );
});

CooldownProgress.displayName = "CooldownProgress";

export default CooldownProgress;
