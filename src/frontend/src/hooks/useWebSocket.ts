"use client";

import { useEffect, useRef, useCallback } from "react";
import { useSession } from "next-auth/react";
import { useWSStore } from "@/store/wsStore";
import { useGameStore } from "@/store/gameStore";
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
} from "@/types/websocket";

const WS_URL = process.env.NEXT_PUBLIC_WS_URL ?? "ws://localhost:8080";
const MAX_RECONNECT_ATTEMPTS = 5;
const RECONNECT_DELAY_MS = 2000;

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

  const { setStatus, setLastError } = useWSStore();
  const {
    setMyTiles,
    setGameState,
    setPlayers,
    setRemainingMs,
    setAIThinkingSeat,
    setGameEnded,
    setMySeat,
    setTurnNumber,
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
            payload.players.map((p) => ({
              seat: p.seat,
              type: p.playerType as "HUMAN",
              userId: p.userId ?? "",
              displayName: p.displayName,
              status: p.isConnected ? ("CONNECTED" as const) : ("DISCONNECTED" as const),
              tileCount: p.tileCount,
              hasInitialMeld: p.hasInitialMeld,
            }))
          );
          break;
        }
        case "TURN_START": {
          const payload = msg.payload as TurnStartPayload;
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
          useGameStore.setState((state) => ({
            gameState: state.gameState
              ? {
                  ...state.gameState,
                  currentSeat: payload.nextSeat,
                  tableGroups: payload.tableGroups,
                  drawPileCount: payload.drawPileCount,
                }
              : state.gameState,
          }));
          if (payload.nextTurnNumber != null) setTurnNumber(payload.nextTurnNumber);
          setAIThinkingSeat(null);
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
          if (payload.drawnTile) {
            useGameStore.setState((state) => ({
              myTiles: [...state.myTiles, payload.drawnTile!],
            }));
          }
          useGameStore.setState((state) => ({
            gameState: state.gameState
              ? { ...state.gameState, drawPileCount: payload.drawPileCount }
              : state.gameState,
          }));
          break;
        }
        case "INVALID_MOVE": {
          const payload = msg.payload as InvalidMovePayload;
          const errorMsg = payload.errors.map((e) => e.message).join("; ");
          setLastError(errorMsg);
          console.warn("[WS] INVALID_MOVE:", payload.errors);
          break;
        }
        case "GAME_OVER": {
          const payload = msg.payload as GameOverPayload;
          console.info("[WS] GAME_OVER", payload);
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
          console.info("[WS] PLAYER_RECONNECT");
          break;
        }
        case "AI_THINKING": {
          const payload = msg.payload as AIThinkingPayload;
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
    ]
  );

  const connect = useCallback(() => {
    if (!isMounted.current || !session?.accessToken) return;
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
          payload: { token: session.accessToken as string },
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
          const delay = RECONNECT_DELAY_MS * Math.pow(1.5, reconnectAttempts.current - 1);
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

  const disconnect = useCallback(() => {
    if (reconnectTimer.current) clearTimeout(reconnectTimer.current);
    wsRef.current?.close(1000, "client disconnect");
    wsRef.current = null;
    setStatus("idle");
  }, [setStatus]);

  useEffect(() => {
    isMounted.current = true;
    if (enabled && session?.accessToken) connect();
    return () => {
      isMounted.current = false;
      if (reconnectTimer.current) clearTimeout(reconnectTimer.current);
      wsRef.current?.close(1000, "component unmount");
    };
    // connect를 의존성에서 제외: 세션/roomId 변경 시만 재연결
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled, roomId, session?.accessToken]);

  return { send, disconnect };
}
