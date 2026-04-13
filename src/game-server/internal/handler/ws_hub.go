package handler

import (
	"sync"

	"go.uber.org/zap"
)

// Hub manages WebSocket connections grouped by room.
// Thread-safe: all methods can be called concurrently.
type Hub struct {
	// rooms maps roomID → (userID → *Connection)
	rooms  map[string]map[string]*Connection
	mu     sync.RWMutex
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
// Returns true if this was a reconnect (an existing connection was evicted).
func (h *Hub) Register(conn *Connection) (wasReconnect bool) {
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
		wasReconnect = true
	}

	room[conn.userID] = conn
	h.logger.Info("ws: registered",
		zap.String("room", conn.roomID),
		zap.String("user", conn.userID),
		zap.Int("seat", conn.seat),
		zap.Bool("reconnect", wasReconnect),
	)
	return wasReconnect
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

// snapshotRoom returns a point-in-time slice of all connections in a room.
// The returned slice is a shallow copy — safe to iterate without holding Hub locks.
// SEC-REV-008: prevents holding RLock while performing external I/O (Redis, network, JSON marshal).
func (h *Hub) snapshotRoom(roomID string) []*Connection {
	h.mu.RLock()
	defer h.mu.RUnlock()

	room, ok := h.rooms[roomID]
	if !ok {
		return nil
	}
	conns := make([]*Connection, 0, len(room))
	for _, conn := range room {
		conns = append(conns, conn)
	}
	return conns
}

// snapshotRoomExcept is like snapshotRoom but excludes a specific user.
func (h *Hub) snapshotRoomExcept(roomID, excludeUserID string) []*Connection {
	h.mu.RLock()
	defer h.mu.RUnlock()

	room, ok := h.rooms[roomID]
	if !ok {
		return nil
	}
	conns := make([]*Connection, 0, len(room))
	for uid, conn := range room {
		if uid != excludeUserID {
			conns = append(conns, conn)
		}
	}
	return conns
}

// BroadcastToRoom sends a message to all connections in a room.
// SEC-REV-008: Snapshot-then-iterate — lock is released before Send() (which performs JSON marshal).
func (h *Hub) BroadcastToRoom(roomID string, msg *WSMessage) {
	for _, conn := range h.snapshotRoom(roomID) {
		conn.Send(msg)
	}
}

// BroadcastToRoomExcept sends a message to all connections in a room except one user.
// SEC-REV-008: Snapshot-then-iterate — lock is released before Send().
func (h *Hub) BroadcastToRoomExcept(roomID, excludeUserID string, msg *WSMessage) {
	for _, conn := range h.snapshotRoomExcept(roomID, excludeUserID) {
		conn.Send(msg)
	}
}

// SendToUser sends a message to a specific user in a room.
// SEC-REV-008: lookup under RLock, Send() executed after RUnlock.
func (h *Hub) SendToUser(roomID, userID string, msg *WSMessage) {
	h.mu.RLock()
	var target *Connection
	if room, ok := h.rooms[roomID]; ok {
		target = room[userID]
	}
	h.mu.RUnlock()

	if target != nil {
		target.Send(msg)
	}
}

// ForEachInRoom calls fn for every connection in the room.
//
// SEC-REV-008: Uses Snapshot-then-iterate. The Hub lock is released BEFORE fn is called,
// so callbacks may safely perform I/O (Redis GET, DB query, JSON marshal) without
// starving Register/Unregister (which need Write Lock).
//
// SEC-REV-009: Each callback invocation is wrapped in a defer-recover. A panic in one
// callback logs the error but does NOT prevent the remaining connections from being processed.
// This prevents a single bad GAME_STATE from blocking 3 other players in a 4-person room.
//
// Callers must not assume callbacks observe the exact same room membership — a Register
// or Unregister concurrent with the iteration will take effect on the next call.
func (h *Hub) ForEachInRoom(roomID string, fn func(conn *Connection)) {
	conns := h.snapshotRoom(roomID)
	for _, conn := range conns {
		h.invokeCallback(roomID, conn, fn)
	}
}

// invokeCallback runs fn(conn) inside a defer-recover guard (SEC-REV-009).
// Panics are logged at Error level and swallowed so iteration continues.
func (h *Hub) invokeCallback(roomID string, conn *Connection, fn func(conn *Connection)) {
	defer func() {
		if r := recover(); r != nil {
			// Do NOT include the panic value verbatim in messages sent to clients —
			// only log locally. Keeps SEC-REV-010 (error message sanitization) clean.
			userID := ""
			if conn != nil {
				userID = conn.userID
			}
			h.logger.Error("ws: panic in ForEachInRoom callback",
				zap.String("room", roomID),
				zap.String("user", userID),
				zap.Any("panic", r),
			)
		}
	}()
	fn(conn)
}

// RoomConnectionCount returns the number of active connections in a room.
func (h *Hub) RoomConnectionCount(roomID string) int {
	h.mu.RLock()
	defer h.mu.RUnlock()

	return len(h.rooms[roomID])
}
