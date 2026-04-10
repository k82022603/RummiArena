package handler

import (
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"os"
	"strconv"
	"strings"
	"sync"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/golang-jwt/jwt/v5"
	"github.com/gorilla/websocket"
	"github.com/redis/go-redis/v9"
	"go.uber.org/zap"

	"github.com/k82022603/RummiArena/game-server/internal/client"
	"github.com/k82022603/RummiArena/game-server/internal/engine"
	"github.com/k82022603/RummiArena/game-server/internal/model"
	"github.com/k82022603/RummiArena/game-server/internal/repository"
	"github.com/k82022603/RummiArena/game-server/internal/service"
)

// wsWriteBufferSize는 gorilla/websocket 쓰기 버퍼 크기다.
// GAME_OVER 메시지는 4인 게임 최악의 경우 약 1.5 KB이므로
// 기본값(4096) 대신 8192로 설정해 여유를 확보한다.
var upgrader = websocket.Upgrader{
	ReadBufferSize:  4096,
	WriteBufferSize: 8192,
	CheckOrigin: func(r *http.Request) bool {
		origin := r.Header.Get("Origin")
		if origin == "" {
			return true // non-browser client (curl, server-to-server)
		}
		allowed := os.Getenv("CORS_ALLOWED_ORIGINS")
		if allowed == "" {
			return false
		}
		for _, o := range strings.Split(allowed, ",") {
			if strings.TrimSpace(o) == origin {
				return true
			}
		}
		return false
	},
}

const wsSessionTTL = 2 * time.Hour

// gracePeriodDuration 플레이어 연결 끊김 시 기권 전 대기 시간.
const gracePeriodDuration = 60 * time.Second

// turnTimer 진행 중인 단일 턴 타이머를 표현한다.
type turnTimer struct {
	cancel context.CancelFunc
	gameID string
	seat   int
}

// graceTimer 연결 끊김 후 기권 대기 타이머
type graceTimer struct {
	cancel context.CancelFunc
	userID string
	roomID string
	gameID string
	seat   int
}

// wsSessionData Redis에 저장되는 WebSocket 세션 정보.
type wsSessionData struct {
	UserID      string `json:"userId"`
	RoomID      string `json:"roomId"`
	Seat        int    `json:"seat"`
	DisplayName string `json:"displayName"`
	ConnectedAt int64  `json:"connectedAt"`
}

// WSHandler WebSocket 핸들러
type WSHandler struct {
	hub           *Hub
	roomSvc       service.RoomService
	gameSvc       service.GameService
	turnSvc       service.TurnService
	aiClient      client.AIClientInterface // nil이면 AI 기능 비활성화
	eloRepo       repository.EloRepository // nil이면 ELO 업데이트 건너뜀
	redisClient   *redis.Client            // nil이면 Redis Sorted Set 업데이트 건너뜀
	jwtSecret     string
	logger        *zap.Logger
	timers        map[string]*turnTimer  // key: gameID
	timersMu      sync.Mutex
	graceTimers   map[string]*graceTimer // key: "roomID:userID"
	graceTimersMu sync.Mutex
}

// NewWSHandler WSHandler 생성자.
// aiClient는 nil을 허용하며, nil이면 AI 턴 자동 처리가 비활성화된다.
// eloRepo는 nil을 허용하며, nil이면 게임 종료 시 ELO 업데이트가 비활성화된다.
func NewWSHandler(
	hub *Hub,
	roomSvc service.RoomService,
	gameSvc service.GameService,
	turnSvc service.TurnService,
	aiClient client.AIClientInterface,
	jwtSecret string,
	logger *zap.Logger,
) *WSHandler {
	return &WSHandler{
		hub:         hub,
		roomSvc:     roomSvc,
		gameSvc:     gameSvc,
		turnSvc:     turnSvc,
		aiClient:    aiClient,
		jwtSecret:   jwtSecret,
		logger:      logger,
		timers:      make(map[string]*turnTimer),
		graceTimers: make(map[string]*graceTimer),
	}
}

// WithEloRepo EloRepository를 WSHandler에 주입한다 (함수형 옵션 대신 setter 사용).
func (h *WSHandler) WithEloRepo(eloRepo repository.EloRepository) {
	h.eloRepo = eloRepo
}

// WithRedisClient Redis 클라이언트를 WSHandler에 주입한다.
// nil이면 Redis Sorted Set 업데이트가 비활성화된다.
func (h *WSHandler) WithRedisClient(rc *redis.Client) {
	h.redisClient = rc
}

// HandleWS GET /ws?roomId={roomId}
// WebSocket 업그레이드 → 인증 → 메시지 루프
func (h *WSHandler) HandleWS(c *gin.Context) {
	roomID := c.Query("roomId")
	if roomID == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "roomId query parameter is required"})
		return
	}

	ws, err := upgrader.Upgrade(c.Writer, c.Request, nil)
	if err != nil {
		h.logger.Error("ws: upgrade failed", zap.Error(err))
		return
	}

	conn := NewConnection(ws, roomID, h.hub, h.logger)

	// Auth phase: WritePump은 아직 시작하지 않음 → 직접 쓰기
	if !h.authenticate(conn) {
		_ = ws.Close() //nolint:errcheck
		return
	}

	// WritePump 시작 (인증 성공 후)
	go conn.WritePump()

	// AUTH_OK 전송
	conn.Send(&WSMessage{
		Type: S2CAuthOK,
		Payload: AuthOKPayload{
			UserID:      conn.userID,
			Seat:        conn.seat,
			DisplayName: conn.displayName,
		},
	})

	// GAME_STATE 전송 (게임이 진행 중인 경우)
	if conn.gameID != "" {
		h.sendGameState(conn)
		h.restoreTimerIfNeeded(conn.roomID, conn.gameID)
	}

	// Hub 등록
	wasReconnect := h.hub.Register(conn)

	// Grace timer 취소 (재연결 시)
	graceKey := conn.roomID + ":" + conn.userID
	h.graceTimersMu.Lock()
	if gt, ok := h.graceTimers[graceKey]; ok {
		gt.cancel()
		delete(h.graceTimers, graceKey)
	}
	h.graceTimersMu.Unlock()

	// 게임 진행 중이면 플레이어 상태를 ACTIVE로 복원
	if conn.gameID != "" {
		_ = h.gameSvc.SetPlayerStatus(conn.gameID, conn.seat, model.PlayerStatusActive)
	}

	// Redis 세션 저장 (multi-Pod 지원)
	h.saveSessionToRedis(conn)

	if wasReconnect {
		// 재연결 브로드캐스트 (본인 제외)
		h.hub.BroadcastToRoomExcept(conn.roomID, conn.userID, &WSMessage{
			Type: S2CPlayerReconnect,
			Payload: map[string]interface{}{
				"seat":        conn.seat,
				"displayName": conn.displayName,
				"userId":      conn.userID,
			},
		})
	} else {
		// 신규 참가 브로드캐스트
		h.broadcastPlayerJoin(conn)
	}

	// 메시지 루프 (ReadPump은 연결 종료 시 반환)
	conn.ReadPump(h.handleMessage)

	// 연결 종료 처리
	h.handleDisconnect(conn)
}

// ============================================================
// Auth
// ============================================================

// wsClaims JWT 클레임 (middleware 패키지 의존 없이 독립 정의)
type wsClaims struct {
	UserID string `json:"sub"`
	Email  string `json:"email"`
	jwt.RegisteredClaims
}

// authenticate reads the first message (AUTH) within 5 seconds.
// Writes directly to WebSocket (WritePump not yet running).
func (h *WSHandler) authenticate(conn *Connection) bool {
	_ = conn.conn.SetReadDeadline(time.Now().Add(authTimeout))

	_, data, err := conn.conn.ReadMessage()
	if err != nil {
		h.writeErrorDirect(conn.conn, "UNAUTHORIZED", "인증 시간이 초과되었습니다.")
		h.writeCloseDirect(conn.conn, CloseAuthTimeout, "인증 시간 초과")
		return false
	}

	// 타임아웃 해제
	_ = conn.conn.SetReadDeadline(time.Time{})

	var env WSEnvelope
	if err := json.Unmarshal(data, &env); err != nil {
		h.writeErrorDirect(conn.conn, "INVALID_MESSAGE", "메시지 형식이 올바르지 않습니다.")
		h.writeCloseDirect(conn.conn, CloseAuthFail, "인증 실패")
		return false
	}

	if env.Type != C2SAuth {
		h.writeErrorDirect(conn.conn, "UNAUTHORIZED", "첫 메시지는 AUTH여야 합니다.")
		h.writeCloseDirect(conn.conn, CloseAuthFail, "인증 실패")
		return false
	}

	var payload AuthPayload
	if err := json.Unmarshal(env.Payload, &payload); err != nil {
		h.writeErrorDirect(conn.conn, "INVALID_MESSAGE", "AUTH 페이로드 파싱 실패")
		h.writeCloseDirect(conn.conn, CloseAuthFail, "인증 실패")
		return false
	}

	// JWT 검증
	userID, email, err := h.parseJWT(payload.Token)
	if err != nil {
		h.writeErrorDirect(conn.conn, "UNAUTHORIZED", "유효하지 않은 토큰입니다.")
		h.writeCloseDirect(conn.conn, CloseAuthFail, "인증 실패")
		return false
	}

	// 방 조회 + 플레이어 seat 확인
	room, err := h.roomSvc.GetRoom(conn.roomID)
	if err != nil {
		h.writeErrorDirect(conn.conn, "UNAUTHORIZED", "방을 찾을 수 없습니다.")
		h.writeCloseDirect(conn.conn, CloseNoRoom, "방 없음")
		return false
	}

	seat := -1
	displayName := email
	for _, p := range room.Players {
		if p.UserID == userID {
			seat = p.Seat
			if p.DisplayName != "" {
				displayName = p.DisplayName
			}
			break
		}
	}

	if seat < 0 {
		h.writeErrorDirect(conn.conn, "UNAUTHORIZED", "이 방의 참가자가 아닙니다.")
		h.writeCloseDirect(conn.conn, CloseAuthFail, "인증 실패")
		return false
	}

	// Connection identity 설정
	conn.userID = userID
	conn.seat = seat
	conn.displayName = displayName
	conn.authenticated = true
	if room.GameID != nil {
		conn.gameID = *room.GameID
	}

	h.logger.Info("ws: authenticated",
		zap.String("user", userID),
		zap.Int("seat", seat),
		zap.String("room", conn.roomID),
	)
	return true
}

func (h *WSHandler) parseJWT(tokenStr string) (userID, email string, err error) {
	claims := &wsClaims{}
	token, err := jwt.ParseWithClaims(tokenStr, claims, func(t *jwt.Token) (interface{}, error) {
		if _, ok := t.Method.(*jwt.SigningMethodHMAC); !ok {
			return nil, jwt.ErrSignatureInvalid
		}
		return []byte(h.jwtSecret), nil
	})
	if err != nil || !token.Valid {
		return "", "", fmt.Errorf("invalid token")
	}
	return claims.UserID, claims.Email, nil
}

// writeErrorDirect writes an ERROR message directly (without WritePump).
func (h *WSHandler) writeErrorDirect(ws *websocket.Conn, code, message string) {
	msg := &WSMessage{
		Type:      S2CError,
		Payload:   ErrorPayload{Code: code, Message: message},
		Seq:       0,
		Timestamp: time.Now().UTC().Format(time.RFC3339Nano),
	}
	_ = ws.SetWriteDeadline(time.Now().Add(writeWait))
	_ = ws.WriteJSON(msg)
}

// writeCloseDirect writes a WebSocket close frame directly.
func (h *WSHandler) writeCloseDirect(ws *websocket.Conn, code int, reason string) {
	closeMsg := websocket.FormatCloseMessage(code, reason)
	_ = ws.WriteControl(websocket.CloseMessage, closeMsg, time.Now().Add(writeWait))
}

// ============================================================
// Message Router
// ============================================================

func (h *WSHandler) handleMessage(conn *Connection, env *WSEnvelope) {
	if conn.gameID == "" && env.Type != C2SPing && env.Type != C2SChat && env.Type != C2SLeaveGame {
		conn.SendError("GAME_NOT_STARTED", "게임이 아직 시작되지 않았습니다.")
		return
	}

	switch env.Type {
	case C2SPlaceTiles:
		h.handlePlaceTiles(conn, env)
	case C2SConfirmTurn:
		h.handleConfirmTurn(conn, env)
	case C2SDrawTile:
		h.handleDrawTile(conn)
	case C2SResetTurn:
		h.handleResetTurn(conn)
	case C2SPing:
		h.handlePing(conn)
	case C2SChat:
		h.handleChat(conn, env)
	case C2SLeaveGame:
		h.handleLeaveGame(conn)
	default:
		conn.SendError("INVALID_MESSAGE", fmt.Sprintf("알 수 없는 메시지 타입: %s", env.Type))
	}
}

// ============================================================
// Game Action Handlers
// ============================================================

func (h *WSHandler) handlePlaceTiles(conn *Connection, env *WSEnvelope) {
	var payload PlaceTilesPayload
	if err := json.Unmarshal(env.Payload, &payload); err != nil {
		conn.SendError("INVALID_MESSAGE", "PLACE_TILES 페이로드 파싱 실패")
		return
	}

	// WSTableGroup → service.TilePlacement 변환
	tableGroups := wsGroupsToService(payload.TableGroups)

	req := &service.PlaceRequest{
		Seat:          conn.seat,
		TableGroups:   tableGroups,
		TilesFromRack: payload.TilesFromRack,
	}

	result, err := h.gameSvc.PlaceTiles(conn.gameID, req)
	if err != nil {
		if svcErr, ok := service.IsServiceError(err); ok {
			conn.SendError(svcErr.Code, svcErr.Message)
			return
		}
		conn.SendError("INTERNAL_ERROR", "타일 배치 중 오류가 발생했습니다.")
		h.logger.Error("ws: placeTiles error", zap.Error(err))
		return
	}

	// TILE_PLACED 브로드캐스트 (본인 제외)
	h.hub.BroadcastToRoomExcept(conn.roomID, conn.userID, &WSMessage{
		Type: S2CTilePlaced,
		Payload: TilePlacedPayload{
			Seat:               conn.seat,
			TableGroups:        stateTableToWSGroups(result.GameState.Table),
			TilesFromRackCount: len(payload.TilesFromRack),
		},
	})
}

func (h *WSHandler) handleConfirmTurn(conn *Connection, env *WSEnvelope) {
	var payload ConfirmTurnPayload
	if err := json.Unmarshal(env.Payload, &payload); err != nil {
		conn.SendError("INVALID_MESSAGE", "CONFIRM_TURN 페이로드 파싱 실패")
		return
	}

	tableGroups := wsGroupsToService(payload.TableGroups)

	req := &service.ConfirmRequest{
		Seat:               conn.seat,
		TableGroups:        tableGroups,
		TilesFromRack:      payload.TilesFromRack,
		JokerReturnedCodes: payload.JokerReturnedCodes,
	}

	result, err := h.gameSvc.ConfirmTurn(conn.gameID, req)
	if err != nil {
		// 기타 에러 (NOT_FOUND, NOT_YOUR_TURN 등)
		if svcErr, ok := service.IsServiceError(err); ok {
			conn.SendError(svcErr.Code, svcErr.Message)
			return
		}
		conn.SendError("INTERNAL_ERROR", "턴 확정 중 오류가 발생했습니다.")
		h.logger.Error("ws: confirmTurn error", zap.Error(err))
		return
	}

	state := result.GameState

	// 게임 종료
	if result.GameEnded {
		h.broadcastGameOver(conn, state)
		return
	}

	// 규칙 S6.1: 패널티 드로우가 적용된 경우 (검증 실패 → 패널티 3장 + 턴 종료)
	if result.PenaltyDrawCount > 0 {
		h.broadcastTurnEndWithPenalty(conn, state, result.PenaltyDrawCount, result.ErrorCode)
		h.broadcastTurnStart(conn.roomID, state)
		h.startTurnTimer(conn.roomID, conn.gameID, state.CurrentSeat, state.TurnTimeoutSec)
		return
	}

	// TURN_END 브로드캐스트 (정상 배치)
	playerIdx := findPlayerBySeatInState(state.Players, conn.seat)
	tilesPlaced := 0
	if playerIdx >= 0 {
		tilesPlaced = len(payload.TilesFromRack)
	}
	h.broadcastTurnEnd(conn, state, "PLACE_TILES", tilesPlaced)

	// TURN_START 브로드캐스트 (다음 턴) + 타이머 시작
	h.broadcastTurnStart(conn.roomID, state)
	h.startTurnTimer(conn.roomID, conn.gameID, state.CurrentSeat, state.TurnTimeoutSec)
}

func (h *WSHandler) handleDrawTile(conn *Connection) {
	// 드로우 전 상태에서 drawnTile을 알아내기 위해 현재 랙 길이를 기억
	preView, _ := h.gameSvc.GetGameState(conn.gameID, conn.seat)
	preRackLen := 0
	if preView != nil {
		preRackLen = len(preView.MyRack)
	}

	result, err := h.gameSvc.DrawTile(conn.gameID, conn.seat)
	if err != nil {
		if svcErr, ok := service.IsServiceError(err); ok {
			conn.SendError(svcErr.Code, svcErr.Message)
			return
		}
		conn.SendError("INTERNAL_ERROR", "드로우 중 오류가 발생했습니다.")
		h.logger.Error("ws: drawTile error", zap.Error(err))
		return
	}

	state := result.GameState

	// 드로우 파일 소진 → 게임 종료
	if result.GameEnded {
		h.broadcastGameOver(conn, state)
		return
	}

	// 드로우된 타일 식별: 랙의 마지막 원소 (DrawTile이 append)
	playerIdx := findPlayerBySeatInState(state.Players, conn.seat)
	var drawnTile string
	if playerIdx >= 0 {
		rack := state.Players[playerIdx].Rack
		if len(rack) > preRackLen {
			drawnTile = rack[len(rack)-1]
		}
	}

	playerTileCount := 0
	if playerIdx >= 0 {
		playerTileCount = len(state.Players[playerIdx].Rack)
	}

	// TILE_DRAWN: 본인에게는 드로우된 타일 코드 포함
	conn.Send(&WSMessage{
		Type: S2CTileDrawn,
		Payload: TileDrawnPayload{
			Seat:            conn.seat,
			DrawnTile:       &drawnTile,
			DrawPileCount:   len(state.DrawPile),
			PlayerTileCount: playerTileCount,
		},
	})

	// TILE_DRAWN: 다른 플레이어에게는 null
	h.hub.BroadcastToRoomExcept(conn.roomID, conn.userID, &WSMessage{
		Type: S2CTileDrawn,
		Payload: TileDrawnPayload{
			Seat:            conn.seat,
			DrawnTile:       nil,
			DrawPileCount:   len(state.DrawPile),
			PlayerTileCount: playerTileCount,
		},
	})

	// 드로우 파일 소진 알림
	if len(state.DrawPile) == 0 {
		h.hub.BroadcastToRoom(conn.roomID, &WSMessage{
			Type: S2CDrawPileEmpty,
			Payload: DrawPileEmptyPayload{
				Message: "드로우 파일이 소진되었습니다. 배치하거나 패스하세요.",
			},
		})
	}

	// TURN_END + TURN_START + 타이머 시작
	h.broadcastTurnEnd(conn, state, "DRAW_TILE", 0)
	h.broadcastTurnStart(conn.roomID, state)
	h.startTurnTimer(conn.roomID, conn.gameID, state.CurrentSeat, state.TurnTimeoutSec)
}

func (h *WSHandler) handleResetTurn(conn *Connection) {
	_, err := h.gameSvc.ResetTurn(conn.gameID, conn.seat)
	if err != nil {
		if svcErr, ok := service.IsServiceError(err); ok {
			conn.SendError(svcErr.Code, svcErr.Message)
			return
		}
		conn.SendError("INTERNAL_ERROR", "턴 초기화 중 오류가 발생했습니다.")
		return
	}

	// 롤백 후 GAME_STATE를 요청한 플레이어에게만 전송
	h.sendGameState(conn)
}

func (h *WSHandler) handlePing(conn *Connection) {
	conn.Send(&WSMessage{
		Type: S2CPong,
		Payload: PongPayload{
			ServerTime: time.Now().UTC().Format(time.RFC3339Nano),
		},
	})
}

func (h *WSHandler) handleChat(conn *Connection, env *WSEnvelope) {
	var payload ChatPayload
	if err := json.Unmarshal(env.Payload, &payload); err != nil {
		conn.SendError("INVALID_MESSAGE", "CHAT 페이로드 파싱 실패")
		return
	}

	if len(payload.Message) > 200 {
		conn.SendError("INVALID_MESSAGE", "채팅 메시지는 200자 이하여야 합니다.")
		return
	}

	h.hub.BroadcastToRoom(conn.roomID, &WSMessage{
		Type: S2CChatBroadcast,
		Payload: ChatBroadcastPayload{
			Seat:        conn.seat,
			DisplayName: conn.displayName,
			Message:     payload.Message,
			SentAt:      time.Now().UTC().Format(time.RFC3339Nano),
		},
	})
}

func (h *WSHandler) handleLeaveGame(conn *Connection) {
	// 게임 진행 중이면 즉시 기권 처리
	if conn.gameID != "" {
		h.forfeitAndBroadcast(conn.roomID, conn.gameID, conn.seat, conn.userID, conn.displayName, "LEAVE")
	} else {
		// 게임 시작 전 LEAVE
		h.hub.BroadcastToRoomExcept(conn.roomID, conn.userID, &WSMessage{
			Type: S2CPlayerLeave,
			Payload: PlayerLeavePayload{
				Seat:         conn.seat,
				DisplayName:  conn.displayName,
				Reason:       "LEAVE",
				TotalPlayers: h.hub.RoomConnectionCount(conn.roomID) - 1,
			},
		})
	}
	conn.CloseWithReason(CloseNormal, "퇴장")
}

// ============================================================
// Broadcast Helpers
// ============================================================

func (h *WSHandler) sendGameState(conn *Connection) {
	view, err := h.gameSvc.GetGameState(conn.gameID, conn.seat)
	if err != nil {
		conn.SendError("INTERNAL_ERROR", "게임 상태 조회 실패")
		return
	}

	tableGroups := make([]WSTableGroup, len(view.Table))
	for i, t := range view.Table {
		groupType := "run"
		numbers := map[int]bool{}
		for _, code := range t.Tiles {
			parsed, err := engine.Parse(code)
			if err == nil && !parsed.IsJoker {
				numbers[parsed.Number] = true
			}
		}
		if len(numbers) == 1 {
			groupType = "group"
		}
		tableGroups[i] = WSTableGroup{ID: t.ID, Tiles: t.Tiles, Type: groupType}
	}

	players := make([]WSPlayerInfo, len(view.Players))
	for i, p := range view.Players {
		isConnected := p.ConnectionStatus != string(model.PlayerStatusDisconnected) &&
			p.ConnectionStatus != string(model.PlayerStatusForfeited)
		players[i] = WSPlayerInfo{
			Seat:             p.Seat,
			UserID:           p.UserID,
			DisplayName:      p.DisplayName,
			PlayerType:       p.PlayerType,
			TileCount:        p.TileCount,
			HasInitialMeld:   p.HasInitialMeld,
			IsConnected:      isConnected,
			ConnectionStatus: p.ConnectionStatus,
		}
	}

	conn.Send(&WSMessage{
		Type: S2CGameState,
		Payload: GameStatePayload{
			GameID:         view.GameID,
			Status:         view.Status,
			CurrentSeat:    view.CurrentSeat,
			TableGroups:    tableGroups,
			MyRack:         view.MyRack,
			Players:        players,
			DrawPileCount:  view.DrawPileCount,
			TurnTimeoutSec: view.TurnTimeoutSec,
			TurnStartedAt:  time.Unix(view.TurnStartAt, 0).UTC().Format(time.RFC3339),
		},
	})
}

func (h *WSHandler) broadcastPlayerJoin(conn *Connection) {
	h.hub.BroadcastToRoomExcept(conn.roomID, conn.userID, &WSMessage{
		Type: S2CPlayerJoin,
		Payload: PlayerJoinPayload{
			Seat:         conn.seat,
			UserID:       conn.userID,
			DisplayName:  conn.displayName,
			PlayerType:   "HUMAN",
			TotalPlayers: h.hub.RoomConnectionCount(conn.roomID),
			MaxPlayers:   4, // TODO: 방 설정에서 가져오기
		},
	})
}

func (h *WSHandler) broadcastTurnEnd(conn *Connection, state *model.GameStateRedis, action string, tilesPlaced int) {
	playerIdx := findPlayerBySeatInState(state.Players, conn.seat)
	playerTileCount := 0
	hasInitialMeld := false
	if playerIdx >= 0 {
		playerTileCount = len(state.Players[playerIdx].Rack)
		hasInitialMeld = state.Players[playerIdx].HasInitialMeld
	}

	tableGroups := stateTableToWSGroups(state.Table)

	// 각 플레이어에게 개인화된 TURN_END 전송 (자신의 myRack만 포함)
	h.hub.ForEachInRoom(conn.roomID, func(c *Connection) {
		payload := TurnEndPayload{
			Seat:             conn.seat,
			TurnNumber:       state.TurnCount,
			Action:           action,
			TableGroups:      tableGroups,
			TilesPlacedCount: tilesPlaced,
			PlayerTileCount:  playerTileCount,
			HasInitialMeld:   hasInitialMeld,
			DrawPileCount:    len(state.DrawPile),
			NextSeat:         state.CurrentSeat,
			NextTurnNumber:   state.TurnCount + 1,
		}
		// 수신자의 rack 정보를 포함 (자신의 seat에 해당하는 rack만)
		recvIdx := findPlayerBySeatInState(state.Players, c.seat)
		if recvIdx >= 0 {
			rack := make([]string, len(state.Players[recvIdx].Rack))
			copy(rack, state.Players[recvIdx].Rack)
			payload.MyRack = rack
		}
		c.Send(&WSMessage{
			Type:    S2CTurnEnd,
			Payload: payload,
		})
	})
}

// broadcastTurnEndWithPenalty 패널티 드로우 적용 시 TURN_END를 브로드캐스트한다 (Human ConfirmTurn 실패 시).
func (h *WSHandler) broadcastTurnEndWithPenalty(conn *Connection, state *model.GameStateRedis, penaltyCount int, errorCode string) {
	playerIdx := findPlayerBySeatInState(state.Players, conn.seat)
	playerTileCount := 0
	hasInitialMeld := false
	if playerIdx >= 0 {
		playerTileCount = len(state.Players[playerIdx].Rack)
		hasInitialMeld = state.Players[playerIdx].HasInitialMeld
	}

	tableGroups := stateTableToWSGroups(state.Table)

	h.hub.ForEachInRoom(conn.roomID, func(c *Connection) {
		payload := TurnEndPayload{
			Seat:             conn.seat,
			TurnNumber:       state.TurnCount,
			Action:           "PENALTY_DRAW",
			TableGroups:      tableGroups,
			TilesPlacedCount: 0,
			PlayerTileCount:  playerTileCount,
			HasInitialMeld:   hasInitialMeld,
			DrawPileCount:    len(state.DrawPile),
			NextSeat:         state.CurrentSeat,
			NextTurnNumber:   state.TurnCount + 1,
			PenaltyDrawCount: penaltyCount,
		}
		recvIdx := findPlayerBySeatInState(state.Players, c.seat)
		if recvIdx >= 0 {
			rack := make([]string, len(state.Players[recvIdx].Rack))
			copy(rack, state.Players[recvIdx].Rack)
			payload.MyRack = rack
		}
		c.Send(&WSMessage{
			Type:    S2CTurnEnd,
			Payload: payload,
		})
	})
}

func (h *WSHandler) broadcastTurnStart(roomID string, state *model.GameStateRedis) {
	playerIdx := findPlayerBySeatInState(state.Players, state.CurrentSeat)
	playerType := "HUMAN"
	var currentPlayer *model.PlayerState
	if playerIdx >= 0 {
		playerType = state.Players[playerIdx].PlayerType
		currentPlayer = &state.Players[playerIdx]
	}

	h.hub.BroadcastToRoom(roomID, &WSMessage{
		Type: S2CTurnStart,
		Payload: TurnStartPayload{
			Seat:          state.CurrentSeat,
			TurnNumber:    state.TurnCount + 1,
			PlayerType:    playerType,
			TimeoutSec:    state.TurnTimeoutSec,
			TurnStartedAt: time.Unix(state.TurnStartAt, 0).UTC().Format(time.RFC3339),
		},
	})

	// AI 플레이어이면 비동기로 자동 수행
	if h.aiClient != nil && currentPlayer != nil && strings.HasPrefix(playerType, "AI_") {
		go h.handleAITurn(roomID, state.GameID, currentPlayer, state)
	}
}

func (h *WSHandler) broadcastGameOver(conn *Connection, state *model.GameStateRedis) {
	// 게임 종료 시 진행 중인 타이머 취소
	h.cancelTurnTimer(conn.gameID)

	results := make([]WSPlayerResult, len(state.Players))
	for i, p := range state.Players {
		results[i] = WSPlayerResult{
			Seat:           p.SeatOrder,
			PlayerType:     p.PlayerType,
			RemainingTiles: p.Rack,
			IsWinner:       len(p.Rack) == 0,
		}
	}

	winnerSeat := -1
	winnerID := ""
	for _, p := range state.Players {
		if len(p.Rack) == 0 {
			winnerSeat = p.SeatOrder
			winnerID = p.UserID
			break
		}
	}

	endType := "NORMAL"
	if state.IsStalemate {
		endType = "STALEMATE"
	}

	h.hub.BroadcastToRoom(conn.roomID, &WSMessage{
		Type: S2CGameOver,
		Payload: GameOverPayload{
			EndType:    endType,
			WinnerID:   winnerID,
			WinnerSeat: winnerSeat,
			Results:    results,
		},
	})

	// ELO 업데이트 (비동기)
	go h.updateElo(state)

	// Room 상태 FINISHED 처리
	if err := h.roomSvc.FinishRoom(conn.roomID); err != nil {
		h.logger.Warn("ws: FinishRoom failed",
			zap.String("roomID", conn.roomID),
			zap.Error(err),
		)
	}
}

// ============================================================
// AI Turn Orchestrator
// ============================================================

// handleAITurn AI 플레이어의 턴을 비동기로 처리한다.
// ai-adapter에 MoveRequest를 전송하고 응답에 따라 배치 또는 강제 드로우를 수행한다.
func (h *WSHandler) handleAITurn(roomID, gameID string, player *model.PlayerState, state *model.GameStateRedis) {
	// AI 턴에서는 handleAITurn 자체의 context timeout(200s)이 타임아웃을 관리하므로
	// 서버 턴 타이머(120s)를 취소하여 경합 조건을 방지한다.
	// 턴 타이머가 먼저 만료되면 HandleTimeout(강제 드로우+턴 진행)과
	// AI goroutine이 동시에 게임 상태를 변경하려는 race condition이 발생한다.
	h.cancelTurnTimer(gameID)

	const aiTurnTimeout = 240 * time.Second // 전 모델 210s adapter + 30s 버퍼

	ctx, cancel := context.WithTimeout(context.Background(), aiTurnTimeout)
	defer cancel()

	aiModel := playerTypeToModel(player.PlayerType)

	opponents := buildOpponentInfo(state.Players, player.SeatOrder)
	tableGroups := buildTableGroups(state.Table)

	req := &client.MoveRequest{
		GameID:          gameID,
		PlayerID:        player.UserID,
		Model:           aiModel,
		Persona:         strings.ToLower(player.AIPersona),
		Difficulty:      normalizeDifficulty(player.AIDifficulty),
		PsychologyLevel: player.AIPsychLevel,
		MaxRetries:      3,
		TimeoutMs:       210000, // 전 모델 210s 통일 (adapter에서도 최소 210s 보장)
		GameState: client.MoveGameState{
			TableGroups:     tableGroups,
			MyTiles:         player.Rack,
			Opponents:       opponents,
			DrawPileCount:   len(state.DrawPile),
			TurnNumber:      state.TurnCount + 1, // TurnCount는 0-based이므로 ai-adapter의 @Min(1) 제약에 맞춰 +1
			InitialMeldDone: player.HasInitialMeld,
		},
	}

	h.logger.Info("ws: AI turn start",
		zap.String("gameId", gameID),
		zap.String("playerId", player.UserID),
		zap.Int("seat", player.SeatOrder),
		zap.String("model", aiModel),
	)

	resp, err := h.aiClient.GenerateMove(ctx, req)
	if err != nil {
		reason := "AI_ERROR"
		if strings.Contains(err.Error(), "status 429") {
			reason = "AI_RATE_LIMITED"
		} else if strings.Contains(err.Error(), "status 403") {
			reason = "AI_COST_LIMIT"
		} else if strings.Contains(err.Error(), "context deadline") || strings.Contains(err.Error(), "timeout") {
			reason = "AI_TIMEOUT"
		}
		h.logger.Error("ws: AI move failed, forcing draw",
			zap.String("gameId", gameID),
			zap.String("reason", reason),
			zap.Int("seat", player.SeatOrder),
			zap.Error(err),
		)
		h.forceAIDraw(roomID, gameID, player.SeatOrder, reason)
		return
	}

	if resp.Action == "place" && len(resp.TilesFromRack) > 0 {
		h.processAIPlace(roomID, gameID, player.SeatOrder, resp)
	} else if resp.Action == "draw" {
		// AI가 정상적으로 draw를 선택한 경우 (fallback 아님)
		h.processAIDraw(roomID, gameID, player.SeatOrder)
	} else {
		h.forceAIDraw(roomID, gameID, player.SeatOrder, "AI_ERROR")
	}
}

// processAIDraw AI가 자발적으로 드로우를 선택한 경우를 처리한다.
// forceAIDraw와 달리 isFallbackDraw=false 로 기록한다.
func (h *WSHandler) processAIDraw(roomID, gameID string, seat int) {
	result, err := h.gameSvc.DrawTile(gameID, seat)
	if err != nil {
		h.logger.Error("ws: AI draw failed",
			zap.String("gameId", gameID),
			zap.Int("seat", seat),
			zap.Error(err),
		)
		return
	}

	state := result.GameState
	if result.GameEnded {
		h.broadcastGameOverFromState(roomID, state)
		return
	}

	// TILE_DRAWN: AI 드로우는 전원에게 nil 타일 코드로 브로드캐스트
	playerIdx := findPlayerBySeatInState(state.Players, seat)
	playerTileCount := 0
	if playerIdx >= 0 {
		playerTileCount = len(state.Players[playerIdx].Rack)
	}
	h.hub.BroadcastToRoom(roomID, &WSMessage{
		Type: S2CTileDrawn,
		Payload: TileDrawnPayload{
			Seat:            seat,
			DrawnTile:       nil,
			DrawPileCount:   len(state.DrawPile),
			PlayerTileCount: playerTileCount,
		},
	})

	// AI 정상 draw: 강제 드로우 카운터 리셋
	h.resetForceDrawCounter(state, gameID, seat)

	// fallback 정보 없이 TURN_END 전송 (정상 draw)
	h.broadcastTurnEndFromState(roomID, seat, state, "DRAW_TILE", 0)
	h.broadcastTurnStart(roomID, state)
	h.startTurnTimer(roomID, gameID, state.CurrentSeat, state.TurnTimeoutSec)
}

// processAIPlace AI의 배치 응답을 검증하고 턴을 확정한다.
// 검증 실패 시 강제 드로우로 폴백한다.
func (h *WSHandler) processAIPlace(roomID, gameID string, seat int, resp *client.MoveResponse) {
	tableGroups := make([]service.TilePlacement, len(resp.TableGroups))
	for i, g := range resp.TableGroups {
		tableGroups[i] = service.TilePlacement{Tiles: g.Tiles}
	}

	req := &service.ConfirmRequest{
		Seat:          seat,
		TableGroups:   tableGroups,
		TilesFromRack: resp.TilesFromRack,
	}

	result, err := h.gameSvc.ConfirmTurn(gameID, req)
	if err != nil {
		h.logger.Warn("ws: AI place error, falling back to force draw",
			zap.String("gameId", gameID),
			zap.Int("seat", seat),
			zap.Error(err),
		)
		h.forceAIDraw(roomID, gameID, seat, "INVALID_MOVE")
		return
	}

	state := result.GameState
	if result.GameEnded {
		h.broadcastGameOverFromState(roomID, state)
		return
	}

	// 규칙 S6.1: AI 배치 검증 실패 → 패널티 3장 + 턴 종료 (강제 행동으로 카운트)
	if result.PenaltyDrawCount > 0 {
		h.logger.Warn("ws: AI place invalid, penalty draw applied",
			zap.String("gameId", gameID),
			zap.Int("seat", seat),
			zap.String("errorCode", result.ErrorCode),
			zap.Int("penaltyDrawCount", result.PenaltyDrawCount),
		)
		// 규칙 S8.1: 패널티도 강제 행동 → 카운터 증가
		h.incrementForceDrawCounter(state, gameID, roomID, seat)
		h.broadcastTurnEndFromState(roomID, seat, state, "PENALTY_DRAW", 0, &FallbackInfo{
			IsFallbackDraw: true,
			FallbackReason: "INVALID_MOVE",
		})
		h.broadcastTurnStart(roomID, state)
		h.startTurnTimer(roomID, gameID, state.CurrentSeat, state.TurnTimeoutSec)
		return
	}

	// AI 배치 성공: 강제 드로우 카운터 리셋
	h.resetForceDrawCounter(state, gameID, seat)

	h.broadcastTurnEndFromState(roomID, seat, state, "PLACE_TILES", len(resp.TilesFromRack))
	h.broadcastTurnStart(roomID, state)
	h.startTurnTimer(roomID, gameID, state.CurrentSeat, state.TurnTimeoutSec)
}

// forceAIDraw AI 드로우를 강제로 수행한다.
// ai-adapter 호출 실패 또는 배치 검증 실패 시 폴백으로 사용한다.
// reason: "AI_TIMEOUT", "INVALID_MOVE", "AI_ERROR" 중 하나
func (h *WSHandler) forceAIDraw(roomID, gameID string, seat int, reason string) {
	result, err := h.gameSvc.DrawTile(gameID, seat)
	if err != nil {
		h.logger.Error("ws: AI force draw failed",
			zap.String("gameId", gameID),
			zap.Int("seat", seat),
			zap.Error(err),
		)
		return
	}

	state := result.GameState
	if result.GameEnded {
		h.broadcastGameOverFromState(roomID, state)
		return
	}

	// 규칙 S8.1: 강제 드로우 카운터 증가 + 5회 도달 시 AI 비활성화
	if h.incrementForceDrawCounter(state, gameID, roomID, seat) {
		return // forfeit 처리 완료 (incrementForceDrawCounter 내부에서 처리)
	}

	// TILE_DRAWN: AI 드로우는 전원에게 nil 타일 코드로 브로드캐스트
	playerIdx := findPlayerBySeatInState(state.Players, seat)
	playerTileCount := 0
	if playerIdx >= 0 {
		playerTileCount = len(state.Players[playerIdx].Rack)
	}
	h.hub.BroadcastToRoom(roomID, &WSMessage{
		Type: S2CTileDrawn,
		Payload: TileDrawnPayload{
			Seat:            seat,
			DrawnTile:       nil,
			DrawPileCount:   len(state.DrawPile),
			PlayerTileCount: playerTileCount,
		},
	})

	h.broadcastTurnEndFromState(roomID, seat, state, "DRAW_TILE", 0, &FallbackInfo{
		IsFallbackDraw: true,
		FallbackReason: reason,
	})
	h.broadcastTurnStart(roomID, state)
	h.startTurnTimer(roomID, gameID, state.CurrentSeat, state.TurnTimeoutSec)
}

// incrementForceDrawCounter AI 강제 드로우 카운터를 증가시키고, 5회 도달 시 비활성화(기권) 처리한다.
// 비활성화가 발생하면 true를 반환한다 (호출자는 이후 로직 스킵).
func (h *WSHandler) incrementForceDrawCounter(state *model.GameStateRedis, gameID, roomID string, seat int) bool {
	playerIdx := findPlayerBySeatInState(state.Players, seat)
	if playerIdx < 0 {
		return false
	}

	state.Players[playerIdx].ConsecutiveForceDrawCount++
	_ = h.gameSvc.SaveGameState(state)

	if state.Players[playerIdx].ConsecutiveForceDrawCount >= 5 {
		displayName := state.Players[playerIdx].DisplayName
		userID := state.Players[playerIdx].UserID

		h.logger.Warn("ws: AI deactivated — 5 consecutive force draws",
			zap.String("gameId", gameID),
			zap.Int("seat", seat),
			zap.String("displayName", displayName),
		)

		// AI_DEACTIVATED 브로드캐스트
		h.hub.BroadcastToRoom(roomID, &WSMessage{
			Type: S2CAIDeactivated,
			Payload: AIDeactivatedPayload{
				Seat:        seat,
				DisplayName: displayName,
				Reason:      "AI_FORCE_DRAW_LIMIT",
			},
		})

		h.forfeitAndBroadcast(roomID, gameID, seat, userID, displayName, "AI_FORCE_DRAW_LIMIT")
		return true
	}

	return false
}

// resetForceDrawCounter AI 정상 행동(배치 성공 또는 자발적 드로우) 시 강제 드로우 카운터를 리셋한다.
func (h *WSHandler) resetForceDrawCounter(state *model.GameStateRedis, gameID string, seat int) {
	playerIdx := findPlayerBySeatInState(state.Players, seat)
	if playerIdx < 0 || state.Players[playerIdx].ConsecutiveForceDrawCount == 0 {
		return
	}
	state.Players[playerIdx].ConsecutiveForceDrawCount = 0
	_ = h.gameSvc.SaveGameState(state)
}

// ============================================================
// Turn Timer
// ============================================================

// startTurnTimer 현재 턴 플레이어의 타이머를 시작한다.
// 기존 타이머가 있으면 먼저 취소하고 새로 시작한다.
// timeoutSec이 0 이하이면 타이머를 시작하지 않는다.
func (h *WSHandler) startTurnTimer(roomID, gameID string, seat, timeoutSec int) {
	if timeoutSec <= 0 {
		return
	}

	h.timersMu.Lock()
	if existing, ok := h.timers[gameID]; ok {
		existing.cancel()
	}
	ctx, cancel := context.WithCancel(context.Background())
	h.timers[gameID] = &turnTimer{cancel: cancel, gameID: gameID, seat: seat}
	h.timersMu.Unlock()

	h.saveTimerToRedis(gameID, seat, timeoutSec)

	go func() {
		select {
		case <-ctx.Done():
			return
		case <-time.After(time.Duration(timeoutSec) * time.Second):
		}

		h.logger.Info("ws: turn timer expired",
			zap.String("gameId", gameID),
			zap.Int("seat", seat),
		)

		// 규칙 S8.2: DISCONNECTED 플레이어의 부재 턴 판정
		if h.checkAbsentTurnAndForfeit(roomID, gameID, seat) {
			h.timersMu.Lock()
			delete(h.timers, gameID)
			h.timersMu.Unlock()
			h.deleteTimerFromRedis(gameID)
			return // 기권 처리 완료
		}

		result, err := h.turnSvc.HandleTimeout(gameID, seat)
		if err != nil {
			h.logger.Error("ws: HandleTimeout failed",
				zap.String("gameId", gameID),
				zap.Int("seat", seat),
				zap.Error(err),
			)
			return
		}

		h.timersMu.Lock()
		delete(h.timers, gameID)
		h.timersMu.Unlock()
		h.deleteTimerFromRedis(gameID)

		if result.GameState == nil {
			return
		}

		state := result.GameState

		// TILE_DRAWN 브로드캐스트 (타임아웃 강제 드로우)
		playerIdx := findPlayerBySeatInState(state.Players, seat)
		playerTileCount := 0
		if playerIdx >= 0 {
			playerTileCount = len(state.Players[playerIdx].Rack)
		}
		h.hub.BroadcastToRoom(roomID, &WSMessage{
			Type: S2CTileDrawn,
			Payload: TileDrawnPayload{
				Seat:            seat,
				DrawnTile:       nil,
				DrawPileCount:   len(state.DrawPile),
				PlayerTileCount: playerTileCount,
			},
		})

		if state.Status == model.GameStatusFinished {
			h.broadcastGameOverFromState(roomID, state)
			return
		}

		h.broadcastTurnEndFromState(roomID, seat, state, "TIMEOUT", 0)
		h.broadcastTurnStart(roomID, state)
		h.startTurnTimer(roomID, gameID, state.CurrentSeat, state.TurnTimeoutSec)
	}()
}

// checkAbsentTurnAndForfeit 타임아웃 발생 시 DISCONNECTED 플레이어의 부재 턴을 카운트한다.
// 규칙 S8.2: 3턴 연속 부재 시 게임에서 제외(기권)한다.
// 기권이 발생하면 true를 반환한다 (호출자는 HandleTimeout을 스킵).
func (h *WSHandler) checkAbsentTurnAndForfeit(roomID, gameID string, seat int) bool {
	if h.gameSvc == nil {
		return false
	}

	state, err := h.gameSvc.GetRawGameState(gameID)
	if err != nil {
		return false
	}

	playerIdx := findPlayerBySeatInState(state.Players, seat)
	if playerIdx < 0 {
		return false
	}

	// 해당 플레이어가 DISCONNECTED 상태인지 확인
	if state.Players[playerIdx].Status != model.PlayerStatusDisconnected {
		return false
	}

	// DISCONNECTED 상태에서 타임아웃 → 부재 턴 카운터 증가
	state.Players[playerIdx].ConsecutiveAbsentTurns++
	absentCount := state.Players[playerIdx].ConsecutiveAbsentTurns
	_ = h.gameSvc.SaveGameState(state)

	h.logger.Info("ws: disconnected player absent turn",
		zap.String("gameId", gameID),
		zap.Int("seat", seat),
		zap.Int("absentTurns", absentCount),
	)

	if absentCount >= 3 {
		displayName := state.Players[playerIdx].DisplayName
		userID := state.Players[playerIdx].UserID

		h.logger.Warn("ws: player excluded — 3 consecutive absent turns",
			zap.String("gameId", gameID),
			zap.Int("seat", seat),
			zap.String("displayName", displayName),
		)
		h.forfeitAndBroadcast(roomID, gameID, seat, userID, displayName, "ABSENT_3_TURNS")
		return true
	}

	return false
}

// cancelTurnTimer 특정 게임의 턴 타이머를 취소한다.
func (h *WSHandler) cancelTurnTimer(gameID string) {
	h.timersMu.Lock()
	if t, ok := h.timers[gameID]; ok {
		t.cancel()
		delete(h.timers, gameID)
	}
	h.timersMu.Unlock()
	h.deleteTimerFromRedis(gameID)
}

// ============================================================
// Redis Timer Storage (B2)
// ============================================================

func timerKey(gameID string) string {
	return fmt.Sprintf("game:%s:timer", gameID)
}

// saveTimerToRedis Redis에 타이머 만료 시각과 seat을 저장한다.
// 형식: "{seat}:{expiryUnixSeconds}", TTL=timeoutSec
func (h *WSHandler) saveTimerToRedis(gameID string, seat, timeoutSec int) {
	if h.redisClient == nil {
		return
	}
	expiry := time.Now().Unix() + int64(timeoutSec)
	val := fmt.Sprintf("%d:%d", seat, expiry)
	ctx, cancel := context.WithTimeout(context.Background(), 2*time.Second)
	defer cancel()
	if err := h.redisClient.Set(ctx, timerKey(gameID), val, time.Duration(timeoutSec)*time.Second).Err(); err != nil {
		h.logger.Warn("ws: save timer to redis failed",
			zap.String("gameId", gameID),
			zap.Error(err),
		)
	}
}

// deleteTimerFromRedis Redis에서 타이머 키를 삭제한다.
func (h *WSHandler) deleteTimerFromRedis(gameID string) {
	if h.redisClient == nil {
		return
	}
	ctx, cancel := context.WithTimeout(context.Background(), 2*time.Second)
	defer cancel()
	_ = h.redisClient.Del(ctx, timerKey(gameID)).Err()
}

// restoreTimerIfNeeded 서버 재시작 후 Redis에서 타이머를 복구한다.
// 인메모리 타이머가 없고 Redis 키가 존재할 때만 복구를 수행한다.
func (h *WSHandler) restoreTimerIfNeeded(roomID, gameID string) {
	if h.redisClient == nil {
		return
	}

	h.timersMu.Lock()
	_, exists := h.timers[gameID]
	h.timersMu.Unlock()
	if exists {
		return
	}

	ctx, cancel := context.WithTimeout(context.Background(), 2*time.Second)
	defer cancel()

	val, err := h.redisClient.Get(ctx, timerKey(gameID)).Result()
	if err != nil {
		return
	}

	parts := strings.SplitN(val, ":", 2)
	if len(parts) != 2 {
		return
	}
	seat, err1 := strconv.Atoi(parts[0])
	expiryUnix, err2 := strconv.ParseInt(parts[1], 10, 64)
	if err1 != nil || err2 != nil {
		return
	}

	remaining := time.Until(time.Unix(expiryUnix, 0))
	if remaining <= 0 {
		// 재시작 중 타이머 만료 → 즉시 HandleTimeout 실행
		go func() {
			result, handleErr := h.turnSvc.HandleTimeout(gameID, seat)
			h.deleteTimerFromRedis(gameID)
			if handleErr != nil {
				h.logger.Error("ws: restore timer HandleTimeout failed",
					zap.String("gameId", gameID),
					zap.Int("seat", seat),
					zap.Error(handleErr),
				)
				return
			}
			if result.GameState == nil {
				return
			}
			state := result.GameState
			playerIdx := findPlayerBySeatInState(state.Players, seat)
			playerTileCount := 0
			if playerIdx >= 0 {
				playerTileCount = len(state.Players[playerIdx].Rack)
			}
			h.hub.BroadcastToRoom(roomID, &WSMessage{
				Type: S2CTileDrawn,
				Payload: TileDrawnPayload{
					Seat:            seat,
					DrawnTile:       nil,
					DrawPileCount:   len(state.DrawPile),
					PlayerTileCount: playerTileCount,
				},
			})
			if state.Status == model.GameStatusFinished {
				h.broadcastGameOverFromState(roomID, state)
				return
			}
			h.broadcastTurnEndFromState(roomID, seat, state, "TIMEOUT", 0)
			h.broadcastTurnStart(roomID, state)
			h.startTurnTimer(roomID, gameID, state.CurrentSeat, state.TurnTimeoutSec)
		}()
		return
	}

	remainingSec := int(remaining.Seconds()) + 1
	h.logger.Info("ws: restoring turn timer from Redis",
		zap.String("gameId", gameID),
		zap.Int("seat", seat),
		zap.Int("remainingSec", remainingSec),
	)
	h.startTurnTimer(roomID, gameID, seat, remainingSec)
}

// ============================================================
// Redis Session Storage (C1)
// ============================================================

func wsSessionKey(userID, roomID string) string {
	return fmt.Sprintf("ws:session:%s:%s", userID, roomID)
}

// saveSessionToRedis Redis에 WebSocket 세션 정보를 저장한다 (multi-Pod 지원).
func (h *WSHandler) saveSessionToRedis(conn *Connection) {
	if h.redisClient == nil {
		return
	}
	data := wsSessionData{
		UserID:      conn.userID,
		RoomID:      conn.roomID,
		Seat:        conn.seat,
		DisplayName: conn.displayName,
		ConnectedAt: time.Now().Unix(),
	}
	b, err := json.Marshal(data)
	if err != nil {
		return
	}
	ctx, cancel := context.WithTimeout(context.Background(), 2*time.Second)
	defer cancel()
	if err := h.redisClient.Set(ctx, wsSessionKey(conn.userID, conn.roomID), b, wsSessionTTL).Err(); err != nil {
		h.logger.Warn("ws: save session to redis failed",
			zap.String("userID", conn.userID),
			zap.String("roomID", conn.roomID),
			zap.Error(err),
		)
	}
}

// deleteSessionFromRedis Redis에서 WebSocket 세션 키를 삭제한다.
func (h *WSHandler) deleteSessionFromRedis(conn *Connection) {
	if h.redisClient == nil {
		return
	}
	ctx, cancel := context.WithTimeout(context.Background(), 2*time.Second)
	defer cancel()
	_ = h.redisClient.Del(ctx, wsSessionKey(conn.userID, conn.roomID)).Err()
}

// broadcastTurnEndFromState Connection 없이 roomID 기반으로 TURN_END를 브로드캐스트한다.
// AI 턴 처리에서 Connection이 존재하지 않을 때 사용한다.
// fallback은 선택적이며, AI 강제 드로우 시에만 전달한다.
func (h *WSHandler) broadcastTurnEndFromState(roomID string, seat int, state *model.GameStateRedis, action string, tilesPlaced int, fallback ...*FallbackInfo) {
	playerIdx := findPlayerBySeatInState(state.Players, seat)
	playerTileCount := 0
	hasInitialMeld := false
	if playerIdx >= 0 {
		playerTileCount = len(state.Players[playerIdx].Rack)
		hasInitialMeld = state.Players[playerIdx].HasInitialMeld
	}

	tableGroups := stateTableToWSGroups(state.Table)

	var fb *FallbackInfo
	if len(fallback) > 0 {
		fb = fallback[0]
	}

	// 각 플레이어에게 개인화된 TURN_END 전송 (자신의 myRack만 포함)
	h.hub.ForEachInRoom(roomID, func(c *Connection) {
		payload := TurnEndPayload{
			Seat:             seat,
			TurnNumber:       state.TurnCount,
			Action:           action,
			TableGroups:      tableGroups,
			TilesPlacedCount: tilesPlaced,
			PlayerTileCount:  playerTileCount,
			HasInitialMeld:   hasInitialMeld,
			DrawPileCount:    len(state.DrawPile),
			NextSeat:         state.CurrentSeat,
			NextTurnNumber:   state.TurnCount + 1,
		}
		if fb != nil {
			payload.IsFallbackDraw = fb.IsFallbackDraw
			payload.FallbackReason = fb.FallbackReason
		}
		// 수신자의 rack 정보를 포함 (자신의 seat에 해당하는 rack만)
		recvIdx := findPlayerBySeatInState(state.Players, c.seat)
		if recvIdx >= 0 {
			rack := make([]string, len(state.Players[recvIdx].Rack))
			copy(rack, state.Players[recvIdx].Rack)
			payload.MyRack = rack
		}
		c.Send(&WSMessage{
			Type:    S2CTurnEnd,
			Payload: payload,
		})
	})
}

// broadcastGameOverFromState Connection 없이 roomID 기반으로 GAME_OVER를 브로드캐스트한다.
// AI 턴에서 게임이 종료될 때 사용한다.
func (h *WSHandler) broadcastGameOverFromState(roomID string, state *model.GameStateRedis) {
	// 게임 종료 시 진행 중인 타이머 취소
	h.cancelTurnTimer(state.GameID)

	results := make([]WSPlayerResult, len(state.Players))
	for i, p := range state.Players {
		results[i] = WSPlayerResult{
			Seat:           p.SeatOrder,
			PlayerType:     p.PlayerType,
			RemainingTiles: p.Rack,
			IsWinner:       len(p.Rack) == 0,
		}
	}

	winnerSeat := -1
	winnerID := ""
	for _, p := range state.Players {
		if len(p.Rack) == 0 {
			winnerSeat = p.SeatOrder
			winnerID = p.UserID
			break
		}
	}

	endType := "NORMAL"
	if state.IsStalemate {
		endType = "STALEMATE"
	}

	h.hub.BroadcastToRoom(roomID, &WSMessage{
		Type: S2CGameOver,
		Payload: GameOverPayload{
			EndType:    endType,
			WinnerID:   winnerID,
			WinnerSeat: winnerSeat,
			Results:    results,
		},
	})

	// ELO 업데이트 (비동기)
	go h.updateElo(state)

	// Room 상태 FINISHED 처리
	if err := h.roomSvc.FinishRoom(roomID); err != nil {
		h.logger.Warn("ws: FinishRoom failed",
			zap.String("roomID", roomID),
			zap.Error(err),
		)
	}
}

// updateElo 게임 종료 후 ELO 레이팅을 업데이트한다.
// eloRepo가 nil이거나 PRACTICE 모드이면 건너뛴다.
// 순위는 남은 타일 수 기준으로 결정한다 (0장=1위, 이후 타일 적은 순).
func (h *WSHandler) updateElo(state *model.GameStateRedis) {
	if h.eloRepo == nil {
		return
	}

	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()

	// 순위 결정: 남은 타일 수 오름차순 (타일 0장 = 1위)
	type playerRank struct {
		userID     string
		tileCount  int
	}
	ranked := make([]playerRank, 0, len(state.Players))
	for _, p := range state.Players {
		if p.UserID == "" {
			continue // AI 가상 유저 없는 경우 스킵
		}
		ranked = append(ranked, playerRank{userID: p.UserID, tileCount: len(p.Rack)})
	}
	if len(ranked) < 2 {
		return
	}

	// 타일 수 오름차순 정렬 후 rank 부여
	for i := 0; i < len(ranked)-1; i++ {
		for j := i + 1; j < len(ranked); j++ {
			if ranked[i].tileCount > ranked[j].tileCount {
				ranked[i], ranked[j] = ranked[j], ranked[i]
			}
		}
	}

	// 현재 ELO 레이팅과 게임 플레이 수 수집
	currentRatings := make(map[string]int, len(ranked))
	currentGames := make(map[string]int, len(ranked))
	for _, pr := range ranked {
		rec, err := h.eloRepo.GetByUserID(ctx, pr.userID)
		if err != nil {
			currentRatings[pr.userID] = 1000 // 기본값
			currentGames[pr.userID] = 0
		} else {
			currentRatings[pr.userID] = rec.Rating
			currentGames[pr.userID] = rec.GamesPlayed
		}
	}

	// PlayerResult 빌드
	players := make([]engine.PlayerResult, len(ranked))
	for i, pr := range ranked {
		players[i] = engine.PlayerResult{
			UserID:      pr.userID,
			Rank:        i + 1,
			GamesPlayed: currentGames[pr.userID],
		}
	}

	// ELO 계산
	changes := engine.CalcElo(players, currentRatings)
	if len(changes) == 0 {
		return
	}

	now := time.Now().UTC()

	// DB 업데이트: 각 플레이어별 Upsert + History
	for i, ch := range changes {
		// EloRating Upsert
		gamesPlayed := currentGames[ch.UserID] + 1
		winStreak := 0
		wins := 0
		losses := 0

		// 기존 레코드를 가져와 연승/승패 업데이트
		existing, err := h.eloRepo.GetByUserID(ctx, ch.UserID)
		if err == nil {
			wins = existing.Wins
			losses = existing.Losses
			winStreak = existing.WinStreak
		}

		isWinner := players[i].Rank == 1
		if isWinner {
			wins++
			winStreak++
		} else {
			losses++
			winStreak = 0
		}

		bestStreak := winStreak
		peakRating := ch.NewRating
		if err == nil {
			if existing.BestStreak > bestStreak {
				bestStreak = existing.BestStreak
			}
			if existing.PeakRating > peakRating {
				peakRating = existing.PeakRating
			}
		}

		rating := &model.EloRating{
			UserID:      ch.UserID,
			Rating:      ch.NewRating,
			Tier:        ch.NewTier,
			Wins:        wins,
			Losses:      losses,
			GamesPlayed: gamesPlayed,
			WinStreak:   winStreak,
			BestStreak:  bestStreak,
			PeakRating:  peakRating,
			LastGameAt:  &now,
		}

		if upsertErr := h.eloRepo.Upsert(ctx, rating); upsertErr != nil {
			h.logger.Error("ws: elo upsert failed",
				zap.String("userID", ch.UserID),
				zap.Error(upsertErr),
			)
		} else {
			// PostgreSQL Upsert 성공 후 Redis Sorted Set 업데이트
			h.updateEloRedis(ctx, ch)
		}

		// EloHistory 삽입
		history := &model.EloHistory{
			UserID:       ch.UserID,
			GameID:       state.GameID,
			RatingBefore: ch.OldRating,
			RatingAfter:  ch.NewRating,
			RatingDelta:  ch.Delta,
			KFactor:      int(getWSKFactor(ch.OldRating, currentGames[ch.UserID])),
		}

		if histErr := h.eloRepo.AddHistory(ctx, history); histErr != nil {
			h.logger.Error("ws: elo history insert failed",
				zap.String("userID", ch.UserID),
				zap.Error(histErr),
			)
		}

		h.logger.Info("ws: elo updated",
			zap.String("userID", ch.UserID),
			zap.Int("oldRating", ch.OldRating),
			zap.Int("newRating", ch.NewRating),
			zap.Int("delta", ch.Delta),
			zap.String("tier", ch.NewTier),
		)
	}
}

// updateEloRedis Redis Sorted Set에 ELO 랭킹을 업데이트한다.
// redisClient가 nil이면 조용히 건너뛴다.
// ranking:global       → ZADD {rating} {userID}
// ranking:tier:{tier}  → ZADD {rating} {userID}
// 티어 변경 시 이전 티어 Set에서 ZRem으로 제거한다.
func (h *WSHandler) updateEloRedis(ctx context.Context, ch engine.EloChange) {
	if h.redisClient == nil {
		return
	}

	score := float64(ch.NewRating)
	pipe := h.redisClient.Pipeline()

	pipe.ZAdd(ctx, "ranking:global", redis.Z{Score: score, Member: ch.UserID})
	pipe.ZAdd(ctx, fmt.Sprintf("ranking:tier:%s", ch.NewTier), redis.Z{Score: score, Member: ch.UserID})

	if ch.OldTier != ch.NewTier {
		pipe.ZRem(ctx, fmt.Sprintf("ranking:tier:%s", ch.OldTier), ch.UserID)
	}

	if _, err := pipe.Exec(ctx); err != nil {
		h.logger.Warn("ws: redis ranking update failed",
			zap.String("userID", ch.UserID),
			zap.String("oldTier", ch.OldTier),
			zap.String("newTier", ch.NewTier),
			zap.Int("newRating", ch.NewRating),
			zap.Error(err),
		)
		return
	}

	h.logger.Info("ws: redis ranking updated",
		zap.String("userID", ch.UserID),
		zap.String("newTier", ch.NewTier),
		zap.Int("newRating", ch.NewRating),
	)
}

// getWSKFactor K-Factor 결정 래퍼 (ws_handler 내부 사용).
func getWSKFactor(rating, gamesPlayed int) float64 {
	if gamesPlayed < 30 {
		return 40
	}
	if rating >= 2000 {
		return 24
	}
	return 32
}

// normalizeDifficulty 난이도 문자열을 ai-adapter 허용 값으로 정규화한다.
// 허용 값: "beginner" | "intermediate" | "expert"
func normalizeDifficulty(d string) string {
	switch strings.ToLower(d) {
	case "beginner", "easy", "하수":
		return "beginner"
	case "intermediate", "medium", "mid", "중수":
		return "intermediate"
	case "expert", "hard", "고수":
		return "expert"
	default:
		return "beginner"
	}
}

// playerTypeToModel PlayerType 문자열을 ai-adapter model 식별자로 변환한다.
func playerTypeToModel(playerType string) string {
	switch playerType {
	case "AI_OPENAI":
		return "openai"
	case "AI_CLAUDE":
		return "claude"
	case "AI_DEEPSEEK":
		return "deepseek"
	case "AI_LLAMA":
		return "ollama"
	default:
		return "ollama"
	}
}

// buildOpponentInfo 현재 플레이어를 제외한 상대 목록을 빌드한다.
func buildOpponentInfo(players []model.PlayerState, mySeat int) []client.OpponentInfo {
	var opponents []client.OpponentInfo
	for _, p := range players {
		if p.SeatOrder != mySeat {
			opponents = append(opponents, client.OpponentInfo{
				PlayerID:       p.UserID,
				RemainingTiles: len(p.Rack),
			})
		}
	}
	return opponents
}

// buildTableGroups SetOnTable 슬라이스를 client.TileGroup 슬라이스로 변환한다.
func buildTableGroups(table []*model.SetOnTable) []client.TileGroup {
	groups := make([]client.TileGroup, len(table))
	for i, s := range table {
		tiles := make([]string, len(s.Tiles))
		for j, t := range s.Tiles {
			tiles[j] = t.Code
		}
		groups[i] = client.TileGroup{Tiles: tiles}
	}
	return groups
}

func (h *WSHandler) handleDisconnect(conn *Connection) {
	h.deleteSessionFromRedis(conn)

	h.logger.Info("ws: disconnected",
		zap.String("user", conn.userID),
		zap.Int("seat", conn.seat),
		zap.String("room", conn.roomID),
	)

	// 게임 진행 중이 아니면 기존 PLAYER_LEAVE만 브로드캐스트
	if conn.gameID == "" {
		h.hub.BroadcastToRoom(conn.roomID, &WSMessage{
			Type: S2CPlayerLeave,
			Payload: PlayerLeavePayload{
				Seat:         conn.seat,
				DisplayName:  conn.displayName,
				Reason:       "DISCONNECT",
				TotalPlayers: h.hub.RoomConnectionCount(conn.roomID),
			},
		})
		return
	}

	// 게임 진행 중: DISCONNECTED 상태로 전환 + Grace Period 시작
	_ = h.gameSvc.SetPlayerStatus(conn.gameID, conn.seat, model.PlayerStatusDisconnected)

	// PLAYER_DISCONNECTED 브로드캐스트
	h.hub.BroadcastToRoom(conn.roomID, &WSMessage{
		Type: S2CPlayerDisconnected,
		Payload: PlayerDisconnectedPayload{
			Seat:        conn.seat,
			DisplayName: conn.displayName,
			GraceSec:    int(gracePeriodDuration.Seconds()),
		},
	})

	// Grace Timer 시작
	h.startGraceTimer(conn.roomID, conn.gameID, conn.userID, conn.displayName, conn.seat)
}

// ============================================================
// Grace Period
// ============================================================

// startGraceTimer 연결 끊김 후 Grace Period 타이머를 시작한다.
// 60초 내 재연결하면 HandleWS에서 타이머가 취소된다.
func (h *WSHandler) startGraceTimer(roomID, gameID, userID, displayName string, seat int) {
	ctx, cancel := context.WithCancel(context.Background())

	key := roomID + ":" + userID
	h.graceTimersMu.Lock()
	if existing, ok := h.graceTimers[key]; ok {
		existing.cancel()
	}
	h.graceTimers[key] = &graceTimer{
		cancel: cancel,
		userID: userID,
		roomID: roomID,
		gameID: gameID,
		seat:   seat,
	}
	h.graceTimersMu.Unlock()

	go func() {
		select {
		case <-ctx.Done():
			return
		case <-time.After(gracePeriodDuration):
		}

		h.graceTimersMu.Lock()
		delete(h.graceTimers, key)
		h.graceTimersMu.Unlock()

		h.logger.Info("ws: grace period expired, forfeiting player",
			zap.String("gameId", gameID),
			zap.String("userId", userID),
			zap.Int("seat", seat),
		)

		h.forfeitAndBroadcast(roomID, gameID, seat, userID, displayName, "DISCONNECT_TIMEOUT")
	}()
}

// forfeitAndBroadcast 플레이어를 기권 처리하고 결과를 브로드캐스트한다.
func (h *WSHandler) forfeitAndBroadcast(roomID, gameID string, seat int, userID, displayName, reason string) {
	result, err := h.gameSvc.ForfeitPlayer(gameID, seat, reason)
	if err != nil {
		h.logger.Error("ws: forfeit player failed",
			zap.String("gameId", gameID),
			zap.Int("seat", seat),
			zap.Error(err),
		)
		return
	}

	// 사용자-방 매핑 정리
	h.roomSvc.ClearActiveRoomForUser(userID)

	state := result.GameState
	activeCount := 0
	for _, p := range state.Players {
		if p.Status != model.PlayerStatusForfeited {
			activeCount++
		}
	}

	isGameOver := result.GameEnded

	// PLAYER_FORFEITED 브로드캐스트
	h.hub.BroadcastToRoom(roomID, &WSMessage{
		Type: S2CPlayerForfeited,
		Payload: PlayerForfeitedPayload{
			Seat:          seat,
			DisplayName:   displayName,
			Reason:        reason,
			ActivePlayers: activeCount,
			IsGameOver:    isGameOver,
		},
	})

	if isGameOver {
		h.cancelTurnTimer(gameID)

		endType := "FORFEIT"
		winnerSeat := -1
		winnerID := result.WinnerID
		for _, p := range state.Players {
			if p.UserID == winnerID {
				winnerSeat = p.SeatOrder
				break
			}
		}

		results := make([]WSPlayerResult, len(state.Players))
		for i, p := range state.Players {
			results[i] = WSPlayerResult{
				Seat:           p.SeatOrder,
				PlayerType:     p.PlayerType,
				RemainingTiles: p.Rack,
				IsWinner:       p.UserID == winnerID,
			}
		}

		h.hub.BroadcastToRoom(roomID, &WSMessage{
			Type: S2CGameOver,
			Payload: GameOverPayload{
				EndType:    endType,
				WinnerID:   winnerID,
				WinnerSeat: winnerSeat,
				Results:    results,
			},
		})

		go h.updateElo(state)

		if err := h.roomSvc.FinishRoom(roomID); err != nil {
			h.logger.Warn("ws: FinishRoom failed after forfeit",
				zap.String("roomID", roomID),
				zap.Error(err),
			)
		}
		return
	}

	// 게임 계속: 기권자 턴이었으면 다음 턴 시작
	h.broadcastTurnStart(roomID, state)
	h.startTurnTimer(roomID, gameID, state.CurrentSeat, state.TurnTimeoutSec)
}

// ============================================================
// Game Start Notification (BUG-WS-001)
// ============================================================

// NotifyGameStarted 게임 시작 후 WebSocket 클라이언트에게 GAME_STATE와 TURN_START��� 전송한다.
// RoomHandler.StartGame (REST) 이후 호출되어 첫 번째 턴의 TURN_START를 보장한다.
// GameStartNotifier 인터페이스를 구현한다.
func (h *WSHandler) NotifyGameStarted(roomID string, state *model.GameStateRedis) {
	// 1. 각 연결에 gameID를 설정하고 개인화된 GAME_STATE를 전송
	h.hub.ForEachInRoom(roomID, func(c *Connection) {
		c.gameID = state.GameID

		// 해당 플레이어의 1인칭 뷰를 구성하여 전송
		view, err := h.gameSvc.GetGameState(state.GameID, c.seat)
		if err != nil {
			h.logger.Error("ws: NotifyGameStarted GetGameState failed",
				zap.String("roomID", roomID),
				zap.String("userID", c.userID),
				zap.Error(err),
			)
			return
		}

		tableGroups := make([]WSTableGroup, len(view.Table))
		for i, t := range view.Table {
			groupType := "run"
			numbers := map[int]bool{}
			for _, code := range t.Tiles {
				parsed, parseErr := engine.Parse(code)
				if parseErr == nil && !parsed.IsJoker {
					numbers[parsed.Number] = true
				}
			}
			if len(numbers) == 1 {
				groupType = "group"
			}
			tableGroups[i] = WSTableGroup{ID: t.ID, Tiles: t.Tiles, Type: groupType}
		}

		players := make([]WSPlayerInfo, len(view.Players))
		for i, p := range view.Players {
			isConnected := p.ConnectionStatus != string(model.PlayerStatusDisconnected) &&
				p.ConnectionStatus != string(model.PlayerStatusForfeited)
			players[i] = WSPlayerInfo{
				Seat:             p.Seat,
				UserID:           p.UserID,
				DisplayName:      p.DisplayName,
				PlayerType:       p.PlayerType,
				TileCount:        p.TileCount,
				HasInitialMeld:   p.HasInitialMeld,
				IsConnected:      isConnected,
				ConnectionStatus: p.ConnectionStatus,
			}
		}

		c.Send(&WSMessage{
			Type: S2CGameState,
			Payload: GameStatePayload{
				GameID:         view.GameID,
				Status:         view.Status,
				CurrentSeat:    view.CurrentSeat,
				TableGroups:    tableGroups,
				MyRack:         view.MyRack,
				Players:        players,
				DrawPileCount:  view.DrawPileCount,
				TurnTimeoutSec: view.TurnTimeoutSec,
				TurnStartedAt:  time.Unix(view.TurnStartAt, 0).UTC().Format(time.RFC3339),
			},
		})
	})

	// 2. TURN_START 브로드캐스트 (첫 턴)
	h.broadcastTurnStart(roomID, state)

	// 3. 턴 타이머 시작
	h.startTurnTimer(roomID, state.GameID, state.CurrentSeat, state.TurnTimeoutSec)

	h.logger.Info("ws: NotifyGameStarted",
		zap.String("roomID", roomID),
		zap.String("gameID", state.GameID),
		zap.Int("firstSeat", state.CurrentSeat),
	)
}

// ============================================================
// Conversion Helpers
// ============================================================

func wsGroupsToService(groups []WSTableGroup) []service.TilePlacement {
	result := make([]service.TilePlacement, len(groups))
	for i, g := range groups {
		result[i] = service.TilePlacement{ID: g.ID, Tiles: g.Tiles}
	}
	return result
}

func stateTableToWSGroups(table []*model.SetOnTable) []WSTableGroup {
	result := make([]WSTableGroup, len(table))
	for i, s := range table {
		tiles := make([]string, len(s.Tiles))
		for j, t := range s.Tiles {
			tiles[j] = t.Code
		}
		// 세트 타입 자동 판별: 비조커 타일의 숫자가 모두 같으면 group, 아니면 run
		groupType := "run"
		if len(s.Tiles) > 0 {
			numbers := map[int]bool{}
			for _, t := range s.Tiles {
				parsed, err := engine.Parse(t.Code)
				if err == nil && !parsed.IsJoker {
					numbers[parsed.Number] = true
				}
			}
			if len(numbers) == 1 {
				groupType = "group"
			}
		}
		result[i] = WSTableGroup{ID: s.ID, Tiles: tiles, Type: groupType}
	}
	return result
}

func findPlayerBySeatInState(players []model.PlayerState, seat int) int {
	for i, p := range players {
		if p.SeatOrder == seat {
			return i
		}
	}
	return -1
}
