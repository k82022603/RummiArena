package middleware

import (
	"context"
	"fmt"
	"net/http"
	"strconv"
	"strings"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/k82022603/RummiArena/game-server/internal/config"
	"github.com/redis/go-redis/v9"
)

// RateLimitPolicy defines a rate limit configuration for a route group.
type RateLimitPolicy struct {
	// MaxRequests is the maximum number of requests allowed within the window.
	MaxRequests int
	// Window is the duration of the sliding window.
	Window time.Duration
	// Name is a human-readable name for the policy (used in Redis key).
	Name string
}

// Predefined rate limit policies for different endpoint groups.
var (
	// HighFrequencyPolicy is for game state queries (GET /games/:id, rankings, etc.)
	HighFrequencyPolicy = RateLimitPolicy{
		MaxRequests: 60,
		Window:      1 * time.Minute,
		Name:        "high",
	}
	// MediumFrequencyPolicy is for game actions (place, confirm, draw, reset)
	MediumFrequencyPolicy = RateLimitPolicy{
		MaxRequests: 30,
		Window:      1 * time.Minute,
		Name:        "medium",
	}
	// LowFrequencyPolicy is for room creation, join, auth endpoints
	LowFrequencyPolicy = RateLimitPolicy{
		MaxRequests: 10,
		Window:      1 * time.Minute,
		Name:        "low",
	}
	// AdminPolicy is for admin dashboard endpoints
	AdminPolicy = RateLimitPolicy{
		MaxRequests: 30,
		Window:      1 * time.Minute,
		Name:        "admin",
	}
	// WSConnectionPolicy limits WebSocket connection attempts per user
	WSConnectionPolicy = RateLimitPolicy{
		MaxRequests: 5,
		Window:      1 * time.Minute,
		Name:        "ws",
	}
)

// InitRateLimitPolicies overwrites the predefined rate limit policies with
// values from the application config. This should be called once during server
// startup, before the router is built. If cfg has zero values for any field,
// the corresponding policy retains its compile-time default.
func InitRateLimitPolicies(cfg config.RateLimitConfig) {
	window := 1 * time.Minute
	if cfg.WindowSeconds > 0 {
		window = time.Duration(cfg.WindowSeconds) * time.Second
	}

	if cfg.HighMax > 0 {
		HighFrequencyPolicy.MaxRequests = cfg.HighMax
	}
	HighFrequencyPolicy.Window = window

	if cfg.MediumMax > 0 {
		MediumFrequencyPolicy.MaxRequests = cfg.MediumMax
	}
	MediumFrequencyPolicy.Window = window

	if cfg.LowMax > 0 {
		LowFrequencyPolicy.MaxRequests = cfg.LowMax
	}
	LowFrequencyPolicy.Window = window

	if cfg.AdminMax > 0 {
		AdminPolicy.MaxRequests = cfg.AdminMax
	}
	AdminPolicy.Window = window

	if cfg.WSMax > 0 {
		WSConnectionPolicy.MaxRequests = cfg.WSMax
	}
	WSConnectionPolicy.Window = window
}

// RedisClientInterface abstracts the Redis commands needed by the rate limiter.
// This allows easy mocking in tests.
type RedisClientInterface interface {
	Incr(ctx context.Context, key string) *redis.IntCmd
	Expire(ctx context.Context, key string, expiration time.Duration) *redis.BoolCmd
	TTL(ctx context.Context, key string) *redis.DurationCmd
}

// RateLimiter returns a gin middleware that enforces rate limiting using Redis
// with a fixed window counter algorithm.
//
// How it works:
//  1. Build a Redis key from the user identity (userID from JWT, or client IP
//     for anonymous users) and the policy name.
//  2. INCR the key count atomically.
//  3. If the key is new (count == 1), set an EXPIRE equal to the window duration.
//  4. If count exceeds MaxRequests, return 429 Too Many Requests.
//
// Admin users (role == "admin") bypass rate limiting entirely.
// If Redis is nil or unavailable, the middleware passes through (fail-open)
// to avoid blocking requests when Redis is down.
func RateLimiter(redisClient RedisClientInterface, policy RateLimitPolicy) gin.HandlerFunc {
	return func(c *gin.Context) {
		// Fail-open: if Redis is not available, skip rate limiting
		if redisClient == nil {
			c.Next()
			return
		}

		// Admin bypass: admin users are not rate limited
		if role, exists := c.Get(ctxKeyRole); exists {
			if r, ok := role.(string); ok && r == "admin" {
				c.Next()
				return
			}
		}

		identity := resolveIdentity(c)
		key := fmt.Sprintf("ratelimit:%s:%s", identity, policy.Name)

		ctx, cancel := context.WithTimeout(c.Request.Context(), 2*time.Second)
		defer cancel()

		// Atomic increment
		count, err := redisClient.Incr(ctx, key).Result()
		if err != nil {
			// Fail-open on Redis errors: allow the request through
			c.Next()
			return
		}

		// Set TTL on first increment (new window)
		if count == 1 {
			if err := redisClient.Expire(ctx, key, policy.Window).Err(); err != nil {
				// Non-fatal: key will eventually be evicted, continue
				c.Next()
				return
			}
		}

		// Set rate limit headers for observability
		remaining := policy.MaxRequests - int(count)
		if remaining < 0 {
			remaining = 0
		}
		c.Header("X-RateLimit-Limit", strconv.Itoa(policy.MaxRequests))
		c.Header("X-RateLimit-Remaining", strconv.Itoa(remaining))

		// Determine window reset time from TTL
		ttlDuration, err := redisClient.TTL(ctx, key).Result()
		if err == nil && ttlDuration > 0 {
			resetAt := time.Now().Add(ttlDuration).Unix()
			c.Header("X-RateLimit-Reset", strconv.FormatInt(resetAt, 10))
		}

		// Check if limit exceeded
		if int(count) > policy.MaxRequests {
			retryAfter := int(policy.Window.Seconds())
			if ttlDuration > 0 {
				retryAfter = int(ttlDuration.Seconds())
			}
			if retryAfter < 1 {
				retryAfter = 1
			}

			c.Header("Retry-After", strconv.Itoa(retryAfter))
			c.AbortWithStatusJSON(http.StatusTooManyRequests, gin.H{
				"error":      "RATE_LIMITED",
				"message":    "Too many requests",
				"retryAfter": retryAfter,
			})
			return
		}

		c.Next()
	}
}

// resolveIdentity determines the rate limit key identity.
// If a userID is available from JWT auth, use it; otherwise fall back to client IP.
func resolveIdentity(c *gin.Context) string {
	if userID, ok := UserIDFromContext(c); ok && userID != "" {
		return "user:" + userID
	}
	// Anonymous: rate limit by IP
	ip := c.ClientIP()
	// Normalize IPv6 loopback
	if ip == "::1" {
		ip = "127.0.0.1"
	}
	// Remove port from IP if present (e.g. from X-Forwarded-For)
	if idx := strings.LastIndex(ip, ":"); idx > 0 {
		// Only strip if not IPv6
		if !strings.Contains(ip, "::") {
			ip = ip[:idx]
		}
	}
	return "ip:" + ip
}
