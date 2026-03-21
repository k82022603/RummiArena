"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import type { StageNumber } from "@/lib/practice/stage-configs";
import { STAGE_CONFIGS, STAGE_NUMBERS } from "@/lib/practice/stage-configs";
import PracticeBoard from "@/components/practice/PracticeBoard";
import HintPanel from "@/components/practice/HintPanel";
import ProgressBar from "@/components/practice/ProgressBar";
import TutorialOverlay from "@/components/practice/TutorialOverlay";
import ScoreDisplay from "@/components/practice/ScoreDisplay";

interface StagePlayClientProps {
  stageNum: StageNumber;
}

// localStorage 키
const LS_COMPLETED_KEY = "practice_completed_stages";
const LS_BEST_SCORES_KEY = "practice_best_scores";

function loadCompleted(): StageNumber[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(LS_COMPLETED_KEY);
    return raw ? (JSON.parse(raw) as StageNumber[]) : [];
  } catch {
    return [];
  }
}

function saveCompleted(stages: StageNumber[]) {
  if (typeof window === "undefined") return;
  localStorage.setItem(LS_COMPLETED_KEY, JSON.stringify(stages));
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

function saveBestScore(stage: StageNumber, score: number) {
  if (typeof window === "undefined") return;
  const scores = loadBestScores();
  const prev = scores[stage] ?? 0;
  if (score > prev) {
    scores[stage] = score;
    localStorage.setItem(LS_BEST_SCORES_KEY, JSON.stringify(scores));
  }
}

/**
 * 스테이지 플레이 클라이언트 컴포넌트
 *
 * 레이아웃:
 * - 상단: 헤더 (뒤로가기 + 스테이지 진행도 + 튜토리얼 메시지)
 * - 중앙: PracticeBoard (드래그 앤 드롭 보드)
 * - 우측: HintPanel
 * - 오버레이: TutorialOverlay (첫 진입) / ScoreDisplay (클리어)
 */
export default function StagePlayClient({ stageNum }: StagePlayClientProps) {
  const router = useRouter();
  const config = STAGE_CONFIGS[stageNum];

  const [showTutorial, setShowTutorial] = useState(true);
  const [clearedScore, setClearedScore] = useState<number | null>(null);
  const [completedStages, setCompletedStages] = useState<StageNumber[]>([]);
  const [boardKey, setBoardKey] = useState(0); // 보드 리셋 키
  const [dynamicHint, setDynamicHint] = useState<string>(config.defaultHint);

  useEffect(() => {
    setCompletedStages(loadCompleted());
  }, []);

  // ------------------------------------------------------------------
  // 클리어 처리
  // ------------------------------------------------------------------

  const handleClear = useCallback(
    (score: number) => {
      setClearedScore(score);
      saveBestScore(stageNum, score);

      // 완료 목록에 추가
      const updated = loadCompleted();
      if (!updated.includes(stageNum)) {
        updated.push(stageNum);
      }
      saveCompleted(updated);
      setCompletedStages(updated);
    },
    [stageNum]
  );

  // ------------------------------------------------------------------
  // 다음 스테이지 이동
  // ------------------------------------------------------------------

  const handleNextStage = useCallback(() => {
    const nextNum = (stageNum + 1) as StageNumber;
    router.push(`/practice/${nextNum}`);
  }, [stageNum, router]);

  // ------------------------------------------------------------------
  // 다시 하기
  // ------------------------------------------------------------------

  const handleRetry = useCallback(() => {
    setClearedScore(null);
    setDynamicHint(config.defaultHint);
    setBoardKey((k) => k + 1);
  }, [config.defaultHint]);

  // ------------------------------------------------------------------
  // 렌더링
  // ------------------------------------------------------------------

  const hasNext = stageNum < STAGE_NUMBERS[STAGE_NUMBERS.length - 1];

  return (
    <>
      {/* 튜토리얼 오버레이 */}
      <TutorialOverlay
        isVisible={showTutorial}
        stageName={`Stage ${stageNum}: ${config.name}`}
        message={config.tutorialMessage}
        onDismiss={() => setShowTutorial(false)}
      />

      {/* 클리어 결과 화면 */}
      <ScoreDisplay
        score={clearedScore ?? 0}
        isCleared={clearedScore !== null}
        stageNum={stageNum}
        totalStages={STAGE_NUMBERS.length}
        onNextStage={hasNext ? handleNextStage : undefined}
        onRetry={handleRetry}
        onBackToList={() => router.push("/practice")}
      />

      {/* 메인 레이아웃 */}
      <div className="min-h-screen bg-app-bg text-text-primary flex flex-col overflow-hidden">
        {/* 헤더 */}
        <header className="flex-shrink-0 bg-panel-bg border-b border-border px-4 py-3">
          <div className="max-w-5xl mx-auto flex items-center gap-4">
            {/* 뒤로가기 */}
            <button
              type="button"
              onClick={() => router.push("/practice")}
              className="text-text-secondary hover:text-text-primary transition-colors flex-shrink-0"
              aria-label="스테이지 목록으로 돌아가기"
            >
              &larr;
            </button>

            {/* 스테이지 이름 */}
            <h1 className="text-base font-bold flex-shrink-0">
              Stage {stageNum}:{" "}
              <span className="text-text-secondary font-normal">
                {config.name}
              </span>
            </h1>

            {/* 진행도 */}
            <div className="flex-1 flex justify-center">
              <ProgressBar
                total={STAGE_NUMBERS.length}
                current={stageNum}
                completed={completedStages}
              />
            </div>

            {/* 튜토리얼 다시 보기 */}
            <button
              type="button"
              onClick={() => setShowTutorial(true)}
              className="text-xs text-text-secondary hover:text-[var(--border-active)] transition-colors flex-shrink-0"
              aria-label="튜토리얼 다시 보기"
            >
              도움말
            </button>
          </div>
        </header>

        {/* 튜토리얼 메시지 배너 */}
        <AnimatePresence>
          {!showTutorial && (
            <motion.div
              initial={{ opacity: 0, y: -8 }}
              animate={{ opacity: 1, y: 0 }}
              className="flex-shrink-0 bg-[var(--border-active)]/8 border-b border-[var(--border-active)]/20 px-4 py-2"
            >
              <p className="max-w-5xl mx-auto text-sm text-[var(--border-active)]/90 text-center">
                {config.description}
              </p>
            </motion.div>
          )}
        </AnimatePresence>

        {/* 본문: 보드 + 힌트 패널 */}
        <div className="flex-1 flex overflow-hidden">
          <main className="flex-1 p-4 overflow-auto">
            <div className="max-w-5xl mx-auto h-full">
              <PracticeBoard
                key={boardKey}
                stageNum={stageNum}
                goal={config.goal}
                initialHand={config.hand}
                clearCondition={config.clearCondition}
                defaultHint={config.defaultHint}
                onClear={handleClear}
                onReset={() => setDynamicHint(config.defaultHint)}
                onHintChange={setDynamicHint}
              />
            </div>
          </main>

          {/* 힌트 패널 (우측 사이드) */}
          <aside className="w-56 flex-shrink-0 p-4 hidden sm:block">
            <HintPanel
              hint={dynamicHint}
              clearCondition={config.clearCondition}
            />
          </aside>
        </div>
      </div>
    </>
  );
}
