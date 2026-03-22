"use client";

import { useCallback, useState } from "react";
import {
  DndContext,
  DragEndEvent,
  DragOverlay,
  DragStartEvent,
  PointerSensor,
  useSensor,
  useSensors,
  closestCenter,
} from "@dnd-kit/core";
import { motion, AnimatePresence } from "framer-motion";
import { useRouter } from "next/navigation";
import { useWebSocket } from "@/hooks/useWebSocket";
import { useGameStore } from "@/store/gameStore";
import { useRoomStore } from "@/store/roomStore";
import GameBoard from "@/components/game/GameBoard";
import PlayerRack from "@/components/game/PlayerRack";
import PlayerCard from "@/components/game/PlayerCard";
import ActionBar from "@/components/game/ActionBar";
import TurnTimer from "@/components/game/TurnTimer";
import ConnectionStatus from "@/components/game/ConnectionStatus";
import ErrorToast from "@/components/game/ErrorToast";
import ReconnectToast from "@/components/game/ReconnectToast";
import Tile from "@/components/tile/Tile";

import type { TileCode, TableGroup } from "@/types/tile";
import type { GameOverPayload } from "@/types/websocket";
import type { Player } from "@/types/game";

interface GameClientProps {
  roomId: string;
}

// ------------------------------------------------------------------
// 드로우 파일 시각화 컴포넌트
// ------------------------------------------------------------------

function DrawPileVisual({ count }: { count: number }) {
  const isEmpty = count === 0;
  const isLow = count > 0 && count <= 10;

  return (
    <div
      className="flex flex-col items-center gap-1"
      aria-label={`드로우 파일: ${count}장 남음`}
    >
      {/* 카드 스택 시각화 */}
      <div className="relative w-8 h-11">
        {!isEmpty &&
          [2, 1, 0].map((offset) => (
            <div
              key={offset}
              className="absolute rounded-sm bg-card-bg border border-border"
              style={{
                width: "100%",
                height: "100%",
                top: `-${offset * 2}px`,
                left: `-${offset * 1}px`,
              }}
              aria-hidden="true"
            />
          ))}
        {isEmpty && (
          <div className="w-full h-full rounded-sm border border-dashed border-border flex items-center justify-center">
            <span className="text-[8px] text-text-secondary">없음</span>
          </div>
        )}
      </div>
      {/* 남은 수 */}
      <span
        className={`font-mono font-bold text-tile-xs ${
          isEmpty
            ? "text-danger"
            : isLow
            ? "text-danger"
            : "text-text-secondary"
        }`}
      >
        {isEmpty ? "X" : `${count}장`}
      </span>
    </div>
  );
}

// ------------------------------------------------------------------
// 플레이어 표시 이름 헬퍼 (HumanPlayer에만 displayName 있음)
// ------------------------------------------------------------------

function getPlayerDisplayName(player: Player | null | undefined, fallback: string): string {
  if (!player) return fallback;
  if (player.type === "HUMAN") return player.displayName;
  return fallback;
}

// ------------------------------------------------------------------
// 게임 종료 오버레이
// ------------------------------------------------------------------

function GameEndedOverlay({
  onLobby,
  result,
  players,
}: {
  onLobby: () => void;
  result?: GameOverPayload | null;
  players: Player[];
}) {
  const winner = result?.results.find((r) => r.isWinner);
  const winnerPlayer = winner
    ? players.find((p) => p.seat === winner.seat)
    : null;
  const winnerName = winner
    ? getPlayerDisplayName(winnerPlayer, `Seat ${winner.seat}`)
    : null;

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      className="fixed inset-0 z-50 bg-black/70 flex items-center justify-center"
      role="dialog"
      aria-modal="true"
      aria-label="게임 종료"
    >
      <motion.div
        initial={{ scale: 0.85, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        transition={{ type: "spring", stiffness: 300, damping: 25 }}
        className="bg-card-bg border border-border rounded-2xl p-8 max-w-md w-full mx-4"
      >
        {/* 상단: 트로피 + 제목 */}
        <div className="text-center mb-6">
          <div className="text-4xl mb-3" aria-hidden="true">
            [trophy]
          </div>
          <h2 className="text-tile-2xl font-bold text-text-primary mb-1">
            게임 종료
          </h2>
          {winnerName && (
            <p className="text-tile-base text-warning font-semibold">
              {winnerName} 승리!
            </p>
          )}
          {!result && (
            <p className="text-text-secondary text-tile-sm">
              결과를 집계하는 중입니다.
            </p>
          )}
        </div>

        {/* 결과 테이블 */}
        {result && result.results.length > 0 && (
          <div className="mb-6">
            <table className="w-full text-tile-sm" aria-label="게임 결과">
              <thead>
                <tr className="border-b border-border text-text-secondary">
                  <th className="py-1.5 text-left font-medium">플레이어</th>
                  <th className="py-1.5 text-center font-medium">남은 타일</th>
                  <th className="py-1.5 text-center font-medium">결과</th>
                </tr>
              </thead>
              <tbody>
                {result.results.map((r) => {
                  const player = players.find((p) => p.seat === r.seat);
                  const name = getPlayerDisplayName(player, `Seat ${r.seat}`);
                  return (
                    <tr
                      key={r.seat}
                      className={`border-b border-border/50 ${
                        r.isWinner ? "bg-warning/5" : ""
                      }`}
                    >
                      <td className="py-2 text-text-primary font-medium">
                        {name}
                      </td>
                      <td className="py-2 text-center font-mono text-text-secondary">
                        {r.remainingTiles.length}장
                      </td>
                      <td className="py-2 text-center">
                        {r.isWinner ? (
                          <span className="text-warning font-bold">승</span>
                        ) : (
                          <span className="text-text-secondary">패</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        {/* 하단: 로비로 버튼 */}
        <button
          type="button"
          onClick={onLobby}
          className="w-full py-3 rounded-xl font-bold text-tile-base bg-warning text-gray-900 hover:bg-yellow-400 transition-colors"
        >
          로비로 돌아가기
        </button>
      </motion.div>
    </motion.div>
  );
}

// ------------------------------------------------------------------
// GameClient
// ------------------------------------------------------------------

/**
 * 게임 플레이 클라이언트 컴포넌트 (1인칭 뷰)
 *
 * 레이아웃:
 * - 상단: 상대 플레이어 카드 행 (가로 스크롤)
 * - 중앙: 게임 보드 (테이블 그룹) + 드로우 파일
 * - 하단: 내 타일 랙 + 액션 버튼
 * - 우상단: 턴 타이머 / 턴 번호
 *
 * WebSocket 연동:
 * - game-server 미연결 시 mock 데이터로 초기화하여 UI 데모 가능
 */
export default function GameClient({ roomId }: GameClientProps) {
  const router = useRouter();
  const { send } = useWebSocket({ roomId });

  const {
    mySeat,
    myTiles,
    gameState,
    players,
    hasInitialMeld,
    pendingTableGroups,
    pendingMyTiles,
    pendingGroupIds,
    aiThinkingSeat,
    turnNumber,
    setPendingTableGroups,
    setPendingMyTiles,
    addPendingGroupId,
    clearPendingGroupIds,
    setMyTiles,
    gameEnded,
    setGameEnded,
    gameOverResult,
  } = useGameStore();

  const { mySeat: roomMySeat } = useRoomStore();

  const [activeDragCode, setActiveDragCode] = useState<TileCode | null>(null);
  const isDragging = activeDragCode !== null;


  // 실제 내 seat: roomStore의 mySeat 우선, gameStore의 mySeat 차선
  const effectiveMySeat = roomMySeat ?? mySeat;
  const isMyTurn = gameState?.currentSeat === effectiveMySeat;

  const currentTableGroups =
    pendingTableGroups ?? gameState?.tableGroups ?? [];
  const currentMyTiles = pendingMyTiles ?? myTiles;

  // 상대 플레이어 목록 (내 seat 제외)
  const opponents = players.filter((p) => p.seat !== effectiveMySeat);

  // dnd-kit 센서
  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: { distance: 8 },
    })
  );

  // 드래그 시작 핸들러
  const handleDragStart = useCallback((event: DragStartEvent) => {
    const code = event.active.data.current?.tileCode as TileCode | undefined;
    if (code) setActiveDragCode(code);
  }, []);

  const handleDragEnd = useCallback(
    (event: DragEndEvent) => {
      setActiveDragCode(null);
      const { active, over } = event;
      if (!over || !isMyTurn) return;

      const tileCode = active.data.current?.tileCode as TileCode | undefined;
      if (!tileCode) return;

      if (over.id === "game-board") {
        // 랙 → 테이블: 새 그룹 생성 (서버 미전송, 프리뷰 상태)
        const newGroupId = `pending-${Date.now()}`;
        const newGroup: TableGroup = {
          id: newGroupId,
          tiles: [tileCode],
          type: "run",
        };
        const nextTableGroups = [...currentTableGroups, newGroup];
        const nextMyTiles = currentMyTiles.filter((c) => c !== tileCode);
        setPendingTableGroups(nextTableGroups);
        setPendingMyTiles(nextMyTiles);
        // 새로 생성된 그룹을 프리뷰 ID 세트에 등록
        addPendingGroupId(newGroupId);
      } else if (over.id === "player-rack") {
        // 테이블 → 랙: 그룹에서 타일 제거
        if (pendingTableGroups) {
          const updated = pendingTableGroups
            .map((g) => ({ ...g, tiles: g.tiles.filter((t) => t !== tileCode) }))
            .filter((g) => g.tiles.length > 0);
          setPendingTableGroups(updated);
          setPendingMyTiles([...(pendingMyTiles ?? myTiles), tileCode]);
        }
      }
    },
    [
      isMyTurn,
      currentTableGroups,
      currentMyTiles,
      setPendingTableGroups,
      setPendingMyTiles,
      addPendingGroupId,
      pendingTableGroups,
      pendingMyTiles,
      myTiles,
    ]
  );

  // 랙 타일 정렬 핸들러 (숫자 오름차순, 조커 마지막)
  const handleRackSort = useCallback(
    (sorted: TileCode[]) => {
      if (pendingMyTiles !== null) {
        setPendingMyTiles(sorted);
      } else {
        setMyTiles(sorted);
      }
    },
    [pendingMyTiles, setPendingMyTiles, setMyTiles]
  );

  // 턴 확정: 프리뷰 상태를 서버에 전송 후 확정
  const handleConfirm = useCallback(() => {
    if (!pendingTableGroups) return;
    const tilesFromRack = myTiles.filter(
      (t) => !(pendingMyTiles ?? []).includes(t)
    );
    // 1단계: 이번 턴 배치 내용을 서버에 전송
    send("PLACE_TILES", {
      tableGroups: pendingTableGroups,
      tilesFromRack,
    });
    // 2단계: 턴 확정 요청
    send("CONFIRM_TURN", {
      tableGroups: pendingTableGroups,
      tilesFromRack,
    });
    setMyTiles(pendingMyTiles ?? myTiles);
    setPendingTableGroups(null);
    setPendingMyTiles(null);
    clearPendingGroupIds();
  }, [
    pendingTableGroups,
    pendingMyTiles,
    myTiles,
    send,
    setMyTiles,
    setPendingTableGroups,
    setPendingMyTiles,
    clearPendingGroupIds,
  ]);

  // 턴 되돌리기 (취소): 프리뷰 상태 전체 초기화 후 서버에 롤백 요청
  const handleUndo = useCallback(() => {
    send("RESET_TURN", {});
    setPendingTableGroups(null);
    setPendingMyTiles(null);
    clearPendingGroupIds();
  }, [send, setPendingTableGroups, setPendingMyTiles, clearPendingGroupIds]);

  // 드로우
  const handleDraw = useCallback(() => {
    send("DRAW_TILE", {});
  }, [send]);

  // 게임 종료 화면
  if (gameEnded) {
    return (
      <GameEndedOverlay
        onLobby={() => {
          setGameEnded(false);
          router.push("/lobby");
        }}
        result={gameOverResult}
        players={players}
      />
    );
  }

  return (
    <>
      <ErrorToast />
      <ReconnectToast />
    <DndContext
      sensors={sensors}
      collisionDetection={closestCenter}
      onDragStart={handleDragStart}
      onDragEnd={handleDragEnd}
    >
      <div className="min-h-screen bg-app-bg flex flex-col overflow-hidden">
        <ConnectionStatus />

        {/* 게임 헤더 */}
        <header className="flex-shrink-0 flex items-center justify-between px-4 py-2 bg-panel-bg border-b border-border h-11">
          <h1 className="text-tile-sm font-semibold">
            Room{" "}
            <span className="font-mono text-warning">
              {roomId.length <= 8 ? roomId : roomId.slice(0, 8)}
            </span>
          </h1>

          {gameState && (
            <TurnTimer
              totalSec={gameState.turnTimeoutSec}
              className="w-36"
            />
          )}

          <div className="text-tile-xs text-text-secondary">
            턴 #{turnNumber}
          </div>
        </header>

        {/* 상대 플레이어 행 (가로 스크롤) */}
        <div
          className="flex-shrink-0 flex gap-2 px-4 py-2 bg-panel-bg border-b border-border overflow-x-auto"
          aria-label="상대 플레이어"
        >
          {opponents.length > 0 ? (
            opponents.map((player) => (
              <div key={player.seat} className="flex-shrink-0 w-44">
                <PlayerCard
                  player={player}
                  isCurrentTurn={
                    gameState?.currentSeat === player.seat
                  }
                  isAIThinking={aiThinkingSeat === player.seat}
                />
              </div>
            ))
          ) : (
            <p className="text-tile-xs text-text-secondary py-1">
              상대 플레이어 없음
            </p>
          )}
        </div>

        {/* 게임 본문 */}
        <div className="flex flex-1 overflow-hidden">
          {/* 좌측 사이드: 내 플레이어 카드 + 드로우 파일 */}
          <aside
            className="w-48 flex-shrink-0 bg-panel-bg border-r border-border p-3 flex flex-col gap-3"
            aria-label="내 정보 패널"
          >
            {/* 내 플레이어 카드 */}
            {players
              .filter((p) => p.seat === effectiveMySeat)
              .map((player) => (
                <PlayerCard
                  key={player.seat}
                  player={player}
                  isCurrentTurn={isMyTurn}
                  isAIThinking={false}
                />
              ))}

            {/* 드로우 파일 */}
            {gameState && (
              <div className="p-3 bg-card-bg rounded-xl border border-border flex flex-col items-center gap-2">
                <p className="text-tile-xs text-text-secondary">드로우 파일</p>
                <DrawPileVisual count={gameState.drawPileCount} />
              </div>
            )}

            {/* AI 사고 중 오버레이 (테이블 위) */}
            <AnimatePresence>
              {aiThinkingSeat !== null && (
                <motion.div
                  initial={{ opacity: 0, y: 4 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: 4 }}
                  className="p-3 bg-color-ai/10 border border-color-ai/30 rounded-xl"
                  role="status"
                  aria-live="polite"
                >
                  <div className="flex items-center gap-2 justify-center">
                    <motion.div
                      animate={{ scale: [1, 1.2, 1] }}
                      transition={{ repeat: Infinity, duration: 1 }}
                      className="w-2 h-2 rounded-full bg-color-ai"
                      aria-hidden="true"
                    />
                    <span className="text-tile-xs text-color-ai">
                      AI 사고 중...
                    </span>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </aside>

          {/* 중앙: 게임 보드 + 랙 */}
          <main className="flex-1 flex flex-col p-4 gap-3 overflow-hidden">
            {/* 게임 보드 */}
            <GameBoard
              tableGroups={currentTableGroups}
              isMyTurn={isMyTurn}
              isDragging={isDragging}
              pendingGroupIds={pendingGroupIds}
              className="flex-1"
            />

            {/* 내 타일 랙 영역 */}
            <div className="flex-shrink-0">
              {/* 랙 헤더 */}
              <div className="flex items-center justify-between mb-1.5">
                <span className="text-tile-xs text-text-secondary">
                  내 패{" "}
                  <span className="text-text-primary font-medium">
                    ({currentMyTiles.length}장)
                  </span>
                  {hasInitialMeld
                    ? " · 최초 등록 완료"
                    : " · 최초 등록 30점 이상 필요"}
                </span>
                {isMyTurn && (
                  <motion.span
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    className="text-tile-xs bg-warning/20 text-warning px-2 py-0.5 rounded-full font-medium"
                  >
                    내 차례
                  </motion.span>
                )}
              </div>

              <PlayerRack
                tiles={currentMyTiles}
                isMyTurn={isMyTurn}
                isDragging={isDragging}
                onSort={handleRackSort}
              />

              {/* 액션 버튼 */}
              <ActionBar
                isMyTurn={isMyTurn}
                hasPending={!!pendingTableGroups}
                onDraw={handleDraw}
                onUndo={handleUndo}
                onConfirm={handleConfirm}
              />
            </div>
          </main>
        </div>
      </div>

      {/* 드래그 오버레이: 커서를 따라다니는 타일 (scale 1.1 + 그림자 강화 + grabbing 커서) */}
      <DragOverlay dropAnimation={null}>
        {activeDragCode ? (
          <motion.div
            initial={{ scale: 1.0, rotate: 0, opacity: 0.85 }}
            animate={{ scale: 1.12, rotate: -3, opacity: 1 }}
            transition={{ type: "spring", stiffness: 500, damping: 20 }}
            style={{
              cursor: "grabbing",
              filter: "drop-shadow(0 10px 20px rgba(0,0,0,0.55)) drop-shadow(0 2px 6px rgba(0,0,0,0.35))",
            }}
          >
            <Tile
              code={activeDragCode}
              size="rack"
              draggable
              aria-label={`${activeDragCode} 타일 드래그 중`}
            />
          </motion.div>
        ) : null}
      </DragOverlay>
    </DndContext>
    </>
  );
}
