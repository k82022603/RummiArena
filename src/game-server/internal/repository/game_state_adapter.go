package repository

import (
	"context"
	"fmt"

	"github.com/redis/go-redis/v9"

	"github.com/k82022603/RummiArena/game-server/internal/model"
)

// =============================================================================
// MemoryGameStateRepository — 인메모리 Fallback 어댑터
// =============================================================================

// memoryGameStateRepoAdapter Redis가 없을 때 인메모리 fallback 역할.
// MemoryGameStateRepository 인터페이스를 구현하므로 service 레이어 변경 없이 교체 가능.
type memoryGameStateRepoAdapter struct {
	inner MemoryGameStateRepository
}

// Compile-time interface guard
var _ MemoryGameStateRepository = (*memoryGameStateRepoAdapter)(nil)

// NewMemoryGameStateRepoAdapter 인메모리 구현을 MemoryGameStateRepository로 반환한다.
func NewMemoryGameStateRepoAdapter() MemoryGameStateRepository {
	return &memoryGameStateRepoAdapter{
		inner: NewMemoryGameStateRepo(),
	}
}

func (a *memoryGameStateRepoAdapter) SaveGameState(state *model.GameStateRedis) error {
	return a.inner.SaveGameState(state)
}

func (a *memoryGameStateRepoAdapter) GetGameState(gameID string) (*model.GameStateRedis, error) {
	return a.inner.GetGameState(gameID)
}

func (a *memoryGameStateRepoAdapter) DeleteGameState(gameID string) error {
	return a.inner.DeleteGameState(gameID)
}

// =============================================================================
// RedisGameStateMemAdapter — Redis repo를 MemoryGameStateRepository 인터페이스로 래핑
// =============================================================================

// redisGameStateMemAdapter context-aware Redis repo를 MemoryGameStateRepository로 래핑.
// service 레이어가 MemoryGameStateRepository만 의존하므로 이 어댑터를 통해 교체한다.
type redisGameStateMemAdapter struct {
	inner *redis.Client
}

// Compile-time interface guard
var _ MemoryGameStateRepository = (*redisGameStateMemAdapter)(nil)

// NewRedisGameStateMemAdapter Redis 클라이언트를 MemoryGameStateRepository로 래핑한다.
// Redis가 연결된 경우 main.go에서 이 어댑터를 사용한다.
func NewRedisGameStateMemAdapter(client *redis.Client) MemoryGameStateRepository {
	return &redisGameStateMemAdapter{inner: client}
}

func (a *redisGameStateMemAdapter) SaveGameState(state *model.GameStateRedis) error {
	repo := NewRedisGameStateRepo(a.inner)
	return repo.SaveGameState(context.Background(), state)
}

func (a *redisGameStateMemAdapter) GetGameState(gameID string) (*model.GameStateRedis, error) {
	repo := NewRedisGameStateRepo(a.inner)
	result, err := repo.GetGameState(context.Background(), gameID)
	if err != nil {
		return nil, fmt.Errorf("redis adapter: %w", err)
	}
	return result, nil
}

func (a *redisGameStateMemAdapter) DeleteGameState(gameID string) error {
	repo := NewRedisGameStateRepo(a.inner)
	return repo.DeleteGameState(context.Background(), gameID)
}
