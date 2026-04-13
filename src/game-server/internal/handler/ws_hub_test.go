package handler

import (
	"sync"
	"testing"
	"time"

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

// ============================================================
// SEC-REV-008 / SEC-REV-009 — Snapshot-then-iterate + recover
// ============================================================

// TestHub_ForEachInRoom_ReleasesLockBeforeCallback verifies that SEC-REV-008
// is fixed: the Hub's lock must be released BEFORE the callback runs, so that
// the callback can call back into the Hub (e.g., Register/Unregister, which
// need the Write Lock) without deadlocking.
//
// Previously, ForEachInRoom held the RLock for the entire callback loop, which
// meant a callback invoking any Write-Lock method would deadlock. After the fix,
// the snapshot is taken under RLock and the lock is released before iterating.
func TestHub_ForEachInRoom_ReleasesLockBeforeCallback(t *testing.T) {
	hub := NewHub(testLogger())

	conn1 := &Connection{roomID: "room-1", userID: "user-1", seat: 0, send: make(chan []byte, 10)}
	conn2 := &Connection{roomID: "room-1", userID: "user-2", seat: 1, send: make(chan []byte, 10)}
	hub.Register(conn1)
	hub.Register(conn2)

	// Callback attempts to acquire the Write Lock by calling Unregister.
	// Under the old implementation this would deadlock (RLock held while
	// Unregister tries to Lock). The fix makes it safe.
	done := make(chan struct{})
	go func() {
		defer close(done)
		hub.ForEachInRoom("room-1", func(c *Connection) {
			if c.userID == "user-1" {
				// Write Lock inside callback — must not deadlock
				newConn := &Connection{roomID: "room-1", userID: "user-3", seat: 2, send: make(chan []byte, 10)}
				hub.Register(newConn)
			}
		})
	}()

	select {
	case <-done:
		// Pass
	case <-time.After(2 * time.Second):
		t.Fatal("SEC-REV-008: ForEachInRoom deadlocked — callback could not acquire Write Lock")
	}

	// user-3 should have been registered by the callback
	assert.Equal(t, 3, hub.RoomConnectionCount("room-1"))
}

// TestHub_BroadcastToRoom_ReleasesLockBeforeSend verifies BroadcastToRoom
// also follows the snapshot pattern. We simulate work by having a goroutine
// try to Register a new connection while a broadcast is in flight. Under the
// old implementation the broadcast's RLock would block the Register's Lock
// briefly; with the fix the snapshot is released before any I/O.
func TestHub_BroadcastToRoom_ReleasesLockBeforeSend(t *testing.T) {
	hub := NewHub(testLogger())

	conn1 := &Connection{roomID: "room-1", userID: "user-1", seat: 0, send: make(chan []byte, 10)}
	hub.Register(conn1)

	// Broadcast should not hold the lock while Send() runs.
	// Immediately after Broadcast returns, a Write Lock must be acquirable.
	msg := &WSMessage{Type: S2CPong, Payload: PongPayload{ServerTime: "now"}}
	hub.BroadcastToRoom("room-1", msg)

	registerDone := make(chan struct{})
	go func() {
		conn2 := &Connection{roomID: "room-1", userID: "user-2", seat: 1, send: make(chan []byte, 10)}
		hub.Register(conn2)
		close(registerDone)
	}()

	select {
	case <-registerDone:
		// Pass
	case <-time.After(500 * time.Millisecond):
		t.Fatal("SEC-REV-008: Register was blocked after BroadcastToRoom")
	}

	assert.Equal(t, 1, len(conn1.send))
	assert.Equal(t, 2, hub.RoomConnectionCount("room-1"))
}

// TestHub_ForEachInRoom_CallbackPanic_DoesNotStopIteration verifies SEC-REV-009:
// a panic in one callback must be recovered so the remaining connections still
// receive their notifications. In a 4-player game, a crash processing player 2
// must not leave players 3 and 4 without a GAME_STATE.
func TestHub_ForEachInRoom_CallbackPanic_DoesNotStopIteration(t *testing.T) {
	hub := NewHub(testLogger())

	conn1 := &Connection{roomID: "room-1", userID: "user-1", seat: 0, send: make(chan []byte, 10)}
	conn2 := &Connection{roomID: "room-1", userID: "user-2", seat: 1, send: make(chan []byte, 10)}
	conn3 := &Connection{roomID: "room-1", userID: "user-3", seat: 2, send: make(chan []byte, 10)}
	conn4 := &Connection{roomID: "room-1", userID: "user-4", seat: 3, send: make(chan []byte, 10)}

	hub.Register(conn1)
	hub.Register(conn2)
	hub.Register(conn3)
	hub.Register(conn4)

	visited := make(map[string]bool)
	var visitedMu sync.Mutex

	// The callback panics on user-2. All other users must still be visited.
	assert.NotPanics(t, func() {
		hub.ForEachInRoom("room-1", func(c *Connection) {
			if c.userID == "user-2" {
				panic("simulated GetGameState failure")
			}
			visitedMu.Lock()
			visited[c.userID] = true
			visitedMu.Unlock()
		})
	}, "SEC-REV-009: ForEachInRoom must recover from callback panics")

	assert.True(t, visited["user-1"], "SEC-REV-009: user-1 should have been visited")
	assert.True(t, visited["user-3"], "SEC-REV-009: user-3 should have been visited after panic")
	assert.True(t, visited["user-4"], "SEC-REV-009: user-4 should have been visited after panic")
	assert.False(t, visited["user-2"], "user-2 panicked, should not appear in visited")
}

// TestHub_ForEachInRoom_AllCallbacksPanic_DoesNotCrash verifies that even if
// every callback panics, the Hub itself does not propagate panics to the caller.
func TestHub_ForEachInRoom_AllCallbacksPanic_DoesNotCrash(t *testing.T) {
	hub := NewHub(testLogger())

	conn1 := &Connection{roomID: "room-1", userID: "user-1", seat: 0, send: make(chan []byte, 10)}
	conn2 := &Connection{roomID: "room-1", userID: "user-2", seat: 1, send: make(chan []byte, 10)}
	hub.Register(conn1)
	hub.Register(conn2)

	assert.NotPanics(t, func() {
		hub.ForEachInRoom("room-1", func(c *Connection) {
			panic("everyone crashes")
		})
	})
}

// TestHub_ForEachInRoom_EmptyRoom is a safety check for the snapshot path.
func TestHub_ForEachInRoom_EmptyRoom(t *testing.T) {
	hub := NewHub(testLogger())

	count := 0
	hub.ForEachInRoom("nonexistent", func(c *Connection) {
		count++
	})
	assert.Equal(t, 0, count)
}
