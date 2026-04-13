package handler

import (
	"sync"
	"testing"
	"time"

	"github.com/stretchr/testify/assert"
)

// TestConnection_CloseAndSend_NoPanic verifies SEC-REV-008 close-vs-send race fix.
//
// Context: The snapshot-then-iterate refactor of Hub (SEC-REV-008) exposed a latent
// race where BroadcastToRoom (now lock-free) could call Send() on a Connection at
// the exact moment another goroutine invoked Close() (ReadPump tear-down, duplicate
// eviction, etc). Writing to a closed channel panics in Go.
//
// The fix: Connection.sendMu serializes close-vs-send. Close() sets sendClosed
// under Write Lock, Send() checks the flag under Read Lock.
func TestConnection_CloseAndSend_NoPanic(t *testing.T) {
	conn := &Connection{
		roomID: "room-1",
		userID: "user-1",
		seat:   0,
		send:   make(chan []byte, 4),
		logger: testLogger(),
	}

	var wg sync.WaitGroup
	const senders = 20
	const sendsPerWorker = 50

	// Start N goroutines all calling Send() concurrently.
	for i := 0; i < senders; i++ {
		wg.Add(1)
		go func() {
			defer wg.Done()
			for j := 0; j < sendsPerWorker; j++ {
				// NotPanics cannot be used inline here (we're in goroutines);
				// if Send panics the test process will crash — that IS the assertion.
				conn.Send(&WSMessage{
					Type:    S2CPong,
					Payload: PongPayload{ServerTime: "now"},
				})
			}
		}()
	}

	// Close mid-flight.
	time.Sleep(5 * time.Millisecond)
	assert.NotPanics(t, func() {
		conn.Close()
	}, "Close() must never panic even with in-flight Send() calls")

	// Post-close Send calls must be silent no-ops.
	assert.NotPanics(t, func() {
		for i := 0; i < 10; i++ {
			conn.Send(&WSMessage{
				Type:    S2CPong,
				Payload: PongPayload{ServerTime: "after-close"},
			})
		}
	}, "Send() after Close() must not panic")

	wg.Wait()

	// Double Close() must be idempotent.
	assert.NotPanics(t, func() {
		conn.Close()
	}, "double Close() must be idempotent")
}

// TestConnection_Close_Idempotent verifies that calling Close() multiple times
// (possible via ReadPump defer + Hub eviction) is safe.
func TestConnection_Close_Idempotent(t *testing.T) {
	conn := &Connection{
		roomID: "room-1",
		userID: "user-1",
		send:   make(chan []byte, 4),
		logger: testLogger(),
	}

	assert.NotPanics(t, func() {
		conn.Close()
		conn.Close()
		conn.Close()
	})
}
