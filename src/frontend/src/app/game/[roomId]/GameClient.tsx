"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { registerWSSendBridge, unregisterWSSendBridge } from "@/hooks/useTurnActions";
import {
  DndContext,
  DragEndEvent,
  DragOverlay,
  DragStartEvent,
  PointerSensor,
  useSensor,
  useSensors,
  closestCenter,
  pointerWithin,
} from "@dnd-kit/core";
import type { CollisionDetection } from "@dnd-kit/core";
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
import ExtendLockToast from "@/components/game/ExtendLockToast";
import InitialMeldBanner from "@/components/game/InitialMeldBanner";
import ThrottleBadge from "@/components/game/ThrottleBadge";
import TurnHistoryPanel from "@/components/game/TurnHistoryPanel";
import JokerSwapIndicator from "@/components/game/JokerSwapIndicator";
import Tile from "@/components/tile/Tile";

import type { TileCode, TileNumber, TableGroup, GroupType } from "@/types/tile";
import { parseTileCode } from "@/types/tile";
import { calculateScore } from "@/lib/practice/practice-engine";
import { computeValidMergeGroups, isCompatibleWithGroup } from "@/lib/mergeCompatibility";
import { validatePendingBlock } from "@/components/game/GameBoard";
import { detectDuplicateTileCodes } from "@/lib/tileStateHelpers";
import type { GameOverPayload } from "@/types/websocket";
import type { Player } from "@/types/game";

// ------------------------------------------------------------------
// BUG-UI-005: 타일 목록으로 그룹/런 자동 분류
// 같은 숫자 + 다른 색상 → "group", 같은 색상 + 연속 숫자 → "run"
// 조커 제외 후 나머지 타일로 판단, 판단 불가 시 기본 "group"
//
// B-NEW 수정: regular 타일이 1장 이하일 때는 그룹/런 분류 불가 → "run" 반환
// (isGroupCandidate && isRunCandidate 모두 참인 단일 타일에 "group"을 붙이면
//  mergeCompatibility.ts classifyKind가 "group"으로 고정해 다른 숫자의 같은 색
//  타일을 isCompatibleAsGroup 로만 검사 → K12 그룹에 K13 드롭 거절 버그 유발)
//
// BUG-NEW-002 수정: 색상이 섞인(allSameColor=false) 타일을 기본값 "run"으로
// 분류하면 [Y11,K12,B13] 같은 무효 세트가 "런"으로 표시되는 버그 발생.
// 기본값을 "group"으로 변경 — 판단 불가 세트는 validatePendingBlock에서
// "invalid"로 정확히 감지되므로 "run"/"group" 기본값은 표시 라벨에 영향 없음.
// (pending 그룹 라벨은 validatePendingBlock 결과를 사용하므로 type 필드는 무관)
// ------------------------------------------------------------------
function classifySetType(tiles: TileCode[]): GroupType {
  const regular = tiles.filter((t) => t !== "JK1" && t !== "JK2");
  if (regular.length === 0) return "run"; // 조커만으로 구성 → 기본 run
  // B-NEW: 단일 타일은 그룹/런 판정 불가 → 중립값 "run" 반환
  // classifyKind()가 "run"을 보면 regular.length<2 조건과 함께 "unknown"으로 처리됨
  if (regular.length === 1) return "run";

  const parsed = regular.map((t) => parseTileCode(t));
  const numbers = new Set(parsed.map((t) => t.number));
  const colors = new Set(parsed.map((t) => t.color));

  // 모든 색상이 같으면 → 런 (같은 색상, 연속 숫자) — 런 판정 우선
  if (colors.size === 1) return "run";
  // 모든 숫자가 같으면 → 그룹 (같은 숫자, 다른 색상)
  if (numbers.size === 1) return "group";
  // BUG-NEW-002: 색 혼합 + 숫자 혼합 → 판단 불가. 기본값 "group" 반환.
  // 이전 "run" 기본값은 [Y11,K12,B13] 같은 세트를 "런"으로 오분류했다.
  // pending 라벨은 validatePendingBlock이 "invalid"로 잡으므로 기본값은 표시에 무영향.
  return "group";
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
  // BUG-UI-012 카피 에디트 (designer, 2026-04-24): 존댓말 통일 + 명료성 개선
  STALEMATE: { icon: "\uD83E\uDD1D", label: "교착 종료", description: "모든 플레이어가 연속으로 패스해 교착 상태로 종료되었어요." },
  FORFEIT: { icon: "\uD83C\uDFF3\uFE0F", label: "기권 종료", description: "한 플레이어의 기권으로 게임이 종료되었어요." },
  CANCELLED: { icon: "\u274C", label: "게임 취소", description: "게임이 취소되었어요." },
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
// A3: 커스텀 collisionDetection — pointerWithin 우선, null 시 closestCenter fallback
//
// 근거: closestCenter 는 포인터가 빈 공간에 있을 때도 "가장 가까운" 드롭 타겟을
// 선택하여 의도하지 않은 그룹 오매핑을 유발한다.
// pointerWithin 은 실제 포인터가 드롭존 rect 안에 있을 때만 매칭하므로
// 빈 공간 드롭 시 null 을 반환 → 새 그룹 생성 경로(game-board fallback)로 정확히 진입한다.
// null 을 그대로 반환하면 DndContext 가 over=null 로 처리하여 handleDragEnd 에서
// "드롭 위치 없음" 안내 토스트(A4)를 띄운다.
// ------------------------------------------------------------------
const pointerWithinThenClosest: CollisionDetection = (args) => {
  const pointerCollisions = pointerWithin(args);
  if (pointerCollisions.length > 0) return pointerCollisions;
  return closestCenter(args);
};

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

  // Phase 3: WS send 브릿지 등록 — useTurnActions가 WS에 간접 접근할 수 있도록 한다.
  // 58 §5.2: L2 hook이 WS를 직접 import하지 않기 위한 브릿지 패턴.
  // sendBridgeAdapter: send<T>(C2SMessageType, T) → (string, unknown) 로 시그니처 정렬.
  // C2SMessageType ⊂ string 이므로 런타임 안전.
  useEffect(() => {
    const sendBridgeAdapter = (type: string, payload: unknown) =>
      send(type as import("@/types/websocket").C2SMessageType, payload);
    registerWSSendBridge(sendBridgeAdapter);
    return () => {
      unregisterWSSendBridge();
    };
  }, [send]);

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
    currentPlayerId,
    setPendingTableGroups,
    setPendingMyTiles,
    addPendingGroupId,
    clearPendingGroupIds,
    setPendingGroupIds,
    addRecoveredJoker,
    removeRecoveredJoker,
    clearRecoveredJokers,
    setMyTiles,
    gameEnded,
    gameOverResult,
    disconnectedPlayers,
    isDrawPileEmpty,
    deadlockReason,
    turnHistory,
    lastTurnPlacement,
    // F1/F2 (BUG-UI-012 Phase 2): 기권 종료 모달 트리거용 스키마
    gameStatus,
    endReason,
    winner: gameWinner,
    reset: resetGameStore,
  } = useGameStore();

  const { mySeat: roomMySeat } = useRoomStore();

  // F4 (FINDING-01 재검토): effectiveHasInitialMeld — players[mySeat].hasInitialMeld 를 1차 SSOT,
  // 루트 hasInitialMeld 를 fallback 으로 사용하는 derived 값.
  // GAME_STATE 핸들러(useWebSocket.ts)가 players[] 만 업데이트하는 구조 때문에
  // 루트 hasInitialMeld 가 stale 될 수 있다 (architect 가이드 §F4 B1).
  const effectiveHasInitialMeld = useMemo(() => {
    if (mySeat === null || mySeat < 0) return hasInitialMeld;
    const me = players.find((p) => p.seat === mySeat);
    return me?.hasInitialMeld ?? hasInitialMeld;
  }, [players, mySeat, hasInitialMeld]);

  const [activeDragCode, setActiveDragCode] = useState<TileCode | null>(null);
  const isDragging = activeDragCode !== null;
  // BUG-UI-LAYOUT-001: 히스토리 패널 토글 (기본 펼침)
  const [historyCollapsed, setHistoryCollapsed] = useState(false);
  // G-2: 확정 실패 시 무효로 판정된 pending 그룹 ID 세트 (사용자가 수정 전까지 유지)
  const [invalidPendingGroupIds, setInvalidPendingGroupIds] = useState<Set<string>>(new Set());
  // P2-1: 드래그 원점 추적. 테이블 타일 드래그 시 원본 그룹/인덱스를 보존해
  // handleDragEnd에서 분할/이동 분기를 결정한다.
  type ActiveDragSource =
    | { kind: "rack" }
    | { kind: "table"; groupId: string; index: number };
  const activeDragSourceRef = useRef<ActiveDragSource | null>(null);

  // BUG-UI-REARRANGE-002: pending 그룹 ID 생성용 단조 카운터 —
  // Date.now() 단독은 같은 ms 내 연속 드롭 시 ID 충돌 → 중복 렌더링을 유발했다.
  const pendingGroupSeqRef = useRef(0);

  // BUG-UI-009: handleDragEnd re-entrancy guard —
  // dnd-kit listener 다중 등록(PlayerRack key 충돌) 또는 pointer 이벤트 다중 dispatch 시
  // 동일 stale currentTableGroups 스냅샷으로 N개 pending 그룹이 생성되는 것을 차단한다.
  // queueMicrotask 로 unlock 하여 연속 드래그(정상 케이스)는 차단하지 않는다.
  const isHandlingDragEndRef = useRef(false);

  // BUG-UI-EXT 수정 2: activatorEvent.timeStamp 기반 중복 dispatch dedup —
  // isHandlingDragEndRef 는 microtask 경계(queueMicrotask unlock)를 넘는 연속 dispatch 를
  // 차단하지 못한다. 동일 pointer down 이벤트가 여러 번 onDragEnd 를 트리거하면 같은
  // timeStamp 를 공유하므로 이를 기록해 early-return 한다. 정상 연속 드래그는 timeStamp
  // 가 다르므로 차단하지 않는다.
  const lastDragEndTimestampRef = useRef<number>(-1);

  // 다음 보드 드롭 시 새 그룹 강제 생성 여부
  const [forceNewGroup, setForceNewGroup] = useState(false);

  // UX-004: ExtendLockToast 표시 상태 + 같은 턴 내 1회 추적
  const [showExtendLockToast, setShowExtendLockToast] = useState(false);
  const extendLockToastShownRef = useRef(false);

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

  // G-2: pendingTableGroups가 변경될 때 무효 ID 세트 자동 정리
  // 사용자가 타일을 추가/제거해 그룹이 수정되면 해당 그룹의 에러 강조를 해제한다.
  useEffect(() => {
    if (invalidPendingGroupIds.size === 0) return;
    if (!pendingTableGroups) {
      setInvalidPendingGroupIds(new Set());
      return;
    }
    const existingIds = new Set(pendingTableGroups.map((g) => g.id));
    setInvalidPendingGroupIds((prev) => {
      const next = new Set<string>();
      for (const id of prev) {
        if (existingIds.has(id)) next.add(id);
      }
      return next.size === prev.size ? prev : next;
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pendingTableGroups]);

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

  // BUG-UI-011: isMyTurn SSOT 강제
  // currentPlayerId(E2E 테스트 브리지 주입 포함)가 설정된 경우:
  //   내 seat의 userId와 currentPlayerId를 비교해 턴 여부를 결정한다.
  // currentPlayerId가 null이면 gameState.currentSeat 기반으로 계산 (프로덕션 기본 경로).
  const isMyTurn = (() => {
    if (currentPlayerId !== null) {
      const myPlayer = players.find((p) => p.seat === effectiveMySeat);
      if (myPlayer && "userId" in myPlayer) {
        return (myPlayer as { userId: string }).userId === currentPlayerId;
      }
      // myPlayer에 userId가 없으면 AI 플레이어이므로 currentPlayerId 비교 불가 → false
      return false;
    }
    return gameState?.currentSeat === effectiveMySeat;
  })();

  const currentTableGroups = useMemo(
    () => pendingTableGroups ?? gameState?.tableGroups ?? [],
    [pendingTableGroups, gameState?.tableGroups]
  );
  const currentMyTiles = useMemo(
    () => pendingMyTiles ?? myTiles,
    [pendingMyTiles, myTiles]
  );

  // C-3 + BUG-NEW-003: 모든 pending 그룹이 3개 이상 타일을 가지며
  // 유효한 세트(런/그룹)인지 검증한다.
  // 이전 구현은 tiles.length >= 3 만 확인했으므로 [Y11,K12,B13] 같은
  // 무효 세트(색 혼합 + 숫자 혼합)에서도 확정 버튼이 활성화되는 버그가 있었다.
  // validatePendingBlock을 통해 "invalid" 판정 세트를 사전에 차단한다.
  const allGroupsValid = useMemo(() => {
    if (!pendingTableGroups) return true;
    const pendingOnly = pendingTableGroups.filter((g) => pendingGroupIds.has(g.id));
    return pendingOnly.every((g) => {
      if (g.tiles.length < 3) return false;
      const validity = validatePendingBlock(g.tiles as TileCode[]);
      return validity !== "invalid";
    });
  }, [pendingTableGroups, pendingGroupIds]);

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
    // BUG-UI-009/010: 이전 드래그 잔재 defensive clear —
    // onDragCancel 이 누락됐거나 ESC/blur 이후 잔존한 state 를 안전하게 초기화한다.
    activeDragSourceRef.current = null;
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

  // BUG-UI-010: onDragCancel 핸들러 —
  // ESC 키 / 브라우저 포커스 소실 / window 비활성화 등으로 드래그가 취소될 때
  // dnd-kit 이 호출한다. activeDragCode / activeDragSourceRef 를 명시 초기화하여
  // 다음 드래그가 이전 drag state 잔재 없이 시작되도록 보장한다.
  const handleDragCancel = useCallback(() => {
    setActiveDragCode(null);
    activeDragSourceRef.current = null;
    // BUG-UI-009: 취소 시에도 re-entrancy guard 해제
    isHandlingDragEndRef.current = false;
  }, []);

  const handleDragEnd = useCallback(
    (event: DragEndEvent) => {
      // BUG-UI-009: re-entrancy guard —
      // PlayerRack key 충돌로 dnd-kit listener 가 다중 등록되거나
      // pointer up 이벤트가 여러 번 dispatch 될 때 동일 stale snapshot 으로
      // N 개 pending 그룹이 생성되는 것을 차단한다.
      // queueMicrotask 로 unlock 하여 정상 연속 드래그는 차단하지 않는다.
      if (isHandlingDragEndRef.current) {
        if (process.env.NODE_ENV !== "production") {
          console.warn("[BUG-UI-009] handleDragEnd re-entrancy 감지 — 중복 dispatch 차단");
        }
        return;
      }

      // BUG-UI-EXT 수정 2: activatorEvent.timeStamp dedup —
      // 동일 pointer down 이벤트가 microtask 경계를 넘어 중복으로 onDragEnd 를 트리거할 때
      // timeStamp 가 동일하므로 두 번째 이후를 차단한다. 정상 연속 드래그는 timeStamp 가 다르다.
      const activatorTs = (event.activatorEvent as PointerEvent | undefined)?.timeStamp ?? -1;
      if (activatorTs !== -1 && activatorTs === lastDragEndTimestampRef.current) {
        if (process.env.NODE_ENV !== "production") {
          console.warn("[BUG-UI-EXT] handleDragEnd 동일 timeStamp 중복 dispatch 차단 ts=%f", activatorTs);
        }
        return;
      }
      lastDragEndTimestampRef.current = activatorTs;

      isHandlingDragEndRef.current = true;
      try {
      // BUG-UI-EXT 수정 1: useMemo stale snapshot 제거 —
      // currentTableGroups / currentMyTiles 는 useMemo derived state 라 같은 렌더 사이클
      // 내에서 여러 번 handleDragEnd 가 호출되면 첫 번째 setState 가 아직 반영되지 않은
      // stale 스냅샷을 사용한다. 매 분기 진입 전 useGameStore.getState() 로 최신 값을
      // 1회 가져와 stale 를 근본적으로 차단한다.
      // (architect 재재조사 §4.1 §5.1 수정 A)
      const latestState = useGameStore.getState();
      const freshTableGroups: import("@/types/tile").TableGroup[] =
        latestState.pendingTableGroups ?? latestState.gameState?.tableGroups ?? [];
      const freshMyTiles: import("@/types/tile").TileCode[] =
        latestState.pendingMyTiles ?? latestState.myTiles;
      const freshPendingTableGroups = latestState.pendingTableGroups;
      const freshPendingGroupIds = latestState.pendingGroupIds;
      const freshPendingRecoveredJokers = latestState.pendingRecoveredJokers;
      // F4 (FINDING-01): players[mySeat].hasInitialMeld 를 1차 SSOT 로 사용 (루트는 fallback).
      // GAME_STATE 핸들러가 players[] 만 업데이트하므로 루트 hasInitialMeld 가 stale 될 수 있음.
      const freshHasInitialMeld = (() => {
        const seat = latestState.mySeat;
        if (seat >= 0) {
          const me = latestState.players.find((p) => p.seat === seat);
          if (me?.hasInitialMeld !== undefined) return me.hasInitialMeld;
        }
        return latestState.hasInitialMeld;
      })();

      const dragSource = activeDragSourceRef.current;
      activeDragSourceRef.current = null;
      setActiveDragCode(null);
      const { active, over } = event;
      // 내 턴이 아니면 조용히 return (드래그 자체가 UI에서 막혀 있어야 하지만 방어)
      if (!isMyTurn) return;
      // A4: 내 턴인데 유효한 드롭 위치가 없으면 사용자에게 안내 토스트 표시
      if (!over) {
        useWSStore.getState().setLastError("드롭 위치를 확인하세요");
        return;
      }

      const tileCode = active.data.current?.tileCode as TileCode | undefined;
      if (!tileCode) return;

      // ------------------------------------------------------------
      // P2-1: 테이블 타일 드래그 (§6.2 유형 1/3 재배치)
      // 출처가 테이블이면 분할/이동/랙 되돌리기 분기를 우선 처리한다.
      // ------------------------------------------------------------
      if (dragSource?.kind === "table") {
        // 최초 등록 전에는 pending 그룹 내 타일을 랙으로 되돌리는 경우만 허용
        // (§6.1 — 서버 확정 그룹 수정 금지)
        const sourceGroup = freshTableGroups.find((g) => g.id === dragSource.groupId);
        if (!sourceGroup) return;
        const sourceIsPending = freshPendingGroupIds.has(dragSource.groupId);

        // 같은 그룹 위로 떨어뜨리면 no-op
        if (over.id === dragSource.groupId) return;

        // 테이블 → 랙 되돌리기 (유형 1 일부)
        if (over.id === "player-rack") {
          // 서버 확정 그룹의 타일을 랙으로 되돌리면 conservation 위반 (V-06)
          if (!sourceIsPending) return;

          const baseTiles = [...sourceGroup.tiles];
          const [removed] = baseTiles.splice(dragSource.index, 1);
          if (removed !== tileCode) return; // 안전장치

          const nextTableGroups = freshTableGroups
            .map((g) => (g.id === dragSource.groupId ? { ...g, tiles: baseTiles, type: classifySetType(baseTiles) } : g))
            .filter((g) => g.tiles.length > 0);

          const stillHasPending = nextTableGroups.some((g) => freshPendingGroupIds.has(g.id));
          setPendingTableGroups(stillHasPending ? nextTableGroups : null);
          if (!stillHasPending) clearPendingGroupIds();
          setPendingMyTiles([...freshMyTiles, tileCode]);
          return;
        }

        // 테이블 → 다른 그룹 이동 (유형 3)
        if (!freshHasInitialMeld) return; // 최초 등록 전에는 재배치 금지
        const targetGroup = freshTableGroups.find((g) => g.id === over.id);
        if (!targetGroup) return;
        // 자기 자신으로 이동하는 경우 no-op (동일 object id면 tiles가 두 번 변형됨)
        if (targetGroup.id === sourceGroup.id) return;

        const updatedSourceTiles = [...sourceGroup.tiles];
        const [removed] = updatedSourceTiles.splice(dragSource.index, 1);
        if (removed !== tileCode) return; // 렌더와 state가 어긋나면 중단

        const updatedTargetTiles = [...targetGroup.tiles, tileCode];

        // BUG-UI-REARRANGE-002: 불변성 유지 + 중복 방지
        // map 결과를 filter하여 빈 그룹 제거, id 기준 unique 체크로 안전장치 추가.
        const nextTableGroups = freshTableGroups
          .map((g) => {
            if (g.id === sourceGroup.id) return { ...g, tiles: updatedSourceTiles, type: classifySetType(updatedSourceTiles) };
            if (g.id === targetGroup.id) return { ...g, tiles: updatedTargetTiles, type: classifySetType(updatedTargetTiles) };
            return g;
          })
          .filter((g) => g.tiles.length > 0);

        // dev assertion: 그룹 ID는 항상 unique해야 한다
        if (process.env.NODE_ENV !== "production") {
          const ids = nextTableGroups.map((g) => g.id);
          if (new Set(ids).size !== ids.length) {
            console.error("[BUG-UI-REARRANGE-002] 그룹 ID 중복 감지", ids);
          }
        }

        setPendingTableGroups(nextTableGroups);
        // 랙 상태는 변화 없음 — freshMyTiles 최신 값을 그대로 유지
        setPendingMyTiles(freshMyTiles);
        // BUG-UI-EXT 수정 4 보충: 소스 그룹이 비워져 제거된 경우 pendingGroupIds 에서도 제거.
        // 기존 addPendingGroupId 만으로는 유령 ID 가 남는다 (clearPendingGroupIds 는 전체 초기화).
        // nextTableGroups 에 실제로 존재하는 그룹 ID 만 남도록 pendingGroupIds 를 atomic 교체.
        // setPendingGroupIds(Zustand set 기반) 를 사용하여 direct setState race 없이 일관성 보장.
        {
          const nextGroupIdSet = new Set(nextTableGroups.map((g) => g.id));
          const updatedPendingIds = new Set(
            [...freshPendingGroupIds, targetGroup.id].filter((id) => nextGroupIdSet.has(id))
          );
          setPendingGroupIds(updatedPendingIds);
        }
        return;
      }

      // ------------------------------------------------------------
      // P3: 조커 교체 (§6.2 유형 4)
      // 랙 타일을 조커가 포함된 그룹에 드롭하면 조커를 해당 타일로 교체하고
      // 회수한 조커를 pendingRecoveredJokers 풀로 이동시킨다. 교체 대상은
      // pending/서버 확정 그룹 모두 포함 (최초 등록 후). 규칙 V-07: 회수한
      // 조커는 같은 턴에 다른 세트에 사용해야 ConfirmTurn 가능.
      // ------------------------------------------------------------
      const swapCandidate = freshTableGroups.find((g) => g.id === over.id);
      if (swapCandidate) {
        const hasJoker = swapCandidate.tiles.some((t) => t === "JK1" || t === "JK2");
        if (hasJoker) {
          // 서버 확정 그룹에서 조커를 빼내려면 최초 등록이 완료되어 있어야 한다 (§6.1)
          const isPending = freshPendingGroupIds.has(swapCandidate.id);
          if (isPending || freshHasInitialMeld) {
            const swap = tryJokerSwap(swapCandidate.tiles, tileCode);
            if (swap) {
              const nextTableGroups = freshTableGroups.map((g) =>
                g.id === swapCandidate.id
                  ? { ...g, tiles: swap.nextTiles, type: classifySetType(swap.nextTiles) }
                  : g
              );
              // I-4 핫픽스 (옵션 B): 회수된 조커를 pendingMyTiles 에 즉시 append하여
              // 기존 랙 UI 에서 드래그 가능하게 한다.
              // addRecoveredJoker 는 "경고 배너 only (§6.2 유형 4 의무 안내)" 역할 유지.
              // nextMyTilesAfterSwap 에서 랙 타일을 제거한 뒤 조커를 추가하면
              // 사용자는 JokerSwapIndicator 배너를 보면서도 랙에서 조커를 끌 수 있다.
              const nextMyTilesAfterSwap = [
                ...removeFirstOccurrence(freshMyTiles, tileCode),
                swap.recoveredJoker,
              ];
              setPendingTableGroups(nextTableGroups);
              setPendingMyTiles(nextMyTilesAfterSwap);
              addPendingGroupId(swapCandidate.id);
              addRecoveredJoker(swap.recoveredJoker);
              return;
            }
          }
        }
      }

      // 기존 pending 그룹에 드롭한 경우
      const existingPendingGroup = freshPendingTableGroups?.find(
        (g) => g.id === over.id && freshPendingGroupIds.has(g.id)
      );

      if (existingPendingGroup) {
        // 랙 -> pending 그룹: 해당 그룹에 타일 추가 + BUG-UI-005: 타입 재분류
        // BUG-UI-009(F-2): 직접 드롭 시에도 isCompatibleWithGroup 호환성 검증.
        // 이전 코드는 색상/숫자 체크 없이 무조건 병합 → 파랑 타일이 노랑 런에 합쳐지는 버그.
        // 호환되지 않으면 새 그룹으로 생성한다.
        if (!isCompatibleWithGroup(tileCode, existingPendingGroup)) {
          // BUG-UI-EXT 수정 4: createNewPendingGroup 공통 함수로 추출된 로직 (inline 버전)
          // 기존 [...currentTableGroups, newGroup] 9개 분산 지점을 freshTableGroups 기반으로 통일
          pendingGroupSeqRef.current += 1;
          const newGroupId = `pending-${Date.now()}-${pendingGroupSeqRef.current}`;
          const newGroup: TableGroup = {
            id: newGroupId,
            tiles: [tileCode],
            type: classifySetType([tileCode]),
          };
          const nextTableGroups = [...freshTableGroups, newGroup];
          const nextMyTiles = removeFirstOccurrence(freshMyTiles, tileCode);
          setPendingTableGroups(nextTableGroups);
          setPendingMyTiles(nextMyTiles);
          addPendingGroupId(newGroupId);
          if (freshPendingRecoveredJokers.includes(tileCode)) {
            removeRecoveredJoker(tileCode);
          }
          return;
        }
        const nextTableGroups = freshTableGroups.map((g) => {
          if (g.id !== existingPendingGroup.id) return g;
          const updatedTiles = [...g.tiles, tileCode];
          return { ...g, tiles: updatedTiles, type: classifySetType(updatedTiles) };
        });
        // I-1 핫픽스: setPendingTableGroups 호출 직전 중복 타일 감지
        // 드롭 반복/잔상 클릭으로 같은 타일이 여러 그룹에 복제되면 즉시 거부한다.
        {
          const dupes = detectDuplicateTileCodes(nextTableGroups);
          if (dupes.length > 0) {
            useWSStore.getState().setLastError(
              `타일 중복 감지: ${dupes.join(", ")} — 되돌리기 후 다시 배치하세요`
            );
            return;
          }
        }
        const nextMyTiles = removeFirstOccurrence(freshMyTiles, tileCode);
        setPendingTableGroups(nextTableGroups);
        setPendingMyTiles(nextMyTiles);
        if (freshPendingRecoveredJokers.includes(tileCode)) {
          removeRecoveredJoker(tileCode);
        }
        return;
      }

      // BUG-UI-REARRANGE-001: 서버 확정 그룹에 드롭한 경우 (재배치 합병)
      // 기존 구현은 pending 그룹에만 머지를 허용했고, 서버 확정 그룹은 드롭이 무시되거나
      // board로 fallback되어 새 그룹으로 만들어졌다. 루미큐브 규칙 §6.2(합병)을 지원하기 위해
      // 최초 등록 완료 상태에서는 서버 확정 그룹도 머지 가능하도록 확장한다.
      //
      // A2: 호환성 사전 필터 (잡종 생성 차단)
      // closestCenter 알고리즘이 빈 공간 드롭을 인접 서버 그룹으로 오매핑하거나,
      // 사용자가 의도치 않게 호환되지 않는 타일을 서버 그룹 위로 드롭한 경우
      // isCompatibleWithGroup 검증 없이 merge하면 잡종 그룹이 생성된다.
      // 예: {R13,B13,K13} 에 B11 드롭 → [R13,B13,K13,B11] 잡종 (스크린샷 170801 증거)
      // 호환 안 되면 새 그룹 생성 경로(옵션 A)로 폴스루 — 사용자 의도에 더 가까움.
      const targetServerGroup = freshTableGroups.find((g) => g.id === over.id);

      // FINDING-01 (Issue #46) — I-18 완전 롤백: freshHasInitialMeld=false 상태에서
      // 서버 확정 그룹 영역에 드롭된 경우는 반드시 새 pending 그룹을 생성한다.
      //
      // 근거:
      //   - 서버 V-04 (초기 등록 30점 검증) 가 서버 그룹에 append 된 세트를 거절하고
      //     플레이어에게 패널티 3장 드로우를 부과 (QA 보고서 72 §4.2.2).
      //   - 이전 I-18 롤백은 이 경로를 treatAsBoardDrop 복합 분기에 의존하여
      //     처리하려 했으나, 실측 결과 어떤 경로로든 line 874-894 (append) 가
      //     실행되는 증상이 재현됨 (RCA: docs/04-testing/73).
      //   - 의존성 제거: "서버 그룹이 targeted 되었고 초기 등록 전이면"
      //     무조건 단일 타일의 새 pending 그룹을 만든다. 조커는 위
      //     swapCandidate 분기가 선행 처리하므로 여기 도달 시 조커 없음.
      //   - BUG-UI-EXT 수정 4: freshTableGroups(최신 참조) 사용으로 stale snapshot 방지
      if (targetServerGroup && !freshHasInitialMeld) {
        // UX-004: 초기 등록 미완료 안내 토스트 — 같은 턴 내 1회만 표시
        // (GameClient.tsx FINDING-01 early-return 직전 삽입, docs/02-design/53 §4.2)
        if (!extendLockToastShownRef.current) {
          extendLockToastShownRef.current = true;
          setShowExtendLockToast(true);
        }
        pendingGroupSeqRef.current += 1;
        const newGroupId = `pending-${Date.now()}-${pendingGroupSeqRef.current}`;
        const newGroup: TableGroup = {
          id: newGroupId,
          tiles: [tileCode],
          type: classifySetType([tileCode]),
        };
        const nextTableGroups = [...freshTableGroups, newGroup];
        const nextMyTiles = removeFirstOccurrence(freshMyTiles, tileCode);
        setPendingTableGroups(nextTableGroups);
        setPendingMyTiles(nextMyTiles);
        addPendingGroupId(newGroupId);
        if (freshPendingRecoveredJokers.includes(tileCode)) {
          removeRecoveredJoker(tileCode);
        }
        return;
      }

      if (targetServerGroup && freshHasInitialMeld) {
        if (!isCompatibleWithGroup(tileCode, targetServerGroup)) {
          // 호환 안 됨: 새 그룹 생성 (옵션 A 폴스루)
          // BUG-UI-EXT 수정 4: freshTableGroups 기반으로 통일 (stale currentTableGroups 제거)
          pendingGroupSeqRef.current += 1;
          const newGroupId = `pending-${Date.now()}-${pendingGroupSeqRef.current}`;
          const newGroup: TableGroup = {
            id: newGroupId,
            tiles: [tileCode],
            type: classifySetType([tileCode]),
          };
          const nextTableGroups = [...freshTableGroups, newGroup];
          const nextMyTiles = removeFirstOccurrence(freshMyTiles, tileCode);
          setPendingTableGroups(nextTableGroups);
          setPendingMyTiles(nextMyTiles);
          addPendingGroupId(newGroupId);
          if (freshPendingRecoveredJokers.includes(tileCode)) {
            removeRecoveredJoker(tileCode);
          }
          return;
        }
        const updatedTiles = [...targetServerGroup.tiles, tileCode];
        const nextTableGroups = freshTableGroups.map((g) =>
          g.id === targetServerGroup.id
            ? { ...g, tiles: updatedTiles, type: classifySetType(updatedTiles) }
            : g
        );
        // I-1 핫픽스: 서버 확정 그룹 append 경로에도 중복 감지 방어
        {
          const dupes = detectDuplicateTileCodes(nextTableGroups);
          if (dupes.length > 0) {
            useWSStore.getState().setLastError(
              `타일 중복 감지: ${dupes.join(", ")} — 되돌리기 후 다시 배치하세요`
            );
            return;
          }
        }
        const nextMyTiles = removeFirstOccurrence(freshMyTiles, tileCode);
        setPendingTableGroups(nextTableGroups);
        setPendingMyTiles(nextMyTiles);
        // pending ID 세트에 등록 → UI에서 "수정 중 (미확정)"으로 표시
        addPendingGroupId(targetServerGroup.id);
        if (freshPendingRecoveredJokers.includes(tileCode)) {
          removeRecoveredJoker(tileCode);
        }
        return;
      }

      // B-1 수정: closestCenter 알고리즘이 빈 보드 영역 드롭을 기존 서버 그룹에
      // 매핑하는 경우, 새 그룹 생성 로직으로 폴스루한다.
      // targetServerGroup && !freshHasInitialMeld 케이스는 위 FINDING-01 early-return 이
      // 전담하므로 여기서는 game-board 직접 드롭만 처리한다.
      const treatAsBoardDrop = over.id === "game-board";

      if (treatAsBoardDrop) {
        // 보드 빈 공간에 드롭
        // BUG-NEW-001 수정: game-board 드롭 시 lastPendingGroup으로 서버 확정 그룹을
        // 사용하면 안 된다. 서버 확정 그룹에 타일을 추가하는 경로는 명시적 그룹 드롭존을
        // 통해야 한다 (targetServerGroup 분기). 여기서는 "pending-" 접두사로 생성된
        // 순수 신규 그룹만 고려하여 의도치 않은 서버 그룹 오염을 방지한다.
        const pendingOnlyGroups = freshPendingTableGroups?.filter((g) =>
          freshPendingGroupIds.has(g.id) && g.id.startsWith("pending-")
        );
        const lastPendingGroup = pendingOnlyGroups?.at(-1);

        // BUG-UI-001 수정 + BUG-UI-CLASSIFY-001a 강화: 자동 새 그룹 생성 조건 판단
        // 1) forceNewGroup이 활성화된 경우
        // 2) 마지막 pending 그룹이 4개 이상 그룹이거나 최대 한계에 도달
        // 3) 마지막 pending 그룹과 숫자/색상이 모두 불일치하면 합치지 말 것
        //    (예: 1개 타일만 있는 pending 그룹 [R7]에 Y4 드롭 → 새 그룹)
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

          // BUG-UI-CLASSIFY-001a: 타일이 1개일 때는 양쪽 다 후보가 되지만,
          // 새 타일이 숫자/색 모두 불일치하면 그룹도 런도 될 수 없으므로 새 그룹.
          if (isGroupCandidate && isRunCandidate) {
            const refNumber = existingTiles[0].number;
            const refColor = existingTiles[0].color;
            const numberMatches = newTile.number === refNumber;
            const colorMatches = newTile.color === refColor;
            if (!numberMatches && !colorMatches) return true;
            // 그룹 후보: 숫자 같고 색 다름 → 허용 (기존 합치기)
            // 런 후보: 색 같고 숫자 연속(±1)이면 허용, 아니면 새 그룹
            if (!numberMatches && colorMatches) {
              if (newTile.number === null) return false;
              const refNum = refNumber ?? 0;
              if (Math.abs(newTile.number - refNum) !== 1) return true;
            }
          }

          if (isGroupCandidate && !isRunCandidate) {
            // 그룹 후보: 새 타일 숫자가 다르면 새 그룹 생성
            const groupNumber = existingTiles[0].number;
            if (newTile.number !== groupNumber) return true;
            // 그룹 내 색 중복이면 새 그룹 생성
            if (existingColors.has(newTile.color)) return true;
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

          // BUG-UI-CLASSIFY-001a: 그룹도 런도 아닌 잡혼 상태면 항상 새 그룹
          if (!isGroupCandidate && !isRunCandidate) return true;

          return false;
        })();

        if (lastPendingGroup && !shouldCreateNewGroup) {
          // 마지막 pending 그룹에 타일 추가 + BUG-UI-005: 타입 재분류
          // BUG-UI-EXT 수정 4: freshTableGroups 기반으로 통일
          const updatedTiles = [...lastPendingGroup.tiles, tileCode];
          const nextTableGroups = freshTableGroups.map((g) =>
            g.id === lastPendingGroup.id
              ? { ...g, tiles: updatedTiles, type: classifySetType(updatedTiles) }
              : g
          );
          const nextMyTiles = removeFirstOccurrence(freshMyTiles, tileCode);
          setPendingTableGroups(nextTableGroups);
          setPendingMyTiles(nextMyTiles);
          if (freshPendingRecoveredJokers.includes(tileCode)) {
            removeRecoveredJoker(tileCode);
          }
        } else {
          // 새 그룹 생성 (서버 미전송, 프리뷰 상태)
          // BUG-UI-REARRANGE-002: 단조 카운터로 ID 생성 → 동일 ms 중복 방지
          // BUG-UI-EXT 수정 4: freshTableGroups 기반으로 통일 (stale snapshot 방지)
          pendingGroupSeqRef.current += 1;
          const newGroupId = `pending-${Date.now()}-${pendingGroupSeqRef.current}`;
          // BUG-UI-005: 새 그룹 타일로 타입 자동 판별
          const newGroup: TableGroup = {
            id: newGroupId,
            tiles: [tileCode],
            type: classifySetType([tileCode]),
          };
          const nextTableGroups = [...freshTableGroups, newGroup];
          // dev assertion: 그룹 ID는 항상 unique해야 한다
          if (process.env.NODE_ENV !== "production") {
            const ids = nextTableGroups.map((g) => g.id);
            if (new Set(ids).size !== ids.length) {
              console.error("[BUG-UI-REARRANGE-002] 그룹 ID 중복 감지", ids);
            }
          }
          const nextMyTiles = removeFirstOccurrence(freshMyTiles, tileCode);
          setPendingTableGroups(nextTableGroups);
          setPendingMyTiles(nextMyTiles);
          // 새로 생성된 그룹을 프리뷰 ID 세트에 등록
          addPendingGroupId(newGroupId);
          // forceNewGroup은 false로 리셋하지 않음 - 사용자가 수동 토글하도록 유지
          if (forceNewGroup) setForceNewGroup(false);
          if (freshPendingRecoveredJokers.includes(tileCode)) {
            removeRecoveredJoker(tileCode);
          }
        }
      } else if (over.id === "game-board-new-group") {
        // G-5: 새 그룹 드롭존에 직접 드롭 → 무조건 새 그룹 생성
        // (game-board의 shouldCreateNewGroup 조건 판단을 우회하여 즉시 새 그룹)
        // BUG-UI-EXT 수정 4: freshTableGroups 기반으로 통일
        pendingGroupSeqRef.current += 1;
        const newGroupId = `pending-${Date.now()}-${pendingGroupSeqRef.current}`;
        const newGroup: TableGroup = {
          id: newGroupId,
          tiles: [tileCode],
          type: classifySetType([tileCode]),
        };
        const nextTableGroups = [...freshTableGroups, newGroup];
        if (process.env.NODE_ENV !== "production") {
          const ids = nextTableGroups.map((g) => g.id);
          if (new Set(ids).size !== ids.length) {
            console.error("[BUG-UI-REARRANGE-002] 그룹 ID 중복 감지 (new-group-dropzone)", ids);
          }
        }
        const nextMyTiles = removeFirstOccurrence(freshMyTiles, tileCode);
        setPendingTableGroups(nextTableGroups);
        setPendingMyTiles(nextMyTiles);
        addPendingGroupId(newGroupId);
        if (freshPendingRecoveredJokers.includes(tileCode)) {
          removeRecoveredJoker(tileCode);
        }
      } else if (over.id === "player-rack") {
        // 보드 -> 랙: pending 그룹에 실제로 있는 타일만 회수
        // (랙->랙 오드롭 시 서버 그룹 타일을 삭제하는 버그 방지)
        // BUG-UI-EXT 수정 1: freshPendingTableGroups/freshPendingGroupIds 사용 (stale 방지)
        if (freshPendingTableGroups) {
          // pending 그룹 중 해당 tileCode를 포함하는 첫 번째 그룹 인덱스를 탐색
          const sourceGroupIdx = freshPendingTableGroups.findIndex(
            (g) => freshPendingGroupIds.has(g.id) && g.tiles.includes(tileCode)
          );
          if (sourceGroupIdx < 0) return;

          // BUG-UI-006(G-3): filter((t) => t !== tileCode)는 ALL 그룹의 ALL 일치를
          // 제거해 고스트 타일 잔존 / 타일 소멸을 유발한다.
          // removeFirstOccurrence로 원본 그룹에서 1개만 정확히 제거한다.
          const updated = freshPendingTableGroups
            .map((g, idx) => {
              if (idx !== sourceGroupIdx) return g;
              return { ...g, tiles: removeFirstOccurrence(g.tiles, tileCode) };
            })
            .filter((g) => g.tiles.length > 0);

          const stillHasPending = updated.some((g) => freshPendingGroupIds.has(g.id));
          setPendingTableGroups(stillHasPending ? updated : null);
          if (!stillHasPending) clearPendingGroupIds();
          setPendingMyTiles([...freshMyTiles, tileCode]);
        }
      }
      } finally {
        // BUG-UI-009: queueMicrotask 로 unlock — React commit 이후에 해제하여
        // 정상 연속 드래그(다음 pointer down 이벤트)는 차단하지 않는다.
        queueMicrotask(() => {
          isHandlingDragEndRef.current = false;
        });
      }
    },
    [
      isMyTurn,
      setPendingTableGroups,
      setPendingMyTiles,
      addPendingGroupId,
      clearPendingGroupIds,
      setPendingGroupIds,
      addRecoveredJoker,
      removeRecoveredJoker,
      // BUG-UI-EXT 수정 1: currentTableGroups(useMemo stale) 와 currentMyTiles 를 deps 에서 제거.
      // handleDragEnd 내부에서 useGameStore.getState() 로 최신 참조를 직접 획득하므로
      // useMemo snapshot 에 대한 deps 불필요. React 경고 억제를 위해 stable setter 함수만 유지.
      // 단, forceNewGroup 은 React state 라 deps 필요.
      forceNewGroup,
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

  // Issue #48: CONFIRM_TURN 전송 후 서버 응답(TURN_START or INVALID_MOVE) 대기 중 락
  // — pendingTableGroups 가 null 로 reset 되면(TURN_START 핸들러) 자동 해제
  const [confirmBusy, setConfirmBusy] = useState(false);

  // 락 해제: pendingTableGroups 가 null/undefined 로 초기화될 때 (TURN_START 성공 또는 INVALID_MOVE 후)
  // 의존성 배열: [pendingTableGroups, confirmBusy] 이 둘만 — 다른 값 포함 시 과도한 실행
  useEffect(() => {
    if (!pendingTableGroups && confirmBusy) {
      setConfirmBusy(false);
    }
  }, [pendingTableGroups, confirmBusy]);

  // 턴 확정: 프리뷰 상태를 서버에 전송 후 확정
  // BUG-UI-006: pending 상태를 즉시 커밋하지 않음.
  // 서버가 TURN_END(성공)를 보내면 TURN_START 핸들러에서 resetPending() 으로 정리되고,
  // INVALID_MOVE(실패)를 보내면 resetPending() + ErrorToast 가 사유를 표시한다.
  const handleConfirm = useCallback(() => {
    if (confirmBusy) return;               // [Issue #48] 서버 응답 대기 중 중복 클릭 차단
    if (!pendingTableGroups) return;
    // M-4: pendingMyTiles가 null이면 확정 차단
    if (!pendingMyTiles) return;

    // P3 / I-19 수정: 조커 교체로 회수한 조커가 있으면 같은 턴 내에 다른 세트에 사용 필수
    // (§6.2 유형 4, 엔진 V-07).
    //
    // 이전 구현 문제(I-19): pendingRecoveredJokers.length > 0 로 차단하면,
    // 조커를 이미 보드에 배치해서 pendingMyTiles 에서 제거한 경우에도 차단이 유지됨
    // → 완전한 데드락. 사용자가 조커를 보드에 정상 배치했더라도 확정 불가.
    //
    // 수정(옵션 c): "회수된 조커 코드 중 pendingMyTiles 에 아직 남아있는 것" 을 기준으로 차단.
    // 조커가 보드에 드롭되면 pendingMyTiles 에서 제거되므로 자동으로 차단 해제된다.
    const unplacedRecoveredJokers = pendingRecoveredJokers.filter((jkCode) =>
      pendingMyTiles.includes(jkCode)
    );
    if (unplacedRecoveredJokers.length > 0) {
      useWSStore
        .getState()
        .setLastError("회수한 조커(JK)를 같은 턴에 다른 세트에 사용해야 합니다");
      return;
    }

    // C-3: 클라이언트 측 사전 검증 -- 서버 전송 전 기본 유효성 확인
    // G-2: 무효 블록 ID를 수집하여 UI 강조에 사용
    const pendingOnlyGroups = pendingTableGroups.filter((g) => pendingGroupIds.has(g.id));
    for (let blockIdx = 0; blockIdx < pendingOnlyGroups.length; blockIdx++) {
      const group = pendingOnlyGroups[blockIdx];
      const blockLabel = `${blockIdx + 1}번째 블록`;
      if (group.tiles.length < 3) {
        setInvalidPendingGroupIds(new Set([group.id]));
        useWSStore.getState().setLastError(`${blockLabel}이 유효하지 않습니다 (최소 3개 타일 필요)`);
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
            setInvalidPendingGroupIds(new Set([group.id]));
            useWSStore.getState().setLastError(`${blockLabel}이 유효하지 않습니다 (같은 색상 타일 중복)`);
            return;
          }
        } else if (colors.size === 1) {
          // 런: 같은 색, 연속 숫자
          const sortedNums = Array.from(numbers).filter((n): n is TileNumber => n !== null).sort((a, b) => a - b);
          for (let i = 1; i < sortedNums.length; i++) {
            if (sortedNums[i] - sortedNums[i - 1] !== 1) {
              setInvalidPendingGroupIds(new Set([group.id]));
              useWSStore.getState().setLastError(`${blockLabel}이 유효하지 않습니다 (연속된 숫자가 아닙니다)`);
              return;
            }
          }
        } else {
          setInvalidPendingGroupIds(new Set([group.id]));
          useWSStore.getState().setLastError(`${blockLabel}이 유효하지 않습니다 (색 혼합 세트)`);
          return;
        }
      }
    }

    // BUG-UI-006(G-3): 고스트 타일 무결성 검사
    // pendingTableGroups에 동일 tile code가 2번 이상 등장하면 V-03(중복) 위반.
    // 이 검사는 서버 전송 전 마지막 방어선이다.
    {
      const duplicateCodes = detectDuplicateTileCodes(pendingTableGroups);
      if (duplicateCodes.length > 0) {
        useWSStore.getState().setLastError(
          `타일 중복 감지: ${duplicateCodes.join(", ")} — 되돌리기 후 다시 배치하세요`
        );
        return;
      }
    }

    // tilesFromRack: 원본 랙에서 이번 턴에 보드로 이동한 타일 목록
    // pendingMyTiles에 남아있지 않은 타일 = 보드로 배치된 타일
    const tilesFromRack = myTiles.filter(
      (t) => !pendingMyTiles.includes(t)
    );
    // F3 ROLLBACK (2026-04-24): optimistic setMyTiles 가 extend 경로 drop 중
    // pending state 를 침범해 EXT-SC1/SC3/GHOST-SC2 회귀 3건 유발.
    // V-04 SC1 은 Sprint 7 Week 2 에서 MOVE_ACCEPTED 이벤트 구독 방식으로 재구현.
    // [Issue #48] 전송 직전 락 설정 — TURN_START 또는 INVALID_MOVE 수신 시 useEffect 에서 해제
    setConfirmBusy(true);
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
    confirmBusy,
    pendingTableGroups,
    pendingMyTiles,
    pendingRecoveredJokers,
    pendingGroupIds,
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
    setInvalidPendingGroupIds(new Set());
    // UX-004: 되돌리기 시 ExtendLockToast 1회 표시 카운터도 초기화 (다음 드롭 시 재안내)
    extendLockToastShownRef.current = false;
    setShowExtendLockToast(false);
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

  // F1/F2 (BUG-UI-012 Phase 2): gameStatus='ended' 모달 렌더 조건 배선.
  // PLAYER_FORFEITED 또는 GAME_OVER 이벤트로 gameStatus='ended' 가 설정되면
  // gameEnded(GAME_OVER 전용) 와 별개로 기권 종료 모달을 즉시 표시한다.
  // endReason + winner 를 props 로 전달하여 정상 한글 문구를 렌더링 가능.
  if (gameStatus === "ended" && !gameEnded) {
    return (
      <div
        role="dialog"
        aria-label="게임 종료"
        className="fixed inset-0 z-50 flex items-center justify-center bg-black/70"
      >
        <div className="bg-surface border border-border rounded-2xl p-8 max-w-md w-full text-center space-y-4">
          <h2 className="text-xl font-bold text-text-primary">
            {endReason === "opponent_forfeit" ? "상대방 기권" : "게임 종료"}
          </h2>
          <p className="text-text-secondary">
            {endReason === "opponent_forfeit"
              ? "상대방이 기권하여 게임이 중단되었습니다."
              : "게임이 종료되었습니다."}
          </p>
          {gameWinner && (
            <p className="text-text-primary font-semibold">
              {gameWinner.displayName} 승리
            </p>
          )}
          <button
            onClick={() => {
              resetGameStore();
              router.push("/lobby");
            }}
            className="mt-4 px-6 py-2 bg-primary text-white rounded-lg hover:bg-primary/80 transition"
          >
            로비로 돌아가기
          </button>
        </div>
      </div>
    );
  }

  return (
    <>
      <ErrorToast />
      {/* UX-004: ExtendLockToast — top-24, ReconnectToast 아래 (top-32로 하향) */}
      <ExtendLockToast
        visible={showExtendLockToast}
        onDismiss={() => setShowExtendLockToast(false)}
      />
      <ReconnectToast />
      {/* RateLimitToast는 layout.tsx에서 전역 마운트 */}
    <DndContext
      sensors={sensors}
      collisionDetection={pointerWithinThenClosest}
      onDragStart={handleDragStart}
      onDragEnd={handleDragEnd}
      onDragCancel={handleDragCancel}
    >
      <div className="h-screen bg-app-bg flex flex-col overflow-hidden">
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

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setHistoryCollapsed((v) => !v)}
              className={[
                "px-2 py-1 rounded-md text-[11px] font-medium border transition-colors",
                historyCollapsed
                  ? "border-border text-text-secondary hover:text-text-primary hover:border-text-secondary"
                  : "border-warning/60 text-warning bg-warning/10 hover:bg-warning/15",
              ].join(" ")}
              aria-pressed={!historyCollapsed}
              aria-label="턴 히스토리 패널 토글"
              title={historyCollapsed ? "히스토리 보이기" : "히스토리 숨기기"}
            >
              히스토리
            </button>
            <span className="text-tile-xs text-text-secondary">
              턴 #{turnNumber}
            </span>
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
        <div className="flex flex-1 overflow-hidden min-h-0">
          {/* 좌측 사이드: 내 플레이어 카드 + 드로우 파일 */}
          <aside
            className="w-48 flex-shrink-0 bg-panel-bg border-r border-border p-3 flex flex-col gap-3"
            aria-label="내 정보 패널"
          >
            {/* 내 플레이어 카드
                G-4: pendingMyTiles가 있으면 tileCount를 currentMyTiles.length로 override.
                player.tileCount는 서버 기준값이어서 pending 배치 중 drift가 발생함.
                PlayerRack 헤더와 동일한 값(currentMyTiles.length)을 보여줌으로써 일관성 유지.
            */}
            {players
              .filter((p) => p.seat === effectiveMySeat)
              .map((player) => (
                <PlayerCard
                  key={player.seat}
                  player={{
                    ...player,
                    tileCount: currentMyTiles.length,
                  }}
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
          <main className="flex-1 flex flex-col p-4 gap-3 overflow-hidden min-h-0 min-w-0">
            {/* UX-004: 초기 등록 안내 배너 (최초 진입 1회) */}
            <InitialMeldBanner
              hasInitialMeld={effectiveHasInitialMeld}
              roomId={roomId}
            />

            {/* 게임 보드 — 최근 턴 하이라이트 포함 */}
            <GameBoard
              tableGroups={currentTableGroups}
              isMyTurn={isMyTurn}
              isDragging={isDragging}
              pendingGroupIds={pendingGroupIds}
              invalidPendingGroupIds={invalidPendingGroupIds}
              recentTileCodes={recentTileCodes}
              recentTileVariant={recentTileVariant}
              groupsDroppable={isMyTurn && (isDragging || !!pendingTableGroups)}
              tilesDraggable={isMyTurn}
              validMergeGroupIds={validMergeGroupIds}
              showNewGroupDropZone={isMyTurn}
              hasInitialMeld={effectiveHasInitialMeld}
              className="flex-1"
            />

            {/* G-5: 새 그룹 버튼 — 내 턴이면 항상 표시 (pending 여부 무관)
                사용자가 drag 전에도 "새 그룹 모드"를 미리 활성화할 수 있게 한다.
                버튼 크기와 색상을 강화하여 가시성 향상.
            */}
            {isMyTurn && (
              <div className="flex items-center justify-between flex-shrink-0">
                <span className="text-tile-sm text-text-secondary/60 whitespace-nowrap">
                  {pendingTableGroups
                    ? "숫자/색상이 다른 타일은 자동으로 새 그룹이 됩니다"
                    : "타일을 드래그해 테이블에 배치하세요"}
                </span>
                <button
                  type="button"
                  onClick={() => setForceNewGroup(!forceNewGroup)}
                  className={[
                    "px-4 py-2.5 rounded-lg text-sm font-bold border-2 transition-all min-w-[120px]",
                    forceNewGroup
                      ? "border-warning text-warning bg-warning/15 shadow-[0_0_8px_rgba(234,179,8,0.3)]"
                      : "border-green-500/70 text-green-300 bg-green-500/15 hover:border-green-400 hover:bg-green-500/25 hover:text-green-200",
                  ].join(" ")}
                  aria-label="다음 드롭 시 새 그룹 생성"
                  aria-pressed={forceNewGroup}
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
                <span className="text-tile-sm text-text-secondary">
                  내 패{" "}
                  <span className="text-text-primary font-medium">
                    ({currentMyTiles.length}장)
                  </span>
                  {effectiveHasInitialMeld ? (
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
                    className="text-tile-sm bg-warning/20 text-warning px-2 py-0.5 rounded-full font-medium"
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
                confirmBusy={confirmBusy}
                onDraw={handleDraw}
                onUndo={handleUndo}
                onConfirm={handleConfirm}
                onPass={handlePass}
              />
            </div>
          </main>

          {/* 우측: 턴 히스토리 패널 (토글로 숨김 가능) */}
          <TurnHistoryPanel
            history={turnHistory}
            players={players}
            mySeat={effectiveMySeat}
            className={historyCollapsed ? "hidden" : "w-44 flex-shrink-0 h-full"}
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
