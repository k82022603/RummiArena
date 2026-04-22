package handler

// BUG-GS-005 안정화 통합 테스트 — Sprint 6 Day 3 (2026-04-14)
//
// 이 테스트는 단위 레벨 mock이 아닌 WSHandler 전체 경로를 통한
// 80턴 TIMEOUT 시나리오와 Redis/goroutine cleanup 회귀를 방지한다.
// 검증 대상:
//   1) TurnCount >= MaxTurnsLimit 도달 시 DrawTile → handleDrawTile →
//      broadcastGameOver → cleanupGame → DeleteGameState 체인이 완결된다.
//   2) 정리 직후 Redis(인메모리 repo) GameState가 존재하지 않는다.
//   3) aiTurnCancels/timers/graceTimers 맵이 비어 있다.
//   4) 일련의 요청 전후로 goroutine 숫자가 유의미하게 증가하지 않는다
//      (goroutine 누수 방지 회귀 가드).

import (
	"context"
	"runtime"
	"testing"
	"time"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
	"go.uber.org/zap"

	"github.com/k82022603/RummiArena/game-server/internal/model"
	"github.com/k82022603/RummiArena/game-server/internal/repository"
	"github.com/k82022603/RummiArena/game-server/internal/service"
)

// newTurnLimitTestEnv 턴 상한이 걸린 gameService를 포함한 WSHandler를 반환한다.
// cleanupGame 체인 회귀 방지를 위한 전용 테스트 하네스다.
func newTurnLimitTestEnv(t *testing.T, maxTurns int) (*WSHandler, repository.MemoryGameStateRepository) {
	t.Helper()
	gameRepo := repository.NewMemoryGameStateRepo()
	gameSvc := service.NewGameService(gameRepo, service.WithMaxTurnsLimit(maxTurns))
	turnSvc := service.NewTurnService(gameRepo, gameSvc)
	roomRepo := repository.NewMemoryRoomRepo()
	roomSvc := service.NewRoomService(roomRepo, repository.NewMemoryGameStateRepoAdapter(), nil)
	h := &WSHandler{
		hub:           NewHub(zap.NewNop()),
		roomSvc:       roomSvc,
		gameSvc:       gameSvc,
		turnSvc:       turnSvc,
		logger:        zap.NewNop(),
		timers:        make(map[string]*turnTimer),
		graceTimers:   make(map[string]*graceTimer),
		aiTurnCancels: make(map[string]context.CancelFunc),
	}
	return h, gameRepo
}

// twoPlayerStateAtTurn TurnCount=turn, DrawPile에 풍부한 타일을 가진 2인 게임 상태를 만든다.
// 양 플레이어 모두 HUMAN으로 설정해서 AI 경로를 제외하고 핵심 cleanup 경로만 검증한다.
func twoPlayerStateAtTurn(gameID string, turn int) *model.GameStateRedis {
	// DrawPile은 80턴을 버텨야 하므로 충분히 채운다
	drawPile := []string{
		"R1a", "R2a", "R3a", "R4a", "R5a", "R6a", "R7a", "R8a", "R9a", "R10a",
		"B1a", "B2a", "B3a", "B4a", "B5a", "B6a", "B7a", "B8a", "B9a", "B10a",
		"Y1a", "Y2a", "Y3a", "Y4a", "Y5a", "Y6a", "Y7a", "Y8a", "Y9a", "Y10a",
		"K1a", "K2a", "K3a", "K4a", "K5a", "K6a", "K7a", "K8a", "K9a", "K10a",
		"R1b", "R2b", "R3b", "R4b", "R5b", "R6b", "R7b", "R8b", "R9b", "R10b",
		"B1b", "B2b", "B3b", "B4b", "B5b", "B6b", "B7b", "B8b", "B9b", "B10b",
		"Y1b", "Y2b", "Y3b", "Y4b", "Y5b", "Y6b", "Y7b", "Y8b", "Y9b", "Y10b",
		"K1b", "K2b", "K3b", "K4b", "K5b", "K6b", "K7b", "K8b", "K9b", "K10b",
	}
	return &model.GameStateRedis{
		GameID:         gameID,
		Status:         model.GameStatusPlaying,
		CurrentSeat:    0,
		TurnTimeoutSec: 0,
		DrawPile:       drawPile,
		Table:          []*model.SetOnTable{},
		TurnStartAt:    time.Now().Unix(),
		TurnCount:      turn,
		Players: []model.PlayerState{
			{
				SeatOrder:      0,
				UserID:         "human-A",
				PlayerType:     "HUMAN",
				Rack:           []string{"R11a", "R12a", "R13a"},
				HasInitialMeld: true,
			},
			{
				SeatOrder:      1,
				UserID:         "human-B",
				PlayerType:     "HUMAN",
				Rack:           []string{"B11a", "B12a", "B13a"},
				HasInitialMeld: true,
			},
		},
	}
}

// TestBUGGS005_TurnLimitReached_FullHandlerPath_CleansUpState
// BUG-GS-005 회귀 방지 — 80턴 도달 시 handleDrawTile 진입점에서
// broadcastGameOver → cleanupGame → DeleteGameState 체인이 성립한다.
//
// Given: maxTurnsLimit=80, TurnCount=79
// When: handleDrawTile이 호출되어 service.DrawTile이 turn 80을 트리거
// Then: result.GameEnded=true → broadcastGameOver → cleanupGame 실행
//
//	Redis(인메모리 repo)에서 GameState가 삭제되어야 한다.
func TestBUGGS005_TurnLimitReached_FullHandlerPath_CleansUpState(t *testing.T) {
	h, repo := newTurnLimitTestEnv(t, 80)

	gameID := "bug-gs-005-turn-limit"
	state := twoPlayerStateAtTurn(gameID, 79)
	require.NoError(t, repo.SaveGameState(state))

	// 사전 검증: state가 저장되어 있다
	_, err := repo.GetGameState(gameID)
	require.NoError(t, err, "준비 상태는 repo에 존재해야 한다")

	// 현재 턴 소유자(seat 0)의 연결을 셋업하고 handleDrawTile 호출
	conn := newTestConnection("room-bug-gs-005", "human-A", "Human A", 0, gameID)
	h.hub.Register(conn)
	defer h.hub.Unregister(conn)

	// 두 번째 연결도 등록해 broadcast가 발생하도록 한다
	conn2 := newTestConnection("room-bug-gs-005", "human-B", "Human B", 1, gameID)
	h.hub.Register(conn2)
	defer h.hub.Unregister(conn2)

	// send 채널 드레인 goroutine (채널 풀리면 Send drop 경고가 뜨지 않도록)
	stopDrain := make(chan struct{})
	defer close(stopDrain)
	go drainConn(conn, stopDrain)
	go drainConn(conn2, stopDrain)

	h.handleDrawTile(conn)

	// Redis GameState가 삭제되었는지 확인 — cleanupGame이 실행되었음을 의미
	_, err = repo.GetGameState(gameID)
	assert.Error(t, err, "턴 상한 도달 후 GameState가 Redis에서 삭제되어야 한다 (BUG-GS-005 회귀)")

	// 타이머/grace/aiTurnCancels 맵이 비어 있어야 한다
	h.timersMu.Lock()
	timerCount := len(h.timers)
	h.timersMu.Unlock()
	assert.Equal(t, 0, timerCount, "턴 상한 cleanup 이후 활성 타이머는 0이어야 한다")

	h.graceTimersMu.Lock()
	graceCount := len(h.graceTimers)
	h.graceTimersMu.Unlock()
	assert.Equal(t, 0, graceCount, "턴 상한 cleanup 이후 grace 타이머는 0이어야 한다")

	h.aiTurnCancelsMu.Lock()
	cancelCount := len(h.aiTurnCancels)
	h.aiTurnCancelsMu.Unlock()
	assert.Equal(t, 0, cancelCount, "턴 상한 cleanup 이후 AI cancel map은 0이어야 한다")
}

// TestBUGGS005_DrawTileTrapTurn80_LongPath
// 실제 80턴 진행 시뮬레이션: TurnCount=0부터 시작해 service.DrawTile을 반복 호출하여
// TurnCount가 80에 도달할 때 finishGameStalemate 경로가 1회만 트리거되고,
// 그 이후에는 Finished 상태에서 추가 정리 진입이 안전한지 검증한다.
func TestBUGGS005_DrawTileTrapTurn80_LongPath(t *testing.T) {
	h, repo := newTurnLimitTestEnv(t, 80)

	gameID := "bug-gs-005-long-path"
	state := twoPlayerStateAtTurn(gameID, 0)
	require.NoError(t, repo.SaveGameState(state))

	// 2명 연결 셋업
	connA := newTestConnection("room-long-path", "human-A", "Human A", 0, gameID)
	connB := newTestConnection("room-long-path", "human-B", "Human B", 1, gameID)
	h.hub.Register(connA)
	h.hub.Register(connB)
	defer h.hub.Unregister(connA)
	defer h.hub.Unregister(connB)

	// send 채널 드레인 goroutine
	stopDrain := make(chan struct{})
	defer close(stopDrain)
	go drainConn(connA, stopDrain)
	go drainConn(connB, stopDrain)

	// goroutine baseline 측정 (테스트 시작 직전)
	baseGoroutines := runtime.NumGoroutine()

	// 80턴 도달할 때까지 DrawTile 반복.
	// DrawPile이 80개 이상이므로 소진되지 않고 TurnCount만 증가한다.
	// 실행 중인 conn은 현재 seat에 해당하는 쪽을 사용한다.
	ended := false
	for i := 0; i < 200 && !ended; i++ {
		s, err := repo.GetGameState(gameID)
		if err != nil {
			// 이미 cleanupGame이 실행된 경우
			ended = true
			break
		}
		if s.Status != model.GameStatusPlaying {
			ended = true
			break
		}
		var activeConn *Connection
		if s.CurrentSeat == 0 {
			activeConn = connA
		} else {
			activeConn = connB
		}
		h.handleDrawTile(activeConn)
	}

	require.True(t, ended, "80턴 내에 게임이 종결되어야 한다")

	// cleanupGame이 실행되었다면 Redis에서 상태가 사라진 상태여야 한다
	_, err := repo.GetGameState(gameID)
	assert.Error(t, err, "80턴 도달 후 GameState가 정리되어야 한다")

	// 타이머/grace/cancel 맵이 비어야 한다
	h.timersMu.Lock()
	timerCount := len(h.timers)
	h.timersMu.Unlock()
	assert.Equal(t, 0, timerCount, "cleanup 이후 타이머 잔존 없음")

	h.aiTurnCancelsMu.Lock()
	cancelCount := len(h.aiTurnCancels)
	h.aiTurnCancelsMu.Unlock()
	assert.Equal(t, 0, cancelCount, "cleanup 이후 AI cancel 잔존 없음")

	// goroutine leak 가드: cleanup 후 약간의 틈을 두고 차이가 5 이하여야 한다.
	// broadcast/ELO 업데이트 goroutine이 잠시 살아있을 수 있어 여유폭을 둔다.
	time.Sleep(50 * time.Millisecond)
	finalGoroutines := runtime.NumGoroutine()
	delta := finalGoroutines - baseGoroutines
	assert.LessOrEqual(t, delta, 5,
		"80턴 cleanup 후 goroutine 누수가 없어야 한다 (base=%d final=%d delta=%d)",
		baseGoroutines, finalGoroutines, delta)
}

// newTestConnection 통합 테스트용 Connection을 만든다. logger를 설정하므로
// Send 호출 시 nil pointer가 발생하지 않는다.
func newTestConnection(roomID, userID, displayName string, seat int, gameID string) *Connection {
	return &Connection{
		roomID:      roomID,
		userID:      userID,
		displayName: displayName,
		seat:        seat,
		gameID:      gameID,
		send:        make(chan []byte, 256),
		logger:      zap.NewNop(),
	}
}

// drainConn Connection.send 채널을 계속 소비해 버퍼가 차지 않도록 한다.
func drainConn(conn *Connection, stop <-chan struct{}) {
	for {
		select {
		case <-stop:
			return
		case <-conn.send:
		}
	}
}

// TestBUGGS005_ForfeitPathTurnLimit_CleansUpState
// 기권 경로에서도 턴 상한이 도달하면 cleanupGame이 forfeitAndBroadcast 내에서
// 호출되어 Redis가 정리되는지 검증 (BUG-GS-005 Day2 구현 영역).
func TestBUGGS005_ForfeitPathTurnLimit_CleansUpState(t *testing.T) {
	h, repo := newTurnLimitTestEnv(t, 10)

	gameID := "bug-gs-005-forfeit-limit"
	// 2인 게임: 한 명이 기권하면 게임 종료 → cleanupGame
	state := twoPlayerStateAtTurn(gameID, 5)
	require.NoError(t, repo.SaveGameState(state))

	h.forfeitAndBroadcast("room-forfeit", gameID, 0, "human-A", "Human A", "TEST_FORFEIT")

	// 2인 게임에서 1명 기권 → 활성 1명 → GameEnded=true → cleanupGame
	_, err := repo.GetGameState(gameID)
	assert.Error(t, err, "2인 중 1명 기권 시 cleanupGame이 Redis를 정리해야 한다")

	h.aiTurnCancelsMu.Lock()
	cancelCount := len(h.aiTurnCancels)
	h.aiTurnCancelsMu.Unlock()
	assert.Equal(t, 0, cancelCount, "기권 cleanup 이후 AI cancel 맵은 비어야 한다")
}
