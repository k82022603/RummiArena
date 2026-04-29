"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  registerWSSendBridge,
  unregisterWSSendBridge,
  useTurnActions,
} from "@/hooks/useTurnActions";
import { useDragHandlers } from "@/hooks/useDragHandlers";
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  useSensor,
  useSensors,
} from "@dnd-kit/core";
import { pointerWithinThenClosest } from "@/lib/dndCollision";
import { motion, AnimatePresence } from "framer-motion";
import { useRouter } from "next/navigation";
import { useWebSocket } from "@/hooks/useWebSocket";
import { useGameLeaveGuard } from "@/hooks/useGameLeaveGuard";
import { useGameStore } from "@/store/gameStore";
import { useWSStore } from "@/store/wsStore";
import { useRoomStore } from "@/store/roomStore";
import { useRateLimitStore } from "@/store/rateLimitStore";
import { usePendingStore } from "@/store/pendingStore";
import { useDragStateStore } from "@/store/dragStateStore";
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

import type { TileCode, TileNumber, TableGroup } from "@/types/tile";
import { parseTileCode } from "@/types/tile";
import { calculateScore } from "@/lib/practice/practice-engine";
import { computeValidMergeGroups } from "@/lib/mergeCompatibility";
import { validatePendingBlock } from "@/components/game/GameBoard";
import { detectDuplicateTileCodes } from "@/lib/tileStateHelpers";
import type { GameOverPayload } from "@/types/websocket";
import type { Player } from "@/types/game";

// Phase C 단계 2: pendingStore selector fallback용 안정 참조 상수.
// usePendingStore selector가 매 렌더마다 새 빈 Set/배열을 반환하면 useMemo 의존성이
// 매번 변경되어 불필요한 재계산을 유발한다. module-level 상수로 참조 안정성 확보.
// (외부 컴포넌트가 Set<string>을 요구하므로 mutable 타입 그대로 두되,
// 의도상 frozen 으로 사용한다 — 어디에서도 .add/.delete 호출 금지.)
const EMPTY_PENDING_GROUP_IDS: Set<string> = new Set<string>();
const EMPTY_RECOVERED_JOKERS: TileCode[] = [];


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
// A3: 커스텀 collisionDetection — pointerWithinThenClosest 는 lib/dndCollision 에서 import.
//   P3-3 Step 3b 에서 추출. GameRoom 이 DndContext 를 소유할 때 동일 헬퍼 사용.
// ------------------------------------------------------------------

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

  // useTurnActions — confirmEnabled / resetEnabled / drawEnabled 를 ActionBar에 연결
  // WS 브릿지 등록(위 useEffect) 이후에 선언한다.
  // GameRoom은 중복 호출을 제거하고 이 컴포넌트에서 단일 인스턴스로 관리한다.
  // Phase 4에서 GameRoom이 turnActions를 props로 내려주는 방식으로 전환할 때
  // 이 줄을 제거하고 props에서 수신한다.
  const turnActions = useTurnActions();

  // G-B Phase E: pendingStore 브릿지 연결 (F17-SC1, GHOST-SC2)
  // GameClient가 pendingStore를 소비하고 있음을 표시한다.
  // GameRoom의 useGameSync(roomId)가 TURN_START → pendingStore.reset()을 담당한다.
  // subscribedByGameClient 플래그는 테스트 통합 검증용이다.
  useEffect(() => {
    usePendingStore.setState({ subscribedByGameClient: true });
    return () => {
      usePendingStore.setState({ subscribedByGameClient: false });
    };
  }, []);

  const {
    mySeat,
    myTiles,
    gameState,
    players,
    hasInitialMeld,
    // Phase C 단계 2: pendingTableGroups/pendingMyTiles/pendingGroupIds/pendingRecoveredJokers
    // read는 pendingStore.draft 기반 selector(draftPending* 변수)로 이동.
    // Phase C 단계 3: setPending*/addPending*/clearPending*/addRecoveredJoker/removeRecoveredJoker/
    // clearRecoveredJokers/setPendingGroupIds 등 deprecated setter destructuring도 제거.
    // handleDragEnd/handleUndo는 pendingStore.applyMutation/reset() 으로 single-write 전환됨.
    aiThinkingSeat,
    turnNumber,
    currentPlayerId,
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

  // Phase C 단계 2: pendingStore.draft 파생 selector 4종.
  // gameStore deprecated 필드(pendingTableGroups/pendingMyTiles/pendingGroupIds/pendingRecoveredJokers)
  // 의 read를 pendingStore.draft 기반으로 전환한다. (단계 3에서 dual-write 제거 시 위 4개 destructuring도 제거)
  // null 의미론 보존: draft===null 또는 draft.groups가 비어있고 pendingGroupIds가 비면 pending 상태 없음.
  // gameStore.pendingTableGroups의 null 의미를 보존하기 위해 draft===null일 때 null을 반환한다.
  const draftPendingTableGroups = usePendingStore((s): TableGroup[] | null =>
    s.draft ? s.draft.groups : null
  );
  const draftPendingMyTiles = usePendingStore((s): TileCode[] | null =>
    s.draft ? s.draft.myTiles : null
  );
  const draftPendingGroupIds = usePendingStore(
    (s): Set<string> => s.draft?.pendingGroupIds ?? EMPTY_PENDING_GROUP_IDS
  );
  const draftRecoveredJokers = usePendingStore(
    (s): TileCode[] => s.draft?.recoveredJokers ?? EMPTY_RECOVERED_JOKERS
  );

  // F4 (FINDING-01 재검토): effectiveHasInitialMeld — players[mySeat].hasInitialMeld 를 1차 SSOT,
  // 루트 hasInitialMeld 를 fallback 으로 사용하는 derived 값.
  // GAME_STATE 핸들러(useWebSocket.ts)가 players[] 만 업데이트하는 구조 때문에
  // 루트 hasInitialMeld 가 stale 될 수 있다 (architect 가이드 §F4 B1).
  const effectiveHasInitialMeld = useMemo(() => {
    if (mySeat === null || mySeat < 0) return hasInitialMeld;
    const me = players.find((p) => p.seat === mySeat);
    return me?.hasInitialMeld ?? hasInitialMeld;
  }, [players, mySeat, hasInitialMeld]);

  // P3-3 Step 2 (2026-04-29): activeDragCode 를 dragStateStore.activeTile 로 통합.
  //   useDragHandlers 가 setActive/clearActive 로 이미 store 를 관리하고 있어 React state 와
  //   이중 관리되던 것을 SSOT 단일화. setActiveDragCode 옵션 제거 (hook 이 이미 store 갱신).
  const activeDragCode = useDragStateStore((s) => s.activeTile);
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
  // P3-3 Step 3b (2026-04-29): dragStateStore.pendingGroupSeq 로 흡수.
  //   GameRoom 으로 hook 호출이 이양되어도 단일 카운터를 공유하기 위해 store-backed ref-like
  //   객체를 유지한다. hook 본체는 .current += 1 패턴 그대로 사용 가능 (인터페이스 호환).
  const pendingGroupSeqRef = useMemo(
    () => ({
      get current() {
        return useDragStateStore.getState().pendingGroupSeq;
      },
      set current(v: number) {
        useDragStateStore.getState().setPendingGroupSeq(v);
      },
    }),
    []
  );

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
  // P3-3 Step 1 (2026-04-29): GameClient.useState 에서 dragStateStore 로 흡수.
  //   "+ 새 그룹" 버튼 onClick + useDragHandlers 자동 리셋 양쪽 모두 store setter 경유.
  //   P3-3 Step 3b 에서 DndContext 가 GameRoom 으로 이전되면 GameRoom 이 직접 store 를 구독한다.
  const forceNewGroup = useDragStateStore((s) => s.forceNewGroup);
  const setForceNewGroup = useDragStateStore((s) => s.setForceNewGroup);

  // UX-004: ExtendLockToast 표시 상태 + 같은 턴 내 1회 추적
  // P3-3 Step 3a (2026-04-29): showExtendLockToast 를 dragStateStore 로 흡수.
  //   GameRoom 으로 DndContext 이전 시 toast 렌더와 hook 옵션을 동시에 store 로 단일화.
  //   extendLockToastShownRef 는 hook 내부 fallback ref 로 충분 (useDragHandlers 단일 인스턴스).
  const showExtendLockToast = useDragStateStore((s) => s.showExtendLockToast);
  const setShowExtendLockToast = useDragStateStore((s) => s.setShowExtendLockToast);
  // P3-3 Step 3b (2026-04-29): extendLockToastShownRef 도 store-backed ref-like 로 흡수.
  //   hook 본체의 .current = true / current 읽기 패턴 호환 + GameRoom 으로 hook 이전 시 동일 store 공유.
  const extendLockToastShownRef = useMemo(
    () => ({
      get current() {
        return useDragStateStore.getState().extendLockToastShown;
      },
      set current(v: boolean) {
        useDragStateStore.getState().setExtendLockToastShown(v);
      },
    }),
    []
  );

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
      // P3-3 Step 1: forceNewGroup 도 dragStateStore 로 이전됐으므로 언마운트 시 리셋
      useDragStateStore.getState().setForceNewGroup(false);
      // P3-3 Step 3a: showExtendLockToast 도 dragStateStore 로 흡수, 언마운트 시 false
      useDragStateStore.getState().setShowExtendLockToast(false);
      // P3-3 Step 3b: pendingGroupSeq + extendLockToastShown 도 흡수, 언마운트 시 리셋
      useDragStateStore.getState().setPendingGroupSeq(0);
      useDragStateStore.getState().setExtendLockToastShown(false);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // G-2: pending 그룹이 변경될 때 무효 ID 세트 자동 정리
  // 사용자가 타일을 추가/제거해 그룹이 수정되면 해당 그룹의 에러 강조를 해제한다.
  // Phase C 단계 2: pendingStore.draft.groups 기반으로 전환.
  useEffect(() => {
    if (invalidPendingGroupIds.size === 0) return;
    if (!draftPendingTableGroups) {
      setInvalidPendingGroupIds(new Set());
      return;
    }
    const existingIds = new Set(draftPendingTableGroups.map((g) => g.id));
    setInvalidPendingGroupIds((prev) => {
      const next = new Set<string>();
      for (const id of prev) {
        if (existingIds.has(id)) next.add(id);
      }
      return next.size === prev.size ? prev : next;
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [draftPendingTableGroups]);

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

  // Phase C 단계 2: pendingStore.draft 파생값 사용. gameStore.pendingTableGroups 의존성 제거.
  const currentTableGroups = useMemo(
    () => draftPendingTableGroups ?? gameState?.tableGroups ?? [],
    [draftPendingTableGroups, gameState?.tableGroups]
  );
  const currentMyTiles = useMemo(
    () => draftPendingMyTiles ?? myTiles,
    [draftPendingMyTiles, myTiles]
  );

  // C-3 + BUG-NEW-003: 모든 pending 그룹이 3개 이상 타일을 가지며
  // 유효한 세트(런/그룹)인지 검증한다.
  // 이전 구현은 tiles.length >= 3 만 확인했으므로 [Y11,K12,B13] 같은
  // 무효 세트(색 혼합 + 숫자 혼합)에서도 확정 버튼이 활성화되는 버그가 있었다.
  // validatePendingBlock을 통해 "invalid" 판정 세트를 사전에 차단한다.
  const allGroupsValid = useMemo(() => {
    if (!draftPendingTableGroups) return true;
    const pendingOnly = draftPendingTableGroups.filter((g) => draftPendingGroupIds.has(g.id));
    return pendingOnly.every((g) => {
      if (g.tiles.length < 3) return false;
      const validity = validatePendingBlock(g.tiles as TileCode[]);
      return validity !== "invalid";
    });
  }, [draftPendingTableGroups, draftPendingGroupIds]);

  // 이번 턴 pending 그룹들의 배치 점수 (최초 등록 30점 안내용)
  const pendingPlacementScore = useMemo(() => {
    if (!draftPendingTableGroups || draftPendingGroupIds.size === 0) return 0;
    const pendingOnlyGroups = draftPendingTableGroups.filter((g) =>
      draftPendingGroupIds.has(g.id)
    );
    return calculateScore(pendingOnlyGroups);
  }, [draftPendingTableGroups, draftPendingGroupIds]);

  // 최근 턴 하이라이트 계산 (pending 배치 중에는 하이라이트 비활성)
  const recentTileCodes = useMemo(() => {
    if (draftPendingTableGroups) return undefined;
    if (!lastTurnPlacement || lastTurnPlacement.placedTiles.length === 0) return undefined;
    return new Set<string>(lastTurnPlacement.placedTiles);
  }, [lastTurnPlacement, draftPendingTableGroups]);

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
  // TODO(P3-3): sensors / pointerWithinThenClosest collisionDetection / DragOverlay 어셈블리는
  //   GameRoom으로 이전. GameClient 외부 컨테이너에서 useDragHandlers를 직접 DndContext에 연결한다.
  //   선결 조건: P3-2 — useDragHandlers가 아래 handleDragEnd ~770줄 인라인 분기와 행동 등가가 되어야 함
  //   (BUG-UI-009/010/EXT guard, forceNewGroup, ExtendLockToast 부수효과 포함).
  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: { distance: 8 },
    })
  );

  // P3-2 (2026-04-28): handleDragStart/Cancel/End 의 ~770줄 인라인 분기를
  // useDragHandlers hook 으로 통합 이전. forceNewGroup / re-entrancy guard /
  // pendingGroupSeqRef / extendLockToast / isMyTurn 가드는 옵션으로 주입한다.
  // 행동 등가는 jest 회귀 + dragEndReducer 분기 망라로 검증.
  // P3-3 Step 2 (2026-04-29): activeDragCode 가 dragStateStore.activeTile 로 통합되어
  //   setActiveDragCode 옵션 제거. hook 이 setActive/clearActive 로 직접 store 갱신.
  // (P3-3 Step 3b 에서 GameRoom 으로 DndContext 이전 시 옵션 전달 책임을 이양한다.)
  const dragHandlers = useDragHandlers({
    forceNewGroup,
    setForceNewGroup,
    isHandlingDragEndRef,
    lastDragEndTimestampRef,
    pendingGroupSeqRef,
    extendLockToastShownRef,
    showExtendLockToast: () => setShowExtendLockToast(true),
    isMyTurn,
    activeDragSourceRef,
  });
  const handleDragStart = dragHandlers.handleDragStart;
  const handleDragEnd = dragHandlers.handleDragEnd;
  const handleDragCancel = dragHandlers.handleDragCancel;


  // 랙 타일 정렬 핸들러 (숫자 오름차순, 조커 마지막)
  // Phase C 단계 2: pending 존재 여부를 draftPendingMyTiles 로 판정.
  // 단계 3에서 dual-write 제거되면 setPendingMyTiles 호출도 함께 정리됨.
  const handleRackSort = useCallback(
    (sorted: TileCode[]) => {
      // Phase C 단계 3: pendingStore.applyMutation 으로 single-write 화.
      // pending 이 있으면 draft.myTiles 만 정렬 적용 (groups/ids/jokers 그대로 유지).
      // pending 이 없으면 gameStore.myTiles 만 정렬.
      const ps = usePendingStore.getState();
      const draft = ps.draft;
      if (draft !== null) {
        ps.applyMutation({
          nextTableGroups: draft.groups,
          nextMyTiles: sorted,
          nextPendingGroupIds: draft.pendingGroupIds,
          nextPendingRecoveredJokers: draft.recoveredJokers,
          nextPendingGroupSeq: pendingGroupSeqRef.current,
          branch: "rack-sort:pending",
        });
      } else {
        setMyTiles(sorted);
      }
    },
    [setMyTiles]
  );

  // Issue #48: CONFIRM_TURN 전송 후 서버 응답(TURN_START or INVALID_MOVE) 대기 중 락
  // — pendingTableGroups 가 null 로 reset 되면(TURN_START 핸들러) 자동 해제
  const [confirmBusy, setConfirmBusy] = useState(false);

  // 락 해제: pending draft 가 null/empty 로 초기화될 때 (TURN_START 성공 또는 INVALID_MOVE 후)
  // 의존성 배열: [draftPendingTableGroups, confirmBusy] 이 둘만 — 다른 값 포함 시 과도한 실행
  // Phase C 단계 2: pendingStore.draft 기반 전환.
  useEffect(() => {
    if (!draftPendingTableGroups && confirmBusy) {
      setConfirmBusy(false);
    }
  }, [draftPendingTableGroups, confirmBusy]);

  // 턴 확정: 프리뷰 상태를 서버에 전송 후 확정
  // BUG-UI-006: pending 상태를 즉시 커밋하지 않음.
  // 서버가 TURN_END(성공)를 보내면 TURN_START 핸들러에서 resetPending() 으로 정리되고,
  // INVALID_MOVE(실패)를 보내면 resetPending() + ErrorToast 가 사유를 표시한다.
  const handleConfirm = useCallback(() => {
    if (confirmBusy) return;               // [Issue #48] 서버 응답 대기 중 중복 클릭 차단
    // Phase C 단계 2: pendingStore.draft 기반 read 전환.
    if (!draftPendingTableGroups) return;
    // M-4: draft.myTiles가 null이면 확정 차단
    if (!draftPendingMyTiles) return;

    // P3 / I-19 수정: 조커 교체로 회수한 조커가 있으면 같은 턴 내에 다른 세트에 사용 필수
    // (§6.2 유형 4, 엔진 V-07).
    //
    // 이전 구현 문제(I-19): recoveredJokers.length > 0 로 차단하면,
    // 조커를 이미 보드에 배치해서 myTiles 에서 제거한 경우에도 차단이 유지됨
    // → 완전한 데드락. 사용자가 조커를 보드에 정상 배치했더라도 확정 불가.
    //
    // 수정(옵션 c): "회수된 조커 코드 중 myTiles 에 아직 남아있는 것" 을 기준으로 차단.
    // 조커가 보드에 드롭되면 myTiles 에서 제거되므로 자동으로 차단 해제된다.
    const unplacedRecoveredJokers = draftRecoveredJokers.filter((jkCode) =>
      draftPendingMyTiles.includes(jkCode)
    );
    if (unplacedRecoveredJokers.length > 0) {
      useWSStore
        .getState()
        .setLastError("회수한 조커(JK)를 같은 턴에 다른 세트에 사용해야 합니다");
      return;
    }

    // C-3: 클라이언트 측 사전 검증 -- 서버 전송 전 기본 유효성 확인
    // G-2: 무효 블록 ID를 수집하여 UI 강조에 사용
    const pendingOnlyGroups = draftPendingTableGroups.filter((g) => draftPendingGroupIds.has(g.id));
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
    // draft.groups에 동일 tile code가 2번 이상 등장하면 V-03(중복) 위반.
    // 이 검사는 서버 전송 전 마지막 방어선이다.
    {
      const duplicateCodes = detectDuplicateTileCodes(draftPendingTableGroups);
      if (duplicateCodes.length > 0) {
        useWSStore.getState().setLastError(
          `타일 중복 감지: ${duplicateCodes.join(", ")} — 되돌리기 후 다시 배치하세요`
        );
        return;
      }
    }

    // tilesFromRack: 원본 랙에서 이번 턴에 보드로 이동한 타일 목록
    // draft.myTiles에 남아있지 않은 타일 = 보드로 배치된 타일
    const tilesFromRack = myTiles.filter(
      (t) => !draftPendingMyTiles.includes(t)
    );
    // F3 ROLLBACK (2026-04-24): optimistic setMyTiles 가 extend 경로 drop 중
    // pending state 를 침범해 EXT-SC1/SC3/GHOST-SC2 회귀 3건 유발.
    // V-04 SC1 은 Sprint 7 Week 2 에서 MOVE_ACCEPTED 이벤트 구독 방식으로 재구현.
    // [Issue #48] 전송 직전 락 설정 — TURN_START 또는 INVALID_MOVE 수신 시 useEffect 에서 해제
    setConfirmBusy(true);
    // 1단계: 이번 턴 배치 내용을 서버에 전송
    send("PLACE_TILES", {
      tableGroups: draftPendingTableGroups,
      tilesFromRack,
    });
    // 2단계: 턴 확정 요청 (서버 응답을 기다림 -- 로컬 상태는 아직 유지)
    send("CONFIRM_TURN", {
      tableGroups: draftPendingTableGroups,
      tilesFromRack,
    });
  }, [
    confirmBusy,
    draftPendingTableGroups,
    draftPendingMyTiles,
    draftRecoveredJokers,
    draftPendingGroupIds,
    myTiles,
    send,
  ]);

  // 턴 되돌리기 (취소): 프리뷰 상태 전체 초기화 후 서버에 롤백 요청
  // Phase C 단계 3: pendingStore.reset() 으로 single-write 화.
  const handleUndo = useCallback(() => {
    send("RESET_TURN", {});
    usePendingStore.getState().reset();
    setForceNewGroup(false);
    setInvalidPendingGroupIds(new Set());
    // UX-004: 되돌리기 시 ExtendLockToast 1회 표시 카운터도 초기화 (다음 드롭 시 재안내)
    extendLockToastShownRef.current = false;
    setShowExtendLockToast(false);
  }, [send]);

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
    {/* TODO(P3-3): DndContext + DragOverlay GameRoom 이전. P3-2 행동 등가 검증 후 진행.
        선결 조건은 GameRoom.tsx 상단 "P3 분해 로드맵" 주석 참조. */}
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

        {/* 게임 본문 */}
        <div className="flex flex-1 overflow-hidden min-h-0">
          {/* 좌측 사이드: 전체 플레이어 카드 + 드로우 파일 */}
          <aside
            className="w-48 flex-shrink-0 min-h-0 bg-panel-bg border-r border-border p-3 flex flex-col gap-2 overflow-y-auto"
            aria-label="플레이어 패널"
          >
            {/* 전체 플레이어 — players 배열을 직접 순회하여 seat 누락 방지.
                BUG-LAYOUT-001: opponents 파생 변수 대신 players 원본 배열 사용.
                내 카드(effectiveMySeat 일치)는 tileCount를 currentMyTiles.length로 override.
                4인 방에서 모든 플레이어가 표시되도록 보장한다. */}
            {players.map((player) => {
              const isMe = player.seat === effectiveMySeat;
              return (
                <PlayerCard
                  key={player.seat}
                  player={
                    isMe
                      ? { ...player, tileCount: currentMyTiles.length }
                      : player
                  }
                  isCurrentTurn={
                    isMe
                      ? isMyTurn
                      : gameState?.currentSeat === player.seat
                  }
                  isAIThinking={!isMe && aiThinkingSeat === player.seat}
                  disconnectCountdown={
                    isMe ? undefined : disconnectCountdowns[player.seat]
                  }
                />
              );
            })}

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
              pendingGroupIds={draftPendingGroupIds}
              invalidPendingGroupIds={invalidPendingGroupIds}
              recentTileCodes={recentTileCodes}
              recentTileVariant={recentTileVariant}
              groupsDroppable={isMyTurn && (isDragging || !!draftPendingTableGroups)}
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
                  {draftPendingTableGroups
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
            {draftRecoveredJokers.length > 0 && (
              <div className="flex-shrink-0 flex justify-center">
                <JokerSwapIndicator recoveredJokers={draftRecoveredJokers} />
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
                drawPileCount={gameState?.drawPileCount}
                confirmBusy={confirmBusy}
                onDraw={handleDraw}
                onUndo={handleUndo}
                onConfirm={handleConfirm}
                onPass={handlePass}
                confirmEnabled={turnActions.confirmEnabled}
                resetEnabled={turnActions.resetEnabled}
                drawEnabled={turnActions.drawEnabled}
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

/**
 * GHOST-SC2 통합 검증용 플래그 — GameRoom이 useGameSync(roomId)를 마운트하고
 * GameClient가 pendingStore를 소비하는 전체 경로가 연결되어 있음을 표시한다.
 *
 * 룰: UR-04 (TURN_START 시 pending 강제 초기화)
 * 검증: G-B-pending-domain.test.ts GHOST-SC2-fix
 */
export const __usesGameSync = true;
