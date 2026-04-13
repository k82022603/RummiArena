"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
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
import { useGameLeaveGuard } from "@/hooks/useGameLeaveGuard";
import { useGameStore } from "@/store/gameStore";
import { useWSStore } from "@/store/wsStore";
import { useRoomStore } from "@/store/roomStore";
import { useRateLimitStore } from "@/store/rateLimitStore";
import GameBoard from "@/components/game/GameBoard";
import PlayerRack from "@/components/game/PlayerRack";
import PlayerCard from "@/components/game/PlayerCard";
import ActionBar from "@/components/game/ActionBar";
import TurnTimer from "@/components/game/TurnTimer";
import ConnectionStatus from "@/components/game/ConnectionStatus";
import ErrorToast from "@/components/game/ErrorToast";
import ReconnectToast from "@/components/game/ReconnectToast";
import ThrottleBadge from "@/components/game/ThrottleBadge";
import TurnHistoryPanel from "@/components/game/TurnHistoryPanel";
import JokerSwapIndicator from "@/components/game/JokerSwapIndicator";
import Tile from "@/components/tile/Tile";

import type { TileCode, TileNumber, TableGroup, GroupType } from "@/types/tile";
import { parseTileCode } from "@/types/tile";
import { calculateScore } from "@/lib/practice/practice-engine";
import { computeValidMergeGroups } from "@/lib/mergeCompatibility";
import type { GameOverPayload } from "@/types/websocket";
import type { Player } from "@/types/game";

// ------------------------------------------------------------------
// BUG-UI-005: 타일 목록으로 그룹/런 자동 분류
// 같은 숫자 + 다른 색상 → "group", 같은 색상 + 연속 숫자 → "run"
// 조커 제외 후 나머지 타일로 판단, 판단 불가 시 기본 "run"
// ------------------------------------------------------------------
function classifySetType(tiles: TileCode[]): GroupType {
  const regular = tiles.filter((t) => t !== "JK1" && t !== "JK2");
  if (regular.length === 0) return "run"; // 조커만으로 구성 → 기본 run

  const parsed = regular.map((t) => parseTileCode(t));
  const numbers = new Set(parsed.map((t) => t.number));
  const colors = new Set(parsed.map((t) => t.color));

  // 모든 숫자가 같으면 → 그룹 (같은 숫자, 다른 색상)
  if (numbers.size === 1) return "group";
  // 모든 색상이 같으면 → 런 (같은 색상, 연속 숫자)
  if (colors.size === 1) return "run";
  // 판단 불가 시 기본값
  return "run";
}

/**
 * m-1: 배열에서 첫 번째 일치 항목만 제거하는 헬퍼
 * filter()는 모든 일치를 제거하므로 동일 타일 코드가 여러 장일 때 문제가 된다.
 */
function removeFirstOccurrence<T>(arr: T[], item: T): T[] {
  const idx = arr.indexOf(item);
  return idx >= 0 ? [...arr.slice(0, idx), ...arr.slice(idx + 1)] : arr;
}

// ------------------------------------------------------------------
// P3: 조커 교체 후보 탐색 (§6.2 유형 4)
//
// 주어진 그룹에 조커가 포함되어 있고, 드롭된 랙 타일이 그 조커의 논리적
// 슬롯을 대체할 수 있는지 판정한다. 대체 가능 시 교체 후 그룹 타일 배열을
// 반환하고, 회수된 조커 코드를 함께 넘긴다. 불가능 시 null을 반환한다.
//
// 단순화된 판정 로직 (MVP):
// - group 타입 (같은 숫자, 다른 색): 랙 타일 숫자가 그룹 숫자와 같고, 색이
//   아직 해당 그룹에 없으면 교체 가능. 첫 번째 조커를 회수 대상으로 선택.
// - run 타입 (같은 색, 연속 숫자): 랙 타일 색이 런 색과 같고, 조커 위치에
//   들어갈 수 있는 숫자가 랙 타일 숫자와 일치하면 교체 가능. 조커 위치는
//   기존 타일 사이의 빈 숫자로 추정하고, 추정 불가 시 양 끝의 ±1 후보로
//   확장한다.
// ------------------------------------------------------------------
interface JokerSwapResult {
  nextTiles: TileCode[];
  recoveredJoker: TileCode;
}

function tryJokerSwap(
  groupTiles: TileCode[],
  rackTile: TileCode
): JokerSwapResult | null {
  const rackParsed = parseTileCode(rackTile);
  if (rackParsed.isJoker) return null; // 조커로 조커를 대체하지 않는다

  const jokerIdx = groupTiles.findIndex((t) => t === "JK1" || t === "JK2");
  if (jokerIdx < 0) return null;

  const nonJokers = groupTiles
    .filter((t) => t !== "JK1" && t !== "JK2")
    .map((t) => parseTileCode(t));
  if (nonJokers.length === 0) return null; // 조커만 있는 그룹은 판정 불가

  const numbers = new Set(nonJokers.map((t) => t.number));
  const colors = new Set(nonJokers.map((t) => t.color));
  const isGroup = numbers.size === 1;
  const isRun = colors.size === 1;

  if (isGroup && !isRun) {
    // 그룹: 랙 타일 숫자가 그룹 숫자와 일치 & 색상 중복 없음
    const groupNumber = nonJokers[0].number;
    if (rackParsed.number !== groupNumber) return null;
    if (colors.has(rackParsed.color as typeof nonJokers[number]["color"])) return null;
  } else if (isRun && !isGroup) {
    // 런: 랙 타일 색상이 런 색상과 일치
    const runColor = nonJokers[0].color;
    if (rackParsed.color !== runColor) return null;
    if (rackParsed.number === null) return null;

    // 런 후보 숫자: 비어있는 연속 슬롯 탐색
    // 정렬된 실제 숫자 목록과 조커 개수(1)를 고려해, 추정 가능한 빈 숫자 집합 구성
    const sortedNums = nonJokers
      .map((t) => t.number)
      .filter((n): n is TileNumber => n !== null)
      .sort((a, b) => a - b);
    if (sortedNums.length === 0) return null;

    const candidateNumbers = new Set<number>();
    // 연속 슬롯의 빈자리 후보
    for (let i = 1; i < sortedNums.length; i++) {
      for (let n = sortedNums[i - 1] + 1; n < sortedNums[i]; n++) {
        candidateNumbers.add(n);
      }
    }
    // 양 끝 확장 후보 (조커가 맨앞/맨뒤에서 런을 연장하는 경우)
    if (sortedNums[0] > 1) candidateNumbers.add(sortedNums[0] - 1);
    if (sortedNums[sortedNums.length - 1] < 13)
      candidateNumbers.add(sortedNums[sortedNums.length - 1] + 1);

    if (!candidateNumbers.has(rackParsed.number)) return null;
  } else {
    return null; // 판정 불가
  }

  const recoveredJoker = groupTiles[jokerIdx];
  const nextTiles = [...groupTiles];
  nextTiles[jokerIdx] = rackTile;
  return { nextTiles, recoveredJoker: recoveredJoker as TileCode };
}

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

const AI_TYPE_DISPLAY: Record<string, string> = {
  AI_OPENAI: "GPT",
  AI_CLAUDE: "Claude",
  AI_DEEPSEEK: "DeepSeek",
  AI_LLAMA: "LLaMA",
};

const AI_PERSONA_DISPLAY: Record<string, string> = {
  rookie: "루키",
  calculator: "계산기",
  shark: "샤크",
  fox: "폭스",
  wall: "벽",
  wildcard: "와일드카드",
};

function getPlayerDisplayName(player: Player | null | undefined, fallback: string): string {
  if (!player) return fallback;
  // HUMAN 플레이어: displayName 사용 (BUG-UI-003 수정: 서버에서 displayName 전달)
  if (player.type === "HUMAN") {
    return ("displayName" in player && player.displayName) || fallback;
  }
  // AI player: displayName이 있으면 우선 사용, 없으면 "GPT (샤크)" 형식 생성
  const serverDisplayName = "displayName" in player ? (player as { displayName?: string }).displayName : "";
  if (serverDisplayName) return serverDisplayName;
  const aiLabel = AI_TYPE_DISPLAY[player.type] ?? player.type;
  const persona = "persona" in player
    ? AI_PERSONA_DISPLAY[(player as { persona: string }).persona] ?? ""
    : "";
  return persona ? `${aiLabel} (${persona})` : aiLabel;
}

// ------------------------------------------------------------------
// 게임 종료 오버레이
// ------------------------------------------------------------------

/** 종료 사유별 UI 메타 */
const END_TYPE_META: Record<string, { icon: string; label: string; description: string }> = {
  NORMAL: { icon: "\uD83C\uDFC6", label: "게임 종료", description: "" },
  STALEMATE: { icon: "\uD83E\uDD1D", label: "교착 종료", description: "모든 플레이어가 연속으로 패스하여 교착 상태로 종료되었습니다." },
  FORFEIT: { icon: "\uD83C\uDFF3\uFE0F", label: "기권 종료", description: "상대 플레이어의 기권으로 게임이 종료되었습니다." },
  CANCELLED: { icon: "\u274C", label: "게임 취소", description: "게임이 취소되었습니다." },
};

function GameEndedOverlay({
  onLobby,
  result,
  players,
  deadlockReason,
}: {
  onLobby: () => void;
  result?: GameOverPayload | null;
  players: Player[];
  deadlockReason?: string | null;
}) {
  const winner = result?.results.find((r) => r.isWinner);
  const winnerPlayer = winner
    ? players.find((p) => p.seat === winner.seat)
    : null;
  const winnerName = winner
    ? getPlayerDisplayName(winnerPlayer, `Seat ${winner.seat}`)
    : null;

  const endType = result?.endType ?? "NORMAL";
  const meta = END_TYPE_META[endType] ?? END_TYPE_META.NORMAL;

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
        {/* 상단: 아이콘 + 제목 */}
        <div className="text-center mb-6">
          <div className="text-4xl mb-3" aria-hidden="true">
            {meta.icon}
          </div>
          <h2 className="text-tile-2xl font-bold text-text-primary mb-1">
            {meta.label}
          </h2>
          {winnerName && (
            <p className="text-tile-base text-warning font-semibold">
              {winnerName} 승리!
            </p>
          )}
          {meta.description && (
            <p className="text-text-secondary text-tile-xs mt-1">
              {meta.description}
            </p>
          )}
          {deadlockReason === "ALL_PASS" && endType === "STALEMATE" && (
            <p className="text-text-secondary text-tile-xs mt-1">
              잔여 타일 점수 기준으로 승자가 결정되었습니다.
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
                  const pStatus = player
                    ? (player as { status?: string }).status
                    : undefined;
                  const isForf = pStatus === "FORFEITED";

                  return (
                    <tr
                      key={r.seat}
                      className={`border-b border-border/50 ${
                        r.isWinner ? "bg-warning/5" : ""
                      } ${isForf ? "opacity-50" : ""}`}
                    >
                      <td className="py-2 text-text-primary font-medium">
                        {name}
                        {isForf && (
                          <span className="ml-1 text-[10px] text-danger font-bold">(기권)</span>
                        )}
                      </td>
                      <td className="py-2 text-center font-mono text-text-secondary">
                        {r.remainingTiles.length}장
                      </td>
                      <td className="py-2 text-center">
                        {r.isWinner ? (
                          <span className="text-warning font-bold">승</span>
                        ) : isForf ? (
                          <span className="text-danger font-bold">기권</span>
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
    pendingRecoveredJokers,
    aiThinkingSeat,
    turnNumber,
    setPendingTableGroups,
    setPendingMyTiles,
    addPendingGroupId,
    clearPendingGroupIds,
    addRecoveredJoker,
    clearRecoveredJokers,
    setMyTiles,
    gameEnded,
    gameOverResult,
    disconnectedPlayers,
    isDrawPileEmpty,
    deadlockReason,
    turnHistory,
    lastTurnPlacement,
    reset: resetGameStore,
  } = useGameStore();

  const { mySeat: roomMySeat } = useRoomStore();

  const [activeDragCode, setActiveDragCode] = useState<TileCode | null>(null);
  const isDragging = activeDragCode !== null;
  // P2-1: 드래그 원점 추적. 테이블 타일 드래그 시 원본 그룹/인덱스를 보존해
  // handleDragEnd에서 분할/이동 분기를 결정한다.
  type ActiveDragSource =
    | { kind: "rack" }
    | { kind: "table"; groupId: string; index: number };
  const activeDragSourceRef = useRef<ActiveDragSource | null>(null);

  // 다음 보드 드롭 시 새 그룹 강제 생성 여부
  const [forceNewGroup, setForceNewGroup] = useState(false);

  // ------------------------------------------------------------------
  // Task 1: beforeunload + 라우터 가드
  // PLAYING 상태 판정: gameState가 존재하고 게임이 아직 끝나지 않은 경우
  // ------------------------------------------------------------------
  const isPlaying = gameState !== null && !gameEnded;

  const handleLeaveConfirmed = useCallback(() => {
    send("LEAVE_GAME", {});
  }, [send]);

  useGameLeaveGuard({
    isPlaying,
    onLeaveConfirmed: handleLeaveConfirmed,
  });

  // ------------------------------------------------------------------
  // 언마운트 시 모든 Zustand store 초기화
  // E2E 테스트에서 연속 테스트 시 이전 게임 상태가 잔존하는 문제 방지
  // ------------------------------------------------------------------
  useEffect(() => {
    return () => {
      resetGameStore();
      useWSStore.getState().reset();
      useRoomStore.getState().reset();
      useRateLimitStore.getState().reset();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ------------------------------------------------------------------
  // Task 2: 연결 끊김 플레이어 카운트다운 (1초 갱신)
  // ------------------------------------------------------------------
  const [disconnectCountdowns, setDisconnectCountdowns] = useState<Record<number, number>>({});
  const countdownIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    if (disconnectedPlayers.length === 0) {
      setDisconnectCountdowns({});
      if (countdownIntervalRef.current) {
        clearInterval(countdownIntervalRef.current);
        countdownIntervalRef.current = null;
      }
      return;
    }

    const compute = () => {
      const now = Date.now();
      const counts: Record<number, number> = {};
      for (const dp of disconnectedPlayers) {
        // C-7: graceSec 기반 카운트다운 (disconnectedAt 시점부터 경과 시간 차감)
        const elapsed = Math.floor((now - dp.disconnectedAt) / 1000);
        const remaining = Math.max(0, dp.graceSec - elapsed);
        counts[dp.seat] = remaining;
      }
      setDisconnectCountdowns(counts);
    };
    compute();

    countdownIntervalRef.current = setInterval(compute, 1000);
    return () => {
      if (countdownIntervalRef.current) {
        clearInterval(countdownIntervalRef.current);
        countdownIntervalRef.current = null;
      }
    };
  }, [disconnectedPlayers]);


  // 실제 내 seat: gameStore.mySeat(AUTH_OK에서 설정, 초기값 -1) 우선,
  // AUTH_OK 수신 전(URL 직접 접근 등)에는 roomStore.mySeat 차선 사용
  const effectiveMySeat = mySeat !== -1 ? mySeat : roomMySeat;
  const isMyTurn = gameState?.currentSeat === effectiveMySeat;

  const currentTableGroups = useMemo(
    () => pendingTableGroups ?? gameState?.tableGroups ?? [],
    [pendingTableGroups, gameState?.tableGroups]
  );
  const currentMyTiles = useMemo(
    () => pendingMyTiles ?? myTiles,
    [pendingMyTiles, myTiles]
  );

  // C-3: 모든 pending 그룹이 3개 이상 타일을 가지는지 검증
  const allGroupsValid = useMemo(() => {
    if (!pendingTableGroups) return true;
    return pendingTableGroups.every((g) => g.tiles.length >= 3);
  }, [pendingTableGroups]);

  // 이번 턴 pending 그룹들의 배치 점수 (최초 등록 30점 안내용)
  const pendingPlacementScore = useMemo(() => {
    if (!pendingTableGroups || pendingGroupIds.size === 0) return 0;
    const pendingOnlyGroups = pendingTableGroups.filter((g) =>
      pendingGroupIds.has(g.id)
    );
    return calculateScore(pendingOnlyGroups);
  }, [pendingTableGroups, pendingGroupIds]);

  // 상대 플레이어 목록 (내 seat 제외)
  const opponents = players.filter((p) => p.seat !== effectiveMySeat);

  // 최근 턴 하이라이트 계산 (pending 배치 중에는 하이라이트 비활성)
  const recentTileCodes = useMemo(() => {
    if (pendingTableGroups) return undefined;
    if (!lastTurnPlacement || lastTurnPlacement.placedTiles.length === 0) return undefined;
    return new Set<string>(lastTurnPlacement.placedTiles);
  }, [lastTurnPlacement, pendingTableGroups]);

  const recentTileVariant: "mine" | "opponent" | null = useMemo(() => {
    if (!lastTurnPlacement) return null;
    return lastTurnPlacement.seat === effectiveMySeat ? "mine" : "opponent";
  }, [lastTurnPlacement, effectiveMySeat]);

  // P2-2: 드래그 중 타일과 호환되는 머지 대상 그룹 ID 집합
  const validMergeGroupIds = useMemo(() => {
    if (!activeDragCode) return new Set<string>();
    return computeValidMergeGroups(activeDragCode, currentTableGroups);
  }, [activeDragCode, currentTableGroups]);

  // dnd-kit 센서
  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: { distance: 8 },
    })
  );

  // 드래그 시작 핸들러
  const handleDragStart = useCallback((event: DragStartEvent) => {
    const data = event.active.data.current as
      | { tileCode?: TileCode; source?: "rack" | "table"; groupId?: string; index?: number }
      | undefined;
    const code = data?.tileCode;
    if (code) setActiveDragCode(code);
    if (data?.source === "table" && typeof data.groupId === "string" && typeof data.index === "number") {
      activeDragSourceRef.current = { kind: "table", groupId: data.groupId, index: data.index };
    } else {
      activeDragSourceRef.current = { kind: "rack" };
    }
  }, []);

  const handleDragEnd = useCallback(
    (event: DragEndEvent) => {
      const dragSource = activeDragSourceRef.current;
      activeDragSourceRef.current = null;
      setActiveDragCode(null);
      const { active, over } = event;
      if (!over || !isMyTurn) return;

      const tileCode = active.data.current?.tileCode as TileCode | undefined;
      if (!tileCode) return;

      // ------------------------------------------------------------
      // P2-1: 테이블 타일 드래그 (§6.2 유형 1/3 재배치)
      // 출처가 테이블이면 분할/이동/랙 되돌리기 분기를 우선 처리한다.
      // ------------------------------------------------------------
      if (dragSource?.kind === "table") {
        // 최초 등록 전에는 pending 그룹 내 타일을 랙으로 되돌리는 경우만 허용
        // (§6.1 — 서버 확정 그룹 수정 금지)
        const sourceGroup = currentTableGroups.find((g) => g.id === dragSource.groupId);
        if (!sourceGroup) return;
        const sourceIsPending = pendingGroupIds.has(dragSource.groupId);

        // 같은 그룹 위로 떨어뜨리면 no-op
        if (over.id === dragSource.groupId) return;

        // 테이블 → 랙 되돌리기 (유형 1 일부)
        if (over.id === "player-rack") {
          // 서버 확정 그룹의 타일을 랙으로 되돌리면 conservation 위반 (V-06)
          if (!sourceIsPending) return;

          const baseTiles = [...sourceGroup.tiles];
          const [removed] = baseTiles.splice(dragSource.index, 1);
          if (removed !== tileCode) return; // 안전장치

          const nextTableGroups = currentTableGroups
            .map((g) => (g.id === dragSource.groupId ? { ...g, tiles: baseTiles, type: classifySetType(baseTiles) } : g))
            .filter((g) => g.tiles.length > 0);

          const stillHasPending = nextTableGroups.some((g) => pendingGroupIds.has(g.id));
          setPendingTableGroups(stillHasPending ? nextTableGroups : null);
          if (!stillHasPending) clearPendingGroupIds();
          setPendingMyTiles([...(pendingMyTiles ?? myTiles), tileCode]);
          return;
        }

        // 테이블 → 다른 그룹 이동 (유형 3)
        if (!hasInitialMeld) return; // 최초 등록 전에는 재배치 금지
        const targetGroup = currentTableGroups.find((g) => g.id === over.id);
        if (!targetGroup) return;

        const updatedSourceTiles = [...sourceGroup.tiles];
        const [removed] = updatedSourceTiles.splice(dragSource.index, 1);
        if (removed !== tileCode) return; // 렌더와 state가 어긋나면 중단

        const updatedTargetTiles = [...targetGroup.tiles, tileCode];

        const nextTableGroups = currentTableGroups
          .map((g) => {
            if (g.id === sourceGroup.id) return { ...g, tiles: updatedSourceTiles, type: classifySetType(updatedSourceTiles) };
            if (g.id === targetGroup.id) return { ...g, tiles: updatedTargetTiles, type: classifySetType(updatedTargetTiles) };
            return g;
          })
          .filter((g) => g.tiles.length > 0);

        setPendingTableGroups(nextTableGroups);
        // 랙 상태는 변화 없음 — pendingMyTiles 최신 값을 그대로 유지
        setPendingMyTiles(pendingMyTiles ?? myTiles);
        addPendingGroupId(sourceGroup.id);
        addPendingGroupId(targetGroup.id);
        return;
      }

      // ------------------------------------------------------------
      // P3: 조커 교체 (§6.2 유형 4)
      // 랙 타일을 조커가 포함된 그룹에 드롭하면 조커를 해당 타일로 교체하고
      // 회수한 조커를 pendingRecoveredJokers 풀로 이동시킨다. 교체 대상은
      // pending/서버 확정 그룹 모두 포함 (최초 등록 후). 규칙 V-07: 회수한
      // 조커는 같은 턴에 다른 세트에 사용해야 ConfirmTurn 가능.
      // ------------------------------------------------------------
      const swapCandidate = currentTableGroups.find((g) => g.id === over.id);
      if (swapCandidate) {
        const hasJoker = swapCandidate.tiles.some((t) => t === "JK1" || t === "JK2");
        if (hasJoker) {
          // 서버 확정 그룹에서 조커를 빼내려면 최초 등록이 완료되어 있어야 한다 (§6.1)
          const isPending = pendingGroupIds.has(swapCandidate.id);
          if (isPending || hasInitialMeld) {
            const swap = tryJokerSwap(swapCandidate.tiles, tileCode);
            if (swap) {
              const nextTableGroups = currentTableGroups.map((g) =>
                g.id === swapCandidate.id
                  ? { ...g, tiles: swap.nextTiles, type: classifySetType(swap.nextTiles) }
                  : g
              );
              const nextMyTiles = removeFirstOccurrence(currentMyTiles, tileCode);
              setPendingTableGroups(nextTableGroups);
              setPendingMyTiles(nextMyTiles);
              addPendingGroupId(swapCandidate.id);
              addRecoveredJoker(swap.recoveredJoker);
              return;
            }
          }
        }
      }

      // 기존 pending 그룹에 드롭한 경우
      const existingPendingGroup = pendingTableGroups?.find(
        (g) => g.id === over.id && pendingGroupIds.has(g.id)
      );

      if (existingPendingGroup) {
        // 랙 -> pending 그룹: 해당 그룹에 타일 추가 + BUG-UI-005: 타입 재분류
        const nextTableGroups = currentTableGroups.map((g) => {
          if (g.id !== existingPendingGroup.id) return g;
          const updatedTiles = [...g.tiles, tileCode];
          return { ...g, tiles: updatedTiles, type: classifySetType(updatedTiles) };
        });
        const nextMyTiles = removeFirstOccurrence(currentMyTiles, tileCode);
        setPendingTableGroups(nextTableGroups);
        setPendingMyTiles(nextMyTiles);
        return;
      }

      // BUG-UI-REARRANGE-001: 서버 확정 그룹에 드롭한 경우 (재배치 합병)
      // 기존 구현은 pending 그룹에만 머지를 허용했고, 서버 확정 그룹은 드롭이 무시되거나
      // board로 fallback되어 새 그룹으로 만들어졌다. 루미큐브 규칙 §6.2(합병)을 지원하기 위해
      // 최초 등록 완료 상태에서는 서버 확정 그룹도 머지 가능하도록 확장한다.
      const targetServerGroup = currentTableGroups.find((g) => g.id === over.id);
      if (targetServerGroup && hasInitialMeld) {
        const updatedTiles = [...targetServerGroup.tiles, tileCode];
        const nextTableGroups = currentTableGroups.map((g) =>
          g.id === targetServerGroup.id
            ? { ...g, tiles: updatedTiles, type: classifySetType(updatedTiles) }
            : g
        );
        const nextMyTiles = removeFirstOccurrence(currentMyTiles, tileCode);
        setPendingTableGroups(nextTableGroups);
        setPendingMyTiles(nextMyTiles);
        // pending ID 세트에 등록 → UI에서 "수정 중 (미확정)"으로 표시
        addPendingGroupId(targetServerGroup.id);
        return;
      }

      if (over.id === "game-board") {
        // 보드 빈 공간에 드롭
        const pendingOnlyGroups = pendingTableGroups?.filter((g) =>
          pendingGroupIds.has(g.id)
        );
        const lastPendingGroup = pendingOnlyGroups?.at(-1);

        // BUG-UI-001 수정: 자동 새 그룹 생성 조건 판단
        // 1) forceNewGroup이 활성화된 경우
        // 2) 마지막 pending 그룹이 4개 이상인 경우 (5개 이상은 그룹으로 불가능)
        // 3) 마지막 pending 그룹에 추가 시 숫자/색상 불일치로 무효해지는 경우
        const shouldCreateNewGroup = (() => {
          if (forceNewGroup) return true;
          if (!lastPendingGroup) return false;

          // 새 타일의 정보를 파싱
          const newTile = parseTileCode(tileCode);
          const existingTiles = lastPendingGroup.tiles
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
            if (lastPendingGroup.tiles.length >= 4) return true;
          }

          if (isRunCandidate && !isGroupCandidate) {
            // 런 후보: 새 타일 색상이 다르면 새 그룹 생성 (런은 13개까지 허용)
            const runColor = existingTiles[0].color;
            if (newTile.color !== runColor) return true;
            // m-4: 비연속 숫자이면 새 그룹 생성
            if (newTile.number !== null) {
              const allNums = existingTiles
                .map((t) => t.number)
                .filter((n): n is TileNumber => n !== null);
              allNums.push(newTile.number);
              allNums.sort((a, b) => a - b);
              for (let i = 1; i < allNums.length; i++) {
                if (allNums[i] - allNums[i - 1] !== 1) return true;
              }
            }
          }

          return false;
        })();

        if (lastPendingGroup && !shouldCreateNewGroup) {
          // 마지막 pending 그룹에 타일 추가 + BUG-UI-005: 타입 재분류
          const updatedTiles = [...lastPendingGroup.tiles, tileCode];
          const nextTableGroups = currentTableGroups.map((g) =>
            g.id === lastPendingGroup.id
              ? { ...g, tiles: updatedTiles, type: classifySetType(updatedTiles) }
              : g
          );
          const nextMyTiles = removeFirstOccurrence(currentMyTiles, tileCode);
          setPendingTableGroups(nextTableGroups);
          setPendingMyTiles(nextMyTiles);
        } else {
          // 새 그룹 생성 (서버 미전송, 프리뷰 상태)
          const newGroupId = `pending-${Date.now()}`;
          // BUG-UI-005: 새 그룹 타일로 타입 자동 판별
          const newGroup: TableGroup = {
            id: newGroupId,
            tiles: [tileCode],
            type: classifySetType([tileCode]),
          };
          const nextTableGroups = [...currentTableGroups, newGroup];
          const nextMyTiles = removeFirstOccurrence(currentMyTiles, tileCode);
          setPendingTableGroups(nextTableGroups);
          setPendingMyTiles(nextMyTiles);
          // 새로 생성된 그룹을 프리뷰 ID 세트에 등록
          addPendingGroupId(newGroupId);
          // forceNewGroup은 false로 리셋하지 않음 - 사용자가 수동 토글하도록 유지
          if (forceNewGroup) setForceNewGroup(false);
        }
      } else if (over.id === "player-rack") {
        // 보드 -> 랙: pending 그룹에 실제로 있는 타일만 회수
        // (랙->랙 오드롭 시 서버 그룹 타일을 삭제하는 버그 방지)
        if (pendingTableGroups) {
          const tileInPending = pendingTableGroups
            .filter((g) => pendingGroupIds.has(g.id))
            .some((g) => g.tiles.includes(tileCode));
          if (!tileInPending) return;

          const updated = pendingTableGroups
            .map((g) => ({ ...g, tiles: g.tiles.filter((t) => t !== tileCode) }))
            .filter((g) => g.tiles.length > 0);

          const stillHasPending = updated.some((g) => pendingGroupIds.has(g.id));
          setPendingTableGroups(stillHasPending ? updated : null);
          if (!stillHasPending) clearPendingGroupIds();
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
      clearPendingGroupIds,
      addRecoveredJoker,
      pendingTableGroups,
      pendingMyTiles,
      pendingGroupIds,
      myTiles,
      forceNewGroup,
      hasInitialMeld,
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
  // BUG-UI-006: pending 상태를 즉시 커밋하지 않음.
  // 서버가 TURN_END(성공)를 보내면 TURN_START 핸들러에서 resetPending() 으로 정리되고,
  // INVALID_MOVE(실패)를 보내면 resetPending() + ErrorToast 가 사유를 표시한다.
  const handleConfirm = useCallback(() => {
    if (!pendingTableGroups) return;
    // M-4: pendingMyTiles가 null이면 확정 차단
    if (!pendingMyTiles) return;

    // P3: 조커 교체로 회수한 조커가 있으면 같은 턴 내에 다른 세트에 사용 필수
    // (§6.2 유형 4, 엔진 V-07). 미사용 시 서버가 INVALID_MOVE로 거절하기 전에
    // 클라이언트에서 차단하여 빠른 피드백 제공.
    if (pendingRecoveredJokers.length > 0) {
      useWSStore
        .getState()
        .setLastError("회수한 조커(JK)를 같은 턴에 다른 세트에 사용해야 합니다");
      return;
    }

    // C-3: 클라이언트 측 사전 검증 -- 서버 전송 전 기본 유효성 확인
    for (const group of pendingTableGroups) {
      if (group.tiles.length < 3) {
        useWSStore.getState().setLastError("세트는 최소 3개 타일이 필요합니다");
        return;
      }
      const nonJokerTiles = group.tiles.filter((t) => t !== "JK1" && t !== "JK2");
      if (nonJokerTiles.length > 0) {
        const parsed = nonJokerTiles.map((t) => parseTileCode(t as TileCode));
        const numbers = new Set(parsed.map((p) => p.number));
        const colors = new Set(parsed.map((p) => p.color));

        if (numbers.size === 1) {
          // 그룹: 같은 숫자, 다른 색 -- 색상 중복 검사
          if (colors.size !== nonJokerTiles.length) {
            useWSStore.getState().setLastError("같은 색상 타일이 중복됩니다");
            return;
          }
        } else if (colors.size === 1) {
          // 런: 같은 색, 연속 숫자
          const sortedNums = Array.from(numbers).filter((n): n is TileNumber => n !== null).sort((a, b) => a - b);
          for (let i = 1; i < sortedNums.length; i++) {
            if (sortedNums[i] - sortedNums[i - 1] !== 1) {
              useWSStore.getState().setLastError("유효하지 않은 조합입니다 (연속된 숫자가 아닙니다)");
              return;
            }
          }
        } else {
          useWSStore.getState().setLastError("유효하지 않은 세트입니다");
          return;
        }
      }
    }

    const tilesFromRack = myTiles.filter(
      (t) => !pendingMyTiles.includes(t)
    );
    // 1단계: 이번 턴 배치 내용을 서버에 전송
    send("PLACE_TILES", {
      tableGroups: pendingTableGroups,
      tilesFromRack,
    });
    // 2단계: 턴 확정 요청 (서버 응답을 기다림 -- 로컬 상태는 아직 유지)
    send("CONFIRM_TURN", {
      tableGroups: pendingTableGroups,
      tilesFromRack,
    });
  }, [
    pendingTableGroups,
    pendingMyTiles,
    pendingRecoveredJokers,
    myTiles,
    send,
  ]);

  // 턴 되돌리기 (취소): 프리뷰 상태 전체 초기화 후 서버에 롤백 요청
  const handleUndo = useCallback(() => {
    send("RESET_TURN", {});
    setPendingTableGroups(null);
    setPendingMyTiles(null);
    clearPendingGroupIds();
    clearRecoveredJokers();
    setForceNewGroup(false);
  }, [
    send,
    setPendingTableGroups,
    setPendingMyTiles,
    clearPendingGroupIds,
    clearRecoveredJokers,
  ]);

  // 드로우
  const handleDraw = useCallback(() => {
    send("DRAW_TILE", {});
  }, [send]);

  // 패스 (드로우 파일 소진 시 -- 서버에 DRAW_TILE을 전송하면 서버가 패스로 처리)
  const handlePass = useCallback(() => {
    send("DRAW_TILE", {});
  }, [send]);

  // 게임 종료 화면
  if (gameEnded) {
    return (
      <GameEndedOverlay
        onLobby={() => {
          resetGameStore();
          router.push("/lobby");
        }}
        result={gameOverResult}
        players={players}
        deadlockReason={deadlockReason}
      />
    );
  }

  return (
    <>
      <ErrorToast />
      <ReconnectToast />
      {/* RateLimitToast는 layout.tsx에서 전역 마운트 */}
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
          <div className="flex items-center gap-2">
            <h1 className="text-tile-sm font-semibold">
              Room{" "}
              <span className="font-mono text-warning">
                {roomId.length <= 8 ? roomId : roomId.slice(0, 8)}
              </span>
            </h1>
            <ThrottleBadge />
          </div>

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
                  disconnectCountdown={disconnectCountdowns[player.seat]}
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
              <div
                className={[
                  "p-3 rounded-xl border flex flex-col items-center gap-2",
                  isDrawPileEmpty
                    ? "bg-danger/5 border-danger/30"
                    : "bg-card-bg border-border",
                ].join(" ")}
              >
                <p className={[
                  "text-tile-xs",
                  isDrawPileEmpty ? "text-danger font-semibold" : "text-text-secondary",
                ].join(" ")}>
                  {isDrawPileEmpty ? "타일 소진" : "드로우 파일"}
                </p>
                <DrawPileVisual count={gameState.drawPileCount} />
                {isDrawPileEmpty && (
                  <p className="text-[9px] text-danger/80 text-center leading-tight">
                    배치 또는 패스만 가능
                  </p>
                )}
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
            {/* 게임 보드 — 최근 턴 하이라이트 포함 */}
            <GameBoard
              tableGroups={currentTableGroups}
              isMyTurn={isMyTurn}
              isDragging={isDragging}
              pendingGroupIds={pendingGroupIds}
              recentTileCodes={recentTileCodes}
              recentTileVariant={recentTileVariant}
              groupsDroppable={isMyTurn && (isDragging || !!pendingTableGroups)}
              tilesDraggable={isMyTurn}
              validMergeGroupIds={validMergeGroupIds}
              className="flex-1"
            />

            {/* 새 그룹 버튼: pending 그룹이 있을 때만 표시 */}
            {pendingTableGroups && isMyTurn && (
              <div className="flex items-center justify-between flex-shrink-0">
                <span className="text-tile-xs text-text-secondary/60">
                  숫자/색상이 다른 타일은 자동으로 새 그룹이 됩니다
                </span>
                <button
                  type="button"
                  onClick={() => setForceNewGroup(!forceNewGroup)}
                  className={[
                    "px-4 py-2 rounded-lg text-sm font-semibold border-2 transition-all",
                    forceNewGroup
                      ? "border-warning text-warning bg-warning/15 shadow-[0_0_8px_rgba(234,179,8,0.3)]"
                      : "border-green-500/50 text-green-400 bg-green-500/10 hover:border-green-400 hover:bg-green-500/20",
                  ].join(" ")}
                  aria-label="다음 드롭 시 새 그룹 생성"
                  title="다음 타일 드롭 시 새 그룹을 만듭니다"
                >
                  {forceNewGroup ? "[ 새 그룹 모드 ON ]" : "+ 새 그룹"}
                </button>
              </div>
            )}

            {/* P3: 회수된 조커 배너 (§6.2 유형 4) */}
            {pendingRecoveredJokers.length > 0 && (
              <div className="flex-shrink-0 flex justify-center">
                <JokerSwapIndicator recoveredJokers={pendingRecoveredJokers} />
              </div>
            )}

            {/* 내 타일 랙 영역 */}
            <div className="flex-shrink-0">
              {/* 랙 헤더 */}
              <div className="flex items-center justify-between mb-1.5">
                <span className="text-tile-xs text-text-secondary">
                  내 패{" "}
                  <span className="text-text-primary font-medium">
                    ({currentMyTiles.length}장)
                  </span>
                  {hasInitialMeld ? (
                    <span> &middot; 최초 등록 완료</span>
                  ) : pendingPlacementScore > 0 ? (
                    <span
                      className={
                        pendingPlacementScore >= 30
                          ? "text-green-400 font-semibold"
                          : "text-warning font-semibold"
                      }
                    >
                      {" "}&middot; 현재 배치: {pendingPlacementScore}점 / 30점 필요
                    </span>
                  ) : (
                    <span className="text-warning font-medium">
                      {" "}&middot; 최초 등록 30점 이상 필요
                    </span>
                  )}
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
                allGroupsValid={allGroupsValid}
                drawPileCount={gameState?.drawPileCount}
                onDraw={handleDraw}
                onUndo={handleUndo}
                onConfirm={handleConfirm}
                onPass={handlePass}
              />
            </div>
          </main>

          {/* 우측: 턴 히스토리 패널 */}
          <TurnHistoryPanel
            history={turnHistory}
            players={players}
            mySeat={effectiveMySeat}
            className="w-56 flex-shrink-0"
          />
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
