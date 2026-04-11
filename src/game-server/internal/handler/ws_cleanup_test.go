package handler

import (
	"context"
	"fmt"
	"testing"
	"time"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
	"go.uber.org/zap"

	"github.com/k82022603/RummiArena/game-server/internal/client"
	"github.com/k82022603/RummiArena/game-server/internal/model"
	"github.com/k82022603/RummiArena/game-server/internal/repository"
	"github.com/k82022603/RummiArena/game-server/internal/service"
)

// ============================================================
// BUG-GS-005: WS 끊김 시 AI 게임 자동 정리 테스트
// ============================================================

// newCleanupTestEnv 게임 정리 테스트용 환경을 생성한다.
func newCleanupTestEnv(aiClient client.AIClientInterface) (*WSHandler, repository.MemoryGameStateRepository) {
	gameRepo := repository.NewMemoryGameStateRepo()
	gameSvc := service.NewGameService(gameRepo)
	turnSvc := service.NewTurnService(gameRepo, gameSvc)
	roomRepo := repository.NewMemoryRoomRepo()
	roomSvc := service.NewRoomService(roomRepo, repository.NewMemoryGameStateRepoAdapter())
	h := &WSHandler{
		hub:           NewHub(zap.NewNop()),
		roomSvc:       roomSvc,
		gameSvc:       gameSvc,
		turnSvc:       turnSvc,
		aiClient:      aiClient,
		logger:        zap.NewNop(),
		timers:        make(map[string]*turnTimer),
		graceTimers:   make(map[string]*graceTimer),
		aiTurnCancels: make(map[string]context.CancelFunc),
	}
	return h, gameRepo
}

// cleanupGameState 테스트용 2인 게임 상태를 반환한다.
func cleanupGameState(gameID string) *model.GameStateRedis {
	return &model.GameStateRedis{
		GameID:         gameID,
		Status:         model.GameStatusPlaying,
		CurrentSeat:    1,
		TurnTimeoutSec: 0,
		DrawPile:       []string{"R4a", "R5a", "R6a", "R7a", "R8a"},
		Table:          []*model.SetOnTable{},
		TurnStartAt:    time.Now().Unix(),
		TurnCount:      1,
		Players: []model.PlayerState{
			{SeatOrder: 0, UserID: "human-1", PlayerType: "HUMAN", Rack: []string{"R1a", "R2a"}},
			{
				SeatOrder:    1,
				UserID:       "ai-1",
				PlayerType:   "AI_OPENAI",
				AIModel:      "openai",
				AIPersona:    "Rookie",
				AIDifficulty: "beginner",
				Rack:         []string{"B1a", "B2a", "B3a"},
			},
		},
	}
}

// TestCancelAITurn_CancelsRunningGoroutine cancelAITurn이 등록된 cancel 함수를 호출하는지 확인한다.
func TestCancelAITurn_CancelsRunningGoroutine(t *testing.T) {
	h, _ := newCleanupTestEnv(nil)

	gameID := "game-cancel-test"
	ctx, cancel := context.WithCancel(context.Background())

	// cancel 함수 등록
	h.aiTurnCancelsMu.Lock()
	h.aiTurnCancels[gameID] = cancel
	h.aiTurnCancelsMu.Unlock()

	// cancelAITurn 호출
	h.cancelAITurn(gameID)

	// context가 취소되었는지 확인
	select {
	case <-ctx.Done():
		// 정상: context가 취소됨
	default:
		t.Fatal("cancelAITurn이 context를 취소하지 않았다")
	}

	// map에서 제거되었는지 확인
	h.aiTurnCancelsMu.Lock()
	_, exists := h.aiTurnCancels[gameID]
	h.aiTurnCancelsMu.Unlock()
	assert.False(t, exists, "cancelAITurn 후 map에서 제거되어야 한다")
}

// TestCancelAITurn_NoopOnMissing 등록되지 않은 gameID에 대해 cancelAITurn이 패닉 없이 동작한다.
func TestCancelAITurn_NoopOnMissing(t *testing.T) {
	h, _ := newCleanupTestEnv(nil)

	assert.NotPanics(t, func() {
		h.cancelAITurn("nonexistent-game")
	}, "등록되지 않은 gameID에 대해 패닉이 없어야 한다")
}

// TestCleanupGame_DeletesGameState cleanupGame이 Redis GameState를 삭제하는지 확인한다.
func TestCleanupGame_DeletesGameState(t *testing.T) {
	h, repo := newCleanupTestEnv(nil)

	gameID := "game-cleanup-test"
	state := cleanupGameState(gameID)
	require.NoError(t, repo.SaveGameState(state))

	// 게임 상태가 존재하는지 확인
	_, err := repo.GetGameState(gameID)
	require.NoError(t, err, "게임 상태가 존재해야 한다")

	// cleanupGame 호출
	h.cleanupGame(gameID)

	// 게임 상태가 삭제되었는지 확인
	_, err = repo.GetGameState(gameID)
	assert.Error(t, err, "cleanupGame 후 게임 상태가 삭제되어야 한다")
}

// TestCleanupGame_CancelsAITurn cleanupGame이 AI goroutine도 취소하는지 확인한다.
func TestCleanupGame_CancelsAITurn(t *testing.T) {
	h, repo := newCleanupTestEnv(nil)

	gameID := "game-cleanup-cancel"
	state := cleanupGameState(gameID)
	require.NoError(t, repo.SaveGameState(state))

	ctx, cancel := context.WithCancel(context.Background())
	h.aiTurnCancelsMu.Lock()
	h.aiTurnCancels[gameID] = cancel
	h.aiTurnCancelsMu.Unlock()

	h.cleanupGame(gameID)

	// AI context가 취소되었는지 확인
	select {
	case <-ctx.Done():
		// 정상
	default:
		t.Fatal("cleanupGame이 AI context를 취소하지 않았다")
	}

	// 게임 상태도 삭제되었는지 확인
	_, err := repo.GetGameState(gameID)
	assert.Error(t, err, "cleanupGame 후 게임 상태가 삭제되어야 한다")
}

// TestHandleAITurn_RegistersCancelFunc handleAITurn이 cancel 함수를 등록하는지 확인한다.
func TestHandleAITurn_RegistersCancelFunc(t *testing.T) {
	// 100ms 후 draw 응답
	aiClient := &stubAIClient{
		resp:  &client.MoveResponse{Action: "draw"},
		delay: 100 * time.Millisecond,
	}

	h, repo := newCleanupTestEnv(aiClient)

	gameID := "game-register-cancel"
	state := cleanupGameState(gameID)
	require.NoError(t, repo.SaveGameState(state))

	conn := &Connection{
		roomID: "room-register",
		userID: "human-1",
		seat:   0,
		send:   make(chan []byte, 32),
	}
	h.hub.Register(conn)

	// handleAITurn이 cancel 등록 후 정상 완료되면 map에서 제거되어야 한다
	player := &state.Players[1]
	h.handleAITurn("room-register", gameID, player, state)

	h.aiTurnCancelsMu.Lock()
	_, exists := h.aiTurnCancels[gameID]
	h.aiTurnCancelsMu.Unlock()
	assert.False(t, exists, "handleAITurn 완료 후 cancel이 map에서 제거되어야 한다")
}

// TestHandleAITurn_SkipsWhenGameAlreadyFinished AI 응답 수신 후 게임이 이미 종료된 경우
// 게임 동작(place/draw)을 수행하지 않는다.
func TestHandleAITurn_SkipsWhenGameAlreadyFinished(t *testing.T) {
	// place 응답 반환 (200ms delay)
	aiClient := &stubAIClient{
		resp: &client.MoveResponse{
			Action:        "place",
			TilesFromRack: []string{"B1a", "B2a", "B3a"},
			TableGroups: []client.TileGroup{
				{Tiles: []string{"B1a", "B2a", "B3a"}},
			},
		},
		delay: 200 * time.Millisecond,
	}

	h, repo := newCleanupTestEnv(aiClient)

	gameID := "game-already-finished"
	state := cleanupGameState(gameID)
	require.NoError(t, repo.SaveGameState(state))

	conn := &Connection{
		roomID: "room-finished",
		userID: "human-1",
		seat:   0,
		send:   make(chan []byte, 32),
	}
	h.hub.Register(conn)

	// AI 응답 대기 중에 게임을 FINISHED로 변경
	go func() {
		time.Sleep(100 * time.Millisecond) // AI 응답보다 먼저
		s, _ := repo.GetGameState(gameID)
		s.Status = model.GameStatusFinished
		_ = repo.SaveGameState(s)
	}()

	player := &state.Players[1]
	h.handleAITurn("room-finished", gameID, player, state)

	// 게임이 FINISHED인 상태에서는 place가 실행되지 않아
	// DrawPile이 그대로여야 한다
	finalState, err := repo.GetGameState(gameID)
	require.NoError(t, err)
	assert.Equal(t, 5, len(finalState.DrawPile),
		"게임이 이미 종료된 경우 DrawPile이 변경되지 않아야 한다")
}

// TestHandleAITurn_CancelledContext AI 응답 대기 중 context가 취소되면
// forceAIDraw를 실행하지 않고 조기 종료한다.
func TestHandleAITurn_CancelledContext(t *testing.T) {
	// 5초 대기 (cancelAITurn에 의해 취소됨)
	aiClient := &stubAIClient{
		err:   fmt.Errorf("context canceled"),
		delay: 5 * time.Second,
	}

	h, repo := newCleanupTestEnv(aiClient)

	gameID := "game-ctx-cancel"
	state := cleanupGameState(gameID)
	require.NoError(t, repo.SaveGameState(state))

	conn := &Connection{
		roomID: "room-ctx-cancel",
		userID: "human-1",
		seat:   0,
		send:   make(chan []byte, 32),
	}
	h.hub.Register(conn)

	done := make(chan struct{})
	go func() {
		player := &state.Players[1]
		h.handleAITurn("room-ctx-cancel", gameID, player, state)
		close(done)
	}()

	// 200ms 후 AI goroutine 취소
	time.Sleep(200 * time.Millisecond)
	h.cancelAITurn(gameID)

	// handleAITurn이 빠르게 종료되어야 한다 (5초 전에)
	select {
	case <-done:
		// 정상: 취소 후 빠르게 종료
	case <-time.After(2 * time.Second):
		t.Fatal("cancelAITurn 후 handleAITurn이 2초 내에 종료되지 않았다")
	}

	// DrawPile이 변경되지 않아야 한다 (forceAIDraw 미실행)
	finalState, err := repo.GetGameState(gameID)
	require.NoError(t, err)
	assert.Equal(t, 5, len(finalState.DrawPile),
		"context 취소 시 forceAIDraw가 실행되지 않아야 한다")
}

// TestBroadcastGameOverFromState_CleansUpGame broadcastGameOverFromState가
// cleanupGame(AI 취소 + Redis 삭제)을 호출하는지 확인한다.
func TestBroadcastGameOverFromState_CleansUpGame(t *testing.T) {
	h, repo := newCleanupTestEnv(nil)

	gameID := "game-over-cleanup"
	state := cleanupGameState(gameID)
	// 한 플레이어의 랙을 비워서 게임 종료 조건 충족
	state.Players[0].Rack = []string{}
	state.Status = model.GameStatusFinished
	require.NoError(t, repo.SaveGameState(state))

	// AI cancel 등록
	ctx, cancel := context.WithCancel(context.Background())
	h.aiTurnCancelsMu.Lock()
	h.aiTurnCancels[gameID] = cancel
	h.aiTurnCancelsMu.Unlock()

	conn := &Connection{
		roomID: "room-over-cleanup",
		userID: "human-1",
		seat:   0,
		send:   make(chan []byte, 32),
	}
	h.hub.Register(conn)

	h.broadcastGameOverFromState("room-over-cleanup", state)

	// AI context가 취소되었는지 확인
	select {
	case <-ctx.Done():
		// 정상
	default:
		t.Fatal("broadcastGameOverFromState가 AI context를 취소하지 않았다")
	}

	// 게임 상태가 삭제되었는지 확인
	_, err := repo.GetGameState(gameID)
	assert.Error(t, err, "broadcastGameOverFromState 후 게임 상태가 삭제되어야 한다")
}

// TestDeleteGameState_ServiceInterface GameService.DeleteGameState가 올바르게 동작하는지 확인한다.
func TestDeleteGameState_ServiceInterface(t *testing.T) {
	gameRepo := repository.NewMemoryGameStateRepo()
	gameSvc := service.NewGameService(gameRepo)

	state := &model.GameStateRedis{
		GameID:  "game-del-svc",
		Status:  model.GameStatusPlaying,
		Players: []model.PlayerState{{SeatOrder: 0, Rack: []string{"R1a"}}},
	}
	require.NoError(t, gameRepo.SaveGameState(state))

	// GetRawGameState로 존재 확인
	_, err := gameSvc.GetRawGameState("game-del-svc")
	require.NoError(t, err)

	// DeleteGameState
	err = gameSvc.DeleteGameState("game-del-svc")
	require.NoError(t, err)

	// 삭제 후 조회 실패
	_, err = gameSvc.GetRawGameState("game-del-svc")
	assert.Error(t, err, "삭제 후 조회 시 에러가 반환되어야 한다")
}
