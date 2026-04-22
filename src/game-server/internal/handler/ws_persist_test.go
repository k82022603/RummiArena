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

// 테스트용 UUID 상수 (RFC 4122 형식)
const (
	testWinnerUUID = "11111111-1111-1111-1111-111111111111"
	testLoserUUID  = "22222222-2222-2222-2222-222222222222"
	// 시스템 센티넬: forfeit/stalemate 무승부 시 game_events.player_id에 사용
	nilUUID = "00000000-0000-0000-0000-000000000000"
)

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
	roomSvc := service.NewRoomService(roomRepo, repository.NewMemoryGameStateRepoAdapter(), nil)

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

// makeFinishedState UUID 기반 플레이어로 정상 종료 상태를 생성한다.
// winnerUserID는 RFC 4122 UUID 형식이어야 game_players.user_id 가 올바르게 저장된다.
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
			UserID:      testLoserUUID,
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

// TestPersistGameResult_NormalWin UUID 승자로 정상 승리 시 games/game_players/game_events 모두 삽입
func TestPersistGameResult_NormalWin(t *testing.T) {
	h, pgGame, pgPlayer, pgEvent := newPersistTestHandler()

	state := makeFinishedState("game-001", testWinnerUUID, 0)
	h.persistGameResult(state, "NORMAL", "")

	require.Len(t, pgGame.games, 1, "games 테이블 1건 삽입")
	assert.Equal(t, "game-001", pgGame.games[0].ID)
	assert.Equal(t, model.GameStatusFinished, pgGame.games[0].Status)
	require.NotNil(t, pgGame.games[0].WinnerID)
	assert.Equal(t, testWinnerUUID, *pgGame.games[0].WinnerID)
	assert.NotNil(t, pgGame.games[0].EndedAt)

	require.Len(t, pgPlayer.players, 2, "game_players 2건 삽입")
	winnerFound := false
	for _, gp := range pgPlayer.players {
		if gp.IsWinner {
			winnerFound = true
			require.NotNil(t, gp.UserID, "UUID 승자는 user_id가 NOT NULL")
			assert.Equal(t, testWinnerUUID, *gp.UserID)
			finalTiles := 0
			assert.Equal(t, &finalTiles, gp.FinalTiles)
		}
	}
	assert.True(t, winnerFound, "승자 game_player 레코드 존재")

	require.Len(t, pgEvent.events, 1, "game_events 1건 삽입 (GAME_END)")
	assert.Equal(t, model.EventTypeGameEnd, pgEvent.events[0].EventType)
	assert.Equal(t, "game-001", pgEvent.events[0].GameID)
	assert.Contains(t, pgEvent.events[0].Payload, "NORMAL")
	// UUID 승자이면 player_id가 해당 UUID여야 함
	assert.Equal(t, testWinnerUUID, pgEvent.events[0].PlayerID)
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
	h.persistGameResult(state, "NORMAL", "")

	require.Len(t, pgGame.games, 1)
	assert.Nil(t, pgGame.games[0].WinnerID, "교착 시 winner 없음 (타일 동점)")

	require.Len(t, pgPlayer.players, 2)

	require.Len(t, pgEvent.events, 1)
	assert.Contains(t, pgEvent.events[0].Payload, "STALEMATE")
	// Bug 2 fix 검증: winnerID 없어도 player_id가 uuid.Nil로 채워져 빈 문자열이 아님
	assert.Equal(t, nilUUID, pgEvent.events[0].PlayerID, "stalemate 무승부 시 player_id는 uuid.Nil")
}

// TestPersistGameResult_Forfeit 기권 시 endType FORFEIT이 기록됨
func TestPersistGameResult_Forfeit(t *testing.T) {
	h, pgGame, _, pgEvent := newPersistTestHandler()

	state := makeFinishedState("game-003", testWinnerUUID, 0)

	h.persistGameResult(state, "FORFEIT", "")

	require.Len(t, pgGame.games, 1)
	require.Len(t, pgEvent.events, 1)
	assert.Contains(t, pgEvent.events[0].Payload, "FORFEIT")
	// FORFEIT 종료에도 UUID 승자가 있으면 player_id는 해당 UUID
	assert.Equal(t, testWinnerUUID, pgEvent.events[0].PlayerID)
}

// TestPersistGameResult_NilRepos 레포지터리가 nil이면 패닉 없이 조용히 종료
func TestPersistGameResult_NilRepos(t *testing.T) {
	h := &WSHandler{
		logger:           zap.NewNop(),
		pgGameRepo:       nil,
		pgGamePlayerRepo: nil,
		pgGameEventRepo:  nil,
	}

	state := makeFinishedState("game-004", testWinnerUUID, 0)

	assert.NotPanics(t, func() {
		h.persistGameResult(state, "NORMAL", "")
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

// ============================================================
// I-15: resolveWinnerFromState 단위 테스트
// ============================================================

// TestResolveWinnerFromState_NormalWin 타일 0장 플레이어 → 정상 승리
func TestResolveWinnerFromState_NormalWin(t *testing.T) {
	state := &model.GameStateRedis{
		Players: []model.PlayerState{
			{SeatOrder: 0, UserID: "loser", Rack: []string{"R1a", "B2b"}},
			{SeatOrder: 1, UserID: "winner", Rack: []string{}},
		},
	}
	wID, wSeat := resolveWinnerFromState(state)
	assert.Equal(t, "winner", wID)
	assert.Equal(t, 1, wSeat)
}

// TestResolveWinnerFromState_Stalemate_MinScore 교착 종료: 점수 낮은 쪽 승리
func TestResolveWinnerFromState_Stalemate_MinScore(t *testing.T) {
	state := &model.GameStateRedis{
		IsStalemate: true,
		Players: []model.PlayerState{
			{SeatOrder: 0, UserID: "player-A", Rack: []string{"R10a", "B10b"}}, // score=20
			{SeatOrder: 1, UserID: "player-B", Rack: []string{"R1a"}},          // score=1
		},
	}
	wID, wSeat := resolveWinnerFromState(state)
	assert.Equal(t, "player-B", wID)
	assert.Equal(t, 1, wSeat)
}

// TestResolveWinnerFromState_Stalemate_Tie 교착 종료: 동점 → 무승부
func TestResolveWinnerFromState_Stalemate_Tie(t *testing.T) {
	state := &model.GameStateRedis{
		IsStalemate: true,
		Players: []model.PlayerState{
			{SeatOrder: 0, UserID: "player-A", Rack: []string{"R5a"}}, // score=5
			{SeatOrder: 1, UserID: "player-B", Rack: []string{"B5b"}}, // score=5
		},
	}
	wID, wSeat := resolveWinnerFromState(state)
	assert.Equal(t, "", wID, "동점이면 무승부 (winnerId 빈 문자열)")
	assert.Equal(t, -1, wSeat)
}

// TestResolveWinnerFromState_NoWinner 승자 없음 (모든 랙 비지 않고 stalemate 아님)
func TestResolveWinnerFromState_NoWinner(t *testing.T) {
	state := &model.GameStateRedis{
		IsStalemate: false,
		Players: []model.PlayerState{
			{SeatOrder: 0, UserID: "player-A", Rack: []string{"R1a"}},
			{SeatOrder: 1, UserID: "player-B", Rack: []string{"B2a"}},
		},
	}
	wID, wSeat := resolveWinnerFromState(state)
	assert.Equal(t, "", wID)
	assert.Equal(t, -1, wSeat)
}

// TestTileScoreFromCode 타일 코드 점수 계산 검증
func TestTileScoreFromCode(t *testing.T) {
	tests := []struct {
		code     string
		expected int
	}{
		{"JK1", 30},
		{"JK2", 30},
		{"R7a", 7},
		{"B13b", 13},
		{"Y1a", 1},
		{"K9b", 9},
		{"", 0},
	}
	for _, tt := range tests {
		t.Run(tt.code, func(t *testing.T) {
			assert.Equal(t, tt.expected, tileScoreFromCode(tt.code))
		})
	}
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
			state := makeFinishedState(gid, testWinnerUUID, 0)
			h.persistGameResult(state, "NORMAL", "")
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

// ============================================================
// I-14 UUID 정규화 버그 수정 회귀 테스트 (QA 실측 버그 2건)
// ============================================================

// TestPersistGameResult_GuestUserID_NullInDB
// Bug 1: 게스트 user_id("qa-테스터-1776838709181" 등 자유 문자열)는
// game_players.user_id(UUID 컬럼)에 NULL로 저장되어야 한다. (SQLSTATE 22P02 방지)
func TestPersistGameResult_GuestUserID_NullInDB(t *testing.T) {
	h, _, pgPlayer, pgEvent := newPersistTestHandler()

	// 게스트 ID: 자유 문자열 (UUID 형식 아님)
	guestID := "qa-테스터-1776838709181"
	state := &model.GameStateRedis{
		GameID:    "game-guest-001",
		TurnCount: 10,
		Players: []model.PlayerState{
			{
				SeatOrder:   0,
				UserID:      guestID, // 비 UUID 게스트 ID — 승자
				DisplayName: "QA Tester",
				PlayerType:  "HUMAN",
				Rack:        []string{}, // 승자: 타일 0장
			},
			{
				SeatOrder:   1,
				UserID:      "ai-bot-0001", // AI도 비 UUID 케이스
				DisplayName: "AI Bot",
				PlayerType:  "AI_OPENAI",
				Rack:        []string{"R1a", "B2b"},
			},
		},
		IsStalemate: false,
	}

	h.persistGameResult(state, "NORMAL", "")

	require.Len(t, pgPlayer.players, 2, "game_players 2건 삽입")
	for _, gp := range pgPlayer.players {
		// 비 UUID ID는 user_id가 NULL이어야 한다 — SQLSTATE 22P02 방지
		assert.Nil(t, gp.UserID, "비 UUID user_id는 game_players.user_id에 NULL로 저장")
	}

	require.Len(t, pgEvent.events, 1)
	// Bug 2 검증: 게스트가 winner여도 player_id에 Nil UUID 사용 (게스트는 UUID 아님)
	assert.Equal(t, nilUUID, pgEvent.events[0].PlayerID,
		"비 UUID 게스트 winner → player_id = uuid.Nil")
}

// TestPersistGameResult_EmptyWinnerID_GameEventUsesNilUUID
// Bug 2: forfeit 종료 시 모든 플레이어가 타일을 가지고 있어 winnerID=""이면
// game_events.player_id(UUID NOT NULL)에 uuid.Nil을 사용해야 한다. (빈 문자열 UUID 변환 실패 방지)
func TestPersistGameResult_EmptyWinnerID_GameEventUsesNilUUID(t *testing.T) {
	h, _, _, pgEvent := newPersistTestHandler()

	// 모든 플레이어 타일 남아있음 + stalemate 아님 → winnerID="" 결정됨
	state := &model.GameStateRedis{
		GameID:    "game-forfeit-001",
		TurnCount: 5,
		Players: []model.PlayerState{
			{
				SeatOrder:  0,
				UserID:     testWinnerUUID,
				PlayerType: "HUMAN",
				Rack:       []string{"R1a"}, // 타일 남아있음
			},
			{
				SeatOrder:  1,
				UserID:     testLoserUUID,
				PlayerType: "HUMAN",
				Rack:       []string{"B2b"}, // 타일 남아있음
				Status:     model.PlayerStatusForfeited,
			},
		},
		IsStalemate: false,
	}

	h.persistGameResult(state, "FORFEIT", "")

	require.Len(t, pgEvent.events, 1)
	playerID := pgEvent.events[0].PlayerID
	assert.NotEmpty(t, playerID, "player_id는 빈 문자열이 아니어야 함 (NOT NULL 컬럼)")
	// 타일 0장 플레이어 없음 → winnerID="" → player_id = uuid.Nil
	assert.Equal(t, nilUUID, playerID,
		"승자 없는 FORFEIT 종료 시 player_id = uuid.Nil (00000000-...)")
}

// TestPersistGameResult_MixedPlayers_UUIDAndGuest
// UUID 사용자(OAuth)와 게스트 ID가 혼재할 때 각각 올바르게 처리됨
func TestPersistGameResult_MixedPlayers_UUIDAndGuest(t *testing.T) {
	h, _, pgPlayer, pgEvent := newPersistTestHandler()

	state := &model.GameStateRedis{
		GameID:    "game-mixed-001",
		TurnCount: 15,
		Players: []model.PlayerState{
			{
				SeatOrder:   0,
				UserID:      testWinnerUUID, // OAuth 로그인 사용자 — UUID
				DisplayName: "OAuth User",
				PlayerType:  "HUMAN",
				Rack:        []string{}, // 승자
			},
			{
				SeatOrder:   1,
				UserID:      "guest-anonymous-9999", // 게스트 — 자유 문자열
				DisplayName: "Guest",
				PlayerType:  "HUMAN",
				Rack:        []string{"R5a", "B6b"},
			},
		},
		IsStalemate: false,
	}

	h.persistGameResult(state, "NORMAL", "")

	require.Len(t, pgPlayer.players, 2)
	for _, gp := range pgPlayer.players {
		if gp.IsWinner {
			// OAuth 사용자(UUID)는 user_id 보존
			require.NotNil(t, gp.UserID, "OAuth UUID 승자는 user_id NOT NULL")
			assert.Equal(t, testWinnerUUID, *gp.UserID)
		} else {
			// 게스트는 user_id = NULL
			assert.Nil(t, gp.UserID, "게스트는 user_id = NULL")
		}
	}

	// 승자가 UUID이므로 player_id도 UUID
	require.Len(t, pgEvent.events, 1)
	assert.Equal(t, testWinnerUUID, pgEvent.events[0].PlayerID)
}

// TestIsValidUUID isValidUUID 헬퍼 단위 테스트
func TestIsValidUUID(t *testing.T) {
	tests := []struct {
		input    string
		expected bool
	}{
		{"11111111-1111-1111-1111-111111111111", true},
		{"00000000-0000-0000-0000-000000000000", true},
		{"550e8400-e29b-41d4-a716-446655440000", true},
		{"", false},
		{"winner-user", false},
		{"qa-테스터-1776838709181", false},
		{"guest-anonymous-9999", false},
		{"not-a-uuid", false},
		{"12345678-1234-1234-1234-12345678901", false}, // 짧음
	}
	for _, tt := range tests {
		t.Run(tt.input, func(t *testing.T) {
			assert.Equal(t, tt.expected, isValidUUID(tt.input))
		})
	}
}
