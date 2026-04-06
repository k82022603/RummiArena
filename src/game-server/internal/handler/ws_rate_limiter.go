package handler

import (
	"sync"
	"time"
)

// wsRateLimitPolicy 메시지 타입별 rate limit 정책
type wsRateLimitPolicy struct {
	MaxRequests int           // 윈도우당 최대 허용 수
	Window      time.Duration // 윈도우 크기
}

// 기본 정책 테이블 (SEC-RL-003)
var defaultWSRateLimits = map[string]wsRateLimitPolicy{
	C2SPlaceTiles:  {MaxRequests: 20, Window: time.Minute},
	C2SConfirmTurn: {MaxRequests: 10, Window: time.Minute},
	C2SDrawTile:    {MaxRequests: 10, Window: time.Minute},
	C2SResetTurn:   {MaxRequests: 10, Window: time.Minute},
	C2SChat:        {MaxRequests: 12, Window: time.Minute},
	C2SPing:        {MaxRequests: 6, Window: time.Minute},
	C2SLeaveGame:   {MaxRequests: 3, Window: time.Minute},
}

// 글로벌 상한 (모든 타입 합산)
var globalWSRateLimit = wsRateLimitPolicy{
	MaxRequests: 60,
	Window:      time.Minute,
}

// wsRateLimiter 커넥션 단위 메시지 빈도 제한기.
// In-memory Fixed Window Counter 알고리즘을 사용한다.
// Redis 불필요 -- gorilla/websocket 연결은 단일 Pod에 고정되므로 Pod 간 공유 불필요.
type wsRateLimiter struct {
	mu          sync.Mutex
	globalCount int            // 글로벌 카운터 (모든 타입 합산)
	typeCount   map[string]int // 메시지 타입별 카운터
	windowStart time.Time      // 현재 윈도우 시작 시각
	violations  int            // 연속 위반 횟수
	policies    map[string]wsRateLimitPolicy
	nowFunc     func() time.Time // 테스트용 시간 오버라이드
}

// checkResult rate limit 검사 결과
type checkResult struct {
	Allowed      bool   // 허용 여부
	Reason       string // 거부 사유 ("global" | "type:{msgType}" | "")
	RetryAfterMs int    // 남은 윈도우 시간 (밀리초)
	ShouldClose  bool   // 연결 종료 필요 여부 (violations >= 3)
}

// newWSRateLimiter 새 rate limiter를 생성한다.
func newWSRateLimiter() *wsRateLimiter {
	return &wsRateLimiter{
		globalCount: 0,
		typeCount:   make(map[string]int),
		windowStart: time.Now(),
		violations:  0,
		policies:    defaultWSRateLimits,
	}
}

// now 현재 시각을 반환한다. nowFunc가 설정되어 있으면 그것을 사용한다.
func (rl *wsRateLimiter) now() time.Time {
	if rl.nowFunc != nil {
		return rl.nowFunc()
	}
	return time.Now()
}

// check 메시지 빈도를 검사한다.
// 윈도우 만료 시 카운터를 자동 초기화한다.
func (rl *wsRateLimiter) check(msgType string) checkResult {
	rl.mu.Lock()
	defer rl.mu.Unlock()

	now := rl.now()

	// 윈도우 만료 시 전체 카운터 초기화
	if now.Sub(rl.windowStart) >= globalWSRateLimit.Window {
		rl.globalCount = 0
		rl.typeCount = make(map[string]int)
		rl.windowStart = now
	}

	retryAfterMs := int(globalWSRateLimit.Window.Milliseconds() -
		now.Sub(rl.windowStart).Milliseconds())
	if retryAfterMs < 0 {
		retryAfterMs = 0
	}

	// 1. 글로벌 상한 검사
	rl.globalCount++
	if rl.globalCount > globalWSRateLimit.MaxRequests {
		rl.violations++
		return checkResult{
			Allowed:      false,
			Reason:       "global",
			RetryAfterMs: retryAfterMs,
			ShouldClose:  rl.violations >= 3,
		}
	}

	// 2. 타입별 상한 검사
	if policy, exists := rl.policies[msgType]; exists {
		rl.typeCount[msgType]++
		if rl.typeCount[msgType] > policy.MaxRequests {
			rl.violations++
			return checkResult{
				Allowed:      false,
				Reason:       "type:" + msgType,
				RetryAfterMs: retryAfterMs,
				ShouldClose:  rl.violations >= 3,
			}
		}
	}

	// 허용: violations 카운터 감소 (0 이하로 내려가지 않음)
	if rl.violations > 0 {
		rl.violations--
	}

	return checkResult{
		Allowed:      true,
		RetryAfterMs: retryAfterMs,
	}
}

// reset 카운터를 초기화한다 (테스트용).
func (rl *wsRateLimiter) reset() {
	rl.mu.Lock()
	defer rl.mu.Unlock()
	rl.globalCount = 0
	rl.typeCount = make(map[string]int)
	rl.windowStart = rl.now()
	rl.violations = 0
}
