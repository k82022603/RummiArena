"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { useSession } from "next-auth/react";
import { motion } from "framer-motion";
import { createRoom } from "@/lib/api";
import { useRoomStore } from "@/store/roomStore";
import type { AIPersona, AIDifficulty, AIPlayerType } from "@/types/game";

interface AISlot {
  type: AIPlayerType;
  persona: AIPersona;
  difficulty: AIDifficulty;
  psychologyLevel: 0 | 1 | 2 | 3;
}

const AI_TYPES: { value: AIPlayerType; label: string }[] = [
  { value: "AI_OPENAI", label: "GPT (OpenAI)" },
  { value: "AI_CLAUDE", label: "Claude (Anthropic)" },
  { value: "AI_DEEPSEEK", label: "DeepSeek" },
  { value: "AI_LLAMA", label: "LLaMA (Ollama)" },
];

const PERSONAS: { value: AIPersona; label: string; desc: string }[] = [
  { value: "rookie", label: "루키", desc: "초보 전략, 단순 배치" },
  { value: "calculator", label: "계산기", desc: "확률 기반 최적화" },
  { value: "shark", label: "샤크", desc: "공격적, 빠른 소진 우선" },
  { value: "fox", label: "폭스", desc: "상대 관찰, 블러핑" },
  { value: "wall", label: "벽", desc: "수비적, 타일 보유 최소화" },
  { value: "wildcard", label: "와일드카드", desc: "무작위 혼합 전략" },
];

const DEFAULT_AI: AISlot = {
  type: "AI_OPENAI",
  persona: "shark",
  difficulty: "expert",
  psychologyLevel: 2,
};

/**
 * Room 생성 폼 (Client Component)
 * createRoom API 호출 후 대기실로 이동
 * API 실패 시 mock 데이터 fallback
 */
export default function CreateRoomClient() {
  const router = useRouter();
  const { data: session } = useSession();
  const { setCurrentRoom } = useRoomStore();

  const [playerCount, setPlayerCount] = useState<2 | 3 | 4>(4);
  const [turnTimeoutSec, setTurnTimeoutSec] = useState(60);
  const [aiSlots, setAiSlots] = useState<AISlot[]>([{ ...DEFAULT_AI }]);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const maxAI = playerCount - 1;

  const addAI = () => {
    if (aiSlots.length >= maxAI) return;
    setAiSlots([...aiSlots, { ...DEFAULT_AI }]);
  };

  const removeAI = (idx: number) => {
    setAiSlots(aiSlots.filter((_, i) => i !== idx));
  };

  const updateAI = (idx: number, patch: Partial<AISlot>) => {
    setAiSlots(aiSlots.map((s, i) => (i === idx ? { ...s, ...patch } : s)));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    setError(null);

    try {
      const token = session?.accessToken;
      const room = await createRoom({
        playerCount,
        turnTimeoutSec,
        aiPlayers: aiSlots,
        displayName: session?.user?.name ?? undefined,
      }, token);

      // roomStore에 현재 방 저장
      setCurrentRoom(room);

      // 대기실로 이동
      router.push(`/room/${room.id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "알 수 없는 오류가 발생했습니다.");
      setSubmitting(false);
    }
  };

  return (
    <main className="min-h-screen bg-app-bg text-text-primary">
      <header className="border-b border-border bg-panel-bg px-6 py-4">
        <div className="max-w-2xl mx-auto flex items-center gap-3">
          <button
            type="button"
            onClick={() => router.push("/lobby")}
            className="text-text-secondary hover:text-text-primary transition-colors"
            aria-label="로비로 돌아가기"
          >
            &larr;
          </button>
          <h1 className="text-xl font-bold">새 게임 만들기</h1>
        </div>
      </header>

      <div className="max-w-2xl mx-auto px-6 py-8">
        <form onSubmit={(e) => void handleSubmit(e)} aria-label="게임 방 생성 폼">
          {/* 인원 설정 */}
          <section className="mb-6" aria-labelledby="player-count-label">
            <h2
              id="player-count-label"
              className="text-tile-base font-semibold mb-3"
            >
              플레이어 수
            </h2>
            <div className="flex gap-2">
              {([2, 3, 4] as const).map((n) => (
                <button
                  key={n}
                  type="button"
                  onClick={() => {
                    setPlayerCount(n);
                    setAiSlots(aiSlots.slice(0, n - 1));
                  }}
                  className={[
                    "flex-1 py-2.5 rounded-xl font-medium border transition-colors",
                    playerCount === n
                      ? "bg-warning text-gray-900 border-warning"
                      : "bg-card-bg border-border hover:border-border-active",
                  ].join(" ")}
                  aria-pressed={playerCount === n}
                >
                  {n}인
                </button>
              ))}
            </div>
          </section>

          {/* 턴 타임아웃 */}
          <section className="mb-6" aria-labelledby="timeout-label">
            <h2 id="timeout-label" className="text-tile-base font-semibold mb-3">
              턴 제한 시간:{" "}
              <span className="text-warning font-mono">{turnTimeoutSec}초</span>
            </h2>
            <div className="flex gap-2 mb-2">
              {[30, 60, 90, 120].map((sec) => (
                <button
                  key={sec}
                  type="button"
                  onClick={() => setTurnTimeoutSec(sec)}
                  className={[
                    "flex-1 py-1.5 rounded-lg text-tile-sm font-medium border transition-colors",
                    turnTimeoutSec === sec
                      ? "bg-warning text-gray-900 border-warning"
                      : "bg-card-bg border-border hover:border-border-active text-text-secondary",
                  ].join(" ")}
                  aria-pressed={turnTimeoutSec === sec}
                >
                  {sec}초
                </button>
              ))}
            </div>
            <input
              type="range"
              min={30}
              max={120}
              step={10}
              value={turnTimeoutSec}
              onChange={(e) => setTurnTimeoutSec(Number(e.target.value))}
              className="w-full accent-warning"
              aria-label="턴 제한 시간 설정 (30~120초)"
            />
            <div className="flex justify-between text-tile-xs text-text-secondary mt-1">
              <span>30초</span>
              <span>120초</span>
            </div>
          </section>

          {/* AI 플레이어 설정 */}
          <section className="mb-8" aria-labelledby="ai-config-label">
            <div className="flex items-center justify-between mb-3">
              <h2 id="ai-config-label" className="text-tile-base font-semibold">
                AI 플레이어 ({aiSlots.length}/{maxAI})
              </h2>
              {aiSlots.length < maxAI && (
                <button
                  type="button"
                  onClick={addAI}
                  className="text-tile-sm text-warning hover:underline"
                  aria-label="AI 플레이어 추가"
                >
                  + AI 추가
                </button>
              )}
            </div>

            <div className="flex flex-col gap-3">
              {aiSlots.map((slot, idx) => (
                <motion.div
                  key={idx}
                  initial={{ opacity: 0, x: -10 }}
                  animate={{ opacity: 1, x: 0 }}
                  className="p-4 bg-card-bg rounded-xl border border-border"
                  aria-label={`AI 슬롯 ${idx + 1}`}
                >
                  <div className="flex items-center justify-between mb-3">
                    <span className="text-tile-sm font-medium text-color-ai">
                      AI #{idx + 1} (Seat {idx + 1})
                    </span>
                    <button
                      type="button"
                      onClick={() => removeAI(idx)}
                      className="text-tile-xs text-danger hover:underline"
                      aria-label={`AI ${idx + 1} 제거`}
                    >
                      제거
                    </button>
                  </div>

                  <div className="grid grid-cols-2 gap-2">
                    {/* 모델 */}
                    <div>
                      <label className="text-tile-xs text-text-secondary block mb-1">
                        모델
                      </label>
                      <select
                        value={slot.type}
                        onChange={(e) =>
                          updateAI(idx, { type: e.target.value as AIPlayerType })
                        }
                        className="w-full px-2 py-1.5 rounded-lg bg-panel-bg border border-border text-text-primary text-tile-sm"
                        aria-label={`AI ${idx + 1} 모델 선택`}
                      >
                        {AI_TYPES.map((t) => (
                          <option key={t.value} value={t.value}>
                            {t.label}
                          </option>
                        ))}
                      </select>
                    </div>

                    {/* 난이도 */}
                    <div>
                      <label className="text-tile-xs text-text-secondary block mb-1">
                        난이도
                      </label>
                      <select
                        value={slot.difficulty}
                        onChange={(e) =>
                          updateAI(idx, {
                            difficulty: e.target.value as AIDifficulty,
                          })
                        }
                        className="w-full px-2 py-1.5 rounded-lg bg-panel-bg border border-border text-text-primary text-tile-sm"
                        aria-label={`AI ${idx + 1} 난이도 선택`}
                      >
                        <option value="beginner">하수</option>
                        <option value="intermediate">중수</option>
                        <option value="expert">고수</option>
                      </select>
                    </div>

                    {/* 페르소나 */}
                    <div className="col-span-2">
                      <label className="text-tile-xs text-text-secondary block mb-1">
                        캐릭터 (페르소나)
                      </label>
                      <div className="grid grid-cols-3 gap-1">
                        {PERSONAS.map((p) => (
                          <button
                            key={p.value}
                            type="button"
                            onClick={() => updateAI(idx, { persona: p.value })}
                            className={[
                              "py-1 px-2 rounded-lg text-tile-xs border transition-colors text-left",
                              slot.persona === p.value
                                ? "bg-color-ai/20 border-color-ai text-color-ai"
                                : "bg-panel-bg border-border text-text-secondary hover:border-border-active",
                            ].join(" ")}
                            title={p.desc}
                            aria-pressed={slot.persona === p.value}
                            aria-label={`${p.label}: ${p.desc}`}
                          >
                            {p.label}
                          </button>
                        ))}
                      </div>
                    </div>

                    {/* 심리전 레벨 */}
                    <div className="col-span-2">
                      <label className="text-tile-xs text-text-secondary block mb-1">
                        심리전 레벨:{" "}
                        <span className="text-color-ai font-medium">
                          {slot.psychologyLevel}
                        </span>
                      </label>
                      <input
                        type="range"
                        min={0}
                        max={3}
                        step={1}
                        value={slot.psychologyLevel}
                        onChange={(e) =>
                          updateAI(idx, {
                            psychologyLevel: Number(
                              e.target.value
                            ) as 0 | 1 | 2 | 3,
                          })
                        }
                        className="w-full accent-color-ai"
                        aria-label={`AI ${idx + 1} 심리전 레벨 (0~3)`}
                      />
                      <div className="flex justify-between text-tile-xs text-text-secondary mt-0.5">
                        <span>없음</span>
                        <span>강함</span>
                      </div>
                    </div>
                  </div>
                </motion.div>
              ))}

              {aiSlots.length === 0 && (
                <div className="py-4 text-center text-text-secondary text-tile-sm border border-dashed border-border rounded-xl">
                  AI 플레이어 없음 (인간 플레이어끼리 대전)
                </div>
              )}
            </div>
          </section>

          {/* 에러 메시지 */}
          {error && (
            <div
              className="mb-4 p-3 rounded-lg bg-danger/10 border border-danger/30 text-danger text-tile-sm"
              role="alert"
            >
              {error}
            </div>
          )}

          {/* 생성 버튼 */}
          <button
            type="submit"
            disabled={submitting}
            className={[
              "w-full py-3.5 rounded-xl font-bold text-tile-base",
              "bg-warning text-gray-900 hover:bg-yellow-400",
              "disabled:opacity-50 disabled:cursor-not-allowed",
              "transition-colors",
            ].join(" ")}
            aria-busy={submitting}
          >
            {submitting ? "생성 중..." : "게임 방 만들기"}
          </button>
        </form>
      </div>
    </main>
  );
}
