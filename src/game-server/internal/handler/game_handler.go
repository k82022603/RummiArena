package handler

import (
	"net/http"

	"github.com/gin-gonic/gin"
)

// GameHandler 게임 기록 관련 HTTP 핸들러
type GameHandler struct {
	// TODO: gameService 주입
}

// NewGameHandler GameHandler 생성자
func NewGameHandler() *GameHandler {
	return &GameHandler{}
}

// ListGames GET /api/games
func (h *GameHandler) ListGames(c *gin.Context) {
	// TODO: 구현
	c.JSON(http.StatusNotImplemented, gin.H{"error": "not implemented"})
}

// GetGame GET /api/games/:id
func (h *GameHandler) GetGame(c *gin.Context) {
	// TODO: 구현
	c.JSON(http.StatusNotImplemented, gin.H{"error": "not implemented"})
}

// GetGameEvents GET /api/games/:id/events
func (h *GameHandler) GetGameEvents(c *gin.Context) {
	// TODO: 구현
	c.JSON(http.StatusNotImplemented, gin.H{"error": "not implemented"})
}
