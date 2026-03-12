"use client";

import { useRouter } from "next/navigation";
import { motion } from "framer-motion";
import { useState, useEffect } from "react";

interface Stage {
  stage: number;
  name: string;
  description: string;
  unlocked: boolean;
  bestScore: number | null;
}

const MOCK_STAGES: Stage[] = [
  { stage: 1, name: "최초 등록", description: "30점 이상 조합으로 첫 배치 연습", unlocked: true, bestScore: 85 },
  { stage: 2, name: "런 만들기", description: "같은 색상 연속 숫자 3개 이상", unlocked: true, bestScore: null },
  { stage: 3, name: "그룹 만들기", description: "같은 숫자 다른 색상 3~4개", unlocked: false, bestScore: null },
  { stage: 4, name: "테이블 재배치", description: "기존 테이블 타일을 활용한 재배치", unlocked: false, bestScore: null },
  { stage: 5, name: "조커 활용", description: "조커를 전략적으로 사용", unlocked: false, bestScore: null },
  { stage: 6, name: "종합 실전", description: "AI 1명 상대 자유 대전", unlocked: false, bestScore: null },
];

/**
 * 연습 모드 스테이지 선택 (Client Component)
 * API 연동 전까지 목(mock) 데이터 사용
 */
export default function PracticeClient() {
  const router = useRouter();
  const [stages, setStages] = useState<Stage[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // TODO: GET /api/practice/stages API 연동
    const timer = setTimeout(() => {
      setStages(MOCK_STAGES);
      setLoading(false);
    }, 300);
    return () => clearTimeout(timer);
  }, []);

  const handleStartStage = async (stageNum: number) => {
    // TODO: POST /api/practice/start { stage: stageNum } 후 세션 ID로 이동
    router.push(`/practice/${stageNum}`);
  };

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
          단계별 학습으로 루미큐브 실력을 키워보세요. Stage 6에서는 AI와 실전
          대결도 가능합니다.
        </p>

        {loading ? (
          <div className="flex justify-center py-12">
            <motion.div
              animate={{ rotate: 360 }}
              transition={{ repeat: Infinity, duration: 1, ease: "linear" }}
              className="w-8 h-8 border-2 border-border border-t-warning rounded-full"
              aria-label="로딩 중"
            />
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {stages.map((stage, idx) => (
              <motion.div
                key={stage.stage}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: idx * 0.06 }}
                className={[
                  "p-5 rounded-2xl border",
                  stage.unlocked
                    ? "bg-card-bg border-border hover:border-border-active cursor-pointer"
                    : "bg-card-bg/50 border-border/50 cursor-not-allowed opacity-60",
                ].join(" ")}
                onClick={() => stage.unlocked && handleStartStage(stage.stage)}
                role="button"
                tabIndex={stage.unlocked ? 0 : -1}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && stage.unlocked)
                    handleStartStage(stage.stage);
                }}
                aria-disabled={!stage.unlocked}
                aria-label={`Stage ${stage.stage}: ${stage.name}`}
              >
                <div className="flex items-start justify-between mb-2">
                  <span className="text-tile-xs text-text-secondary font-mono">
                    STAGE {stage.stage}
                  </span>
                  {stage.bestScore !== null && (
                    <span className="text-tile-xs text-success">
                      최고 {stage.bestScore}점
                    </span>
                  )}
                  {!stage.unlocked && (
                    <span className="text-tile-xs text-text-secondary">
                      잠금
                    </span>
                  )}
                </div>
                <h3 className="font-semibold text-tile-lg text-text-primary mb-1">
                  {stage.name}
                </h3>
                <p className="text-tile-sm text-text-secondary">
                  {stage.description}
                </p>
              </motion.div>
            ))}
          </div>
        )}
      </div>
    </main>
  );
}
