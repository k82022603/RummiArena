package service

import (
	"fmt"
	"strings"
	"sync"
	"time"

	"github.com/google/uuid"
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
	Success          bool                  `json:"success"`
	NextSeat         int                   `json:"nextSeat"`
	GameEnded        bool                  `json:"gameEnded,omitempty"`
	WinnerID         string                `json:"winnerId,omitempty"`
	GameState        *model.GameStateRedis `json:"gameState,omitempty"`
	ErrorCode        string                `json:"errorCode,omitempty"`
	PenaltyDrawCount int    `json:"penaltyDrawCount,omitempty"` // Human INVALID_MOVE 시 패널티 드로우 장수
	PenaltyReason    string `json:"penaltyReason,omitempty"`    // Human 패널티 드로우 시 사용자 표시용 설명 문구
	// RollbackForced BUG-UI-014: invalid meld 감지 → 보드 롤백 발생을 클라이언트에 알린다.
	// ws_handler는 이 값이 true이면 ROLLBACK_FORCED 이벤트를 브로드캐스트한다.
	RollbackForced bool `json:"rollbackForced,omitempty"`
}

// GameService 게임 생명주기 비즈니스 로직
type GameService interface {
	GetGameState(gameID string, requestingSeat int) (*GameStateView, error)
	PlaceTiles(gameID string, req *PlaceRequest) (*GameActionResult, error)
	ConfirmTurn(gameID string, req *ConfirmRequest) (*GameActionResult, error)
	DrawTile(gameID string, seat int) (*GameActionResult, error)
	ResetTurn(gameID string, seat int) (*GameActionResult, error)
	ForfeitPlayer(gameID string, seat int, reason string) (*GameActionResult, error)
	SetPlayerStatus(gameID string, seat int, status model.PlayerConnectionStatus) error
	// SaveGameState 게임 상태를 직접 영속화한다 (handler에서 카운터 업데이트 후 사용).
	SaveGameState(state *model.GameStateRedis) error
	// GetRawGameState 원시 GameStateRedis를 반환한다 (handler에서 부재/카운터 판정 시 사용).
	GetRawGameState(gameID string) (*model.GameStateRedis, error)
	// DeleteGameState 게임 상태를 삭제한다 (게임 종료 시 Redis 정리).
	DeleteGameState(gameID string) error
	// AddPlayerMidGame 진행 중인 게임에 새 플레이어를 추가한다.
	// DrawPile에서 14장을 배분하며, 14장 미만이면 에러를 반환한다.
	AddPlayerMidGame(gameID string, player model.RoomPlayer) error
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
	Seat             int    `json:"seat"`
	UserID           string `json:"userId,omitempty"`
	DisplayName      string `json:"displayName,omitempty"`
	PlayerType       string `json:"playerType"`
	TileCount        int    `json:"tileCount"`
	HasInitialMeld   bool   `json:"hasInitialMeld"`
	ConnectionStatus string `json:"connectionStatus,omitempty"` // ACTIVE, DISCONNECTED, FORFEITED
}

// turnSnapshot 턴 시작 시점의 랙 스냅샷 (ResetTurn용)
// gameID + seat -> 스냅샷 저장
type turnSnapshot struct {
	rack       []string
	table      []*model.SetOnTable
	capturedAt time.Time
}

type gameService struct {
	gameRepo   repository.MemoryGameStateRepository
	snapshotMu sync.Mutex
	snapshots  map[string]*turnSnapshot // key: gameID+":"+seat
	// maxTurnsLimit: BUG-GS-005 후속. 게임 1판의 최대 턴 수.
	// 초과 시 advanceToNextTurn/DrawTile/penaltyDrawAndAdvance/ForfeitPlayer가
	// finishGameStalemate로 귀결한다. 0 이하면 제한 없음.
	maxTurnsLimit int
}

// GameServiceOption gameService 생성 시 선택적 설정을 주입하는 함수 타입.
type GameServiceOption func(*gameService)

// WithMaxTurnsLimit 게임 최대 턴 수 상한을 설정한다.
// limit <= 0 이면 제한 없음(기본 동작).
// BUG-GS-005 후속: TIMEOUT(턴 상한 초과) 시 Redis 자동 정리를 위한 진입점.
func WithMaxTurnsLimit(limit int) GameServiceOption {
	return func(s *gameService) {
		s.maxTurnsLimit = limit
	}
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
			Status:         model.PlayerStatusActive,
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

// NewGameService GameService 구현체 생성자.
// opts로 WithMaxTurnsLimit 등 선택적 설정을 주입할 수 있다.
// 옵션을 전달하지 않으면 기존 동작(턴 상한 없음)을 그대로 유지한다.
func NewGameService(gameRepo repository.MemoryGameStateRepository, opts ...GameServiceOption) GameService {
	svc := &gameService{
		gameRepo:  gameRepo,
		snapshots: make(map[string]*turnSnapshot),
	}
	for _, opt := range opts {
		opt(svc)
	}
	return svc
}

// GetGameState 1인칭 뷰로 게임 상태를 반환한다.
// requestingSeat 플레이어의 랙만 공개하고, 나머지는 tileCount만 포함한다.
func (s *gameService) GetGameState(gameID string, requestingSeat int) (*GameStateView, error) {
	state, err := s.gameRepo.GetGameState(gameID)
	if err != nil {
		return nil, &ServiceError{Code: "NOT_FOUND", Message: errMsgGameNotFound, Status: 404}
	}

	// Table -> TilePlacement 변환
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
		connStatus := string(p.Status)
		if connStatus == "" {
			connStatus = string(model.PlayerStatusActive)
		}
		playerViews[i] = PlayerView{
			Seat:             p.SeatOrder,
			UserID:           p.UserID,
			DisplayName:      p.DisplayName,
			PlayerType:       p.PlayerType,
			TileCount:        len(p.Rack),
			HasInitialMeld:   p.HasInitialMeld,
			ConnectionStatus: connStatus,
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

	// tilesFromRack의 타일이 tableGroups에 실제 존재하는지 확인 [C-6]
	if len(req.TilesFromRack) > 0 {
		tableGroupTiles := collectAllTilesFromGroups(req.TableGroups)
		for _, t := range req.TilesFromRack {
			if !containsTileCode(tableGroupTiles, t) {
				return nil, &ServiceError{
					Code:    "INVALID_REQUEST",
					Message: fmt.Sprintf("랙에서 제거된 타일 '%s'이(가) 테이블에 포함되지 않았습니다", t),
					Status:  400,
				}
			}
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

	validateReq, err := buildValidateRequest(tableBefore, tableAfter, rackBefore, rackAfter, state.Players[playerIdx].HasInitialMeld, req.JokerReturnedCodes)
	if err != nil {
		return nil, &ServiceError{Code: "INVALID_REQUEST", Message: err.Error(), Status: 400}
	}

	if err := engine.ValidateTurnConfirm(validateReq); err != nil {
		// B안: Human/AI 분기 처리
		//   Human — 스냅샷 복원 + 패널티 3장 드로우 + 턴 종료 (오프라인 루미큐브 룰 그대로)
		//   AI    — 스냅샷 복원 + INVALID_MOVE 에러 반환 → ws_handler에서 forceAIDraw(1장) 폴백
		// BUG-UI-014: 양쪽 모두 스냅샷 복원 후 RollbackForced=true 를 설정한다.
		s.restoreSnapshot(state, gameID, req.Seat, playerIdx)

		errCode := extractErrCode(err)
		isAI := strings.HasPrefix(state.Players[playerIdx].PlayerType, "AI_")
		if isAI {
			// AI 경로: 에러 반환 → ws_handler가 forceAIDraw(1장) 폴백
			if saveErr := s.gameRepo.SaveGameState(state); saveErr != nil {
				return nil, fmt.Errorf("game_service: save after ai rollback: %w", saveErr)
			}
			return nil, &ServiceError{Code: "INVALID_MOVE", Message: errCode, Status: 422}
		}

		// Human 경로: 패널티 3장 드로우 + 턴 종료
		result, advErr := s.penaltyDrawAndAdvance(state, gameID, req.Seat, playerIdx, 3, errCode)
		if result != nil {
			result.RollbackForced = true
			result.PenaltyReason = "유효하지 않은 배치입니다. 보드가 원래 상태로 복원되고, 패널티로 3장을 드로우합니다."
		}
		return result, advErr
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
// 유효하지 않은 타일 코드가 있으면 에러를 반환한다.
func buildValidateRequest(tableBefore, tableAfter []*model.SetOnTable, rackBefore, rackAfter []string, hasInitialMeld bool, jokerReturnedCodes []string) (engine.TurnConfirmRequest, error) {
	engineBefore, err := modelSetsToEngineSets(tableBefore)
	if err != nil {
		return engine.TurnConfirmRequest{}, err
	}
	engineAfter, err := modelSetsToEngineSets(tableAfter)
	if err != nil {
		return engine.TurnConfirmRequest{}, err
	}
	return engine.TurnConfirmRequest{
		TableBefore:        engineBefore,
		TableAfter:         engineAfter,
		RackBefore:         rackBefore,
		RackAfter:          rackAfter,
		HasInitialMeld:     hasInitialMeld,
		JokerReturnedCodes: jokerReturnedCodes,
	}, nil
}

// extractErrCode ValidationError에서 에러 코드를 추출한다. 타입이 다르면 ErrInvalidSet을 반환한다.
func extractErrCode(err error) string {
	if ve, ok := err.(*engine.ValidationError); ok {
		return ve.Code
	}
	return engine.ErrInvalidSet
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

// checkTurnLimit 현재 TurnCount가 maxTurnsLimit에 도달(또는 초과)했는지 검사한다.
// 도달했다면 finishGameStalemate 결과를 반환한다 (두 번째 반환값 true).
// maxTurnsLimit <= 0 이면 제한 없음으로 취급하고 (nil, nil, false)를 반환한다.
// BUG-GS-005 후속: 80턴/120턴/200턴 등 턴 상한 도달 시 Redis 자동 정리를 단일 진입점으로 처리.
func (s *gameService) checkTurnLimit(state *model.GameStateRedis) (*GameActionResult, error, bool) {
	if s.maxTurnsLimit <= 0 {
		return nil, nil, false
	}
	if state.TurnCount < s.maxTurnsLimit {
		return nil, nil, false
	}
	result, err := s.finishGameStalemate(state)
	return result, err, true
}

// advanceToNextTurn 다음 플레이어 턴으로 전환하고 상태를 저장한 후 결과를 반환한다.
// TurnCount 증가 직후 maxTurnsLimit 검사 — 초과 시 STALEMATE로 귀결 (BUG-GS-005 후속).
func (s *gameService) advanceToNextTurn(state *model.GameStateRedis) (*GameActionResult, error) {
	nextSeat := advanceTurn(state)
	state.CurrentSeat = nextSeat
	state.TurnStartAt = time.Now().Unix()
	state.TurnCount++

	if result, err, reached := s.checkTurnLimit(state); reached {
		return result, err
	}

	if err := s.gameRepo.SaveGameState(state); err != nil {
		return nil, fmt.Errorf("game_service: save after confirm: %w", err)
	}
	return &GameActionResult{Success: true, NextSeat: nextSeat, GameState: state}, nil
}

// penaltyDrawAndAdvance Human INVALID_MOVE 시 패널티 드로우를 수행하고 다음 턴으로 전환한다.
// count: 뽑을 타일 수 (기본 3장), 드로우 파일이 부족하면 min(count, len(DrawPile))장만 뽑는다.
// 호출 전에 반드시 restoreSnapshot을 완료해야 한다.
// BUG-GS-005 후속: TurnCount 증가 후 maxTurnsLimit 검사 포함.
func (s *gameService) penaltyDrawAndAdvance(state *model.GameStateRedis, gameID string, seat, playerIdx, count int, errorCode string) (*GameActionResult, error) {
	drawCount := count
	if drawCount > len(state.DrawPile) {
		drawCount = len(state.DrawPile)
	}

	for i := 0; i < drawCount; i++ {
		state.Players[playerIdx].Rack = append(state.Players[playerIdx].Rack, state.DrawPile[0])
		state.DrawPile = state.DrawPile[1:]
	}

	// 패널티 드로우도 게임 진행으로 간주 → 교착 카운터 리셋
	state.ConsecutivePassCount = 0

	// 스냅샷 삭제 (turnSnapshot은 restoreSnapshot에서 이미 제거됨, 방어적 삭제)
	snapKey := snapshotKey(gameID, seat)
	s.snapshotMu.Lock()
	delete(s.snapshots, snapKey)
	s.snapshotMu.Unlock()

	// 다음 턴으로 전환
	nextSeat := advanceTurn(state)
	state.CurrentSeat = nextSeat
	state.TurnStartAt = time.Now().Unix()
	state.TurnCount++

	// BUG-GS-005 후속: 턴 상한 도달 시 STALEMATE로 귀결
	if result, err, reached := s.checkTurnLimit(state); reached {
		return result, err
	}

	if err := s.gameRepo.SaveGameState(state); err != nil {
		return nil, fmt.Errorf("game_service: save after penalty draw: %w", err)
	}

	return &GameActionResult{
		Success:          true,
		NextSeat:         nextSeat,
		GameState:        state,
		ErrorCode:        errorCode,
		PenaltyDrawCount: drawCount,
	}, nil
}

// DrawTile 드로우 파일에서 1장을 뽑아 플레이어 랙에 추가하고 다음 턴으로 넘긴다.
// 드로우 파일이 소진된 경우: 패스 처리(턴 넘기기). 전원 연속 패스 시 교착 종료.
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
		// 드로우 파일 소진: 패스 처리 (턴 넘기기)
		state.ConsecutivePassCount++

		// 스냅샷 제거 (패스하면 턴 종료, 되돌리기 불가)
		s.snapshotMu.Lock()
		delete(s.snapshots, snapshotKey(gameID, seat))
		s.snapshotMu.Unlock()

		// 교착 판정: 전원(활성 플레이어)이 연속으로 패스
		activePlayerCount := countActivePlayers(state)
		if activePlayerCount > 0 && state.ConsecutivePassCount >= activePlayerCount {
			return s.finishGameStalemate(state)
		}

		// 다음 턴으로 진행
		return s.advanceToNextTurn(state)
	}

	// 1장 드로우 — 타일을 실제로 뽑았으므로 게임이 진행된 것
	drawnCode := state.DrawPile[0]
	state.DrawPile = state.DrawPile[1:]
	state.Players[playerIdx].Rack = append(state.Players[playerIdx].Rack, drawnCode)
	state.ConsecutivePassCount = 0 // 드로우(타일 획득) = 게임 진행 → 교착 카운터 리셋

	// 스냅샷 제거 (드로우하면 턴 종료, 되돌리기 불가)
	s.snapshotMu.Lock()
	delete(s.snapshots, snapshotKey(gameID, seat))
	s.snapshotMu.Unlock()

	// 다음 턴
	nextSeat := advanceTurn(state)
	state.CurrentSeat = nextSeat
	state.TurnStartAt = time.Now().Unix()
	state.TurnCount++

	// BUG-GS-005 후속: 턴 상한 도달 시 STALEMATE로 귀결
	if result, err, reached := s.checkTurnLimit(state); reached {
		return result, err
	}

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

	restored := s.restoreSnapshot(state, gameID, seat, playerIdx)
	if !restored {
		// 스냅샷 없음 = 이번 턴에 아무것도 하지 않음
		return &GameActionResult{Success: true, NextSeat: seat, GameState: state}, nil
	}

	if err := s.gameRepo.SaveGameState(state); err != nil {
		return nil, fmt.Errorf("game_service: save after reset: %w", err)
	}

	return &GameActionResult{Success: true, NextSeat: seat, GameState: state}, nil
}

// restoreSnapshot 스냅샷이 존재하면 state의 랙과 테이블을 복원하고 스냅샷을 삭제한다.
// 복원했으면 true, 스냅샷이 없었으면 false를 반환한다.
// state 객체를 직접 수정하므로, 호출자가 SaveGameState를 별도로 호출해야 한다.
func (s *gameService) restoreSnapshot(state *model.GameStateRedis, gameID string, seat int, playerIdx int) bool {
	snapKey := snapshotKey(gameID, seat)
	s.snapshotMu.Lock()
	snap, exists := s.snapshots[snapKey]
	if exists {
		delete(s.snapshots, snapKey)
	}
	s.snapshotMu.Unlock()

	if !exists {
		return false
	}

	state.Players[playerIdx].Rack = snap.rack
	state.Table = snap.table
	return true
}

// ForfeitPlayer 플레이어를 기권 처리한다.
// 해당 seat의 Status를 FORFEITED로 변경하고, 활성 플레이어가 1명이면 자동 승리를 반환한다.
func (s *gameService) ForfeitPlayer(gameID string, seat int, reason string) (*GameActionResult, error) {
	state, err := s.gameRepo.GetGameState(gameID)
	if err != nil {
		return nil, &ServiceError{Code: "NOT_FOUND", Message: errMsgGameNotFound, Status: 404}
	}

	if state.Status != model.GameStatusPlaying {
		return nil, &ServiceError{Code: "GAME_NOT_PLAYING", Message: "진행 중인 게임이 아닙니다.", Status: 400}
	}

	playerIdx := findPlayerBySeat(state.Players, seat)
	if playerIdx < 0 {
		return nil, &ServiceError{Code: "NOT_FOUND", Message: errMsgPlayerNotFound, Status: 404}
	}

	state.Players[playerIdx].Status = model.PlayerStatusForfeited

	// 활성 플레이어 수 확인
	activeCount := countActivePlayers(state)

	if activeCount <= 1 {
		// 활성 플레이어 1명 이하: 남은 플레이어 자동 승리
		state.Status = model.GameStatusFinished
		winnerID := ""
		for _, p := range state.Players {
			if p.Status != model.PlayerStatusForfeited {
				winnerID = p.UserID
				break
			}
		}
		if err := s.gameRepo.SaveGameState(state); err != nil {
			return nil, fmt.Errorf("game_service: save after forfeit game over: %w", err)
		}
		return &GameActionResult{
			Success:   true,
			NextSeat:  state.CurrentSeat,
			GameEnded: true,
			WinnerID:  winnerID,
			GameState: state,
			ErrorCode: "FORFEIT",
		}, nil
	}

	// 현재 턴이 기권자의 턴이면 다음 턴으로 진행
	if state.CurrentSeat == seat {
		s.snapshotMu.Lock()
		delete(s.snapshots, snapshotKey(gameID, seat))
		s.snapshotMu.Unlock()

		nextSeat := advanceTurn(state)
		state.CurrentSeat = nextSeat
		state.TurnStartAt = time.Now().Unix()
		state.TurnCount++

		// BUG-GS-005 후속: 기권으로 턴이 증가한 경우에도 상한 검사
		if result, err, reached := s.checkTurnLimit(state); reached {
			return result, err
		}
	}

	if err := s.gameRepo.SaveGameState(state); err != nil {
		return nil, fmt.Errorf("game_service: save after forfeit: %w", err)
	}

	return &GameActionResult{
		Success:   true,
		NextSeat:  state.CurrentSeat,
		GameEnded: false,
		GameState: state,
	}, nil
}

// SetPlayerStatus 플레이어의 연결 상태를 변경한다.
func (s *gameService) SetPlayerStatus(gameID string, seat int, status model.PlayerConnectionStatus) error {
	state, err := s.gameRepo.GetGameState(gameID)
	if err != nil {
		return &ServiceError{Code: "NOT_FOUND", Message: errMsgGameNotFound, Status: 404}
	}

	playerIdx := findPlayerBySeat(state.Players, seat)
	if playerIdx < 0 {
		return &ServiceError{Code: "NOT_FOUND", Message: errMsgPlayerNotFound, Status: 404}
	}

	state.Players[playerIdx].Status = status
	switch status {
	case model.PlayerStatusDisconnected:
		state.Players[playerIdx].DisconnectedAt = time.Now().UnixMilli()
	case model.PlayerStatusActive:
		state.Players[playerIdx].DisconnectedAt = 0
		// 규칙 S8.2: 재연결 시 부재 턴 카운터 리셋
		state.Players[playerIdx].ConsecutiveAbsentTurns = 0
	}

	return s.gameRepo.SaveGameState(state)
}

// SaveGameState 게임 상태를 직접 영속화한다.
func (s *gameService) SaveGameState(state *model.GameStateRedis) error {
	return s.gameRepo.SaveGameState(state)
}

// GetRawGameState 원시 GameStateRedis를 반환한다.
func (s *gameService) GetRawGameState(gameID string) (*model.GameStateRedis, error) {
	state, err := s.gameRepo.GetGameState(gameID)
	if err != nil {
		return nil, &ServiceError{Code: "NOT_FOUND", Message: errMsgGameNotFound, Status: 404}
	}
	return state, nil
}

// DeleteGameState 게임 상태를 삭제한다.
func (s *gameService) DeleteGameState(gameID string) error {
	return s.gameRepo.DeleteGameState(gameID)
}

// AddPlayerMidGame 진행 중인 게임에 새 플레이어를 mid-game으로 추가한다.
//
// 규칙 D-05: 타일 총합 106장 불변 유지 — DrawPile에서 14장을 배분한다.
// DrawPile < 14장이면 DRAW_PILE_TOO_SMALL 에러를 반환하며 상태를 변경하지 않는다.
// 새 플레이어는 hasInitialMeld=false로 시작하며 (30점 최초 등록 규칙 적용),
// Players 슬라이스 끝에 append되므로 advanceTurn이 다음 라운드부터 자동으로 포함한다.
func (s *gameService) AddPlayerMidGame(gameID string, player model.RoomPlayer) error {
	state, err := s.gameRepo.GetGameState(gameID)
	if err != nil {
		return &ServiceError{Code: "NOT_FOUND", Message: errMsgGameNotFound, Status: 404}
	}

	if state.Status != model.GameStatusPlaying {
		return &ServiceError{Code: "GAME_NOT_PLAYING", Message: "진행 중인 게임이 아닙니다.", Status: 400}
	}

	// 이미 같은 seat 또는 userID가 있으면 중복 추가 방지
	for _, p := range state.Players {
		if p.UserID == player.UserID {
			return &ServiceError{Code: "ALREADY_IN_GAME", Message: "이미 게임에 참가하고 있습니다.", Status: 409}
		}
		if p.SeatOrder == player.Seat {
			return &ServiceError{Code: "SEAT_OCCUPIED", Message: "해당 seat이 이미 점유되어 있습니다.", Status: 409}
		}
	}

	const initialTiles = 14
	if len(state.DrawPile) < initialTiles {
		return &ServiceError{
			Code:    "DRAW_PILE_TOO_SMALL",
			Message: fmt.Sprintf("드로우 파일에 타일이 %d장 미만입니다. 참가할 수 없습니다.", initialTiles),
			Status:  409,
		}
	}

	// DrawPile에서 14장 배분
	rack := make([]string, initialTiles)
	copy(rack, state.DrawPile[:initialTiles])
	state.DrawPile = state.DrawPile[initialTiles:]

	newPlayer := model.PlayerState{
		SeatOrder:      player.Seat,
		UserID:         player.UserID,
		DisplayName:    player.DisplayName,
		PlayerType:     player.Type,
		HasInitialMeld: false,
		Rack:           rack,
		Status:         model.PlayerStatusActive,
	}
	state.Players = append(state.Players, newPlayer)

	if err := s.gameRepo.SaveGameState(state); err != nil {
		return fmt.Errorf("game_service: save after add player mid game: %w", err)
	}
	return nil
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

// advanceTurn 다음 활성(ACTIVE) 플레이어 seat을 반환한다.
// FORFEITED 상태의 플레이어는 건너뛴다.
func advanceTurn(state *model.GameStateRedis) int {
	n := len(state.Players)
	if n == 0 {
		return 0
	}
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
	// 최대 n번 탐색 (전원 FORFEITED 방지)
	for i := 1; i <= n; i++ {
		nextIdx := (currentIdx + i) % n
		if state.Players[nextIdx].Status != model.PlayerStatusForfeited {
			return state.Players[nextIdx].SeatOrder
		}
	}
	return state.Players[currentIdx].SeatOrder // fallback
}

// countActivePlayers FORFEITED가 아닌 플레이어 수를 반환한다.
func countActivePlayers(state *model.GameStateRedis) int {
	count := 0
	for _, p := range state.Players {
		if p.Status != model.PlayerStatusForfeited {
			count++
		}
	}
	return count
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
//
// V-17 / D-01 / D-12: 그룹 ID 발급 정책 (SSOT — 이 함수만 ID 를 결정한다)
//   - 빈 ID("") → UUID v4 신규 발급
//   - "pending-" prefix → UUID v4 신규 발급 (D-12: pending- prefix 는 DB 에 적재되어서는 안 된다)
//   - 유효한 UUID v4(36자) → 그대로 보존
func convertToSetOnTable(placements []TilePlacement) []*model.SetOnTable {
	sets := make([]*model.SetOnTable, 0, len(placements))
	for _, p := range placements {
		groupID := p.ID
		if groupID == "" || strings.HasPrefix(groupID, "pending-") {
			// V-17: 서버가 UUID v4 를 발급한다.
			// D-12: pending- prefix 가 DB 에 적재되지 않도록 교체한다.
			groupID = uuid.NewString()
		}
		tiles := make([]*model.Tile, 0, len(p.Tiles))
		for _, code := range p.Tiles {
			tiles = append(tiles, &model.Tile{Code: code})
		}
		sets = append(sets, &model.SetOnTable{
			ID:    groupID,
			Tiles: tiles,
		})
	}
	return sets
}

// modelSetsToEngineSets model.SetOnTable 슬라이스를 engine.TileSet 슬라이스로 변환한다.
// 유효하지 않은 타일 코드가 있으면 에러를 반환한다.
func modelSetsToEngineSets(sets []*model.SetOnTable) ([]*engine.TileSet, error) {
	result := make([]*engine.TileSet, 0, len(sets))
	for _, s := range sets {
		tiles := make([]*engine.Tile, 0, len(s.Tiles))
		for _, t := range s.Tiles {
			parsed, err := engine.Parse(t.Code)
			if err != nil {
				return nil, fmt.Errorf("유효하지 않은 타일 코드: %s", t.Code)
			}
			tiles = append(tiles, parsed)
		}
		result = append(result, &engine.TileSet{
			ID:    s.ID,
			Tiles: tiles,
		})
	}
	return result, nil
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

// collectAllTilesFromGroups TilePlacement 슬라이스에서 모든 타일 코드를 빈도 맵으로 수집한다.
func collectAllTilesFromGroups(groups []TilePlacement) map[string]int {
	freq := make(map[string]int)
	for _, g := range groups {
		for _, t := range g.Tiles {
			freq[t]++
		}
	}
	return freq
}

// containsTileCode 빈도 맵에서 타일 코드가 1개 이상 있는지 확인하고 사용 시 차감한다.
func containsTileCode(freq map[string]int, code string) bool {
	if freq[code] > 0 {
		freq[code]--
		return true
	}
	return false
}

// snapshotKey 스냅샷 맵의 키를 생성한다.
func snapshotKey(gameID string, seat int) string {
	return fmt.Sprintf("%s:%d", gameID, seat)
}
