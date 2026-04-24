package service

// game_service_confirm_test.go — BUG-UI-014 재현 테스트
// RED 시나리오:
//   TC-1 (Happy):      유효 3-tile 세트 → 패널티 없이 보드 커밋
//   TC-2 (RED target): AI 1-tile group 포함 → 패널티 + 보드 롤백 확인 + RollbackForced=true
//   TC-3 (RED target): AI JK+1-tile invalid 혼합 → 패널티 + RollbackForced=true
//
// BUG-UI-014 근본: processAIPlace가 ConfirmTurn penalty 경로에서
//   ROLLBACK_FORCED 이벤트를 브로드캐스트하지 않아 프론트가 보드를 동기화하지 못함.
// 수정 목표: ConfirmTurn이 invalid meld 시 GameActionResult.RollbackForced=true를 반환하고,
//   ws_handler가 이를 ROLLBACK_FORCED 이벤트로 브로드캐스트하도록 배선.

import (
	"testing"

	"github.com/k82022603/RummiArena/game-server/internal/engine"
	"github.com/k82022603/RummiArena/game-server/internal/model"
	"github.com/k82022603/RummiArena/game-server/internal/repository"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

// --- 헬퍼 ---

func seedWithInitialMeld(t *testing.T, gameID string, rack0 []string, tableOnBoard []*model.SetOnTable, drawPile []string) (GameService, repository.MemoryGameStateRepository) {
	t.Helper()
	players := []model.PlayerState{
		{SeatOrder: 0, UserID: "ai-player", PlayerType: "AI_GPT", HasInitialMeld: true, Rack: rack0, Status: model.PlayerStatusActive},
		{SeatOrder: 1, UserID: "human-player", PlayerType: "HUMAN", HasInitialMeld: true, Rack: []string{"K1a"}, Status: model.PlayerStatusActive},
	}
	state := &model.GameStateRedis{
		GameID:      gameID,
		Status:      model.GameStatusPlaying,
		CurrentSeat: 0,
		DrawPile:    drawPile,
		Table:       tableOnBoard,
		Players:     players,
	}
	repo := repository.NewMemoryGameStateRepo()
	require.NoError(t, repo.SaveGameState(state))
	svc := NewGameService(repo)
	return svc, repo
}

// --- TC-1: Happy Path — 유효한 3-tile run 세트 배치 ---
// AI 가 유효한 런을 보드에 추가하면 패널티 없이 커밋되어야 한다.
func TestConfirmTurn_AIPlace_ValidSet_NoRollback(t *testing.T) {
	existingSet := &model.SetOnTable{
		ID:    "existing-run",
		Tiles: []*model.Tile{{Code: "B5a"}, {Code: "B6a"}, {Code: "B7a"}},
	}
	// rack: 새 런 R8a R9a R10a
	rack0 := []string{"R8a", "R9a", "R10a", "K2a"}
	svc, repo := seedWithInitialMeld(t, "game-confirm-happy", rack0, []*model.SetOnTable{existingSet}, []string{"Y1a", "Y2a", "Y3a"})

	// AI가 기존 세트 + 새 런 세트를 전송
	req := &ConfirmRequest{
		Seat: 0,
		TableGroups: []TilePlacement{
			{ID: "existing-run", Tiles: []string{"B5a", "B6a", "B7a"}}, // 기존 세트 보존
			{ID: "new-run", Tiles: []string{"R8a", "R9a", "R10a"}},     // 새 런
		},
		TilesFromRack: []string{"R8a", "R9a", "R10a"},
	}

	result, err := svc.ConfirmTurn("game-confirm-happy", req)
	require.NoError(t, err)
	assert.True(t, result.Success, "유효한 배치는 성공해야 한다")
	assert.Equal(t, 0, result.PenaltyDrawCount, "TC-1: 패널티 없어야 한다")
	// BUG-UI-014 수정 후: RollbackForced=false
	assert.False(t, result.RollbackForced, "TC-1: 롤백 없어야 한다")

	// 보드에 2개 세트가 커밋되어야 한다
	saved, err := repo.GetGameState("game-confirm-happy")
	require.NoError(t, err)
	assert.Len(t, saved.Table, 2, "TC-1: 기존+새 세트 2개 커밋")
	// 랙에서 3장 제거
	assert.Equal(t, []string{"K2a"}, saved.Players[0].Rack, "TC-1: 3장 제거 후 랙")
}

// --- TC-2: RED 재현 — AI 1-tile group 잔존 ---
// AI 가 1-tile group (R10a 1장) 을 포함한 tableGroups 를 전송하면
// ValidateTurnConfirm 이 ErrSetSize 를 반환하고:
//   1. 패널티 드로우 3장 적용
//   2. 보드가 배치 전 상태로 롤백
//   3. result.RollbackForced == true (BUG-UI-014 수정 목표)
func TestConfirmTurn_AIPlace_OneTileGroup_Rejected(t *testing.T) {
	existingSet := &model.SetOnTable{
		ID:    "existing-run",
		Tiles: []*model.Tile{{Code: "B5a"}, {Code: "B6a"}, {Code: "B7a"}},
	}
	rack0 := []string{"R10a", "K2a", "Y3a"}
	drawPile := []string{"Y1a", "Y2a", "Y3a", "Y4a", "Y5a"}
	svc, repo := seedWithInitialMeld(t, "game-1tile-reject", rack0, []*model.SetOnTable{existingSet}, drawPile)

	// AI가 1-tile group (R10a 1장) 을 invalid set으로 전송
	req := &ConfirmRequest{
		Seat: 0,
		TableGroups: []TilePlacement{
			{ID: "existing-run", Tiles: []string{"B5a", "B6a", "B7a"}}, // 기존 보존
			{ID: "bad-1tile", Tiles: []string{"R10a"}},                  // 1-tile — invalid
		},
		TilesFromRack: []string{"R10a"},
	}

	result, err := svc.ConfirmTurn("game-1tile-reject", req)
	require.NoError(t, err, "패널티 드로우로 처리되므로 service error 없음")
	assert.True(t, result.Success, "TC-2: Success=true (패널티로 처리됨)")
	assert.Equal(t, engine.ErrSetSize, result.ErrorCode, "TC-2: ErrSetSize 코드 반환")
	assert.Greater(t, result.PenaltyDrawCount, 0, "TC-2: 패널티 드로우 적용")

	// BUG-UI-014 수정 목표: RollbackForced=true
	assert.True(t, result.RollbackForced, "TC-2 [BUG-UI-014]: invalid meld 시 RollbackForced=true")

	// 보드가 배치 전 상태(기존 세트만)로 복원되어야 한다
	saved, err := repo.GetGameState("game-1tile-reject")
	require.NoError(t, err)
	assert.Len(t, saved.Table, 1, "TC-2: 보드가 기존 1개 세트로 롤백되어야 한다")
	assert.Equal(t, "existing-run", saved.Table[0].ID, "TC-2: 기존 세트 ID 유지")
}

// --- TC-3: RED 재현 — JK+1-tile invalid 혼합 ---
// AI 가 조커 + 1-tile 로만 구성된 세트를 전송하면 ErrSetSize 로 거부되어야 한다.
func TestConfirmTurn_AIPlace_JokerPlusOneTile_Rejected(t *testing.T) {
	existingSet := &model.SetOnTable{
		ID:    "existing-group",
		Tiles: []*model.Tile{{Code: "R7a"}, {Code: "B7a"}, {Code: "Y7a"}},
	}
	rack0 := []string{"JK1", "K4a", "Y5a"}
	drawPile := []string{"B1a", "B2a", "B3a", "B4a", "B5a"}
	svc, repo := seedWithInitialMeld(t, "game-jk-1tile", rack0, []*model.SetOnTable{existingSet}, drawPile)

	// AI가 JK1 + K4a 2-tile group 을 전송 (2장 — min 3장 위반)
	req := &ConfirmRequest{
		Seat: 0,
		TableGroups: []TilePlacement{
			{ID: "existing-group", Tiles: []string{"R7a", "B7a", "Y7a"}}, // 기존 보존
			{ID: "bad-jk-set", Tiles: []string{"JK1", "K4a"}},            // 2-tile — invalid
		},
		TilesFromRack: []string{"JK1", "K4a"},
	}

	result, err := svc.ConfirmTurn("game-jk-1tile", req)
	require.NoError(t, err, "패널티 드로우로 처리됨")
	assert.True(t, result.Success)
	assert.Equal(t, engine.ErrSetSize, result.ErrorCode, "TC-3: 2-tile도 ErrSetSize")
	assert.Greater(t, result.PenaltyDrawCount, 0, "TC-3: 패널티 적용")

	// BUG-UI-014 수정 목표: RollbackForced=true
	assert.True(t, result.RollbackForced, "TC-3 [BUG-UI-014]: JK+1tile invalid meld 시 RollbackForced=true")

	// 보드 롤백 확인
	saved, err := repo.GetGameState("game-jk-1tile")
	require.NoError(t, err)
	assert.Len(t, saved.Table, 1, "TC-3: 보드가 기존 1개 세트로 롤백")
}
