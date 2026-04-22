package e2e

import (
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	"github.com/k82022603/RummiArena/game-server/internal/model"
	"github.com/k82022603/RummiArena/game-server/internal/repository"
	"github.com/k82022603/RummiArena/game-server/internal/service"
)

// TestRoomLifecycle_FinishRoom_StatusBecomesFinished
// FinishRoom 호출 후 GET /api/rooms/:id → status == "FINISHED" 검증
func TestRoomLifecycle_FinishRoom_StatusBecomesFinished(t *testing.T) {
	router := buildTestRouter(t, "dev")
	srv := httptest.NewServer(router)
	defer srv.Close()

	hostToken := issueDevToken(t, hostUserID)
	guestToken := issueDevToken(t, guestUserID)

	// 방 생성
	createResp := doRequest(t, srv, http.MethodPost, "/api/rooms", hostToken, map[string]interface{}{
		"playerCount":    2,
		"turnTimeoutSec": 60,
	})
	require.Equal(t, http.StatusCreated, createResp.StatusCode)
	roomBody := decodeJSON(t, createResp)
	roomID := roomBody["id"].(string)

	// 게스트 참가
	joinResp := doRequest(t, srv, http.MethodPost, "/api/rooms/"+roomID+"/join", guestToken, nil)
	require.Equal(t, http.StatusOK, joinResp.StatusCode)
	joinResp.Body.Close() //nolint:errcheck

	// 게임 시작
	startResp := doRequest(t, srv, http.MethodPost, "/api/rooms/"+roomID+"/start", hostToken, nil)
	require.Equal(t, http.StatusOK, startResp.StatusCode)
	startResp.Body.Close() //nolint:errcheck

	// 방 상태가 PLAYING인지 확인
	playingResp := doRequest(t, srv, http.MethodGet, "/api/rooms/"+roomID, hostToken, nil)
	require.Equal(t, http.StatusOK, playingResp.StatusCode)
	playingBody := decodeJSON(t, playingResp)
	assert.Equal(t, "PLAYING", playingBody["status"], "게임 시작 후 방 상태는 PLAYING이어야 한다")

	// roomService를 직접 생성하여 FinishRoom 호출
	// (HTTP 엔드포인트가 없으므로 서비스 레이어를 직접 테스트)
	roomRepo := repository.NewMemoryRoomRepo()
	gameStateRepo := repository.NewMemoryGameStateRepoAdapter()
	roomSvc := service.NewRoomService(roomRepo, gameStateRepo, nil)

	// 별도 방을 만들어 FinishRoom 단위 동작 확인
	finishRoom, err := roomSvc.CreateRoom(&service.CreateRoomRequest{
		Name:           "종료 테스트 방",
		PlayerCount:    2,
		TurnTimeoutSec: 60,
		HostUserID:     hostUserID,
	})
	require.NoError(t, err)

	// 초기 상태는 WAITING
	assert.Equal(t, model.RoomStatusWaiting, finishRoom.Status)

	// FinishRoom 호출
	err = roomSvc.FinishRoom(finishRoom.ID)
	require.NoError(t, err)

	// 조회 시 FINISHED
	updated, err := roomSvc.GetRoom(finishRoom.ID)
	require.NoError(t, err)
	assert.Equal(t, model.RoomStatusFinished, updated.Status, "FinishRoom 호출 후 상태는 FINISHED여야 한다")
}

// TestRoomLifecycle_FinishRoom_Idempotent
// 이미 FINISHED인 방에 FinishRoom을 다시 호출해도 에러 없이 no-op이어야 한다
func TestRoomLifecycle_FinishRoom_Idempotent(t *testing.T) {
	roomRepo := repository.NewMemoryRoomRepo()
	gameStateRepo := repository.NewMemoryGameStateRepoAdapter()
	roomSvc := service.NewRoomService(roomRepo, gameStateRepo, nil)

	room, err := roomSvc.CreateRoom(&service.CreateRoomRequest{
		Name:           "멱등성 테스트 방",
		PlayerCount:    2,
		TurnTimeoutSec: 60,
		HostUserID:     hostUserID,
	})
	require.NoError(t, err)

	// 첫 번째 호출 → FINISHED
	err = roomSvc.FinishRoom(room.ID)
	require.NoError(t, err)

	// 두 번째 호출 → no-op, 에러 없음
	err = roomSvc.FinishRoom(room.ID)
	require.NoError(t, err, "FINISHED 방에 다시 FinishRoom을 호출해도 에러가 없어야 한다")

	final, err := roomSvc.GetRoom(room.ID)
	require.NoError(t, err)
	assert.Equal(t, model.RoomStatusFinished, final.Status)
}

// TestRoomLifecycle_FinishRoom_CancelledIsNoOp
// CANCELLED 방에 FinishRoom을 호출해도 에러 없이 no-op이어야 한다
func TestRoomLifecycle_FinishRoom_CancelledIsNoOp(t *testing.T) {
	roomRepo := repository.NewMemoryRoomRepo()
	gameStateRepo := repository.NewMemoryGameStateRepoAdapter()
	roomSvc := service.NewRoomService(roomRepo, gameStateRepo, nil)

	room, err := roomSvc.CreateRoom(&service.CreateRoomRequest{
		Name:           "취소된 방",
		PlayerCount:    2,
		TurnTimeoutSec: 60,
		HostUserID:     hostUserID,
	})
	require.NoError(t, err)

	// 호스트 퇴장 → CANCELLED
	_, err = roomSvc.LeaveRoom(room.ID, hostUserID)
	require.NoError(t, err)

	cancelled, err := roomSvc.GetRoom(room.ID)
	require.NoError(t, err)
	assert.Equal(t, model.RoomStatusCancelled, cancelled.Status)

	// CANCELLED 방에 FinishRoom → no-op
	err = roomSvc.FinishRoom(room.ID)
	require.NoError(t, err, "CANCELLED 방에 FinishRoom을 호출해도 에러가 없어야 한다")

	// 상태는 CANCELLED 유지
	afterFinish, err := roomSvc.GetRoom(room.ID)
	require.NoError(t, err)
	assert.Equal(t, model.RoomStatusCancelled, afterFinish.Status, "CANCELLED 상태는 변경되지 않아야 한다")
}

// TestRoomLifecycle_FinishRoom_NotFound
// 존재하지 않는 방 ID로 FinishRoom 호출 시 NOT_FOUND 에러 반환
func TestRoomLifecycle_FinishRoom_NotFound(t *testing.T) {
	roomRepo := repository.NewMemoryRoomRepo()
	gameStateRepo := repository.NewMemoryGameStateRepoAdapter()
	roomSvc := service.NewRoomService(roomRepo, gameStateRepo, nil)

	err := roomSvc.FinishRoom("non-existent-room-id")
	require.Error(t, err)

	svcErr, ok := service.IsServiceError(err)
	require.True(t, ok, "서비스 에러 타입이어야 한다")
	assert.Equal(t, "NOT_FOUND", svcErr.Code)
	assert.Equal(t, 404, svcErr.Status)
}

// TestRoomLifecycle_ListRooms_ExcludesFinished
// FinishRoom 호출 후 ListRooms에 FINISHED 방이 포함되지 않는지 확인
func TestRoomLifecycle_ListRooms_ExcludesFinished(t *testing.T) {
	// 별도 repo 인스턴스로 ListRooms 필터링 로직(WAITING+PLAYING만 반환)을 단위 검증한다.
	// (중복 방 참가 제한으로 동일 사용자가 여러 방을 만들 수 없으므로 HTTP 부분은 생략)
	roomRepo := repository.NewMemoryRoomRepo()
	gameStateRepo := repository.NewMemoryGameStateRepoAdapter()
	roomSvc := service.NewRoomService(roomRepo, gameStateRepo, nil)

	activeRoom, err := roomSvc.CreateRoom(&service.CreateRoomRequest{
		Name:           "활성 방",
		PlayerCount:    2,
		TurnTimeoutSec: 60,
		HostUserID:     hostUserID,
	})
	require.NoError(t, err)

	finishedRoom, err := roomSvc.CreateRoom(&service.CreateRoomRequest{
		Name:           "종료된 방",
		PlayerCount:    2,
		TurnTimeoutSec: 60,
		HostUserID:     "other-host",
	})
	require.NoError(t, err)

	// finishedRoom을 FINISHED로 변경
	err = roomSvc.FinishRoom(finishedRoom.ID)
	require.NoError(t, err)

	// ListRooms: WAITING + PLAYING만 반환해야 함
	rooms, err := roomSvc.ListRooms()
	require.NoError(t, err)

	roomIDs := make(map[string]bool)
	for _, r := range rooms {
		roomIDs[r.ID] = true
	}

	assert.True(t, roomIDs[activeRoom.ID], "WAITING 방은 목록에 포함되어야 한다")
	assert.False(t, roomIDs[finishedRoom.ID], "FINISHED 방은 목록에서 제외되어야 한다")
}

