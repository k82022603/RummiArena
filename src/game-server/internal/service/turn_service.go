package service

import (
	"github.com/k82022603/RummiArena/game-server/internal/model"
	"github.com/k82022603/RummiArena/game-server/internal/repository"
)

// TurnAction 턴 액션 타입
type TurnAction string

const (
	TurnActionPlace   TurnAction = "place"
	TurnActionDraw    TurnAction = "draw"
	TurnActionConfirm TurnAction = "confirm"
	TurnActionReset   TurnAction = "reset"
)

// PlaceTilesRequest 타일 배치 요청
type PlaceTilesRequest struct {
	GameID        string             `json:"gameId"`
	PlayerSeat    int                `json:"playerSeat"`
	TableGroups   []model.SetOnTable `json:"tableGroups"`
	TilesFromRack []string           `json:"tilesFromRack"`
}

// TurnResult 턴 처리 결과
type TurnResult struct {
	Success   bool                  `json:"success"`
	NextSeat  int                   `json:"nextSeat"`
	GameState *model.GameStateRedis `json:"gameState,omitempty"`
	ErrorCode string                `json:"errorCode,omitempty"`
}

// TurnService 턴 진행 비즈니스 로직.
// PlaceTiles, DrawTile, HandleTimeout은 GameService에 위임하며,
// TurnService는 고수준 오케스트레이션 역할을 담당한다.
type TurnService interface {
	PlaceTiles(req *PlaceTilesRequest) (*TurnResult, error)
	DrawTile(gameID string, playerSeat int) (*TurnResult, error)
	HandleTimeout(gameID string, playerSeat int) (*TurnResult, error)
	GetCurrentSeat(gameID string) (int, error)
	IsPlayerTurn(gameID string, seat int) (bool, error)
}

type turnService struct {
	gameRepo    repository.MemoryGameStateRepository
	gameService GameService
}

// NewTurnService TurnService 구현체 생성자
func NewTurnService(
	gameRepo repository.MemoryGameStateRepository,
	gameService GameService,
) TurnService {
	return &turnService{
		gameRepo:    gameRepo,
		gameService: gameService,
	}
}

// PlaceTiles 타일 배치 요청을 GameService에 위임한다.
func (s *turnService) PlaceTiles(req *PlaceTilesRequest) (*TurnResult, error) {
	// PlaceTilesRequest → PlaceRequest 변환
	tableGroups := make([]TilePlacement, len(req.TableGroups))
	for i, g := range req.TableGroups {
		tiles := make([]string, len(g.Tiles))
		for j, t := range g.Tiles {
			tiles[j] = t.Code
		}
		tableGroups[i] = TilePlacement{ID: g.ID, Tiles: tiles}
	}

	placeReq := &PlaceRequest{
		Seat:          req.PlayerSeat,
		TableGroups:   tableGroups,
		TilesFromRack: req.TilesFromRack,
	}

	result, err := s.gameService.PlaceTiles(req.GameID, placeReq)
	if err != nil {
		return nil, err
	}
	return &TurnResult{
		Success:   result.Success,
		NextSeat:  result.NextSeat,
		GameState: result.GameState,
		ErrorCode: result.ErrorCode,
	}, nil
}

// DrawTile 드로우 요청을 GameService에 위임한다.
func (s *turnService) DrawTile(gameID string, playerSeat int) (*TurnResult, error) {
	result, err := s.gameService.DrawTile(gameID, playerSeat)
	if err != nil {
		return nil, err
	}
	return &TurnResult{
		Success:   result.Success,
		NextSeat:  result.NextSeat,
		GameState: result.GameState,
		ErrorCode: result.ErrorCode,
	}, nil
}

// HandleTimeout 턴 타임아웃 시 자동 드로우 1장 후 다음 턴으로 넘긴다.
// 현재 구현은 DrawTile과 동일하다 (V-09: 타임아웃 → 강제 드로우).
func (s *turnService) HandleTimeout(gameID string, playerSeat int) (*TurnResult, error) {
	// 1. ResetTurn: 임시 배치 롤백
	if _, err := s.gameService.ResetTurn(gameID, playerSeat); err != nil {
		return nil, err
	}
	// 2. DrawTile: 강제 드로우
	return s.DrawTile(gameID, playerSeat)
}

// GetCurrentSeat 현재 턴의 seat 번호를 반환한다.
func (s *turnService) GetCurrentSeat(gameID string) (int, error) {
	state, err := s.gameRepo.GetGameState(gameID)
	if err != nil {
		return -1, &ServiceError{Code: "NOT_FOUND", Message: "게임을 찾을 수 없습니다.", Status: 404}
	}
	return state.CurrentSeat, nil
}

// IsPlayerTurn 해당 seat가 현재 턴인지 확인한다.
func (s *turnService) IsPlayerTurn(gameID string, seat int) (bool, error) {
	currentSeat, err := s.GetCurrentSeat(gameID)
	if err != nil {
		return false, err
	}
	return currentSeat == seat, nil
}
