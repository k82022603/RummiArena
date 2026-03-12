package handler

import (
	"net/http"

	"github.com/gin-gonic/gin"
)

// RoomHandler Room 관련 HTTP 핸들러
type RoomHandler struct {
	// TODO: roomService 주입
}

// NewRoomHandler RoomHandler 생성자
func NewRoomHandler() *RoomHandler {
	return &RoomHandler{}
}

// CreateRoom POST /api/rooms
func (h *RoomHandler) CreateRoom(c *gin.Context) {
	// TODO: 구현
	c.JSON(http.StatusNotImplemented, gin.H{"error": "not implemented"})
}

// ListRooms GET /api/rooms
func (h *RoomHandler) ListRooms(c *gin.Context) {
	// TODO: 구현
	c.JSON(http.StatusNotImplemented, gin.H{"error": "not implemented"})
}

// GetRoom GET /api/rooms/:id
func (h *RoomHandler) GetRoom(c *gin.Context) {
	// TODO: 구현
	c.JSON(http.StatusNotImplemented, gin.H{"error": "not implemented"})
}

// JoinRoom POST /api/rooms/:id/join
func (h *RoomHandler) JoinRoom(c *gin.Context) {
	// TODO: 구현
	c.JSON(http.StatusNotImplemented, gin.H{"error": "not implemented"})
}

// LeaveRoom POST /api/rooms/:id/leave
func (h *RoomHandler) LeaveRoom(c *gin.Context) {
	// TODO: 구현
	c.JSON(http.StatusNotImplemented, gin.H{"error": "not implemented"})
}

// StartGame POST /api/rooms/:id/start
func (h *RoomHandler) StartGame(c *gin.Context) {
	// TODO: 구현
	c.JSON(http.StatusNotImplemented, gin.H{"error": "not implemented"})
}
