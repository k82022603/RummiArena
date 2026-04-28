"use client";

import { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import { motion, AnimatePresence } from "framer-motion";
import { getRoom, startGame, leaveRoom } from "@/lib/api";
import { useRoomStore } from "@/store/roomStore";
import { useGameStore } from "@/store/gameStore";
import type { Room, Player, HumanPlayer } from "@/types/game";

// ------------------------------------------------------------------
// 상수
// ------------------------------------------------------------------

const AI_TYPE_LABEL: Record<string, string> = {
  AI_OPENAI: "GPT",
  AI_CLAUDE: "Claude",
  AI_DEEPSEEK: "DeepSeek",
  AI_LLAMA: "LLaMA",
};

const AI_PERSONA_LABEL: Record<string, string> = {
  rookie: "루키",
  calculator: "계산기",
  shark: "샤크",
  fox: "폭스",
  wall: "벽",
  wildcard: "와일드카드",
};

// ------------------------------------------------------------------
// Seat 슬롯 컴포넌트
// ------------------------------------------------------------------

interface SeatSlotProps {
  seat: number;
  player: Player | undefined;
  isHost: boolean;
  isMe: boolean;
}

function SeatSlot({ seat, player, isHost, isMe }: SeatSlotProps) {
  const isEmpty = !player || player.status === "EMPTY";
  const isHuman = !isEmpty && player?.type === "HUMAN";
  const isAI = !isEmpty && !!player && !isHuman;

  let name = "대기 중...";
  if (isHuman) {
    name = (player as HumanPlayer).displayName ?? "플레이어";
  } else if (isAI && player) {
    const aiType = AI_TYPE_LABEL[player.type] ?? player.type;
    const persona =
      "persona" in player
        ? AI_PERSONA_LABEL[(player as { persona: string }).persona] ?? ""
        : "";
    name = `${aiType} (${persona})`;
  }

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.95 }}
      animate={{ opacity: 1, scale: 1 }}
      className={[
        "relative p-5 rounded-2xl border-2 transition-colors",
        isMe
          ? "border-warning bg-warning/5"
          : !isEmpty
          ? "border-border bg-card-bg"
          : "border-dashed border-border bg-card-bg/50",
      ].join(" ")}
      aria-label={`Seat ${seat}: ${name}`}
    >
      {/* Seat 번호 배지 */}
      <div className="absolute top-3 left-3">
        <span className="text-tile-xs text-text-secondary font-mono">
          Seat {seat}
        </span>
      </div>

      {/* 호스트 배지 */}
      {isHost && !isEmpty && (
        <div className="absolute top-3 right-3">
          <span className="px-2 py-0.5 rounded-full text-tile-xs bg-warning/20 text-warning font-medium">
            호스트
          </span>
        </div>
      )}

      {/* 아이콘 */}
      <div className="flex justify-center mt-4 mb-3">
        <div
          className={[
            "w-14 h-14 rounded-full flex items-center justify-center text-xl font-bold",
            isEmpty
              ? "bg-border/30 text-text-secondary"
              : isAI
              ? "bg-color-ai/20 text-color-ai"
              : "bg-success/20 text-success",
          ].join(" ")}
          aria-hidden="true"
        >
          {isEmpty ? "?" : isAI ? "A" : name[0]?.toUpperCase() ?? "?"}
        </div>
      </div>

      {/* 이름 */}
      <p
        className={[
          "text-center text-tile-base font-medium truncate",
          isEmpty ? "text-text-secondary italic" : "text-text-primary",
        ].join(" ")}
      >
        {name}
      </p>

      {/* 상태 */}
      <div className="flex items-center justify-center gap-1.5 mt-2">
        {isEmpty ? (
          <motion.span
            animate={{ opacity: [0.4, 1, 0.4] }}
            transition={{ repeat: Infinity, duration: 1.5 }}
            className="w-2 h-2 rounded-full bg-border"
            aria-hidden="true"
          />
        ) : (
          <span
            className={`w-2 h-2 rounded-full ${isAI ? "bg-color-ai" : "bg-success"}`}
            aria-hidden="true"
          />
        )}
        <span className="text-tile-xs text-text-secondary">
          {isEmpty ? "빈 슬롯" : isAI ? "준비 완료" : "준비 완료"}
        </span>
      </div>

      {/* 내 슬롯 표시 */}
      {isMe && (
        <p className="text-center text-tile-xs text-warning mt-1">(나)</p>
      )}
    </motion.div>
  );
}

// ------------------------------------------------------------------
// WaitingRoomClient
// ------------------------------------------------------------------

interface WaitingRoomClientProps {
  roomId: string;
}

/**
 * 대기실 클라이언트 컴포넌트
 *
 * 와이어프레임 기준:
 * - Room 코드 대형 표시 + 공유 링크 복사
 * - 4개 Seat 그리드
 * - 게임 설정 요약
 * - 게임 시작 버튼 (호스트만, 최소 2명)
 */
export default function WaitingRoomClient({
  roomId,
}: WaitingRoomClientProps) {
  const router = useRouter();
  const { data: session } = useSession();
  const token = session?.accessToken;
  const { currentRoom, setCurrentRoom, mySeat, setMySeat } = useRoomStore();
  const { setRoom } = useGameStore();

  const [room, setLocalRoom] = useState<Room | null>(currentRoom);
  const [isLoading, setIsLoading] = useState(!currentRoom);
  const [isStarting, setIsStarting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  // Room 정보 로드
  const loadRoom = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const data = await getRoom(roomId, token);
      setLocalRoom(data);
      setCurrentRoom(data);

      // 내 seat 결정 (세션 유저 ID로 매칭)
      const mePlayer = data.players.find(
        (p) =>
          p.type === "HUMAN" &&
          (p as HumanPlayer).userId === session?.user?.id
      );
      if (mePlayer) {
        setMySeat(mePlayer.seat);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "방 정보를 불러올 수 없습니다.");
    } finally {
      setIsLoading(false);
    }
  }, [roomId, token, session, setCurrentRoom, setMySeat]);

  useEffect(() => {
    void loadRoom();
    // 5초마다 Room 상태 폴링 (WebSocket 대기실 이벤트 대체)
    const interval = setInterval(() => void loadRoom(), 5_000);
    return () => clearInterval(interval);
  }, [loadRoom]);

  // 게임 시작됐으면 게임 페이지로 이동
  useEffect(() => {
    if (room?.status === "PLAYING") {
      setRoom(room);
      router.replace(`/game/${roomId}`);
    }
  }, [room, roomId, router, setRoom]);

  const handleCopyLink = async () => {
    const url = `${window.location.origin}/room/${room?.roomCode ?? roomId}`;
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // clipboard API 실패 시 fallback
    }
  };

  const handleStartGame = async () => {
    if (!room) return;
    setIsStarting(true);
    setError(null);
    try {
      await startGame(room.id, token);
      setRoom(room);
      router.push(`/game/${room.id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "게임 시작에 실패했습니다.");
      setIsStarting(false);
    }
  };

  const handleLeave = async () => {
    if (room) {
      try {
        await leaveRoom(room.id, token);
      } catch {
        // leaveRoom 실패해도 로비로 이동
      }
      setCurrentRoom(null);
    }
    router.push("/lobby");
  };

  // 내가 호스트인지 확인 (hostUserId 비교만 사용. mySeat 초기값 0에 의한 오판 방지)
  const isHost = room?.hostUserId === session?.user?.id;

  // 최소 2명 충족 여부
  const canStart = (room?.playerCount ?? 0) >= 2;

  // 4개 Seat 슬롯 생성
  const seats = room
    ? Array.from({ length: room.settings.playerCount }, (_, i) => ({
        seat: i,
        player: room.players.find((p) => p.seat === i),
      }))
    : [];

  // ------------------------------------------------------------------

  if (isLoading) {
    return (
      <div className="min-h-screen bg-app-bg flex items-center justify-center">
        <div className="text-center">
          <motion.div
            animate={{ rotate: 360 }}
            transition={{ repeat: Infinity, duration: 1, ease: "linear" }}
            className="w-8 h-8 rounded-full border-2 border-warning border-t-transparent mx-auto mb-3"
            aria-hidden="true"
          />
          <p className="text-text-secondary text-tile-base">
            대기실에 입장하는 중...
          </p>
        </div>
      </div>
    );
  }

  return (
    <main
      className="min-h-screen bg-app-bg text-text-primary"
      aria-label="대기실"
    >
      {/* 헤더 */}
      <header className="border-b border-border bg-panel-bg px-6 py-3">
        <div className="max-w-3xl mx-auto flex items-center justify-between">
          <button
            type="button"
            onClick={() => void handleLeave()}
            className="text-text-secondary hover:text-text-primary transition-colors text-tile-sm"
            aria-label="로비로 돌아가기"
          >
            &larr; 로비
          </button>
          <h1 className="text-tile-base font-bold">
            Rummi<span className="text-warning">Arena</span> 대기실
          </h1>
          <div className="w-16" />
        </div>
      </header>

      <div className="max-w-3xl mx-auto px-4 py-8">
        {/* Room 코드 대형 표시 */}
        <div className="text-center mb-8">
          <p className="text-tile-sm text-text-secondary mb-1">방 코드</p>
          <motion.div
            initial={{ scale: 0.9, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            className="inline-flex items-center gap-4"
          >
            <span className="font-mono text-[48px] font-black text-warning tracking-[0.15em] leading-none">
              {room?.roomCode ?? roomId}
            </span>
          </motion.div>

          {/* 공유 링크 복사 */}
          <div className="flex items-center justify-center gap-2 mt-3">
            <p className="text-tile-xs text-text-secondary">
              친구에게 이 코드를 알려주세요
            </p>
            <button
              type="button"
              onClick={() => void handleCopyLink()}
              className={[
                "px-3 py-1 rounded-lg text-tile-xs font-medium transition-colors",
                copied
                  ? "bg-success/20 text-success"
                  : "bg-card-bg border border-border text-text-secondary hover:text-text-primary hover:border-border-active",
              ].join(" ")}
              aria-label="초대 링크 복사"
            >
              {copied ? "복사됨!" : "링크 복사"}
            </button>
          </div>
        </div>

        {/* Seat 그리드 */}
        <section className="mb-8" aria-label="플레이어 슬롯">
          <h2 className="text-tile-base font-semibold mb-4 text-text-secondary">
            플레이어 ({room?.playerCount ?? 0} / {room?.settings.playerCount ?? 4})
          </h2>
          <div
            className={[
              "grid gap-4",
              (room?.settings.playerCount ?? 4) === 2
                ? "grid-cols-2"
                : "grid-cols-2 md:grid-cols-4",
            ].join(" ")}
          >
            {seats.map(({ seat, player }) => (
              <SeatSlot
                key={seat}
                seat={seat}
                player={player}
                isHost={
                  player?.type === "HUMAN" &&
                  (player as HumanPlayer).userId === room?.hostUserId
                }
                isMe={seat === mySeat && !!session?.user}
              />
            ))}
          </div>
        </section>

        {/* 게임 설정 요약 */}
        {room && (
          <section
            className="mb-8 p-4 bg-card-bg rounded-xl border border-border"
            aria-label="게임 설정"
          >
            <h2 className="text-tile-sm font-semibold text-text-secondary mb-3 uppercase tracking-wider">
              게임 설정
            </h2>
            <div className="flex flex-wrap gap-4 text-tile-sm">
              <div>
                <span className="text-text-secondary">최대 인원: </span>
                <span className="text-text-primary font-medium">
                  {room.settings.playerCount}명
                </span>
              </div>
              <div>
                <span className="text-text-secondary">턴 제한: </span>
                <span className="text-text-primary font-medium">
                  {room.settings.turnTimeoutSec}초
                </span>
              </div>
              <div>
                <span className="text-text-secondary">최초 등록: </span>
                <span className="text-text-primary font-medium">
                  {room.settings.initialMeldThreshold}점 이상
                </span>
              </div>
            </div>
          </section>
        )}

        {/* 에러 */}
        <AnimatePresence>
          {error && (
            <motion.div
              initial={{ opacity: 0, y: -8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              className="mb-4 p-3 rounded-lg bg-danger/10 border border-danger/30 text-danger text-tile-sm"
              role="alert"
            >
              {error}
            </motion.div>
          )}
        </AnimatePresence>

        {/* 컨트롤 버튼 영역 */}
        <div className="flex flex-col sm:flex-row gap-3">
          {/* 게임 시작 버튼 (호스트만) */}
          {isHost && (
            <motion.button
              type="button"
              onClick={() => void handleStartGame()}
              disabled={!canStart || isStarting}
              whileHover={canStart ? { scale: 1.02 } : undefined}
              whileTap={canStart ? { scale: 0.98 } : undefined}
              className={[
                "flex-1 py-4 rounded-xl font-bold text-tile-base transition-colors",
                canStart
                  ? "bg-warning text-gray-900 hover:bg-yellow-400"
                  : "bg-border text-text-secondary cursor-not-allowed",
                isStarting ? "opacity-60" : "",
              ].join(" ")}
              aria-disabled={!canStart}
              aria-busy={isStarting}
              aria-label={
                canStart
                  ? "게임 시작"
                  : "최소 2명이 참가해야 시작할 수 있습니다"
              }
            >
              {isStarting ? (
                <span className="flex items-center justify-center gap-2">
                  <motion.span
                    animate={{ rotate: 360 }}
                    transition={{
                      repeat: Infinity,
                      duration: 1,
                      ease: "linear",
                    }}
                    className="w-4 h-4 rounded-full border-2 border-current border-t-transparent"
                    aria-hidden="true"
                  />
                  게임 시작 중...
                </span>
              ) : canStart ? (
                "게임 시작"
              ) : (
                "대기 중... (최소 2명 필요)"
              )}
            </motion.button>
          )}

          {/* 비호스트: 대기 메시지 */}
          {!isHost && (
            <div className="flex-1 py-4 rounded-xl bg-card-bg border border-border text-center">
              <motion.span
                animate={{ opacity: [0.5, 1, 0.5] }}
                transition={{ repeat: Infinity, duration: 2 }}
                className="text-tile-base text-text-secondary"
              >
                호스트가 게임을 시작하기를 기다리는 중...
              </motion.span>
            </div>
          )}

          {/* 나가기 버튼 */}
          <button
            type="button"
            onClick={() => void handleLeave()}
            className="px-6 py-4 rounded-xl text-tile-base font-medium text-text-secondary hover:text-danger bg-card-bg border border-border hover:border-danger/40 transition-colors"
            aria-label="대기실 나가기"
          >
            나가기
          </button>
        </div>
      </div>
    </main>
  );
}
