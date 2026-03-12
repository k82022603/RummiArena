package service

import "github.com/k82022603/RummiArena/game-server/internal/model"

// TurnAction 턴 액션 타입
type TurnAction string

const (
	TurnActionPlace TurnAction = "place"
	TurnActionDraw  TurnAction = "draw"
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
	Success     bool               `json:"success"`
	NextSeat    int                `json:"nextSeat"`
	GameState   *model.GameStateRedis `json:"gameState,omitempty"`
	ErrorCode   string             `json:"errorCode,omitempty"`
}

// TurnService 턴 진행 비즈니스 로직
type TurnService interface {
	PlaceTiles(req *PlaceTilesRequest) (*TurnResult, error)
	DrawTile(gameID string, playerSeat int) (*TurnResult, error)
	HandleTimeout(gameID string, playerSeat int) (*TurnResult, error)
}

type turnService struct {
	// TODO: repository, engine 주입
}

// NewTurnService TurnService 구현체 생성자
func NewTurnService() TurnService {
	return &turnService{}
}

func (s *turnService) PlaceTiles(req *PlaceTilesRequest) (*TurnResult, error) {
	// TODO: Engine 검증 → 적용 → Redis 업데이트 → 승리 조건 체크
	return nil, nil
}

func (s *turnService) DrawTile(gameID string, playerSeat int) (*TurnResult, error) {
	// TODO: 드로우 파일에서 1장 뽑기 → 랙에 추가 → 다음 턴
	return nil, nil
}

func (s *turnService) HandleTimeout(gameID string, playerSeat int) (*TurnResult, error) {
	// TODO: 스냅샷 롤백 + 자동 드로우 1장
	return nil, nil
}
