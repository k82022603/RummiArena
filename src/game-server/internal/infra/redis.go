package infra

import (
	"context"
	"fmt"
	"time"

	"github.com/redis/go-redis/v9"
	"go.uber.org/zap"

	"github.com/k82022603/RummiArena/game-server/internal/config"
)

// NewRedisClient Redis 클라이언트를 초기화하고 Ping을 수행한다.
// Redis는 선택적 의존성이므로: 연결 실패 시 nil과 warn 로그를 반환하며
// 서버는 인메모리 fallback으로 계속 동작한다.
func NewRedisClient(cfg config.RedisConfig, logger *zap.Logger) (*redis.Client, error) {
	addr := fmt.Sprintf("%s:%s", cfg.Host, cfg.Port)

	opts := &redis.Options{
		Addr:         addr,
		Password:     cfg.Password,
		DB:           0,
		DialTimeout:  5 * time.Second,
		ReadTimeout:  3 * time.Second,
		WriteTimeout: 3 * time.Second,
		PoolSize:     10,
		MinIdleConns: 2,
		MaxRetries:   3,
	}

	client := redis.NewClient(opts)

	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()

	if err := client.Ping(ctx).Err(); err != nil {
		// Redis 연결 실패: warn 레벨 로그 후 nil 반환 (서버는 계속 시작)
		logger.Warn("redis not available — running with in-memory fallback",
			zap.String("addr", addr),
			zap.Error(err),
		)
		_ = client.Close()
		return nil, nil //nolint:nilerr
	}

	logger.Info("redis connected",
		zap.String("addr", addr),
		zap.Int("pool_size", opts.PoolSize),
	)
	return client, nil
}

// IsRedisAvailable Redis 클라이언트가 유효하고 연결된 상태인지 확인한다.
func IsRedisAvailable(client *redis.Client) bool {
	if client == nil {
		return false
	}
	ctx, cancel := context.WithTimeout(context.Background(), 2*time.Second)
	defer cancel()
	return client.Ping(ctx).Err() == nil
}
