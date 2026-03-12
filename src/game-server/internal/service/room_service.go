package service

import "github.com/k82022603/RummiArena/game-server/internal/model"

// RoomService Room 생성/관리 비즈니스 로직
type RoomService interface {
	CreateRoom(req *CreateRoomRequest) (*model.Room, error)
	GetRoom(id string) (*model.Room, error)
	ListRooms() ([]*model.Room, error)
	JoinRoom(roomID, userID string) error
	LeaveRoom(roomID, userID string) error
}

// CreateRoomRequest Room 생성 요청 DTO
type CreateRoomRequest struct {
	PlayerCount    int    `json:"playerCount"`
	TurnTimeoutSec int    `json:"turnTimeoutSec"`
	HostUserID     string `json:"-"`
}

type roomService struct {
	// TODO: repository 주입
}

// NewRoomService RoomService 구현체 생성자
func NewRoomService() RoomService {
	return &roomService{}
}

func (s *roomService) CreateRoom(req *CreateRoomRequest) (*model.Room, error) {
	// TODO: 구현
	return nil, nil
}

func (s *roomService) GetRoom(id string) (*model.Room, error) {
	// TODO: 구현
	return nil, nil
}

func (s *roomService) ListRooms() ([]*model.Room, error) {
	// TODO: 구현
	return nil, nil
}

func (s *roomService) JoinRoom(roomID, userID string) error {
	// TODO: 구현
	return nil
}

func (s *roomService) LeaveRoom(roomID, userID string) error {
	// TODO: 구현
	return nil
}
