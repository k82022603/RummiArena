"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import type { StageNumber } from "@/lib/practice/stage-configs";
import { STAGE_NUMBERS } from "@/lib/practice/stage-configs";
import StageSelector from "@/components/practice/StageSelector";

const LS_COMPLETED_KEY = "practice_completed_stages";
const LS_BEST_SCORES_KEY = "practice_best_scores";

function loadCompleted(): StageNumber[] {
  if (typeof window === "undefined") return [1];
  try {
    const raw = localStorage.getItem(LS_COMPLETED_KEY);
    return raw ? (JSON.parse(raw) as StageNumber[]) : [];
  } catch {
    return [];
  }
}

function loadBestScores(): Partial<Record<StageNumber, number>> {
  if (typeof window === "undefined") return {};
  try {
    const raw = localStorage.getItem(LS_BEST_SCORES_KEY);
    return raw
      ? (JSON.parse(raw) as Partial<Record<StageNumber, number>>)
      : {};
  } catch {
    return {};
  }
}

/**
 * 연습 모드 스테이지 선택 화면 (Client Component)
 *
 * - Stage 1~6: 그룹 / 런 / 조커 활용 / 조커 마스터 / 복합 배치 / 루미큐브 마스터
 * - Stage 1은 기본 잠금 해제, 이후는 이전 스테이지 완료 시 순차 해제
 * - 완료/최고 점수 정보는 localStorage에서 로드
 */
export default function PracticeClient() {
  const router = useRouter();
  const [completedStages, setCompletedStages] = useState<StageNumber[]>([]);
  const [bestScores, setBestScores] = useState<
    Partial<Record<StageNumber, number>>
  >({});

  useEffect(() => {
    setCompletedStages(loadCompleted());
    setBestScores(loadBestScores());
  }, []);

  // 잠금 해제된 스테이지: Stage 1은 항상 열림, 이후는 이전 완료 시 순차 해제
  const unlockedStages: StageNumber[] = [1];
  for (let i = 1; i < STAGE_NUMBERS.length; i++) {
    const prev = STAGE_NUMBERS[i - 1];
    const curr = STAGE_NUMBERS[i];
    if (completedStages.includes(prev)) {
      unlockedStages.push(curr);
    }
  }

  return (
    <main className="min-h-screen bg-app-bg text-text-primary">
      {/* 헤더 */}
      <header className="border-b border-border bg-panel-bg px-6 py-4">
        <div className="max-w-3xl mx-auto flex items-center gap-3">
          <button
            type="button"
            onClick={() => router.push("/lobby")}
            className="text-text-secondary hover:text-text-primary transition-colors"
            aria-label="로비로 돌아가기"
          >
            &larr;
          </button>
          <h1 className="text-xl font-bold">연습 모드</h1>
        </div>
      </header>

      <div className="max-w-3xl mx-auto px-6 py-8">
        <p className="text-text-secondary mb-6">
          단계별 학습으로 루미큐브 기본기를 익혀보세요. 그룹·런·조커 활용을
          순서대로 연습합니다.
        </p>

        <StageSelector
          unlockedStages={unlockedStages}
          bestScores={bestScores}
          onSelect={(stage) => router.push(`/practice/${stage}`)}
        />
      </div>
    </main>
  );
}
