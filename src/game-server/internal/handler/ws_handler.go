package handler

import (
	"encoding/json"
	"fmt"
	"net/http"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/golang-jwt/jwt/v5"
	"github.com/gorilla/websocket"
	"go.uber.org/zap"

	"github.com/k82022603/RummiArena/game-server/internal/model"
	"github.com/k82022603/RummiArena/game-server/internal/service"
)

var upgrader = websocket.Upgrader{
	CheckOrigin: func(r *http.Request) bool {
		return true // TODO: 프로덕션에서는 origin 검증
	},
}

// WSHandler WebSocket 핸들러
type WSHandler struct {
	hub       *Hub
	roomSvc   service.RoomService
	gameSvc   service.GameService
	turnSvc   service.TurnService
	jwtSecret string
	logger    *zap.Logger
}

// NewWSHandler WSHandler 생성자
func NewWSHandler(
	hub *Hub,
	roomSvc service.RoomService,
	gameSvc service.GameService,
	turnSvc service.TurnService,
	jwtSecret string,
	logger *zap.Logger,
) *WSHandler {
	return &WSHandler{
		hub:       hub,
		roomSvc:   roomSvc,
		gameSvc:   gameSvc,
		turnSvc:   turnSvc,
		jwtSecret: jwtSecret,
		logger:    logger,
	}
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
		ws.Close()
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
	}

	// Hub 등록 + PLAYER_JOIN 브로드캐스트
	h.hub.Register(conn)
	h.broadcastPlayerJoin(conn)

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
		Seat:          conn.seat,
		TableGroups:   tableGroups,
		TilesFromRack: payload.TilesFromRack,
	}

	result, err := h.gameSvc.ConfirmTurn(conn.gameID, req)
	if err != nil {
		// 검증 실패 → INVALID_MOVE
		if result != nil && !result.Success {
			conn.Send(&WSMessage{
				Type: S2CInvalidMove,
				Payload: InvalidMovePayload{
					Errors: []WSValidationError{{
						Code:    result.ErrorCode,
						Message: err.Error(),
					}},
				},
			})
			return
		}
		// 기타 에러
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

	// TURN_END 브로드캐스트
	playerIdx := findPlayerBySeatInState(state.Players, conn.seat)
	tilesPlaced := 0
	if playerIdx >= 0 {
		tilesPlaced = len(payload.TilesFromRack)
	}
	h.broadcastTurnEnd(conn, state, "PLACE_TILES", tilesPlaced)

	// TURN_START 브로드캐스트 (다음 턴)
	h.broadcastTurnStart(conn.roomID, state)
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

	// TURN_END + TURN_START
	h.broadcastTurnEnd(conn, state, "DRAW_TILE", 0)
	h.broadcastTurnStart(conn.roomID, state)
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
	h.hub.BroadcastToRoomExcept(conn.roomID, conn.userID, &WSMessage{
		Type: S2CPlayerLeave,
		Payload: PlayerLeavePayload{
			Seat:         conn.seat,
			DisplayName:  conn.displayName,
			Reason:       "LEAVE",
			TotalPlayers: h.hub.RoomConnectionCount(conn.roomID) - 1,
		},
	})
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
		tableGroups[i] = WSTableGroup{ID: t.ID, Tiles: t.Tiles}
	}

	players := make([]WSPlayerInfo, len(view.Players))
	for i, p := range view.Players {
		players[i] = WSPlayerInfo{
			Seat:           p.Seat,
			UserID:         p.UserID,
			PlayerType:     p.PlayerType,
			TileCount:      p.TileCount,
			HasInitialMeld: p.HasInitialMeld,
			IsConnected:    true, // TODO: Hub에서 실제 연결 상태 조회
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
			TurnTimeoutSec: 60, // TODO: 설정에서 가져오기
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

	h.hub.BroadcastToRoom(conn.roomID, &WSMessage{
		Type: S2CTurnEnd,
		Payload: TurnEndPayload{
			Seat:             conn.seat,
			Action:           action,
			TableGroups:      stateTableToWSGroups(state.Table),
			TilesPlacedCount: tilesPlaced,
			PlayerTileCount:  playerTileCount,
			HasInitialMeld:   hasInitialMeld,
			DrawPileCount:    len(state.DrawPile),
			NextSeat:         state.CurrentSeat,
		},
	})
}

func (h *WSHandler) broadcastTurnStart(roomID string, state *model.GameStateRedis) {
	playerIdx := findPlayerBySeatInState(state.Players, state.CurrentSeat)
	playerType := "HUMAN"
	if playerIdx >= 0 {
		playerType = state.Players[playerIdx].PlayerType
	}

	h.hub.BroadcastToRoom(roomID, &WSMessage{
		Type: S2CTurnStart,
		Payload: TurnStartPayload{
			Seat:          state.CurrentSeat,
			PlayerType:    playerType,
			TimeoutSec:    60, // TODO: 설정에서 가져오기
			TurnStartedAt: time.Unix(state.TurnStartAt, 0).UTC().Format(time.RFC3339),
		},
	})
}

func (h *WSHandler) broadcastGameOver(conn *Connection, state *model.GameStateRedis) {
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

	h.hub.BroadcastToRoom(conn.roomID, &WSMessage{
		Type: S2CGameOver,
		Payload: GameOverPayload{
			EndType:    "NORMAL",
			WinnerID:   winnerID,
			WinnerSeat: winnerSeat,
			Results:    results,
		},
	})
}

func (h *WSHandler) handleDisconnect(conn *Connection) {
	h.logger.Info("ws: disconnected",
		zap.String("user", conn.userID),
		zap.Int("seat", conn.seat),
		zap.String("room", conn.roomID),
	)

	h.hub.BroadcastToRoom(conn.roomID, &WSMessage{
		Type: S2CPlayerLeave,
		Payload: PlayerLeavePayload{
			Seat:         conn.seat,
			DisplayName:  conn.displayName,
			Reason:       "DISCONNECT",
			TotalPlayers: h.hub.RoomConnectionCount(conn.roomID),
		},
	})
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
		result[i] = WSTableGroup{ID: s.ID, Tiles: tiles}
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
