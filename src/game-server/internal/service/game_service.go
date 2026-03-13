package service

import (
	"fmt"
	"time"

	"github.com/k82022603/RummiArena/game-server/internal/engine"
	"github.com/k82022603/RummiArena/game-server/internal/model"
	"github.com/k82022603/RummiArena/game-server/internal/repository"
)

// TilePlacement 클라이언트에서 전송하는 단일 세트 배치 정보
type TilePlacement struct {
	ID    string   `json:"id"`
	Tiles []string `json:"tiles"` // 타일 코드 슬라이스
}

// PlaceRequest POST /api/games/:id/place 요청 DTO
type PlaceRequest struct {
	Seat          int             `json:"seat"`
	TableGroups   []TilePlacement `json:"tableGroups"`
	TilesFromRack []string        `json:"tilesFromRack"`
}

// ConfirmRequest POST /api/games/:id/confirm 요청 DTO
type ConfirmRequest struct {
	Seat          int             `json:"seat"`
	TableGroups   []TilePlacement `json:"tableGroups"`
	TilesFromRack []string        `json:"tilesFromRack"`
}

// GameActionResult 게임 액션 처리 결과 DTO
type GameActionResult struct {
	Success   bool                  `json:"success"`
	NextSeat  int                   `json:"nextSeat"`
	GameEnded bool                  `json:"gameEnded,omitempty"`
	WinnerID  string                `json:"winnerId,omitempty"`
	GameState *model.GameStateRedis `json:"gameState,omitempty"`
	ErrorCode string                `json:"errorCode,omitempty"`
}

// GameService 게임 생명주기 비즈니스 로직
type GameService interface {
	GetGameState(gameID string, requestingSeat int) (*GameStateView, error)
	PlaceTiles(gameID string, req *PlaceRequest) (*GameActionResult, error)
	ConfirmTurn(gameID string, req *ConfirmRequest) (*GameActionResult, error)
	DrawTile(gameID string, seat int) (*GameActionResult, error)
	ResetTurn(gameID string, seat int) (*GameActionResult, error)
}

// GameStateView 1인칭 뷰 게임 상태.
// 요청한 플레이어의 랙은 전체 공개, 상대는 tileCount만 포함한다.
type GameStateView struct {
	GameID      string             `json:"gameId"`
	Status      string             `json:"status"`
	CurrentSeat int                `json:"currentSeat"`
	Table       []TilePlacement    `json:"table"`
	MyRack      []string           `json:"myRack"`
	Players     []PlayerView       `json:"players"`
	DrawPileCount int              `json:"drawPileCount"`
	TurnStartAt int64              `json:"turnStartAt"`
}

// PlayerView 상대방 뷰 (타일 수만 공개)
type PlayerView struct {
	Seat           int    `json:"seat"`
	UserID         string `json:"userId,omitempty"`
	PlayerType     string `json:"playerType"`
	TileCount      int    `json:"tileCount"`
	HasInitialMeld bool   `json:"hasInitialMeld"`
}

// turnSnapshot 턴 시작 시점의 랙 스냅샷 (ResetTurn용)
// gameID + seat → 스냅샷 저장
type turnSnapshot struct {
	rack        []string
	table       []*model.SetOnTable
	capturedAt  time.Time
}

type gameService struct {
	gameRepo  repository.MemoryGameStateRepository
	snapshots map[string]*turnSnapshot // key: gameID+":"+seat
	mu        struct{ mu interface{} } // 단순 구조 — 실제로는 sync.Mutex를 사용
}

// newGame 방의 플레이어들로 게임을 생성하고 초기 타일을 분배한다.
// 이 함수는 roomService 내부에서만 호출된다.
func (s *gameService) newGame(
	gameID string,
	players []model.RoomPlayer,
	turnTimeoutSec int,
) (*model.GameStateRedis, error) {
	pool := engine.NewTilePool()

	hands, err := pool.DealInitialHands(len(players))
	if err != nil {
		return nil, fmt.Errorf("game_service: deal initial hands: %w", err)
	}

	// 드로우 파일: 남은 타일 코드 수집
	remaining := pool.Remaining()
	drawPile := make([]string, 0, remaining)
	// pool 자체에는 Remaining()만 있으므로 직접 드로우
	for i := 0; i < remaining; i++ {
		t, err := pool.DrawOne()
		if err != nil {
			break
		}
		drawPile = append(drawPile, t.Code)
	}

	// PlayerState 구성
	playerStates := make([]model.PlayerState, len(players))
	for i, p := range players {
		rack := make([]string, len(hands[i]))
		for j, t := range hands[i] {
			rack[j] = t.Code
		}
		playerStates[i] = model.PlayerState{
			SeatOrder:      p.Seat,
			UserID:         p.UserID,
			PlayerType:     p.Type,
			HasInitialMeld: false,
			Rack:           rack,
		}
	}

	state := &model.GameStateRedis{
		GameID:      gameID,
		Status:      model.GameStatusPlaying,
		CurrentSeat: 0,
		DrawPile:    drawPile,
		Table:       []*model.SetOnTable{},
		Players:     playerStates,
		TurnStartAt: time.Now().Unix(),
	}

	if err := s.gameRepo.SaveGameState(state); err != nil {
		return nil, fmt.Errorf("game_service: save initial state: %w", err)
	}
	return state, nil
}

// NewGameService GameService 구현체 생성자
func NewGameService(gameRepo repository.MemoryGameStateRepository) GameService {
	return &gameService{
		gameRepo:  gameRepo,
		snapshots: make(map[string]*turnSnapshot),
	}
}

// GetGameState 1인칭 뷰로 게임 상태를 반환한다.
// requestingSeat 플레이어의 랙만 공개하고, 나머지는 tileCount만 포함한다.
func (s *gameService) GetGameState(gameID string, requestingSeat int) (*GameStateView, error) {
	state, err := s.gameRepo.GetGameState(gameID)
	if err != nil {
		return nil, &ServiceError{Code: "NOT_FOUND", Message: "게임을 찾을 수 없습니다.", Status: 404}
	}

	// Table → TilePlacement 변환
	table := make([]TilePlacement, len(state.Table))
	for i, set := range state.Table {
		tiles := make([]string, len(set.Tiles))
		for j, t := range set.Tiles {
			tiles[j] = t.Code
		}
		table[i] = TilePlacement{ID: set.ID, Tiles: tiles}
	}

	// Players 뷰 구성
	var myRack []string
	playerViews := make([]PlayerView, len(state.Players))
	for i, p := range state.Players {
		playerViews[i] = PlayerView{
			Seat:           p.SeatOrder,
			UserID:         p.UserID,
			PlayerType:     p.PlayerType,
			TileCount:      len(p.Rack),
			HasInitialMeld: p.HasInitialMeld,
		}
		if p.SeatOrder == requestingSeat {
			rack := make([]string, len(p.Rack))
			copy(rack, p.Rack)
			myRack = rack
		}
	}

	return &GameStateView{
		GameID:        state.GameID,
		Status:        string(state.Status),
		CurrentSeat:   state.CurrentSeat,
		Table:         table,
		MyRack:        myRack,
		Players:       playerViews,
		DrawPileCount: len(state.DrawPile),
		TurnStartAt:   state.TurnStartAt,
	}, nil
}

// PlaceTiles 타일을 임시 배치한다 (ConfirmTurn 전까지 유효성 검증 없음).
// 클라이언트는 테이블 전체 상태를 전송하며, 서버는 seat의 랙에서 해당 타일을 제거한다.
func (s *gameService) PlaceTiles(gameID string, req *PlaceRequest) (*GameActionResult, error) {
	state, err := s.gameRepo.GetGameState(gameID)
	if err != nil {
		return nil, &ServiceError{Code: "NOT_FOUND", Message: "게임을 찾을 수 없습니다.", Status: 404}
	}

	if state.CurrentSeat != req.Seat {
		return nil, &ServiceError{Code: "NOT_YOUR_TURN", Message: "자신의 턴이 아닙니다.", Status: 422}
	}

	// seat의 플레이어 인덱스 탐색
	playerIdx := findPlayerBySeat(state.Players, req.Seat)
	if playerIdx < 0 {
		return nil, &ServiceError{Code: "NOT_FOUND", Message: "플레이어를 찾을 수 없습니다.", Status: 404}
	}

	// 스냅샷이 없으면 (턴 시작 최초 place) 스냅샷 저장
	snapKey := snapshotKey(gameID, req.Seat)
	if _, exists := s.snapshots[snapKey]; !exists {
		rackSnap := make([]string, len(state.Players[playerIdx].Rack))
		copy(rackSnap, state.Players[playerIdx].Rack)
		tableSnap := cloneTable(state.Table)
		s.snapshots[snapKey] = &turnSnapshot{
			rack:       rackSnap,
			table:      tableSnap,
			capturedAt: time.Now(),
		}
	}

	// 랙에서 tilesFromRack 제거
	newRack, err := removeTilesFromRack(state.Players[playerIdx].Rack, req.TilesFromRack)
	if err != nil {
		return nil, &ServiceError{Code: "INVALID_REQUEST", Message: err.Error(), Status: 400}
	}
	state.Players[playerIdx].Rack = newRack

	// 테이블 업데이트
	state.Table = convertToSetOnTable(req.TableGroups)

	if err := s.gameRepo.SaveGameState(state); err != nil {
		return nil, fmt.Errorf("game_service: save after place: %w", err)
	}

	return &GameActionResult{Success: true, NextSeat: state.CurrentSeat, GameState: state}, nil
}

// ConfirmTurn 턴을 확정한다.
// engine.ValidateTurnConfirm으로 테이블 상태를 검증하고, 유효하면 다음 턴으로 넘긴다.
func (s *gameService) ConfirmTurn(gameID string, req *ConfirmRequest) (*GameActionResult, error) {
	state, err := s.gameRepo.GetGameState(gameID)
	if err != nil {
		return nil, &ServiceError{Code: "NOT_FOUND", Message: "게임을 찾을 수 없습니다.", Status: 404}
	}

	if state.CurrentSeat != req.Seat {
		return nil, &ServiceError{Code: "NOT_YOUR_TURN", Message: "자신의 턴이 아닙니다.", Status: 422}
	}

	playerIdx := findPlayerBySeat(state.Players, req.Seat)
	if playerIdx < 0 {
		return nil, &ServiceError{Code: "NOT_FOUND", Message: "플레이어를 찾을 수 없습니다.", Status: 404}
	}

	// 스냅샷에서 턴 시작 시점 랙/테이블 조회
	snapKey := snapshotKey(gameID, req.Seat)
	snap, hasSnap := s.snapshots[snapKey]

	// 스냅샷이 없으면 현재 상태 = 변화 없음 (place 없이 confirm)
	var rackBefore []string
	var tableBefore []*model.SetOnTable
	if hasSnap {
		rackBefore = snap.rack
		tableBefore = snap.table
	} else {
		rackBefore = make([]string, len(state.Players[playerIdx].Rack))
		copy(rackBefore, state.Players[playerIdx].Rack)
		tableBefore = cloneTable(state.Table)
	}

	// 현재 상태(ConfirmRequest 기반)로 테이블/랙 구성
	tableAfter := convertToSetOnTable(req.TableGroups)

	// 랙에서 tilesFromRack 제거 (place 없이 confirm 직접 호출 시)
	rackAfter := state.Players[playerIdx].Rack
	if len(req.TilesFromRack) > 0 {
		rackAfter, err = removeTilesFromRack(rackBefore, req.TilesFromRack)
		if err != nil {
			return nil, &ServiceError{Code: "INVALID_REQUEST", Message: err.Error(), Status: 400}
		}
	}

	// engine 검증
	engineTableBefore := modelSetsToEngineSets(tableBefore)
	engineTableAfter := modelSetsToEngineSets(tableAfter)

	validateReq := engine.TurnConfirmRequest{
		TableBefore:    engineTableBefore,
		TableAfter:     engineTableAfter,
		RackBefore:     rackBefore,
		RackAfter:      rackAfter,
		HasInitialMeld: state.Players[playerIdx].HasInitialMeld,
	}

	if err := engine.ValidateTurnConfirm(validateReq); err != nil {
		return &GameActionResult{
			Success:   false,
			NextSeat:  state.CurrentSeat,
			ErrorCode: engine.ErrInvalidSet,
			GameState: state,
		}, &ServiceError{Code: engine.ErrInvalidSet, Message: err.Error(), Status: 422}
	}

	// 검증 통과: 테이블 + 랙 확정
	state.Table = tableAfter
	state.Players[playerIdx].Rack = rackAfter

	// 최초 등록 여부 업데이트 (처음으로 테이블에 타일을 올린 경우)
	if !state.Players[playerIdx].HasInitialMeld && len(req.TilesFromRack) > 0 {
		state.Players[playerIdx].HasInitialMeld = true
	}

	// 스냅샷 제거
	delete(s.snapshots, snapKey)

	// 승리 조건: 랙이 0장
	if len(rackAfter) == 0 {
		state.Status = model.GameStatusFinished
		if err := s.gameRepo.SaveGameState(state); err != nil {
			return nil, fmt.Errorf("game_service: save after win: %w", err)
		}
		return &GameActionResult{
			Success:   true,
			NextSeat:  state.CurrentSeat,
			GameEnded: true,
			WinnerID:  state.Players[playerIdx].UserID,
			GameState: state,
		}, nil
	}

	// 다음 턴으로 전환
	nextSeat := advanceTurn(state)
	state.CurrentSeat = nextSeat
	state.TurnStartAt = time.Now().Unix()

	if err := s.gameRepo.SaveGameState(state); err != nil {
		return nil, fmt.Errorf("game_service: save after confirm: %w", err)
	}

	return &GameActionResult{Success: true, NextSeat: nextSeat, GameState: state}, nil
}

// DrawTile 드로우 파일에서 1장을 뽑아 플레이어 랙에 추가하고 다음 턴으로 넘긴다.
func (s *gameService) DrawTile(gameID string, seat int) (*GameActionResult, error) {
	state, err := s.gameRepo.GetGameState(gameID)
	if err != nil {
		return nil, &ServiceError{Code: "NOT_FOUND", Message: "게임을 찾을 수 없습니다.", Status: 404}
	}

	if state.CurrentSeat != seat {
		return nil, &ServiceError{Code: "NOT_YOUR_TURN", Message: "자신의 턴이 아닙니다.", Status: 422}
	}

	playerIdx := findPlayerBySeat(state.Players, seat)
	if playerIdx < 0 {
		return nil, &ServiceError{Code: "NOT_FOUND", Message: "플레이어를 찾을 수 없습니다.", Status: 404}
	}

	if len(state.DrawPile) == 0 {
		// 드로우 파일 소진: 게임 종료 (승자 없음)
		state.Status = model.GameStatusFinished
		if err := s.gameRepo.SaveGameState(state); err != nil {
			return nil, fmt.Errorf("game_service: save after pile empty: %w", err)
		}
		return &GameActionResult{
			Success:   false,
			NextSeat:  seat,
			GameEnded: true,
			ErrorCode: engine.ErrDrawPileEmpty,
			GameState: state,
		}, nil
	}

	// 1장 드로우
	drawnCode := state.DrawPile[0]
	state.DrawPile = state.DrawPile[1:]
	state.Players[playerIdx].Rack = append(state.Players[playerIdx].Rack, drawnCode)

	// 스냅샷 제거 (드로우하면 턴 종료, 되돌리기 불가)
	delete(s.snapshots, snapshotKey(gameID, seat))

	// 다음 턴
	nextSeat := advanceTurn(state)
	state.CurrentSeat = nextSeat
	state.TurnStartAt = time.Now().Unix()

	if err := s.gameRepo.SaveGameState(state); err != nil {
		return nil, fmt.Errorf("game_service: save after draw: %w", err)
	}

	return &GameActionResult{Success: true, NextSeat: nextSeat, GameState: state}, nil
}

// ResetTurn 현재 턴의 배치를 취소하고 스냅샷 상태로 롤백한다.
func (s *gameService) ResetTurn(gameID string, seat int) (*GameActionResult, error) {
	state, err := s.gameRepo.GetGameState(gameID)
	if err != nil {
		return nil, &ServiceError{Code: "NOT_FOUND", Message: "게임을 찾을 수 없습니다.", Status: 404}
	}

	if state.CurrentSeat != seat {
		return nil, &ServiceError{Code: "NOT_YOUR_TURN", Message: "자신의 턴이 아닙니다.", Status: 422}
	}

	playerIdx := findPlayerBySeat(state.Players, seat)
	if playerIdx < 0 {
		return nil, &ServiceError{Code: "NOT_FOUND", Message: "플레이어를 찾을 수 없습니다.", Status: 404}
	}

	snapKey := snapshotKey(gameID, seat)
	snap, exists := s.snapshots[snapKey]
	if !exists {
		// 스냅샷 없음 = 이번 턴에 아무것도 하지 않음
		return &GameActionResult{Success: true, NextSeat: seat, GameState: state}, nil
	}

	// 스냅샷으로 복원
	state.Players[playerIdx].Rack = snap.rack
	state.Table = snap.table
	delete(s.snapshots, snapKey)

	if err := s.gameRepo.SaveGameState(state); err != nil {
		return nil, fmt.Errorf("game_service: save after reset: %w", err)
	}

	return &GameActionResult{Success: true, NextSeat: seat, GameState: state}, nil
}

// --- 내부 헬퍼 함수 ---

// findPlayerBySeat PlayerState 슬라이스에서 seat 번호로 인덱스를 찾는다.
func findPlayerBySeat(players []model.PlayerState, seat int) int {
	for i, p := range players {
		if p.SeatOrder == seat {
			return i
		}
	}
	return -1
}

// advanceTurn 현재 턴에서 다음 활성 플레이어 seat 번호를 반환한다.
// PLAYING 상태의 플레이어를 순환하며 다음 seat를 결정한다.
func advanceTurn(state *model.GameStateRedis) int {
	n := len(state.Players)
	if n == 0 {
		return 0
	}
	// 현재 seat의 인덱스 찾기
	currentIdx := -1
	for i, p := range state.Players {
		if p.SeatOrder == state.CurrentSeat {
			currentIdx = i
			break
		}
	}
	if currentIdx < 0 {
		return state.Players[0].SeatOrder
	}
	nextIdx := (currentIdx + 1) % n
	return state.Players[nextIdx].SeatOrder
}

// removeTilesFromRack 랙에서 지정 타일들을 제거한다.
// 타일이 없으면 에러를 반환한다.
func removeTilesFromRack(rack []string, tiles []string) ([]string, error) {
	freq := make(map[string]int)
	for _, t := range rack {
		freq[t]++
	}
	for _, t := range tiles {
		if freq[t] <= 0 {
			return nil, fmt.Errorf("랙에 타일 %q이(가) 없습니다", t)
		}
		freq[t]--
	}
	result := make([]string, 0, len(rack)-len(tiles))
	for _, t := range rack {
		if freq[t] > 0 {
			result = append(result, t)
			freq[t]--
		}
	}
	return result, nil
}

// convertToSetOnTable TilePlacement 슬라이스를 model.SetOnTable 슬라이스로 변환한다.
func convertToSetOnTable(placements []TilePlacement) []*model.SetOnTable {
	sets := make([]*model.SetOnTable, 0, len(placements))
	for _, p := range placements {
		tiles := make([]*model.Tile, 0, len(p.Tiles))
		for _, code := range p.Tiles {
			tiles = append(tiles, &model.Tile{Code: code})
		}
		sets = append(sets, &model.SetOnTable{
			ID:    p.ID,
			Tiles: tiles,
		})
	}
	return sets
}

// modelSetsToEngineSets model.SetOnTable 슬라이스를 engine.TileSet 슬라이스로 변환한다.
func modelSetsToEngineSets(sets []*model.SetOnTable) []*engine.TileSet {
	result := make([]*engine.TileSet, 0, len(sets))
	for _, s := range sets {
		tiles := make([]*engine.Tile, 0, len(s.Tiles))
		for _, t := range s.Tiles {
			parsed, err := engine.Parse(t.Code)
			if err != nil {
				// 파싱 실패한 타일은 빈 타일로 처리 (validator가 에러 반환)
				tiles = append(tiles, &engine.Tile{Code: t.Code})
				continue
			}
			tiles = append(tiles, parsed)
		}
		result = append(result, &engine.TileSet{
			ID:    s.ID,
			Tiles: tiles,
		})
	}
	return result
}

// cloneTable SetOnTable 슬라이스를 딥 카피한다.
func cloneTable(table []*model.SetOnTable) []*model.SetOnTable {
	if table == nil {
		return nil
	}
	result := make([]*model.SetOnTable, len(table))
	for i, s := range table {
		copied := *s
		tiles := make([]*model.Tile, len(s.Tiles))
		copy(tiles, s.Tiles)
		copied.Tiles = tiles
		result[i] = &copied
	}
	return result
}

// snapshotKey 스냅샷 맵의 키를 생성한다.
func snapshotKey(gameID string, seat int) string {
	return fmt.Sprintf("%s:%d", gameID, seat)
}
