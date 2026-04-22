// rooms_persistence_test.go — D-03 Phase 1 Dual-Write 통합 검증
//
// 목적: go-dev의 service 레벨 단위 테스트(5건)가 mock을 직접 호출하는 것과 달리,
// 여기서는 실제 gin 라우터(HTTP 경계)를 거쳐 CreateRoom → JoinRoom → StartGame →
// FinishRoom 의 조합 흐름이 mock PostgreSQL 레포지터리에 올바른 호출 시퀀스를
// 발생시키는지 검증한다.
//
// 연관:
//   - ADR: work_logs/decisions/2026-04-22-rooms-postgres-phase1.md §"검증 계획" → Integration Test
//   - 단위: src/game-server/internal/service/room_service_test.go (D-03 섹션)
//   - Verify 스크립트: scripts/verify-rooms-persistence.sh (실 K8s/PG 대상)
package e2e

import (
	"bytes"
	"context"
	"errors"
	"log"
	"net/http"
	"net/http/httptest"
	"sync"
	"testing"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
	"go.uber.org/zap"

	"github.com/k82022603/RummiArena/game-server/internal/client"
	"github.com/k82022603/RummiArena/game-server/internal/handler"
	"github.com/k82022603/RummiArena/game-server/internal/middleware"
	"github.com/k82022603/RummiArena/game-server/internal/model"
	"github.com/k82022603/RummiArena/game-server/internal/repository"
	"github.com/k82022603/RummiArena/game-server/internal/service"
)

// ---------------------------------------------------------------------------
// mock PostgreSQL GameRepository — D-03 Dual-Write 통합 검증 전용
// ---------------------------------------------------------------------------

// mockPgRepo 테스트용 GameRepository. 호출 이력을 순서대로 기록하고,
// 실패 플래그(failCreateRoomOnce)로 best-effort 경로를 강제할 수 있다.
type mockPgRepo struct {
	mu sync.Mutex

	createRoomCalls []*model.Room
	updateRoomCalls []*model.Room
	createGameCalls []*model.Game
	updateGameCalls []*model.Game

	// failCreateRoomOnce == true 이면 첫 번째 CreateRoom 호출에서 error 반환 후 플래그 해제.
	failCreateRoomOnce bool
}

// CreateGame: Phase 1 범위 밖 (games 는 ws_handler.persistGameResult 로 별도 기록).
func (m *mockPgRepo) CreateGame(_ context.Context, g *model.Game) error {
	m.mu.Lock()
	defer m.mu.Unlock()
	cp := *g
	m.createGameCalls = append(m.createGameCalls, &cp)
	return nil
}

func (m *mockPgRepo) GetGame(_ context.Context, _ string) (*model.Game, error) { return nil, nil }

func (m *mockPgRepo) UpdateGame(_ context.Context, g *model.Game) error {
	m.mu.Lock()
	defer m.mu.Unlock()
	cp := *g
	m.updateGameCalls = append(m.updateGameCalls, &cp)
	return nil
}

func (m *mockPgRepo) CreateRoom(_ context.Context, r *model.Room) error {
	m.mu.Lock()
	defer m.mu.Unlock()
	if m.failCreateRoomOnce {
		m.failCreateRoomOnce = false
		return errors.New("simulated postgres create room failure")
	}
	cp := *r
	m.createRoomCalls = append(m.createRoomCalls, &cp)
	return nil
}

func (m *mockPgRepo) GetRoom(_ context.Context, _ string) (*model.Room, error) { return nil, nil }

func (m *mockPgRepo) UpdateRoom(_ context.Context, r *model.Room) error {
	m.mu.Lock()
	defer m.mu.Unlock()
	cp := *r
	m.updateRoomCalls = append(m.updateRoomCalls, &cp)
	return nil
}

func (m *mockPgRepo) ListRooms(_ context.Context) ([]*model.Room, error) { return nil, nil }

// snapshotCreateRooms 호출 이력의 스냅샷을 race-safe 로 반환한다.
func (m *mockPgRepo) snapshotCreateRooms() []*model.Room {
	m.mu.Lock()
	defer m.mu.Unlock()
	out := make([]*model.Room, len(m.createRoomCalls))
	copy(out, m.createRoomCalls)
	return out
}

func (m *mockPgRepo) snapshotUpdateRooms() []*model.Room {
	m.mu.Lock()
	defer m.mu.Unlock()
	out := make([]*model.Room, len(m.updateRoomCalls))
	copy(out, m.updateRoomCalls)
	return out
}

// ---------------------------------------------------------------------------
// 테스트용 라우터 — mock pgGameRepo 를 주입하여 실제 HTTP 경계를 거치는 Dual-Write 흐름을 재현한다.
// buildTestRouter(t,"dev") 와 구조 동일하되 pgGameRepo 만 mock 으로 교체.
// ---------------------------------------------------------------------------

// persistenceTestCtx 라우터 + 주입된 mock + roomSvc 참조를 묶은 구조체.
// FinishRoom 은 HTTP 엔드포인트가 없으므로 roomSvc 를 직접 호출하기 위해 보관한다.
type persistenceTestCtx struct {
	router  *gin.Engine
	mock    *mockPgRepo
	roomSvc service.RoomService
}

// buildPersistenceRouter Dual-Write 통합 테스트용 라우터를 구축한다.
// pgGameRepo 로 mockPgRepo 를 주입하여 실제 PG 없이도 호출 이력을 검증할 수 있다.
func buildPersistenceRouter(t *testing.T, mock *mockPgRepo) *persistenceTestCtx {
	t.Helper()

	gin.SetMode(gin.TestMode)
	logger := zap.NewNop()

	gameStateRepo := repository.NewMemoryGameStateRepoAdapter()
	roomRepo := repository.NewMemoryRoomRepo()

	// D-03 Phase 1: 3번째 인자에 mock 주입 (프로덕션 main.go 와 동일 경로).
	roomSvc := service.NewRoomService(roomRepo, gameStateRepo, mock)
	gameSvc := service.NewGameService(gameStateRepo)
	turnSvc := service.NewTurnService(gameStateRepo, gameSvc)

	var aiClient client.AIClientInterface
	wsHub := handler.NewHub(logger)

	roomHandler := handler.NewRoomHandler(roomSvc)
	gameHandler := handler.NewGameHandler(gameSvc)
	wsHandler := handler.NewWSHandler(wsHub, roomSvc, gameSvc, turnSvc, aiClient, e2eJWTSecret, logger, 240)
	authHandler := handler.NewAuthHandler(e2eJWTSecret)

	router := gin.New()
	router.Use(gin.Recovery())
	router.GET("/health", func(c *gin.Context) { c.JSON(http.StatusOK, gin.H{"status": "ok"}) })
	router.GET("/ws", wsHandler.HandleWS)

	api := router.Group("/api")
	auth := api.Group("/auth")
	auth.POST("/dev-login", authHandler.DevLogin)

	rooms := api.Group("/rooms")
	rooms.Use(middleware.JWTAuth(e2eJWTSecret))
	{
		rooms.POST("", roomHandler.CreateRoom)
		rooms.GET("", roomHandler.ListRooms)
		rooms.GET("/:id", roomHandler.GetRoom)
		rooms.POST("/:id/join", roomHandler.JoinRoom)
		rooms.POST("/:id/leave", roomHandler.LeaveRoom)
		rooms.POST("/:id/start", roomHandler.StartGame)
		rooms.DELETE("/:id", roomHandler.DeleteRoom)
	}

	games := api.Group("/games")
	games.Use(middleware.JWTAuth(e2eJWTSecret))
	{
		games.GET("/:id", gameHandler.GetGameState)
		games.POST("/:id/place", gameHandler.PlaceTiles)
		games.POST("/:id/confirm", gameHandler.ConfirmTurn)
		games.POST("/:id/draw", gameHandler.DrawTile)
	}

	return &persistenceTestCtx{router: router, mock: mock, roomSvc: roomSvc}
}

// ---------------------------------------------------------------------------
// UUID 고정값 — D-03 FK 방어(isValidUUIDStr) 통과를 위해 유효 UUID 형식 사용.
// 기존 e2e 상수(hostUserID="host-user-e2e-001")는 UUID 아니므로 재사용 불가.
// ---------------------------------------------------------------------------
const (
	persistenceHostUUID  = "aaaaaaaa-1111-4aaa-8aaa-aaaaaaaaaaaa"
	persistenceGuestUUID = "bbbbbbbb-2222-4bbb-8bbb-bbbbbbbbbbbb"
	persistenceGuestName = "게스트"
)

// ---------------------------------------------------------------------------
// 테스트 1 (우선순위 최상): HTTP 경계 전체 흐름 — CreateRoom → JoinRoom → StartGame → FinishRoom
// ---------------------------------------------------------------------------

// TestRoomsPersistence_FullFlow_HTTPBoundary
// ADR D-03 §검증 계획: "AI vs AI 1판 대전 후 PostgreSQL 검증" 의 HTTP 레벨 재현.
//
// 기대 mock 호출 시퀀스:
//  1. CreateRoom (HTTP POST /api/rooms)          → mock.CreateRoom 1회 (Status=WAITING)
//  2. JoinRoom   (HTTP POST /api/rooms/:id/join) → mock.UpdateRoom 1회 (WAITING 유지)
//  3. StartGame  (HTTP POST /api/rooms/:id/start)→ mock.UpdateRoom 1회 (Status=PLAYING, GameID 설정)
//  4. FinishRoom (service 직접 호출)              → mock.UpdateRoom 1회 (Status=FINISHED)
//
// 총 createRoomCalls=1, updateRoomCalls>=3. 마지막 update 는 FINISHED 여야 한다.
func TestRoomsPersistence_FullFlow_HTTPBoundary(t *testing.T) {
	mock := &mockPgRepo{}
	ctx := buildPersistenceRouter(t, mock)
	srv := httptest.NewServer(ctx.router)
	defer srv.Close()

	hostToken := issueDevToken(t, persistenceHostUUID)
	guestToken := issueDevToken(t, persistenceGuestUUID)

	// ── Step 1: CreateRoom (HTTP)
	createResp := doRequest(t, srv, http.MethodPost, "/api/rooms", hostToken, map[string]interface{}{
		"playerCount":    2,
		"turnTimeoutSec": 60,
	})
	require.Equal(t, http.StatusCreated, createResp.StatusCode)
	roomBody := decodeJSON(t, createResp)
	roomID, _ := roomBody["id"].(string)
	require.NotEmpty(t, roomID)

	// mock 에 CreateRoom 1회 기록되어야 한다 (HostID 가 유효 UUID 이므로 스킵 안됨).
	creates := mock.snapshotCreateRooms()
	require.Len(t, creates, 1, "HTTP CreateRoom 후 mock.CreateRoom 1회 호출")
	assert.Equal(t, roomID, creates[0].ID, "roomID 일치")
	assert.Equal(t, persistenceHostUUID, creates[0].HostUserID, "HostID → HostUserID 매핑")
	assert.Equal(t, 60, creates[0].TurnTimeout, "TurnTimeoutSec → TurnTimeout 매핑")
	assert.Equal(t, model.RoomStatusWaiting, creates[0].Status, "CreateRoom 직후 Status=WAITING")

	// ── Step 2: JoinRoom (HTTP)
	joinResp := doRequest(t, srv, http.MethodPost, "/api/rooms/"+roomID+"/join", guestToken, map[string]string{
		"displayName": persistenceGuestName,
	})
	require.Equal(t, http.StatusOK, joinResp.StatusCode)
	joinResp.Body.Close() //nolint:errcheck

	// JoinRoom 이후 mock.UpdateRoom 누적 1회 이상.
	updatesAfterJoin := mock.snapshotUpdateRooms()
	require.GreaterOrEqual(t, len(updatesAfterJoin), 1, "JoinRoom 후 UpdateRoom 최소 1회")

	// ── Step 3: StartGame (HTTP)
	startResp := doRequest(t, srv, http.MethodPost, "/api/rooms/"+roomID+"/start", hostToken, nil)
	require.Equal(t, http.StatusOK, startResp.StatusCode)
	startResp.Body.Close() //nolint:errcheck

	// StartGame 후 마지막 UpdateRoom 은 Status=PLAYING + GameID != nil.
	updatesAfterStart := mock.snapshotUpdateRooms()
	require.Greater(t, len(updatesAfterStart), len(updatesAfterJoin), "StartGame 후 UpdateRoom 증가")
	last := updatesAfterStart[len(updatesAfterStart)-1]
	assert.Equal(t, model.RoomStatusPlaying, last.Status, "StartGame 후 상태=PLAYING")
	assert.NotNil(t, last.GameID, "StartGame 후 GameID 설정됨")

	// ── Step 4: FinishRoom (service 직접 호출 — HTTP 엔드포인트 없음)
	require.NoError(t, ctx.roomSvc.FinishRoom(roomID))

	updatesAfterFinish := mock.snapshotUpdateRooms()
	require.Greater(t, len(updatesAfterFinish), len(updatesAfterStart), "FinishRoom 후 UpdateRoom 증가")
	finishLast := updatesAfterFinish[len(updatesAfterFinish)-1]
	assert.Equal(t, model.RoomStatusFinished, finishLast.Status, "FinishRoom 후 상태=FINISHED")
	assert.Equal(t, roomID, finishLast.ID, "roomID 일치")

	// ── 최종 검증: ADR 의 SQL 4가지에 상응하는 불변식
	// 1) SELECT count(*) FROM rooms >= 1            → createRoomCalls >= 1
	// 2) SELECT status WHERE id=$1 = 'FINISHED'     → 마지막 update.Status = FINISHED
	// 3) games.room_id NOT NULL after I-14 wire     → ws_handler 별도 검증 (본 테스트 범위 밖)
	// 4) JOIN rooms-games FK valid                  → ws_handler 별도 검증 (본 테스트 범위 밖)
	assert.Len(t, mock.snapshotCreateRooms(), 1, "전체 흐름에서 CreateRoom 은 정확히 1회")
}

// ---------------------------------------------------------------------------
// 테스트 2: Guest Host(non-UUID) 는 HTTP 경계를 거치더라도 mock 에 전혀 기록되지 않아야 한다.
// (단위 테스트는 service 레벨에서 검증 → 여기서는 HTTP 경계 + JWT 미들웨어 조합을 함께 확인)
// ---------------------------------------------------------------------------

// TestRoomsPersistence_GuestHost_HTTPSkipsDB
// non-UUID 사용자 ID 로 JWT 를 발급받아 방을 생성하면 roomStateToModel 이 nil 반환 →
// mock.CreateRoom 은 호출되지 않는다. HTTP 응답은 201 Created 로 정상이어야 한다.
func TestRoomsPersistence_GuestHost_HTTPSkipsDB(t *testing.T) {
	mock := &mockPgRepo{}
	ctx := buildPersistenceRouter(t, mock)
	srv := httptest.NewServer(ctx.router)
	defer srv.Close()

	// 비-UUID 호스트 — 기존 상수 hostUserID="host-user-e2e-001" 와 같은 형식.
	guestHostID := "qa-guest-non-uuid-001"
	token := issueDevToken(t, guestHostID)

	createResp := doRequest(t, srv, http.MethodPost, "/api/rooms", token, map[string]interface{}{
		"playerCount":    2,
		"turnTimeoutSec": 60,
	})
	require.Equal(t, http.StatusCreated, createResp.StatusCode, "비-UUID 호스트도 HTTP 응답은 성공")
	createResp.Body.Close() //nolint:errcheck

	// FK 방어로 mock 에 기록 없음.
	assert.Len(t, mock.snapshotCreateRooms(), 0, "비-UUID 호스트는 mock.CreateRoom 미호출")
	assert.Len(t, mock.snapshotUpdateRooms(), 0, "비-UUID 호스트는 mock.UpdateRoom 미호출")
}

// ---------------------------------------------------------------------------
// 테스트 3: PostgreSQL CreateRoom 이 1회 실패해도 HTTP 응답은 201 Created.
// best-effort 원칙 검증 + 로그 출력 캡처.
// ---------------------------------------------------------------------------

// TestRoomsPersistence_CreateRoomFailure_HTTPStillSucceeds
// ADR D-03 §설계 §4 best-effort 에러 처리: "log.Error 만, 에러 반환 금지".
// HTTP 레이어에서 관찰: 201 응답 + mock.createRoomCalls=0 + 로그에 실패 메시지 포함.
func TestRoomsPersistence_CreateRoomFailure_HTTPStillSucceeds(t *testing.T) {
	mock := &mockPgRepo{failCreateRoomOnce: true}
	ctx := buildPersistenceRouter(t, mock)
	srv := httptest.NewServer(ctx.router)
	defer srv.Close()

	// 로그 캡처 — best-effort 실패 시 room_service 가 log.Printf 로 기록한다.
	var logBuf bytes.Buffer
	prevOut := log.Writer()
	prevFlags := log.Flags()
	log.SetOutput(&logBuf)
	log.SetFlags(0)
	defer func() {
		log.SetOutput(prevOut)
		log.SetFlags(prevFlags)
	}()

	token := issueDevToken(t, persistenceHostUUID)
	createResp := doRequest(t, srv, http.MethodPost, "/api/rooms", token, map[string]interface{}{
		"playerCount":    2,
		"turnTimeoutSec": 60,
	})
	require.Equal(t, http.StatusCreated, createResp.StatusCode, "PG 실패해도 HTTP 201")
	body := decodeJSON(t, createResp)
	roomID, _ := body["id"].(string)
	require.NotEmpty(t, roomID, "메모리 저장은 성공하여 roomID 반환")

	// mock 에는 기록 없음 (첫 호출이 실패 처리됨).
	assert.Len(t, mock.snapshotCreateRooms(), 0, "PG 실패 호출은 createRoomCalls 에 누적되지 않음")

	// log.Printf 로그 메시지 포함 확인 — "postgres create room best-effort failed".
	// 로그가 비동기로 쓰일 수 있으므로 짧은 polling 으로 2초 대기.
	deadline := time.Now().Add(2 * time.Second)
	var logSnap string
	for time.Now().Before(deadline) {
		logSnap = logBuf.String()
		if logSnap != "" {
			break
		}
		time.Sleep(20 * time.Millisecond)
	}
	assert.Contains(t, logSnap, "postgres create room best-effort failed",
		"best-effort 실패는 log.Printf 로 기록됨 (에러 반환 금지)")
}

// ---------------------------------------------------------------------------
// package-level 도우미: persistence 테스트에서 쓰는 doRequest/decodeJSON/issueDevToken 은
// game_flow_test.go 에서 이미 정의되어 있으므로 재정의 불필요.
// 상수 e2eJWTSecret 도 동일 패키지(e2e) 내에서 공유.
// ---------------------------------------------------------------------------

// compile-time 인터페이스 준수 확인 — repository.GameRepository 변경 시 컴파일 에러로 감지.
var _ repository.GameRepository = (*mockPgRepo)(nil)
