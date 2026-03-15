package service

import (
	"fmt"
	"math/rand"
	"time"

	"github.com/google/uuid"
	"github.com/k82022603/RummiArena/game-server/internal/model"
	"github.com/k82022603/RummiArena/game-server/internal/repository"
)

const (
	errMsgRoomNotFound = "방을 찾을 수 없습니다."
)

// RoomService Room 생성/관리 비즈니스 로직
type RoomService interface {
	CreateRoom(req *CreateRoomRequest) (*model.RoomState, error)
	GetRoom(id string) (*model.RoomState, error)
	ListRooms() ([]*model.RoomState, error)
	JoinRoom(roomID, userID string) error
	LeaveRoom(roomID, userID string) (*model.RoomState, error)
	StartGame(roomID, hostUserID string) (*model.GameStateRedis, error)
	DeleteRoom(roomID, hostUserID string) error
}

// CreateRoomRequest Room 생성 요청 DTO
type CreateRoomRequest struct {
	Name           string `json:"name"`
	PlayerCount    int    `json:"playerCount"`
	TurnTimeoutSec int    `json:"turnTimeoutSec"`
	HostUserID     string `json:"-"`
}

type roomService struct {
	roomRepo  repository.MemoryRoomRepository
	gameRepo  repository.MemoryGameStateRepository
	gameState *gameService // 게임 시작 시 gameService 사용
}

// NewRoomService RoomService 구현체 생성자
func NewRoomService(
	roomRepo repository.MemoryRoomRepository,
	gameRepo repository.MemoryGameStateRepository,
) RoomService {
	gs := &gameService{gameRepo: gameRepo}
	return &roomService{
		roomRepo:  roomRepo,
		gameRepo:  gameRepo,
		gameState: gs,
	}
}

// CreateRoom 새 방을 생성하고 호스트를 seat 0에 배정한다.
// playerCount: 2~4, turnTimeoutSec: 30~120
func (s *roomService) CreateRoom(req *CreateRoomRequest) (*model.RoomState, error) {
	if req.PlayerCount < 2 || req.PlayerCount > 4 {
		return nil, &ServiceError{Code: "INVALID_REQUEST", Message: "playerCount는 2~4 사이여야 합니다.", Status: 400}
	}
	if req.TurnTimeoutSec < 30 || req.TurnTimeoutSec > 120 {
		return nil, &ServiceError{Code: "INVALID_REQUEST", Message: "turnTimeoutSec은 30~120초 사이여야 합니다.", Status: 400}
	}
	if req.HostUserID == "" {
		return nil, &ServiceError{Code: "UNAUTHORIZED", Message: "인증된 사용자만 방을 생성할 수 있습니다.", Status: 401}
	}

	name := req.Name
	if name == "" {
		name = fmt.Sprintf("%s의 방", req.HostUserID[:8])
	}

	roomID := uuid.New().String()
	roomCode := generateRoomCode()

	// seats: 0번은 호스트, 나머지는 EMPTY
	players := make([]model.RoomPlayer, req.PlayerCount)
	players[0] = model.RoomPlayer{
		Seat:   0,
		UserID: req.HostUserID,
		Type:   "HUMAN",
		Status: model.SeatStatusConnected,
	}
	for i := 1; i < req.PlayerCount; i++ {
		players[i] = model.RoomPlayer{
			Seat:   i,
			Type:   "HUMAN",
			Status: model.SeatStatusEmpty,
		}
	}

	now := time.Now().UTC()
	room := &model.RoomState{
		ID:             roomID,
		RoomCode:       roomCode,
		Name:           name,
		HostID:         req.HostUserID,
		Status:         model.RoomStatusWaiting,
		MaxPlayers:     req.PlayerCount,
		TurnTimeoutSec: req.TurnTimeoutSec,
		Players:        players,
		CreatedAt:      now,
		UpdatedAt:      now,
	}

	if err := s.roomRepo.SaveRoom(room); err != nil {
		return nil, fmt.Errorf("room_service: save room: %w", err)
	}
	return room, nil
}

// GetRoom 방 ID로 방 정보를 조회한다.
func (s *roomService) GetRoom(id string) (*model.RoomState, error) {
	room, err := s.roomRepo.GetRoom(id)
	if err != nil {
		return nil, &ServiceError{Code: "NOT_FOUND", Message: errMsgRoomNotFound, Status: 404}
	}
	return room, nil
}

// ListRooms WAITING + PLAYING 상태의 모든 방 목록을 반환한다.
func (s *roomService) ListRooms() ([]*model.RoomState, error) {
	rooms, err := s.roomRepo.ListRooms()
	if err != nil {
		return nil, fmt.Errorf("room_service: list rooms: %w", err)
	}
	return rooms, nil
}

// JoinRoom 빈 seat에 userId 플레이어를 배정한다.
// 이미 참여한 경우, 방이 꽉 찼을 경우, 게임이 시작된 경우 에러를 반환한다.
func (s *roomService) JoinRoom(roomID, userID string) error {
	room, err := s.roomRepo.GetRoom(roomID)
	if err != nil {
		return &ServiceError{Code: "NOT_FOUND", Message: errMsgRoomNotFound, Status: 404}
	}

	if room.Status != model.RoomStatusWaiting {
		return &ServiceError{Code: "GAME_ALREADY_STARTED", Message: "이미 시작된 게임에는 참가할 수 없습니다.", Status: 409}
	}

	// 이미 참여 중인지 확인
	for _, p := range room.Players {
		if p.UserID == userID {
			return &ServiceError{Code: "ALREADY_JOINED", Message: "이미 방에 참가하고 있습니다.", Status: 409}
		}
	}

	// 빈 seat 탐색
	emptySeat := -1
	for i, p := range room.Players {
		if p.Status == model.SeatStatusEmpty && p.Type == "HUMAN" && p.UserID == "" {
			emptySeat = i
			break
		}
	}
	if emptySeat < 0 {
		return &ServiceError{Code: "ROOM_FULL", Message: "방이 꽉 찼습니다.", Status: 409}
	}

	room.Players[emptySeat] = model.RoomPlayer{
		Seat:   emptySeat,
		UserID: userID,
		Type:   "HUMAN",
		Status: model.SeatStatusConnected,
	}
	room.UpdatedAt = time.Now().UTC()

	if err := s.roomRepo.SaveRoom(room); err != nil {
		return fmt.Errorf("room_service: save room after join: %w", err)
	}
	return nil
}

// LeaveRoom 플레이어를 방에서 제거한다.
// 호스트가 나가면 방 상태를 CANCELLED로 변경한다.
// 다른 플레이어가 나가면 해당 seat를 EMPTY로 초기화한다.
func (s *roomService) LeaveRoom(roomID, userID string) (*model.RoomState, error) {
	room, err := s.roomRepo.GetRoom(roomID)
	if err != nil {
		return nil, &ServiceError{Code: "NOT_FOUND", Message: errMsgRoomNotFound, Status: 404}
	}

	if room.Status == model.RoomStatusFinished || room.Status == model.RoomStatusCancelled {
		return nil, &ServiceError{Code: "INVALID_REQUEST", Message: "이미 종료된 방입니다.", Status: 400}
	}

	found := false
	for i, p := range room.Players {
		if p.UserID == userID {
			found = true
			if userID == room.HostID {
				// 호스트 퇴장: 방 전체 취소
				room.Status = model.RoomStatusCancelled
			} else {
				// 일반 플레이어 퇴장: seat 초기화
				room.Players[i] = model.RoomPlayer{
					Seat:   i,
					Type:   "HUMAN",
					Status: model.SeatStatusEmpty,
				}
			}
			break
		}
	}

	if !found {
		return nil, &ServiceError{Code: "NOT_FOUND", Message: "해당 플레이어가 방에 없습니다.", Status: 404}
	}

	room.UpdatedAt = time.Now().UTC()
	if err := s.roomRepo.SaveRoom(room); err != nil {
		return nil, fmt.Errorf("room_service: save room after leave: %w", err)
	}
	return room, nil
}

// StartGame 게임을 시작한다.
// 호스트만 시작할 수 있으며, 최소 2명의 플레이어가 필요하다.
// 성공 시 게임 상태를 인메모리에 저장하고 GameStateRedis를 반환한다.
func (s *roomService) StartGame(roomID, hostUserID string) (*model.GameStateRedis, error) {
	room, err := s.roomRepo.GetRoom(roomID)
	if err != nil {
		return nil, &ServiceError{Code: "NOT_FOUND", Message: errMsgRoomNotFound, Status: 404}
	}

	if room.HostID != hostUserID {
		return nil, &ServiceError{Code: "FORBIDDEN", Message: "방장만 게임을 시작할 수 있습니다.", Status: 403}
	}

	if room.Status != model.RoomStatusWaiting {
		return nil, &ServiceError{Code: "GAME_ALREADY_STARTED", Message: "이미 시작된 게임입니다.", Status: 409}
	}

	// 참가 중인 플레이어 수 확인 (EMPTY가 아닌 seat)
	activePlayers := make([]model.RoomPlayer, 0, room.MaxPlayers)
	for _, p := range room.Players {
		if p.Status != model.SeatStatusEmpty {
			activePlayers = append(activePlayers, p)
		}
	}
	if len(activePlayers) < 2 {
		return nil, &ServiceError{Code: "NOT_ENOUGH_PLAYERS", Message: "게임 시작에는 최소 2명이 필요합니다.", Status: 400}
	}

	// gameService를 통해 게임 생성
	gameID := uuid.New().String()
	gameState, err := s.gameState.newGame(gameID, activePlayers, room.TurnTimeoutSec)
	if err != nil {
		return nil, fmt.Errorf("room_service: new game: %w", err)
	}

	// 방 상태 업데이트
	room.Status = model.RoomStatusPlaying
	room.GameID = &gameID
	room.UpdatedAt = time.Now().UTC()

	if err := s.roomRepo.SaveRoom(room); err != nil {
		return nil, fmt.Errorf("room_service: save room after start: %w", err)
	}

	return gameState, nil
}

// DeleteRoom 방을 삭제한다. 호스트만 삭제 가능하다.
func (s *roomService) DeleteRoom(roomID, hostUserID string) error {
	room, err := s.roomRepo.GetRoom(roomID)
	if err != nil {
		return &ServiceError{Code: "NOT_FOUND", Message: errMsgRoomNotFound, Status: 404}
	}

	if room.HostID != hostUserID {
		return &ServiceError{Code: "FORBIDDEN", Message: "방장만 방을 삭제할 수 있습니다.", Status: 403}
	}

	return s.roomRepo.DeleteRoom(roomID)
}

// generateRoomCode 4자리 대문자 알파벳 방 코드를 생성한다.
func generateRoomCode() string {
	const letters = "ABCDEFGHJKLMNPQRSTUVWXYZ" // 혼동 가능한 I, O 제외
	b := make([]byte, 4)
	for i := range b {
		b[i] = letters[rand.Intn(len(letters))]
	}
	return string(b)
}
