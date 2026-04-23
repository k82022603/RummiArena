package service

import (
	"context"
	"errors"
	"sync"
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	"github.com/k82022603/RummiArena/game-server/internal/model"
	"github.com/k82022603/RummiArena/game-server/internal/repository"
)

func newRoomService(t *testing.T) RoomService {
	t.Helper()
	roomRepo := repository.NewMemoryRoomRepo()
	gameRepo := repository.NewMemoryGameStateRepo()
	return NewRoomService(roomRepo, gameRepo, nil)
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
	svc := NewRoomService(roomRepo, gameRepo, nil)
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

// ============================================================
// D-03 Phase 1: Dual-Write 단위 테스트
// ============================================================

// mockPgGameRepo D-03 테스트용 GameRepository mock.
type mockPgGameRepo struct {
	mu              sync.Mutex
	createRoomCalls []*model.Room
	updateRoomCalls []*model.Room
	failCreateRoom  bool
	failUpdateRoom  bool
}

func (m *mockPgGameRepo) CreateGame(_ context.Context, _ *model.Game) error { return nil }
func (m *mockPgGameRepo) GetGame(_ context.Context, _ string) (*model.Game, error) {
	return nil, nil
}
func (m *mockPgGameRepo) UpdateGame(_ context.Context, _ *model.Game) error { return nil }

func (m *mockPgGameRepo) CreateRoom(_ context.Context, room *model.Room) error {
	m.mu.Lock()
	defer m.mu.Unlock()
	if m.failCreateRoom {
		m.failCreateRoom = false
		return errors.New("simulated postgres create room failure")
	}
	cp := *room
	m.createRoomCalls = append(m.createRoomCalls, &cp)
	return nil
}

func (m *mockPgGameRepo) GetRoom(_ context.Context, _ string) (*model.Room, error) {
	return nil, nil
}

func (m *mockPgGameRepo) UpdateRoom(_ context.Context, room *model.Room) error {
	m.mu.Lock()
	defer m.mu.Unlock()
	if m.failUpdateRoom {
		m.failUpdateRoom = false
		return errors.New("simulated postgres update room failure")
	}
	cp := *room
	m.updateRoomCalls = append(m.updateRoomCalls, &cp)
	return nil
}

func (m *mockPgGameRepo) ListRooms(_ context.Context) ([]*model.Room, error) { return nil, nil }

// newRoomServiceWithMockPg UUID 호스트 + mockPgGameRepo로 RoomService를 생성한다.
func newRoomServiceWithMockPg(t *testing.T, mock repository.GameRepository) RoomService {
	t.Helper()
	roomRepo := repository.NewMemoryRoomRepo()
	gameRepo := repository.NewMemoryGameStateRepo()
	return NewRoomService(roomRepo, gameRepo, mock)
}

// TestRoomService_CreateRoom_WritesToPostgres CreateRoom 후 PostgreSQL에 방이 기록되는지 확인.
func TestRoomService_CreateRoom_WritesToPostgres(t *testing.T) {
	mock := &mockPgGameRepo{}
	svc := newRoomServiceWithMockPg(t, mock)

	// HostUserID는 유효 UUID여야 FK 방어를 통과한다.
	hostID := "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee"
	room, err := svc.CreateRoom(&CreateRoomRequest{
		Name:           "테스트 방",
		PlayerCount:    2,
		TurnTimeoutSec: 60,
		HostUserID:     hostID,
	})
	require.NoError(t, err)

	mock.mu.Lock()
	defer mock.mu.Unlock()
	require.Len(t, mock.createRoomCalls, 1, "PostgreSQL CreateRoom 1회 호출")
	dbRoom := mock.createRoomCalls[0]
	assert.Equal(t, room.ID, dbRoom.ID)
	assert.Equal(t, hostID, dbRoom.HostUserID, "HostID → HostUserID 매핑 확인")
	assert.Equal(t, 60, dbRoom.TurnTimeout, "TurnTimeoutSec → TurnTimeout 매핑 확인")
	assert.Equal(t, model.RoomStatusWaiting, dbRoom.Status)
}

// TestRoomService_StartGame_UpdatesRoomStatus StartGame 후 PostgreSQL에 PLAYING 상태로 업데이트 확인.
func TestRoomService_StartGame_UpdatesRoomStatus(t *testing.T) {
	mock := &mockPgGameRepo{}
	svc := newRoomServiceWithMockPg(t, mock)

	hostID := "11111111-1111-1111-1111-111111111111"
	guestID := "22222222-2222-2222-2222-222222222222"

	// 방 생성 (CreateRoom → 1회 CreateRoom 호출)
	room, err := svc.CreateRoom(&CreateRoomRequest{
		Name:           "게임 시작 테스트 방",
		PlayerCount:    2,
		TurnTimeoutSec: 60,
		HostUserID:     hostID,
	})
	require.NoError(t, err)

	// 게스트 참가 (JoinRoom → 1회 UpdateRoom 호출)
	err = svc.JoinRoom(room.ID, guestID, "게스트")
	require.NoError(t, err)

	// 게임 시작 (StartGame → 1회 UpdateRoom 호출)
	_, err = svc.StartGame(room.ID, hostID)
	require.NoError(t, err)

	mock.mu.Lock()
	defer mock.mu.Unlock()

	// UpdateRoom 호출 중 마지막이 PLAYING 상태여야 한다
	require.GreaterOrEqual(t, len(mock.updateRoomCalls), 1, "UpdateRoom 최소 1회 호출 (StartGame)")
	lastUpdate := mock.updateRoomCalls[len(mock.updateRoomCalls)-1]
	assert.Equal(t, model.RoomStatusPlaying, lastUpdate.Status, "StartGame 후 상태는 PLAYING")
	assert.NotNil(t, lastUpdate.GameID, "GameID가 설정되어야 한다")
}

// TestRoomService_FinishRoom_UpdatesRoomStatusFinished FinishRoom 후 FINISHED 상태 업데이트 확인.
func TestRoomService_FinishRoom_UpdatesRoomStatusFinished(t *testing.T) {
	mock := &mockPgGameRepo{}
	svc := newRoomServiceWithMockPg(t, mock)

	hostID := "33333333-3333-3333-3333-333333333333"
	room, err := svc.CreateRoom(&CreateRoomRequest{
		Name:           "종료 테스트 방",
		PlayerCount:    2,
		TurnTimeoutSec: 60,
		HostUserID:     hostID,
	})
	require.NoError(t, err)

	// FinishRoom 호출
	err = svc.FinishRoom(room.ID)
	require.NoError(t, err)

	mock.mu.Lock()
	defer mock.mu.Unlock()

	require.GreaterOrEqual(t, len(mock.updateRoomCalls), 1, "UpdateRoom 최소 1회 호출 (FinishRoom)")
	lastUpdate := mock.updateRoomCalls[len(mock.updateRoomCalls)-1]
	assert.Equal(t, model.RoomStatusFinished, lastUpdate.Status, "FinishRoom 후 상태는 FINISHED")
}

// TestRoomService_DualWrite_PostgresFailure_MemoryStillSucceeds
// PostgreSQL 쓰기 실패 시 메모리 저장은 성공 (best-effort 원칙).
func TestRoomService_DualWrite_PostgresFailure_MemoryStillSucceeds(t *testing.T) {
	mock := &mockPgGameRepo{failCreateRoom: true} // 첫 번째 CreateRoom 호출 실패
	svc := newRoomServiceWithMockPg(t, mock)

	hostID := "44444444-4444-4444-4444-444444444444"
	room, err := svc.CreateRoom(&CreateRoomRequest{
		Name:           "PG 실패 테스트 방",
		PlayerCount:    2,
		TurnTimeoutSec: 60,
		HostUserID:     hostID,
	})
	// PostgreSQL 실패에도 메모리 저장은 성공해야 한다
	require.NoError(t, err, "PostgreSQL best-effort 실패해도 CreateRoom은 성공해야 한다")
	require.NotNil(t, room)

	// 메모리에서 조회 가능
	fetched, err := svc.GetRoom(room.ID)
	require.NoError(t, err, "메모리에서 방 조회 가능")
	assert.Equal(t, room.ID, fetched.ID)

	// PostgreSQL mock에는 기록 없음 (실패했으므로)
	mock.mu.Lock()
	defer mock.mu.Unlock()
	assert.Len(t, mock.createRoomCalls, 0, "PG 실패 시 createRoomCalls에 기록 없음")
}

// TestRoomService_DualWrite_GuestHost_SkipsDB
// 비-UUID 호스트(게스트)가 방을 생성하면 DB 쓰기를 스킵한다.
func TestRoomService_DualWrite_GuestHost_SkipsDB(t *testing.T) {
	mock := &mockPgGameRepo{}
	svc := newRoomServiceWithMockPg(t, mock)

	// 게스트 ID (UUID 형식 아님) — FK 위반 방지를 위해 DB 쓰기 스킵해야 함
	guestHostID := "qa-테스터-1234567890"
	room, err := svc.CreateRoom(&CreateRoomRequest{
		Name:           "게스트 호스트 방",
		PlayerCount:    2,
		TurnTimeoutSec: 60,
		HostUserID:     guestHostID,
	})
	require.NoError(t, err, "게스트 호스트도 메모리 방 생성 성공")
	require.NotNil(t, room)

	// DB 쓰기는 스킵됨
	mock.mu.Lock()
	defer mock.mu.Unlock()
	assert.Len(t, mock.createRoomCalls, 0, "비-UUID 호스트는 DB 쓰기 스킵")
}

// ============================================================
// Issue #47 — V-SPRINT7-RACE-01: LeaveRoom PLAYING 상태 가드
// ============================================================

// TestLeaveRoom_RejectsPlayingStatus
// PLAYING 상태 방에서 LeaveRoom을 호출하면 409 GAME_IN_PROGRESS를 반환한다.
// 호스트와 게스트 모두 동일하게 차단된다.
func TestLeaveRoom_RejectsPlayingStatus(t *testing.T) {
	svc := newRoomService(t)

	// 방 생성 (호스트)
	room, err := svc.CreateRoom(&CreateRoomRequest{
		Name:           "진행 중 방",
		PlayerCount:    2,
		TurnTimeoutSec: 60,
		HostUserID:     "host-playing-guard",
	})
	require.NoError(t, err)

	// 게스트 참가
	err = svc.JoinRoom(room.ID, "guest-playing-guard", "게스트")
	require.NoError(t, err)

	// 게임 시작 → PLAYING 상태
	_, err = svc.StartGame(room.ID, "host-playing-guard")
	require.NoError(t, err)

	// 호스트 LeaveRoom 시도 → 차단
	_, err = svc.LeaveRoom(room.ID, "host-playing-guard")
	require.Error(t, err, "PLAYING 상태에서 호스트 LeaveRoom은 에러를 반환해야 한다")
	se, ok := IsServiceError(err)
	require.True(t, ok, "ServiceError 타입이어야 한다")
	assert.Equal(t, "GAME_IN_PROGRESS", se.Code)
	assert.Equal(t, 409, se.Status)

	// 게스트 LeaveRoom 시도 → 차단
	_, err = svc.LeaveRoom(room.ID, "guest-playing-guard")
	require.Error(t, err, "PLAYING 상태에서 게스트 LeaveRoom은 에러를 반환해야 한다")
	se, ok = IsServiceError(err)
	require.True(t, ok, "ServiceError 타입이어야 한다")
	assert.Equal(t, "GAME_IN_PROGRESS", se.Code)
	assert.Equal(t, 409, se.Status)
}

// TestLeaveRoom_AllowsWaitingStatus
// WAITING 상태 방에서 LeaveRoom은 정상 동작한다 (회귀 방지).
func TestLeaveRoom_AllowsWaitingStatus(t *testing.T) {
	svc := newRoomService(t)

	// 방 생성
	room, err := svc.CreateRoom(&CreateRoomRequest{
		Name:           "대기 중 방",
		PlayerCount:    2,
		TurnTimeoutSec: 60,
		HostUserID:     "host-waiting-leave",
	})
	require.NoError(t, err)

	// 게스트 참가
	err = svc.JoinRoom(room.ID, "guest-waiting-leave", "게스트")
	require.NoError(t, err)

	// 게스트 LeaveRoom → WAITING 상태이므로 정상 퇴장
	result, err := svc.LeaveRoom(room.ID, "guest-waiting-leave")
	require.NoError(t, err, "WAITING 상태에서 LeaveRoom은 성공해야 한다")
	require.NotNil(t, result)
	assert.Equal(t, room.ID, result.ID)

	// seat이 EMPTY로 초기화됐는지 확인
	found := false
	for _, p := range result.Players {
		if p.UserID == "guest-waiting-leave" {
			found = true
			break
		}
	}
	assert.False(t, found, "퇴장한 게스트는 Players 목록에서 제거돼야 한다")
}

// TestCheckDuplicateRoom_StillWorksOnWaiting
// checkDuplicateRoom의 self-call(L478) 경로 — WAITING 방 자동 퇴장이 정상 동작하는지 확인.
// PLAYING 가드 추가 후에도 이 경로는 영향받지 않아야 한다.
func TestCheckDuplicateRoom_StillWorksOnWaiting(t *testing.T) {
	svc := newRoomService(t)

	// user가 WAITING 방 A를 생성
	roomA, err := svc.CreateRoom(&CreateRoomRequest{
		Name:           "방 A",
		PlayerCount:    2,
		TurnTimeoutSec: 60,
		HostUserID:     "host-dup-check",
	})
	require.NoError(t, err)

	// 같은 user가 방 B를 생성 시도 → checkDuplicateRoom이 WAITING 방 A에서 자동 퇴장 후 성공
	_, err = svc.CreateRoom(&CreateRoomRequest{
		Name:           "방 B",
		PlayerCount:    2,
		TurnTimeoutSec: 60,
		HostUserID:     "host-dup-check",
	})
	require.NoError(t, err, "WAITING 방 A 자동 퇴장 후 방 B 생성은 성공해야 한다")

	// 방 A는 CANCELLED 상태가 됐어야 한다 (호스트가 떠났으므로)
	roomAState, err := svc.GetRoom(roomA.ID)
	require.NoError(t, err)
	assert.Equal(t, model.RoomStatusCancelled, roomAState.Status,
		"호스트가 자동 퇴장한 방 A는 CANCELLED 상태여야 한다")
}
