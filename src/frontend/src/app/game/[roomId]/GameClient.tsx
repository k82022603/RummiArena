"use client";

import { useCallback, useState } from "react";
import {
  DndContext,
  DragEndEvent,
  DragOverlay,
  PointerSensor,
  useSensor,
  useSensors,
  closestCenter,
} from "@dnd-kit/core";
import { motion } from "framer-motion";
import { useWebSocket } from "@/hooks/useWebSocket";
import { useGameStore } from "@/store/gameStore";
import GameBoard from "@/components/game/GameBoard";
import PlayerRack from "@/components/game/PlayerRack";
import PlayerCard from "@/components/game/PlayerCard";
import TurnTimer from "@/components/game/TurnTimer";
import ConnectionStatus from "@/components/game/ConnectionStatus";
import Tile from "@/components/tile/Tile";
import type { TileCode, TableGroup } from "@/types/tile";

interface GameClientProps {
  roomId: string;
}

/**
 * 게임 플레이 클라이언트 컴포넌트 (1인칭 뷰)
 *
 * 레이아웃:
 * - 좌측: 사이드 패널 (플레이어 카드 × N)
 * - 중앙: 게임 보드 (테이블 그룹)
 * - 하단: 내 타일 랙 + 액션 버튼
 * - 우측 상단: 턴 타이머
 */
export default function GameClient({ roomId }: GameClientProps) {
  const { send } = useWebSocket({ roomId });

  const {
    myTiles,
    gameState,
    players,
    hasInitialMeld,
    pendingTableGroups,
    pendingMyTiles,
    aiThinkingSeat,
    setPendingTableGroups,
    setPendingMyTiles,
    setMyTiles,
    gameEnded,
  } = useGameStore();

  const [activeDragCode, setActiveDragCode] = useState<TileCode | null>(null);

  // 현재 턴이 내 것인지 확인
  // (실제 구현에서는 내 seat를 세션에서 읽어야 함 - 여기서는 0으로 가정)
  const mySeat = 0;
  const isMyTurn = gameState?.currentPlayerSeat === mySeat;

  const currentTableGroups =
    pendingTableGroups ?? gameState?.tableGroups ?? [];
  const currentMyTiles = pendingMyTiles ?? myTiles;

  // dnd-kit 센서 설정
  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: { distance: 8 },
    })
  );

  const handleDragEnd = useCallback(
    (event: DragEndEvent) => {
      setActiveDragCode(null);
      const { active, over } = event;
      if (!over || !isMyTurn) return;

      const tileCode = active.data.current?.tileCode as TileCode | undefined;
      if (!tileCode) return;

      if (over.id === "game-board") {
        // 랙 → 테이블: 새 그룹 생성 (단독 배치)
        const newGroup: TableGroup = {
          id: `pending-${Date.now()}`,
          tiles: [tileCode],
          type: "run",
        };
        setPendingTableGroups([...currentTableGroups, newGroup]);
        setPendingMyTiles(currentMyTiles.filter((c) => c !== tileCode));
      } else if (over.id === "player-rack") {
        // 테이블 → 랙: pending 그룹에서 타일 제거 후 랙 복귀
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
      pendingTableGroups,
      pendingMyTiles,
      myTiles,
    ]
  );

  // 턴 확정
  const handleConfirm = useCallback(() => {
    if (!pendingTableGroups) return;
    const tilesFromRack = myTiles.filter(
      (t) => !(pendingMyTiles ?? []).includes(t)
    );
    send("turn:confirm", {});
    send("turn:place", {
      tableGroups: pendingTableGroups,
      tilesFromRack,
    });
    // pending 정리
    setMyTiles(pendingMyTiles ?? myTiles);
    setPendingTableGroups(null);
    setPendingMyTiles(null);
  }, [
    pendingTableGroups,
    pendingMyTiles,
    myTiles,
    send,
    setMyTiles,
    setPendingTableGroups,
    setPendingMyTiles,
  ]);

  // 턴 되돌리기
  const handleUndo = useCallback(() => {
    send("turn:undo", {});
    setPendingTableGroups(null);
    setPendingMyTiles(null);
  }, [send, setPendingTableGroups, setPendingMyTiles]);

  // 드로우
  const handleDraw = useCallback(() => {
    send("turn:draw", {});
  }, [send]);

  if (gameEnded) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-app-bg">
        <div className="text-center">
          <h1 className="text-3xl font-bold text-text-primary mb-4">
            게임 종료
          </h1>
          <p className="text-text-secondary">결과를 집계 중입니다...</p>
        </div>
      </div>
    );
  }

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCenter}
      onDragStart={(e) => {
        const code = e.active.data.current?.tileCode as TileCode | undefined;
        if (code) setActiveDragCode(code);
      }}
      onDragEnd={handleDragEnd}
    >
      <div className="min-h-screen bg-app-bg flex flex-col">
        <ConnectionStatus />

        {/* 게임 헤더 */}
        <header className="flex items-center justify-between px-4 py-2 bg-panel-bg border-b border-border">
          <h1 className="text-tile-base font-semibold">
            Room <span className="font-mono text-warning">{roomId}</span>
          </h1>
          {gameState && (
            <TurnTimer
              totalSec={gameState.turnTimeoutSec}
              className="w-40"
            />
          )}
          <div className="text-tile-sm text-text-secondary">
            턴 #{gameState?.currentTurn ?? 1}
          </div>
        </header>

        {/* 게임 본문 */}
        <div className="flex flex-1 overflow-hidden">
          {/* 좌측 사이드: 플레이어 카드 */}
          <aside
            className="w-48 bg-panel-bg border-r border-border p-3 flex flex-col gap-3 overflow-y-auto"
            aria-label="플레이어 정보 패널"
          >
            {players.map((player) => (
              <PlayerCard
                key={player.seat}
                player={player}
                isCurrentTurn={
                  gameState?.currentPlayerSeat === player.seat
                }
                isAIThinking={aiThinkingSeat === player.seat}
              />
            ))}
          </aside>

          {/* 중앙: 게임 보드 */}
          <main className="flex-1 flex flex-col p-4 gap-4 overflow-hidden">
            <GameBoard
              tableGroups={currentTableGroups}
              isMyTurn={isMyTurn}
              className="flex-1"
            />

            {/* 내 타일 랙 */}
            <div className="flex-shrink-0">
              <div className="flex items-center justify-between mb-2">
                <span className="text-tile-sm text-text-secondary">
                  내 타일 {hasInitialMeld ? "(등록 완료)" : "(최초 등록 30점 이상 필요)"}
                </span>
                {!hasInitialMeld && (
                  <span className="text-tile-xs text-warning">
                    최초 등록 전
                  </span>
                )}
              </div>
              <PlayerRack
                tiles={currentMyTiles}
                isMyTurn={isMyTurn}
              />

              {/* 액션 버튼 */}
              {isMyTurn && (
                <motion.div
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="flex gap-2 mt-3"
                >
                  <button
                    type="button"
                    onClick={handleDraw}
                    disabled={!!pendingTableGroups}
                    className={[
                      "flex-1 py-2.5 rounded-xl font-medium text-tile-sm",
                      "bg-card-bg border border-border hover:border-border-active",
                      "disabled:opacity-40 disabled:cursor-not-allowed",
                      "transition-colors",
                    ].join(" ")}
                    aria-label="타일 드로우"
                  >
                    드로우
                  </button>
                  <button
                    type="button"
                    onClick={handleUndo}
                    disabled={!pendingTableGroups}
                    className={[
                      "px-4 py-2.5 rounded-xl font-medium text-tile-sm",
                      "bg-card-bg border border-border hover:border-danger/50",
                      "disabled:opacity-40 disabled:cursor-not-allowed",
                      "transition-colors",
                    ].join(" ")}
                    aria-label="되돌리기"
                  >
                    되돌리기
                  </button>
                  <button
                    type="button"
                    onClick={handleConfirm}
                    disabled={!pendingTableGroups}
                    className={[
                      "flex-1 py-2.5 rounded-xl font-bold text-tile-sm",
                      "bg-warning text-gray-900 hover:bg-yellow-400",
                      "disabled:opacity-40 disabled:cursor-not-allowed",
                      "transition-colors",
                    ].join(" ")}
                    aria-label="배치 확정"
                  >
                    확정
                  </button>
                </motion.div>
              )}
            </div>
          </main>
        </div>
      </div>

      {/* 드래그 오버레이 */}
      <DragOverlay>
        {activeDragCode ? (
          <Tile code={activeDragCode} size="rack" draggable />
        ) : null}
      </DragOverlay>
    </DndContext>
  );
}
