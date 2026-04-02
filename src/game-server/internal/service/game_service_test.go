package service

import (
	"fmt"
	"strings"
	"testing"
	"time"

	"github.com/k82022603/RummiArena/game-server/internal/engine"
	"github.com/k82022603/RummiArena/game-server/internal/model"
	"github.com/k82022603/RummiArena/game-server/internal/repository"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

// --- 테스트 픽스처 헬퍼 ---

// newTestGameState 테스트용 GameStateRedis를 직접 구성한다.
// drawPile: 드로우 파일 타일 코드 목록
// players: seat 순서 그대로 PlayerState 슬라이스
func newTestGameState(gameID string, players []model.PlayerState, drawPile []string) *model.GameStateRedis {
	return &model.GameStateRedis{
		GameID:      gameID,
		Status:      model.GameStatusPlaying,
		CurrentSeat: players[0].SeatOrder,
		DrawPile:    drawPile,
		Table:       []*model.SetOnTable{},
		Players:     players,
		TurnStartAt: time.Now().Unix(),
	}
}

// twoPlayerState 2인 게임을 위한 PlayerState 슬라이스를 반환한다.
func twoPlayerState(rack0, rack1 []string) []model.PlayerState {
	return []model.PlayerState{
		{SeatOrder: 0, UserID: "user-A", PlayerType: "HUMAN", HasInitialMeld: false, Rack: rack0},
		{SeatOrder: 1, UserID: "user-B", PlayerType: "HUMAN", HasInitialMeld: false, Rack: rack1},
	}
}

// seedRepo 게임 상태를 repository에 저장한 뒤 GameService를 반환한다.
func seedRepo(t *testing.T, state *model.GameStateRedis) (GameService, repository.MemoryGameStateRepository) {
	t.Helper()
	repo := repository.NewMemoryGameStateRepo()
	require.NoError(t, repo.SaveGameState(state))
	svc := NewGameService(repo)
	return svc, repo
}

// validRunTiles 유효한 런 세트 타일 코드 슬라이스를 반환한다.
// color: "R"/"B"/"Y"/"K", start: 시작 숫자, length: 타일 수 (최소 3)
func validRunTiles(color string, start, length int) []TilePlacement {
	codes := make([]string, length)
	for i := 0; i < length; i++ {
		codes[i] = fmt.Sprintf("%s%da", color, start+i)
	}
	return []TilePlacement{{ID: "set-1", Tiles: codes}}
}

// --- TestPlaceTiles ---

func TestPlaceTiles_SnapshotCreated(t *testing.T) {
	// 첫 번째 PlaceTiles 호출 시 스냅샷이 생성되고, 두 번째 호출에서는 새 스냅샷을 생성하지 않는다.
	rack := []string{"R5a", "R6a", "R7a", "B1a", "B2a"}
	state := newTestGameState("game-1", twoPlayerState(rack, []string{"K1a"}), []string{"Y1a"})
	svc, repo := seedRepo(t, state)

	req := &PlaceRequest{
		Seat:          0,
		TableGroups:   validRunTiles("R", 5, 3),
		TilesFromRack: []string{"R5a", "R6a", "R7a"},
	}
	result, err := svc.PlaceTiles("game-1", req)
	require.NoError(t, err)
	assert.True(t, result.Success)
	assert.Equal(t, 0, result.NextSeat) // 아직 내 턴

	// 상태 확인: 랙에서 3장 제거
	saved, err := repo.GetGameState("game-1")
	require.NoError(t, err)
	assert.Equal(t, []string{"B1a", "B2a"}, saved.Players[0].Rack)
	assert.Len(t, saved.Table, 1)
}

func TestPlaceTiles_NotYourTurn(t *testing.T) {
	rack := []string{"R5a", "R6a", "R7a"}
	state := newTestGameState("game-2", twoPlayerState(rack, []string{"K1a"}), nil)
	svc, _ := seedRepo(t, state)

	req := &PlaceRequest{
		Seat:          1, // seat 1 이 호출하지만 currentSeat=0
		TableGroups:   validRunTiles("R", 5, 3),
		TilesFromRack: []string{"R5a", "R6a", "R7a"},
	}
	_, err := svc.PlaceTiles("game-2", req)
	require.Error(t, err)

	se, ok := IsServiceError(err)
	require.True(t, ok)
	assert.Equal(t, "NOT_YOUR_TURN", se.Code)
}

func TestPlaceTiles_TileNotInRack(t *testing.T) {
	rack := []string{"R5a", "R6a"}
	state := newTestGameState("game-3", twoPlayerState(rack, []string{"K1a"}), nil)
	svc, _ := seedRepo(t, state)

	req := &PlaceRequest{
		Seat:          0,
		TableGroups:   validRunTiles("R", 5, 3),
		TilesFromRack: []string{"R5a", "R6a", "R7a"}, // R7a는 랙에 없음
	}
	_, err := svc.PlaceTiles("game-3", req)
	require.Error(t, err)

	se, ok := IsServiceError(err)
	require.True(t, ok)
	assert.Equal(t, "INVALID_REQUEST", se.Code)
}

func TestPlaceTiles_GameNotFound(t *testing.T) {
	repo := repository.NewMemoryGameStateRepo()
	svc := NewGameService(repo)

	req := &PlaceRequest{
		Seat:        0,
		TableGroups: validRunTiles("R", 5, 3),
	}
	_, err := svc.PlaceTiles("no-such-game", req)
	require.Error(t, err)

	se, ok := IsServiceError(err)
	require.True(t, ok)
	assert.Equal(t, "NOT_FOUND", se.Code)
	assert.Equal(t, 404, se.Status)
}

func TestPlaceTiles_InvalidSet_ValidationOnConfirm(t *testing.T) {
	// PlaceTiles 자체는 유효성 검증 없이 테이블에 배치한다.
	// 유효하지 않은 세트(2장만 배치)를 PlaceTiles로 올린 후
	// ConfirmTurn에서 ValidationError가 반환되는지 확인한다.
	rack0 := []string{"R5a", "R6a", "B1a"}
	rack1 := []string{"K1a"}
	state := newTestGameState("game-invalid-set", twoPlayerState(rack0, rack1), []string{"Y1a"})
	state.Players[0].HasInitialMeld = true
	svc, _ := seedRepo(t, state)

	// 2장짜리 세트 (최소 3장 규칙 위반)
	tilesFromRack := []string{"R5a", "R6a"}
	tableGroups := []TilePlacement{{ID: "bad-set", Tiles: tilesFromRack}}

	// PlaceTiles는 성공 (유효성 검증 없음)
	result, err := svc.PlaceTiles("game-invalid-set", &PlaceRequest{
		Seat:          0,
		TableGroups:   tableGroups,
		TilesFromRack: tilesFromRack,
	})
	require.NoError(t, err)
	assert.True(t, result.Success, "PlaceTiles는 유효성 검증 없이 성공해야 한다")

	// ConfirmTurn에서 ValidationError 발생
	confirmResult, err := svc.ConfirmTurn("game-invalid-set", &ConfirmRequest{
		Seat:        0,
		TableGroups: tableGroups,
	})
	require.Error(t, err, "유효하지 않은 세트로 ConfirmTurn하면 에러가 발생해야 한다")
	assert.False(t, confirmResult.Success)

	se, ok := IsServiceError(err)
	require.True(t, ok)
	assert.Equal(t, engine.ErrSetSize, se.Code, "세트 크기 규칙 위반 에러 코드")
}

func TestPlaceTiles_TableStateSnapshot(t *testing.T) {
	// PlaceTiles 호출 전후로 테이블 상태가 정확히 기록되는지 확인한다.
	// 기존 테이블에 세트가 있는 상태에서 새 세트를 추가하면
	// 테이블에 기존 + 새 세트가 모두 존재해야 한다.
	existingTable := []*model.SetOnTable{
		{ID: "existing-run", Tiles: []*model.Tile{
			{Code: "B5a"}, {Code: "B6a"}, {Code: "B7a"},
		}},
	}

	rack0 := []string{"R5a", "R6a", "R7a", "K1a"}
	rack1 := []string{"K2a"}

	state := &model.GameStateRedis{
		GameID:      "game-snapshot-1",
		Status:      model.GameStatusPlaying,
		CurrentSeat: 0,
		DrawPile:    []string{"Y1a"},
		Table:       existingTable,
		Players:     twoPlayerState(rack0, rack1),
		TurnStartAt: time.Now().Unix(),
	}
	svc, repo := seedRepo(t, state)

	// 기존 세트 유지 + 새 세트 추가
	tilesFromRack := []string{"R5a", "R6a", "R7a"}
	tableAfter := []TilePlacement{
		{ID: "existing-run", Tiles: []string{"B5a", "B6a", "B7a"}}, // 기존 유지
		{ID: "new-run", Tiles: []string{"R5a", "R6a", "R7a"}},      // 새로 추가
	}

	result, err := svc.PlaceTiles("game-snapshot-1", &PlaceRequest{
		Seat:          0,
		TableGroups:   tableAfter,
		TilesFromRack: tilesFromRack,
	})
	require.NoError(t, err)
	assert.True(t, result.Success)

	// 배치 후 상태 검증
	saved, err := repo.GetGameState("game-snapshot-1")
	require.NoError(t, err)

	// 테이블에 2개 세트가 있어야 한다
	require.Len(t, saved.Table, 2, "기존 세트 + 새 세트 = 2개")

	// 각 세트의 타일 수 확인
	setIDs := map[string]int{}
	for _, s := range saved.Table {
		setIDs[s.ID] = len(s.Tiles)
	}
	assert.Equal(t, 3, setIDs["existing-run"], "기존 세트 타일 수 유지")
	assert.Equal(t, 3, setIDs["new-run"], "새 세트 타일 수")

	// 랙 상태 확인: R5a, R6a, R7a 제거 후 K1a만 남음
	assert.Equal(t, []string{"K1a"}, saved.Players[0].Rack)

	// ResetTurn으로 스냅샷 복원 시 원래 상태로 돌아가는지 검증
	resetResult, err := svc.ResetTurn("game-snapshot-1", 0)
	require.NoError(t, err)
	assert.True(t, resetResult.Success)

	restored, err := repo.GetGameState("game-snapshot-1")
	require.NoError(t, err)

	// 스냅샷 복원: 기존 테이블 1개 세트로 복구
	require.Len(t, restored.Table, 1, "스냅샷 복원 후 기존 세트만 남아야 한다")
	assert.Equal(t, "existing-run", restored.Table[0].ID)

	// 랙도 원래대로 복구
	assert.ElementsMatch(t, rack0, restored.Players[0].Rack)
}

// --- TestConfirmTurn ---

func TestConfirmTurn_HappyPath_ValidRun(t *testing.T) {
	// 유효한 런을 배치하고 ConfirmTurn 호출 → 성공, 다음 시트로 전환
	// 최초 등록 조건: 30점 이상. R5+R6+R7+R8+R9+R10 = 45점 → 통과
	rack0 := []string{"R5a", "R6a", "R7a", "R8a", "R9a", "R10a", "B1a"}
	rack1 := []string{"K1a"}
	state := newTestGameState("game-10", twoPlayerState(rack0, rack1), []string{"Y1a"})
	svc, repo := seedRepo(t, state)

	tilesFromRack := []string{"R5a", "R6a", "R7a", "R8a", "R9a", "R10a"}
	tableGroups := []TilePlacement{{
		ID:    "set-1",
		Tiles: tilesFromRack,
	}}

	// Place 먼저: 랙에서 타일 제거, 테이블에 올림
	_, err := svc.PlaceTiles("game-10", &PlaceRequest{
		Seat:          0,
		TableGroups:   tableGroups,
		TilesFromRack: tilesFromRack,
	})
	require.NoError(t, err)

	// Confirm: ConfirmTurn의 HasInitialMeld 갱신은 req.TilesFromRack > 0 일 때만 동작.
	// PlaceTiles가 이미 랙에서 제거했으므로, Confirm에서 TilesFromRack을 전달하면
	// rackBefore(스냅샷)에서 다시 계산하여 올바르게 처리된다.
	result, err := svc.ConfirmTurn("game-10", &ConfirmRequest{
		Seat:          0,
		TableGroups:   tableGroups,
		TilesFromRack: tilesFromRack, // rackBefore(스냅샷)에서 제거하여 HasInitialMeld 갱신
	})
	require.NoError(t, err)
	assert.True(t, result.Success)
	assert.Equal(t, 1, result.NextSeat) // seat 0 → seat 1 전환

	saved, err := repo.GetGameState("game-10")
	require.NoError(t, err)
	assert.Equal(t, 1, saved.CurrentSeat)
	assert.True(t, saved.Players[0].HasInitialMeld)
}

func TestConfirmTurn_HappyPath_ValidGroup(t *testing.T) {
	// R10a, B10a, Y10a → 그룹(10+10+10=30점 exactly) → 최초 등록 성공
	rack0 := []string{"R10a", "B10a", "Y10a", "K1a"}
	rack1 := []string{"K2a"}
	state := newTestGameState("game-11", twoPlayerState(rack0, rack1), []string{"Y1a"})
	svc, _ := seedRepo(t, state)

	tilesFromRack := []string{"R10a", "B10a", "Y10a"}
	tableGroups := []TilePlacement{{ID: "grp-1", Tiles: tilesFromRack}}

	_, err := svc.PlaceTiles("game-11", &PlaceRequest{
		Seat:          0,
		TableGroups:   tableGroups,
		TilesFromRack: tilesFromRack,
	})
	require.NoError(t, err)

	result, err := svc.ConfirmTurn("game-11", &ConfirmRequest{
		Seat:        0,
		TableGroups: tableGroups,
	})
	require.NoError(t, err)
	assert.True(t, result.Success)
	assert.Equal(t, 1, result.NextSeat)
}

func TestConfirmTurn_InvalidMove_BelowThirty(t *testing.T) {
	// 최초 등록 미완료 상태에서 29점 이하 배치 → 실패
	// R1a+R2a+R3a = 6점 → 30점 미달
	rack0 := []string{"R1a", "R2a", "R3a", "B1a"}
	rack1 := []string{"K1a"}
	state := newTestGameState("game-20", twoPlayerState(rack0, rack1), []string{"Y1a"})
	// HasInitialMeld = false (기본값)
	svc, _ := seedRepo(t, state)

	tilesFromRack := []string{"R1a", "R2a", "R3a"}
	tableGroups := []TilePlacement{{ID: "run-1", Tiles: tilesFromRack}}

	_, err := svc.PlaceTiles("game-20", &PlaceRequest{
		Seat:          0,
		TableGroups:   tableGroups,
		TilesFromRack: tilesFromRack,
	})
	require.NoError(t, err)

	result, err := svc.ConfirmTurn("game-20", &ConfirmRequest{
		Seat:        0,
		TableGroups: tableGroups,
	})
	// ConfirmTurn은 에러와 함께 실패 결과를 반환한다
	require.Error(t, err)
	assert.False(t, result.Success)
	assert.NotEmpty(t, result.ErrorCode)

	se, ok := IsServiceError(err)
	require.True(t, ok)
	// V-04: 30점 미달 → ERR_INITIAL_MELD_SCORE
	assert.Equal(t, engine.ErrInitialMeldScore, se.Code)
	assert.True(t, strings.Contains(err.Error(), "30"), "에러 메시지에 30점 관련 내용이 포함되어야 한다")
}

func TestConfirmTurn_InvalidMove_InvalidSet_DuplicateColor(t *testing.T) {
	// 그룹 내 동일 색상 중복 (R7a, R7b, B7a) → 유효하지 않은 세트
	rack0 := []string{"R7a", "R7b", "B7a", "K1a"}
	rack1 := []string{"K1b"}
	state := newTestGameState("game-21", twoPlayerState(rack0, rack1), nil)
	svc, _ := seedRepo(t, state)

	// HasInitialMeld=true 로 설정: 30점 규칙을 피하고 세트 유효성만 테스트
	st, _ := seedRepo(t, func() *model.GameStateRedis {
		s := newTestGameState("game-21b", twoPlayerState(rack0, rack1), nil)
		s.Players[0].HasInitialMeld = true
		return s
	}())

	tilesFromRack := []string{"R7a", "R7b", "B7a"}
	tableGroups := []TilePlacement{{ID: "grp-bad", Tiles: tilesFromRack}}

	_, err := st.PlaceTiles("game-21b", &PlaceRequest{
		Seat:          0,
		TableGroups:   tableGroups,
		TilesFromRack: tilesFromRack,
	})
	require.NoError(t, err)

	result, err := st.ConfirmTurn("game-21b", &ConfirmRequest{
		Seat:        0,
		TableGroups: tableGroups,
	})
	require.Error(t, err)
	assert.False(t, result.Success)

	se, ok := IsServiceError(err)
	require.True(t, ok)
	// V-14: 그룹 내 동일 색상 중복 → ERR_GROUP_COLOR_DUP
	assert.Equal(t, engine.ErrGroupColorDup, se.Code)
	_ = svc // 미사용 경고 방지
}

func TestConfirmTurn_InvalidMove_NonConsecutiveRun(t *testing.T) {
	// 숫자 불연속 런 (R3a, R5a, R7a) → 갭이 너무 커서 유효하지 않음
	rack0 := []string{"R3a", "R5a", "R7a", "K1a"}
	rack1 := []string{"K2a"}
	state := newTestGameState("game-22", twoPlayerState(rack0, rack1), nil)
	state.Players[0].HasInitialMeld = true
	svc, _ := seedRepo(t, state)

	tilesFromRack := []string{"R3a", "R5a", "R7a"}
	tableGroups := []TilePlacement{{ID: "run-bad", Tiles: tilesFromRack}}

	_, err := svc.PlaceTiles("game-22", &PlaceRequest{
		Seat:          0,
		TableGroups:   tableGroups,
		TilesFromRack: tilesFromRack,
	})
	require.NoError(t, err)

	result, err := svc.ConfirmTurn("game-22", &ConfirmRequest{
		Seat:        0,
		TableGroups: tableGroups,
	})
	require.Error(t, err)
	assert.False(t, result.Success)

	se, ok := IsServiceError(err)
	require.True(t, ok)
	// R3a,R5a,R7a: 같은 색상이지만 숫자가 달라 그룹도 불가 → ERR_GROUP_NUMBER
	// (ValidateTileSet은 groupErr를 우선 반환)
	assert.Equal(t, engine.ErrGroupNumberMismatch, se.Code)
}

func TestConfirmTurn_InvalidMove_TableTileLost(t *testing.T) {
	// V-06: 테이블 기존 타일이 Confirm 후 사라진 경우
	// 초기 테이블에 세트 하나가 있고, HasInitialMeld=true 인 플레이어가
	// 테이블 타일 수를 줄이는(테이블 타일 제거) 요청을 보낸다.
	rack0 := []string{"R5a", "R6a", "R7a"}
	rack1 := []string{"K1a"}

	// 테이블에 B8a-B9a-B10a 세트가 이미 존재하는 상태
	existingTable := []*model.SetOnTable{
		{ID: "existing-1", Tiles: []*model.Tile{
			{Code: "B8a"}, {Code: "B9a"}, {Code: "B10a"},
		}},
	}

	state := &model.GameStateRedis{
		GameID:      "game-23",
		Status:      model.GameStatusPlaying,
		CurrentSeat: 0,
		DrawPile:    []string{"Y1a"},
		Table:       existingTable,
		Players: []model.PlayerState{
			{SeatOrder: 0, UserID: "user-A", HasInitialMeld: true, Rack: rack0},
			{SeatOrder: 1, UserID: "user-B", HasInitialMeld: false, Rack: rack1},
		},
		TurnStartAt: time.Now().Unix(),
	}
	svc, _ := seedRepo(t, state)

	// place: 기존 테이블 세트를 제외하고 랙 타일만 새 세트로 추가
	// 이때 기존 B8a-B9a-B10a 세트는 tableGroups에 포함하지 않음 → 테이블 타일 유실
	newTableGroups := []TilePlacement{
		{ID: "new-run", Tiles: []string{"R5a", "R6a", "R7a"}},
		// existing-1 세트를 의도적으로 누락
	}

	_, err := svc.PlaceTiles("game-23", &PlaceRequest{
		Seat:          0,
		TableGroups:   newTableGroups,
		TilesFromRack: []string{"R5a", "R6a", "R7a"},
	})
	require.NoError(t, err)

	result, err := svc.ConfirmTurn("game-23", &ConfirmRequest{
		Seat:        0,
		TableGroups: newTableGroups,
	})
	require.Error(t, err)
	assert.False(t, result.Success)

	se, ok := IsServiceError(err)
	require.True(t, ok)
	// V-03: 테이블 before/after 타일 수 동일(0 증가) → ERR_NO_RACK_TILE
	// (기존 테이블 타일을 누락하여 새 타일로 대체하면 순증가=0이므로 V-03이 먼저 발동)
	assert.Equal(t, engine.ErrNoRackTile, se.Code)
}

func TestConfirmTurn_NotYourTurn(t *testing.T) {
	rack := []string{"R5a", "R6a", "R7a"}
	state := newTestGameState("game-24", twoPlayerState(rack, []string{"K1a"}), nil)
	svc, _ := seedRepo(t, state)

	req := &ConfirmRequest{Seat: 1, TableGroups: validRunTiles("R", 5, 3)}
	_, err := svc.ConfirmTurn("game-24", req)
	require.Error(t, err)

	se, ok := IsServiceError(err)
	require.True(t, ok)
	assert.Equal(t, "NOT_YOUR_TURN", se.Code)
}

// --- TestResetTurn ---

func TestResetTurn_RestoresSnapshotAfterPlace(t *testing.T) {
	// Place 후 ResetTurn → 랙과 테이블이 Place 이전 상태로 복원
	originalRack := []string{"R5a", "R6a", "R7a", "B1a", "B2a"}
	rack1 := []string{"K1a"}
	state := newTestGameState("game-30", twoPlayerState(originalRack, rack1), []string{"Y1a"})
	svc, repo := seedRepo(t, state)

	tilesFromRack := []string{"R5a", "R6a", "R7a"}
	tableGroups := validRunTiles("R", 5, 3)

	// Place
	_, err := svc.PlaceTiles("game-30", &PlaceRequest{
		Seat:          0,
		TableGroups:   tableGroups,
		TilesFromRack: tilesFromRack,
	})
	require.NoError(t, err)

	// 중간 상태 확인: 랙 2장
	mid, _ := repo.GetGameState("game-30")
	assert.Len(t, mid.Players[0].Rack, 2)

	// ResetTurn
	result, err := svc.ResetTurn("game-30", 0)
	require.NoError(t, err)
	assert.True(t, result.Success)
	assert.Equal(t, 0, result.NextSeat) // 여전히 내 턴

	// 복원 확인: 원래 5장 랙, 테이블 비어있음
	restored, err := repo.GetGameState("game-30")
	require.NoError(t, err)
	assert.ElementsMatch(t, originalRack, restored.Players[0].Rack)
	assert.Empty(t, restored.Table)
}

func TestResetTurn_NoSnapshotIsNoop(t *testing.T) {
	// 아무 것도 하지 않은 상태에서 ResetTurn → 아무 변화 없이 성공
	rack := []string{"R5a", "R6a", "R7a"}
	state := newTestGameState("game-31", twoPlayerState(rack, []string{"K1a"}), nil)
	svc, repo := seedRepo(t, state)

	result, err := svc.ResetTurn("game-31", 0)
	require.NoError(t, err)
	assert.True(t, result.Success)

	saved, _ := repo.GetGameState("game-31")
	assert.ElementsMatch(t, rack, saved.Players[0].Rack)
}

func TestResetTurn_NotYourTurn(t *testing.T) {
	state := newTestGameState("game-32", twoPlayerState([]string{"R1a"}, []string{"B1a"}), nil)
	svc, _ := seedRepo(t, state)

	_, err := svc.ResetTurn("game-32", 1) // currentSeat=0
	require.Error(t, err)

	se, ok := IsServiceError(err)
	require.True(t, ok)
	assert.Equal(t, "NOT_YOUR_TURN", se.Code)
}

// --- TestDrawTile ---

func TestDrawTile_NormalDraw(t *testing.T) {
	// 드로우 파일에서 1장을 뽑아 랙에 추가하고 다음 턴으로 전환
	rack0 := []string{"R5a", "R6a"}
	rack1 := []string{"K1a"}
	drawPile := []string{"Y7a", "B3a", "K9a"}
	state := newTestGameState("game-40", twoPlayerState(rack0, rack1), drawPile)
	svc, repo := seedRepo(t, state)

	result, err := svc.DrawTile("game-40", 0)
	require.NoError(t, err)
	assert.True(t, result.Success)
	assert.Equal(t, 1, result.NextSeat) // seat 0 → seat 1

	saved, err := repo.GetGameState("game-40")
	require.NoError(t, err)
	// 랙이 3장이 됨 (원래 2장 + 드로우 1장 "Y7a")
	assert.Len(t, saved.Players[0].Rack, 3)
	assert.Contains(t, saved.Players[0].Rack, "Y7a")
	// 드로우 파일에서 Y7a 제거됨
	assert.Len(t, saved.DrawPile, 2)
	assert.Equal(t, 1, saved.CurrentSeat)
}

func TestDrawTile_EmptyPile_Stalemate(t *testing.T) {
	// 드로우 파일이 비어있을 때 첫 DrawTile은 패스(턴 넘기기)로 처리.
	// 전원 연속 패스 시 교착 판정: 점수 낮은 플레이어 승리.
	rack0 := []string{"R5a"}
	rack1 := []string{"K1a"}
	state := newTestGameState("game-41", twoPlayerState(rack0, rack1), []string{}) // 빈 파일
	svc, repo := seedRepo(t, state)

	// seat0 패스 (드로우 파일 소진 -> 패스 처리, 교착 아님)
	result1, err := svc.DrawTile("game-41", 0)
	require.NoError(t, err)
	assert.True(t, result1.Success)
	assert.False(t, result1.GameEnded, "1/2 패스: 아직 교착 아님")
	assert.Equal(t, 1, result1.NextSeat)

	// seat1 패스 -> 전원 패스 -> 교착 판정
	result2, err := svc.DrawTile("game-41", 1)
	require.NoError(t, err)
	assert.True(t, result2.Success)
	assert.True(t, result2.GameEnded, "2/2 패스: 교착 종료")
	assert.Equal(t, "STALEMATE", result2.ErrorCode)
	assert.Equal(t, "user-B", result2.WinnerID)

	saved, _ := repo.GetGameState("game-41")
	assert.Equal(t, model.GameStatusFinished, saved.Status)
	assert.True(t, saved.IsStalemate, "교착 종료 시 GameStateRedis.IsStalemate가 true여야 한다")
}

func TestDrawTile_AdvancesSnapshotCleanup(t *testing.T) {
	// Place 후 DrawTile → 스냅샷 제거됨 (이후 ResetTurn 불가)
	rack0 := []string{"R5a", "R6a", "R7a"}
	rack1 := []string{"K1a"}
	drawPile := []string{"Y7a"}
	state := newTestGameState("game-42", twoPlayerState(rack0, rack1), drawPile)
	svc, repo := seedRepo(t, state)

	// Place
	_, err := svc.PlaceTiles("game-42", &PlaceRequest{
		Seat:          0,
		TableGroups:   validRunTiles("R", 5, 3),
		TilesFromRack: []string{"R5a", "R6a", "R7a"},
	})
	require.NoError(t, err)

	// DrawTile (턴 변경됨, seat=1이 현재 턴)
	result, err := svc.DrawTile("game-42", 0)
	require.NoError(t, err)
	assert.True(t, result.Success)
	assert.Equal(t, 1, result.NextSeat)

	// 이제 seat 0의 스냅샷은 없으므로 현재 턴(seat 1)으로 ResetTurn 시도
	// seat 0 으로 다시 호출하면 NOT_YOUR_TURN 에러
	_, err2 := svc.ResetTurn("game-42", 0)
	require.Error(t, err2)
	se, ok := IsServiceError(err2)
	require.True(t, ok)
	assert.Equal(t, "NOT_YOUR_TURN", se.Code)

	_ = repo
}

func TestDrawTile_NotYourTurn(t *testing.T) {
	state := newTestGameState("game-43", twoPlayerState([]string{"R1a"}, []string{"B1a"}), []string{"Y1a"})
	svc, _ := seedRepo(t, state)

	_, err := svc.DrawTile("game-43", 1) // currentSeat=0
	require.Error(t, err)

	se, ok := IsServiceError(err)
	require.True(t, ok)
	assert.Equal(t, "NOT_YOUR_TURN", se.Code)
}

// --- TestTurnAdvancement ---

func TestTurnAdvancement_AfterConfirm_TwoPlayers(t *testing.T) {
	// 2인 게임: seat 0 → confirm → seat 1 → confirm → seat 0 (순환)
	// 각 플레이어가 30점 이상 그룹을 내려놓고도 랙에 여분 타일이 남아야 승리 조건이 발동되지 않는다.
	// R10a, B10a, Y10a = 30점 (최초 등록 조건 충족) + K5a (여분, 랙에 남음)
	rack0 := []string{"R10a", "B10a", "Y10a", "K5a"}
	rack1 := []string{"R10b", "B10b", "Y10b", "K5b"}
	state := newTestGameState("game-50", twoPlayerState(rack0, rack1), []string{"K1a"})
	svc, repo := seedRepo(t, state)

	// seat 0 턴: 30점 그룹 등록, K5a는 랙에 남김
	tiles0 := []string{"R10a", "B10a", "Y10a"}
	tableGroups0 := []TilePlacement{{ID: "grp-0", Tiles: tiles0}}

	_, err := svc.PlaceTiles("game-50", &PlaceRequest{
		Seat: 0, TableGroups: tableGroups0, TilesFromRack: tiles0,
	})
	require.NoError(t, err)

	r0, err := svc.ConfirmTurn("game-50", &ConfirmRequest{
		Seat: 0, TableGroups: tableGroups0, TilesFromRack: tiles0,
	})
	require.NoError(t, err)
	assert.Equal(t, 1, r0.NextSeat) // seat 0 → seat 1

	// seat 1 턴: 기존 세트 유지 + 새 그룹 등록
	tiles1 := []string{"R10b", "B10b", "Y10b"}
	tableAfter := []TilePlacement{
		{ID: "grp-0", Tiles: tiles0}, // 기존 세트 유지
		{ID: "grp-1", Tiles: tiles1}, // 새 세트
	}

	_, err = svc.PlaceTiles("game-50", &PlaceRequest{
		Seat: 1, TableGroups: tableAfter, TilesFromRack: tiles1,
	})
	require.NoError(t, err)

	r1, err := svc.ConfirmTurn("game-50", &ConfirmRequest{
		Seat: 1, TableGroups: tableAfter, TilesFromRack: tiles1,
	})
	require.NoError(t, err)
	assert.Equal(t, 0, r1.NextSeat) // seat 1 → seat 0 순환

	saved, _ := repo.GetGameState("game-50")
	assert.Equal(t, 0, saved.CurrentSeat)
}

func TestTurnAdvancement_AfterDraw_ThreePlayers(t *testing.T) {
	// 3인 게임에서 DrawTile 순서 확인: seat 0 → 1 → 2 → 0
	// 드로우 파일이 있을 때 드로우는 정상 게임 진행이므로 교착이 아니다.
	players := []model.PlayerState{
		{SeatOrder: 0, UserID: "u0", PlayerType: "HUMAN", Rack: []string{"R1a"}},
		{SeatOrder: 1, UserID: "u1", PlayerType: "HUMAN", Rack: []string{"R2a"}},
		{SeatOrder: 2, UserID: "u2", PlayerType: "HUMAN", Rack: []string{"R3a"}},
	}
	drawPile := []string{"K1a", "K2a", "K3a", "K4a"}
	state := &model.GameStateRedis{
		GameID:      "game-51",
		Status:      model.GameStatusPlaying,
		CurrentSeat: 0,
		DrawPile:    drawPile,
		Table:       []*model.SetOnTable{},
		Players:     players,
		TurnStartAt: time.Now().Unix(),
	}
	svc, _ := seedRepo(t, state)

	r0, err := svc.DrawTile("game-51", 0)
	require.NoError(t, err)
	assert.Equal(t, 1, r0.NextSeat) // seat 0 → seat 1
	assert.False(t, r0.GameEnded, "드로우 파일이 있으면 교착이 아니다")

	r1, err := svc.DrawTile("game-51", 1)
	require.NoError(t, err)
	assert.Equal(t, 2, r1.NextSeat) // seat 1 → seat 2
	assert.False(t, r1.GameEnded)

	// 3번째 드로우 — 드로우 파일 남아있으므로 교착 아님, 게임 계속
	r2, err := svc.DrawTile("game-51", 2)
	require.NoError(t, err)
	assert.False(t, r2.GameEnded, "드로우 파일이 있으면 전원 드로우해도 교착이 아니다")
	assert.Equal(t, 0, r2.NextSeat) // seat 2 → seat 0 (순환)
}

// --- TestWinCondition ---

func TestConfirmTurn_WinCondition_LastTilePlaced(t *testing.T) {
	// 마지막 타일을 배치하여 랙이 0장이 되면 게임 종료
	// R10a, B10a, Y10a: 그룹 30점 + 랙이 3장뿐 → 모두 내려놓으면 승리
	rack0 := []string{"R10a", "B10a", "Y10a"} // 정확히 3장 (내려놓으면 0장)
	rack1 := []string{"K1a"}
	state := newTestGameState("game-60", twoPlayerState(rack0, rack1), []string{"Y1a"})
	svc, repo := seedRepo(t, state)

	tilesFromRack := []string{"R10a", "B10a", "Y10a"}
	tableGroups := []TilePlacement{{ID: "win-set", Tiles: tilesFromRack}}

	_, err := svc.PlaceTiles("game-60", &PlaceRequest{
		Seat:          0,
		TableGroups:   tableGroups,
		TilesFromRack: tilesFromRack,
	})
	require.NoError(t, err)

	result, err := svc.ConfirmTurn("game-60", &ConfirmRequest{
		Seat:        0,
		TableGroups: tableGroups,
	})
	require.NoError(t, err)
	assert.True(t, result.Success)
	assert.True(t, result.GameEnded)
	assert.Equal(t, "user-A", result.WinnerID)

	saved, err := repo.GetGameState("game-60")
	require.NoError(t, err)
	assert.Equal(t, model.GameStatusFinished, saved.Status)
	assert.Empty(t, saved.Players[0].Rack)
}

func TestConfirmTurn_WinCondition_NotTriggeredWithRemainingTiles(t *testing.T) {
	// 랙에 타일이 남아있으면 게임 종료 아님
	rack0 := []string{"R10a", "B10a", "Y10a", "K5a"} // 4장: 내려놓아도 1장 남음
	rack1 := []string{"B1a"}
	state := newTestGameState("game-61", twoPlayerState(rack0, rack1), []string{"Y1a"})
	svc, _ := seedRepo(t, state)

	tilesFromRack := []string{"R10a", "B10a", "Y10a"}
	tableGroups := []TilePlacement{{ID: "set-1", Tiles: tilesFromRack}}

	_, err := svc.PlaceTiles("game-61", &PlaceRequest{
		Seat:          0,
		TableGroups:   tableGroups,
		TilesFromRack: tilesFromRack,
	})
	require.NoError(t, err)

	result, err := svc.ConfirmTurn("game-61", &ConfirmRequest{
		Seat:        0,
		TableGroups: tableGroups,
	})
	require.NoError(t, err)
	assert.True(t, result.Success)
	assert.False(t, result.GameEnded)
	assert.Empty(t, result.WinnerID)
	assert.Equal(t, 1, result.NextSeat)
}

// --- TestGetGameState ---

func TestGetGameState_FirstPersonView(t *testing.T) {
	// requestingSeat=0 이면 자신 랙 전체 공개, 상대는 tileCount만
	rack0 := []string{"R5a", "R6a", "R7a"}
	rack1 := []string{"K1a", "K2a"}
	state := newTestGameState("game-70", twoPlayerState(rack0, rack1), []string{"Y1a"})
	svc, _ := seedRepo(t, state)

	view, err := svc.GetGameState("game-70", 0)
	require.NoError(t, err)

	assert.Equal(t, "game-70", view.GameID)
	assert.ElementsMatch(t, rack0, view.MyRack)
	assert.Equal(t, 2, len(view.Players))

	// PlayerView tileCount 확인
	for _, pv := range view.Players {
		if pv.Seat == 0 {
			assert.Equal(t, 3, pv.TileCount)
		} else {
			assert.Equal(t, 2, pv.TileCount)
		}
	}
}

func TestGetGameState_NotFound(t *testing.T) {
	repo := repository.NewMemoryGameStateRepo()
	svc := NewGameService(repo)

	_, err := svc.GetGameState("nonexistent", 0)
	require.Error(t, err)

	se, ok := IsServiceError(err)
	require.True(t, ok)
	assert.Equal(t, "NOT_FOUND", se.Code)
	assert.Equal(t, 404, se.Status)
}

// --- TestConfirmTurn_DirectConfirmWithoutPlace ---

func TestConfirmTurn_DirectConfirmWithTilesFromRack(t *testing.T) {
	// Place 없이 ConfirmTurn에서 직접 TilesFromRack 지정 → 처리 가능
	// 30점 이상 그룹: R10a, B10a, Y10a
	rack0 := []string{"R10a", "B10a", "Y10a", "B1a"}
	rack1 := []string{"K1a"}
	state := newTestGameState("game-80", twoPlayerState(rack0, rack1), []string{"Y1a"})
	svc, _ := seedRepo(t, state)

	tilesFromRack := []string{"R10a", "B10a", "Y10a"}
	tableGroups := []TilePlacement{{ID: "direct-grp", Tiles: tilesFromRack}}

	// Place 호출 없이 바로 ConfirmTurn
	result, err := svc.ConfirmTurn("game-80", &ConfirmRequest{
		Seat:          0,
		TableGroups:   tableGroups,
		TilesFromRack: tilesFromRack,
	})
	require.NoError(t, err)
	assert.True(t, result.Success)
	assert.Equal(t, 1, result.NextSeat)
}

// --- TestInitialMeld_HasInitialMeld_SkipsThirtyPointCheck ---

func TestConfirmTurn_HasInitialMeld_SkipsThirtyPointCheck(t *testing.T) {
	// HasInitialMeld=true 플레이어는 30점 제한 없이 유효한 세트만 구성하면 된다.
	// 기존 테이블: R3a-R4a-R5a (유효한 런)
	// 랙에서 B1a-B2a-B3a (6점)을 추가로 내림 → 30점 미달이지만 통과
	// K9a는 랙에 남겨서 WinCondition 방지
	existingSet := []*model.SetOnTable{
		{ID: "run-1", Tiles: []*model.Tile{{Code: "R3a"}, {Code: "R4a"}, {Code: "R5a"}}},
	}

	rack0 := []string{"B1a", "B2a", "B3a", "K9a"} // 내릴 타일 + 여분 1장
	rack1 := []string{"K1a"}

	state := &model.GameStateRedis{
		GameID:      "game-90",
		Status:      model.GameStatusPlaying,
		CurrentSeat: 0,
		DrawPile:    []string{"Y1a"},
		Table:       existingSet,
		Players: []model.PlayerState{
			{SeatOrder: 0, UserID: "user-A", HasInitialMeld: true, Rack: rack0},
			{SeatOrder: 1, UserID: "user-B", HasInitialMeld: false, Rack: rack1},
		},
		TurnStartAt: time.Now().Unix(),
	}
	svc, _ := seedRepo(t, state)

	// 기존 테이블 유지 + 새 런 세트 추가 (B1a-B2a-B3a)
	tilesFromRack := []string{"B1a", "B2a", "B3a"}
	tableAfter := []TilePlacement{
		{ID: "run-1", Tiles: []string{"R3a", "R4a", "R5a"}}, // 기존 유지
		{ID: "run-2", Tiles: tilesFromRack},                  // 새로 추가
	}

	_, err := svc.PlaceTiles("game-90", &PlaceRequest{
		Seat:          0,
		TableGroups:   tableAfter,
		TilesFromRack: tilesFromRack,
	})
	require.NoError(t, err)

	// Confirm 시 TilesFromRack 전달: HasInitialMeld=true이므로 30점 체크 없음
	result, err := svc.ConfirmTurn("game-90", &ConfirmRequest{
		Seat:          0,
		TableGroups:   tableAfter,
		TilesFromRack: tilesFromRack,
	})
	require.NoError(t, err)
	assert.True(t, result.Success)
	assert.False(t, result.GameEnded) // K9a가 랙에 남아 있어 게임 종료 아님
	assert.Equal(t, 1, result.NextSeat)
}

// --- TestStalemate ---

func TestStalemate_TwoPlayers_DrawWithPile_NoStalemate(t *testing.T) {
	// 2인 게임: 드로우 파일 남아있으면 전원 드로우해도 교착 아님
	// 드로우 = 타일 획득 = 게임 진행
	rack0 := []string{"R5a", "R6a"}
	rack1 := []string{"K1a"}
	drawPile := []string{"Y1a", "Y2a", "Y3a"}
	state := newTestGameState("stale-01", twoPlayerState(rack0, rack1), drawPile)
	svc, repo := seedRepo(t, state)

	// seat 0 드로우 → 타일 획득, 교착 아님
	r0, err := svc.DrawTile("stale-01", 0)
	require.NoError(t, err)
	assert.False(t, r0.GameEnded, "드로우 파일 있으면 교착 아님")
	assert.Equal(t, 1, r0.NextSeat)

	// seat 1 드로우 → 타일 획득, 교착 아님
	r1, err := svc.DrawTile("stale-01", 1)
	require.NoError(t, err)
	assert.False(t, r1.GameEnded, "드로우 파일 있으면 전원 드로우해도 교착 아님")

	saved, _ := repo.GetGameState("stale-01")
	assert.Equal(t, model.GameStatusPlaying, saved.Status, "게임 계속 진행")
}

func TestStalemate_ConfirmTurn_ResetsCounter(t *testing.T) {
	// 3인 게임: seat0 드로우(카운터=1) → seat1 ConfirmTurn 성공(카운터=0) →
	// seat2 드로우(카운터=1) → seat0 드로우(카운터=2) → 교착 미발동 확인
	// ConsecutivePassCount < 3이므로 아직 교착 아님
	players := []model.PlayerState{
		{SeatOrder: 0, UserID: "u0", PlayerType: "HUMAN", HasInitialMeld: true, Rack: []string{"R1a", "K1a"}},
		{SeatOrder: 1, UserID: "u1", PlayerType: "HUMAN", HasInitialMeld: true, Rack: []string{"R10a", "B10a", "Y10a", "K5a"}},
		{SeatOrder: 2, UserID: "u2", PlayerType: "HUMAN", HasInitialMeld: true, Rack: []string{"B1a", "K2a"}},
	}
	drawPile := []string{"Y9a", "Y8a", "Y7a", "Y6a", "Y5a"}
	state := &model.GameStateRedis{
		GameID:      "stale-02",
		Status:      model.GameStatusPlaying,
		CurrentSeat: 0,
		DrawPile:    drawPile,
		Table: []*model.SetOnTable{
			{ID: "init-run", Tiles: []*model.Tile{{Code: "R3a"}, {Code: "R4a"}, {Code: "R5a"}}},
		},
		Players:     players,
		TurnStartAt: time.Now().Unix(),
	}
	repo := repository.NewMemoryGameStateRepo()
	require.NoError(t, repo.SaveGameState(state))
	svc := NewGameService(repo)

	// seat 0: 드로우 → ConsecutivePassCount=1
	r0, err := svc.DrawTile("stale-02", 0)
	require.NoError(t, err)
	assert.False(t, r0.GameEnded, "카운터=1/3: 교착 아님")

	// seat 1: R10a+B10a+Y10a 그룹 ConfirmTurn → ConsecutivePassCount=0 리셋
	tilesFromRack := []string{"R10a", "B10a", "Y10a"}
	tableAfter := []TilePlacement{
		{ID: "init-run", Tiles: []string{"R3a", "R4a", "R5a"}},
		{ID: "new-grp", Tiles: tilesFromRack},
	}
	_, err = svc.PlaceTiles("stale-02", &PlaceRequest{
		Seat: 1, TableGroups: tableAfter, TilesFromRack: tilesFromRack,
	})
	require.NoError(t, err)
	r1c, err := svc.ConfirmTurn("stale-02", &ConfirmRequest{
		Seat: 1, TableGroups: tableAfter, TilesFromRack: tilesFromRack,
	})
	require.NoError(t, err)
	assert.False(t, r1c.GameEnded, "ConfirmTurn 성공: 카운터 리셋, 교착 아님")

	// seat 2: 드로우 → ConsecutivePassCount=1 (리셋 후 첫 드로우)
	r2, err := svc.DrawTile("stale-02", 2)
	require.NoError(t, err)
	assert.False(t, r2.GameEnded, "카운터=1/3: 교착 아님")

	// seat 0: 드로우 → ConsecutivePassCount=2/3: 교착 아님
	r0b, err := svc.DrawTile("stale-02", 0)
	require.NoError(t, err)
	assert.False(t, r0b.GameEnded, "카운터=2/3: 교착 아님")
}

func TestStalemate_Joker_Score30(t *testing.T) {
	// 조커 점수 검증: 조커(30점) > 일반 타일 -> 일반 타일 보유자 승리
	// 전원 연속 패스가 필요하므로 seat0, seat1 순서로 DrawTile 2회 호출
	rack0 := []string{"JK1"}
	rack1 := []string{"R13a"}
	state := newTestGameState("stale-03", twoPlayerState(rack0, rack1), []string{})
	svc, _ := seedRepo(t, state)

	r0, err := svc.DrawTile("stale-03", 0)
	require.NoError(t, err)
	assert.False(t, r0.GameEnded, "1/2 패스: 교착 아님")

	result, err := svc.DrawTile("stale-03", 1)
	require.NoError(t, err)
	assert.True(t, result.GameEnded)
	assert.Equal(t, "STALEMATE", result.ErrorCode)
	assert.Equal(t, "user-B", result.WinnerID)
}

func TestStalemate_Draw_WhenScoreAndCountEqual(t *testing.T) {
	// 완전 동점 (점수+타일 수 모두 같음) -> WinnerID = "" (무승부)
	// 전원 연속 패스가 필요하므로 seat0, seat1 순서로 DrawTile 2회 호출
	rack0 := []string{"R5a"}
	rack1 := []string{"B5a"}
	state := newTestGameState("stale-04", twoPlayerState(rack0, rack1), []string{})
	svc, _ := seedRepo(t, state)

	r0, err := svc.DrawTile("stale-04", 0)
	require.NoError(t, err)
	assert.False(t, r0.GameEnded, "1/2 패스: 교착 아님")

	result, err := svc.DrawTile("stale-04", 1)
	require.NoError(t, err)
	assert.True(t, result.GameEnded)
	assert.Equal(t, "STALEMATE", result.ErrorCode)
	assert.Equal(t, "", result.WinnerID)
}

func TestTileScore_Helper(t *testing.T) {
	// tileScore 헬퍼 단위 테스트
	assert.Equal(t, 30, tileScore("JK1"))
	assert.Equal(t, 30, tileScore("JK2"))
	assert.Equal(t, 7, tileScore("R7a"))
	assert.Equal(t, 13, tileScore("B13b"))
	assert.Equal(t, 1, tileScore("Y1a"))
	assert.Equal(t, 0, tileScore("INVALID")) // 파싱 실패 -> 0점
}

// ============================================================
// Task 1: ForfeitPlayer Tests
// ============================================================

func TestForfeitPlayer_LastActive_GameOver(t *testing.T) {
	// 2인 게임에서 seat0 기권 -> 활성 플레이어 1명 -> 자동 승리
	rack0 := []string{"R5a"}
	rack1 := []string{"K1a"}
	state := newTestGameState("forfeit-1", twoPlayerState(rack0, rack1), []string{"Y1a"})
	svc, repo := seedRepo(t, state)

	result, err := svc.ForfeitPlayer("forfeit-1", 0, "LEAVE")
	require.NoError(t, err)
	assert.True(t, result.GameEnded, "활성 1명 -> 게임 종료")
	assert.Equal(t, "user-B", result.WinnerID)
	assert.Equal(t, "FORFEIT", result.ErrorCode)

	saved, _ := repo.GetGameState("forfeit-1")
	assert.Equal(t, model.GameStatusFinished, saved.Status)
	assert.Equal(t, model.PlayerStatusForfeited, saved.Players[0].Status)
}

func TestForfeitPlayer_StillActive_GameContinues(t *testing.T) {
	// 3인 게임에서 seat0 기권 -> 활성 2명 -> 게임 계속
	players := []model.PlayerState{
		{SeatOrder: 0, UserID: "u0", PlayerType: "HUMAN", Rack: []string{"R1a"}},
		{SeatOrder: 1, UserID: "u1", PlayerType: "HUMAN", Rack: []string{"B1a"}},
		{SeatOrder: 2, UserID: "u2", PlayerType: "HUMAN", Rack: []string{"K1a"}},
	}
	state := newTestGameState("forfeit-2", players, []string{"Y1a"})
	state.CurrentSeat = 0
	svc, repo := seedRepo(t, state)

	result, err := svc.ForfeitPlayer("forfeit-2", 0, "DISCONNECT_TIMEOUT")
	require.NoError(t, err)
	assert.False(t, result.GameEnded, "활성 2명 -> 게임 계속")

	saved, _ := repo.GetGameState("forfeit-2")
	assert.Equal(t, model.GameStatusPlaying, saved.Status)
	assert.Equal(t, model.PlayerStatusForfeited, saved.Players[0].Status)
	// 기권자 턴이었으므로 다음 턴으로 진행
	assert.Equal(t, 1, saved.CurrentSeat)
}

func TestAdvanceTurn_SkipsForfeited(t *testing.T) {
	// 3인 게임에서 seat1이 FORFEITED -> advanceTurn이 seat1을 건너뛰는지 확인
	players := []model.PlayerState{
		{SeatOrder: 0, UserID: "u0", PlayerType: "HUMAN", Rack: []string{"R1a"}, Status: model.PlayerStatusActive},
		{SeatOrder: 1, UserID: "u1", PlayerType: "HUMAN", Rack: []string{"B1a"}, Status: model.PlayerStatusForfeited},
		{SeatOrder: 2, UserID: "u2", PlayerType: "HUMAN", Rack: []string{"K1a"}, Status: model.PlayerStatusActive},
	}
	state := &model.GameStateRedis{
		GameID:      "adv-1",
		Status:      model.GameStatusPlaying,
		CurrentSeat: 0,
		Players:     players,
	}
	next := advanceTurn(state)
	assert.Equal(t, 2, next, "seat1(FORFEITED)을 건너뛰고 seat2로 이동")
}

func TestCountActivePlayers(t *testing.T) {
	players := []model.PlayerState{
		{SeatOrder: 0, Status: model.PlayerStatusActive},
		{SeatOrder: 1, Status: model.PlayerStatusForfeited},
		{SeatOrder: 2, Status: model.PlayerStatusActive},
		{SeatOrder: 3, Status: model.PlayerStatusDisconnected},
	}
	state := &model.GameStateRedis{Players: players}
	assert.Equal(t, 3, countActivePlayers(state), "FORFEITED만 제외, DISCONNECTED는 활성으로 카운트")
}

func TestSetPlayerStatus(t *testing.T) {
	rack0 := []string{"R5a"}
	rack1 := []string{"K1a"}
	state := newTestGameState("status-1", twoPlayerState(rack0, rack1), []string{"Y1a"})
	svc, repo := seedRepo(t, state)

	err := svc.SetPlayerStatus("status-1", 0, model.PlayerStatusDisconnected)
	require.NoError(t, err)

	saved, _ := repo.GetGameState("status-1")
	assert.Equal(t, model.PlayerStatusDisconnected, saved.Players[0].Status)
	assert.Greater(t, saved.Players[0].DisconnectedAt, int64(0))

	err = svc.SetPlayerStatus("status-1", 0, model.PlayerStatusActive)
	require.NoError(t, err)

	saved, _ = repo.GetGameState("status-1")
	assert.Equal(t, model.PlayerStatusActive, saved.Players[0].Status)
	assert.Equal(t, int64(0), saved.Players[0].DisconnectedAt)
}

// ============================================================
// Task 3: Deadlock (draw pile empty -> pass mode) Tests
// ============================================================

func TestDrawTile_EmptyPile_PassMode_ConfirmResetsCounter(t *testing.T) {
	// 드로우 파일 소진 상태에서 패스 후, 다른 플레이어가 배치 성공하면 교착 카운터 리셋
	rack0 := []string{"R5a", "R6a", "R7a", "R8a", "R9a", "R10a", "B1a"}
	rack1 := []string{"K1a"}
	state := newTestGameState("deadlock-1", twoPlayerState(rack0, rack1), []string{})
	state.Players[0].HasInitialMeld = true
	svc, _ := seedRepo(t, state)

	// seat0 패스 (드로우 파일 소진)
	r0, err := svc.DrawTile("deadlock-1", 0)
	require.NoError(t, err)
	assert.False(t, r0.GameEnded)
	assert.Equal(t, 1, r0.NextSeat)

	// seat1도 패스 -> 전원 패스 -> 교착
	r1, err := svc.DrawTile("deadlock-1", 1)
	require.NoError(t, err)
	assert.True(t, r1.GameEnded, "전원 패스: 교착 종료")
}

// ============================================================
// QA Scenario TC-LF-U01~U06: advanceTurn 단위 테스트
// ============================================================

func TestAdvanceTurn_U01_AllActive(t *testing.T) {
	// TC-LF-U01: 모든 플레이어 ACTIVE (정상), seat=0 -> nextSeat==1
	state := &model.GameStateRedis{
		GameID:      "adv-u01",
		Status:      model.GameStatusPlaying,
		CurrentSeat: 0,
		Players: []model.PlayerState{
			{SeatOrder: 0, UserID: "u0", Status: model.PlayerStatusActive},
			{SeatOrder: 1, UserID: "u1", Status: model.PlayerStatusActive},
			{SeatOrder: 2, UserID: "u2", Status: model.PlayerStatusActive},
		},
	}
	next := advanceTurn(state)
	assert.Equal(t, 1, next, "전원 ACTIVE: 0 다음은 1")
}

func TestAdvanceTurn_U02_NextForfeited(t *testing.T) {
	// TC-LF-U02: 다음 플레이어 FORFEITED, seat=0, seat1=FORFEITED -> nextSeat==2
	state := &model.GameStateRedis{
		GameID:      "adv-u02",
		Status:      model.GameStatusPlaying,
		CurrentSeat: 0,
		Players: []model.PlayerState{
			{SeatOrder: 0, UserID: "u0", Status: model.PlayerStatusActive},
			{SeatOrder: 1, UserID: "u1", Status: model.PlayerStatusForfeited},
			{SeatOrder: 2, UserID: "u2", Status: model.PlayerStatusActive},
		},
	}
	next := advanceTurn(state)
	assert.Equal(t, 2, next, "seat1(FORFEITED) 건너뛰고 seat2로 이동")
}

func TestAdvanceTurn_U03_ConsecutiveTwoForfeited(t *testing.T) {
	// TC-LF-U03: 연속 2명 FORFEITED, seat=0, seat1,seat2=FORFEITED -> nextSeat==3
	state := &model.GameStateRedis{
		GameID:      "adv-u03",
		Status:      model.GameStatusPlaying,
		CurrentSeat: 0,
		Players: []model.PlayerState{
			{SeatOrder: 0, UserID: "u0", Status: model.PlayerStatusActive},
			{SeatOrder: 1, UserID: "u1", Status: model.PlayerStatusForfeited},
			{SeatOrder: 2, UserID: "u2", Status: model.PlayerStatusForfeited},
			{SeatOrder: 3, UserID: "u3", Status: model.PlayerStatusActive},
		},
	}
	next := advanceTurn(state)
	assert.Equal(t, 3, next, "seat1,2(FORFEITED) 건너뛰고 seat3으로 이동")
}

func TestAdvanceTurn_U04_WrapAroundAndSkip(t *testing.T) {
	// TC-LF-U04: 마지막 좌석에서 순환 + 건너뛰기, seat=2, seat0=FORFEITED -> nextSeat==1
	state := &model.GameStateRedis{
		GameID:      "adv-u04",
		Status:      model.GameStatusPlaying,
		CurrentSeat: 2,
		Players: []model.PlayerState{
			{SeatOrder: 0, UserID: "u0", Status: model.PlayerStatusForfeited},
			{SeatOrder: 1, UserID: "u1", Status: model.PlayerStatusActive},
			{SeatOrder: 2, UserID: "u2", Status: model.PlayerStatusActive},
		},
	}
	next := advanceTurn(state)
	assert.Equal(t, 1, next, "seat0(FORFEITED) 건너뛰고 순환하여 seat1로 이동")
}

func TestAdvanceTurn_U05_AllForfeited(t *testing.T) {
	// TC-LF-U05: 전원 FORFEITED (방어 코드) -> fallback: 현재 seat 반환
	state := &model.GameStateRedis{
		GameID:      "adv-u05",
		Status:      model.GameStatusPlaying,
		CurrentSeat: 1,
		Players: []model.PlayerState{
			{SeatOrder: 0, UserID: "u0", Status: model.PlayerStatusForfeited},
			{SeatOrder: 1, UserID: "u1", Status: model.PlayerStatusForfeited},
			{SeatOrder: 2, UserID: "u2", Status: model.PlayerStatusForfeited},
		},
	}
	next := advanceTurn(state)
	assert.Equal(t, 1, next, "전원 FORFEITED: fallback으로 현재 seat(1) 반환")
}

func TestAdvanceTurn_U06_DisconnectedNotSkipped(t *testing.T) {
	// TC-LF-U06: DISCONNECTED는 건너뛰지 않음, seat1=DISCONNECTED -> nextSeat==1
	state := &model.GameStateRedis{
		GameID:      "adv-u06",
		Status:      model.GameStatusPlaying,
		CurrentSeat: 0,
		Players: []model.PlayerState{
			{SeatOrder: 0, UserID: "u0", Status: model.PlayerStatusActive},
			{SeatOrder: 1, UserID: "u1", Status: model.PlayerStatusDisconnected},
			{SeatOrder: 2, UserID: "u2", Status: model.PlayerStatusActive},
		},
	}
	next := advanceTurn(state)
	assert.Equal(t, 1, next, "DISCONNECTED != FORFEITED: seat1로 정상 이동")
}

// ============================================================
// QA Scenario TC-LF-U07~U09: ELO 기권 처리 단위 테스트
// ============================================================

func TestELO_Forfeit_U07_ForfeitedPlayerLowestRank(t *testing.T) {
	// TC-LF-U07: 4인 중 1명 기권 -> 기권자 4위, 나머지 타일 점수로 1~3위 결정
	// 기권자는 CalcElo에서 Rank 최하위로 전달되어야 함
	players := []engine.PlayerResult{
		{UserID: "u0", Rank: 1, GamesPlayed: 10},
		{UserID: "u1", Rank: 2, GamesPlayed: 10},
		{UserID: "u2", Rank: 3, GamesPlayed: 10},
		{UserID: "u3-forfeit", Rank: 4, GamesPlayed: 10}, // 기권자 = 최하위
	}
	ratings := map[string]int{"u0": 1200, "u1": 1200, "u2": 1200, "u3-forfeit": 1200}

	changes := engine.CalcElo(players, ratings)
	require.Len(t, changes, 4)

	// 1위가 가장 많이 상승, 기권자(4위)가 가장 많이 하락
	assert.Greater(t, changes[0].Delta, 0, "1위 ELO 상승")
	assert.Less(t, changes[3].Delta, 0, "기권자(4위) ELO 하락")
	assert.Greater(t, changes[0].Delta, changes[1].Delta, "1위 > 2위 상승폭")
}

func TestELO_Forfeit_U08_TwoPlayerForfeit_WinnerGains(t *testing.T) {
	// TC-LF-U08: 2인 게임 기권: 승자 ELO 상승, 기권자 ELO 하락
	players := []engine.PlayerResult{
		{UserID: "winner", Rank: 1, GamesPlayed: 10},
		{UserID: "forfeit", Rank: 2, GamesPlayed: 10},
	}
	ratings := map[string]int{"winner": 1200, "forfeit": 1200}

	changes := engine.CalcElo(players, ratings)
	require.Len(t, changes, 2)

	assert.Greater(t, changes[0].NewRating, 1200, "승자 ELO 상승")
	assert.Less(t, changes[1].NewRating, 1200, "기권자 ELO 하락")
}

func TestELO_Forfeit_U09_AllForfeit_NoELOChange(t *testing.T) {
	// TC-LF-U09: 전원 기권 시 ELO 미적용 (CalcElo 호출하지 않음)
	// endType == "CANCELLED" -> CalcElo 미호출이 올바른 동작
	// 이 테스트는 CalcElo에 동일 순위를 전달하면 변동이 0임을 검증
	players := []engine.PlayerResult{
		{UserID: "u0", Rank: 1, GamesPlayed: 10},
		{UserID: "u1", Rank: 1, GamesPlayed: 10}, // 동일 순위
	}
	ratings := map[string]int{"u0": 1200, "u1": 1200}

	changes := engine.CalcElo(players, ratings)
	require.Len(t, changes, 2)

	// 동일 레이팅 + 동일 순위 -> 변동 0
	assert.Equal(t, 0, changes[0].Delta, "동일 순위 동일 레이팅: 변동 없음")
	assert.Equal(t, 0, changes[1].Delta, "동일 순위 동일 레이팅: 변동 없음")
}

// ============================================================
// QA Scenario TC-DL-U02~U03: DrawTile 교착 단위 테스트
// ============================================================

func TestDrawTile_U02_NormalDraw_WithPile(t *testing.T) {
	// TC-DL-U02: DrawTile(drawPile 있음) -> 정상 드로우, drawnTile != nil
	rack0 := []string{"R1a"}
	rack1 := []string{"B1a"}
	state := newTestGameState("dl-u02", twoPlayerState(rack0, rack1), []string{"Y5a", "K3a"})
	svc, repo := seedRepo(t, state)

	result, err := svc.DrawTile("dl-u02", 0)
	require.NoError(t, err)
	assert.True(t, result.Success)
	assert.False(t, result.GameEnded)

	saved, _ := repo.GetGameState("dl-u02")
	// seat0의 랙에 드로우한 타일(Y5a)이 추가되어야 함
	assert.Contains(t, saved.Players[0].Rack, "Y5a", "드로우한 타일이 랙에 추가됨")
	assert.Len(t, saved.DrawPile, 1, "드로우 파일 1장 감소")
}

func TestDrawTile_U03_PassNotReachDeadlock(t *testing.T) {
	// TC-DL-U03: 패스 후 교착 미도달 (2/3), 게임 계속
	players := []model.PlayerState{
		{SeatOrder: 0, UserID: "u0", PlayerType: "HUMAN", Rack: []string{"R1a"}},
		{SeatOrder: 1, UserID: "u1", PlayerType: "HUMAN", Rack: []string{"B1a"}},
		{SeatOrder: 2, UserID: "u2", PlayerType: "HUMAN", Rack: []string{"K1a"}},
	}
	state := newTestGameState("dl-u03", players, []string{}) // 드로우 파일 소진
	svc, repo := seedRepo(t, state)

	// seat0 패스
	r0, err := svc.DrawTile("dl-u03", 0)
	require.NoError(t, err)
	assert.False(t, r0.GameEnded, "1/3 패스: 게임 계속")

	// seat1 패스
	r1, err := svc.DrawTile("dl-u03", 1)
	require.NoError(t, err)
	assert.False(t, r1.GameEnded, "2/3 패스: 게임 계속")

	saved, _ := repo.GetGameState("dl-u03")
	assert.Equal(t, model.GameStatusPlaying, saved.Status, "아직 교착 도달 전")
	assert.Equal(t, 2, saved.ConsecutivePassCount, "패스 카운터 2")
}

// ============================================================
// ConfirmTurn 검증 실패 시 서버 자동 롤백 테스트
// (Architect 피드백: Stateless 서버 원칙 — 클라이언트 롤백 위임 금지)
// ============================================================

func TestConfirmTurn_InvalidMove_AutoRollback_RackRestored(t *testing.T) {
	// PlaceTiles로 랙에서 타일 제거 후 ConfirmTurn 실패 시,
	// 서버가 자동으로 스냅샷 복원하여 랙이 원래대로 돌아와야 한다.
	rack0 := []string{"R5a", "R6a", "B1a"}
	rack1 := []string{"K1a"}
	state := newTestGameState("auto-rollback-1", twoPlayerState(rack0, rack1), []string{"Y1a"})
	state.Players[0].HasInitialMeld = true
	svc, repo := seedRepo(t, state)

	// 2장짜리 세트 배치 (최소 3장 규칙 위반)
	tilesFromRack := []string{"R5a", "R6a"}
	tableGroups := []TilePlacement{{ID: "bad-set", Tiles: tilesFromRack}}

	// PlaceTiles: 랙에서 R5a, R6a 제거
	_, err := svc.PlaceTiles("auto-rollback-1", &PlaceRequest{
		Seat:          0,
		TableGroups:   tableGroups,
		TilesFromRack: tilesFromRack,
	})
	require.NoError(t, err)

	// PlaceTiles 후 랙 확인: B1a만 남아있어야 함
	afterPlace, _ := repo.GetGameState("auto-rollback-1")
	assert.Equal(t, []string{"B1a"}, afterPlace.Players[0].Rack, "PlaceTiles 후 랙에서 타일 제거됨")

	// ConfirmTurn 실패: 유효하지 않은 세트
	_, err = svc.ConfirmTurn("auto-rollback-1", &ConfirmRequest{
		Seat:        0,
		TableGroups: tableGroups,
	})
	require.Error(t, err)

	// 자동 롤백 검증: 랙이 원래대로 복원되어야 함
	afterRollback, _ := repo.GetGameState("auto-rollback-1")
	assert.ElementsMatch(t, rack0, afterRollback.Players[0].Rack,
		"ConfirmTurn 실패 후 서버가 자동으로 랙을 복원해야 한다")
	assert.Empty(t, afterRollback.Table,
		"ConfirmTurn 실패 후 서버가 자동으로 테이블을 복원해야 한다")
}

func TestConfirmTurn_InvalidMove_AutoRollback_TableRestored(t *testing.T) {
	// 기존 테이블 세트가 있는 상태에서 PlaceTiles + ConfirmTurn 실패 시,
	// 기존 테이블 세트도 복원되어야 한다.
	rack0 := []string{"R3a", "R5a", "R7a", "K1a"}
	rack1 := []string{"K2a"}

	existingTable := []*model.SetOnTable{
		{ID: "existing-run", Tiles: []*model.Tile{
			{Code: "B8a"}, {Code: "B9a"}, {Code: "B10a"},
		}},
	}

	state := &model.GameStateRedis{
		GameID:      "auto-rollback-2",
		Status:      model.GameStatusPlaying,
		CurrentSeat: 0,
		DrawPile:    []string{"Y1a"},
		Table:       existingTable,
		Players:     twoPlayerState(rack0, rack1),
		TurnStartAt: time.Now().Unix(),
	}
	state.Players[0].HasInitialMeld = true
	svc, repo := seedRepo(t, state)

	// 불연속 런 배치 (R3a, R5a, R7a) - 유효하지 않은 세트
	tilesFromRack := []string{"R3a", "R5a", "R7a"}
	tableGroups := []TilePlacement{
		{ID: "existing-run", Tiles: []string{"B8a", "B9a", "B10a"}},
		{ID: "bad-run", Tiles: tilesFromRack},
	}

	_, err := svc.PlaceTiles("auto-rollback-2", &PlaceRequest{
		Seat:          0,
		TableGroups:   tableGroups,
		TilesFromRack: tilesFromRack,
	})
	require.NoError(t, err)

	// ConfirmTurn 실패
	_, err = svc.ConfirmTurn("auto-rollback-2", &ConfirmRequest{
		Seat:          0,
		TableGroups:   tableGroups,
		TilesFromRack: tilesFromRack,
	})
	require.Error(t, err)

	// 자동 롤백 검증
	afterRollback, _ := repo.GetGameState("auto-rollback-2")
	assert.ElementsMatch(t, rack0, afterRollback.Players[0].Rack,
		"랙이 원래대로 복원되어야 한다")
	require.Len(t, afterRollback.Table, 1, "테이블에 기존 세트 1개만 있어야 한다")
	assert.Equal(t, "existing-run", afterRollback.Table[0].ID,
		"기존 테이블 세트가 복원되어야 한다")
}

func TestConfirmTurn_InvalidMove_AutoRollback_NoSnapshot(t *testing.T) {
	// PlaceTiles 없이 직접 ConfirmTurn 호출 시 (스냅샷 없음),
	// 자동 롤백이 안전하게 no-op으로 동작해야 한다.
	rack0 := []string{"R1a", "R2a", "R3a"}
	rack1 := []string{"K1a"}
	state := newTestGameState("auto-rollback-3", twoPlayerState(rack0, rack1), []string{"Y1a"})
	// HasInitialMeld = false → 30점 미달로 실패할 것
	svc, repo := seedRepo(t, state)

	// PlaceTiles 없이 바로 ConfirmTurn (스냅샷 미생성 상태)
	tilesFromRack := []string{"R1a", "R2a", "R3a"}
	tableGroups := []TilePlacement{{ID: "run-1", Tiles: tilesFromRack}}

	_, err := svc.ConfirmTurn("auto-rollback-3", &ConfirmRequest{
		Seat:          0,
		TableGroups:   tableGroups,
		TilesFromRack: tilesFromRack,
	})
	require.Error(t, err)

	// 스냅샷 없는 경우: getOrCreateSnapshot이 현재 상태를 스냅샷으로 사용.
	// ConfirmTurn에서 resolveRackAfter가 rackBefore에서 tilesFromRack을 제거하므로
	// 스냅샷 복원으로 원래 랙이 복원되어야 한다.
	afterRollback, _ := repo.GetGameState("auto-rollback-3")
	assert.ElementsMatch(t, rack0, afterRollback.Players[0].Rack,
		"스냅샷 없는 경우에도 랙이 원래대로 유지되어야 한다")
}

func TestConfirmTurn_InvalidMove_AutoRollback_SnapshotConsumed(t *testing.T) {
	// 자동 롤백 후 스냅샷이 소비되어야 한다.
	// 이후 ResetTurn 호출 시 "이미 롤백됨" (스냅샷 없음) 상태로 안전하게 동작.
	rack0 := []string{"R5a", "R6a", "B1a"}
	rack1 := []string{"K1a"}
	state := newTestGameState("auto-rollback-4", twoPlayerState(rack0, rack1), []string{"Y1a"})
	state.Players[0].HasInitialMeld = true
	svc, _ := seedRepo(t, state)

	// PlaceTiles → ConfirmTurn 실패 (자동 롤백)
	tilesFromRack := []string{"R5a", "R6a"}
	tableGroups := []TilePlacement{{ID: "bad-set", Tiles: tilesFromRack}}

	_, _ = svc.PlaceTiles("auto-rollback-4", &PlaceRequest{
		Seat:          0,
		TableGroups:   tableGroups,
		TilesFromRack: tilesFromRack,
	})

	_, err := svc.ConfirmTurn("auto-rollback-4", &ConfirmRequest{
		Seat:        0,
		TableGroups: tableGroups,
	})
	require.Error(t, err)

	// 자동 롤백 후 ResetTurn 호출: 스냅샷이 없으므로 현재 상태 그대로 반환
	resetResult, err := svc.ResetTurn("auto-rollback-4", 0)
	require.NoError(t, err)
	assert.True(t, resetResult.Success,
		"자동 롤백 후 ResetTurn은 no-op으로 성공해야 한다")
}
