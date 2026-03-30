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
	JoinRoom(roomID, userID, displayName string) error
	LeaveRoom(roomID, userID string) (*model.RoomState, error)
	StartGame(roomID, hostUserID string) (*model.GameStateRedis, error)
	DeleteRoom(roomID, hostUserID string) error
	FinishRoom(roomID string) error
	ClearActiveRoomForUser(userID string)
}

// AIPlayerRequest AI 플레이어 설정 DTO
type AIPlayerRequest struct {
	Type            string
	Persona         string
	Difficulty      string
	PsychologyLevel int
}

// CreateRoomRequest Room 생성 요청 DTO
type CreateRoomRequest struct {
	Name            string
	PlayerCount     int
	TurnTimeoutSec  int
	HostUserID      string
	HostDisplayName string
	AIPlayers       []AIPlayerRequest
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
	gs := &gameService{gameRepo: gameRepo, snapshots: make(map[string]*turnSnapshot)}
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

	// 중복 방 참가 검증: 이미 WAITING/PLAYING 방에 참가 중인지 확인
	if err := s.checkDuplicateRoom(req.HostUserID); err != nil {
		return nil, err
	}

	name := req.Name
	if name == "" {
		name = fmt.Sprintf("%s의 방", req.HostUserID[:8])
	}

	roomID := uuid.New().String()
	roomCode := generateRoomCode()

	// seats: 0번은 호스트, AI 플레이어 순서대로, 나머지는 EMPTY
	players := make([]model.RoomPlayer, req.PlayerCount)
	players[0] = model.RoomPlayer{
		Seat:        0,
		UserID:      req.HostUserID,
		DisplayName: req.HostDisplayName,
		Type:        "HUMAN",
		Status:      model.SeatStatusConnected,
	}
	for i := 1; i < req.PlayerCount; i++ {
		aiIdx := i - 1
		if aiIdx < len(req.AIPlayers) {
			ai := req.AIPlayers[aiIdx]
			aiUserID := uuid.New().String()
			aiName := formatAIDisplayName(ai.Persona, ai.Type, i)
			players[i] = model.RoomPlayer{
				Seat:              i,
				UserID:            aiUserID,
				DisplayName:       aiName,
				Type:              ai.Type,
				Persona:           ai.Persona,
				Difficulty:        ai.Difficulty,
				AIPsychologyLevel: ai.PsychologyLevel,
				Status:            model.SeatStatusReady,
			}
		} else {
			players[i] = model.RoomPlayer{
				Seat:   i,
				Type:   "HUMAN",
				Status: model.SeatStatusEmpty,
			}
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

	// 사용자-방 매핑 설정
	_ = s.roomRepo.SetActiveRoomForUser(req.HostUserID, roomID)

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
func (s *roomService) JoinRoom(roomID, userID, displayName string) error {
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

	// 중복 방 참가 검증: 다른 방에 이미 참가 중인지 확인
	if err := s.checkDuplicateRoom(userID); err != nil {
		return err
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
		Seat:        emptySeat,
		UserID:      userID,
		DisplayName: displayName,
		Type:        "HUMAN",
		Status:      model.SeatStatusConnected,
	}
	room.UpdatedAt = time.Now().UTC()

	if err := s.roomRepo.SaveRoom(room); err != nil {
		return fmt.Errorf("room_service: save room after join: %w", err)
	}

	// 사용자-방 매핑 설정
	_ = s.roomRepo.SetActiveRoomForUser(userID, roomID)

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
				// 호스트 퇴장: 방 전체 취소 -> 모든 플레이어 매핑 정리
				room.Status = model.RoomStatusCancelled
				for _, pp := range room.Players {
					if pp.UserID != "" {
						_ = s.roomRepo.ClearActiveRoomForUser(pp.UserID)
					}
				}
			} else {
				// 일반 플레이어 퇴장: seat 초기화
				room.Players[i] = model.RoomPlayer{
					Seat:   i,
					Type:   "HUMAN",
					Status: model.SeatStatusEmpty,
				}
				_ = s.roomRepo.ClearActiveRoomForUser(userID)
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

// FinishRoom 게임 종료 시 방 상태를 FINISHED로 변경한다.
// 이미 FINISHED/CANCELLED 상태이면 no-op으로 처리한다.
func (s *roomService) FinishRoom(roomID string) error {
	room, err := s.roomRepo.GetRoom(roomID)
	if err != nil {
		return &ServiceError{Code: "NOT_FOUND", Message: errMsgRoomNotFound, Status: 404}
	}
	if room.Status == model.RoomStatusFinished || room.Status == model.RoomStatusCancelled {
		return nil // 이미 종료됨
	}
	room.Status = model.RoomStatusFinished
	room.UpdatedAt = time.Now().UTC()

	// 모든 참가자 사용자-방 매핑 정리
	for _, p := range room.Players {
		if p.UserID != "" {
			_ = s.roomRepo.ClearActiveRoomForUser(p.UserID)
		}
	}

	return s.roomRepo.SaveRoom(room)
}

// ClearActiveRoomForUser 특정 사용자의 활성 방 매핑을 제거한다.
// 기권(FORFEITED) 처리 시 외부에서 호출할 수 있도록 공개한다.
func (s *roomService) ClearActiveRoomForUser(userID string) {
	_ = s.roomRepo.ClearActiveRoomForUser(userID)
}

// checkDuplicateRoom 사용자가 이미 활성 방(WAITING/PLAYING)에 참가 중인지 확인한다.
// - FINISHED/CANCELLED 방: 매핑만 정리하고 허용
// - WAITING 방: 자동 퇴장 처리 후 허용 (대기실 방치 → 새 방 생성은 정상 UX)
// - PLAYING 방: 409 ALREADY_IN_ROOM 거부 (게임 중 이탈 방지)
func (s *roomService) checkDuplicateRoom(userID string) error {
	existingRoomID, err := s.roomRepo.GetActiveRoomForUser(userID)
	if err != nil {
		return nil // 조회 실패는 무시 (conservative)
	}
	if existingRoomID == "" {
		return nil // 참가 중인 방 없음
	}
	// 방이 아직 활성 상태인지 더블 체크
	room, err := s.roomRepo.GetRoom(existingRoomID)
	if err != nil {
		// 방이 삭제되었으면 매핑 정리
		_ = s.roomRepo.ClearActiveRoomForUser(userID)
		return nil
	}
	if room.Status == model.RoomStatusFinished || room.Status == model.RoomStatusCancelled {
		_ = s.roomRepo.ClearActiveRoomForUser(userID)
		return nil
	}
	if room.Status == model.RoomStatusWaiting {
		// WAITING 방: 자동 퇴장 처리 후 허용
		// 대기실에 머물다 브라우저를 닫고 새 방을 만드는 것은 정상 UX
		_, _ = s.LeaveRoom(existingRoomID, userID)
		return nil
	}
	// PLAYING 방: 게임 중에는 다른 방 참가 불가
	return &ServiceError{Code: "ALREADY_IN_ROOM", Message: "이미 게임 중인 방이 있습니다.", Status: 409}
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

// aiTypeToFriendlyModel AI 타입 식별자를 사용자 친화적 모델명으로 변환한다.
func aiTypeToFriendlyModel(aiType string) string {
	switch aiType {
	case "AI_OPENAI":
		return "GPT-4o"
	case "AI_CLAUDE":
		return "Claude"
	case "AI_DEEPSEEK":
		return "DeepSeek"
	case "AI_LLAMA":
		return "LLaMA"
	default:
		if aiType != "" {
			return aiType
		}
		return "AI"
	}
}

// formatAIDisplayName AI 플레이어의 표시 이름을 생성한다.
// 우선순위: Persona(캐릭터명) > 모델명 > 기본값.
// 예: "Shark (GPT-4o)", "Fox (Claude)", "AI-Player-2"
func formatAIDisplayName(persona, aiType string, seatIndex int) string {
	model := aiTypeToFriendlyModel(aiType)
	if persona != "" {
		return fmt.Sprintf("%s (%s)", persona, model)
	}
	if aiType != "" {
		return model
	}
	return fmt.Sprintf("AI-Player-%d", seatIndex)
}
