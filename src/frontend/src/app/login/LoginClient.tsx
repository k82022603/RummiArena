"use client";

import { signIn } from "next-auth/react";
import { motion } from "framer-motion";
import { useState } from "react";

interface LoginClientProps {
  hasGoogleProvider: boolean;
}

/**
 * Google OAuth 로그인 + 개발용 게스트 로그인 UI (Client Component)
 * hasGoogleProvider: 서버에서 Google OAuth 프로바이더 등록 여부를 전달받음
 */
export default function LoginClient({ hasGoogleProvider }: LoginClientProps) {
  const [loading, setLoading] = useState(false);
  const [guestLoading, setGuestLoading] = useState(false);
  const [nickname, setNickname] = useState("");
  const [guestError, setGuestError] = useState("");

  const handleGoogleLogin = async () => {
    setLoading(true);
    await signIn("google", { callbackUrl: "/lobby" });
  };

  const handleGuestLogin = async () => {
    const trimmed = nickname.trim();
    if (!trimmed) {
      setGuestError("닉네임을 입력해 주세요.");
      return;
    }
    if (trimmed.length < 2 || trimmed.length > 12) {
      setGuestError("닉네임은 2~12자여야 합니다.");
      return;
    }
    setGuestError("");
    setGuestLoading(true);
    const userId =
      trimmed.toLowerCase().replace(/\s/g, "-") + "-" + Date.now();
    const result = await signIn("dev-login", {
      userId,
      displayName: trimmed,
      callbackUrl: "/lobby",
      redirect: false,
    });
    if (result?.error) {
      setGuestError("게스트 로그인에 실패했습니다. 게임 서버 연결을 확인하세요.");
      setGuestLoading(false);
    } else if (result?.url) {
      window.location.href = result.url;
    }
  };

  return (
    <main
      className="min-h-screen flex items-center justify-center bg-app-bg"
      aria-label="로그인 페이지"
    >
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4 }}
        className="w-full max-w-sm mx-4"
      >
        {/* 로고 영역 */}
        <div className="text-center mb-10">
          <motion.h1
            initial={{ scale: 0.8 }}
            animate={{ scale: 1 }}
            transition={{ type: "spring", stiffness: 200, delay: 0.1 }}
            className="text-4xl font-bold text-text-primary tracking-tight"
          >
            Rummi
            <span className="text-warning">Arena</span>
          </motion.h1>
          <p className="mt-2 text-text-secondary text-tile-base">
            AI와 함께하는 루미큐브 대전 플랫폼
          </p>

          {/* 타일 장식 */}
          <div className="flex justify-center gap-1.5 mt-4" aria-hidden="true">
            {(["R7a", "B7a", "Y7a", "K7b"] as const).map((code, i) => {
              const colors = ["bg-tile-red", "bg-tile-blue", "bg-tile-yellow", "bg-tile-black"];
              const textColors = ["text-white", "text-white", "text-gray-900", "text-white"];
              return (
                <motion.div
                  key={code}
                  initial={{ opacity: 0, y: -10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.2 + i * 0.08 }}
                  className={[
                    "w-9 h-12 rounded-md shadow flex items-center justify-center",
                    "font-mono font-bold text-lg",
                    colors[i],
                    textColors[i],
                  ].join(" ")}
                >
                  7
                </motion.div>
              );
            })}
          </div>
        </div>

        {/* 로그인 카드 */}
        <div className="bg-card-bg border border-border rounded-2xl p-8 shadow-xl">
          <h2 className="text-tile-lg font-semibold text-text-primary mb-6 text-center">
            시작하기
          </h2>

          {hasGoogleProvider ? (
            <button
              type="button"
              onClick={handleGoogleLogin}
              disabled={loading || guestLoading}
              className={[
                "w-full flex items-center justify-center gap-3",
                "px-4 py-3 rounded-xl font-medium",
                "bg-white text-gray-900 hover:bg-gray-50",
                "border border-gray-200 shadow-sm",
                "transition-all duration-200",
                "focus-visible:ring-2 focus-visible:ring-warning",
                loading ? "opacity-70 cursor-not-allowed" : "",
              ].join(" ")}
              aria-busy={loading}
              aria-label="Google 계정으로 로그인"
            >
              {loading ? (
                <motion.div
                  animate={{ rotate: 360 }}
                  transition={{ repeat: Infinity, duration: 0.8, ease: "linear" }}
                  className="w-5 h-5 border-2 border-gray-400 border-t-gray-900 rounded-full"
                  aria-hidden="true"
                />
              ) : (
                /* Google 로고 SVG */
                <svg
                  aria-hidden="true"
                  width="20"
                  height="20"
                  viewBox="0 0 24 24"
                >
                  <path
                    d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
                    fill="#4285F4"
                  />
                  <path
                    d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                    fill="#34A853"
                  />
                  <path
                    d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
                    fill="#FBBC05"
                  />
                  <path
                    d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
                    fill="#EA4335"
                  />
                </svg>
              )}
              <span>{loading ? "로그인 중..." : "Google로 계속하기"}</span>
            </button>
          ) : (
            <div
              className={[
                "w-full flex items-center justify-center gap-3",
                "px-4 py-3 rounded-xl font-medium",
                "bg-gray-100 text-gray-400",
                "border border-gray-200",
                "cursor-not-allowed select-none",
              ].join(" ")}
              role="status"
              aria-label="Google 로그인 미설정"
              title="GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET 환경변수를 설정해주세요"
            >
              <svg
                aria-hidden="true"
                width="20"
                height="20"
                viewBox="0 0 24 24"
                opacity="0.4"
              >
                <path
                  d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
                  fill="#4285F4"
                />
                <path
                  d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                  fill="#34A853"
                />
                <path
                  d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
                  fill="#FBBC05"
                />
                <path
                  d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
                  fill="#EA4335"
                />
              </svg>
              <span className="text-tile-sm">Google 로그인 (미설정)</span>
            </div>
          )}

          {/* 구분선 — Google 프로바이더 미설정 시에도 표시하여 게스트 로그인 안내 유지 */}
          <div className="relative my-5" aria-hidden="true">
            <div className="absolute inset-0 flex items-center">
              <div className="w-full border-t border-border" />
            </div>
            <div className="relative flex justify-center">
              <span className="bg-card-bg px-3 text-tile-xs text-text-secondary">
                {hasGoogleProvider ? "또는" : "게스트로 시작하기"}
              </span>
            </div>
          </div>

          {/* 게스트 로그인 */}
          <div className="space-y-3">
            <label
              htmlFor="guest-nickname"
              className="block text-tile-sm font-medium text-text-secondary"
            >
              닉네임
            </label>
            <input
              id="guest-nickname"
              type="text"
              value={nickname}
              onChange={(e) => {
                setNickname(e.target.value);
                if (guestError) setGuestError("");
              }}
              onKeyDown={(e) => {
                if (e.key === "Enter") void handleGuestLogin();
              }}
              placeholder="닉네임 입력 (예: 테스터)"
              maxLength={12}
              disabled={guestLoading || loading}
              className={[
                "w-full px-4 py-3 rounded-xl",
                "bg-app-bg border text-text-primary placeholder-text-secondary",
                "text-tile-sm font-medium",
                "transition-colors duration-150 outline-none",
                "focus:ring-2 focus:ring-warning",
                guestError ? "border-red-500" : "border-border",
                guestLoading || loading ? "opacity-60 cursor-not-allowed" : "",
              ].join(" ")}
              aria-describedby={guestError ? "guest-error" : undefined}
              aria-invalid={!!guestError}
            />
            {guestError && (
              <p
                id="guest-error"
                role="alert"
                className="text-tile-xs text-red-500"
              >
                {guestError}
              </p>
            )}
            <button
              type="button"
              onClick={() => void handleGuestLogin()}
              disabled={guestLoading || loading}
              className={[
                "w-full flex items-center justify-center gap-2",
                "px-4 py-3 rounded-xl font-medium",
                "bg-warning text-gray-900 hover:bg-yellow-400",
                "transition-all duration-200",
                "focus-visible:ring-2 focus-visible:ring-warning focus-visible:ring-offset-2",
                guestLoading || loading ? "opacity-70 cursor-not-allowed" : "",
              ].join(" ")}
              aria-busy={guestLoading}
              aria-label="게스트로 로그인"
            >
              {guestLoading ? (
                <motion.div
                  animate={{ rotate: 360 }}
                  transition={{
                    repeat: Infinity,
                    duration: 0.8,
                    ease: "linear",
                  }}
                  className="w-5 h-5 border-2 border-gray-600 border-t-gray-900 rounded-full"
                  aria-hidden="true"
                />
              ) : (
                <svg
                  aria-hidden="true"
                  width="18"
                  height="18"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
                  <circle cx="12" cy="7" r="4" />
                </svg>
              )}
              <span>{guestLoading ? "로그인 중..." : "게스트 로그인"}</span>
            </button>
            <p className="text-center text-tile-xs text-text-secondary">
              게스트 계정은 개발·테스트 전용입니다.
            </p>
          </div>

          <p className="mt-4 text-center text-tile-xs text-text-secondary">
            로그인하면{" "}
            <span className="text-text-primary">이용약관</span>에 동의하는
            것으로 간주됩니다.
          </p>
        </div>
      </motion.div>
    </main>
  );
}
