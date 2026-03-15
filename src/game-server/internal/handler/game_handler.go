package handler

import (
	"net/http"
	"strconv"

	"github.com/gin-gonic/gin"
	"github.com/k82022603/RummiArena/game-server/internal/middleware"
	"github.com/k82022603/RummiArena/game-server/internal/service"
)

// GameHandler 게임 액션 및 상태 조회 HTTP 핸들러
type GameHandler struct {
	gameSvc service.GameService
}

// NewGameHandler GameHandler 생성자
func NewGameHandler(gameSvc service.GameService) *GameHandler {
	return &GameHandler{gameSvc: gameSvc}
}

// GetGameState GET /api/games/:id
// ?seat= 쿼리 파라미터로 요청 seat를 받는다 (기본값 0).
func (h *GameHandler) GetGameState(c *gin.Context) {
	gameID := c.Param("id")
	if gameID == "" {
		respondError(c, http.StatusBadRequest, "INVALID_REQUEST", errMsgGameIDRequired)
		return
	}

	// seat: 쿼리 파라미터 or JWT에서 추출 가능하나 MVP에서는 쿼리 사용
	seatStr := c.DefaultQuery("seat", "0")
	seat, err := strconv.Atoi(seatStr)
	if err != nil {
		respondError(c, http.StatusBadRequest, "INVALID_REQUEST", "seat 값이 올바르지 않습니다.")
		return
	}

	view, err := h.gameSvc.GetGameState(gameID, seat)
	if err != nil {
		handleServiceError(c, err)
		return
	}

	c.JSON(http.StatusOK, view)
}

// placeTilesRequest POST /api/games/:id/place 요청 바디
type placeTilesRequest struct {
	Seat          int                        `json:"seat" binding:"min=0,max=3"`
	TableGroups   []service.TilePlacement    `json:"tableGroups" binding:"required"`
	TilesFromRack []string                   `json:"tilesFromRack" binding:"required"`
}

// PlaceTiles POST /api/games/:id/place
func (h *GameHandler) PlaceTiles(c *gin.Context) {
	_, ok := middleware.UserIDFromContext(c)
	if !ok {
		respondError(c, http.StatusUnauthorized, "UNAUTHORIZED", errMsgUnauthorized)
		return
	}

	gameID := c.Param("id")
	if gameID == "" {
		respondError(c, http.StatusBadRequest, "INVALID_REQUEST", errMsgGameIDRequired)
		return
	}

	var req placeTilesRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		respondError(c, http.StatusBadRequest, "INVALID_REQUEST", errMsgInvalidRequest)
		return
	}

	result, err := h.gameSvc.PlaceTiles(gameID, &service.PlaceRequest{
		Seat:          req.Seat,
		TableGroups:   req.TableGroups,
		TilesFromRack: req.TilesFromRack,
	})
	if err != nil {
		handleServiceError(c, err)
		return
	}

	c.JSON(http.StatusOK, result)
}

// confirmTurnRequest POST /api/games/:id/confirm 요청 바디
type confirmTurnRequest struct {
	Seat          int                        `json:"seat" binding:"min=0,max=3"`
	TableGroups   []service.TilePlacement    `json:"tableGroups" binding:"required"`
	TilesFromRack []string                   `json:"tilesFromRack"`
}

// ConfirmTurn POST /api/games/:id/confirm
func (h *GameHandler) ConfirmTurn(c *gin.Context) {
	_, ok := middleware.UserIDFromContext(c)
	if !ok {
		respondError(c, http.StatusUnauthorized, "UNAUTHORIZED", errMsgUnauthorized)
		return
	}

	gameID := c.Param("id")
	if gameID == "" {
		respondError(c, http.StatusBadRequest, "INVALID_REQUEST", errMsgGameIDRequired)
		return
	}

	var req confirmTurnRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		respondError(c, http.StatusBadRequest, "INVALID_REQUEST", errMsgInvalidRequest)
		return
	}

	result, err := h.gameSvc.ConfirmTurn(gameID, &service.ConfirmRequest{
		Seat:          req.Seat,
		TableGroups:   req.TableGroups,
		TilesFromRack: req.TilesFromRack,
	})
	if err != nil {
		if se, ok := service.IsServiceError(err); ok && se.Status == 422 {
			// 유효성 검증 실패: result가 있더라도 422 반환
			c.JSON(http.StatusUnprocessableEntity, gin.H{
				"error": gin.H{
					"code":    se.Code,
					"message": se.Message,
				},
			})
			return
		}
		handleServiceError(c, err)
		return
	}

	c.JSON(http.StatusOK, result)
}

// drawTileRequest POST /api/games/:id/draw 요청 바디
type drawTileRequest struct {
	Seat int `json:"seat" binding:"min=0,max=3"`
}

// DrawTile POST /api/games/:id/draw
func (h *GameHandler) DrawTile(c *gin.Context) {
	_, ok := middleware.UserIDFromContext(c)
	if !ok {
		respondError(c, http.StatusUnauthorized, "UNAUTHORIZED", errMsgUnauthorized)
		return
	}

	gameID := c.Param("id")
	if gameID == "" {
		respondError(c, http.StatusBadRequest, "INVALID_REQUEST", errMsgGameIDRequired)
		return
	}

	var req drawTileRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		respondError(c, http.StatusBadRequest, "INVALID_REQUEST", errMsgInvalidRequest)
		return
	}

	result, err := h.gameSvc.DrawTile(gameID, req.Seat)
	if err != nil {
		handleServiceError(c, err)
		return
	}

	c.JSON(http.StatusOK, result)
}

// resetTurnRequest POST /api/games/:id/reset 요청 바디
type resetTurnRequest struct {
	Seat int `json:"seat" binding:"min=0,max=3"`
}

// ResetTurn POST /api/games/:id/reset
func (h *GameHandler) ResetTurn(c *gin.Context) {
	_, ok := middleware.UserIDFromContext(c)
	if !ok {
		respondError(c, http.StatusUnauthorized, "UNAUTHORIZED", errMsgUnauthorized)
		return
	}

	gameID := c.Param("id")
	if gameID == "" {
		respondError(c, http.StatusBadRequest, "INVALID_REQUEST", errMsgGameIDRequired)
		return
	}

	var req resetTurnRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		respondError(c, http.StatusBadRequest, "INVALID_REQUEST", errMsgInvalidRequest)
		return
	}

	result, err := h.gameSvc.ResetTurn(gameID, req.Seat)
	if err != nil {
		handleServiceError(c, err)
		return
	}

	c.JSON(http.StatusOK, result)
}
