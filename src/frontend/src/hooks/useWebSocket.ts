"use client";

import { useEffect, useRef, useCallback } from "react";
import { useSession } from "next-auth/react";
import { useWSStore } from "@/store/wsStore";
import { useGameStore } from "@/store/gameStore";
import type { GameState, Player } from "@/types/game";
import type {
  WSMessage,
  WSClientEvent,
  GameStartedPayload,
  TurnStartPayload,
  TurnActionPayload,
  TurnTimeoutPayload,
  GameEndedPayload,
  PlayerJoinedPayload,
  PlayerLeftPayload,
  AIThinkingPayload,
  WSErrorPayload,
  AuthPayload,
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

  const { setStatus, setLastError } = useWSStore();
  const {
    setMyTiles,
    setGameState,
    setPlayers,
    setRemainingMs,
    setAIThinkingSeat,
    setGameEnded,
    gameState,
  } = useGameStore();

  const handleMessage = useCallback(
    (event: MessageEvent) => {
      let msg: WSMessage;
      try {
        msg = JSON.parse(event.data as string) as WSMessage;
      } catch {
        console.warn("[WS] JSON parse error:", event.data);
        return;
      }

      switch (msg.event) {
        case "game:started": {
          const payload = msg.data as GameStartedPayload;
          setMyTiles(payload.myTiles);
          setPlayers(payload.players);
          break;
        }
        case "game:state": {
          const payload = msg.data as { gameState: GameState; players: Player[] };
          if (payload.gameState) setGameState(payload.gameState);
          if (payload.players) setPlayers(payload.players);
          break;
        }
        case "turn:start": {
          const payload = msg.data as TurnStartPayload;
          setRemainingMs(payload.remainingMs);
          setAIThinkingSeat(null);
          break;
        }
        case "turn:action": {
          const payload = msg.data as TurnActionPayload;
          if (payload.drawnTile) {
            // 내 드로우
            useGameStore.getState().setMyTiles([
              ...useGameStore.getState().myTiles,
              payload.drawnTile,
            ]);
          }
          if (payload.tableGroups && gameState) {
            setGameState({ ...gameState, tableGroups: payload.tableGroups });
          }
          setAIThinkingSeat(null);
          break;
        }
        case "turn:timeout": {
          const payload = msg.data as TurnTimeoutPayload;
          if (payload.drawnTile) {
            useGameStore.getState().setMyTiles([
              ...useGameStore.getState().myTiles,
              payload.drawnTile,
            ]);
          }
          setAIThinkingSeat(null);
          break;
        }
        case "game:ended": {
          const payload = msg.data as GameEndedPayload;
          console.info("[WS] game:ended", payload);
          setGameEnded(true);
          break;
        }
        case "player:joined": {
          const payload = msg.data as PlayerJoinedPayload;
          console.info("[WS] player:joined seat", payload.seat);
          break;
        }
        case "player:left": {
          const payload = msg.data as PlayerLeftPayload;
          console.info("[WS] player:left seat", payload.seat);
          break;
        }
        case "player:reconnected": {
          console.info("[WS] player:reconnected");
          break;
        }
        case "ai:thinking": {
          const payload = msg.data as AIThinkingPayload;
          setAIThinkingSeat(payload.seat);
          break;
        }
        case "error": {
          const payload = msg.data as WSErrorPayload;
          setLastError(payload.message);
          console.error("[WS] server error:", payload.code, payload.message);
          break;
        }
        default:
          console.warn("[WS] unknown event:", msg.event);
      }

    },
    [
      gameState,
      setMyTiles,
      setGameState,
      setPlayers,
      setRemainingMs,
      setAIThinkingSeat,
      setGameEnded,
      setLastError,
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

        // 인증 이벤트 전송 (방법 B: auth 이벤트 방식)
        const authMsg: WSMessage<AuthPayload> = {
          event: "auth",
          data: { token: session.accessToken as string },
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
    <T>(event: WSClientEvent, data: T) => {
      if (wsRef.current?.readyState !== WebSocket.OPEN) {
        console.warn("[WS] send called but not connected");
        return;
      }
      const msg: WSMessage<T> = { event, data };
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
