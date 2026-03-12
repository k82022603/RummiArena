package handler

import (
	"net/http"

	"github.com/gin-gonic/gin"
	"github.com/gorilla/websocket"
)

var upgrader = websocket.Upgrader{
	CheckOrigin: func(r *http.Request) bool {
		// TODO: origin 검증 로직 구현
		return true
	},
}

// WSHandler WebSocket 핸들러
type WSHandler struct {
	// TODO: gameService, hub 주입
}

// NewWSHandler WSHandler 생성자
func NewWSHandler() *WSHandler {
	return &WSHandler{}
}

// HandleWS GET /ws
// WebSocket 업그레이드 및 연결 처리
// 연결 방식:
//   - 방법 A: ws://host/ws?token={JWT}&roomId={roomId}
//   - 방법 B(권장): ws://host/ws?roomId={roomId} + auth 이벤트 전송
func (h *WSHandler) HandleWS(c *gin.Context) {
	conn, err := upgrader.Upgrade(c.Writer, c.Request, nil)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "websocket upgrade failed"})
		return
	}
	defer conn.Close()

	// TODO: 인증, 룸 참가, 메시지 루프 구현
}
