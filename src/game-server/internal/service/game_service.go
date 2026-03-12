package service

import "github.com/k82022603/RummiArena/game-server/internal/model"

// GameService 게임 생명주기 비즈니스 로직
type GameService interface {
	StartGame(roomID string) (*model.Game, error)
	GetGame(gameID string) (*model.Game, error)
	GetGameState(gameID string) (*model.GameStateRedis, error)
	EndGame(gameID string) error
}

type gameService struct {
	// TODO: repository 주입
}

// NewGameService GameService 구현체 생성자
func NewGameService() GameService {
	return &gameService{}
}

func (s *gameService) StartGame(roomID string) (*model.Game, error) {
	// TODO: 타일 106장 생성 → Fisher-Yates 셔플 → 플레이어별 14장 분배 → Redis 저장
	return nil, nil
}

func (s *gameService) GetGame(gameID string) (*model.Game, error) {
	// TODO: 구현
	return nil, nil
}

func (s *gameService) GetGameState(gameID string) (*model.GameStateRedis, error) {
	// TODO: Redis에서 게임 상태 조회
	return nil, nil
}

func (s *gameService) EndGame(gameID string) error {
	// TODO: 게임 종료 처리, 점수 계산, ELO 업데이트
	return nil
}
