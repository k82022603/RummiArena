package handler

import (
	"encoding/json"
	"sync"
	"time"

	"github.com/gorilla/websocket"
	"go.uber.org/zap"
)

const (
	writeWait      = 10 * time.Second
	pongWait       = 45 * time.Second
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
}

// NewConnection creates a new Connection (not yet authenticated).
func NewConnection(ws *websocket.Conn, roomID string, hub *Hub, logger *zap.Logger) *Connection {
	return &Connection{
		conn:   ws,
		send:   make(chan []byte, sendBufferSize),
		hub:    hub,
		logger: logger,
		roomID: roomID,
	}
}

// Send queues a message for the write pump.
func (c *Connection) Send(msg *WSMessage) {
	c.seqMu.Lock()
	c.seqNum++
	msg.Seq = c.seqNum
	c.seqMu.Unlock()

	if msg.Timestamp == "" {
		msg.Timestamp = time.Now().UTC().Format(time.RFC3339Nano)
	}

	data, err := json.Marshal(msg)
	if err != nil {
		c.logger.Error("ws: marshal error", zap.Error(err))
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
func (c *Connection) Close() {
	c.closeOnce.Do(func() {
		close(c.send)
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
// Exits when the send channel is closed.
func (c *Connection) WritePump() {
	defer func() { _ = c.conn.Close() }() //nolint:errcheck

	for data := range c.send {
		_ = c.conn.SetWriteDeadline(time.Now().Add(writeWait))
		if err := c.conn.WriteMessage(websocket.TextMessage, data); err != nil {
			c.logger.Debug("ws: write error", zap.String("user", c.userID), zap.Error(err))
			return
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

	for {
		// Reset read deadline on every iteration — any message keeps connection alive
		_ = c.conn.SetReadDeadline(time.Now().Add(pongWait))

		_, data, err := c.conn.ReadMessage()
		if err != nil {
			if websocket.IsUnexpectedCloseError(err, websocket.CloseGoingAway, websocket.CloseNormalClosure) {
				c.logger.Debug("ws: read error", zap.String("user", c.userID), zap.Error(err))
			}
			return
		}

		var env WSEnvelope
		if err := json.Unmarshal(data, &env); err != nil {
			c.SendError("INVALID_MESSAGE", "메시지 형식이 올바르지 않습니다.")
			continue
		}

		handler(c, &env)
	}
}
