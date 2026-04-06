"use client";

import { useEffect, useRef, useCallback } from "react";
import { useSession } from "next-auth/react";
import { useWSStore } from "@/store/wsStore";
import { useGameStore } from "@/store/gameStore";
import { useRateLimitStore } from "@/store/rateLimitStore";
import { getGameToken } from "@/lib/authToken";
import type { TileCode } from "@/types/tile";
import type { Player } from "@/types/game";
import type {
  WSEnvelope,
  C2SMessageType,
  AuthOKPayload,
  GameStatePayload,
  TurnStartPayload,
  TurnEndPayload,
  TilePlacedPayload,
  TileDrawnPayload,
  InvalidMovePayload,
  GameOverPayload,
  PlayerJoinPayload,
  PlayerLeavePayload,
  AIThinkingPayload,
  WSErrorPayload,
  ChatBroadcastPayload,
  PlayerDisconnectedPayload,
  PlayerReconnectedPayload,
  PlayerForfeitedPayload,
  DrawPileEmptyPayload,
  GameDeadlockEndPayload,
} from "@/types/websocket";

const WS_URL = process.env.NEXT_PUBLIC_WS_URL ?? "ws://localhost:8080";
const MAX_RECONNECT_ATTEMPTS = 5;
const INITIAL_RECONNECT_DELAY_MS = 3000; // 3s, 6s, 12s, 24s, 48s (2x backoff)

/** WS 발신 스로틀 간격 (ms). Rate limit 감지 시 메시지 간 최소 간격. */
const WS_THROTTLE_INTERVAL_MS = 1000;
/** WS 스로틀 해제까지 대기 시간(ms) — 마지막 rate limit 이벤트 후 */
const WS_THROTTLE_COOLDOWN_MS = 10_000;

/**
 * 서버 에러 코드 -> 한글 메시지 매핑 (errors.go 기반 전체 매핑)
 */
const INVALID_MOVE_MESSAGES: Record<string, string> = {
  // 세트 유효성 관련
  ERR_INVALID_SET: "유효하지 않은 타일 조합입니다. 그룹 또는 런을 확인하세요",
  ERR_SET_SIZE: "세트는 최소 3개 타일이 필요합니다",
  ERR_GROUP_NUMBER: "그룹의 모든 타일은 같은 숫자여야 합니다",
  ERR_GROUP_COLOR_DUP: "같은 색상 타일이 중복됩니다",
  ERR_RUN_COLOR: "런의 모든 타일은 같은 색상이어야 합니다",
  ERR_RUN_SEQUENCE: "런의 숫자가 연속적이지 않습니다",
  ERR_RUN_RANGE: "런의 숫자가 1~13 범위를 벗어났습니다",
  ERR_RUN_DUPLICATE: "런에 같은 숫자의 타일이 중복됩니다",
  ERR_RUN_NO_NUMBER: "런에 숫자 타일이 최소 1장 이상 필요합니다",
  // 턴 규칙 관련
  ERR_NO_RACK_TILE: "랙에서 최소 1개 타일을 사용해야 합니다",
  ERR_TABLE_TILE_MISSING: "테이블에서 타일이 유실되었습니다",
  ERR_JOKER_NOT_USED: "교체한 조커는 같은 턴에 사용해야 합니다",
  // 최초 등록 관련
  ERR_INITIAL_MELD_SCORE: "최초 등록은 30점 이상이어야 합니다",
  ERR_INITIAL_MELD_SOURCE: "최초 등록은 자신의 랙 타일로만 해야 합니다",
  ERR_NO_REARRANGE_PERM: "최초 등록 전에는 테이블 재배치가 불가합니다",
  // 턴 순서 관련
  ERR_NOT_YOUR_TURN: "지금은 내 차례가 아닙니다",
  ERR_DRAW_PILE_EMPTY: "드로우 파일이 비어있습니다",
  ERR_TURN_TIMEOUT: "턴 시간이 초과되었습니다",
  // 타일 파싱 관련
  ERR_INVALID_TILE_CODE: "유효하지 않은 타일 코드입니다",
  // 레거시 호환
  ERR_GROUP_INVALID: "유효하지 않은 그룹입니다",
  ERR_RUN_INVALID: "유효하지 않은 런입니다",
  ERR_TILE_NOT_IN_RACK: "랙에 없는 타일을 배치하려 했습니다",
  ERR_TILE_CONSERVATION: "테이블 타일이 유실되었습니다",
};

function resolveInvalidMoveMessage(code: string, fallback: string): string {
  return INVALID_MOVE_MESSAGES[code] ?? fallback ?? "유효하지 않은 배치입니다";
}

interface UseWebSocketOptions {
  roomId: string;
  enabled?: boolean;
}

export function useWebSocket({ roomId, enabled = true }: UseWebSocketOptions) {
  const { data: session } = useSession();
  const wsRef = useRef<WebSocket | null>(null);
  const reconnectAttempts = useRef(0);
  const reconnectTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isMounted = useRef(true);
  const seqRef = useRef(0);
  // sendRef: handleMessage 콜백 안에서 send를 호출하기 위한 ref
  const sendRef = useRef<(<T>(type: C2SMessageType, payload: T) => void) | null>(null);

  // BUG-WS-001: TURN_START 미전송 방어용 — 마지막 TURN_END의 nextSeat 추적
  // TURN_END 수신 후 TURN_START가 오지 않는 경우를 감지하기 위한 ref
  const pendingTurnStartRef = useRef<{ nextSeat: number; timeoutSec: number } | null>(null);
  const turnStartFallbackTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // WS 발신 스로틀 상태
  const wsThrottledRef = useRef(false);
  const wsLastSendRef = useRef(0);
  const wsThrottleCooldownRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const { setStatus, setLastError, setReconnectNotice } = useWSStore();
  const {
    setMyTiles,
    setGameState,
    setPlayers,
    setRemainingMs,
    setAIThinkingSeat,
    setGameEnded,
    setMySeat,
    setTurnNumber,
    resetPending,
    addDisconnectedPlayer,
    removeDisconnectedPlayer,
    setIsDrawPileEmpty,
    setDeadlockReason,
  } = useGameStore();

  const handleMessage = useCallback(
    (event: MessageEvent) => {
      let msg: WSEnvelope;
      try {
        msg = JSON.parse(event.data as string) as WSEnvelope;
      } catch {
        console.warn("[WS] JSON parse error:", event.data);
        return;
      }

      switch (msg.type) {
        case "AUTH_OK": {
          const payload = msg.payload as AuthOKPayload;
          setMySeat(payload.seat);
          console.info("[WS] AUTH_OK seat=%d user=%s", payload.seat, payload.displayName);
          break;
        }
        case "GAME_STATE": {
          const payload = msg.payload as GameStatePayload;
          setGameState({
            currentSeat: payload.currentSeat,
            tableGroups: payload.tableGroups,
            drawPileCount: payload.drawPileCount,
            turnTimeoutSec: payload.turnTimeoutSec,
            turnStartedAt: payload.turnStartedAt ?? new Date().toISOString(),
          });
          setMyTiles(payload.myRack);
          setPlayers(
            payload.players.map((p): Player => {
              const base = {
                seat: p.seat,
                tileCount: p.tileCount,
                hasInitialMeld: p.hasInitialMeld,
              };
              if (p.playerType === "HUMAN") {
                return {
                  ...base,
                  type: "HUMAN" as const,
                  userId: p.userId ?? "",
                  displayName: p.displayName ?? "",
                  status: p.isConnected ? ("CONNECTED" as const) : ("DISCONNECTED" as const),
                };
              }
              // AI 플레이어: displayName을 사용하되 타입에 맞는 기본값 설정
              return {
                ...base,
                type: p.playerType as Player["type"],
                userId: p.userId ?? "",
                displayName: p.displayName ?? "",
                status: p.isConnected ? ("CONNECTED" as const) : ("DISCONNECTED" as const),
              } as Player;
            })
          );
          // drawPileCount가 0이면 소진 상태 설정
          if (payload.drawPileCount === 0) {
            setIsDrawPileEmpty(true);
          }
          break;
        }
        case "TURN_START": {
          const payload = msg.payload as TurnStartPayload;
          // BUG-WS-001: 정상적으로 TURN_START가 왔으므로 fallback 타이머 해제
          if (turnStartFallbackTimer.current) {
            clearTimeout(turnStartFallbackTimer.current);
            turnStartFallbackTimer.current = null;
          }
          pendingTurnStartRef.current = null;
          resetPending();
          setRemainingMs(payload.timeoutSec * 1000);
          if (payload.turnNumber != null) setTurnNumber(payload.turnNumber);
          setAIThinkingSeat(null);
          useGameStore.setState((state) => ({
            gameState: state.gameState
              ? { ...state.gameState, currentSeat: payload.seat }
              : state.gameState,
          }));
          break;
        }
        case "TURN_END": {
          const payload = msg.payload as TurnEndPayload;
          useGameStore.setState((state) => {
            const isMySeatTurn = payload.seat === state.mySeat;
            return {
              gameState: state.gameState
                ? {
                    ...state.gameState,
                    currentSeat: payload.nextSeat,
                    tableGroups: payload.tableGroups,
                    drawPileCount: payload.drawPileCount,
                  }
                : state.gameState,
              players: state.players.map((p) =>
                p.seat === payload.seat
                  ? { ...p, tileCount: payload.playerTileCount, hasInitialMeld: payload.hasInitialMeld }
                  : p
              ),
              // C-2: myRack이 서버에서 왔으면 서버 진실(source of truth) 사용, 아니면 기존 로직
              ...(payload.myRack
                ? { myTiles: payload.myRack as TileCode[] }
                : (isMySeatTurn && state.pendingMyTiles != null
                  ? { myTiles: state.pendingMyTiles }
                  : {})),
              // hasInitialMeld 업데이트 (내 턴인 경우)
              ...(isMySeatTurn ? { hasInitialMeld: payload.hasInitialMeld } : {}),
            };
          });
          if (payload.nextTurnNumber != null) setTurnNumber(payload.nextTurnNumber);
          setAIThinkingSeat(null);
          // drawPileCount가 0이면 소진 상태 설정
          if (payload.drawPileCount === 0) {
            setIsDrawPileEmpty(true);
          }

          // -----------------------------------------------------------------
          // BUG-WS-001: TURN_START 미전송 방어
          // TURN_END 후 2초 이내에 TURN_START가 오지 않으면
          // 다음 턴 시작 상태를 클라이언트에서 자체 적용
          // -----------------------------------------------------------------
          const turnTimeout = useGameStore.getState().gameState?.turnTimeoutSec ?? 60;
          pendingTurnStartRef.current = { nextSeat: payload.nextSeat, timeoutSec: turnTimeout };
          if (turnStartFallbackTimer.current) clearTimeout(turnStartFallbackTimer.current);
          turnStartFallbackTimer.current = setTimeout(() => {
            // 2초 대기 후에도 TURN_START가 안 왔으면 직접 턴 시작 처리
            if (pendingTurnStartRef.current?.nextSeat === payload.nextSeat) {
              console.warn(
                "[WS] BUG-WS-001: TURN_START not received for seat %d, applying fallback",
                payload.nextSeat
              );
              resetPending();
              setRemainingMs(turnTimeout * 1000);
              setAIThinkingSeat(null);
              pendingTurnStartRef.current = null;
            }
            turnStartFallbackTimer.current = null;
          }, 2000);

          break;
        }
        case "TILE_PLACED": {
          const payload = msg.payload as TilePlacedPayload;
          useGameStore.setState((state) => ({
            gameState: state.gameState
              ? { ...state.gameState, tableGroups: payload.tableGroups }
              : state.gameState,
          }));
          break;
        }
        case "TILE_DRAWN": {
          const payload = msg.payload as TileDrawnPayload;
          // m-6: 두 번의 setState를 하나로 합침
          useGameStore.setState((state) => ({
            myTiles: payload.drawnTile
              ? [...state.myTiles, payload.drawnTile]
              : state.myTiles,
            gameState: state.gameState
              ? { ...state.gameState, drawPileCount: payload.drawPileCount }
              : state.gameState,
          }));
          break;
        }
        case "INVALID_MOVE": {
          const payload = msg.payload as InvalidMovePayload;
          // C-1: 서버 상태도 복원하기 위해 RESET_TURN 전송
          sendRef.current?.("RESET_TURN", {});
          // 로컬 상태 롤백
          resetPending();
          // 에러 메시지 표시
          const errorMsg = payload.errors
            .map((e) => resolveInvalidMoveMessage(e.code, e.message))
            .join(" / ");
          setLastError(errorMsg);
          console.warn("[WS] INVALID_MOVE:", payload.errors);
          break;
        }
        case "GAME_OVER": {
          const payload = msg.payload as GameOverPayload;
          console.info("[WS] GAME_OVER", payload);
          useGameStore.getState().setGameOverResult(payload);
          setGameEnded(true);
          break;
        }
        case "PLAYER_JOIN": {
          const payload = msg.payload as PlayerJoinPayload;
          console.info("[WS] PLAYER_JOIN seat=%d %s", payload.seat, payload.displayName);
          break;
        }
        case "PLAYER_LEAVE": {
          const payload = msg.payload as PlayerLeavePayload;
          console.info("[WS] PLAYER_LEAVE seat=%d %s", payload.seat, payload.displayName);
          break;
        }
        case "PLAYER_RECONNECT": {
          const payload = msg.payload as { seat: number; displayName: string; userId: string };
          setReconnectNotice({ displayName: payload.displayName, seat: payload.seat });
          console.info("[WS] PLAYER_RECONNECT seat=%d %s", payload.seat, payload.displayName);
          break;
        }
        // ---- 퇴장/기권 메시지 (12-player-lifecycle-design.md) ----
        case "PLAYER_DISCONNECTED": {
          const payload = msg.payload as PlayerDisconnectedPayload;
          // C-7: graceSec 기반으로 disconnectedAt 시점 기록
          addDisconnectedPlayer({
            seat: payload.seat,
            displayName: payload.displayName,
            graceSec: payload.graceSec,
            disconnectedAt: Date.now(),
          });
          // 플레이어 상태를 DISCONNECTED로 업데이트
          useGameStore.setState((state) => ({
            players: state.players.map((p) =>
              p.seat === payload.seat
                ? { ...p, status: "DISCONNECTED" as const }
                : p
            ),
          }));
          console.info(
            "[WS] PLAYER_DISCONNECTED seat=%d %s (graceSec: %d)",
            payload.seat, payload.displayName, payload.graceSec
          );
          break;
        }
        case "PLAYER_RECONNECTED": {
          const payload = msg.payload as PlayerReconnectedPayload;
          removeDisconnectedPlayer(payload.seat);
          // 플레이어 상태를 CONNECTED로 복원
          useGameStore.setState((state) => ({
            players: state.players.map((p) =>
              p.seat === payload.seat
                ? { ...p, status: "CONNECTED" as const }
                : p
            ),
          }));
          setReconnectNotice({ displayName: payload.displayName, seat: payload.seat });
          console.info("[WS] PLAYER_RECONNECTED seat=%d %s", payload.seat, payload.displayName);
          break;
        }
        case "PLAYER_FORFEITED": {
          const payload = msg.payload as PlayerForfeitedPayload;
          removeDisconnectedPlayer(payload.seat);
          // 플레이어 상태를 FORFEITED로 업데이트
          useGameStore.setState((state) => ({
            players: state.players.map((p) =>
              p.seat === payload.seat
                ? { ...p, status: "FORFEITED" as const }
                : p
            ),
          }));
          console.info(
            "[WS] PLAYER_FORFEITED seat=%d %s reason=%s activePlayers=%d",
            payload.seat, payload.displayName, payload.reason, payload.activePlayers
          );
          // isGameOver이면 GAME_OVER 메시지가 별도로 오므로 여기서는 처리하지 않음
          break;
        }
        // ---- 교착 처리 메시지 ----
        case "DRAW_PILE_EMPTY": {
          const payload = msg.payload as DrawPileEmptyPayload;
          setIsDrawPileEmpty(true);
          useGameStore.setState((state) => ({
            gameState: state.gameState
              ? { ...state.gameState, drawPileCount: 0 }
              : state.gameState,
          }));
          console.info("[WS] DRAW_PILE_EMPTY message=%s", payload.message);
          break;
        }
        case "GAME_DEADLOCK_END": {
          const payload = msg.payload as GameDeadlockEndPayload;
          setDeadlockReason(payload.reason);
          console.info(
            "[WS] GAME_DEADLOCK_END reason=%s consecutivePass=%d",
            payload.reason, payload.consecutivePassCount
          );
          break;
        }
        case "AI_THINKING": {
          const payload = msg.payload as AIThinkingPayload;
          // BUG-WS-001: TURN_START 없이 AI_THINKING이 먼저 온 경우
          // pendingTurnStart가 해당 seat이면 즉시 fallback 적용 + 타이머 해제
          if (pendingTurnStartRef.current?.nextSeat === payload.seat) {
            console.warn(
              "[WS] BUG-WS-001: AI_THINKING for seat %d received before TURN_START, applying fallback",
              payload.seat
            );
            if (turnStartFallbackTimer.current) {
              clearTimeout(turnStartFallbackTimer.current);
              turnStartFallbackTimer.current = null;
            }
            resetPending();
            const turnTimeout = pendingTurnStartRef.current.timeoutSec;
            setRemainingMs(turnTimeout * 1000);
            pendingTurnStartRef.current = null;
          }
          setAIThinkingSeat(payload.seat);
          break;
        }
        case "CHAT_BROADCAST": {
          const payload = msg.payload as ChatBroadcastPayload;
          console.info("[WS] CHAT seat=%d: %s", payload.seat, payload.message);
          break;
        }
        case "TIMER_UPDATE": {
          // Future: server-side timer sync
          break;
        }
        case "ERROR": {
          const payload = msg.payload as WSErrorPayload;
          // Rate Limit 에러 감지: 연결 끊지 않고 스로틀링만 활성화
          if (payload.code === "RATE_LIMIT" || payload.code === "ERR_RATE_LIMIT") {
            const retryMatch = payload.message?.match(/(\d+)/);
            const sec = retryMatch ? Number(retryMatch[1]) : 5;
            useRateLimitStore
              .getState()
              .setMessage(`요청이 너무 많습니다. ${sec}초 후에 다시 시도해주세요.`);
            // 스로틀 활성화
            useRateLimitStore.getState().setWsThrottled(true);
            wsThrottledRef.current = true;
            if (wsThrottleCooldownRef.current) clearTimeout(wsThrottleCooldownRef.current);
            wsThrottleCooldownRef.current = setTimeout(() => {
              wsThrottledRef.current = false;
              useRateLimitStore.getState().setWsThrottled(false);
            }, WS_THROTTLE_COOLDOWN_MS);
            console.warn("[WS] RATE_LIMIT: throttling outgoing messages for %dms", WS_THROTTLE_COOLDOWN_MS);
            break;
          }
          setLastError(payload.message);
          console.error("[WS] ERROR:", payload.code, payload.message);
          break;
        }
        case "PONG": {
          // Heartbeat response
          break;
        }
        default:
          console.warn("[WS] unknown type:", msg.type);
      }
    },
    [
      setMyTiles,
      setGameState,
      setPlayers,
      setRemainingMs,
      setAIThinkingSeat,
      setGameEnded,
      setLastError,
      setMySeat,
      setTurnNumber,
      resetPending,
      setReconnectNotice,
      addDisconnectedPlayer,
      removeDisconnectedPlayer,
      setIsDrawPileEmpty,
      setDeadlockReason,
    ]
  );

  const connect = useCallback(() => {
    // next-auth session.accessToken 우선, 없으면 localStorage fallback
    const token = getGameToken(session?.accessToken);
    if (!isMounted.current || !token) return;
    if (wsRef.current?.readyState === WebSocket.OPEN) return;

    setStatus("connecting");
    const url = `${WS_URL}/ws?roomId=${roomId}`;

    try {
      const ws = new WebSocket(url);
      wsRef.current = ws;

      ws.onopen = () => {
        if (!isMounted.current) return;
        reconnectAttempts.current = 0;
        setStatus("connected");
        setLastError(null);

        // AUTH 메시지 전송
        seqRef.current = 1;
        const authMsg: WSEnvelope = {
          type: "AUTH",
          payload: { token },
          seq: seqRef.current,
          timestamp: new Date().toISOString(),
        };
        ws.send(JSON.stringify(authMsg));
      };

      ws.onmessage = handleMessage;

      ws.onclose = (e) => {
        if (!isMounted.current) return;
        console.warn("[WS] closed:", e.code, e.reason);

        if (reconnectAttempts.current < MAX_RECONNECT_ATTEMPTS) {
          setStatus("reconnecting");
          reconnectAttempts.current += 1;
          const delay = INITIAL_RECONNECT_DELAY_MS * Math.pow(2, reconnectAttempts.current - 1);
          reconnectTimer.current = setTimeout(() => {
            if (isMounted.current) connect();
          }, delay);
        } else {
          setStatus("disconnected");
          setLastError("서버와의 연결이 끊어졌습니다. 페이지를 새로고침하세요.");
        }
      };

      ws.onerror = () => {
        if (!isMounted.current) return;
        setStatus("error");
        setLastError("WebSocket 연결 오류가 발생했습니다.");
      };
    } catch (err) {
      console.error("[WS] connect error:", err);
      setStatus("error");
    }
  }, [roomId, session, handleMessage, setStatus, setLastError]);

  const send = useCallback(
    <T,>(type: C2SMessageType, payload: T) => {
      if (wsRef.current?.readyState !== WebSocket.OPEN) {
        console.warn("[WS] send called but not connected");
        return;
      }

      // 스로틀 활성 시: 최소 간격 미만이면 무시 (AUTH, PING 등 제어 메시지 제외)
      if (wsThrottledRef.current && type !== "AUTH" && type !== "PING") {
        const now = Date.now();
        if (now - wsLastSendRef.current < WS_THROTTLE_INTERVAL_MS) {
          console.warn("[WS] send throttled: %s (interval %dms)", type, WS_THROTTLE_INTERVAL_MS);
          return;
        }
        wsLastSendRef.current = now;
      }

      seqRef.current += 1;
      const msg: WSEnvelope<T> = {
        type,
        payload,
        seq: seqRef.current,
        timestamp: new Date().toISOString(),
      };
      wsRef.current.send(JSON.stringify(msg));
    },
    []
  );

  // C-1: sendRef를 send에 바인딩 (handleMessage 콜백 내에서 접근용)
  sendRef.current = send;

  const disconnect = useCallback(() => {
    if (reconnectTimer.current) clearTimeout(reconnectTimer.current);
    if (wsThrottleCooldownRef.current) clearTimeout(wsThrottleCooldownRef.current);
    if (turnStartFallbackTimer.current) clearTimeout(turnStartFallbackTimer.current);
    wsThrottledRef.current = false;
    pendingTurnStartRef.current = null;
    turnStartFallbackTimer.current = null;
    wsRef.current?.close(1000, "client disconnect");
    wsRef.current = null;
    setStatus("idle");
  }, [setStatus]);

  useEffect(() => {
    isMounted.current = true;
    // next-auth 세션 토큰 또는 localStorage 토큰이 있을 때만 연결 시작
    if (enabled && getGameToken(session?.accessToken)) connect();
    return () => {
      isMounted.current = false;
      if (reconnectTimer.current) clearTimeout(reconnectTimer.current);
      if (wsThrottleCooldownRef.current) clearTimeout(wsThrottleCooldownRef.current);
      if (turnStartFallbackTimer.current) clearTimeout(turnStartFallbackTimer.current);
      wsThrottledRef.current = false;
      pendingTurnStartRef.current = null;
      turnStartFallbackTimer.current = null;
      wsRef.current?.close(1000, "component unmount");
    };
    // connect를 의존성에서 제외: 세션/roomId 변경 시만 재연결
    // localStorage 토큰은 페이지 로드 시 1회만 읽으므로 별도 추적 불필요
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled, roomId, session?.accessToken]);

  return { send, disconnect };
}
