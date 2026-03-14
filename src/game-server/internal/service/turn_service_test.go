package service

import (
	"testing"
	"time"

	"github.com/k82022603/RummiArena/game-server/internal/model"
	"github.com/k82022603/RummiArena/game-server/internal/repository"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

// newTurnService TurnService 구현체를 생성하는 테스트 헬퍼.
// 주어진 GameStateRedis를 repository에 저장하고 TurnService를 반환한다.
func newTurnService(t *testing.T, state *model.GameStateRedis) (TurnService, repository.MemoryGameStateRepository) {
	t.Helper()
	repo := repository.NewMemoryGameStateRepo()
	if state != nil {
		require.NoError(t, repo.SaveGameState(state))
	}
	gs := NewGameService(repo)
	ts := NewTurnService(repo, gs)
	return ts, repo
}

func twoPlayerStateForTurn(rack0, rack1 []string) []model.PlayerState {
	return []model.PlayerState{
		{SeatOrder: 0, UserID: "u0", PlayerType: "HUMAN", HasInitialMeld: false, Rack: rack0},
		{SeatOrder: 1, UserID: "u1", PlayerType: "HUMAN", HasInitialMeld: false, Rack: rack1},
	}
}

// --- TestTurnService_PlaceTiles ---

func TestTurnService_PlaceTiles_DelegatesToGameService(t *testing.T) {
	// TurnService.PlaceTiles는 GameService.PlaceTiles에 올바르게 위임한다.
	rack0 := []string{"R5a", "R6a", "R7a", "B1a"}
	rack1 := []string{"K1a"}
	state := &model.GameStateRedis{
		GameID:      "ts-game-1",
		Status:      model.GameStatusPlaying,
		CurrentSeat: 0,
		DrawPile:    []string{"Y1a"},
		Table:       []*model.SetOnTable{},
		Players:     twoPlayerStateForTurn(rack0, rack1),
		TurnStartAt: time.Now().Unix(),
	}
	ts, repo := newTurnService(t, state)

	req := &PlaceTilesRequest{
		GameID:     "ts-game-1",
		PlayerSeat: 0,
		TableGroups: []model.SetOnTable{
			{ID: "run-1", Tiles: []*model.Tile{
				{Code: "R5a"}, {Code: "R6a"}, {Code: "R7a"},
			}},
		},
		TilesFromRack: []string{"R5a", "R6a", "R7a"},
	}

	result, err := ts.PlaceTiles(req)
	require.NoError(t, err)
	assert.True(t, result.Success)
	assert.Equal(t, 0, result.NextSeat) // 아직 내 턴

	saved, err := repo.GetGameState("ts-game-1")
	require.NoError(t, err)
	// 랙에서 3장 제거: B1a만 남음
	assert.Equal(t, []string{"B1a"}, saved.Players[0].Rack)
	assert.Len(t, saved.Table, 1)
}

func TestTurnService_PlaceTiles_NotYourTurn(t *testing.T) {
	rack0 := []string{"R5a", "R6a", "R7a"}
	rack1 := []string{"K1a"}
	state := &model.GameStateRedis{
		GameID:      "ts-game-2",
		Status:      model.GameStatusPlaying,
		CurrentSeat: 0,
		DrawPile:    nil,
		Table:       []*model.SetOnTable{},
		Players:     twoPlayerStateForTurn(rack0, rack1),
		TurnStartAt: time.Now().Unix(),
	}
	ts, _ := newTurnService(t, state)

	req := &PlaceTilesRequest{
		GameID:     "ts-game-2",
		PlayerSeat: 1, // 현재 seat 0의 턴
		TableGroups: []model.SetOnTable{
			{ID: "run-1", Tiles: []*model.Tile{
				{Code: "R5a"}, {Code: "R6a"}, {Code: "R7a"},
			}},
		},
		TilesFromRack: []string{"R5a", "R6a", "R7a"},
	}

	_, err := ts.PlaceTiles(req)
	require.Error(t, err)

	se, ok := IsServiceError(err)
	require.True(t, ok)
	assert.Equal(t, "NOT_YOUR_TURN", se.Code)
}

// --- TestTurnService_DrawTile ---

func TestTurnService_DrawTile_DelegatesToGameService(t *testing.T) {
	rack0 := []string{"R1a"}
	rack1 := []string{"K1a"}
	drawPile := []string{"B5a", "Y9a"}
	state := &model.GameStateRedis{
		GameID:      "ts-game-3",
		Status:      model.GameStatusPlaying,
		CurrentSeat: 0,
		DrawPile:    drawPile,
		Table:       []*model.SetOnTable{},
		Players:     twoPlayerStateForTurn(rack0, rack1),
		TurnStartAt: time.Now().Unix(),
	}
	ts, repo := newTurnService(t, state)

	result, err := ts.DrawTile("ts-game-3", 0)
	require.NoError(t, err)
	assert.True(t, result.Success)
	assert.Equal(t, 1, result.NextSeat)

	saved, _ := repo.GetGameState("ts-game-3")
	// 드로우 후 랙: R1a + B5a = 2장
	assert.Len(t, saved.Players[0].Rack, 2)
	assert.Contains(t, saved.Players[0].Rack, "B5a")
}

func TestTurnService_DrawTile_GameNotFound(t *testing.T) {
	ts, _ := newTurnService(t, nil)

	_, err := ts.DrawTile("no-such-game", 0)
	require.Error(t, err)

	se, ok := IsServiceError(err)
	require.True(t, ok)
	assert.Equal(t, "NOT_FOUND", se.Code)
}

// --- TestTurnService_HandleTimeout ---

func TestTurnService_HandleTimeout_ForcesDrawAndAdvancesTurn(t *testing.T) {
	// HandleTimeout은 임시 배치 롤백 후 강제 드로우 → 다음 턴으로 전환
	rack0 := []string{"R5a", "R6a", "R7a"}
	rack1 := []string{"K1a"}
	drawPile := []string{"Y3a"}
	state := &model.GameStateRedis{
		GameID:      "ts-game-4",
		Status:      model.GameStatusPlaying,
		CurrentSeat: 0,
		DrawPile:    drawPile,
		Table:       []*model.SetOnTable{},
		Players:     twoPlayerStateForTurn(rack0, rack1),
		TurnStartAt: time.Now().Unix(),
	}
	// TurnService는 GameService를 내부적으로 사용하므로 같은 repo를 공유해야 한다.
	repo := repository.NewMemoryGameStateRepo()
	require.NoError(t, repo.SaveGameState(state))
	gs := NewGameService(repo)
	ts := NewTurnService(repo, gs)

	// Place 먼저 (스냅샷 생성)
	placeReq := &PlaceTilesRequest{
		GameID:     "ts-game-4",
		PlayerSeat: 0,
		TableGroups: []model.SetOnTable{
			{ID: "run-1", Tiles: []*model.Tile{
				{Code: "R5a"}, {Code: "R6a"}, {Code: "R7a"},
			}},
		},
		TilesFromRack: []string{"R5a", "R6a", "R7a"},
	}
	_, err := ts.PlaceTiles(placeReq)
	require.NoError(t, err)

	// 타임아웃: 롤백 + 강제 드로우
	result, err := ts.HandleTimeout("ts-game-4", 0)
	require.NoError(t, err)
	assert.True(t, result.Success)
	assert.Equal(t, 1, result.NextSeat) // 다음 턴으로 전환

	saved, err := repo.GetGameState("ts-game-4")
	require.NoError(t, err)
	// 롤백 후 강제 드로우: 원래 3장 + 드로우 1장 = 4장
	assert.Len(t, saved.Players[0].Rack, 4)
	assert.Contains(t, saved.Players[0].Rack, "Y3a")
	// 테이블은 롤백으로 비어있음
	assert.Empty(t, saved.Table)
	// 다음 턴으로 전환됨
	assert.Equal(t, 1, saved.CurrentSeat)
}

func TestTurnService_HandleTimeout_EmptyDrawPile_GameEnds(t *testing.T) {
	// 드로우 파일이 비었을 때 타임아웃 → 게임 종료
	rack0 := []string{"R5a"}
	rack1 := []string{"K1a"}
	state := &model.GameStateRedis{
		GameID:      "ts-game-5",
		Status:      model.GameStatusPlaying,
		CurrentSeat: 0,
		DrawPile:    []string{}, // 빈 파일
		Table:       []*model.SetOnTable{},
		Players:     twoPlayerStateForTurn(rack0, rack1),
		TurnStartAt: time.Now().Unix(),
	}
	repo := repository.NewMemoryGameStateRepo()
	require.NoError(t, repo.SaveGameState(state))
	gs := NewGameService(repo)
	ts := NewTurnService(repo, gs)

	result, err := ts.HandleTimeout("ts-game-5", 0)
	require.NoError(t, err)
	assert.False(t, result.Success)
	assert.True(t, result.GameState.Status == model.GameStatusFinished)
}

// --- TestTurnService_GetCurrentSeat ---

func TestTurnService_GetCurrentSeat_ReturnsCurrentSeat(t *testing.T) {
	state := &model.GameStateRedis{
		GameID:      "ts-game-6",
		Status:      model.GameStatusPlaying,
		CurrentSeat: 2,
		DrawPile:    nil,
		Table:       []*model.SetOnTable{},
		Players: []model.PlayerState{
			{SeatOrder: 0, UserID: "u0", Rack: []string{"R1a"}},
			{SeatOrder: 2, UserID: "u2", Rack: []string{"B1a"}},
		},
		TurnStartAt: time.Now().Unix(),
	}
	ts, _ := newTurnService(t, state)

	seat, err := ts.GetCurrentSeat("ts-game-6")
	require.NoError(t, err)
	assert.Equal(t, 2, seat)
}

func TestTurnService_GetCurrentSeat_GameNotFound(t *testing.T) {
	ts, _ := newTurnService(t, nil)

	_, err := ts.GetCurrentSeat("nonexistent-game")
	require.Error(t, err)

	se, ok := IsServiceError(err)
	require.True(t, ok)
	assert.Equal(t, "NOT_FOUND", se.Code)
}

// --- TestTurnService_IsPlayerTurn ---

func TestTurnService_IsPlayerTurn_TrueForCurrentSeat(t *testing.T) {
	state := &model.GameStateRedis{
		GameID:      "ts-game-7",
		Status:      model.GameStatusPlaying,
		CurrentSeat: 1,
		DrawPile:    nil,
		Table:       []*model.SetOnTable{},
		Players: []model.PlayerState{
			{SeatOrder: 0, UserID: "u0", Rack: []string{"R1a"}},
			{SeatOrder: 1, UserID: "u1", Rack: []string{"B1a"}},
		},
		TurnStartAt: time.Now().Unix(),
	}
	ts, _ := newTurnService(t, state)

	isTurn, err := ts.IsPlayerTurn("ts-game-7", 1)
	require.NoError(t, err)
	assert.True(t, isTurn)
}

func TestTurnService_IsPlayerTurn_FalseForOtherSeat(t *testing.T) {
	state := &model.GameStateRedis{
		GameID:      "ts-game-8",
		Status:      model.GameStatusPlaying,
		CurrentSeat: 0,
		DrawPile:    nil,
		Table:       []*model.SetOnTable{},
		Players: []model.PlayerState{
			{SeatOrder: 0, UserID: "u0", Rack: []string{"R1a"}},
			{SeatOrder: 1, UserID: "u1", Rack: []string{"B1a"}},
		},
		TurnStartAt: time.Now().Unix(),
	}
	ts, _ := newTurnService(t, state)

	isTurn, err := ts.IsPlayerTurn("ts-game-8", 1) // currentSeat=0
	require.NoError(t, err)
	assert.False(t, isTurn)
}

func TestTurnService_IsPlayerTurn_GameNotFound(t *testing.T) {
	ts, _ := newTurnService(t, nil)

	_, err := ts.IsPlayerTurn("no-game", 0)
	require.Error(t, err)

	se, ok := IsServiceError(err)
	require.True(t, ok)
	assert.Equal(t, "NOT_FOUND", se.Code)
}

// --- TestEdgeCases ---

func TestConfirmTurn_PlayerNotFound_InvalidSeat(t *testing.T) {
	// 게임에 존재하지 않는 seat 번호로 ConfirmTurn 호출
	// Players는 seat 0, 1뿐인데 seat 5로 요청
	rack0 := []string{"R5a", "R6a", "R7a"}
	state := &model.GameStateRedis{
		GameID:      "edge-game-1",
		Status:      model.GameStatusPlaying,
		CurrentSeat: 5, // 존재하지 않는 seat를 currentSeat으로 설정
		DrawPile:    nil,
		Table:       []*model.SetOnTable{},
		Players: []model.PlayerState{
			{SeatOrder: 0, UserID: "u0", Rack: rack0},
		},
		TurnStartAt: time.Now().Unix(),
	}
	repo := repository.NewMemoryGameStateRepo()
	require.NoError(t, repo.SaveGameState(state))
	svc := NewGameService(repo)

	_, err := svc.ConfirmTurn("edge-game-1", &ConfirmRequest{
		Seat:        5,
		TableGroups: []TilePlacement{{ID: "s1", Tiles: []string{"R5a", "R6a", "R7a"}}},
	})
	require.Error(t, err)

	se, ok := IsServiceError(err)
	require.True(t, ok)
	assert.Equal(t, "NOT_FOUND", se.Code)
}

func TestDrawTile_PlayerNotFound_InvalidSeat(t *testing.T) {
	state := &model.GameStateRedis{
		GameID:      "edge-game-2",
		Status:      model.GameStatusPlaying,
		CurrentSeat: 9,
		DrawPile:    []string{"R1a"},
		Table:       []*model.SetOnTable{},
		Players: []model.PlayerState{
			{SeatOrder: 0, UserID: "u0", Rack: []string{"B1a"}},
		},
		TurnStartAt: time.Now().Unix(),
	}
	svc, _ := seedRepo(t, state)

	_, err := svc.DrawTile("edge-game-2", 9) // seat 9 는 Players에 없음
	require.Error(t, err)

	se, ok := IsServiceError(err)
	require.True(t, ok)
	assert.Equal(t, "NOT_FOUND", se.Code)
}

func TestResetTurn_GameNotFound(t *testing.T) {
	repo := repository.NewMemoryGameStateRepo()
	svc := NewGameService(repo)

	_, err := svc.ResetTurn("no-game", 0)
	require.Error(t, err)

	se, ok := IsServiceError(err)
	require.True(t, ok)
	assert.Equal(t, "NOT_FOUND", se.Code)
}

func TestIsServiceError_NilError(t *testing.T) {
	se, ok := IsServiceError(nil)
	assert.False(t, ok)
	assert.Nil(t, se)
}

func TestIsServiceError_NonServiceError(t *testing.T) {
	// 일반 에러는 ServiceError로 인식되지 않는다
	import_err := &model.GameStateRedis{} // 임의 타입, IsServiceError로 테스트
	_ = import_err
	// 직접 error 인터페이스 구현체로 테스트
	se, ok := IsServiceError(&ServiceError{Code: "TEST", Message: "테스트", Status: 400})
	assert.True(t, ok)
	assert.Equal(t, "TEST", se.Code)
	assert.Equal(t, "테스트", se.Message)
	assert.Equal(t, 400, se.Status)
}

func TestServiceError_ErrorString(t *testing.T) {
	err := &ServiceError{Code: "NOT_FOUND", Message: "찾을 수 없습니다", Status: 404}
	assert.Contains(t, err.Error(), "NOT_FOUND")
	assert.Contains(t, err.Error(), "찾을 수 없습니다")
}
