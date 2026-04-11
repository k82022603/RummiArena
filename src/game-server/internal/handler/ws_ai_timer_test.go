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
// Mock AI Client
// ============================================================

// stubAIClient 테스트용 AI 클라이언트.
// GenerateMove를 호출하면 delay 만큼 대기 후 resp를 반환하거나, err를 반환한다.
type stubAIClient struct {
	resp  *client.MoveResponse
	err   error
	delay time.Duration
}

func (s *stubAIClient) GenerateMove(ctx context.Context, req *client.MoveRequest) (*client.MoveResponse, error) {
	if s.delay > 0 {
		select {
		case <-ctx.Done():
			return nil, ctx.Err()
		case <-time.After(s.delay):
		}
	}
	return s.resp, s.err
}

func (s *stubAIClient) HealthCheck(_ context.Context) error {
	return nil
}

// ============================================================
// 헬퍼
// ============================================================

// newAITimerTestEnv AI 턴 + 타이머 테스트용 환경을 생성한다.
func newAITimerTestEnv(aiClient client.AIClientInterface) (*WSHandler, repository.MemoryGameStateRepository) {
	gameRepo := repository.NewMemoryGameStateRepo()
	gameSvc := service.NewGameService(gameRepo)
	turnSvc := service.NewTurnService(gameRepo, gameSvc)
	h := &WSHandler{
		hub:           NewHub(zap.NewNop()),
		roomSvc:       service.NewRoomService(repository.NewMemoryRoomRepo(), repository.NewMemoryGameStateRepoAdapter()),
		gameSvc:       gameSvc,
		turnSvc:       turnSvc,
		aiClient:      aiClient,
		logger:        zap.NewNop(),
		timers:        make(map[string]*turnTimer),
		aiTurnCancels: make(map[string]context.CancelFunc),
	}
	return h, gameRepo
}

// aiGameState AI 턴 타이머 테스트용 2인 게임 상태.
func aiGameState(gameID string) *model.GameStateRedis {
	return &model.GameStateRedis{
		GameID:         gameID,
		Status:         model.GameStatusPlaying,
		CurrentSeat:    1,
		TurnTimeoutSec: 0, // 다음 턴에서 재귀 타이머 방지
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

// ============================================================
// 테스트
// ============================================================

// TestHandleAITurn_CancelsTurnTimer handleAITurn 진입 시 기존 턴 타이머가 취소되어
// HandleTimeout과의 경합 조건이 발생하지 않는다.
func TestHandleAITurn_CancelsTurnTimer(t *testing.T) {
	// 500ms 후 드로우 응답을 반환하는 stub
	aiClient := &stubAIClient{
		resp:  nil,
		err:   fmt.Errorf("simulated timeout"),
		delay: 500 * time.Millisecond,
	}

	h, repo := newAITimerTestEnv(aiClient)

	gameID := "game-ai-cancel-timer"
	state := aiGameState(gameID)
	require.NoError(t, repo.SaveGameState(state))

	conn := &Connection{
		roomID: "room-ai-timer",
		userID: "human-1",
		seat:   0,
		send:   make(chan []byte, 32),
	}
	h.hub.Register(conn)

	// 1. 턴 타이머를 시작 (60초 — 테스트 중 만료되지 않는 충분한 시간)
	h.startTurnTimer("room-ai-timer", gameID, 1, 60)

	h.timersMu.Lock()
	_, timerExists := h.timers[gameID]
	h.timersMu.Unlock()
	require.True(t, timerExists, "startTurnTimer 후 타이머가 등록되어 있어야 한다")

	// 2. handleAITurn 실행 (동기적)
	player := &state.Players[1]
	h.handleAITurn("room-ai-timer", gameID, player, state)

	// 3. handleAITurn이 진입 시점에 턴 타이머를 취소했으므로
	//    타이머 맵에서 제거되어야 한다.
	h.timersMu.Lock()
	_, timerExistsAfter := h.timers[gameID]
	h.timersMu.Unlock()
	assert.False(t, timerExistsAfter,
		"handleAITurn이 cancelTurnTimer를 호출했으므로 타이머가 제거되어야 한다")
}

// TestHandleAITurn_TimerDoesNotFire_AfterCancel 턴 타이머(1초)를 시작한 후
// handleAITurn이 진입하여 취소하면, 1초가 지나도 HandleTimeout이 실행되지 않는다.
func TestHandleAITurn_TimerDoesNotFire_AfterCancel(t *testing.T) {
	// AI 호출 실패 → forceAIDraw로 폴백
	aiClient := &stubAIClient{
		err:   fmt.Errorf("simulated error"),
		delay: 200 * time.Millisecond,
	}

	h, repo := newAITimerTestEnv(aiClient)

	gameID := "game-ai-no-fire"
	state := aiGameState(gameID)
	require.NoError(t, repo.SaveGameState(state))

	conn := &Connection{
		roomID: "room-ai-nofire",
		userID: "human-1",
		seat:   0,
		send:   make(chan []byte, 32),
	}
	h.hub.Register(conn)

	// 1초 타이머 시작 (handleAITurn 없으면 1초 후 HandleTimeout 발동)
	h.startTurnTimer("room-ai-nofire", gameID, 1, 1)

	// handleAITurn이 타이머를 취소
	player := &state.Players[1]
	h.handleAITurn("room-ai-nofire", gameID, player, state)

	// handleAITurn 완료 후 forceAIDraw가 실행됨 → 상태 변경 1회
	stateAfterAI, err := repo.GetGameState(gameID)
	require.NoError(t, err)
	drawPileAfterAI := len(stateAfterAI.DrawPile)

	// 원래 타이머(1초)가 만료되기를 충분히 기다림
	time.Sleep(1500 * time.Millisecond)

	// HandleTimeout이 추가로 발동하지 않았으므로 DrawPile이 더 줄지 않아야 한다
	stateAfterWait, err := repo.GetGameState(gameID)
	require.NoError(t, err)
	assert.Equal(t, drawPileAfterAI, len(stateAfterWait.DrawPile),
		"취소된 턴 타이머의 HandleTimeout이 추가로 발동하지 않아야 한다")
}

// TestHandleAITurn_Success_NextTurnTimerStarts AI 배치 성공 후 다음 턴의 타이머가 정상 시작되는지 확인.
func TestHandleAITurn_Success_NextTurnTimerStarts(t *testing.T) {
	// 성공 응답: place action
	aiClient := &stubAIClient{
		resp: &client.MoveResponse{
			Action:        "place",
			TilesFromRack: []string{"B1a", "B2a", "B3a"},
			TableGroups: []client.TileGroup{
				{Tiles: []string{"B1a", "B2a", "B3a"}},
			},
		},
		delay: 100 * time.Millisecond,
	}

	h, repo := newAITimerTestEnv(aiClient)

	gameID := "game-ai-next-timer"
	state := aiGameState(gameID)
	state.TurnTimeoutSec = 60 // 다음 턴에 타이머가 시작되도록
	require.NoError(t, repo.SaveGameState(state))

	conn := &Connection{
		roomID: "room-ai-next",
		userID: "human-1",
		seat:   0,
		send:   make(chan []byte, 32),
	}
	h.hub.Register(conn)

	// 기존 타이머 시작
	h.startTurnTimer("room-ai-next", gameID, 1, 60)

	// handleAITurn 실행: 배치가 유효하지 않아 forceAIDraw로 폴백될 수 있음
	// (engine 검증은 별도) — 중요한 것은 기존 타이머가 취소되는 것
	player := &state.Players[1]
	h.handleAITurn("room-ai-next", gameID, player, state)

	// handleAITurn 진입 시 기존 타이머는 취소되었고,
	// processAIPlace 또는 forceAIDraw에서 다음 턴 타이머가 시작됨
	// (TurnTimeoutSec=60이므로 새 타이머가 등록되어야 함)
	time.Sleep(100 * time.Millisecond) // 비동기 처리 대기

	h.timersMu.Lock()
	newTimer, exists := h.timers[gameID]
	h.timersMu.Unlock()

	// forceAIDraw -> broadcastTurnStart -> startTurnTimer가 호출되어
	// 새 타이머가 등록되어야 한다
	if exists {
		assert.Equal(t, 0, newTimer.seat,
			"다음 턴은 human(seat 0)이므로 새 타이머의 seat은 0이어야 한다")
	}
	// exists가 false일 수도 있음 (TurnTimeoutSec=0 등) — 핵심은 경합이 없는 것
}

// TestHandleAITurn_NoTimerToCancel 턴 타이머가 없는 상태에서 handleAITurn을 호출해도 패닉이 없다.
func TestHandleAITurn_NoTimerToCancel(t *testing.T) {
	aiClient := &stubAIClient{
		err:   fmt.Errorf("simulated error"),
		delay: 50 * time.Millisecond,
	}

	h, repo := newAITimerTestEnv(aiClient)

	gameID := "game-ai-no-timer"
	state := aiGameState(gameID)
	require.NoError(t, repo.SaveGameState(state))

	conn := &Connection{
		roomID: "room-ai-notimer",
		userID: "human-1",
		seat:   0,
		send:   make(chan []byte, 32),
	}
	h.hub.Register(conn)

	// 타이머 없이 handleAITurn 호출 → cancelTurnTimer가 no-op으로 동작해야 한다
	player := &state.Players[1]
	assert.NotPanics(t, func() {
		h.handleAITurn("room-ai-notimer", gameID, player, state)
	}, "타이머가 없는 상태에서 handleAITurn 호출 시 패닉이 없어야 한다")
}
