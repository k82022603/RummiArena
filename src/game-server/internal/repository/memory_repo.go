package repository

import (
	"fmt"
	"sync"

	"github.com/k82022603/RummiArena/game-server/internal/model"
)

// MemoryRoomRepository RoomState를 인메모리 map으로 관리한다.
// MVP 단계에서 PostgreSQL/Redis 연동 전까지 사용한다.
// 인터페이스를 통해 추후 교체 가능하도록 설계한다.
type MemoryRoomRepository interface {
	SaveRoom(room *model.RoomState) error
	GetRoom(id string) (*model.RoomState, error)
	GetRoomByCode(code string) (*model.RoomState, error)
	ListRooms() ([]*model.RoomState, error)
	DeleteRoom(id string) error
	GetActiveRoomForUser(userID string) (string, error)
	SetActiveRoomForUser(userID, roomID string) error
	ClearActiveRoomForUser(userID string) error
}

type memoryRoomRepo struct {
	mu        sync.RWMutex
	rooms     map[string]*model.RoomState // key: room ID
	codes     map[string]string           // key: roomCode -> room ID
	userRooms map[string]string           // userId -> roomId (활성 방만)
}

// NewMemoryRoomRepo MemoryRoomRepository 구현체를 생성한다.
func NewMemoryRoomRepo() MemoryRoomRepository {
	return &memoryRoomRepo{
		rooms:     make(map[string]*model.RoomState),
		codes:     make(map[string]string),
		userRooms: make(map[string]string),
	}
}

func (r *memoryRoomRepo) SaveRoom(room *model.RoomState) error {
	r.mu.Lock()
	defer r.mu.Unlock()

	// 기존 방의 코드가 바뀌었을 경우 이전 코드 인덱스를 제거한다.
	if existing, ok := r.rooms[room.ID]; ok {
		if existing.RoomCode != room.RoomCode {
			delete(r.codes, existing.RoomCode)
		}
	}

	// 딥 카피: 슬라이스 참조 공유를 막는다.
	copied := *room
	players := make([]model.RoomPlayer, len(room.Players))
	copy(players, room.Players)
	copied.Players = players

	r.rooms[room.ID] = &copied
	r.codes[room.RoomCode] = room.ID
	return nil
}

func (r *memoryRoomRepo) GetRoom(id string) (*model.RoomState, error) {
	r.mu.RLock()
	defer r.mu.RUnlock()

	room, ok := r.rooms[id]
	if !ok {
		return nil, fmt.Errorf("memory_repo: room not found: %q", id)
	}
	// 읽기 전용 복사본 반환
	copied := *room
	players := make([]model.RoomPlayer, len(room.Players))
	copy(players, room.Players)
	copied.Players = players
	return &copied, nil
}

func (r *memoryRoomRepo) GetRoomByCode(code string) (*model.RoomState, error) {
	r.mu.RLock()
	id, ok := r.codes[code]
	r.mu.RUnlock()
	if !ok {
		return nil, fmt.Errorf("memory_repo: room code not found: %q", code)
	}
	return r.GetRoom(id)
}

func (r *memoryRoomRepo) ListRooms() ([]*model.RoomState, error) {
	r.mu.RLock()
	defer r.mu.RUnlock()

	result := make([]*model.RoomState, 0, len(r.rooms))
	for _, room := range r.rooms {
		// WAITING 또는 PLAYING 상태만 반환 (설계 S1.2: 활성 방만 목록 제공)
		if room.Status == model.RoomStatusWaiting || room.Status == model.RoomStatusPlaying {
			copied := *room
			players := make([]model.RoomPlayer, len(room.Players))
			copy(players, room.Players)
			copied.Players = players
			result = append(result, &copied)
		}
	}
	return result, nil
}

func (r *memoryRoomRepo) DeleteRoom(id string) error {
	r.mu.Lock()
	defer r.mu.Unlock()

	room, ok := r.rooms[id]
	if !ok {
		return fmt.Errorf("memory_repo: room not found: %q", id)
	}
	delete(r.codes, room.RoomCode)
	delete(r.rooms, id)
	return nil
}

// GetActiveRoomForUser 사용자가 현재 참가 중인 활성 방 ID를 반환한다.
// 참가 중인 방이 없으면 빈 문자열과 nil을 반환한다.
func (r *memoryRoomRepo) GetActiveRoomForUser(userID string) (string, error) {
	r.mu.RLock()
	defer r.mu.RUnlock()

	roomID, ok := r.userRooms[userID]
	if !ok {
		return "", nil
	}

	// 방이 아직 활성 상태인지 확인 (WAITING 또는 PLAYING)
	room, exists := r.rooms[roomID]
	if !exists || (room.Status != model.RoomStatusWaiting && room.Status != model.RoomStatusPlaying) {
		return "", nil
	}

	return roomID, nil
}

// SetActiveRoomForUser 사용자-방 매핑을 설정한다.
func (r *memoryRoomRepo) SetActiveRoomForUser(userID, roomID string) error {
	r.mu.Lock()
	defer r.mu.Unlock()
	r.userRooms[userID] = roomID
	return nil
}

// ClearActiveRoomForUser 사용자-방 매핑을 제거한다.
func (r *memoryRoomRepo) ClearActiveRoomForUser(userID string) error {
	r.mu.Lock()
	defer r.mu.Unlock()
	delete(r.userRooms, userID)
	return nil
}

// MemoryGameStateRepository GameStateRedis 구조체를 인메모리 map으로 관리한다.
// Redis 연동 전 MVP 단계에서 사용한다.
type MemoryGameStateRepository interface {
	SaveGameState(state *model.GameStateRedis) error
	GetGameState(gameID string) (*model.GameStateRedis, error)
	DeleteGameState(gameID string) error
}

type memoryGameStateRepo struct {
	mu     sync.RWMutex
	states map[string]*model.GameStateRedis // key: gameID
}

// NewMemoryGameStateRepo MemoryGameStateRepository 구현체를 생성한다.
func NewMemoryGameStateRepo() MemoryGameStateRepository {
	return &memoryGameStateRepo{
		states: make(map[string]*model.GameStateRedis),
	}
}

func (r *memoryGameStateRepo) SaveGameState(state *model.GameStateRedis) error {
	r.mu.Lock()
	defer r.mu.Unlock()

	// 딥 카피
	copied := *state
	drawPile := make([]string, len(state.DrawPile))
	copy(drawPile, state.DrawPile)
	copied.DrawPile = drawPile

	table := make([]*model.SetOnTable, len(state.Table))
	for i, s := range state.Table {
		setCopied := *s
		tiles := make([]*model.Tile, len(s.Tiles))
		copy(tiles, s.Tiles)
		setCopied.Tiles = tiles
		table[i] = &setCopied
	}
	copied.Table = table

	players := make([]model.PlayerState, len(state.Players))
	for i, p := range state.Players {
		pCopied := p
		rack := make([]string, len(p.Rack))
		copy(rack, p.Rack)
		pCopied.Rack = rack
		players[i] = pCopied
	}
	copied.Players = players

	r.states[state.GameID] = &copied
	return nil
}

func (r *memoryGameStateRepo) GetGameState(gameID string) (*model.GameStateRedis, error) {
	r.mu.RLock()
	defer r.mu.RUnlock()

	state, ok := r.states[gameID]
	if !ok {
		return nil, fmt.Errorf("memory_repo: game state not found: %q", gameID)
	}
	// 읽기 전용 복사본
	copied := *state
	drawPile := make([]string, len(state.DrawPile))
	copy(drawPile, state.DrawPile)
	copied.DrawPile = drawPile

	table := make([]*model.SetOnTable, len(state.Table))
	for i, s := range state.Table {
		setCopied := *s
		tiles := make([]*model.Tile, len(s.Tiles))
		copy(tiles, s.Tiles)
		setCopied.Tiles = tiles
		table[i] = &setCopied
	}
	copied.Table = table

	players := make([]model.PlayerState, len(state.Players))
	for i, p := range state.Players {
		pCopied := p
		rack := make([]string, len(p.Rack))
		copy(rack, p.Rack)
		pCopied.Rack = rack
		players[i] = pCopied
	}
	copied.Players = players

	return &copied, nil
}

func (r *memoryGameStateRepo) DeleteGameState(gameID string) error {
	r.mu.Lock()
	defer r.mu.Unlock()

	if _, ok := r.states[gameID]; !ok {
		return fmt.Errorf("memory_repo: game state not found: %q", gameID)
	}
	delete(r.states, gameID)
	return nil
}
