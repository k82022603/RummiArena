"use client";

import { useSession, signOut } from "next-auth/react";
import { useRouter } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import { useEffect, useState, useCallback } from "react";
import { getRooms, joinRoom } from "@/lib/api";
import { useRoomStore } from "@/store/roomStore";
import type { Room } from "@/types/game";

// ------------------------------------------------------------------
// Room 카드
// ------------------------------------------------------------------

const STATUS_LABEL: Record<string, { label: string; cls: string }> = {
  WAITING: { label: "대기 중", cls: "bg-success/20 text-success" },
  PLAYING: { label: "진행 중", cls: "bg-warning/20 text-warning" },
  FINISHED: { label: "종료", cls: "bg-border text-text-secondary" },
  CANCELLED: { label: "취소", cls: "bg-danger/10 text-danger" },
};

const AI_PERSONA_SHORT: Record<string, string> = {
  rookie: "루키",
  calculator: "계산기",
  shark: "샤크",
  fox: "폭스",
  wall: "벽",
  wildcard: "와일드",
};

function RoomCard({
  room,
  onJoin,
}: {
  room: Room;
  onJoin: (id: string) => void | Promise<void>;
}) {
  const status = STATUS_LABEL[room.status] ?? STATUS_LABEL["WAITING"];
  const aiPlayers = room.players.filter((p): p is Extract<typeof p, { persona: string }> =>
    p.type !== "HUMAN"
  );
  const elapsed = Math.floor(
    (Date.now() - new Date(room.createdAt).getTime()) / 60000
  );

  const hostPlayer = room.players.find(
    (p) => p.type === "HUMAN" && (p as { userId: string }).userId === room.hostUserId
  );
  const hostName =
    hostPlayer && "displayName" in hostPlayer
      ? (hostPlayer as { displayName: string }).displayName
      : "알 수 없음";

  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      className="flex items-center justify-between p-4 bg-card-bg rounded-xl border border-border hover:border-border-active transition-colors"
    >
      {/* 방 코드 */}
      <div className="w-16">
        <span className="font-mono text-tile-lg font-bold text-warning">
          {room.roomCode}
        </span>
      </div>

      {/* 인원 / AI 배지 */}
      <div className="flex-1 px-4">
        <div className="flex items-center gap-2 mb-1">
          <span className="text-tile-sm text-text-primary">
            {room.playerCount} / {room.settings.playerCount}명
          </span>
          {aiPlayers.map((ai, i) => (
            <span
              key={i}
              className="px-1.5 py-0.5 rounded text-tile-xs bg-color-ai/20 text-color-ai"
            >
              {AI_PERSONA_SHORT[ai.persona] ?? "AI"}
            </span>
          ))}
        </div>
        <p className="text-tile-xs text-text-secondary">
          호스트: {hostName} · {elapsed}분 전
        </p>
      </div>

      {/* 타임아웃 */}
      <div className="w-14 text-center">
        <span className="text-tile-xs text-text-secondary">
          {room.settings.turnTimeoutSec}초
        </span>
      </div>

      {/* 상태 배지 */}
      <div className="w-20 text-center">
        <span
          className={`px-2 py-0.5 rounded-full text-tile-xs font-medium ${status.cls}`}
        >
          {status.label}
        </span>
      </div>

      {/* 참가 버튼 — WAITING 상태만 참가 가능 (I3 롤백: PLAYING 방 참가 금지) */}
      <button
        type="button"
        onClick={() => void onJoin(room.id)}
        disabled={room.status !== "WAITING"}
        className={[
          "ml-4 px-4 py-1.5 rounded-lg font-medium text-tile-sm transition-colors",
          room.status === "WAITING"
            ? "bg-warning text-gray-900 hover:bg-yellow-400"
            : "bg-border text-text-secondary cursor-not-allowed",
        ].join(" ")}
        aria-label={`${room.roomCode} 방 참가`}
      >
        참가
      </button>
    </motion.div>
  );
}

// ------------------------------------------------------------------
// 내 프로필 카드 (좌측 패널)
// ------------------------------------------------------------------

function MyProfileCard() {
  const { data: session } = useSession();

  return (
    <div className="p-4 bg-card-bg rounded-xl border border-border">
      {/* 아바타 + 이름 */}
      <div className="flex items-center gap-3 mb-3">
        {session?.user?.image ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={session.user.image}
            alt={session.user.name ?? "프로필"}
            className="w-10 h-10 rounded-full border border-border"
          />
        ) : (
          <div className="w-10 h-10 rounded-full bg-warning/20 flex items-center justify-center text-warning font-bold text-tile-lg">
            {(session?.user?.name ?? "?")[0]}
          </div>
        )}
        <div>
          <p className="text-tile-base font-semibold text-text-primary">
            {session?.user?.name ?? "플레이어"}
          </p>
          <p className="text-tile-xs text-text-secondary">
            {session?.user?.email ?? ""}
          </p>
        </div>
      </div>

      {/* ELO / 통계 */}
      <div className="grid grid-cols-2 gap-2 text-center">
        <div className="bg-panel-bg rounded-lg p-2">
          <p className="text-tile-xl font-bold text-warning">1,247</p>
          <p className="text-tile-xs text-text-secondary">ELO</p>
        </div>
        <div className="bg-panel-bg rounded-lg p-2">
          <p className="text-tile-xl font-bold text-success">54%</p>
          <p className="text-tile-xs text-text-secondary">승률</p>
        </div>
      </div>
    </div>
  );
}

// ------------------------------------------------------------------
// 통계 패널 (우측)
// ------------------------------------------------------------------

function StatsPanel() {
  return (
    <div className="p-4 bg-card-bg rounded-xl border border-border">
      <h3 className="text-tile-sm font-semibold text-text-secondary mb-3 uppercase tracking-wider">
        현재 현황
      </h3>
      <p className="text-tile-xs text-text-secondary text-center py-4">
        통계 준비 중
      </p>
    </div>
  );
}

// ------------------------------------------------------------------
// 메인 LobbyClient
// ------------------------------------------------------------------

/**
 * 로비 클라이언트 컴포넌트
 * 와이어프레임 기준 3단 레이아웃:
 * - 좌측 (320px): 내 프로필 + 빠른 게임 + 연습 모드
 * - 중앙 (flex-1): Room 목록 + 검색 + Room 만들기
 * - 우측 (280px): 접속 통계
 */
export default function LobbyClient() {
  const { data: session } = useSession();
  const router = useRouter();
  const { rooms, setRooms, isLoading, setIsLoading } = useRoomStore();

  const [joinCode, setJoinCode] = useState("");
  const [searchQuery, setSearchQuery] = useState("");
  const [joinError, setJoinError] = useState<string | null>(null);

  // Room 목록 로드
  // I7: 인증 토큰이 아직 없으면 API 호출을 건너뛴다.
  //     세션 로드 완료 후 useCallback 의존성(session)이 변경되어 자동 재호출된다.
  const loadRooms = useCallback(async () => {
    const token = session?.accessToken;
    if (!token) return;

    setIsLoading(true);
    try {
      const data = await getRooms(token);
      setRooms(data);
    } catch (err) {
      console.error("[lobby] getRooms failed:", err);
      setRooms([]);
    } finally {
      setIsLoading(false);
    }
  }, [session, setRooms, setIsLoading]);

  useEffect(() => {
    void loadRooms();
    // 30초마다 갱신
    const interval = setInterval(() => void loadRooms(), 30_000);
    return () => clearInterval(interval);
  }, [loadRooms]);

  const handleJoinByCode = () => {
    const code = joinCode.trim().toUpperCase();
    if (code.length === 4) {
      router.push(`/room/${code}`);
    }
  };

  const handleJoinRoom = async (roomId: string) => {
    const token = session?.accessToken;
    setJoinError(null);
    try {
      await joinRoom(roomId, token, session?.user?.name ?? undefined);
      router.push(`/room/${roomId}`);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "방 참가에 실패했습니다.";
      setJoinError(msg);
    }
  };

  const filteredRooms = rooms.filter(
    (r) =>
      r.roomCode.includes(searchQuery.toUpperCase()) ||
      searchQuery === ""
  );

  return (
    <main
      className="min-h-screen bg-app-bg text-text-primary"
      aria-label="로비 페이지"
    >
      {/* 헤더 */}
      <header className="border-b border-border bg-panel-bg px-6 py-3 h-12 flex items-center">
        <div className="max-w-7xl w-full mx-auto flex items-center justify-between">
          <h1 className="text-tile-lg font-bold">
            Rummi<span className="text-warning">Arena</span>
          </h1>
          <nav className="hidden md:flex items-center gap-6">
            <button
              type="button"
              className="text-tile-sm text-text-primary hover:text-warning transition-colors"
              aria-current="page"
            >
              로비
            </button>
            <button
              type="button"
              onClick={() => router.push("/practice")}
              className="text-tile-sm text-text-secondary hover:text-text-primary transition-colors"
            >
              연습
            </button>
            <button
              type="button"
              className="text-tile-sm text-text-secondary hover:text-text-primary transition-colors"
            >
              랭킹
            </button>
          </nav>
          <div className="flex items-center gap-3">
            <span className="text-tile-sm text-text-secondary hidden sm:inline">
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

      {/* 3단 레이아웃 */}
      <div className="max-w-7xl mx-auto px-4 py-6 flex gap-5">
        {/* ---- 좌측 패널 (320px) ---- */}
        <aside className="hidden lg:flex flex-col gap-4 w-72 flex-shrink-0">
          {/* 내 프로필 카드 */}
          <MyProfileCard />

          {/* 빠른 게임 버튼 */}
          <motion.button
            type="button"
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.98 }}
            onClick={() => router.push("/room/create")}
            className={[
              "w-full py-3 px-4 rounded-xl font-bold text-tile-base",
              "bg-warning text-gray-900 hover:bg-yellow-400",
              "transition-colors",
            ].join(" ")}
            aria-label="새 게임 방 만들기"
          >
            + 새 게임 만들기
          </motion.button>

          {/* 코드로 참가 */}
          <div className="p-4 bg-card-bg rounded-xl border border-border">
            <h3 className="text-tile-sm font-semibold mb-2 text-text-secondary">
              코드로 참가
            </h3>
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

          {/* 연습 모드 버튼 */}
          <motion.button
            type="button"
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.98 }}
            onClick={() => router.push("/practice")}
            className={[
              "w-full p-4 rounded-xl text-left",
              "bg-card-bg border border-border hover:border-border-active",
              "transition-colors",
            ].join(" ")}
            aria-label="연습 모드 시작"
          >
            <p className="font-semibold text-tile-base mb-0.5">연습 모드</p>
            <p className="text-tile-xs text-text-secondary">
              Stage 1~6 단계별 루미큐브 학습
            </p>
          </motion.button>
        </aside>

        {/* ---- 중앙 패널 (flex-1) ---- */}
        <section className="flex-1 min-w-0" aria-label="게임 방 목록">
          {/* 섹션 헤더 */}
          <div className="flex items-center justify-between mb-4">
            <div>
              <motion.h2
                initial={{ opacity: 0, x: -8 }}
                animate={{ opacity: 1, x: 0 }}
                className="text-tile-xl font-bold"
              >
                안녕하세요, {session?.user?.name ?? "플레이어"}님
              </motion.h2>
              <p className="text-tile-sm text-text-secondary mt-0.5">
                게임 방을 선택하거나 새로 만들어 보세요.
              </p>
            </div>
            {/* 모바일에서 보이는 방 만들기 버튼 */}
            <button
              type="button"
              onClick={() => router.push("/room/create")}
              className="lg:hidden px-4 py-2 rounded-xl font-bold text-tile-sm bg-warning text-gray-900 hover:bg-yellow-400 transition-colors"
              aria-label="새 게임 방 만들기"
            >
              + 만들기
            </button>
          </div>

          {/* 참가 에러 메시지 */}
          <AnimatePresence>
            {joinError && (
              <motion.div
                initial={{ opacity: 0, y: -8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -8 }}
                className="mb-3 p-3 rounded-lg bg-danger/10 border border-danger/30 text-danger text-tile-sm"
                role="alert"
              >
                {joinError}
                <button
                  type="button"
                  onClick={() => setJoinError(null)}
                  className="ml-3 underline text-tile-xs hover:no-underline"
                  aria-label="에러 메시지 닫기"
                >
                  닫기
                </button>
              </motion.div>
            )}
          </AnimatePresence>

          {/* 검색 바 */}
          <div className="flex items-center gap-3 mb-4">
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="방 코드로 검색..."
              className={[
                "flex-1 px-4 py-2 rounded-xl",
                "bg-card-bg border border-border",
                "text-text-primary placeholder-text-secondary text-tile-sm",
                "focus:outline-none focus:border-border-active",
              ].join(" ")}
              aria-label="방 코드 검색"
            />
            <button
              type="button"
              onClick={() => void loadRooms()}
              className="px-4 py-2 rounded-xl text-tile-sm bg-card-bg border border-border hover:border-border-active text-text-secondary hover:text-text-primary transition-colors"
              aria-label="목록 새로고침"
            >
              새로고침
            </button>
          </div>

          {/* Room 목록 */}
          <div className="flex flex-col gap-2">
            {isLoading ? (
              <div className="py-16 text-center text-text-secondary">
                <motion.div
                  animate={{ rotate: 360 }}
                  transition={{ repeat: Infinity, duration: 1, ease: "linear" }}
                  className="w-6 h-6 rounded-full border-2 border-warning border-t-transparent mx-auto mb-2"
                  aria-hidden="true"
                />
                <p className="text-tile-sm">방 목록을 불러오는 중...</p>
              </div>
            ) : filteredRooms.length === 0 ? (
              <div className="py-16 text-center text-text-secondary bg-card-bg rounded-xl border border-border">
                <p className="text-tile-base mb-1">
                  {searchQuery
                    ? `'${searchQuery}'에 해당하는 방이 없습니다.`
                    : "진행 중인 게임이 없습니다."}
                </p>
                <p className="text-tile-sm">새 게임을 만들어 보세요!</p>
              </div>
            ) : (
              <AnimatePresence>
                {filteredRooms.map((room) => (
                  <RoomCard
                    key={room.id}
                    room={room}
                    onJoin={handleJoinRoom}
                  />
                ))}
              </AnimatePresence>
            )}
          </div>
        </section>

        {/* ---- 우측 패널 (280px) ---- */}
        <aside className="hidden xl:block w-64 flex-shrink-0">
          <StatsPanel />
        </aside>
      </div>
    </main>
  );
}
