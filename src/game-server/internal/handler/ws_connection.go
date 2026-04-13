package handler

import (
	"encoding/json"
	"fmt"
	"sync"
	"time"

	"github.com/gorilla/websocket"
	"go.uber.org/zap"
)

const (
	writeWait      = 10 * time.Second
	pongWait       = 60 * time.Second
	pingPeriod     = 25 * time.Second // must be less than pongWait
	authTimeout    = 5 * time.Second
	maxMessageSize = 8192
	sendBufferSize = 64
)

// Connection represents a single authenticated WebSocket client.
type Connection struct {
	conn   *websocket.Conn
	send   chan []byte
	hub    *Hub
	logger *zap.Logger

	// Identity (set after AUTH)
	userID        string
	roomID        string
	gameID        string
	seat          int
	displayName   string
	authenticated bool

	// Outgoing sequence counter
	seqMu  sync.Mutex
	seqNum int

	// Ensure Close is called only once
	closeOnce sync.Once

	// sendMu guards sendClosed flag and channel writes. SEC-REV-008:
	// prevents "send on closed channel" panic when Close() races with Send()
	// across goroutines (exposed by the snapshot-then-iterate refactor of Hub).
	sendMu     sync.RWMutex
	sendClosed bool

	// Rate limiter (per-connection, in-memory) -- SEC-RL-003
	rateLimiter *wsRateLimiter
}

// NewConnection creates a new Connection (not yet authenticated).
func NewConnection(ws *websocket.Conn, roomID string, hub *Hub, logger *zap.Logger) *Connection {
	return &Connection{
		conn:        ws,
		send:        make(chan []byte, sendBufferSize),
		hub:         hub,
		logger:      logger,
		roomID:      roomID,
		rateLimiter: newWSRateLimiter(),
	}
}

// Send queues a message for the write pump.
// 내부에서 WSMessage를 값 복사한 뒤 Seq/Timestamp를 설정하므로,
// BroadcastToRoom처럼 동일한 *WSMessage를 여러 커넥션에 전달해도 안전하다.
func (c *Connection) Send(msg *WSMessage) {
	c.seqMu.Lock()
	c.seqNum++
	seq := c.seqNum
	c.seqMu.Unlock()

	ts := msg.Timestamp
	if ts == "" {
		ts = time.Now().UTC().Format(time.RFC3339Nano)
	}

	// 원본 포인터를 수정하지 않고 값 복사본을 만든다.
	out := WSMessage{
		Type:      msg.Type,
		Payload:   msg.Payload,
		Seq:       seq,
		Timestamp: ts,
	}

	data, err := json.Marshal(out)
	if err != nil {
		c.logger.Error("ws: marshal error", zap.Error(err))
		return
	}

	// SEC-REV-008: guard against "send on closed channel" panic.
	// RLock allows multiple concurrent Send() calls; Close() takes Lock.
	c.sendMu.RLock()
	defer c.sendMu.RUnlock()
	if c.sendClosed {
		return
	}

	select {
	case c.send <- data:
	default:
		c.logger.Warn("ws: send buffer full, dropping",
			zap.String("user", c.userID),
			zap.String("type", msg.Type),
		)
	}
}

// SendError is a convenience method for sending an ERROR message.
func (c *Connection) SendError(code, message string) {
	c.Send(&WSMessage{
		Type:    S2CError,
		Payload: ErrorPayload{Code: code, Message: message},
	})
}

// Close closes the send channel, causing WritePump to exit.
// SEC-REV-008: sendMu.Lock() serializes with in-flight Send() calls to
// prevent "send on closed channel" panics. sendClosed flag is set BEFORE
// close() so concurrent Send() callers observe the closed state via RLock.
func (c *Connection) Close() {
	c.closeOnce.Do(func() {
		c.sendMu.Lock()
		c.sendClosed = true
		close(c.send)
		c.sendMu.Unlock()
	})
}

// CloseWithReason sends a WebSocket close frame then closes.
// WriteControl is safe to call concurrently with WritePump.
func (c *Connection) CloseWithReason(code int, reason string) {
	if c.conn != nil {
		closeMsg := websocket.FormatCloseMessage(code, reason)
		_ = c.conn.WriteControl(websocket.CloseMessage, closeMsg, time.Now().Add(writeWait))
	}
	c.Close()
}

// WritePump pumps messages from the send channel to the WebSocket.
// It also sends periodic ping frames to keep the connection alive.
// Exits when the send channel is closed.
func (c *Connection) WritePump() {
	ticker := time.NewTicker(pingPeriod)
	defer func() {
		ticker.Stop()
		_ = c.conn.Close() //nolint:errcheck
	}()

	for {
		select {
		case data, ok := <-c.send:
			if !ok {
				// send channel closed
				_ = c.conn.WriteControl(
					websocket.CloseMessage,
					websocket.FormatCloseMessage(websocket.CloseNormalClosure, ""),
					time.Now().Add(writeWait),
				)
				return
			}
			_ = c.conn.SetWriteDeadline(time.Now().Add(writeWait))
			if err := c.conn.WriteMessage(websocket.TextMessage, data); err != nil {
				c.logger.Debug("ws: write error", zap.String("user", c.userID), zap.Error(err))
				return
			}
		case <-ticker.C:
			_ = c.conn.SetWriteDeadline(time.Now().Add(writeWait))
			if err := c.conn.WriteMessage(websocket.PingMessage, nil); err != nil {
				c.logger.Debug("ws: ping write error", zap.String("user", c.userID), zap.Error(err))
				return
			}
		}
	}
}

// ReadPump reads messages from the WebSocket and dispatches to handler.
// Blocks until the connection is closed or an error occurs.
// On exit: unregisters from Hub and closes the send channel.
func (c *Connection) ReadPump(handler func(*Connection, *WSEnvelope)) {
	defer func() {
		c.hub.Unregister(c)
		c.Close()
	}()

	c.conn.SetReadLimit(maxMessageSize)
	_ = c.conn.SetReadDeadline(time.Now().Add(pongWait))

	// PongHandler: browser responds to server ping with pong automatically.
	// Each pong resets the read deadline, keeping the connection alive
	// even when the client sends no application-level messages.
	c.conn.SetPongHandler(func(string) error {
		_ = c.conn.SetReadDeadline(time.Now().Add(pongWait))
		return nil
	})

	for {
		_, data, err := c.conn.ReadMessage()
		if err != nil {
			if websocket.IsUnexpectedCloseError(err, websocket.CloseGoingAway, websocket.CloseNormalClosure) {
				c.logger.Debug("ws: read error", zap.String("user", c.userID), zap.Error(err))
			}
			return
		}

		// Any application-level message also resets the deadline.
		_ = c.conn.SetReadDeadline(time.Now().Add(pongWait))

		var env WSEnvelope
		if err := json.Unmarshal(data, &env); err != nil {
			c.SendError("INVALID_MESSAGE", "메시지 형식이 올바르지 않습니다.")
			continue
		}

		// ---- Rate Limit 검사 (SEC-RL-003) ----
		if c.rateLimiter != nil {
			result := c.rateLimiter.check(env.Type)
			if !result.Allowed {
				c.Send(&WSMessage{
					Type: S2CError,
					Payload: ErrorPayload{
						Code: "RATE_LIMITED",
						Message: fmt.Sprintf(
							"메시지 전송 빈도 제한을 초과했습니다 (%s). %d초 후에 다시 시도하세요.",
							result.Reason, result.RetryAfterMs/1000,
						),
					},
				})

				if c.logger != nil {
					c.logger.Warn("ws: rate limit exceeded",
						zap.String("user", c.userID),
						zap.String("room", c.roomID),
						zap.String("msgType", env.Type),
						zap.String("reason", result.Reason),
					)
				}

				if result.ShouldClose {
					if c.logger != nil {
						c.logger.Warn("ws: closing connection due to repeated violations",
							zap.String("user", c.userID),
							zap.String("room", c.roomID),
						)
					}
					c.CloseWithReason(CloseRateLimited, "메시지 빈도 제한 초과")
					return
				}
				continue
			}
		}
		// ---- Rate Limit 검사 끝 ----

		handler(c, &env)
	}
}
