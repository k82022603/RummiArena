package repository

import (
	"context"
	"encoding/json"
	"fmt"
	"time"

	"github.com/redis/go-redis/v9"

	"github.com/k82022603/RummiArena/game-server/internal/model"
)

const gameStateTTL = 2 * time.Hour

// GameStateRepository defines the Redis-backed game state operations.
type GameStateRepository interface {
	SaveGameState(ctx context.Context, state *model.GameStateRedis) error
	GetGameState(ctx context.Context, gameID string) (*model.GameStateRedis, error)
	DeleteGameState(ctx context.Context, gameID string) error
}

type redisGameStateRepo struct {
	client *redis.Client
}

// NewRedisGameStateRepo creates a Redis-backed GameStateRepository.
func NewRedisGameStateRepo(client *redis.Client) GameStateRepository {
	return &redisGameStateRepo{client: client}
}

func gameStateKey(gameID string) string {
	return fmt.Sprintf("game:%s:state", gameID)
}

func (r *redisGameStateRepo) SaveGameState(ctx context.Context, state *model.GameStateRedis) error {
	data, err := json.Marshal(state)
	if err != nil {
		return fmt.Errorf("redis_repo: marshal game state: %w", err)
	}
	if err := r.client.Set(ctx, gameStateKey(state.GameID), data, gameStateTTL).Err(); err != nil {
		return fmt.Errorf("redis_repo: set game state: %w", err)
	}
	return nil
}

func (r *redisGameStateRepo) GetGameState(ctx context.Context, gameID string) (*model.GameStateRedis, error) {
	data, err := r.client.Get(ctx, gameStateKey(gameID)).Bytes()
	if err != nil {
		if err == redis.Nil {
			return nil, fmt.Errorf("redis_repo: game state not found for gameID %q", gameID)
		}
		return nil, fmt.Errorf("redis_repo: get game state: %w", err)
	}

	var state model.GameStateRedis
	if err := json.Unmarshal(data, &state); err != nil {
		return nil, fmt.Errorf("redis_repo: unmarshal game state: %w", err)
	}
	return &state, nil
}

func (r *redisGameStateRepo) DeleteGameState(ctx context.Context, gameID string) error {
	if err := r.client.Del(ctx, gameStateKey(gameID)).Err(); err != nil {
		return fmt.Errorf("redis_repo: delete game state: %w", err)
	}
	return nil
}
