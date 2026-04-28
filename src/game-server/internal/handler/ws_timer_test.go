package handler

import (
	"context"
	"sync"
	"testing"
	"time"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
	"go.uber.org/zap"

	"github.com/k82022603/RummiArena/game-server/internal/model"
	"github.com/k82022603/RummiArena/game-server/internal/repository"
	"github.com/k82022603/RummiArena/game-server/internal/service"
)

// ============================================================
// 헬퍼
// ============================================================

// newTimerTestEnv 실제 서비스 스택을 사용하는 타이머 테스트 환경을 생성한다.
func newTimerTestEnv() (*WSHandler, repository.MemoryGameStateRepository) {
	gameRepo := repository.NewMemoryGameStateRepo()
	gameSvc := service.NewGameService(gameRepo)
	turnSvc := service.NewTurnService(gameRepo, gameSvc)
	h := &WSHandler{
		hub:           NewHub(zap.NewNop()),
		gameSvc:       gameSvc,
		turnSvc:       turnSvc,
		logger:        zap.NewNop(),
		timers:        make(map[string]*turnTimer),
		aiTurnCancels: make(map[string]context.CancelFunc),
	}
	return h, gameRepo
}

// seedGameState 지정된 게임 상태를 레포지터리에 저장한다.
func seedGameState(t *testing.T, repo repository.MemoryGameStateRepository, state *model.GameStateRedis) {
	t.Helper()
	require.NoError(t, repo.SaveGameState(state))
}

// twoPlayerState 타이머 테스트용 2인 게임 상태를 반환한다.
func twoPlayerState(gameID string) *model.GameStateRedis {
	return &model.GameStateRedis{
		GameID:      gameID,
		Status:      model.GameStatusPlaying,
		CurrentSeat: 0,
		DrawPile:    []string{"R1a", "R2a", "R3a"},
		TurnTimeoutSec: 0, // 테스트에서 재귀 타이머 방지
		Players: []model.PlayerState{
			{SeatOrder: 0, UserID: "u0", PlayerType: "HUMAN", Rack: []string{"B1a"}},
			{SeatOrder: 1, UserID: "u1", PlayerType: "HUMAN", Rack: []string{"K1a"}},
		},
	}
}

// ============================================================
// startTurnTimer 테스트
// ============================================================

// TestStartTurnTimer_ZeroTimeout timeoutSec이 0이면 타이머가 시작되지 않는다.
func TestStartTurnTimer_ZeroTimeout(t *testing.T) {
	h, _ := newTimerTestEnv()

	h.startTurnTimer("room-1", "game-1", 0, 0)

	time.Sleep(20 * time.Millisecond)

	h.timersMu.Lock()
	_, exists := h.timers["game-1"]
	h.timersMu.Unlock()
	assert.False(t, exists, "timeoutSec=0이면 timers 맵에 항목이 없어야 한다")
}

// TestStartTurnTimer_NegativeTimeout timeoutSec이 음수이면 타이머가 시작되지 않는다.
func TestStartTurnTimer_NegativeTimeout(t *testing.T) {
	h, _ := newTimerTestEnv()

	h.startTurnTimer("room-1", "game-1", 0, -1)

	time.Sleep(20 * time.Millisecond)

	h.timersMu.Lock()
	_, exists := h.timers["game-1"]
	h.timersMu.Unlock()
	assert.False(t, exists, "timeoutSec<0이면 timers 맵에 항목이 없어야 한다")
}

// TestStartTurnTimer_Expiry 타이머가 만료되면 HandleTimeout이 실행되어 게임 상태가 변한다.
// 턴이 seat 0 → seat 1로 전환되고 드로우 파일이 1장 줄어야 한다.
func TestStartTurnTimer_Expiry(t *testing.T) {
	h, repo := newTimerTestEnv()
	gameID := "game-expiry"

	state := twoPlayerState(gameID)
	seedGameState(t, repo, state)

	const timeoutSec = 1
	h.startTurnTimer("room-exp", gameID, 0, timeoutSec)

	h.timersMu.Lock()
	_, exists := h.timers[gameID]
	h.timersMu.Unlock()
	require.True(t, exists, "startTurnTimer 호출 후 timers 맵에 항목이 있어야 한다")

	// 만료 대기
	time.Sleep(time.Duration(timeoutSec)*time.Second + 500*time.Millisecond)

	// HandleTimeout이 실행됐다면: seat 0이 강제 드로우 → CurrentSeat = 1, DrawPile 1장 감소
	updated, err := repo.GetGameState(gameID)
	require.NoError(t, err)
	assert.Equal(t, 1, updated.CurrentSeat, "타이머 만료 후 턴이 seat 1로 넘어가야 한다")
	assert.Len(t, updated.DrawPile, 2, "강제 드로우 후 드로우 파일이 1장 줄어야 한다")
}

// TestStartTurnTimer_CancelPrevious 새 타이머 시작 시 이전 타이머가 취소되어 발동하지 않는다.
func TestStartTurnTimer_CancelPrevious(t *testing.T) {
	h, repo := newTimerTestEnv()
	gameID := "game-cancel-prev"

	state := twoPlayerState(gameID)
	seedGameState(t, repo, state)

	// 5초짜리 타이머 시작
	h.startTurnTimer("room-1", gameID, 0, 5)

	// 즉시 새 타이머(5초)로 교체 → 이전 타이머 취소
	h.startTurnTimer("room-1", gameID, 1, 5)

	time.Sleep(100 * time.Millisecond)

	// 이전·새 타이머 모두 아직 만료 전 → 게임 상태 변화 없어야 한다
	unchanged, err := repo.GetGameState(gameID)
	require.NoError(t, err)
	assert.Equal(t, 0, unchanged.CurrentSeat, "5초 타이머가 아직 만료되지 않았으므로 seat는 변하지 않아야 한다")

	// 최신 타이머만 맵에 있어야 한다
	h.timersMu.Lock()
	timer, exists := h.timers[gameID]
	h.timersMu.Unlock()
	require.True(t, exists)
	assert.Equal(t, 1, timer.seat, "timers 맵에는 최신 seat 번호가 저장되어야 한다")
}

// ============================================================
// cancelTurnTimer 테스트
// ============================================================

// TestCancelTurnTimer_CancelsActiveTimer 진행 중인 타이머를 취소하면 HandleTimeout이 호출되지 않는다.
func TestCancelTurnTimer_CancelsActiveTimer(t *testing.T) {
	h, repo := newTimerTestEnv()
	gameID := "game-cancel2"

	state := twoPlayerState(gameID)
	seedGameState(t, repo, state)

	// 1초 타이머 시작
	h.startTurnTimer("room-1", gameID, 0, 1)

	h.timersMu.Lock()
	_, before := h.timers[gameID]
	h.timersMu.Unlock()
	require.True(t, before, "취소 전에 타이머가 등록되어 있어야 한다")

	// 즉시 취소
	h.cancelTurnTimer(gameID)

	h.timersMu.Lock()
	_, after := h.timers[gameID]
	h.timersMu.Unlock()
	assert.False(t, after, "취소 후 타이머가 맵에서 제거되어야 한다")

	// 원래 1초가 지나도 게임 상태 변화 없어야 한다
	time.Sleep(1200 * time.Millisecond)
	unchanged, err := repo.GetGameState(gameID)
	require.NoError(t, err)
	assert.Equal(t, 0, unchanged.CurrentSeat, "취소된 타이머는 HandleTimeout을 호출하지 않아야 한다")
}

// TestCancelTurnTimer_NoopOnMissing 존재하지 않는 게임 ID로 취소해도 패닉이 발생하지 않는다.
func TestCancelTurnTimer_NoopOnMissing(t *testing.T) {
	h, _ := newTimerTestEnv()

	assert.NotPanics(t, func() {
		h.cancelTurnTimer("non-existent-game")
	})
}

// ============================================================
// 동시성 테스트
// ============================================================

// TestTimersMu_ConcurrentAccess 동시 접근에서 data race가 발생하지 않는다.
// go test -race 플래그와 함께 실행해야 효과적이다.
func TestTimersMu_ConcurrentAccess(t *testing.T) {
	h, _ := newTimerTestEnv()

	var wg sync.WaitGroup
	for i := range 10 {
		wg.Add(1)
		go func(idx int) {
			defer wg.Done()
			h.startTurnTimer("room-1", "game-concurrent", idx%2, 60)
		}(i)
	}

	wg.Add(1)
	go func() {
		defer wg.Done()
		time.Sleep(10 * time.Millisecond)
		h.cancelTurnTimer("game-concurrent")
	}()

	wg.Wait()
}

// ============================================================
// I5: generation counter 경쟁 조건 방지 테스트
// ============================================================

// TestStartTurnTimer_GenerationIncrement startTurnTimer를 연속 호출하면
// generation이 단조 증가하는지 확인한다.
func TestStartTurnTimer_GenerationIncrement(t *testing.T) {
	h, _ := newTimerTestEnv()
	gameID := "game-gen-inc"

	h.startTurnTimer("room-1", gameID, 0, 60)
	h.timersMu.RLock()
	gen1 := h.timers[gameID].generation
	h.timersMu.RUnlock()

	h.startTurnTimer("room-1", gameID, 0, 60)
	h.timersMu.RLock()
	gen2 := h.timers[gameID].generation
	h.timersMu.RUnlock()

	h.startTurnTimer("room-1", gameID, 0, 60)
	h.timersMu.RLock()
	gen3 := h.timers[gameID].generation
	h.timersMu.RUnlock()

	assert.Greater(t, gen2, gen1, "두 번째 호출 시 generation이 증가해야 한다")
	assert.Greater(t, gen3, gen2, "세 번째 호출 시 generation이 추가 증가해야 한다")

	// 정리
	h.cancelTurnTimer(gameID)
}

// TestStartTurnTimer_StaleTimerDoesNotFire I5: generation counter 검증.
// 짧은(1초) 타이머를 시작한 직후 새 타이머(60초)로 교체하면,
// 이전 goroutine은 stale 판정으로 HandleTimeout을 호출하지 않아야 한다.
func TestStartTurnTimer_StaleTimerDoesNotFire(t *testing.T) {
	h, repo := newTimerTestEnv()
	gameID := "game-stale-gen"

	state := twoPlayerState(gameID)
	seedGameState(t, repo, state)

	// 1초짜리 첫 번째 타이머 시작 (만료 시 HandleTimeout 발동 예정)
	h.startTurnTimer("room-stale", gameID, 0, 1)

	h.timersMu.RLock()
	firstGen := h.timers[gameID].generation
	h.timersMu.RUnlock()

	// 즉시 60초짜리 두 번째 타이머로 교체 → 첫 번째 goroutine의 generation이 stale
	h.startTurnTimer("room-stale", gameID, 0, 60)

	h.timersMu.RLock()
	secondGen := h.timers[gameID].generation
	h.timersMu.RUnlock()

	assert.Greater(t, secondGen, firstGen, "두 번째 타이머의 generation이 첫 번째보다 커야 한다")

	// 첫 번째 타이머 만료(1초) + 여유 시간 대기
	time.Sleep(1500 * time.Millisecond)

	// 첫 번째 goroutine은 stale 판정으로 HandleTimeout을 호출하지 않아야 한다.
	// 게임 상태(CurrentSeat, DrawPile)가 변경되지 않아야 한다.
	unchanged, err := repo.GetGameState(gameID)
	require.NoError(t, err)
	assert.Equal(t, 0, unchanged.CurrentSeat, "stale 타이머는 HandleTimeout을 호출하지 않아야 한다")
	assert.Len(t, unchanged.DrawPile, 3, "stale 타이머는 드로우 파일을 소모하지 않아야 한다")

	// 정리 (60초 타이머 취소)
	h.cancelTurnTimer(gameID)
}

// TestStartTurnTimer_ConcurrentReplace_OnlyLatestFires I5: 동시 경쟁 시나리오.
// 재연결 + AI goroutine 완료가 거의 동시에 startTurnTimer를 호출할 때
// 마지막으로 등록된 타이머만 HandleTimeout을 발동해야 한다.
func TestStartTurnTimer_ConcurrentReplace_OnlyLatestFires(t *testing.T) {
	h, repo := newTimerTestEnv()
	gameID := "game-concurrent-replace"

	state := twoPlayerState(gameID)
	seedGameState(t, repo, state)

	const shortTimeout = 1  // 만료될 짧은 타이머
	const longTimeout = 120 // 만료되지 않는 긴 타이머

	// goroutine 1: 짧은 타이머 → 만료 시 HandleTimeout 발동 예정 (stale이 되면 발동 안 함)
	h.startTurnTimer("room-cr", gameID, 0, shortTimeout)

	// goroutine 2: 즉시 긴 타이머로 교체 (이전 goroutine을 stale로 만든다)
	h.startTurnTimer("room-cr", gameID, 0, longTimeout)

	// 짧은 타이머 만료를 충분히 기다린다
	time.Sleep(time.Duration(shortTimeout)*time.Second + 500*time.Millisecond)

	// stale 판정으로 HandleTimeout이 호출되지 않아야 한다
	s, err := repo.GetGameState(gameID)
	require.NoError(t, err)
	assert.Equal(t, 0, s.CurrentSeat, "교체된 stale 타이머는 HandleTimeout을 발동하지 않아야 한다")

	h.cancelTurnTimer(gameID)
}

// TestStartTurnTimer_FirstTimerAlways1 첫 번째 타이머 등록 시 generation은 1이어야 한다.
func TestStartTurnTimer_FirstTimerAlways1(t *testing.T) {
	h, _ := newTimerTestEnv()
	gameID := "game-gen-first"

	h.startTurnTimer("room-1", gameID, 0, 60)

	h.timersMu.RLock()
	gen := h.timers[gameID].generation
	h.timersMu.RUnlock()

	assert.Equal(t, uint64(1), gen, "첫 번째 타이머의 generation은 1이어야 한다")

	h.cancelTurnTimer(gameID)
}
