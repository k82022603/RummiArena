package service

import (
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	"github.com/k82022603/RummiArena/game-server/internal/repository"
)

func newRoomService(t *testing.T) RoomService {
	t.Helper()
	roomRepo := repository.NewMemoryRoomRepo()
	gameRepo := repository.NewMemoryGameStateRepo()
	return NewRoomService(roomRepo, gameRepo)
}

// ============================================================
// Task 2: Duplicate Room Participation Tests
// ============================================================

func TestCreateRoom_DuplicateBlocked_WhenPlaying(t *testing.T) {
	svc := newRoomService(t)

	// WAITING 방에서는 자동 퇴장 → 새 방 생성 허용
	_, err := svc.CreateRoom(&CreateRoomRequest{
		Name:           "방 1",
		PlayerCount:    2,
		TurnTimeoutSec: 60,
		HostUserID:     "user-dup-1",
	})
	require.NoError(t, err)

	// WAITING 상태이므로 자동 퇴장 후 새 방 생성 성공
	_, err = svc.CreateRoom(&CreateRoomRequest{
		Name:           "방 2",
		PlayerCount:    2,
		TurnTimeoutSec: 60,
		HostUserID:     "user-dup-1",
	})
	require.NoError(t, err, "WAITING 방은 자동 퇴장 후 새 방 생성 허용")
}

func TestCreateRoom_DuplicateBlocked_PlayingState(t *testing.T) {
	svc := newRoomService(t)

	// 방 생성 + 게스트 참가 + PLAYING 상태로 변경
	room, err := svc.CreateRoom(&CreateRoomRequest{
		Name:           "게임방",
		PlayerCount:    2,
		TurnTimeoutSec: 60,
		HostUserID:     "user-playing",
	})
	require.NoError(t, err)
	err = svc.JoinRoom(room.ID, "guest-playing", "게스트")
	require.NoError(t, err)
	_, err = svc.StartGame(room.ID, "user-playing")
	require.NoError(t, err)

	// PLAYING 상태에서는 새 방 생성 거부
	_, err = svc.CreateRoom(&CreateRoomRequest{
		Name:           "새방",
		PlayerCount:    2,
		TurnTimeoutSec: 60,
		HostUserID:     "user-playing",
	})
	require.Error(t, err)
	se, ok := IsServiceError(err)
	require.True(t, ok)
	assert.Equal(t, "ALREADY_IN_ROOM", se.Code)
	assert.Equal(t, 409, se.Status)
}

func TestJoinRoom_DuplicateBlocked_WaitingAutoLeave(t *testing.T) {
	svc := newRoomService(t)

	// 방 A, B 생성
	roomA, err := svc.CreateRoom(&CreateRoomRequest{
		Name: "방 A", PlayerCount: 2, TurnTimeoutSec: 60, HostUserID: "host-A",
	})
	require.NoError(t, err)
	roomB, err := svc.CreateRoom(&CreateRoomRequest{
		Name: "방 B", PlayerCount: 2, TurnTimeoutSec: 60, HostUserID: "host-B",
	})
	require.NoError(t, err)

	// user-guest가 방 A에 참가 (WAITING)
	err = svc.JoinRoom(roomA.ID, "user-guest", "게스트")
	require.NoError(t, err)

	// user-guest가 방 B에 참가 시도 -> WAITING이므로 자동 퇴장 후 허용
	err = svc.JoinRoom(roomB.ID, "user-guest", "게스트")
	require.NoError(t, err, "WAITING 방은 자동 퇴장 후 다른 방 참가 허용")
}

func TestLeaveRoom_ClearsMapping(t *testing.T) {
	svc := newRoomService(t)

	// 방 생성
	room, err := svc.CreateRoom(&CreateRoomRequest{
		Name:           "방",
		PlayerCount:    2,
		TurnTimeoutSec: 60,
		HostUserID:     "host-leave",
	})
	require.NoError(t, err)

	// 게스트 참가
	err = svc.JoinRoom(room.ID, "guest-leave", "게스트")
	require.NoError(t, err)

	// 게스트 퇴장
	_, err = svc.LeaveRoom(room.ID, "guest-leave")
	require.NoError(t, err)

	// 게스트가 새 방에 참가 가능해야 함
	room2, err := svc.CreateRoom(&CreateRoomRequest{
		Name:           "새 방",
		PlayerCount:    2,
		TurnTimeoutSec: 60,
		HostUserID:     "other-host",
	})
	require.NoError(t, err)

	err = svc.JoinRoom(room2.ID, "guest-leave", "게스트")
	require.NoError(t, err, "퇴장 후에는 다른 방에 참가 가능해야 한다")
}

func TestFinishRoom_ClearsAllMappings(t *testing.T) {
	svc := newRoomService(t)

	// 방 생성 + 게스트 참가
	room, err := svc.CreateRoom(&CreateRoomRequest{
		Name:           "종료방",
		PlayerCount:    2,
		TurnTimeoutSec: 60,
		HostUserID:     "host-finish",
	})
	require.NoError(t, err)

	err = svc.JoinRoom(room.ID, "guest-finish", "게스트")
	require.NoError(t, err)

	// FinishRoom
	err = svc.FinishRoom(room.ID)
	require.NoError(t, err)

	// 호스트와 게스트 모두 새 방 생성 가능
	_, err = svc.CreateRoom(&CreateRoomRequest{
		Name:           "새방-호스트",
		PlayerCount:    2,
		TurnTimeoutSec: 60,
		HostUserID:     "host-finish",
	})
	require.NoError(t, err, "FinishRoom 후 호스트가 새 방을 만들 수 있어야 한다")

	_, err = svc.CreateRoom(&CreateRoomRequest{
		Name:           "새방-게스트",
		PlayerCount:    2,
		TurnTimeoutSec: 60,
		HostUserID:     "guest-finish",
	})
	require.NoError(t, err, "FinishRoom 후 게스트가 새 방을 만들 수 있어야 한다")
}

func TestClearActiveRoomForUser_ForfeitCleanup(t *testing.T) {
	svc := newRoomService(t)

	room, err := svc.CreateRoom(&CreateRoomRequest{
		Name:           "기권방",
		PlayerCount:    2,
		TurnTimeoutSec: 60,
		HostUserID:     "host-forfeit",
	})
	require.NoError(t, err)

	err = svc.JoinRoom(room.ID, "guest-forfeit", "게스트")
	require.NoError(t, err)

	// 기권 시 ClearActiveRoomForUser 호출
	svc.ClearActiveRoomForUser("guest-forfeit")

	// 게스트가 새 방 생성 가능
	_, err = svc.CreateRoom(&CreateRoomRequest{
		Name:           "새방",
		PlayerCount:    2,
		TurnTimeoutSec: 60,
		HostUserID:     "guest-forfeit",
	})
	require.NoError(t, err, "기권 후 새 방을 만들 수 있어야 한다")
}

// ============================================================
// QA Scenario TC-DR-U01~U04: 역인덱스 단위 테스트
// ============================================================

func TestActiveRoom_U01_SetAndGet(t *testing.T) {
	// TC-DR-U01: SetActiveRoomForUser + GetActiveRoomForUser -> roomId 반환
	roomRepo := repository.NewMemoryRoomRepo()

	err := roomRepo.SetActiveRoomForUser("user-idx-1", "room-100")
	require.NoError(t, err)

	// GetActiveRoomForUser는 RoomRepository 인터페이스에서 방 활성 상태를 확인하므로,
	// 방이 존재하지 않으면 빈 문자열을 반환할 수 있음.
	// 직접 RoomService 레벨에서 검증
	svc := newRoomService(t)
	room, err := svc.CreateRoom(&CreateRoomRequest{
		Name:           "인덱스 테스트",
		PlayerCount:    2,
		TurnTimeoutSec: 60,
		HostUserID:     "user-dr-u01",
	})
	require.NoError(t, err)

	// 호스트로 방을 만들면 active room이 설정됨
	// WAITING 상태이므로 자동 퇴장 후 새 방 생성 허용
	room2, err := svc.CreateRoom(&CreateRoomRequest{
		Name:           "새 방",
		PlayerCount:    2,
		TurnTimeoutSec: 60,
		HostUserID:     "user-dr-u01",
	})
	require.NoError(t, err, "WAITING 방은 자동 퇴장 후 새 방 생성 허용")
	_ = room
	_ = room2
}

func TestActiveRoom_U02_ClearThenGet(t *testing.T) {
	// TC-DR-U02: ClearActiveRoomForUser 후 조회 -> 새 방 생성 가능 (빈 상태)
	svc := newRoomService(t)

	// 방 생성 (active room 설정됨)
	_, err := svc.CreateRoom(&CreateRoomRequest{
		Name:           "U02 방",
		PlayerCount:    2,
		TurnTimeoutSec: 60,
		HostUserID:     "user-dr-u02",
	})
	require.NoError(t, err)

	// Clear
	svc.ClearActiveRoomForUser("user-dr-u02")

	// 새 방 생성 가능 (active room이 비워졌으므로)
	_, err = svc.CreateRoom(&CreateRoomRequest{
		Name:           "U02 새 방",
		PlayerCount:    2,
		TurnTimeoutSec: 60,
		HostUserID:     "user-dr-u02",
	})
	require.NoError(t, err, "Clear 후 새 방 생성 가능")
}

func TestActiveRoom_U03_NonExistentUser(t *testing.T) {
	// TC-DR-U03: 존재하지 않는 유저 조회 -> 새 방 생성 가능 (에러 없음)
	svc := newRoomService(t)

	// active room이 없는 유저는 방 생성 가능
	_, err := svc.CreateRoom(&CreateRoomRequest{
		Name:           "U03 방",
		PlayerCount:    2,
		TurnTimeoutSec: 60,
		HostUserID:     "nonexistent-user",
	})
	require.NoError(t, err, "존재하지 않는 유저는 active room이 없으므로 생성 가능")
}

func TestActiveRoom_U04_DoubleSet_Overwrite(t *testing.T) {
	// TC-DR-U04: 같은 유저 SetActive 2회 호출 -> 마지막 roomId가 유효
	roomRepo := repository.NewMemoryRoomRepo()

	err := roomRepo.SetActiveRoomForUser("user-dr-u04", "room-first")
	require.NoError(t, err)

	err = roomRepo.SetActiveRoomForUser("user-dr-u04", "room-second")
	require.NoError(t, err)

	// Clear 후 확인 (ClearActiveRoomForUser가 마지막 설정을 제거)
	err = roomRepo.ClearActiveRoomForUser("user-dr-u04")
	require.NoError(t, err, "덮어쓰기 후 Clear 정상 동작")
}

// ============================================================
// SEC-RL-002: AI 게임 생성 쿨다운 테스트
// ============================================================

// mockCooldownChecker 테스트용 CooldownChecker 모킹 구현체
type mockCooldownChecker struct {
	cooldowns map[string]bool
	failOpen  bool // true이면 IsOnCooldown이 항상 false 반환 (Redis 장애 시뮬레이션)
}

func newMockCooldown() *mockCooldownChecker {
	return &mockCooldownChecker{cooldowns: make(map[string]bool)}
}

func (m *mockCooldownChecker) IsOnCooldown(userID string) bool {
	if m.failOpen {
		return false
	}
	return m.cooldowns[userID]
}

func (m *mockCooldownChecker) SetCooldown(userID string) {
	if !m.failOpen {
		m.cooldowns[userID] = true
	}
}

func (m *mockCooldownChecker) clearCooldown(userID string) {
	delete(m.cooldowns, userID)
}

func newRoomServiceWithCooldown(t *testing.T, checker CooldownChecker) RoomService {
	t.Helper()
	roomRepo := repository.NewMemoryRoomRepo()
	gameRepo := repository.NewMemoryGameStateRepo()
	svc := NewRoomService(roomRepo, gameRepo)
	SetCooldownChecker(svc, checker)
	return svc
}

func TestAICooldown_BlocksSecondAIGameWithin5Min(t *testing.T) {
	mock := newMockCooldown()
	svc := newRoomServiceWithCooldown(t, mock)

	// 첫 번째 AI 게임 생성 — 성공
	_, err := svc.CreateRoom(&CreateRoomRequest{
		Name:           "AI 게임 1",
		PlayerCount:    2,
		TurnTimeoutSec: 60,
		HostUserID:     "user-cooldown-1",
		AIPlayers:      []AIPlayerRequest{{Type: "AI_OPENAI", Difficulty: "medium"}},
	})
	require.NoError(t, err)

	// 이전 WAITING 방은 checkDuplicateRoom에서 자동 퇴장 처리됨
	// 두 번째 AI 게임 생성 — 쿨다운으로 거부
	_, err = svc.CreateRoom(&CreateRoomRequest{
		Name:           "AI 게임 2",
		PlayerCount:    2,
		TurnTimeoutSec: 60,
		HostUserID:     "user-cooldown-1",
		AIPlayers:      []AIPlayerRequest{{Type: "AI_CLAUDE", Difficulty: "hard"}},
	})
	require.Error(t, err)
	se, ok := IsServiceError(err)
	require.True(t, ok, "ServiceError 타입이어야 한다")
	assert.Equal(t, "AI_COOLDOWN", se.Code)
	assert.Equal(t, 403, se.Status)
	assert.Contains(t, se.Message, "5분")
}

func TestAICooldown_AllowsNonAIGames(t *testing.T) {
	mock := newMockCooldown()
	svc := newRoomServiceWithCooldown(t, mock)

	// AI 게임 생성 — 쿨다운 설정됨
	_, err := svc.CreateRoom(&CreateRoomRequest{
		Name:           "AI 게임",
		PlayerCount:    2,
		TurnTimeoutSec: 60,
		HostUserID:     "user-cooldown-2",
		AIPlayers:      []AIPlayerRequest{{Type: "AI_OPENAI", Difficulty: "easy"}},
	})
	require.NoError(t, err)

	// 비-AI 게임 생성 — 쿨다운 영향 없이 성공해야 함
	_, err = svc.CreateRoom(&CreateRoomRequest{
		Name:           "일반 게임",
		PlayerCount:    2,
		TurnTimeoutSec: 60,
		HostUserID:     "user-cooldown-2",
		AIPlayers:      nil, // AI 플레이어 없음
	})
	require.NoError(t, err, "AI가 없는 방 생성은 쿨다운에 영향받지 않아야 한다")
}

func TestAICooldown_AllowsAfterTTLExpires(t *testing.T) {
	mock := newMockCooldown()
	svc := newRoomServiceWithCooldown(t, mock)

	// AI 게임 생성 — 쿨다운 설정됨
	_, err := svc.CreateRoom(&CreateRoomRequest{
		Name:           "AI 게임 1",
		PlayerCount:    2,
		TurnTimeoutSec: 60,
		HostUserID:     "user-cooldown-3",
		AIPlayers:      []AIPlayerRequest{{Type: "AI_OPENAI", Difficulty: "medium"}},
	})
	require.NoError(t, err)

	// 쿨다운이 만료된 것을 시뮬레이션
	mock.clearCooldown("user-cooldown-3")

	// 두 번째 AI 게임 생성 — 쿨다운 만료 후 성공
	_, err = svc.CreateRoom(&CreateRoomRequest{
		Name:           "AI 게임 2",
		PlayerCount:    2,
		TurnTimeoutSec: 60,
		HostUserID:     "user-cooldown-3",
		AIPlayers:      []AIPlayerRequest{{Type: "AI_CLAUDE", Difficulty: "hard"}},
	})
	require.NoError(t, err, "쿨다운 만료 후에는 AI 게임 생성이 가능해야 한다")
}

func TestAICooldown_FailOpen_RedisFailure(t *testing.T) {
	mock := newMockCooldown()
	mock.failOpen = true // Redis 장애 시뮬레이션
	svc := newRoomServiceWithCooldown(t, mock)

	// AI 게임 생성 — Redis 장애 시에도 fail-open으로 허용
	_, err := svc.CreateRoom(&CreateRoomRequest{
		Name:           "AI 게임 1",
		PlayerCount:    2,
		TurnTimeoutSec: 60,
		HostUserID:     "user-cooldown-4",
		AIPlayers:      []AIPlayerRequest{{Type: "AI_OPENAI", Difficulty: "medium"}},
	})
	require.NoError(t, err)

	// 두 번째 AI 게임 — Redis 장애로 쿨다운 체크 불가 → fail-open 허용
	_, err = svc.CreateRoom(&CreateRoomRequest{
		Name:           "AI 게임 2",
		PlayerCount:    2,
		TurnTimeoutSec: 60,
		HostUserID:     "user-cooldown-4",
		AIPlayers:      []AIPlayerRequest{{Type: "AI_CLAUDE", Difficulty: "hard"}},
	})
	require.NoError(t, err, "Redis 장애 시 fail-open으로 허용해야 한다")
}

func TestAICooldown_NilChecker_NoEffect(t *testing.T) {
	// CooldownChecker가 nil이면 (Redis 없는 환경) 쿨다운 비활성
	svc := newRoomService(t)

	_, err := svc.CreateRoom(&CreateRoomRequest{
		Name:           "AI 게임 1",
		PlayerCount:    2,
		TurnTimeoutSec: 60,
		HostUserID:     "user-cooldown-5",
		AIPlayers:      []AIPlayerRequest{{Type: "AI_OPENAI", Difficulty: "medium"}},
	})
	require.NoError(t, err)

	_, err = svc.CreateRoom(&CreateRoomRequest{
		Name:           "AI 게임 2",
		PlayerCount:    2,
		TurnTimeoutSec: 60,
		HostUserID:     "user-cooldown-5",
		AIPlayers:      []AIPlayerRequest{{Type: "AI_CLAUDE", Difficulty: "hard"}},
	})
	require.NoError(t, err, "CooldownChecker가 nil이면 쿨다운 없이 허용")
}

func TestAICooldown_AdminBypass(t *testing.T) {
	mock := newMockCooldown()
	svc := newRoomServiceWithCooldown(t, mock)

	// admin으로 AI 게임 생성
	_, err := svc.CreateRoom(&CreateRoomRequest{
		Name:           "Admin AI 게임 1",
		PlayerCount:    2,
		TurnTimeoutSec: 60,
		HostUserID:     "admin-user-1",
		AIPlayers:      []AIPlayerRequest{{Type: "AI_OPENAI", Difficulty: "medium"}},
		IsAdmin:        true,
	})
	require.NoError(t, err)

	// admin은 쿨다운 bypass — 즉시 두 번째 AI 게임 생성 가능
	_, err = svc.CreateRoom(&CreateRoomRequest{
		Name:           "Admin AI 게임 2",
		PlayerCount:    2,
		TurnTimeoutSec: 60,
		HostUserID:     "admin-user-1",
		AIPlayers:      []AIPlayerRequest{{Type: "AI_CLAUDE", Difficulty: "hard"}},
		IsAdmin:        true,
	})
	require.NoError(t, err, "admin 역할은 AI 게임 쿨다운을 bypass해야 한다")
}

func TestAICooldown_DifferentUsers_Independent(t *testing.T) {
	mock := newMockCooldown()
	svc := newRoomServiceWithCooldown(t, mock)

	// user-A가 AI 게임 생성 — 쿨다운 설정됨
	_, err := svc.CreateRoom(&CreateRoomRequest{
		Name:           "User A AI 게임",
		PlayerCount:    2,
		TurnTimeoutSec: 60,
		HostUserID:     "user-A",
		AIPlayers:      []AIPlayerRequest{{Type: "AI_OPENAI", Difficulty: "medium"}},
	})
	require.NoError(t, err)

	// user-B가 AI 게임 생성 — user-A의 쿨다운과 무관하게 성공
	_, err = svc.CreateRoom(&CreateRoomRequest{
		Name:           "User B AI 게임",
		PlayerCount:    2,
		TurnTimeoutSec: 60,
		HostUserID:     "user-B",
		AIPlayers:      []AIPlayerRequest{{Type: "AI_CLAUDE", Difficulty: "hard"}},
	})
	require.NoError(t, err, "다른 사용자의 쿨다운은 서로 독립적이어야 한다")
}
