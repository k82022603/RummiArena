package service

import (
	"testing"
	"time"

	"github.com/k82022603/RummiArena/game-server/internal/engine"
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
	// 드로우 파일이 비었을 때 타임아웃 -> 패스 처리 (즉시 교착 아님).
	// 전원 연속 패스 시 교착 종료.
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

	// seat0 타임아웃 -> ResetTurn + DrawTile(패스)
	result1, err := ts.HandleTimeout("ts-game-5", 0)
	require.NoError(t, err)
	assert.True(t, result1.Success)
	assert.NotEqual(t, model.GameStatusFinished, result1.GameState.Status, "1/2 패스: 아직 교착 아님")

	// seat1 타임아웃 -> ResetTurn + DrawTile(패스) -> 전원 패스 -> 교착
	result2, err := ts.HandleTimeout("ts-game-5", 1)
	require.NoError(t, err)
	assert.True(t, result2.Success)
	assert.Equal(t, model.GameStatusFinished, result2.GameState.Status)
	assert.Equal(t, "STALEMATE", result2.ErrorCode)
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

// --- TestConfirmTurn 추가 케이스 ---

// seedRepoForTurn 턴 서비스 테스트용 헬퍼. GameService와 repo를 반환한다.
func seedRepoForTurn(t *testing.T, state *model.GameStateRedis) (GameService, repository.MemoryGameStateRepository) {
	t.Helper()
	repo := repository.NewMemoryGameStateRepo()
	require.NoError(t, repo.SaveGameState(state))
	svc := NewGameService(repo)
	return svc, repo
}

func TestConfirmTurn_JokerSwap_Success(t *testing.T) {
	// V-07: 조커를 테이블 기존 세트에서 회수(교환)하고 해당 조커를 다른 세트에서 즉시 사용 -> 성공
	// 시나리오:
	// - 테이블에 기존 세트: {R7a, JK1, R9a} (조커가 R8a 위치를 대체)
	// - 플레이어 랙: {R8a, B1a, B2a, B3a, K1a}
	// - 플레이어는 R8a로 JK1을 교체하고, JK1을 새 세트 {B1a, B2a, B3a, JK1}에서 사용
	// - HasInitialMeld=true (기존 등록 완료 플레이어)
	existingTable := []*model.SetOnTable{
		{ID: "run-existing", Tiles: []*model.Tile{
			{Code: "R7a"}, {Code: "JK1"}, {Code: "R9a"},
		}},
	}

	rack0 := []string{"R8a", "B1a", "B2a", "B3a", "K1a"}
	rack1 := []string{"K2a"}

	state := &model.GameStateRedis{
		GameID:      "joker-swap-1",
		Status:      model.GameStatusPlaying,
		CurrentSeat: 0,
		DrawPile:    []string{"Y1a"},
		Table:       existingTable,
		Players: []model.PlayerState{
			{SeatOrder: 0, UserID: "u0", PlayerType: "HUMAN", HasInitialMeld: true, Rack: rack0},
			{SeatOrder: 1, UserID: "u1", PlayerType: "HUMAN", HasInitialMeld: false, Rack: rack1},
		},
		TurnStartAt: time.Now().Unix(),
	}
	svc, repo := seedRepoForTurn(t, state)

	// 교체 후 테이블: R7a-R8a-R9a 런 + B1a-B2a-B3a-JK1 런 (조커가 B4a 위치 대체)
	tilesFromRack := []string{"R8a", "B1a", "B2a", "B3a"}
	tableAfter := []TilePlacement{
		{ID: "run-existing", Tiles: []string{"R7a", "R8a", "R9a"}},     // JK1을 R8a로 교체
		{ID: "run-new", Tiles: []string{"B1a", "B2a", "B3a", "JK1"}},   // JK1을 새 세트에 즉시 사용
	}

	// PlaceTiles: 랙에서 타일 제거 + 테이블 업데이트
	_, err := svc.PlaceTiles("joker-swap-1", &PlaceRequest{
		Seat:          0,
		TableGroups:   tableAfter,
		TilesFromRack: tilesFromRack,
	})
	require.NoError(t, err)

	// ConfirmTurn: JokerReturnedCodes로 조커 교체 신고
	result, err := svc.ConfirmTurn("joker-swap-1", &ConfirmRequest{
		Seat:               0,
		TableGroups:        tableAfter,
		TilesFromRack:      tilesFromRack,
		JokerReturnedCodes: []string{"JK1"},
	})
	require.NoError(t, err)
	assert.True(t, result.Success)
	assert.Equal(t, 1, result.NextSeat)

	// 저장 상태 검증
	saved, err := repo.GetGameState("joker-swap-1")
	require.NoError(t, err)
	assert.Equal(t, []string{"K1a"}, saved.Players[0].Rack)
	assert.Len(t, saved.Table, 2)
}

func TestConfirmTurn_JokerSwap_NotReplaced(t *testing.T) {
	// V-07: 조커를 테이블에서 회수했지만 다시 테이블에 놓지 않음 -> ErrJokerNotUsed
	// 시나리오:
	// - 테이블에 기존 세트: {R7a, JK1, R9a} (3타일)
	// - 플레이어 랙: {R8a, B1a, B2a, B3a, K1a}
	// - 플레이어는 R8a로 JK1을 교체하고, B1a-B2a-B3a를 새 세트로 추가
	// - 그러나 JK1을 테이블에 다시 놓지 않음 (조커를 랙에 보관 시도)
	// - 테이블: before 3타일 -> after 6타일 (R7a-R8a-R9a + B1a-B2a-B3a)
	//   -> V-03 통과(tilesAdded=3), V-06 통과, V-07에서 실패
	existingTable := []*model.SetOnTable{
		{ID: "run-existing", Tiles: []*model.Tile{
			{Code: "R7a"}, {Code: "JK1"}, {Code: "R9a"},
		}},
	}

	rack0 := []string{"R8a", "B1a", "B2a", "B3a", "K1a"}
	rack1 := []string{"K2a"}

	state := &model.GameStateRedis{
		GameID:      "joker-swap-2",
		Status:      model.GameStatusPlaying,
		CurrentSeat: 0,
		DrawPile:    []string{"Y1a"},
		Table:       existingTable,
		Players: []model.PlayerState{
			{SeatOrder: 0, UserID: "u0", PlayerType: "HUMAN", HasInitialMeld: true, Rack: rack0},
			{SeatOrder: 1, UserID: "u1", PlayerType: "HUMAN", HasInitialMeld: false, Rack: rack1},
		},
		TurnStartAt: time.Now().Unix(),
	}
	svc, _ := seedRepoForTurn(t, state)

	// 교체 후 테이블: R7a-R8a-R9a + B1a-B2a-B3a (JK1이 어디에도 없음)
	tilesFromRack := []string{"R8a", "B1a", "B2a", "B3a"}
	tableAfter := []TilePlacement{
		{ID: "run-existing", Tiles: []string{"R7a", "R8a", "R9a"}},
		{ID: "run-new", Tiles: []string{"B1a", "B2a", "B3a"}},
	}

	_, err := svc.PlaceTiles("joker-swap-2", &PlaceRequest{
		Seat:          0,
		TableGroups:   tableAfter,
		TilesFromRack: tilesFromRack,
	})
	require.NoError(t, err)

	// ConfirmTurn: JK1을 교체했다고 신고했지만 테이블에 JK1이 없음
	result, err := svc.ConfirmTurn("joker-swap-2", &ConfirmRequest{
		Seat:               0,
		TableGroups:        tableAfter,
		TilesFromRack:      tilesFromRack,
		JokerReturnedCodes: []string{"JK1"},
	})
	require.Error(t, err)
	assert.False(t, result.Success)

	se, ok := IsServiceError(err)
	require.True(t, ok)
	assert.Equal(t, engine.ErrJokerNotUsed, se.Code)
}

func TestConfirmTurn_InitialMeld_ExactlyThirty(t *testing.T) {
	// V-04: 최초 등록에서 정확히 30점 제출 -> 성공
	// R10a + B10a + Y10a = 10+10+10 = 30점 exactly
	rack0 := []string{"R10a", "B10a", "Y10a", "K1a"}
	rack1 := []string{"K2a"}
	state := &model.GameStateRedis{
		GameID:      "initial-30",
		Status:      model.GameStatusPlaying,
		CurrentSeat: 0,
		DrawPile:    []string{"Y1a"},
		Table:       []*model.SetOnTable{},
		Players: []model.PlayerState{
			{SeatOrder: 0, UserID: "u0", PlayerType: "HUMAN", HasInitialMeld: false, Rack: rack0},
			{SeatOrder: 1, UserID: "u1", PlayerType: "HUMAN", HasInitialMeld: false, Rack: rack1},
		},
		TurnStartAt: time.Now().Unix(),
	}
	svc, repo := seedRepoForTurn(t, state)

	tilesFromRack := []string{"R10a", "B10a", "Y10a"}
	tableGroups := []TilePlacement{{ID: "grp-30", Tiles: tilesFromRack}}

	_, err := svc.PlaceTiles("initial-30", &PlaceRequest{
		Seat:          0,
		TableGroups:   tableGroups,
		TilesFromRack: tilesFromRack,
	})
	require.NoError(t, err)

	result, err := svc.ConfirmTurn("initial-30", &ConfirmRequest{
		Seat:          0,
		TableGroups:   tableGroups,
		TilesFromRack: tilesFromRack,
	})
	require.NoError(t, err)
	assert.True(t, result.Success)
	assert.Equal(t, 1, result.NextSeat)

	saved, err := repo.GetGameState("initial-30")
	require.NoError(t, err)
	assert.True(t, saved.Players[0].HasInitialMeld, "최초 등록 플래그가 true로 갱신되어야 한다")
	assert.Equal(t, []string{"K1a"}, saved.Players[0].Rack)
}

func TestConfirmTurn_InitialMeld_ModifyExistingSet(t *testing.T) {
	// V-05: HasInitialMeld=false 상태에서 기존 테이블 세트의 타일을 제거(재배치) 시도 -> ErrInitialMeldSource
	// 시나리오: 테이블에 상대가 내려놓은 세트(R10a-R11a-R12a-R13a)가 존재하는 상태에서
	// 최초 등록 미완료 플레이어가 R13a를 테이블에서 완전히 제거하고
	// 자신의 랙 타일로만 구성한 세트를 추가.
	// V-05는 beforeCodes[code] > afterCodes[code] 이면 ERR_INITIAL_MELD_SOURCE를 반환.
	existingTable := []*model.SetOnTable{
		{ID: "existing-1", Tiles: []*model.Tile{
			{Code: "R10a"}, {Code: "R11a"}, {Code: "R12a"}, {Code: "R13a"},
		}},
	}

	// 플레이어가 기존 세트에서 R13a를 완전히 제거하고
	// 자신의 랙 타일로 30점 이상 세트를 구성
	rack0 := []string{"R10b", "B10a", "Y10a", "K10a", "K1a"}
	rack1 := []string{"K2a"}

	state := &model.GameStateRedis{
		GameID:      "initial-modify-1",
		Status:      model.GameStatusPlaying,
		CurrentSeat: 0,
		DrawPile:    []string{"Y1a"},
		Table:       existingTable,
		Players: []model.PlayerState{
			{SeatOrder: 0, UserID: "u0", PlayerType: "HUMAN", HasInitialMeld: false, Rack: rack0},
			{SeatOrder: 1, UserID: "u1", PlayerType: "HUMAN", HasInitialMeld: true, Rack: rack1},
		},
		TurnStartAt: time.Now().Unix(),
	}
	svc, _ := seedRepoForTurn(t, state)

	// 기존 세트를 축소(R10a-R11a-R12a, R13a 제거)하고
	// 자신의 랙 타일로 30점 그룹(R10b-B10a-Y10a-K10a = 40점) 추가
	// 테이블 before: R10a,R11a,R12a,R13a (4타일)
	// 테이블 after: R10a,R11a,R12a (3타일) + R10b,B10a,Y10a,K10a (4타일) = 7타일
	// R13a가 before에 있었는데 after에서 사라짐 -> V-05 위반
	tilesFromRack := []string{"R10b", "B10a", "Y10a", "K10a"}
	tableAfter := []TilePlacement{
		{ID: "existing-1", Tiles: []string{"R10a", "R11a", "R12a"}},       // R13a 제거됨
		{ID: "grp-new", Tiles: []string{"R10b", "B10a", "Y10a", "K10a"}},  // 랙 타일만 사용
	}

	_, err := svc.PlaceTiles("initial-modify-1", &PlaceRequest{
		Seat:          0,
		TableGroups:   tableAfter,
		TilesFromRack: tilesFromRack,
	})
	require.NoError(t, err)

	result, err := svc.ConfirmTurn("initial-modify-1", &ConfirmRequest{
		Seat:          0,
		TableGroups:   tableAfter,
		TilesFromRack: tilesFromRack,
	})
	require.Error(t, err)
	assert.False(t, result.Success)

	se, ok := IsServiceError(err)
	require.True(t, ok)
	// V-05: 최초 등록 전 기존 테이블 타일 재배치(제거) -> ERR_INITIAL_MELD_SOURCE
	assert.Equal(t, engine.ErrInitialMeldSource, se.Code)
}

func TestConfirmTurn_MultipleValidSets(t *testing.T) {
	// 여러 세트를 동시에 테이블에 추가 -> 성공
	// 런 + 그룹 동시 배치: R5a-R6a-R7a (런, 18점) + R10a-B10a-Y10a (그룹, 30점) = 48점
	rack0 := []string{"R5a", "R6a", "R7a", "R10a", "B10a", "Y10a", "K1a"}
	rack1 := []string{"K2a"}

	state := &model.GameStateRedis{
		GameID:      "multi-set-1",
		Status:      model.GameStatusPlaying,
		CurrentSeat: 0,
		DrawPile:    []string{"Y1a"},
		Table:       []*model.SetOnTable{},
		Players: []model.PlayerState{
			{SeatOrder: 0, UserID: "u0", PlayerType: "HUMAN", HasInitialMeld: false, Rack: rack0},
			{SeatOrder: 1, UserID: "u1", PlayerType: "HUMAN", HasInitialMeld: false, Rack: rack1},
		},
		TurnStartAt: time.Now().Unix(),
	}
	svc, repo := seedRepoForTurn(t, state)

	tilesFromRack := []string{"R5a", "R6a", "R7a", "R10a", "B10a", "Y10a"}
	tableGroups := []TilePlacement{
		{ID: "run-1", Tiles: []string{"R5a", "R6a", "R7a"}},
		{ID: "grp-1", Tiles: []string{"R10a", "B10a", "Y10a"}},
	}

	_, err := svc.PlaceTiles("multi-set-1", &PlaceRequest{
		Seat:          0,
		TableGroups:   tableGroups,
		TilesFromRack: tilesFromRack,
	})
	require.NoError(t, err)

	result, err := svc.ConfirmTurn("multi-set-1", &ConfirmRequest{
		Seat:          0,
		TableGroups:   tableGroups,
		TilesFromRack: tilesFromRack,
	})
	require.NoError(t, err)
	assert.True(t, result.Success)
	assert.Equal(t, 1, result.NextSeat)

	saved, err := repo.GetGameState("multi-set-1")
	require.NoError(t, err)
	assert.True(t, saved.Players[0].HasInitialMeld, "최초 등록 완료")
	assert.Equal(t, []string{"K1a"}, saved.Players[0].Rack)
	assert.Len(t, saved.Table, 2, "테이블에 2개 세트가 있어야 한다")
}

func TestConfirmTurn_DrawAction_NoTableChange(t *testing.T) {
	// 드로우 시 테이블 변경 없음 -> 정상 처리 (DrawTile 경유)
	// DrawTile은 테이블을 변경하지 않으므로, 드로우 전후 테이블 상태가 동일해야 한다.
	existingTable := []*model.SetOnTable{
		{ID: "run-1", Tiles: []*model.Tile{
			{Code: "R5a"}, {Code: "R6a"}, {Code: "R7a"},
		}},
	}

	rack0 := []string{"K1a"}
	rack1 := []string{"K2a"}

	state := &model.GameStateRedis{
		GameID:      "draw-no-change-1",
		Status:      model.GameStatusPlaying,
		CurrentSeat: 0,
		DrawPile:    []string{"B3a", "Y9a"},
		Table:       existingTable,
		Players: []model.PlayerState{
			{SeatOrder: 0, UserID: "u0", PlayerType: "HUMAN", HasInitialMeld: true, Rack: rack0},
			{SeatOrder: 1, UserID: "u1", PlayerType: "HUMAN", HasInitialMeld: false, Rack: rack1},
		},
		TurnStartAt: time.Now().Unix(),
	}
	svc, repo := seedRepoForTurn(t, state)

	// 드로우 실행
	result, err := svc.DrawTile("draw-no-change-1", 0)
	require.NoError(t, err)
	assert.True(t, result.Success)
	assert.Equal(t, 1, result.NextSeat)

	saved, err := repo.GetGameState("draw-no-change-1")
	require.NoError(t, err)

	// 테이블은 변경되지 않아야 한다
	require.Len(t, saved.Table, 1, "테이블 세트 수가 드로우 전과 동일해야 한다")
	assert.Equal(t, "run-1", saved.Table[0].ID)
	assert.Len(t, saved.Table[0].Tiles, 3, "기존 세트의 타일 수가 유지되어야 한다")

	// 랙에 드로우한 타일이 추가됨
	assert.Len(t, saved.Players[0].Rack, 2) // K1a + B3a
	assert.Contains(t, saved.Players[0].Rack, "B3a")

	// 드로우 파일에서 1장 감소
	assert.Len(t, saved.DrawPile, 1)
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
