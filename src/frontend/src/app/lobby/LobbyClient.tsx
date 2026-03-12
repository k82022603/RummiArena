"use client";

import { useSession, signOut } from "next-auth/react";
import { useRouter } from "next/navigation";
import { motion } from "framer-motion";
import { useState } from "react";

/**
 * 로비 클라이언트 컴포넌트
 * - Room 목록 조회 (추후 API 연동)
 * - Room 생성 / 코드로 참가
 * - 연습 모드 진입
 */
export default function LobbyClient() {
  const { data: session } = useSession();
  const router = useRouter();
  const [joinCode, setJoinCode] = useState("");

  const handleJoinByCode = () => {
    const code = joinCode.trim().toUpperCase();
    if (code.length === 4) {
      router.push(`/room/${code}`);
    }
  };

  return (
    <main
      className="min-h-screen bg-app-bg text-text-primary"
      aria-label="로비 페이지"
    >
      {/* 헤더 */}
      <header className="border-b border-border bg-panel-bg px-6 py-4">
        <div className="max-w-6xl mx-auto flex items-center justify-between">
          <h1 className="text-xl font-bold">
            Rummi<span className="text-warning">Arena</span>
          </h1>
          <div className="flex items-center gap-3">
            <span className="text-tile-sm text-text-secondary">
              {session?.user?.name ?? ""}
            </span>
            <button
              type="button"
              onClick={() => signOut({ callbackUrl: "/login" })}
              className="text-tile-sm text-text-secondary hover:text-text-primary transition-colors"
              aria-label="로그아웃"
            >
              로그아웃
            </button>
          </div>
        </div>
      </header>

      <div className="max-w-6xl mx-auto px-6 py-8">
        {/* 환영 메시지 */}
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          className="mb-8"
        >
          <h2 className="text-2xl font-bold">
            안녕하세요, {session?.user?.name ?? "플레이어"}님!
          </h2>
          <p className="text-text-secondary mt-1">게임을 시작해 보세요.</p>
        </motion.div>

        {/* 액션 카드 그리드 */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-8">
          {/* Room 생성 */}
          <motion.button
            type="button"
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.98 }}
            onClick={() => router.push("/room/create")}
            className={[
              "p-6 rounded-2xl bg-card-bg border border-border",
              "text-left hover:border-border-active transition-colors",
              "focus-visible:ring-2 focus-visible:ring-warning",
            ].join(" ")}
            aria-label="새 게임 방 만들기"
          >
            <div className="text-2xl mb-2" aria-hidden="true">
              +
            </div>
            <h3 className="font-semibold text-tile-lg mb-1">새 게임 만들기</h3>
            <p className="text-text-secondary text-tile-sm">
              AI와 규칙을 설정하고 방을 개설합니다.
            </p>
          </motion.button>

          {/* 코드로 참가 */}
          <div
            className="p-6 rounded-2xl bg-card-bg border border-border"
            aria-label="방 코드로 참가"
          >
            <div className="text-2xl mb-2" aria-hidden="true">
              #
            </div>
            <h3 className="font-semibold text-tile-lg mb-3">코드로 참가</h3>
            <div className="flex gap-2">
              <input
                type="text"
                value={joinCode}
                onChange={(e) =>
                  setJoinCode(e.target.value.toUpperCase().slice(0, 4))
                }
                onKeyDown={(e) => e.key === "Enter" && handleJoinByCode()}
                placeholder="ABCD"
                maxLength={4}
                className={[
                  "flex-1 px-3 py-2 rounded-lg",
                  "bg-panel-bg border border-border",
                  "text-text-primary placeholder-text-secondary",
                  "font-mono text-center tracking-widest text-tile-lg",
                  "focus:outline-none focus:border-border-active",
                ].join(" ")}
                aria-label="방 코드 입력 (4자리)"
              />
              <button
                type="button"
                onClick={handleJoinByCode}
                disabled={joinCode.length !== 4}
                className={[
                  "px-3 py-2 rounded-lg font-medium text-tile-sm",
                  "bg-warning text-gray-900 hover:bg-yellow-400",
                  "disabled:opacity-40 disabled:cursor-not-allowed",
                  "transition-colors",
                ].join(" ")}
                aria-label="입력한 코드로 참가"
              >
                참가
              </button>
            </div>
          </div>

          {/* 연습 모드 */}
          <motion.button
            type="button"
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.98 }}
            onClick={() => router.push("/practice")}
            className={[
              "p-6 rounded-2xl bg-card-bg border border-border",
              "text-left hover:border-border-active transition-colors",
              "focus-visible:ring-2 focus-visible:ring-warning",
            ].join(" ")}
            aria-label="연습 모드 시작"
          >
            <div className="text-2xl mb-2" aria-hidden="true">
              *
            </div>
            <h3 className="font-semibold text-tile-lg mb-1">연습 모드</h3>
            <p className="text-text-secondary text-tile-sm">
              Stage 1~6 단계별 루미큐브 연습
            </p>
          </motion.button>
        </div>

        {/* Room 목록 (플레이스홀더) */}
        <section aria-label="진행 중인 게임 목록">
          <h2 className="text-tile-lg font-semibold mb-4">진행 중인 게임</h2>
          <div className="bg-card-bg border border-border rounded-xl p-8 text-center text-text-secondary">
            <p>진행 중인 게임이 없습니다.</p>
            <p className="text-tile-sm mt-1">새 게임을 만들어 보세요!</p>
          </div>
        </section>
      </div>
    </main>
  );
}
