package middleware

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strconv"
	"sync"
	"testing"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/redis/go-redis/v9"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

// ---------------------------------------------------------------------------
// Mock Redis client for unit tests
// ---------------------------------------------------------------------------

// mockRedisClient implements RedisClientInterface using an in-memory map,
// providing deterministic behavior without requiring a running Redis instance.
type mockRedisClient struct {
	mu       sync.Mutex
	counters map[string]int64
	expiry   map[string]time.Time
	// forceError makes all operations return an error when true
	forceError bool
}

func newMockRedisClient() *mockRedisClient {
	return &mockRedisClient{
		counters: make(map[string]int64),
		expiry:   make(map[string]time.Time),
	}
}

func (m *mockRedisClient) Incr(_ context.Context, key string) *redis.IntCmd {
	m.mu.Lock()
	defer m.mu.Unlock()

	cmd := redis.NewIntCmd(context.Background())
	if m.forceError {
		cmd.SetErr(redis.ErrClosed)
		return cmd
	}

	// Check if key has expired
	if exp, ok := m.expiry[key]; ok && time.Now().After(exp) {
		delete(m.counters, key)
		delete(m.expiry, key)
	}

	m.counters[key]++
	cmd.SetVal(m.counters[key])
	return cmd
}

func (m *mockRedisClient) Expire(_ context.Context, key string, expiration time.Duration) *redis.BoolCmd {
	m.mu.Lock()
	defer m.mu.Unlock()

	cmd := redis.NewBoolCmd(context.Background())
	if m.forceError {
		cmd.SetErr(redis.ErrClosed)
		return cmd
	}

	m.expiry[key] = time.Now().Add(expiration)
	cmd.SetVal(true)
	return cmd
}

func (m *mockRedisClient) TTL(_ context.Context, key string) *redis.DurationCmd {
	m.mu.Lock()
	defer m.mu.Unlock()

	cmd := redis.NewDurationCmd(context.Background(), time.Second)
	if m.forceError {
		cmd.SetErr(redis.ErrClosed)
		return cmd
	}

	if exp, ok := m.expiry[key]; ok {
		remaining := time.Until(exp)
		if remaining < 0 {
			remaining = 0
		}
		cmd.SetVal(remaining)
	} else {
		// Key has no expiry
		cmd.SetVal(-1 * time.Second)
	}
	return cmd
}

func (m *mockRedisClient) getCount(key string) int64 {
	m.mu.Lock()
	defer m.mu.Unlock()
	return m.counters[key]
}

// ---------------------------------------------------------------------------
// Test helpers
// ---------------------------------------------------------------------------

// testPolicy returns a small rate limit policy for tests.
func testPolicy(max int) RateLimitPolicy {
	return RateLimitPolicy{
		MaxRequests: max,
		Window:      1 * time.Minute,
		Name:        "test",
	}
}

// setupRateLimitRouter creates a test router with the rate limiter middleware.
// preMiddleware is called before the rate limiter to set context values (e.g. userID, role).
func setupRateLimitRouter(
	rc RedisClientInterface,
	policy RateLimitPolicy,
	preMiddleware gin.HandlerFunc,
) *gin.Engine {
	r := gin.New()
	if preMiddleware != nil {
		r.Use(preMiddleware)
	}
	r.Use(RateLimiter(rc, policy))
	r.GET("/test", func(c *gin.Context) {
		c.JSON(http.StatusOK, gin.H{"status": "ok"})
	})
	return r
}

// setUser returns a middleware that simulates JWTAuth by setting userID and role.
func setUser(userID, role string) gin.HandlerFunc {
	return func(c *gin.Context) {
		if userID != "" {
			c.Set(ctxKeyUserID, userID)
		}
		if role != "" {
			c.Set(ctxKeyRole, role)
		}
		c.Next()
	}
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

// TestRateLimiter_AllowsWithinLimit verifies that requests within the rate
// limit are allowed through and return 200.
func TestRateLimiter_AllowsWithinLimit(t *testing.T) {
	mock := newMockRedisClient()
	policy := testPolicy(5)
	router := setupRateLimitRouter(mock, policy, setUser("user-1", "user"))

	for i := 0; i < 5; i++ {
		req := httptest.NewRequest(http.MethodGet, "/test", nil)
		w := httptest.NewRecorder()
		router.ServeHTTP(w, req)

		assert.Equal(t, http.StatusOK, w.Code, "request %d should pass", i+1)
	}
}

// TestRateLimiter_BlocksOverLimit verifies that requests exceeding the rate
// limit receive 429 Too Many Requests with the expected JSON body.
func TestRateLimiter_BlocksOverLimit(t *testing.T) {
	mock := newMockRedisClient()
	policy := testPolicy(3)
	router := setupRateLimitRouter(mock, policy, setUser("user-1", "user"))

	// Exhaust the limit
	for i := 0; i < 3; i++ {
		req := httptest.NewRequest(http.MethodGet, "/test", nil)
		w := httptest.NewRecorder()
		router.ServeHTTP(w, req)
		assert.Equal(t, http.StatusOK, w.Code)
	}

	// 4th request should be blocked
	req := httptest.NewRequest(http.MethodGet, "/test", nil)
	w := httptest.NewRecorder()
	router.ServeHTTP(w, req)

	assert.Equal(t, http.StatusTooManyRequests, w.Code)

	var body map[string]interface{}
	err := json.Unmarshal(w.Body.Bytes(), &body)
	require.NoError(t, err)
	assert.Equal(t, "RATE_LIMITED", body["error"])
	assert.Equal(t, "Too many requests", body["message"])
	assert.NotNil(t, body["retryAfter"])

	// Retry-After header should be present
	assert.NotEmpty(t, w.Header().Get("Retry-After"))
}

// TestRateLimiter_AdminBypass verifies that admin users bypass rate limiting.
func TestRateLimiter_AdminBypass(t *testing.T) {
	mock := newMockRedisClient()
	policy := testPolicy(1) // Very strict limit
	router := setupRateLimitRouter(mock, policy, setUser("admin-1", "admin"))

	// Even with limit=1, admin should not be blocked
	for i := 0; i < 10; i++ {
		req := httptest.NewRequest(http.MethodGet, "/test", nil)
		w := httptest.NewRecorder()
		router.ServeHTTP(w, req)

		assert.Equal(t, http.StatusOK, w.Code, "admin request %d should pass", i+1)
	}

	// Redis counter should not be incremented for admin requests
	assert.Equal(t, int64(0), mock.getCount("ratelimit:user:admin-1:test"))
}

// TestRateLimiter_PerUserIsolation verifies that rate limits are tracked
// independently per user.
func TestRateLimiter_PerUserIsolation(t *testing.T) {
	mock := newMockRedisClient()
	policy := testPolicy(2)

	routerA := setupRateLimitRouter(mock, policy, setUser("user-a", "user"))
	routerB := setupRateLimitRouter(mock, policy, setUser("user-b", "user"))

	// User A: 2 requests (exhausts limit)
	for i := 0; i < 2; i++ {
		req := httptest.NewRequest(http.MethodGet, "/test", nil)
		w := httptest.NewRecorder()
		routerA.ServeHTTP(w, req)
		assert.Equal(t, http.StatusOK, w.Code)
	}

	// User A: 3rd request blocked
	req := httptest.NewRequest(http.MethodGet, "/test", nil)
	w := httptest.NewRecorder()
	routerA.ServeHTTP(w, req)
	assert.Equal(t, http.StatusTooManyRequests, w.Code)

	// User B: should still be allowed
	req = httptest.NewRequest(http.MethodGet, "/test", nil)
	w = httptest.NewRecorder()
	routerB.ServeHTTP(w, req)
	assert.Equal(t, http.StatusOK, w.Code, "user B should not be affected by user A's limit")
}

// TestRateLimiter_AnonymousByIP verifies that anonymous users (no JWT) are
// rate limited by their client IP address.
func TestRateLimiter_AnonymousByIP(t *testing.T) {
	mock := newMockRedisClient()
	policy := testPolicy(2)
	router := setupRateLimitRouter(mock, policy, nil) // no user set

	// Exhaust limit for the anonymous IP
	for i := 0; i < 2; i++ {
		req := httptest.NewRequest(http.MethodGet, "/test", nil)
		w := httptest.NewRecorder()
		router.ServeHTTP(w, req)
		assert.Equal(t, http.StatusOK, w.Code)
	}

	// 3rd request from same IP should be blocked
	req := httptest.NewRequest(http.MethodGet, "/test", nil)
	w := httptest.NewRecorder()
	router.ServeHTTP(w, req)
	assert.Equal(t, http.StatusTooManyRequests, w.Code)
}

// TestRateLimiter_NilRedis verifies fail-open behavior: when Redis is nil,
// all requests pass through without rate limiting.
func TestRateLimiter_NilRedis(t *testing.T) {
	policy := testPolicy(1)
	router := setupRateLimitRouter(nil, policy, setUser("user-1", "user"))

	for i := 0; i < 10; i++ {
		req := httptest.NewRequest(http.MethodGet, "/test", nil)
		w := httptest.NewRecorder()
		router.ServeHTTP(w, req)
		assert.Equal(t, http.StatusOK, w.Code, "should pass when Redis is nil")
	}
}

// TestRateLimiter_RedisError verifies fail-open behavior: when Redis returns
// errors, requests pass through without rate limiting.
func TestRateLimiter_RedisError(t *testing.T) {
	mock := newMockRedisClient()
	mock.forceError = true
	policy := testPolicy(1)
	router := setupRateLimitRouter(mock, policy, setUser("user-1", "user"))

	for i := 0; i < 5; i++ {
		req := httptest.NewRequest(http.MethodGet, "/test", nil)
		w := httptest.NewRecorder()
		router.ServeHTTP(w, req)
		assert.Equal(t, http.StatusOK, w.Code, "should fail-open on Redis error")
	}
}

// TestRateLimiter_ResponseHeaders verifies that rate limit headers are set
// correctly on each response.
func TestRateLimiter_ResponseHeaders(t *testing.T) {
	mock := newMockRedisClient()
	policy := testPolicy(5)
	router := setupRateLimitRouter(mock, policy, setUser("user-1", "user"))

	req := httptest.NewRequest(http.MethodGet, "/test", nil)
	w := httptest.NewRecorder()
	router.ServeHTTP(w, req)

	assert.Equal(t, http.StatusOK, w.Code)
	assert.Equal(t, "5", w.Header().Get("X-RateLimit-Limit"))
	assert.Equal(t, "4", w.Header().Get("X-RateLimit-Remaining"))
	assert.NotEmpty(t, w.Header().Get("X-RateLimit-Reset"))

	// Second request
	req = httptest.NewRequest(http.MethodGet, "/test", nil)
	w = httptest.NewRecorder()
	router.ServeHTTP(w, req)
	assert.Equal(t, "3", w.Header().Get("X-RateLimit-Remaining"))
}

// TestRateLimiter_RemainingNeverNegative verifies that X-RateLimit-Remaining
// does not go below 0 even when the count exceeds the limit.
func TestRateLimiter_RemainingNeverNegative(t *testing.T) {
	mock := newMockRedisClient()
	policy := testPolicy(1)
	router := setupRateLimitRouter(mock, policy, setUser("user-1", "user"))

	// First request: allowed
	req := httptest.NewRequest(http.MethodGet, "/test", nil)
	w := httptest.NewRecorder()
	router.ServeHTTP(w, req)
	assert.Equal(t, "0", w.Header().Get("X-RateLimit-Remaining"))

	// Second request: blocked
	req = httptest.NewRequest(http.MethodGet, "/test", nil)
	w = httptest.NewRecorder()
	router.ServeHTTP(w, req)
	assert.Equal(t, http.StatusTooManyRequests, w.Code)
	assert.Equal(t, "0", w.Header().Get("X-RateLimit-Remaining"))
}

// TestRateLimiter_DifferentPolicies verifies that different policy names
// create separate rate limit counters.
func TestRateLimiter_DifferentPolicies(t *testing.T) {
	mock := newMockRedisClient()
	policyHigh := RateLimitPolicy{MaxRequests: 3, Window: time.Minute, Name: "high"}
	policyLow := RateLimitPolicy{MaxRequests: 1, Window: time.Minute, Name: "low"}

	routerHigh := setupRateLimitRouter(mock, policyHigh, setUser("user-1", "user"))
	routerLow := setupRateLimitRouter(mock, policyLow, setUser("user-1", "user"))

	// Exhaust "low" policy
	req := httptest.NewRequest(http.MethodGet, "/test", nil)
	w := httptest.NewRecorder()
	routerLow.ServeHTTP(w, req)
	assert.Equal(t, http.StatusOK, w.Code)

	req = httptest.NewRequest(http.MethodGet, "/test", nil)
	w = httptest.NewRecorder()
	routerLow.ServeHTTP(w, req)
	assert.Equal(t, http.StatusTooManyRequests, w.Code)

	// "high" policy should still have capacity
	req = httptest.NewRequest(http.MethodGet, "/test", nil)
	w = httptest.NewRecorder()
	routerHigh.ServeHTTP(w, req)
	assert.Equal(t, http.StatusOK, w.Code, "high-frequency policy should be independent")
}

// TestRateLimiter_RetryAfterHeader verifies that the Retry-After header value
// is a positive integer (seconds until window reset).
func TestRateLimiter_RetryAfterHeader(t *testing.T) {
	mock := newMockRedisClient()
	policy := testPolicy(1)
	router := setupRateLimitRouter(mock, policy, setUser("user-1", "user"))

	// Exhaust
	req := httptest.NewRequest(http.MethodGet, "/test", nil)
	w := httptest.NewRecorder()
	router.ServeHTTP(w, req)
	assert.Equal(t, http.StatusOK, w.Code)

	// Exceed
	req = httptest.NewRequest(http.MethodGet, "/test", nil)
	w = httptest.NewRecorder()
	router.ServeHTTP(w, req)
	assert.Equal(t, http.StatusTooManyRequests, w.Code)

	retryAfter := w.Header().Get("Retry-After")
	assert.NotEmpty(t, retryAfter)

	seconds, err := strconv.Atoi(retryAfter)
	require.NoError(t, err)
	assert.Greater(t, seconds, 0, "Retry-After should be a positive integer")
}

// TestRateLimiter_NonAdminRoleNotBypassed verifies that non-admin roles
// (e.g. "user", "moderator") are still rate limited.
func TestRateLimiter_NonAdminRoleNotBypassed(t *testing.T) {
	roles := []string{"user", "moderator", ""}
	for _, role := range roles {
		t.Run("role="+role, func(t *testing.T) {
			mock := newMockRedisClient()
			policy := testPolicy(1)
			router := setupRateLimitRouter(mock, policy, setUser("user-1", role))

			// First: OK
			req := httptest.NewRequest(http.MethodGet, "/test", nil)
			w := httptest.NewRecorder()
			router.ServeHTTP(w, req)
			assert.Equal(t, http.StatusOK, w.Code)

			// Second: blocked
			req = httptest.NewRequest(http.MethodGet, "/test", nil)
			w = httptest.NewRecorder()
			router.ServeHTTP(w, req)
			assert.Equal(t, http.StatusTooManyRequests, w.Code)
		})
	}
}

// TestResolveIdentity_UserID verifies that resolveIdentity uses the userID
// from context when available.
func TestResolveIdentity_UserID(t *testing.T) {
	w := httptest.NewRecorder()
	c, _ := gin.CreateTestContext(w)
	c.Set(ctxKeyUserID, "abc-123")

	identity := resolveIdentity(c)
	assert.Equal(t, "user:abc-123", identity)
}

// TestResolveIdentity_FallbackToIP verifies that resolveIdentity falls back to
// client IP when no userID is present.
func TestResolveIdentity_FallbackToIP(t *testing.T) {
	w := httptest.NewRecorder()
	c, _ := gin.CreateTestContext(w)
	c.Request = httptest.NewRequest(http.MethodGet, "/", nil)
	c.Request.RemoteAddr = "10.0.0.1:12345"

	identity := resolveIdentity(c)
	assert.Equal(t, "ip:10.0.0.1", identity)
}

// TestPredefinedPolicies verifies that predefined policy constants have
// sensible values.
func TestPredefinedPolicies(t *testing.T) {
	policies := []struct {
		name   string
		policy RateLimitPolicy
	}{
		{"HighFrequencyPolicy", HighFrequencyPolicy},
		{"MediumFrequencyPolicy", MediumFrequencyPolicy},
		{"LowFrequencyPolicy", LowFrequencyPolicy},
		{"AdminPolicy", AdminPolicy},
		{"WSConnectionPolicy", WSConnectionPolicy},
	}

	for _, tc := range policies {
		t.Run(tc.name, func(t *testing.T) {
			assert.Greater(t, tc.policy.MaxRequests, 0)
			assert.Greater(t, tc.policy.Window, time.Duration(0))
			assert.NotEmpty(t, tc.policy.Name)
		})
	}
}
