package handler

import (
	"sync"

	"go.uber.org/zap"
)

// Hub manages WebSocket connections grouped by room.
// Thread-safe: all methods can be called concurrently.
type Hub struct {
	// rooms maps roomID → (userID → *Connection)
	rooms map[string]map[string]*Connection
	mu    sync.RWMutex
	logger *zap.Logger
}

// NewHub creates a new Hub instance.
func NewHub(logger *zap.Logger) *Hub {
	return &Hub{
		rooms:  make(map[string]map[string]*Connection),
		logger: logger,
	}
}

// Register adds a connection to a room.
// If the same user already has a connection in the room, the old one is evicted.
func (h *Hub) Register(conn *Connection) {
	h.mu.Lock()
	defer h.mu.Unlock()

	room, ok := h.rooms[conn.roomID]
	if !ok {
		room = make(map[string]*Connection)
		h.rooms[conn.roomID] = room
	}

	// Evict duplicate connection
	if existing, exists := room[conn.userID]; exists {
		existing.CloseWithReason(CloseDuplicate, "중복 접속")
	}

	room[conn.userID] = conn
	h.logger.Info("ws: registered",
		zap.String("room", conn.roomID),
		zap.String("user", conn.userID),
		zap.Int("seat", conn.seat),
	)
}

// Unregister removes a connection from a room.
// Only removes if the stored connection matches (prevents race with re-register).
func (h *Hub) Unregister(conn *Connection) {
	h.mu.Lock()
	defer h.mu.Unlock()

	room, ok := h.rooms[conn.roomID]
	if !ok {
		return
	}

	if existing, ok := room[conn.userID]; ok && existing == conn {
		delete(room, conn.userID)
	}

	if len(room) == 0 {
		delete(h.rooms, conn.roomID)
	}

	h.logger.Info("ws: unregistered",
		zap.String("room", conn.roomID),
		zap.String("user", conn.userID),
	)
}

// BroadcastToRoom sends a message to all connections in a room.
func (h *Hub) BroadcastToRoom(roomID string, msg *WSMessage) {
	h.mu.RLock()
	defer h.mu.RUnlock()

	room, ok := h.rooms[roomID]
	if !ok {
		return
	}
	for _, conn := range room {
		conn.Send(msg)
	}
}

// BroadcastToRoomExcept sends a message to all connections in a room except one user.
func (h *Hub) BroadcastToRoomExcept(roomID, excludeUserID string, msg *WSMessage) {
	h.mu.RLock()
	defer h.mu.RUnlock()

	room, ok := h.rooms[roomID]
	if !ok {
		return
	}
	for uid, conn := range room {
		if uid != excludeUserID {
			conn.Send(msg)
		}
	}
}

// SendToUser sends a message to a specific user in a room.
func (h *Hub) SendToUser(roomID, userID string, msg *WSMessage) {
	h.mu.RLock()
	defer h.mu.RUnlock()

	room, ok := h.rooms[roomID]
	if !ok {
		return
	}
	if conn, ok := room[userID]; ok {
		conn.Send(msg)
	}
}

// RoomConnectionCount returns the number of active connections in a room.
func (h *Hub) RoomConnectionCount(roomID string) int {
	h.mu.RLock()
	defer h.mu.RUnlock()

	return len(h.rooms[roomID])
}
