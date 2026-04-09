package service

import (
	"context"
	"fmt"
	"os"
	"strconv"
	"time"

	"github.com/redis/go-redis/v9"
)

// AICooldownTTL AI 게임 생성 쿨다운 시간.
// 환경변수 AI_COOLDOWN_SEC로 오버라이드 가능 (0 = 비활성).
var AICooldownTTL = func() time.Duration {
	if v := os.Getenv("AI_COOLDOWN_SEC"); v != "" {
		if sec, err := strconv.Atoi(v); err == nil {
			return time.Duration(sec) * time.Second
		}
	}
	return 5 * time.Minute
}()

// CooldownChecker AI 게임 생성 쿨다운을 관리하는 인터페이스.
// 테스트 시 모킹할 수 있도록 인터페이스로 분리한다.
type CooldownChecker interface {
	// IsOnCooldown 사용자가 AI 게임 생성 쿨다운 상태인지 확인한다.
	// true이면 쿨다운 중, false이면 생성 가능.
	// 에러 발생 시 false를 반환한다 (fail-open).
	IsOnCooldown(userID string) bool

	// SetCooldown 사용자에게 AI 게임 생성 쿨다운을 설정한다.
	SetCooldown(userID string)
}

// redisCooldownChecker Redis 기반 CooldownChecker 구현.
type redisCooldownChecker struct {
	client *redis.Client
}

// NewRedisCooldownChecker Redis 클라이언트를 사용하는 CooldownChecker를 생성한다.
func NewRedisCooldownChecker(client *redis.Client) CooldownChecker {
	return &redisCooldownChecker{client: client}
}

func cooldownKey(userID string) string {
	return fmt.Sprintf("cooldown:ai-game:%s", userID)
}

func (c *redisCooldownChecker) IsOnCooldown(userID string) bool {
	// AI_COOLDOWN_SEC=0 이면 쿨다운 비활성
	if AICooldownTTL <= 0 {
		return false
	}
	ctx := context.Background()
	exists, err := c.client.Exists(ctx, cooldownKey(userID)).Result()
	if err != nil {
		// Redis 장애 시 fail-open: 쿨다운 없이 허용
		return false
	}
	return exists > 0
}

func (c *redisCooldownChecker) SetCooldown(userID string) {
	// AI_COOLDOWN_SEC=0 이면 쿨다운 설정 생략
	if AICooldownTTL <= 0 {
		return
	}
	ctx := context.Background()
	// 에러 무시: 쿨다운 설정 실패 시에도 방 생성은 이미 완료되었으므로 허용
	_ = c.client.Set(ctx, cooldownKey(userID), "1", AICooldownTTL).Err()
}
