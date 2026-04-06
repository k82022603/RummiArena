package handler

import (
	"sync"
	"testing"
	"time"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

// TestWSRateLimiter_AllowsNormal 정상 빈도 메시지는 모두 허용된다.
func TestWSRateLimiter_AllowsNormal(t *testing.T) {
	rl := newWSRateLimiter()

	// 각 타입별 정상 빈도 내 메시지 전송
	types := []struct {
		msgType string
		count   int
	}{
		{C2SPlaceTiles, 10},
		{C2SConfirmTurn, 5},
		{C2SDrawTile, 5},
		{C2SResetTurn, 5},
		{C2SChat, 10},
		{C2SPing, 3},
		{C2SLeaveGame, 2},
	}

	for _, tt := range types {
		for i := 0; i < tt.count; i++ {
			result := rl.check(tt.msgType)
			assert.True(t, result.Allowed, "%s message %d should be allowed", tt.msgType, i+1)
			assert.Empty(t, result.Reason)
			assert.False(t, result.ShouldClose)
		}
	}
}

// TestWSRateLimiter_GlobalLimit 글로벌 60 req/min 초과 시 거부된다.
func TestWSRateLimiter_GlobalLimit(t *testing.T) {
	rl := newWSRateLimiter()

	// PLACE_TILES는 타입별 한도가 20이므로 다양한 타입을 섞어 글로벌 60에 도달
	// 60회 허용 (타입별 한도에 걸리지 않도록 혼합)
	for i := 0; i < 20; i++ {
		result := rl.check(C2SPlaceTiles)
		assert.True(t, result.Allowed, "PLACE_TILES %d should be allowed", i+1)
	}
	for i := 0; i < 10; i++ {
		result := rl.check(C2SConfirmTurn)
		assert.True(t, result.Allowed, "CONFIRM_TURN %d should be allowed", i+1)
	}
	for i := 0; i < 10; i++ {
		result := rl.check(C2SDrawTile)
		assert.True(t, result.Allowed, "DRAW_TILE %d should be allowed", i+1)
	}
	for i := 0; i < 10; i++ {
		result := rl.check(C2SResetTurn)
		assert.True(t, result.Allowed, "RESET_TURN %d should be allowed", i+1)
	}
	for i := 0; i < 10; i++ {
		result := rl.check(C2SChat)
		assert.True(t, result.Allowed, "CHAT %d should be allowed", i+1)
	}

	// 61번째 글로벌 초과
	result := rl.check(C2SPing)
	assert.False(t, result.Allowed)
	assert.Equal(t, "global", result.Reason)
	assert.Greater(t, result.RetryAfterMs, 0)
}

// TestWSRateLimiter_TypeLimit_PlaceTiles PLACE_TILES 20 req/min 초과 시 거부된다.
func TestWSRateLimiter_TypeLimit_PlaceTiles(t *testing.T) {
	rl := newWSRateLimiter()

	for i := 0; i < 20; i++ {
		result := rl.check(C2SPlaceTiles)
		assert.True(t, result.Allowed, "PLACE_TILES %d should be allowed", i+1)
	}

	// 21번째 타입별 초과
	result := rl.check(C2SPlaceTiles)
	assert.False(t, result.Allowed)
	assert.Equal(t, "type:"+C2SPlaceTiles, result.Reason)
}

// TestWSRateLimiter_TypeLimit_Chat CHAT 12 req/min 초과 시 거부된다.
func TestWSRateLimiter_TypeLimit_Chat(t *testing.T) {
	rl := newWSRateLimiter()

	for i := 0; i < 12; i++ {
		result := rl.check(C2SChat)
		assert.True(t, result.Allowed, "CHAT %d should be allowed", i+1)
	}

	// 13번째 타입별 초과
	result := rl.check(C2SChat)
	assert.False(t, result.Allowed)
	assert.Equal(t, "type:"+C2SChat, result.Reason)
}

// TestWSRateLimiter_TypeLimit_Ping PING 6 req/min 초과 시 거부된다.
func TestWSRateLimiter_TypeLimit_Ping(t *testing.T) {
	rl := newWSRateLimiter()

	for i := 0; i < 6; i++ {
		result := rl.check(C2SPing)
		assert.True(t, result.Allowed, "PING %d should be allowed", i+1)
	}

	// 7번째 타입별 초과
	result := rl.check(C2SPing)
	assert.False(t, result.Allowed)
	assert.Equal(t, "type:"+C2SPing, result.Reason)
}

// TestWSRateLimiter_TypeLimit_ConfirmTurn CONFIRM_TURN 10 req/min 초과 시 거부된다.
func TestWSRateLimiter_TypeLimit_ConfirmTurn(t *testing.T) {
	rl := newWSRateLimiter()

	for i := 0; i < 10; i++ {
		result := rl.check(C2SConfirmTurn)
		assert.True(t, result.Allowed, "CONFIRM_TURN %d should be allowed", i+1)
	}

	result := rl.check(C2SConfirmTurn)
	assert.False(t, result.Allowed)
	assert.Equal(t, "type:"+C2SConfirmTurn, result.Reason)
}

// TestWSRateLimiter_TypeLimit_DrawTile DRAW_TILE 10 req/min 초과 시 거부된다.
func TestWSRateLimiter_TypeLimit_DrawTile(t *testing.T) {
	rl := newWSRateLimiter()

	for i := 0; i < 10; i++ {
		result := rl.check(C2SDrawTile)
		assert.True(t, result.Allowed, "DRAW_TILE %d should be allowed", i+1)
	}

	result := rl.check(C2SDrawTile)
	assert.False(t, result.Allowed)
	assert.Equal(t, "type:"+C2SDrawTile, result.Reason)
}

// TestWSRateLimiter_TypeLimit_ResetTurn RESET_TURN 10 req/min 초과 시 거부된다.
func TestWSRateLimiter_TypeLimit_ResetTurn(t *testing.T) {
	rl := newWSRateLimiter()

	for i := 0; i < 10; i++ {
		result := rl.check(C2SResetTurn)
		assert.True(t, result.Allowed, "RESET_TURN %d should be allowed", i+1)
	}

	result := rl.check(C2SResetTurn)
	assert.False(t, result.Allowed)
	assert.Equal(t, "type:"+C2SResetTurn, result.Reason)
}

// TestWSRateLimiter_TypeLimit_LeaveGame LEAVE_GAME 3 req/min 초과 시 거부된다.
func TestWSRateLimiter_TypeLimit_LeaveGame(t *testing.T) {
	rl := newWSRateLimiter()

	for i := 0; i < 3; i++ {
		result := rl.check(C2SLeaveGame)
		assert.True(t, result.Allowed, "LEAVE_GAME %d should be allowed", i+1)
	}

	result := rl.check(C2SLeaveGame)
	assert.False(t, result.Allowed)
	assert.Equal(t, "type:"+C2SLeaveGame, result.Reason)
}

// TestWSRateLimiter_WindowReset 윈도우 만료 후 카운터가 초기화되어 다시 허용된다.
func TestWSRateLimiter_WindowReset(t *testing.T) {
	rl := newWSRateLimiter()

	mockTime := time.Now()
	rl.nowFunc = func() time.Time { return mockTime }
	rl.windowStart = mockTime

	// 글로벌 한도 소진
	for i := 0; i < 60; i++ {
		result := rl.check(C2SPlaceTiles)
		if i < 20 {
			assert.True(t, result.Allowed, "message %d should be allowed", i+1)
		}
		// 20 이후는 PLACE_TILES 타입 한도 초과이지만 글로벌은 아직 남아있을 수 있음
	}

	// 글로벌 한도 확인
	result := rl.check(C2SChat)
	assert.False(t, result.Allowed, "should be denied after exhausting global limit")

	// 윈도우를 1분 이후로 이동
	mockTime = mockTime.Add(61 * time.Second)

	// 새 윈도우에서 다시 허용
	result = rl.check(C2SChat)
	assert.True(t, result.Allowed, "should be allowed in new window")
}

// TestWSRateLimiter_ViolationEscalation 3회 연속 위반 시 ShouldClose=true.
func TestWSRateLimiter_ViolationEscalation(t *testing.T) {
	rl := newWSRateLimiter()

	// PING 한도(6)를 이용하여 깔끔하게 위반을 유발한다.
	// 6회 허용 후 7, 8, 9번째에서 위반 1, 2, 3회.
	for i := 0; i < 6; i++ {
		r := rl.check(C2SPing)
		assert.True(t, r.Allowed, "PING %d should be allowed", i+1)
	}

	// 위반 1회 (violations = 1)
	r1 := rl.check(C2SPing)
	assert.False(t, r1.Allowed)
	assert.False(t, r1.ShouldClose, "1회 위반에서는 연결 종료 불필요")

	// 위반 2회 (violations = 2)
	r2 := rl.check(C2SPing)
	assert.False(t, r2.Allowed)
	assert.False(t, r2.ShouldClose, "2회 위반에서는 연결 종료 불필요")

	// 위반 3회 (violations = 3) -> 연결 종료
	r3 := rl.check(C2SPing)
	assert.False(t, r3.Allowed)
	assert.True(t, r3.ShouldClose, "3회 위반 시 연결 종료 필요")
}

// TestWSRateLimiter_ViolationDecay 위반 후 정상 메시지가 오면 violations가 감소한다.
func TestWSRateLimiter_ViolationDecay(t *testing.T) {
	rl := newWSRateLimiter()

	// PING 한도 소진 (6회)
	for i := 0; i < 6; i++ {
		rl.check(C2SPing)
	}

	// 위반 1회 (PING 타입 초과)
	r := rl.check(C2SPing)
	assert.False(t, r.Allowed)
	assert.Equal(t, 1, rl.violations)

	// 위반 2회
	r = rl.check(C2SPing)
	assert.False(t, r.Allowed)
	assert.Equal(t, 2, rl.violations)

	// 정상 메시지 전송 (CHAT은 아직 한도 내) -> violations 감소
	r = rl.check(C2SChat)
	assert.True(t, r.Allowed)
	assert.Equal(t, 1, rl.violations)

	// 한 번 더 정상 메시지
	r = rl.check(C2SChat)
	assert.True(t, r.Allowed)
	assert.Equal(t, 0, rl.violations)

	// 0 이하로는 내려가지 않음
	r = rl.check(C2SChat)
	assert.True(t, r.Allowed)
	assert.Equal(t, 0, rl.violations)
}

// TestWSRateLimiter_UnknownType 미등록 메시지 타입은 즉시 거부된다 (SEC-REV-001).
func TestWSRateLimiter_UnknownType(t *testing.T) {
	rl := newWSRateLimiter()

	// 미등록 타입은 첫 번째 요청부터 즉시 거부
	result := rl.check("UNKNOWN_TYPE")
	assert.False(t, result.Allowed, "unknown type should be rejected immediately")
	assert.Equal(t, "unknown_type", result.Reason)

	// 글로벌 카운터에 영향 없음 (롤백됨)
	assert.Equal(t, 0, rl.globalCount)

	// 3회 미등록 타입 전송 시 연결 종료
	rl.check("UNKNOWN_TYPE") // violations=2
	result = rl.check("UNKNOWN_TYPE") // violations=3
	assert.True(t, result.ShouldClose, "3 unknown type violations should trigger close")
}

// TestWSRateLimiter_ConcurrentAccess goroutine 10개에서 동시에 check해도 race condition이 없다.
func TestWSRateLimiter_ConcurrentAccess(t *testing.T) {
	rl := newWSRateLimiter()

	var wg sync.WaitGroup
	results := make([]checkResult, 100)

	for i := 0; i < 10; i++ {
		wg.Add(1)
		go func(start int) {
			defer wg.Done()
			for j := 0; j < 10; j++ {
				results[start+j] = rl.check(C2SChat)
			}
		}(i * 10)
	}

	wg.Wait()

	// 100건 중 최소 일부는 허용, 일부는 거부되어야 한다
	allowed := 0
	denied := 0
	for _, r := range results {
		if r.Allowed {
			allowed++
		} else {
			denied++
		}
	}

	// CHAT 한도 12, 글로벌 한도 60이므로 12건 이하만 허용 (동시 실행에서는 약간의 초과 가능)
	assert.Greater(t, allowed, 0, "일부는 허용되어야 한다")
	assert.Greater(t, denied, 0, "일부는 거부되어야 한다")
}

// TestWSRateLimiter_Reset reset 호출 시 모든 카운터가 초기화된다.
func TestWSRateLimiter_Reset(t *testing.T) {
	rl := newWSRateLimiter()

	// 한도 소진
	for i := 0; i < 60; i++ {
		rl.check(C2SPlaceTiles)
	}

	result := rl.check(C2SChat)
	assert.False(t, result.Allowed, "글로벌 한도 초과로 거부되어야 한다")

	// 리셋
	rl.reset()

	// 리셋 후 다시 허용
	result = rl.check(C2SChat)
	assert.True(t, result.Allowed, "리셋 후 다시 허용되어야 한다")
}

// TestWSRateLimiter_RetryAfterMs RetryAfterMs가 양수이고 합리적인 값을 반환한다.
func TestWSRateLimiter_RetryAfterMs(t *testing.T) {
	rl := newWSRateLimiter()

	result := rl.check(C2SChat)
	require.True(t, result.Allowed)
	// 윈도우 시작 직후이므로 RetryAfterMs는 약 60000에 가까워야 한다
	assert.Greater(t, result.RetryAfterMs, 50000, "RetryAfterMs should be close to 60000ms")
	assert.LessOrEqual(t, result.RetryAfterMs, 60000, "RetryAfterMs should not exceed 60000ms")
}

// TestWSRateLimiter_TypeLimitBeforeGlobalLimit 타입별 한도가 글로벌보다 먼저 걸린다.
func TestWSRateLimiter_TypeLimitBeforeGlobalLimit(t *testing.T) {
	rl := newWSRateLimiter()

	// LEAVE_GAME은 3 req/min으로 가장 낮은 한도
	for i := 0; i < 3; i++ {
		result := rl.check(C2SLeaveGame)
		assert.True(t, result.Allowed)
	}

	// 4번째: 타입별 초과 (글로벌은 아직 3/60)
	result := rl.check(C2SLeaveGame)
	assert.False(t, result.Allowed)
	assert.Equal(t, "type:"+C2SLeaveGame, result.Reason, "글로벌이 아닌 타입별 한도에 걸려야 한다")
}

// TestWSRateLimiter_GlobalLimitCountsAllTypes 서로 다른 타입의 합산이 글로벌 한도에 걸린다.
func TestWSRateLimiter_GlobalLimitCountsAllTypes(t *testing.T) {
	rl := newWSRateLimiter()

	// 각 타입별 한도 이내로 합산 60 채우기
	for i := 0; i < 20; i++ {
		rl.check(C2SPlaceTiles) // 20
	}
	for i := 0; i < 10; i++ {
		rl.check(C2SConfirmTurn) // 10
	}
	for i := 0; i < 10; i++ {
		rl.check(C2SDrawTile) // 10
	}
	for i := 0; i < 10; i++ {
		rl.check(C2SResetTurn) // 10
	}
	for i := 0; i < 10; i++ {
		rl.check(C2SChat) // 10 (한도 12 이내)
	}
	// 합산: 60

	// 어떤 타입이든 다음 메시지는 글로벌 초과
	result := rl.check(C2SChat)
	assert.False(t, result.Allowed)
	assert.Equal(t, "global", result.Reason)
}

// TestWSRateLimiter_ViolationDoesNotResetOnWindowChange 윈도우 교체로 카운터는 리셋되지만 violations는 유지된다.
func TestWSRateLimiter_ViolationPersistsAcrossWindows(t *testing.T) {
	rl := newWSRateLimiter()
	mockTime := time.Now()
	rl.nowFunc = func() time.Time { return mockTime }
	rl.windowStart = mockTime

	// PING 한도 소진 및 위반 2회 유발
	for i := 0; i < 6; i++ {
		rl.check(C2SPing)
	}
	rl.check(C2SPing) // violation 1
	rl.check(C2SPing) // violation 2

	// 윈도우 넘기기
	mockTime = mockTime.Add(61 * time.Second)

	// 새 윈도우에서 카운터는 리셋되지만 violations는 유지됨
	// 정상 메시지 -> violations 1로 감소
	result := rl.check(C2SChat)
	assert.True(t, result.Allowed, "새 윈도우에서는 카운터가 리셋되어 허용")

	// violations는 2에서 1로 감소했어야 함
	rl.mu.Lock()
	assert.Equal(t, 1, rl.violations, "정상 메시지 1회로 violations 2->1")
	rl.mu.Unlock()
}
