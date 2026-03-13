package handler

import (
	"net/http"

	"github.com/gin-gonic/gin"
	"github.com/k82022603/RummiArena/game-server/internal/middleware"
	"github.com/k82022603/RummiArena/game-server/internal/model"
	"github.com/k82022603/RummiArena/game-server/internal/service"
)

// RoomHandler Room 관련 HTTP 핸들러
type RoomHandler struct {
	roomSvc service.RoomService
}

// NewRoomHandler RoomHandler 생성자
func NewRoomHandler(roomSvc service.RoomService) *RoomHandler {
	return &RoomHandler{roomSvc: roomSvc}
}

// createRoomRequest POST /api/rooms 요청 바디
type createRoomRequest struct {
	Name           string `json:"name"`
	PlayerCount    int    `json:"playerCount" binding:"required,min=2,max=4"`
	TurnTimeoutSec int    `json:"turnTimeoutSec" binding:"required,min=30,max=120"`
}

// CreateRoom POST /api/rooms
func (h *RoomHandler) CreateRoom(c *gin.Context) {
	userID, ok := middleware.UserIDFromContext(c)
	if !ok {
		respondError(c, http.StatusUnauthorized, "UNAUTHORIZED", "인증 정보가 없습니다.")
		return
	}

	var req createRoomRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		respondError(c, http.StatusBadRequest, "INVALID_REQUEST", "요청 형식이 올바르지 않습니다.")
		return
	}

	room, err := h.roomSvc.CreateRoom(&service.CreateRoomRequest{
		Name:           req.Name,
		PlayerCount:    req.PlayerCount,
		TurnTimeoutSec: req.TurnTimeoutSec,
		HostUserID:     userID,
	})
	if err != nil {
		handleServiceError(c, err)
		return
	}

	c.JSON(http.StatusCreated, roomStateToDetail(room))
}

// ListRooms GET /api/rooms
func (h *RoomHandler) ListRooms(c *gin.Context) {
	rooms, err := h.roomSvc.ListRooms()
	if err != nil {
		handleServiceError(c, err)
		return
	}

	details := make([]*model.RoomDetail, 0, len(rooms))
	for _, r := range rooms {
		details = append(details, roomStateToDetail(r))
	}

	c.JSON(http.StatusOK, gin.H{
		"rooms": details,
		"total": len(details),
	})
}

// GetRoom GET /api/rooms/:id
func (h *RoomHandler) GetRoom(c *gin.Context) {
	id := c.Param("id")
	if id == "" {
		respondError(c, http.StatusBadRequest, "INVALID_REQUEST", "방 ID가 없습니다.")
		return
	}

	room, err := h.roomSvc.GetRoom(id)
	if err != nil {
		handleServiceError(c, err)
		return
	}

	c.JSON(http.StatusOK, roomStateToDetail(room))
}

// joinRoomRequest POST /api/rooms/:id/join 요청 바디 (선택)
type joinRoomRequest struct {
	// 추후 비밀번호 지원 등 확장용
}

// JoinRoom POST /api/rooms/:id/join
func (h *RoomHandler) JoinRoom(c *gin.Context) {
	userID, ok := middleware.UserIDFromContext(c)
	if !ok {
		respondError(c, http.StatusUnauthorized, "UNAUTHORIZED", "인증 정보가 없습니다.")
		return
	}

	roomID := c.Param("id")
	if roomID == "" {
		respondError(c, http.StatusBadRequest, "INVALID_REQUEST", "방 ID가 없습니다.")
		return
	}

	if err := h.roomSvc.JoinRoom(roomID, userID); err != nil {
		handleServiceError(c, err)
		return
	}

	room, err := h.roomSvc.GetRoom(roomID)
	if err != nil {
		handleServiceError(c, err)
		return
	}

	c.JSON(http.StatusOK, roomStateToDetail(room))
}

// LeaveRoom POST /api/rooms/:id/leave
func (h *RoomHandler) LeaveRoom(c *gin.Context) {
	userID, ok := middleware.UserIDFromContext(c)
	if !ok {
		respondError(c, http.StatusUnauthorized, "UNAUTHORIZED", "인증 정보가 없습니다.")
		return
	}

	roomID := c.Param("id")
	if roomID == "" {
		respondError(c, http.StatusBadRequest, "INVALID_REQUEST", "방 ID가 없습니다.")
		return
	}

	room, err := h.roomSvc.LeaveRoom(roomID, userID)
	if err != nil {
		handleServiceError(c, err)
		return
	}

	c.JSON(http.StatusOK, roomStateToDetail(room))
}

// StartGame POST /api/rooms/:id/start
func (h *RoomHandler) StartGame(c *gin.Context) {
	userID, ok := middleware.UserIDFromContext(c)
	if !ok {
		respondError(c, http.StatusUnauthorized, "UNAUTHORIZED", "인증 정보가 없습니다.")
		return
	}

	roomID := c.Param("id")
	if roomID == "" {
		respondError(c, http.StatusBadRequest, "INVALID_REQUEST", "방 ID가 없습니다.")
		return
	}

	gameState, err := h.roomSvc.StartGame(roomID, userID)
	if err != nil {
		handleServiceError(c, err)
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"gameId":  gameState.GameID,
		"status":  gameState.Status,
		"message": "게임이 시작되었습니다.",
	})
}

// DeleteRoom DELETE /api/rooms/:id
func (h *RoomHandler) DeleteRoom(c *gin.Context) {
	userID, ok := middleware.UserIDFromContext(c)
	if !ok {
		respondError(c, http.StatusUnauthorized, "UNAUTHORIZED", "인증 정보가 없습니다.")
		return
	}

	roomID := c.Param("id")
	if roomID == "" {
		respondError(c, http.StatusBadRequest, "INVALID_REQUEST", "방 ID가 없습니다.")
		return
	}

	if err := h.roomSvc.DeleteRoom(roomID, userID); err != nil {
		handleServiceError(c, err)
		return
	}

	c.JSON(http.StatusOK, gin.H{"message": "방이 삭제되었습니다."})
}

// --- 헬퍼 함수 ---

// roomStateToDetail RoomState를 API 응답 DTO인 RoomDetail로 변환한다.
func roomStateToDetail(r *model.RoomState) *model.RoomDetail {
	return &model.RoomDetail{
		ID:          r.ID,
		RoomCode:    r.RoomCode,
		Name:        r.Name,
		Status:      r.Status,
		HostUserID:  r.HostID,
		PlayerCount: r.MaxPlayers,
		Settings: model.RoomSettings{
			TurnTimeoutSec:       r.TurnTimeoutSec,
			InitialMeldThreshold: 30,
		},
		Players:   r.Players,
		GameID:    r.GameID,
		CreatedAt: r.CreatedAt,
	}
}

// respondError API 설계 §0.1 공통 에러 응답 포맷으로 에러를 반환한다.
func respondError(c *gin.Context, status int, code, message string) {
	c.JSON(status, gin.H{
		"error": gin.H{
			"code":    code,
			"message": message,
		},
	})
}

// handleServiceError ServiceError를 HTTP 응답으로 변환한다.
func handleServiceError(c *gin.Context, err error) {
	if se, ok := service.IsServiceError(err); ok {
		c.JSON(se.Status, gin.H{
			"error": gin.H{
				"code":    se.Code,
				"message": se.Message,
			},
		})
		return
	}
	// 알 수 없는 에러는 500으로 처리
	c.JSON(http.StatusInternalServerError, gin.H{
		"error": gin.H{
			"code":    "INTERNAL_ERROR",
			"message": "서버 내부 오류가 발생했습니다.",
		},
	})
}
