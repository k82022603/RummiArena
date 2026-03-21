package handler

import (
	"testing"

	"github.com/stretchr/testify/assert"
	"go.uber.org/zap"
)

func testLogger() *zap.Logger {
	logger, _ := zap.NewDevelopment()
	return logger
}

func TestHub_RegisterAndUnregister(t *testing.T) {
	hub := NewHub(testLogger())

	conn := &Connection{
		roomID: "room-1",
		userID: "user-1",
		seat:   0,
		send:   make(chan []byte, 10),
	}

	hub.Register(conn)
	assert.Equal(t, 1, hub.RoomConnectionCount("room-1"))

	hub.Unregister(conn)
	assert.Equal(t, 0, hub.RoomConnectionCount("room-1"))
}

func TestHub_MultipleConnectionsInRoom(t *testing.T) {
	hub := NewHub(testLogger())

	conn1 := &Connection{roomID: "room-1", userID: "user-1", seat: 0, send: make(chan []byte, 10)}
	conn2 := &Connection{roomID: "room-1", userID: "user-2", seat: 1, send: make(chan []byte, 10)}
	conn3 := &Connection{roomID: "room-2", userID: "user-3", seat: 0, send: make(chan []byte, 10)}

	hub.Register(conn1)
	hub.Register(conn2)
	hub.Register(conn3)

	assert.Equal(t, 2, hub.RoomConnectionCount("room-1"))
	assert.Equal(t, 1, hub.RoomConnectionCount("room-2"))
	assert.Equal(t, 0, hub.RoomConnectionCount("room-999"))
}

func TestHub_UnregisterOnlyMatchingConnection(t *testing.T) {
	hub := NewHub(testLogger())

	conn1 := &Connection{roomID: "room-1", userID: "user-1", seat: 0, send: make(chan []byte, 10)}
	conn2 := &Connection{roomID: "room-1", userID: "user-1", seat: 0, send: make(chan []byte, 10)}

	hub.Register(conn1)

	// Register conn2 replaces conn1
	hub.Register(conn2)
	assert.Equal(t, 1, hub.RoomConnectionCount("room-1"))

	// Unregister conn1 (old) should not remove conn2 (current)
	hub.Unregister(conn1)
	assert.Equal(t, 1, hub.RoomConnectionCount("room-1"))

	// Unregister conn2 (current) should remove it
	hub.Unregister(conn2)
	assert.Equal(t, 0, hub.RoomConnectionCount("room-1"))
}

func TestHub_BroadcastToRoom(t *testing.T) {
	hub := NewHub(testLogger())

	conn1 := &Connection{roomID: "room-1", userID: "user-1", seat: 0, send: make(chan []byte, 10)}
	conn2 := &Connection{roomID: "room-1", userID: "user-2", seat: 1, send: make(chan []byte, 10)}
	conn3 := &Connection{roomID: "room-2", userID: "user-3", seat: 0, send: make(chan []byte, 10)}

	hub.Register(conn1)
	hub.Register(conn2)
	hub.Register(conn3)

	msg := &WSMessage{Type: S2CPong, Payload: PongPayload{ServerTime: "now"}}
	hub.BroadcastToRoom("room-1", msg)

	assert.Equal(t, 1, len(conn1.send))
	assert.Equal(t, 1, len(conn2.send))
	assert.Equal(t, 0, len(conn3.send)) // different room
}

func TestHub_BroadcastToRoomExcept(t *testing.T) {
	hub := NewHub(testLogger())

	conn1 := &Connection{roomID: "room-1", userID: "user-1", seat: 0, send: make(chan []byte, 10)}
	conn2 := &Connection{roomID: "room-1", userID: "user-2", seat: 1, send: make(chan []byte, 10)}

	hub.Register(conn1)
	hub.Register(conn2)

	msg := &WSMessage{Type: S2CTilePlaced, Payload: TilePlacedPayload{Seat: 0}}
	hub.BroadcastToRoomExcept("room-1", "user-1", msg)

	assert.Equal(t, 0, len(conn1.send)) // excluded
	assert.Equal(t, 1, len(conn2.send))
}

func TestHub_SendToUser(t *testing.T) {
	hub := NewHub(testLogger())

	conn1 := &Connection{roomID: "room-1", userID: "user-1", seat: 0, send: make(chan []byte, 10)}
	conn2 := &Connection{roomID: "room-1", userID: "user-2", seat: 1, send: make(chan []byte, 10)}

	hub.Register(conn1)
	hub.Register(conn2)

	msg := &WSMessage{Type: S2CGameState, Payload: GameStatePayload{GameID: "game-1"}}
	hub.SendToUser("room-1", "user-1", msg)

	assert.Equal(t, 1, len(conn1.send))
	assert.Equal(t, 0, len(conn2.send))
}

func TestHub_CleanupEmptyRoom(t *testing.T) {
	hub := NewHub(testLogger())

	conn := &Connection{roomID: "room-1", userID: "user-1", seat: 0, send: make(chan []byte, 10)}
	hub.Register(conn)
	hub.Unregister(conn)

	hub.mu.RLock()
	_, exists := hub.rooms["room-1"]
	hub.mu.RUnlock()

	assert.False(t, exists, "empty room should be cleaned up")
}

func TestHub_Register_Reconnect(t *testing.T) {
	hub := NewHub(testLogger())

	conn1 := &Connection{roomID: "room-1", userID: "user-1", seat: 0, send: make(chan []byte, 10)}
	conn2 := &Connection{roomID: "room-1", userID: "user-1", seat: 0, send: make(chan []byte, 10)}

	wasReconnect1 := hub.Register(conn1)
	assert.False(t, wasReconnect1, "최초 연결은 재연결이 아니어야 한다")

	wasReconnect2 := hub.Register(conn2)
	assert.True(t, wasReconnect2, "같은 userID로 두 번째 연결은 재연결이어야 한다")

	assert.Equal(t, 1, hub.RoomConnectionCount("room-1"), "재연결 후 연결 수는 1이어야 한다")
}

func TestHub_Register_DifferentUsers_NotReconnect(t *testing.T) {
	hub := NewHub(testLogger())

	conn1 := &Connection{roomID: "room-1", userID: "user-1", seat: 0, send: make(chan []byte, 10)}
	conn2 := &Connection{roomID: "room-1", userID: "user-2", seat: 1, send: make(chan []byte, 10)}

	wasReconnect1 := hub.Register(conn1)
	assert.False(t, wasReconnect1, "최초 연결은 재연결이 아니어야 한다")

	wasReconnect2 := hub.Register(conn2)
	assert.False(t, wasReconnect2, "다른 userID는 재연결이 아니어야 한다")

	assert.Equal(t, 2, hub.RoomConnectionCount("room-1"))
}
