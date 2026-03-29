"use client";

import React, { memo, useCallback, useEffect, useMemo, useState } from "react";
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
import type { TileCode, TableGroup } from "@/types/tile";
import { parseTileCode } from "@/types/tile";
import GameBoard from "@/components/game/GameBoard";
import PlayerRack from "@/components/game/PlayerRack";
import Tile from "@/components/tile/Tile";
import {
  validateGroup,
  validateRun,
  validateBoard,
  getHint,
  calculateScore,
  isStageClear,
} from "@/lib/practice/practice-engine";
import type { StageGoal } from "@/lib/practice/stage-configs";

// ------------------------------------------------------------------
// 타입
// ------------------------------------------------------------------

interface PracticeBoardProps {
  stageNum: number;
  goal: StageGoal;
  initialHand: TileCode[];
  clearCondition: string;
  defaultHint: string;
  onClear: (score: number) => void;
  onReset: () => void;
  /** 힌트 문자열이 변경될 때 상위 컴포넌트에 전달 */
  onHintChange?: (hint: string) => void;
}

// ------------------------------------------------------------------
// 유효하지 않은 그룹에 대한 인라인 에러 표시 헬퍼
// ------------------------------------------------------------------

function getBoardErrors(groups: TableGroup[]): Record<string, string> {
  const { reasons } = validateBoard(groups);
  return reasons;
}

// ------------------------------------------------------------------
// PracticeBoard
// ------------------------------------------------------------------

/**
 * 연습 모드 전용 게임 보드
 *
 * - GameBoard(드롭 존) + PlayerRack(드래그 소스) 재활용
 * - 타일을 보드에 올릴 때마다 실시간 유효성 검사 + 힌트 갱신
 * - 스테이지 목표 달성 시 onClear 콜백 호출
 */
const PracticeBoard = memo(function PracticeBoard({
  stageNum,
  goal,
  initialHand,
  clearCondition,
  defaultHint,
  onClear,
  onReset,
  onHintChange,
}: PracticeBoardProps) {
  // 핸드(랙) 상태
  const [hand, setHand] = useState<TileCode[]>([...initialHand]);
  // 보드 위 그룹 상태
  const [tableGroups, setTableGroups] = useState<TableGroup[]>([]);
  // 드래그 중 타일
  const [activeDragCode, setActiveDragCode] = useState<TileCode | null>(null);
  // 다음 보드 드롭 시 새 그룹 강제 생성 여부
  const [forceNewGroup, setForceNewGroup] = useState(false);

  const isDragging = activeDragCode !== null;

  // ------------------------------------------------------------------
  // 유효성 + 힌트 계산 (메모이제이션)
  // ------------------------------------------------------------------

  const boardErrors = useMemo(
    () => getBoardErrors(tableGroups),
    [tableGroups]
  );

  const currentHint = useMemo(
    () => (tableGroups.length === 0 ? defaultHint : getHint(tableGroups, hand)),
    [tableGroups, hand, defaultHint]
  );

  // 힌트 변경 시 상위 컴포넌트에 전달
  useEffect(() => {
    onHintChange?.(currentHint);
  }, [currentHint, onHintChange]);

  const currentScore = useMemo(
    () => calculateScore(tableGroups),
    [tableGroups]
  );

  const cleared = useMemo(
    () => isStageClear(tableGroups, goal),
    [tableGroups, goal]
  );

  // 보드 전체 유효 여부 (확정 버튼 활성화 조건)
  const isAllValid = useMemo(
    () =>
      tableGroups.length > 0 && Object.keys(boardErrors).length === 0,
    [tableGroups, boardErrors]
  );

  // ------------------------------------------------------------------
  // dnd-kit 센서
  // ------------------------------------------------------------------

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } })
  );

  // ------------------------------------------------------------------
  // 드래그 핸들러
  // ------------------------------------------------------------------

  const handleDragStart = useCallback((event: DragStartEvent) => {
    const code = event.active.data.current?.tileCode as TileCode | undefined;
    if (code) setActiveDragCode(code);
  }, []);

  const handleDragEnd = useCallback(
    (event: DragEndEvent) => {
      setActiveDragCode(null);
      const { active, over } = event;
      if (!over) return;

      const tileCode = active.data.current?.tileCode as TileCode | undefined;
      if (!tileCode) return;

      const existingGroup = tableGroups.find((g) => g.id === over.id);
      if (existingGroup) {
        // 랙 → 기존 그룹: 그룹에 타일 추가
        setTableGroups((prev) =>
          prev.map((g) =>
            g.id === existingGroup.id
              ? { ...g, tiles: [...g.tiles, tileCode] }
              : g
          )
        );
        setHand((prev) => {
          const idx = prev.indexOf(tileCode);
          if (idx === -1) return prev;
          const next = [...prev];
          next.splice(idx, 1);
          return next;
        });
      } else if (over.id === "game-board") {
        // 랙 → 보드 빈 공간
        const lastGroup = tableGroups.length > 0 ? tableGroups[tableGroups.length - 1] : null;

        // BUG-UI-001 수정: 자동 새 그룹 생성 조건 판단
        const shouldCreateNewGroup = (() => {
          if (forceNewGroup) return true;
          if (!lastGroup) return false;

          // 새 타일의 정보를 파싱
          const newTile = parseTileCode(tileCode);
          const existingTiles = lastGroup.tiles
            .filter((t) => t !== "JK1" && t !== "JK2")
            .map((t) => parseTileCode(t));

          if (existingTiles.length === 0 || newTile.isJoker) return false;

          // 기존 타일들이 같은 숫자(그룹 후보)인지 확인
          const existingNumbers = new Set(existingTiles.map((t) => t.number));
          const isGroupCandidate = existingNumbers.size === 1;

          // 기존 타일들이 같은 색상(런 후보)인지 확인
          const existingColors = new Set(existingTiles.map((t) => t.color));
          const isRunCandidate = existingColors.size === 1;

          if (isGroupCandidate && !isRunCandidate) {
            // 그룹 후보: 새 타일 숫자가 다르면 새 그룹 생성
            const groupNumber = existingTiles[0].number;
            if (newTile.number !== groupNumber) return true;
            // 그룹은 최대 4개 (4색): 이미 4개면 새 그룹
            if (lastGroup.tiles.length >= 4) return true;
          }

          if (isRunCandidate && !isGroupCandidate) {
            // 런 후보: 새 타일 색상이 다르면 새 그룹 생성 (런은 13개까지 허용)
            const runColor = existingTiles[0].color;
            if (newTile.color !== runColor) return true;
          }

          return false;
        })();

        if (lastGroup && !shouldCreateNewGroup) {
          setTableGroups((prev) =>
            prev.map((g) =>
              g.id === lastGroup.id
                ? { ...g, tiles: [...g.tiles, tileCode] }
                : g
            )
          );
        } else {
          // 새 그룹 생성 (기본 타입은 goal에 따라 결정)
          const newGroupId = `practice-${Date.now()}`;
          const newGroup: TableGroup = {
            id: newGroupId,
            tiles: [tileCode],
            // group 목표면 group 기본값, 그 외(run/joker/multi/master)는 run 기본값
            type: goal === "group" ? "group" : "run",
          };
          setTableGroups((prev) => [...prev, newGroup]);
          if (forceNewGroup) setForceNewGroup(false);
        }
        setHand((prev) => {
          const idx = prev.indexOf(tileCode);
          if (idx === -1) return prev;
          const next = [...prev];
          next.splice(idx, 1);
          return next;
        });
      } else if (over.id === "player-rack") {
        // 보드 → 랙: 그룹에서 타일 제거
        setTableGroups((prev) => {
          const updated = prev
            .map((g) => ({
              ...g,
              tiles: g.tiles.filter((t) => t !== tileCode),
            }))
            .filter((g) => g.tiles.length > 0);
          return updated;
        });
        setHand((prev) => [...prev, tileCode]);
      }
    },
    [tableGroups, forceNewGroup, goal]
  );

  // ------------------------------------------------------------------
  // 그룹 타입 토글 (run ↔ group)
  // ------------------------------------------------------------------

  const handleToggleGroupType = useCallback(
    (groupId: string) => {
      setTableGroups((prev) =>
        prev.map((g) =>
          g.id === groupId
            ? { ...g, type: g.type === "run" ? "group" : "run" }
            : g
        )
      );
    },
    []
  );

  // ------------------------------------------------------------------
  // 확정 핸들러 (클리어 판정)
  // ------------------------------------------------------------------

  const handleConfirm = useCallback(() => {
    if (!cleared) return;
    onClear(currentScore);
  }, [cleared, currentScore, onClear]);

  // ------------------------------------------------------------------
  // 초기화
  // ------------------------------------------------------------------

  const handleReset = useCallback(() => {
    setHand([...initialHand]);
    setTableGroups([]);
    setForceNewGroup(false);
    onReset();
  }, [initialHand, onReset]);

  // ------------------------------------------------------------------
  // 랙 정렬
  // ------------------------------------------------------------------

  const handleRackSort = useCallback((sorted: TileCode[]) => {
    setHand(sorted);
  }, []);

  // ------------------------------------------------------------------
  // 렌더링
  // ------------------------------------------------------------------

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCenter}
      onDragStart={handleDragStart}
      onDragEnd={handleDragEnd}
    >
      <div className="flex flex-col gap-3 h-full">
        {/* 스테이지 헤더 */}
        <div className="flex items-center justify-between flex-shrink-0">
          <div className="flex items-center gap-3">
            <span className="text-xs font-mono text-text-secondary">
              STAGE {stageNum}
            </span>
            {/* 점수 */}
            <span className="text-sm font-semibold text-[var(--color-warning)]">
              {currentScore}점
            </span>
          </div>

          {/* 클리어 가능 표시 */}
          <AnimatePresence>
            {cleared && (
              <motion.span
                initial={{ opacity: 0, scale: 0.85 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.85 }}
                className="text-xs font-semibold text-[var(--color-success)] bg-[var(--color-success)]/10 px-2 py-0.5 rounded-full border border-[var(--color-success)]/30"
                role="status"
                aria-live="polite"
              >
                클리어 가능!
              </motion.span>
            )}
          </AnimatePresence>
        </div>

        {/* 게임 보드 */}
        <GameBoard
          tableGroups={tableGroups}
          isMyTurn
          isDragging={isDragging}
          groupsDroppable
          className="flex-1 min-h-[180px]"
        />

        {/* 새 그룹 만들기 버튼 (그룹이 이미 있을 때만 표시) */}
        {tableGroups.length > 0 && (
          <div className="flex items-center justify-between flex-shrink-0">
            <span className="text-[10px] text-text-secondary/60">
              숫자/색상이 다른 타일은 자동으로 새 그룹이 됩니다
            </span>
            <button
              type="button"
              onClick={() => setForceNewGroup(!forceNewGroup)}
              className={[
                "px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors",
                forceNewGroup
                  ? "border-[var(--color-warning)] text-[var(--color-warning)] bg-[var(--color-warning)]/10"
                  : "border-border text-text-secondary hover:border-[var(--border-active)] hover:text-[var(--border-active)]",
              ].join(" ")}
              aria-label="다음 드롭 시 새 그룹 생성"
              title="다음 타일 드롭 시 새 그룹을 만듭니다"
            >
              {forceNewGroup ? "[ 새 그룹 모드 ON ]" : "+ 새 그룹"}
            </button>
          </div>
        )}

        {/* 그룹 타입 토글 버튼 목록 (보드 아래) */}
        {tableGroups.length > 0 && (
          <div
            className="flex flex-wrap gap-2"
            aria-label="배치된 그룹 타입 변경"
          >
            {tableGroups.map((group) => {
              const hasError = !!boardErrors[group.id];
              const groupResult = validateGroup(group.tiles);
              const runResult = validateRun(group.tiles);
              const isCurrentValid =
                group.type === "group"
                  ? groupResult.valid
                  : runResult.valid;

              return (
                <div
                  key={group.id}
                  className={[
                    "flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border text-xs",
                    hasError
                      ? "border-[var(--color-danger)]/60 bg-[var(--color-danger)]/5"
                      : isCurrentValid
                      ? "border-[var(--color-success)]/40 bg-[var(--color-success)]/5"
                      : "border-border bg-card-bg",
                  ].join(" ")}
                >
                  <span className="text-text-secondary font-mono">
                    {group.tiles.length}개
                  </span>
                  <button
                    type="button"
                    onClick={() => handleToggleGroupType(group.id)}
                    className={[
                      "px-1.5 py-0.5 rounded text-xs font-medium transition-colors",
                      "border",
                      group.type === "run"
                        ? "border-[var(--border-active)]/60 text-[var(--border-active)] bg-[var(--border-active)]/10"
                        : "border-[var(--color-ai)]/60 text-[var(--color-ai)] bg-[var(--color-ai)]/10",
                    ].join(" ")}
                    aria-label={`그룹 타입 ${group.type === "run" ? "런 → 그룹" : "그룹 → 런"}으로 변경`}
                  >
                    {group.type === "run" ? "런" : "그룹"}
                  </button>
                  {hasError && (
                    <span
                      className="text-[var(--color-danger)] text-[10px] max-w-[100px] truncate"
                      title={boardErrors[group.id]}
                      role="alert"
                    >
                      {boardErrors[group.id]}
                    </span>
                  )}
                </div>
              );
            })}
          </div>
        )}

        {/* 랙 */}
        <div className="flex-shrink-0">
          <div className="flex items-center justify-between mb-1">
            <span className="text-xs text-text-secondary">
              내 패{" "}
              <span className="font-medium text-text-primary">
                ({hand.length}개)
              </span>
            </span>
            <span className="text-xs text-text-secondary">
              {clearCondition}
            </span>
          </div>
          <PlayerRack
            tiles={hand}
            isMyTurn
            isDragging={isDragging}
            onSort={handleRackSort}
          />

          {/* 액션 버튼 */}
          <div className="flex gap-2 mt-2">
            <button
              type="button"
              onClick={handleReset}
              className={[
                "px-4 py-2.5 rounded-xl font-medium text-sm flex-shrink-0",
                "bg-card-bg border border-border",
                "hover:border-[var(--color-danger)]/60 hover:text-[var(--color-danger)]",
                "transition-colors",
              ].join(" ")}
              aria-label="타일 배치 초기화"
            >
              초기화
            </button>
            <button
              type="button"
              onClick={handleConfirm}
              disabled={!cleared || !isAllValid}
              className={[
                "flex-1 py-2.5 rounded-xl font-bold text-sm",
                "bg-[var(--color-warning)] text-gray-900 hover:bg-yellow-400",
                "disabled:opacity-40 disabled:cursor-not-allowed",
                "transition-colors",
              ].join(" ")}
              aria-label="스테이지 클리어 확정"
            >
              {cleared ? "클리어 확정!" : "확정"}
            </button>
          </div>
        </div>
      </div>

      {/* 드래그 오버레이 */}
      <DragOverlay dropAnimation={null}>
        {activeDragCode ? (
          <motion.div
            initial={{ scale: 1.0, rotate: 0, opacity: 0.85 }}
            animate={{ scale: 1.12, rotate: -3, opacity: 1 }}
            transition={{ type: "spring", stiffness: 500, damping: 20 }}
            style={{
              cursor: "grabbing",
              filter:
                "drop-shadow(0 10px 20px rgba(0,0,0,0.55)) drop-shadow(0 2px 6px rgba(0,0,0,0.35))",
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
  );
});

PracticeBoard.displayName = "PracticeBoard";

export default PracticeBoard;
