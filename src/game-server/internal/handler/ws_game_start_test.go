package handler

import (
	"encoding/json"
	"testing"
	"time"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
	"go.uber.org/zap"

	"github.com/k82022603/RummiArena/game-server/internal/model"
	"github.com/k82022603/RummiArena/game-server/internal/repository"
	"github.com/k82022603/RummiArena/game-server/internal/service"
)

// TestNotifyGameStarted_SendsGameStateAndTurnStart BUG-WS-001 회귀 방지:
// 게임 시작 직후 모든 연결된 클라이언트에게 GAME_STATE와 TURN_START가 전송되는지 확인한다.
func TestNotifyGameStarted_SendsGameStateAndTurnStart(t *testing.T) {
	logger := zap.NewNop()
	hub := NewHub(logger)
	gameStateRepo := repository.NewMemoryGameStateRepoAdapter()
	roomRepo := repository.NewMemoryRoomRepo()
	gameSvc := service.NewGameService(gameStateRepo)
	roomSvc := service.NewRoomService(roomRepo, gameStateRepo)
	turnSvc := service.NewTurnService(gameStateRepo, gameSvc)

	wsHandler := &WSHandler{
		hub:         hub,
		roomSvc:     roomSvc,
		gameSvc:     gameSvc,
		turnSvc:     turnSvc,
		jwtSecret:   "test-secret",
		logger:      logger,
		timers:      make(map[string]*turnTimer),
		graceTimers: make(map[string]*graceTimer),
	}

	// 2인 게임 상태 생성
	state := &model.GameStateRedis{
		GameID:         "game-start-test",
		Status:         model.GameStatusPlaying,
		CurrentSeat:    0,
		TurnCount:      0,
		TurnTimeoutSec: 60,
		TurnStartAt:    time.Now().Unix(),
		DrawPile:       []string{"Y7a", "Y8a", "Y9a"},
		Table:          []*model.SetOnTable{},
		Players: []model.PlayerState{
			{
				SeatOrder:  0,
				UserID:     "user-1",
				PlayerType: "HUMAN",
				Rack:       []string{"R1a", "R2a", "R3a"},
			},
			{
				SeatOrder:  1,
				UserID:     "user-2",
				PlayerType: "HUMAN",
				Rack:       []string{"B4a", "B5a", "B6a"},
			},
		},
	}
	require.NoError(t, gameStateRepo.SaveGameState(state))

	// WebSocket 연결 시뮬레이션
	conn1 := &Connection{
		roomID: "room-start-test",
		userID: "user-1",
		seat:   0,
		send:   make(chan []byte, 32),
	}
	conn2 := &Connection{
		roomID: "room-start-test",
		userID: "user-2",
		seat:   1,
		send:   make(chan []byte, 32),
	}
	hub.Register(conn1)
	hub.Register(conn2)

	// NotifyGameStarted 호출
	wsHandler.NotifyGameStarted("room-start-test", state)

	// conn1: GAME_STATE + TURN_START = 2 메시지
	// conn2: GAME_STATE + TURN_START = 2 메시지
	for _, conn := range []*Connection{conn1, conn2} {
		var messages []WSMessage
		timeout := time.After(500 * time.Millisecond)
	collectLoop:
		for {
			select {
			case data := <-conn.send:
				var msg WSMessage
				require.NoError(t, json.Unmarshal(data, &msg))
				messages = append(messages, msg)
				if len(messages) >= 2 {
					break collectLoop
				}
			case <-timeout:
				break collectLoop
			}
		}

		require.Len(t, messages, 2, "각 연결에 GAME_STATE + TURN_START 2개 메시지가 전송되어야 한다 (user=%s)", conn.userID)
		assert.Equal(t, S2CGameState, messages[0].Type, "첫 번째 메시지는 GAME_STATE여야 한다")
		assert.Equal(t, S2CTurnStart, messages[1].Type, "두 번째 메시지는 TURN_START여야 한다")
	}

	// conn1의 gameID가 설정되었는지 확인
	assert.Equal(t, "game-start-test", conn1.gameID, "conn1의 gameID가 설정되어야 한다")
	assert.Equal(t, "game-start-test", conn2.gameID, "conn2의 gameID가 설정되어야 한다")
}

// TestNotifyGameStarted_SetsConnectionGameID BUG-WS-001:
// NotifyGameStarted 호출 후 각 연결의 gameID가 올바르게 설정되는지 확인한다.
func TestNotifyGameStarted_SetsConnectionGameID(t *testing.T) {
	logger := zap.NewNop()
	hub := NewHub(logger)
	gameStateRepo := repository.NewMemoryGameStateRepoAdapter()
	roomRepo := repository.NewMemoryRoomRepo()
	gameSvc := service.NewGameService(gameStateRepo)
	roomSvc := service.NewRoomService(roomRepo, gameStateRepo)
	turnSvc := service.NewTurnService(gameStateRepo, gameSvc)

	wsHandler := &WSHandler{
		hub:         hub,
		roomSvc:     roomSvc,
		gameSvc:     gameSvc,
		turnSvc:     turnSvc,
		jwtSecret:   "test-secret",
		logger:      logger,
		timers:      make(map[string]*turnTimer),
		graceTimers: make(map[string]*graceTimer),
	}

	state := &model.GameStateRedis{
		GameID:         "game-id-test",
		Status:         model.GameStatusPlaying,
		CurrentSeat:    1,
		TurnCount:      0,
		TurnTimeoutSec: 90,
		TurnStartAt:    time.Now().Unix(),
		DrawPile:       []string{"Y7a"},
		Table:          []*model.SetOnTable{},
		Players: []model.PlayerState{
			{SeatOrder: 0, UserID: "user-a", PlayerType: "HUMAN", Rack: []string{"R1a"}},
			{SeatOrder: 1, UserID: "user-b", PlayerType: "HUMAN", Rack: []string{"B2a"}},
		},
	}
	require.NoError(t, gameStateRepo.SaveGameState(state))

	conn := &Connection{
		roomID: "room-id-test",
		userID: "user-a",
		seat:   0,
		gameID: "", // 아직 비어있음
		send:   make(chan []byte, 32),
	}
	hub.Register(conn)

	wsHandler.NotifyGameStarted("room-id-test", state)

	assert.Equal(t, "game-id-test", conn.gameID, "NotifyGameStarted 후 gameID가 설정되어야 한다")
}

// TestNotifyGameStarted_TurnStartHasCorrectSeat BUG-WS-001:
// TURN_START 메시지의 seat이 게임 상태의 CurrentSeat과 일치하는지 확인한다.
func TestNotifyGameStarted_TurnStartHasCorrectSeat(t *testing.T) {
	logger := zap.NewNop()
	hub := NewHub(logger)
	gameStateRepo := repository.NewMemoryGameStateRepoAdapter()
	roomRepo := repository.NewMemoryRoomRepo()
	gameSvc := service.NewGameService(gameStateRepo)
	roomSvc := service.NewRoomService(roomRepo, gameStateRepo)
	turnSvc := service.NewTurnService(gameStateRepo, gameSvc)

	wsHandler := &WSHandler{
		hub:         hub,
		roomSvc:     roomSvc,
		gameSvc:     gameSvc,
		turnSvc:     turnSvc,
		jwtSecret:   "test-secret",
		logger:      logger,
		timers:      make(map[string]*turnTimer),
		graceTimers: make(map[string]*graceTimer),
	}

	// 첫 턴이 seat 1 (두 번째 플레이어)인 경우
	state := &model.GameStateRedis{
		GameID:         "game-seat-test",
		Status:         model.GameStatusPlaying,
		CurrentSeat:    1,
		TurnCount:      0,
		TurnTimeoutSec: 60,
		TurnStartAt:    time.Now().Unix(),
		DrawPile:       []string{"Y7a", "Y8a"},
		Table:          []*model.SetOnTable{},
		Players: []model.PlayerState{
			{SeatOrder: 0, UserID: "user-x", PlayerType: "HUMAN", Rack: []string{"R1a"}},
			{SeatOrder: 1, UserID: "user-y", PlayerType: "HUMAN", Rack: []string{"B2a"}},
		},
	}
	require.NoError(t, gameStateRepo.SaveGameState(state))

	conn := &Connection{
		roomID: "room-seat-test",
		userID: "user-x",
		seat:   0,
		send:   make(chan []byte, 32),
	}
	hub.Register(conn)

	wsHandler.NotifyGameStarted("room-seat-test", state)

	// GAME_STATE 건너뛰고 TURN_START 확인
	var turnStartMsg WSMessage
	timeout := time.After(500 * time.Millisecond)
	count := 0
	for count < 2 {
		select {
		case data := <-conn.send:
			var msg WSMessage
			require.NoError(t, json.Unmarshal(data, &msg))
			if msg.Type == S2CTurnStart {
				turnStartMsg = msg
			}
			count++
		case <-timeout:
			t.Fatal("메시지 수신 타임아웃")
		}
	}

	require.Equal(t, S2CTurnStart, turnStartMsg.Type)

	// Payload에서 seat 확인
	payloadBytes, err := json.Marshal(turnStartMsg.Payload)
	require.NoError(t, err)
	var tsPayload TurnStartPayload
	require.NoError(t, json.Unmarshal(payloadBytes, &tsPayload))
	assert.Equal(t, 1, tsPayload.Seat, "TURN_START의 seat은 CurrentSeat(1)과 일치해야 한다")
}

// TestRoomHandler_WithGameStartNotifier notifier가 설정되면 StartGame에서 호출되는지 확인.
// 실제 HTTP 요청 없이 notifier 설정 자체를 검증하는 단위 테스트.
func TestRoomHandler_WithGameStartNotifier(t *testing.T) {
	roomSvc := service.NewRoomService(
		repository.NewMemoryRoomRepo(),
		repository.NewMemoryGameStateRepoAdapter(),
	)
	rh := NewRoomHandler(roomSvc)

	assert.Nil(t, rh.notifier, "초기에는 notifier가 nil이어야 한다")

	// mock notifier
	called := false
	mock := &mockGameStartNotifier{onNotify: func(roomID string, state *model.GameStateRedis) {
		called = true
	}}
	rh.WithGameStartNotifier(mock)
	assert.NotNil(t, rh.notifier, "WithGameStartNotifier 후 notifier가 설정되어야 한다")

	// notifier 직접 호출 테스트
	rh.notifier.NotifyGameStarted("room-1", &model.GameStateRedis{})
	assert.True(t, called, "notifier가 호출되어야 한다")
}

// mockGameStartNotifier 테스트용 mock
type mockGameStartNotifier struct {
	onNotify func(roomID string, state *model.GameStateRedis)
}

func (m *mockGameStartNotifier) NotifyGameStarted(roomID string, state *model.GameStateRedis) {
	if m.onNotify != nil {
		m.onNotify(roomID, state)
	}
}
