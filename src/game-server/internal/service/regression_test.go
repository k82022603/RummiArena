package service

import (
	"fmt"
	"testing"
	"time"

	"github.com/k82022603/RummiArena/game-server/internal/engine"
	"github.com/k82022603/RummiArena/game-server/internal/model"
	"github.com/k82022603/RummiArena/game-server/internal/repository"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

// ============================================================================
// Regression 테스트 — 2026-04-02 버그 수정 사항 검증
//
// 수정 내용:
// 1. INVALID_MOVE 시 서버 자동 스냅샷 복원 (restoreSnapshot)
// 2. TURN_END에 myRack 포함하여 서버-클라이언트 랙 동기화
// 3. PlaceTiles tilesFromRack<->tableGroups 보전 검증
// 4. Universe Conservation (validateTileConservation)
// 5. JokerReturnedCodes V-07 활성화
// ============================================================================

const totalTiles = 106

// --- 헬퍼 ---

// threePlayerState 3인 게임을 위한 PlayerState 슬라이스를 반환한다.
func threePlayerState(rack0, rack1, rack2 []string) []model.PlayerState {
	return []model.PlayerState{
		{SeatOrder: 0, UserID: "user-A", PlayerType: "HUMAN", HasInitialMeld: false, Rack: rack0, Status: model.PlayerStatusActive},
		{SeatOrder: 1, UserID: "user-B", PlayerType: "HUMAN", HasInitialMeld: false, Rack: rack1, Status: model.PlayerStatusActive},
		{SeatOrder: 2, UserID: "user-C", PlayerType: "AI_BASIC", HasInitialMeld: false, Rack: rack2, Status: model.PlayerStatusActive},
	}
}

// countAllTiles 게임 상태 내 총 타일 수를 계산한다 (drawPile + 모든 rack + 테이블).
func countAllTiles(state *model.GameStateRedis) int {
	total := len(state.DrawPile)
	for _, p := range state.Players {
		total += len(p.Rack)
	}
	for _, set := range state.Table {
		total += len(set.Tiles)
	}
	return total
}

// ============================================================================
// 1. INVALID_MOVE 후 서버 랙(rack) 자동 복원
// ============================================================================

// TestRegression_InvalidMove_ServerAutoRestore_Rack
// ConfirmTurn 검증 실패 시 서버가 자동으로 스냅샷 복원하여
// 랙이 PlaceTiles 호출 이전 상태로 돌아가는지 검증한다.
func TestRegression_InvalidMove_ServerAutoRestore_Rack(t *testing.T) {
	originalRack := []string{"R1a", "R2a", "R3a", "B5a", "Y8a"}
	rack1 := []string{"K1a"}
	state := newTestGameState("reg-restore-1", twoPlayerState(originalRack, rack1), []string{"Y1a"})
	state.Players[0].HasInitialMeld = true
	svc, repo := seedRepo(t, state)

	// PlaceTiles: 무효한 세트 배치 시도 (2장 세트)
	_, err := svc.PlaceTiles("reg-restore-1", &PlaceRequest{
		Seat:          0,
		TableGroups:   []TilePlacement{{ID: "bad", Tiles: []string{"R1a", "R2a"}}},
		TilesFromRack: []string{"R1a", "R2a"},
	})
	require.NoError(t, err, "PlaceTiles 자체는 유효성 검증 없이 성공해야 한다")

	// Place 후 랙 상태: R1a, R2a 제거됨
	mid, _ := repo.GetGameState("reg-restore-1")
	assert.Len(t, mid.Players[0].Rack, 3, "PlaceTiles 후 랙은 3장이어야 한다")

	// ConfirmTurn: 검증 실패 (2장 세트는 ErrSetSize)
	result, err := svc.ConfirmTurn("reg-restore-1", &ConfirmRequest{
		Seat:        0,
		TableGroups: []TilePlacement{{ID: "bad", Tiles: []string{"R1a", "R2a"}}},
	})
	require.Error(t, err)
	assert.False(t, result.Success)

	// 핵심 검증: 서버 자동 복원으로 랙이 원래 상태로 돌아가야 한다
	restored, _ := repo.GetGameState("reg-restore-1")
	assert.ElementsMatch(t, originalRack, restored.Players[0].Rack,
		"INVALID_MOVE 후 랙이 원래 상태로 자동 복원되어야 한다")

	// 테이블도 빈 상태(원래)로 복원
	assert.Empty(t, restored.Table, "INVALID_MOVE 후 테이블도 원래 상태로 복원되어야 한다")
}

// TestRegression_InvalidMove_ServerAutoRestore_WithExistingTable
// 기존 테이블 세트가 있는 상태에서 INVALID_MOVE 후 테이블도 원래대로 복원되는지 검증.
func TestRegression_InvalidMove_ServerAutoRestore_WithExistingTable(t *testing.T) {
	rack0 := []string{"R5a", "R6a", "K1a", "B2a", "Y3a"}
	rack1 := []string{"K2a"}

	existingTable := []*model.SetOnTable{
		{ID: "existing-run", Tiles: []*model.Tile{
			{Code: "B5a"}, {Code: "B6a"}, {Code: "B7a"},
		}},
	}

	state := &model.GameStateRedis{
		GameID:      "reg-restore-2",
		Status:      model.GameStatusPlaying,
		CurrentSeat: 0,
		DrawPile:    []string{"Y1a"},
		Table:       existingTable,
		Players:     twoPlayerState(rack0, rack1),
		TurnStartAt: time.Now().Unix(),
	}
	state.Players[0].HasInitialMeld = true
	svc, repo := seedRepo(t, state)

	// 무효한 세트 배치 + Confirm
	tableGroups := []TilePlacement{
		{ID: "existing-run", Tiles: []string{"B5a", "B6a", "B7a"}},
		{ID: "bad-set", Tiles: []string{"R5a", "R6a"}}, // 2장 = 무효
	}
	_, err := svc.PlaceTiles("reg-restore-2", &PlaceRequest{
		Seat:          0,
		TableGroups:   tableGroups,
		TilesFromRack: []string{"R5a", "R6a"},
	})
	require.NoError(t, err)

	result, err := svc.ConfirmTurn("reg-restore-2", &ConfirmRequest{
		Seat:        0,
		TableGroups: tableGroups,
	})
	require.Error(t, err)
	assert.False(t, result.Success)

	// 복원 검증: 테이블은 기존 1개 세트만 남아야 한다
	restored, _ := repo.GetGameState("reg-restore-2")
	require.Len(t, restored.Table, 1, "기존 테이블 세트만 남아야 한다")
	assert.Equal(t, "existing-run", restored.Table[0].ID)
	assert.Len(t, restored.Table[0].Tiles, 3)

	// 랙도 원래대로
	assert.ElementsMatch(t, rack0, restored.Players[0].Rack)
}

// TestRegression_InvalidMove_DoesNotAdvanceTurn
// INVALID_MOVE 후에는 턴이 넘어가지 않아야 한다.
func TestRegression_InvalidMove_DoesNotAdvanceTurn(t *testing.T) {
	rack0 := []string{"R1a", "R2a", "R3a", "B1a"}
	rack1 := []string{"K1a"}
	state := newTestGameState("reg-no-advance", twoPlayerState(rack0, rack1), []string{"Y1a"})
	svc, repo := seedRepo(t, state)

	tilesFromRack := []string{"R1a", "R2a", "R3a"}
	tableGroups := []TilePlacement{{ID: "run-1", Tiles: tilesFromRack}}

	_, err := svc.PlaceTiles("reg-no-advance", &PlaceRequest{
		Seat:          0,
		TableGroups:   tableGroups,
		TilesFromRack: tilesFromRack,
	})
	require.NoError(t, err)

	// ConfirmTurn: 30점 미달 (1+2+3=6점)
	result, err := svc.ConfirmTurn("reg-no-advance", &ConfirmRequest{
		Seat:        0,
		TableGroups: tableGroups,
	})
	require.Error(t, err)
	assert.False(t, result.Success)

	// 턴은 여전히 seat 0
	saved, _ := repo.GetGameState("reg-no-advance")
	assert.Equal(t, 0, saved.CurrentSeat,
		"INVALID_MOVE 후 턴이 넘어가지 않아야 한다")
}

// ============================================================================
// 2. 턴 전환 시 상태 일관성 테스트
// ============================================================================

// TestRegression_TurnTransition_StateConsistency
// 유효한 배치 -> ConfirmTurn 후 다음 플레이어의 상태가 일관성 있는지 검증.
func TestRegression_TurnTransition_StateConsistency(t *testing.T) {
	rack0 := []string{"R10a", "B10a", "Y10a", "K5a", "B2a"}
	rack1 := []string{"R10b", "B10b", "Y10b", "K5b"}
	state := newTestGameState("reg-transition-1", twoPlayerState(rack0, rack1), []string{"Y1a", "B3a"})
	svc, repo := seedRepo(t, state)

	// seat 0: 30점 그룹 배치
	tilesFromRack := []string{"R10a", "B10a", "Y10a"}
	tableGroups := []TilePlacement{{ID: "grp-1", Tiles: tilesFromRack}}

	_, err := svc.PlaceTiles("reg-transition-1", &PlaceRequest{
		Seat:          0,
		TableGroups:   tableGroups,
		TilesFromRack: tilesFromRack,
	})
	require.NoError(t, err)

	result, err := svc.ConfirmTurn("reg-transition-1", &ConfirmRequest{
		Seat:          0,
		TableGroups:   tableGroups,
		TilesFromRack: tilesFromRack,
	})
	require.NoError(t, err)
	assert.True(t, result.Success)
	assert.Equal(t, 1, result.NextSeat, "턴이 seat 1로 넘어가야 한다")

	// 상태 일관성 검증
	saved, _ := repo.GetGameState("reg-transition-1")

	// 1. CurrentSeat은 1
	assert.Equal(t, 1, saved.CurrentSeat)

	// 2. seat 0의 HasInitialMeld이 true로 갱신
	assert.True(t, saved.Players[0].HasInitialMeld)

	// 3. seat 0의 랙: 원래 5장 - 3장 = 2장
	assert.Len(t, saved.Players[0].Rack, 2)
	assert.ElementsMatch(t, []string{"K5a", "B2a"}, saved.Players[0].Rack)

	// 4. seat 1의 랙은 변경 없음
	assert.ElementsMatch(t, rack1, saved.Players[1].Rack)

	// 5. 테이블에 1개 세트
	require.Len(t, saved.Table, 1)
	assert.Len(t, saved.Table[0].Tiles, 3)

	// 6. DrawPile 변경 없음
	assert.Len(t, saved.DrawPile, 2)
}

// TestRegression_TurnTransition_ThreePlayers_SkipForfeited
// 3인 게임에서 기권자를 건너뛰고 다음 활성 플레이어로 턴이 넘어가는지 검증.
func TestRegression_TurnTransition_ThreePlayers_SkipForfeited(t *testing.T) {
	rack0 := []string{"R10a", "B10a", "Y10a", "K5a"}
	rack1 := []string{"K1a", "K2a", "K3a"}
	rack2 := []string{"B1a", "B2a", "B3a"}

	state := &model.GameStateRedis{
		GameID:      "reg-skip-forfeited",
		Status:      model.GameStatusPlaying,
		CurrentSeat: 0,
		DrawPile:    []string{"Y1a"},
		Table:       []*model.SetOnTable{},
		Players:     threePlayerState(rack0, rack1, rack2),
		TurnStartAt: time.Now().Unix(),
	}
	svc, repo := seedRepo(t, state)

	// seat 1 기권
	_, err := svc.ForfeitPlayer("reg-skip-forfeited", 1, "timeout")
	require.NoError(t, err)

	// seat 0: 30점 그룹 배치
	tilesFromRack := []string{"R10a", "B10a", "Y10a"}
	tableGroups := []TilePlacement{{ID: "grp-1", Tiles: tilesFromRack}}

	_, err = svc.PlaceTiles("reg-skip-forfeited", &PlaceRequest{
		Seat:          0,
		TableGroups:   tableGroups,
		TilesFromRack: tilesFromRack,
	})
	require.NoError(t, err)

	result, err := svc.ConfirmTurn("reg-skip-forfeited", &ConfirmRequest{
		Seat:          0,
		TableGroups:   tableGroups,
		TilesFromRack: tilesFromRack,
	})
	require.NoError(t, err)
	assert.True(t, result.Success)
	// seat 1은 기권 -> seat 2로 넘어가야 한다
	assert.Equal(t, 2, result.NextSeat, "기권자(seat 1)를 건너뛰고 seat 2로 넘어가야 한다")

	saved, _ := repo.GetGameState("reg-skip-forfeited")
	assert.Equal(t, 2, saved.CurrentSeat)
	assert.Equal(t, model.PlayerStatusForfeited, saved.Players[1].Status)
}

// ============================================================================
// 3. Service-level Conservation 테스트
// ============================================================================

// TestRegression_Conservation_AfterNewGame newGame 직후 총 타일 수 = 106.
func TestRegression_Conservation_AfterNewGame(t *testing.T) {
	repo := repository.NewMemoryGameStateRepo()
	svc := NewGameService(repo).(*gameService)

	players := []model.RoomPlayer{
		{Seat: 0, UserID: "user-A", DisplayName: "Player A", Type: "HUMAN"},
		{Seat: 1, UserID: "user-B", DisplayName: "Player B", Type: "HUMAN"},
	}

	state, err := svc.newGame("reg-conservation-new", players, 60)
	require.NoError(t, err)

	total := countAllTiles(state)
	assert.Equal(t, totalTiles, total,
		"newGame 직후 총 타일 수가 106이어야 한다: drawPile(%d) + racks(%d+%d) = %d",
		len(state.DrawPile), len(state.Players[0].Rack), len(state.Players[1].Rack), total)
}

// TestRegression_Conservation_AfterDraw DrawTile 후에도 총합 불변.
func TestRegression_Conservation_AfterDraw(t *testing.T) {
	rack0 := []string{"R5a", "R6a"}
	rack1 := []string{"K1a"}
	drawPile := []string{"Y7a", "B3a", "K9a"}
	state := newTestGameState("reg-cons-draw", twoPlayerState(rack0, rack1), drawPile)
	svc, repo := seedRepo(t, state)

	totalBefore := countAllTiles(state)
	assert.Equal(t, 2+1+3, totalBefore)

	_, err := svc.DrawTile("reg-cons-draw", 0)
	require.NoError(t, err)

	saved, _ := repo.GetGameState("reg-cons-draw")
	totalAfter := countAllTiles(saved)
	assert.Equal(t, totalBefore, totalAfter,
		"DrawTile 후 총합이 불변이어야 한다: before=%d, after=%d", totalBefore, totalAfter)
}

// TestRegression_Conservation_AfterConfirm ConfirmTurn 후에도 총합 불변.
func TestRegression_Conservation_AfterConfirm(t *testing.T) {
	rack0 := []string{"R10a", "B10a", "Y10a", "K5a"}
	rack1 := []string{"K1a"}
	drawPile := []string{"Y1a", "B3a"}
	state := newTestGameState("reg-cons-confirm", twoPlayerState(rack0, rack1), drawPile)
	svc, repo := seedRepo(t, state)

	totalBefore := countAllTiles(state)

	tilesFromRack := []string{"R10a", "B10a", "Y10a"}
	tableGroups := []TilePlacement{{ID: "grp-1", Tiles: tilesFromRack}}

	_, err := svc.PlaceTiles("reg-cons-confirm", &PlaceRequest{
		Seat:          0,
		TableGroups:   tableGroups,
		TilesFromRack: tilesFromRack,
	})
	require.NoError(t, err)

	_, err = svc.ConfirmTurn("reg-cons-confirm", &ConfirmRequest{
		Seat:          0,
		TableGroups:   tableGroups,
		TilesFromRack: tilesFromRack,
	})
	require.NoError(t, err)

	saved, _ := repo.GetGameState("reg-cons-confirm")
	totalAfter := countAllTiles(saved)
	assert.Equal(t, totalBefore, totalAfter,
		"ConfirmTurn 후 총합이 불변이어야 한다: before=%d, after=%d", totalBefore, totalAfter)
}

// TestRegression_Conservation_AfterInvalidMove_Restore INVALID_MOVE 후 자동 복원 시에도 총합 불변.
func TestRegression_Conservation_AfterInvalidMove_Restore(t *testing.T) {
	rack0 := []string{"R1a", "R2a", "R3a", "B5a", "Y8a"}
	rack1 := []string{"K1a"}
	drawPile := []string{"Y1a", "B3a", "K9a"}
	state := newTestGameState("reg-cons-invalid", twoPlayerState(rack0, rack1), drawPile)
	state.Players[0].HasInitialMeld = true
	svc, repo := seedRepo(t, state)

	totalBefore := countAllTiles(state)

	// 무효한 세트 배치
	_, err := svc.PlaceTiles("reg-cons-invalid", &PlaceRequest{
		Seat:          0,
		TableGroups:   []TilePlacement{{ID: "bad", Tiles: []string{"R1a", "R2a"}}},
		TilesFromRack: []string{"R1a", "R2a"},
	})
	require.NoError(t, err)

	// ConfirmTurn 실패 -> 자동 복원
	_, err = svc.ConfirmTurn("reg-cons-invalid", &ConfirmRequest{
		Seat:        0,
		TableGroups: []TilePlacement{{ID: "bad", Tiles: []string{"R1a", "R2a"}}},
	})
	require.Error(t, err)

	saved, _ := repo.GetGameState("reg-cons-invalid")
	totalAfter := countAllTiles(saved)
	assert.Equal(t, totalBefore, totalAfter,
		"INVALID_MOVE 자동 복원 후 총합이 불변이어야 한다: before=%d, after=%d", totalBefore, totalAfter)
}

// ============================================================================
// 4. PlaceTiles tilesFromRack <-> tableGroups 보전 검증
// ============================================================================

// TestRegression_PlaceTiles_TileNotInTableGroups
// tilesFromRack에 있는 타일이 tableGroups에 없으면 에러를 반환한다.
func TestRegression_PlaceTiles_TileNotInTableGroups(t *testing.T) {
	rack0 := []string{"R5a", "R6a", "R7a", "B1a"}
	rack1 := []string{"K1a"}
	state := newTestGameState("reg-place-conservation", twoPlayerState(rack0, rack1), []string{"Y1a"})
	svc, _ := seedRepo(t, state)

	// tilesFromRack에 R7a가 있지만 tableGroups에는 R5a, R6a만 있음
	_, err := svc.PlaceTiles("reg-place-conservation", &PlaceRequest{
		Seat:          0,
		TableGroups:   []TilePlacement{{ID: "set-1", Tiles: []string{"R5a", "R6a"}}},
		TilesFromRack: []string{"R5a", "R6a", "R7a"}, // R7a는 테이블에 없음
	})
	require.Error(t, err)

	se, ok := IsServiceError(err)
	require.True(t, ok)
	assert.Equal(t, "INVALID_REQUEST", se.Code)
}

// TestRegression_PlaceTiles_DuplicateTileInRack
// 랙에 없는 타일을 tilesFromRack에 넣으면 에러.
func TestRegression_PlaceTiles_DuplicateTileInRack(t *testing.T) {
	rack0 := []string{"R5a", "R6a", "R7a"}
	rack1 := []string{"K1a"}
	state := newTestGameState("reg-place-dup", twoPlayerState(rack0, rack1), []string{"Y1a"})
	svc, _ := seedRepo(t, state)

	// R5a를 2번 사용하려는 시도 (랙에는 1장뿐)
	_, err := svc.PlaceTiles("reg-place-dup", &PlaceRequest{
		Seat:          0,
		TableGroups:   []TilePlacement{{ID: "set-1", Tiles: []string{"R5a", "R5a", "R6a"}}},
		TilesFromRack: []string{"R5a", "R5a", "R6a"},
	})
	require.Error(t, err)

	se, ok := IsServiceError(err)
	require.True(t, ok)
	assert.Equal(t, "INVALID_REQUEST", se.Code)
}

// ============================================================================
// 5. 연속 턴 Conservation + 상태 일관성
// ============================================================================

// TestRegression_MultiTurn_Conservation
// 여러 턴에 걸친 배치와 드로우 후에도 총합 불변.
func TestRegression_MultiTurn_Conservation(t *testing.T) {
	rack0 := []string{"R10a", "B10a", "Y10a", "K5a", "R1a", "R2a", "R3a"}
	rack1 := []string{"R10b", "B10b", "Y10b", "K5b", "B1a", "B2a", "B3a"}
	drawPile := []string{"Y1a", "B4a", "K9a", "R8a", "Y11a"}
	state := newTestGameState("reg-multi-turn", twoPlayerState(rack0, rack1), drawPile)
	svc, repo := seedRepo(t, state)

	totalExpected := countAllTiles(state)
	assert.Equal(t, len(rack0)+len(rack1)+len(drawPile), totalExpected)

	// Turn 1: seat 0 - 30점 그룹 배치
	tiles0 := []string{"R10a", "B10a", "Y10a"}
	tg0 := []TilePlacement{{ID: "grp-1", Tiles: tiles0}}
	_, err := svc.PlaceTiles("reg-multi-turn", &PlaceRequest{
		Seat: 0, TableGroups: tg0, TilesFromRack: tiles0,
	})
	require.NoError(t, err)
	_, err = svc.ConfirmTurn("reg-multi-turn", &ConfirmRequest{
		Seat: 0, TableGroups: tg0, TilesFromRack: tiles0,
	})
	require.NoError(t, err)

	saved, _ := repo.GetGameState("reg-multi-turn")
	assert.Equal(t, totalExpected, countAllTiles(saved), "Turn 1 후 총합 불변")

	// Turn 2: seat 1 - 드로우
	_, err = svc.DrawTile("reg-multi-turn", 1)
	require.NoError(t, err)

	saved, _ = repo.GetGameState("reg-multi-turn")
	assert.Equal(t, totalExpected, countAllTiles(saved), "Turn 2 드로우 후 총합 불변")

	// Turn 3: seat 0 - 추가 배치 (기존 테이블 유지 + 새 런)
	tiles0b := []string{"R1a", "R2a", "R3a"}
	tg0b := []TilePlacement{
		{ID: "grp-1", Tiles: []string{"R10a", "B10a", "Y10a"}}, // 기존 유지
		{ID: "run-1", Tiles: tiles0b},                            // 새 런
	}
	_, err = svc.PlaceTiles("reg-multi-turn", &PlaceRequest{
		Seat: 0, TableGroups: tg0b, TilesFromRack: tiles0b,
	})
	require.NoError(t, err)
	_, err = svc.ConfirmTurn("reg-multi-turn", &ConfirmRequest{
		Seat: 0, TableGroups: tg0b, TilesFromRack: tiles0b,
	})
	require.NoError(t, err)

	saved, _ = repo.GetGameState("reg-multi-turn")
	assert.Equal(t, totalExpected, countAllTiles(saved), "Turn 3 배치 후 총합 불변")

	// Turn 4: seat 1 - 30점 그룹 배치
	tiles1 := []string{"R10b", "B10b", "Y10b"}
	tg1 := []TilePlacement{
		{ID: "grp-1", Tiles: []string{"R10a", "B10a", "Y10a"}},
		{ID: "run-1", Tiles: []string{"R1a", "R2a", "R3a"}},
		{ID: "grp-2", Tiles: tiles1},
	}
	_, err = svc.PlaceTiles("reg-multi-turn", &PlaceRequest{
		Seat: 1, TableGroups: tg1, TilesFromRack: tiles1,
	})
	require.NoError(t, err)
	_, err = svc.ConfirmTurn("reg-multi-turn", &ConfirmRequest{
		Seat: 1, TableGroups: tg1, TilesFromRack: tiles1,
	})
	require.NoError(t, err)

	saved, _ = repo.GetGameState("reg-multi-turn")
	assert.Equal(t, totalExpected, countAllTiles(saved), "Turn 4 배치 후 총합 불변")
}

// ============================================================================
// 6. ConfirmTurn 검증 실패 코드 정확성
// ============================================================================

// TestRegression_ConfirmTurn_ErrorCodes_Correct
// 다양한 검증 실패 시나리오에서 올바른 에러 코드를 반환하는지 검증.
func TestRegression_ConfirmTurn_ErrorCodes_Correct(t *testing.T) {
	tests := []struct {
		name           string
		setupState     func() *model.GameStateRedis
		tableGroups    []TilePlacement
		tilesFromRack  []string
		expectedCode   string
	}{
		{
			name: "ERR_SET_SIZE (2장 세트)",
			setupState: func() *model.GameStateRedis {
				s := newTestGameState("reg-err-size", twoPlayerState(
					[]string{"R5a", "R6a", "K1a"},
					[]string{"B1a"},
				), []string{"Y1a"})
				s.Players[0].HasInitialMeld = true
				return s
			},
			tableGroups:   []TilePlacement{{ID: "bad", Tiles: []string{"R5a", "R6a"}}},
			tilesFromRack: []string{"R5a", "R6a"},
			expectedCode:  engine.ErrSetSize,
		},
		{
			name: "ERR_INITIAL_MELD_SCORE (30점 미달)",
			setupState: func() *model.GameStateRedis {
				return newTestGameState("reg-err-meld", twoPlayerState(
					[]string{"R1a", "R2a", "R3a", "K1a"},
					[]string{"B1a"},
				), []string{"Y1a"})
			},
			tableGroups:   []TilePlacement{{ID: "run-1", Tiles: []string{"R1a", "R2a", "R3a"}}},
			tilesFromRack: []string{"R1a", "R2a", "R3a"},
			expectedCode:  engine.ErrInitialMeldScore,
		},
		{
			name: "ERR_GROUP_COLOR_DUP (그룹 내 색상 중복)",
			setupState: func() *model.GameStateRedis {
				s := newTestGameState("reg-err-color-dup", twoPlayerState(
					[]string{"R7a", "R7b", "B7a", "K1a"},
					[]string{"B1a"},
				), []string{"Y1a"})
				s.Players[0].HasInitialMeld = true
				return s
			},
			tableGroups:   []TilePlacement{{ID: "grp-bad", Tiles: []string{"R7a", "R7b", "B7a"}}},
			tilesFromRack: []string{"R7a", "R7b", "B7a"},
			expectedCode:  engine.ErrGroupColorDup,
		},
	}

	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			state := tc.setupState()
			svc, _ := seedRepo(t, state)
			gameID := state.GameID

			_, err := svc.PlaceTiles(gameID, &PlaceRequest{
				Seat:          0,
				TableGroups:   tc.tableGroups,
				TilesFromRack: tc.tilesFromRack,
			})
			require.NoError(t, err)

			result, err := svc.ConfirmTurn(gameID, &ConfirmRequest{
				Seat:        0,
				TableGroups: tc.tableGroups,
			})
			require.Error(t, err)
			assert.False(t, result.Success)

			se, ok := IsServiceError(err)
			require.True(t, ok, "에러가 ServiceError 타입이어야 한다")
			assert.Equal(t, tc.expectedCode, se.Code,
				"에러 코드가 %q이어야 한다, 실제: %q", tc.expectedCode, se.Code)
		})
	}
}

// ============================================================================
// 7. ResetTurn 후 재시도 가능 검증
// ============================================================================

// TestRegression_ResetTurn_ThenRetry_Success
// ResetTurn 후 올바른 세트로 다시 PlaceTiles + ConfirmTurn 하면 성공한다.
func TestRegression_ResetTurn_ThenRetry_Success(t *testing.T) {
	rack0 := []string{"R10a", "B10a", "Y10a", "R1a", "R2a"}
	rack1 := []string{"K1a"}
	state := newTestGameState("reg-reset-retry", twoPlayerState(rack0, rack1), []string{"Y1a"})
	svc, repo := seedRepo(t, state)

	// 1차 시도: 무효한 세트 (2장)
	_, err := svc.PlaceTiles("reg-reset-retry", &PlaceRequest{
		Seat:          0,
		TableGroups:   []TilePlacement{{ID: "bad", Tiles: []string{"R1a", "R2a"}}},
		TilesFromRack: []string{"R1a", "R2a"},
	})
	require.NoError(t, err)

	// ResetTurn: 원래 상태로 복원
	_, err = svc.ResetTurn("reg-reset-retry", 0)
	require.NoError(t, err)

	mid, _ := repo.GetGameState("reg-reset-retry")
	assert.ElementsMatch(t, rack0, mid.Players[0].Rack, "ResetTurn 후 랙 복원")

	// 2차 시도: 유효한 30점 그룹
	tilesFromRack := []string{"R10a", "B10a", "Y10a"}
	tableGroups := []TilePlacement{{ID: "grp-1", Tiles: tilesFromRack}}

	_, err = svc.PlaceTiles("reg-reset-retry", &PlaceRequest{
		Seat:          0,
		TableGroups:   tableGroups,
		TilesFromRack: tilesFromRack,
	})
	require.NoError(t, err)

	result, err := svc.ConfirmTurn("reg-reset-retry", &ConfirmRequest{
		Seat:          0,
		TableGroups:   tableGroups,
		TilesFromRack: tilesFromRack,
	})
	require.NoError(t, err)
	assert.True(t, result.Success, "ResetTurn 후 유효한 배치는 성공해야 한다")
	assert.Equal(t, 1, result.NextSeat)
}

// ============================================================================
// 8. Forfeit 후 Conservation
// ============================================================================

// TestRegression_Conservation_AfterForfeit
// 기권 후에도 총 타일 수가 보전되는지 검증.
func TestRegression_Conservation_AfterForfeit(t *testing.T) {
	rack0 := []string{"R10a", "B10a", "Y10a", "K5a"}
	rack1 := []string{"K1a", "K2a", "K3a"}
	rack2 := []string{"B1a", "B2a", "B3a"}

	state := &model.GameStateRedis{
		GameID:      "reg-cons-forfeit",
		Status:      model.GameStatusPlaying,
		CurrentSeat: 0,
		DrawPile:    []string{"Y1a", "B4a"},
		Table:       []*model.SetOnTable{},
		Players:     threePlayerState(rack0, rack1, rack2),
		TurnStartAt: time.Now().Unix(),
	}
	svc, repo := seedRepo(t, state)

	totalBefore := countAllTiles(state)

	// seat 1 기권
	_, err := svc.ForfeitPlayer("reg-cons-forfeit", 1, "disconnect")
	require.NoError(t, err)

	saved, _ := repo.GetGameState("reg-cons-forfeit")
	totalAfter := countAllTiles(saved)
	assert.Equal(t, totalBefore, totalAfter,
		"기권 후 총합이 불변이어야 한다: before=%d, after=%d", totalBefore, totalAfter)

	// 기권자의 랙 타일은 여전히 존재해야 한다
	assert.ElementsMatch(t, rack1, saved.Players[1].Rack,
		"기권자의 랙 타일은 보전되어야 한다")
}

// ============================================================================
// 9. newGame Conservation (전체 106장)
// ============================================================================

// TestRegression_NewGame_Conservation_AllPlayerCounts
// 2~4인 게임 모두에서 newGame 직후 총 106장이 보전되는지 검증.
func TestRegression_NewGame_Conservation_AllPlayerCounts(t *testing.T) {
	for playerCount := 2; playerCount <= 4; playerCount++ {
		t.Run(fmt.Sprintf("%d인_게임", playerCount), func(t *testing.T) {
			repo := repository.NewMemoryGameStateRepo()
			svc := NewGameService(repo).(*gameService)

			players := make([]model.RoomPlayer, playerCount)
			for i := 0; i < playerCount; i++ {
				players[i] = model.RoomPlayer{
					Seat:        i,
					UserID:      fmt.Sprintf("user-%d", i),
					DisplayName: fmt.Sprintf("Player %d", i),
					Type:        "HUMAN",
				}
			}

			state, err := svc.newGame(fmt.Sprintf("reg-cons-%d-players", playerCount), players, 60)
			require.NoError(t, err)

			total := countAllTiles(state)
			assert.Equal(t, totalTiles, total,
				"%d인 게임: drawPile(%d) + racks = %d, 기대: %d",
				playerCount, len(state.DrawPile), total, totalTiles)

			// 각 플레이어는 14장
			for i, p := range state.Players {
				assert.Len(t, p.Rack, 14, "player %d의 초기 랙은 14장", i)
			}

			// DrawPile = 106 - (playerCount * 14)
			expectedDraw := totalTiles - (playerCount * 14)
			assert.Len(t, state.DrawPile, expectedDraw)
		})
	}
}

// ============================================================================
// 10. INVALID_MOVE -> 자동복원 -> ResetTurn noop 검증
// ============================================================================

// TestRegression_InvalidMove_AutoRestore_ThenResetIsNoop
// ConfirmTurn 실패 시 서버가 자동 복원하면, 이후 ResetTurn은 no-op이어야 한다
// (스냅샷이 이미 사용+삭제되었으므로).
func TestRegression_InvalidMove_AutoRestore_ThenResetIsNoop(t *testing.T) {
	rack0 := []string{"R1a", "R2a", "R3a", "B5a"}
	rack1 := []string{"K1a"}
	state := newTestGameState("reg-restore-reset", twoPlayerState(rack0, rack1), []string{"Y1a"})
	state.Players[0].HasInitialMeld = true
	svc, repo := seedRepo(t, state)

	// Place
	_, err := svc.PlaceTiles("reg-restore-reset", &PlaceRequest{
		Seat:          0,
		TableGroups:   []TilePlacement{{ID: "bad", Tiles: []string{"R1a", "R2a"}}},
		TilesFromRack: []string{"R1a", "R2a"},
	})
	require.NoError(t, err)

	// ConfirmTurn 실패 -> 자동 복원
	_, err = svc.ConfirmTurn("reg-restore-reset", &ConfirmRequest{
		Seat:        0,
		TableGroups: []TilePlacement{{ID: "bad", Tiles: []string{"R1a", "R2a"}}},
	})
	require.Error(t, err)

	// 자동 복원 후 상태
	afterRestore, _ := repo.GetGameState("reg-restore-reset")
	assert.ElementsMatch(t, rack0, afterRestore.Players[0].Rack)

	// ResetTurn: 스냅샷이 이미 삭제되었으므로 no-op
	result, err := svc.ResetTurn("reg-restore-reset", 0)
	require.NoError(t, err)
	assert.True(t, result.Success)

	// 상태 변화 없음
	afterReset, _ := repo.GetGameState("reg-restore-reset")
	assert.ElementsMatch(t, rack0, afterReset.Players[0].Rack,
		"ResetTurn 후 랙은 자동 복원된 상태 그대로여야 한다")
}
