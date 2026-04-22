package handler

import (
	"context"
	"fmt"
	"sync"
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
	"go.uber.org/zap"

	"github.com/k82022603/RummiArena/game-server/internal/model"
	"github.com/k82022603/RummiArena/game-server/internal/repository"
	"github.com/k82022603/RummiArena/game-server/internal/service"
)

// ============================================================
// I-14: persistGameResult 단위 테스트
// ============================================================

// --- mock GameRepository ---

type mockGameRepo struct {
	mu    sync.Mutex
	games []*model.Game
}

func (m *mockGameRepo) CreateGame(_ context.Context, game *model.Game) error {
	m.mu.Lock()
	defer m.mu.Unlock()
	m.games = append(m.games, game)
	return nil
}
func (m *mockGameRepo) GetGame(_ context.Context, _ string) (*model.Game, error) { return nil, nil }
func (m *mockGameRepo) UpdateGame(_ context.Context, _ *model.Game) error        { return nil }
func (m *mockGameRepo) CreateRoom(_ context.Context, _ *model.Room) error        { return nil }
func (m *mockGameRepo) GetRoom(_ context.Context, _ string) (*model.Room, error) { return nil, nil }
func (m *mockGameRepo) UpdateRoom(_ context.Context, _ *model.Room) error        { return nil }
func (m *mockGameRepo) ListRooms(_ context.Context) ([]*model.Room, error)       { return nil, nil }

// --- mock GamePlayerRepository ---

type mockGamePlayerRepo struct {
	mu      sync.Mutex
	players []*model.GamePlayer
}

func (m *mockGamePlayerRepo) CreateGamePlayer(_ context.Context, gp *model.GamePlayer) error {
	m.mu.Lock()
	defer m.mu.Unlock()
	m.players = append(m.players, gp)
	return nil
}
func (m *mockGamePlayerRepo) GetGamePlayers(_ context.Context, _ string) ([]*model.GamePlayer, error) {
	return nil, nil
}
func (m *mockGamePlayerRepo) UpdateGamePlayer(_ context.Context, _ *model.GamePlayer) error {
	return nil
}

// --- mock GameEventRepository ---

type mockGameEventRepo struct {
	mu     sync.Mutex
	events []*model.GameEvent
}

func (m *mockGameEventRepo) CreateGameEvent(_ context.Context, ev *model.GameEvent) error {
	m.mu.Lock()
	defer m.mu.Unlock()
	m.events = append(m.events, ev)
	return nil
}
func (m *mockGameEventRepo) ListGameEvents(_ context.Context, _ string) ([]*model.GameEvent, error) {
	return nil, nil
}

// --- 헬퍼 ---

func newPersistTestHandler() (*WSHandler, *mockGameRepo, *mockGamePlayerRepo, *mockGameEventRepo) {
	gameStateRepo := repository.NewMemoryGameStateRepo()
	gameSvc := service.NewGameService(gameStateRepo)
	turnSvc := service.NewTurnService(gameStateRepo, gameSvc)
	roomRepo := repository.NewMemoryRoomRepo()
	roomSvc := service.NewRoomService(roomRepo, repository.NewMemoryGameStateRepoAdapter())

	pgGame := &mockGameRepo{}
	pgPlayer := &mockGamePlayerRepo{}
	pgEvent := &mockGameEventRepo{}

	h := &WSHandler{
		hub:              NewHub(zap.NewNop()),
		roomSvc:          roomSvc,
		gameSvc:          gameSvc,
		turnSvc:          turnSvc,
		logger:           zap.NewNop(),
		timers:           make(map[string]*turnTimer),
		graceTimers:      make(map[string]*graceTimer),
		aiTurnCancels:    make(map[string]context.CancelFunc),
		pgGameRepo:       pgGame,
		pgGamePlayerRepo: pgPlayer,
		pgGameEventRepo:  pgEvent,
	}
	return h, pgGame, pgPlayer, pgEvent
}

func makeFinishedState(gameID, winnerUserID string, winnerSeat int) *model.GameStateRedis {
	loserSeat := 1
	if winnerSeat == 1 {
		loserSeat = 0
	}
	players := []model.PlayerState{
		{
			SeatOrder:   winnerSeat,
			UserID:      winnerUserID,
			DisplayName: "Player A",
			PlayerType:  "HUMAN",
			Rack:        []string{}, // 승자: 타일 0장
		},
		{
			SeatOrder:   loserSeat,
			UserID:      "loser-id",
			DisplayName: "Player B",
			PlayerType:  "HUMAN",
			Rack:        []string{"R1a", "B2b", "Y3a"},
		},
	}
	return &model.GameStateRedis{
		GameID:      gameID,
		Status:      model.GameStatusFinished,
		TurnCount:   20,
		Players:     players,
		IsStalemate: false,
	}
}

// TestPersistGameResult_NormalWin 정상 승리 시 games/game_players/game_events 모두 삽입
func TestPersistGameResult_NormalWin(t *testing.T) {
	h, pgGame, pgPlayer, pgEvent := newPersistTestHandler()

	state := makeFinishedState("game-001", "winner-user", 0)
	h.persistGameResult(state, "NORMAL")

	require.Len(t, pgGame.games, 1, "games 테이블 1건 삽입")
	assert.Equal(t, "game-001", pgGame.games[0].ID)
	assert.Equal(t, model.GameStatusFinished, pgGame.games[0].Status)
	require.NotNil(t, pgGame.games[0].WinnerID)
	assert.Equal(t, "winner-user", *pgGame.games[0].WinnerID)
	assert.NotNil(t, pgGame.games[0].EndedAt)

	require.Len(t, pgPlayer.players, 2, "game_players 2건 삽입")
	winnerFound := false
	for _, gp := range pgPlayer.players {
		if gp.IsWinner {
			winnerFound = true
			require.NotNil(t, gp.UserID)
			assert.Equal(t, "winner-user", *gp.UserID)
			finalTiles := 0
			assert.Equal(t, &finalTiles, gp.FinalTiles)
		}
	}
	assert.True(t, winnerFound, "승자 game_player 레코드 존재")

	require.Len(t, pgEvent.events, 1, "game_events 1건 삽입 (GAME_END)")
	assert.Equal(t, model.EventTypeGameEnd, pgEvent.events[0].EventType)
	assert.Equal(t, "game-001", pgEvent.events[0].GameID)
	assert.Contains(t, pgEvent.events[0].Payload, "NORMAL")
}

// TestPersistGameResult_Stalemate 교착 종료 시 endType이 STALEMATE로 덮어씌워짐
func TestPersistGameResult_Stalemate(t *testing.T) {
	h, pgGame, pgPlayer, pgEvent := newPersistTestHandler()

	state := makeFinishedState("game-002", "", 0)
	state.IsStalemate = true
	// 교착 시 랙이 비지 않음
	for i := range state.Players {
		state.Players[i].Rack = []string{"R1a"}
	}

	// endType 인자가 "NORMAL"이어도 IsStalemate=true면 STALEMATE로 덮임
	h.persistGameResult(state, "NORMAL")

	require.Len(t, pgGame.games, 1)
	assert.Nil(t, pgGame.games[0].WinnerID, "교착 시 winner 없음 (타일 동점)")

	require.Len(t, pgPlayer.players, 2)

	require.Len(t, pgEvent.events, 1)
	assert.Contains(t, pgEvent.events[0].Payload, "STALEMATE")
}

// TestPersistGameResult_Forfeit 기권 시 endType FORFEIT이 기록됨
func TestPersistGameResult_Forfeit(t *testing.T) {
	h, pgGame, _, pgEvent := newPersistTestHandler()

	state := makeFinishedState("game-003", "winner-user", 0)

	h.persistGameResult(state, "FORFEIT")

	require.Len(t, pgGame.games, 1)
	require.Len(t, pgEvent.events, 1)
	assert.Contains(t, pgEvent.events[0].Payload, "FORFEIT")
}

// TestPersistGameResult_NilRepos 레포지터리가 nil이면 패닉 없이 조용히 종료
func TestPersistGameResult_NilRepos(t *testing.T) {
	h := &WSHandler{
		logger:           zap.NewNop(),
		pgGameRepo:       nil,
		pgGamePlayerRepo: nil,
		pgGameEventRepo:  nil,
	}

	state := makeFinishedState("game-004", "winner-user", 0)

	assert.NotPanics(t, func() {
		h.persistGameResult(state, "NORMAL")
	})
}

// TestWithPersistenceRepos WithPersistenceRepos setter가 필드에 올바르게 주입하는지 확인
func TestWithPersistenceRepos(t *testing.T) {
	h := &WSHandler{logger: zap.NewNop()}
	pgGame := &mockGameRepo{}
	pgPlayer := &mockGamePlayerRepo{}
	pgEvent := &mockGameEventRepo{}

	h.WithPersistenceRepos(pgGame, pgPlayer, pgEvent)

	assert.Equal(t, pgGame, h.pgGameRepo)
	assert.Equal(t, pgPlayer, h.pgGamePlayerRepo)
	assert.Equal(t, pgEvent, h.pgGameEventRepo)
}

// TestPersistGameResult_AsyncSafe persistGameResult를 고루틴으로 동시 호출해도 race 없음
func TestPersistGameResult_AsyncSafe(t *testing.T) {
	h, pgGame, pgPlayer, pgEvent := newPersistTestHandler()

	var wg sync.WaitGroup
	for i := 0; i < 5; i++ {
		wg.Add(1)
		gameID := fmt.Sprintf("game-%03d", i)
		go func(gid string) {
			defer wg.Done()
			state := makeFinishedState(gid, "winner-user", 0)
			h.persistGameResult(state, "NORMAL")
		}(gameID)
	}
	wg.Wait()

	// 5판: games=5, game_players=10, game_events=5
	pgGame.mu.Lock()
	assert.Len(t, pgGame.games, 5, "5개 게임 records")
	pgGame.mu.Unlock()

	pgPlayer.mu.Lock()
	assert.Len(t, pgPlayer.players, 10, "각 게임당 2명")
	pgPlayer.mu.Unlock()

	pgEvent.mu.Lock()
	assert.Len(t, pgEvent.events, 5, "게임당 GAME_END 1건")
	pgEvent.mu.Unlock()
}
