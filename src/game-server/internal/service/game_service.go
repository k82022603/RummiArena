package service

import (
	"fmt"
	"sync"
	"time"

	"github.com/k82022603/RummiArena/game-server/internal/engine"
	"github.com/k82022603/RummiArena/game-server/internal/model"
	"github.com/k82022603/RummiArena/game-server/internal/repository"
)

const (
	errMsgGameNotFound   = "게임을 찾을 수 없습니다."
	errMsgNotYourTurn    = "자신의 턴이 아닙니다."
	errMsgPlayerNotFound = "플레이어를 찾을 수 없습니다."
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
	Seat               int             `json:"seat"`
	TableGroups        []TilePlacement `json:"tableGroups"`
	TilesFromRack      []string        `json:"tilesFromRack"`
	JokerReturnedCodes []string        `json:"jokerReturnedCodes,omitempty"` // V-07: 조커 교체 시 회수한 조커 코드
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
	GameID         string          `json:"gameId"`
	Status         string          `json:"status"`
	CurrentSeat    int             `json:"currentSeat"`
	Table          []TilePlacement `json:"table"`
	MyRack         []string        `json:"myRack"`
	Players        []PlayerView    `json:"players"`
	DrawPileCount  int             `json:"drawPileCount"`
	TurnStartAt    int64           `json:"turnStartAt"`
	TurnTimeoutSec int             `json:"turnTimeoutSec"`
}

// PlayerView 상대방 뷰 (타일 수만 공개)
type PlayerView struct {
	Seat           int    `json:"seat"`
	UserID         string `json:"userId,omitempty"`
	DisplayName    string `json:"displayName,omitempty"`
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
	gameRepo   repository.MemoryGameStateRepository
	snapshotMu sync.Mutex
	snapshots  map[string]*turnSnapshot // key: gameID+":"+seat
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
			DisplayName:    p.DisplayName,
			PlayerType:     p.Type,
			HasInitialMeld: false,
			Rack:           rack,
			AIModel:        p.AIModel,
			AIPersona:      p.Persona,
			AIDifficulty:   p.Difficulty,
			AIPsychLevel:   p.AIPsychologyLevel,
		}
	}

	state := &model.GameStateRedis{
		GameID:         gameID,
		Status:         model.GameStatusPlaying,
		CurrentSeat:    0,
		DrawPile:       drawPile,
		Table:          []*model.SetOnTable{},
		Players:        playerStates,
		TurnStartAt:    time.Now().Unix(),
		TurnTimeoutSec: turnTimeoutSec,
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
		return nil, &ServiceError{Code: "NOT_FOUND", Message: errMsgGameNotFound, Status: 404}
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
			DisplayName:    p.DisplayName,
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
		GameID:         state.GameID,
		Status:         string(state.Status),
		CurrentSeat:    state.CurrentSeat,
		Table:          table,
		MyRack:         myRack,
		Players:        playerViews,
		DrawPileCount:  len(state.DrawPile),
		TurnStartAt:    state.TurnStartAt,
		TurnTimeoutSec: state.TurnTimeoutSec,
	}, nil
}

// PlaceTiles 타일을 임시 배치한다 (ConfirmTurn 전까지 유효성 검증 없음).
// 클라이언트는 테이블 전체 상태를 전송하며, 서버는 seat의 랙에서 해당 타일을 제거한다.
func (s *gameService) PlaceTiles(gameID string, req *PlaceRequest) (*GameActionResult, error) {
	state, err := s.gameRepo.GetGameState(gameID)
	if err != nil {
		return nil, &ServiceError{Code: "NOT_FOUND", Message: errMsgGameNotFound, Status: 404}
	}

	if state.CurrentSeat != req.Seat {
		return nil, &ServiceError{Code: "NOT_YOUR_TURN", Message: errMsgNotYourTurn, Status: 422}
	}

	// seat의 플레이어 인덱스 탐색
	playerIdx := findPlayerBySeat(state.Players, req.Seat)
	if playerIdx < 0 {
		return nil, &ServiceError{Code: "NOT_FOUND", Message: errMsgPlayerNotFound, Status: 404}
	}

	// 스냅샷이 없으면 (턴 시작 최초 place) 스냅샷 저장
	snapKey := snapshotKey(gameID, req.Seat)
	s.snapshotMu.Lock()
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
	s.snapshotMu.Unlock()

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
		return nil, &ServiceError{Code: "NOT_FOUND", Message: errMsgGameNotFound, Status: 404}
	}

	if state.CurrentSeat != req.Seat {
		return nil, &ServiceError{Code: "NOT_YOUR_TURN", Message: errMsgNotYourTurn, Status: 422}
	}

	playerIdx := findPlayerBySeat(state.Players, req.Seat)
	if playerIdx < 0 {
		return nil, &ServiceError{Code: "NOT_FOUND", Message: errMsgPlayerNotFound, Status: 404}
	}

	rackBefore, tableBefore := s.getOrCreateSnapshot(gameID, req.Seat, state, playerIdx)

	tableAfter := convertToSetOnTable(req.TableGroups)

	rackAfter, err := s.resolveRackAfter(state.Players[playerIdx].Rack, rackBefore, req.TilesFromRack)
	if err != nil {
		return nil, &ServiceError{Code: "INVALID_REQUEST", Message: err.Error(), Status: 400}
	}

	validateReq := buildValidateRequest(tableBefore, tableAfter, rackBefore, rackAfter, state.Players[playerIdx].HasInitialMeld, req.JokerReturnedCodes)

	if err := engine.ValidateTurnConfirm(validateReq); err != nil {
		return s.buildValidationFailResult(state, err), &ServiceError{Code: extractErrCode(err), Message: err.Error(), Status: 422}
	}

	// 검증 통과: 테이블 + 랙 확정
	state.Table = tableAfter
	state.Players[playerIdx].Rack = rackAfter
	state.ConsecutivePassCount = 0 // 배치 성공: 교착 카운터 리셋

	if !state.Players[playerIdx].HasInitialMeld && len(req.TilesFromRack) > 0 {
		state.Players[playerIdx].HasInitialMeld = true
	}

	snapKey := snapshotKey(gameID, req.Seat)
	s.snapshotMu.Lock()
	delete(s.snapshots, snapKey)
	s.snapshotMu.Unlock()

	// 승리 조건: 랙이 0장
	if len(rackAfter) == 0 {
		return s.finishGame(state, playerIdx)
	}

	return s.advanceToNextTurn(state)
}

// getOrCreateSnapshot 스냅샷이 있으면 반환하고, 없으면 현재 상태에서 생성한다.
func (s *gameService) getOrCreateSnapshot(gameID string, seat int, state *model.GameStateRedis, playerIdx int) ([]string, []*model.SetOnTable) {
	snapKey := snapshotKey(gameID, seat)
	s.snapshotMu.Lock()
	snap, hasSnap := s.snapshots[snapKey]
	s.snapshotMu.Unlock()
	if hasSnap {
		return snap.rack, snap.table
	}
	rackBefore := make([]string, len(state.Players[playerIdx].Rack))
	copy(rackBefore, state.Players[playerIdx].Rack)
	return rackBefore, cloneTable(state.Table)
}

// resolveRackAfter tilesFromRack이 있으면 rackBefore에서 제거한 결과를, 없으면 currentRack을 반환한다.
func (s *gameService) resolveRackAfter(currentRack, rackBefore, tilesFromRack []string) ([]string, error) {
	if len(tilesFromRack) > 0 {
		return removeTilesFromRack(rackBefore, tilesFromRack)
	}
	return currentRack, nil
}

// buildValidateRequest engine.TurnConfirmRequest를 조립한다.
func buildValidateRequest(tableBefore, tableAfter []*model.SetOnTable, rackBefore, rackAfter []string, hasInitialMeld bool, jokerReturnedCodes []string) engine.TurnConfirmRequest {
	return engine.TurnConfirmRequest{
		TableBefore:        modelSetsToEngineSets(tableBefore),
		TableAfter:         modelSetsToEngineSets(tableAfter),
		RackBefore:         rackBefore,
		RackAfter:          rackAfter,
		HasInitialMeld:     hasInitialMeld,
		JokerReturnedCodes: jokerReturnedCodes,
	}
}

// extractErrCode ValidationError에서 에러 코드를 추출한다. 타입이 다르면 ErrInvalidSet을 반환한다.
func extractErrCode(err error) string {
	if ve, ok := err.(*engine.ValidationError); ok {
		return ve.Code
	}
	return engine.ErrInvalidSet
}

// buildValidationFailResult 유효성 검증 실패 시 GameActionResult를 생성한다.
func (s *gameService) buildValidationFailResult(state *model.GameStateRedis, err error) *GameActionResult {
	return &GameActionResult{
		Success:   false,
		NextSeat:  state.CurrentSeat,
		ErrorCode: extractErrCode(err),
		GameState: state,
	}
}

// finishGame 승리 조건 충족 시 게임을 종료하고 결과를 반환한다.
func (s *gameService) finishGame(state *model.GameStateRedis, playerIdx int) (*GameActionResult, error) {
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

// finishGameStalemate 교착 상태(드로우 파일 소진 or 전원 1라운드 패스) 시 타일 점수 기반 승자를 판정한다.
// 점수 규칙: 조커=30점, 일반 타일=숫자 그대로. 낮은 점수가 이긴다.
// 동점 시: 타일 수 적은 쪽 승리. 모두 동점이면 WinnerID = "" (무승부).
func (s *gameService) finishGameStalemate(state *model.GameStateRedis) (*GameActionResult, error) {
	state.Status = model.GameStatusFinished
	state.IsStalemate = true

	type scored struct {
		idx   int
		score int
		count int
	}

	scores := make([]scored, len(state.Players))
	for i, p := range state.Players {
		total := 0
		for _, code := range p.Rack {
			total += tileScore(code)
		}
		scores[i] = scored{idx: i, score: total, count: len(p.Rack)}
	}

	// 최솟값 찾기
	best := scores[0]
	for _, sc := range scores[1:] {
		if sc.score < best.score || (sc.score == best.score && sc.count < best.count) {
			best = sc
		}
	}

	// 동점 확인: best와 score+count 모두 동일한 다른 플레이어가 있으면 무승부
	winnerID := state.Players[best.idx].UserID
	for _, sc := range scores {
		if sc.idx != best.idx && sc.score == best.score && sc.count == best.count {
			winnerID = "" // 무승부
			break
		}
	}

	if err := s.gameRepo.SaveGameState(state); err != nil {
		return nil, fmt.Errorf("game_service: save after stalemate: %w", err)
	}
	return &GameActionResult{
		Success:   true,
		NextSeat:  state.CurrentSeat,
		GameEnded: true,
		WinnerID:  winnerID,
		GameState: state,
		ErrorCode: "STALEMATE",
	}, nil
}

// tileScore 타일 코드에서 점수를 계산한다.
// 조커(JK1, JK2) = 30점, 일반 타일 = 숫자값.
func tileScore(code string) int {
	if len(code) >= 2 && code[:2] == "JK" {
		return engine.JokerScore
	}
	parsed, err := engine.Parse(code)
	if err != nil {
		return 0
	}
	return parsed.Number
}

// advanceToNextTurn 다음 플레이어 턴으로 전환하고 상태를 저장한 후 결과를 반환한다.
func (s *gameService) advanceToNextTurn(state *model.GameStateRedis) (*GameActionResult, error) {
	nextSeat := advanceTurn(state)
	state.CurrentSeat = nextSeat
	state.TurnStartAt = time.Now().Unix()
	state.TurnCount++

	if err := s.gameRepo.SaveGameState(state); err != nil {
		return nil, fmt.Errorf("game_service: save after confirm: %w", err)
	}
	return &GameActionResult{Success: true, NextSeat: nextSeat, GameState: state}, nil
}

// DrawTile 드로우 파일에서 1장을 뽑아 플레이어 랙에 추가하고 다음 턴으로 넘긴다.
func (s *gameService) DrawTile(gameID string, seat int) (*GameActionResult, error) {
	state, err := s.gameRepo.GetGameState(gameID)
	if err != nil {
		return nil, &ServiceError{Code: "NOT_FOUND", Message: errMsgGameNotFound, Status: 404}
	}

	if state.CurrentSeat != seat {
		return nil, &ServiceError{Code: "NOT_YOUR_TURN", Message: errMsgNotYourTurn, Status: 422}
	}

	playerIdx := findPlayerBySeat(state.Players, seat)
	if playerIdx < 0 {
		return nil, &ServiceError{Code: "NOT_FOUND", Message: errMsgPlayerNotFound, Status: 404}
	}

	if len(state.DrawPile) == 0 {
		// 드로우 파일 소진: 점수 기반 승자 판정 후 교착 종료
		return s.finishGameStalemate(state)
	}

	// 1장 드로우
	drawnCode := state.DrawPile[0]
	state.DrawPile = state.DrawPile[1:]
	state.Players[playerIdx].Rack = append(state.Players[playerIdx].Rack, drawnCode)
	state.ConsecutivePassCount++ // 드로우 = 패스: 교착 카운터 증가

	// 스냅샷 제거 (드로우하면 턴 종료, 되돌리기 불가)
	s.snapshotMu.Lock()
	delete(s.snapshots, snapshotKey(gameID, seat))
	s.snapshotMu.Unlock()

	// 교착 판정: 전원이 연속으로 1회 이상 드로우했으면 교착
	if state.ConsecutivePassCount >= len(state.Players) {
		return s.finishGameStalemate(state)
	}

	// 다음 턴
	nextSeat := advanceTurn(state)
	state.CurrentSeat = nextSeat
	state.TurnStartAt = time.Now().Unix()
	state.TurnCount++

	if err := s.gameRepo.SaveGameState(state); err != nil {
		return nil, fmt.Errorf("game_service: save after draw: %w", err)
	}

	return &GameActionResult{Success: true, NextSeat: nextSeat, GameState: state}, nil
}

// ResetTurn 현재 턴의 배치를 취소하고 스냅샷 상태로 롤백한다.
func (s *gameService) ResetTurn(gameID string, seat int) (*GameActionResult, error) {
	state, err := s.gameRepo.GetGameState(gameID)
	if err != nil {
		return nil, &ServiceError{Code: "NOT_FOUND", Message: errMsgGameNotFound, Status: 404}
	}

	if state.CurrentSeat != seat {
		return nil, &ServiceError{Code: "NOT_YOUR_TURN", Message: errMsgNotYourTurn, Status: 422}
	}

	playerIdx := findPlayerBySeat(state.Players, seat)
	if playerIdx < 0 {
		return nil, &ServiceError{Code: "NOT_FOUND", Message: errMsgPlayerNotFound, Status: 404}
	}

	snapKey := snapshotKey(gameID, seat)
	s.snapshotMu.Lock()
	snap, exists := s.snapshots[snapKey]
	if exists {
		delete(s.snapshots, snapKey)
	}
	s.snapshotMu.Unlock()

	if !exists {
		// 스냅샷 없음 = 이번 턴에 아무것도 하지 않음
		return &GameActionResult{Success: true, NextSeat: seat, GameState: state}, nil
	}

	// 스냅샷으로 복원
	state.Players[playerIdx].Rack = snap.rack
	state.Table = snap.table

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
