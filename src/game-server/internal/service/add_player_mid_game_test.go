package service

import (
	"testing"

	"github.com/k82022603/RummiArena/game-server/internal/model"
	"github.com/k82022603/RummiArena/game-server/internal/repository"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

// buildDrawPile 지정 장수의 더미 타일 코드를 생성한다.
func buildDrawPile(n int) []string {
	colors := []string{"R", "B", "Y", "K"}
	pile := make([]string, 0, n)
	for i := 0; i < n; i++ {
		c := colors[i%4]
		num := (i % 13) + 1
		set := "a"
		if i >= 52 {
			set = "b"
		}
		pile = append(pile, c+itoa(num)+set)
	}
	return pile
}

func itoa(n int) string {
	return []string{"1", "2", "3", "4", "5", "6", "7", "8", "9", "10", "11", "12", "13"}[n-1]
}

func newGameSvcWithState(t *testing.T, state *model.GameStateRedis) (GameService, repository.MemoryGameStateRepository) {
	t.Helper()
	repo := repository.NewMemoryGameStateRepo()
	require.NoError(t, repo.SaveGameState(state))
	svc := NewGameService(repo)
	return svc, repo
}

// ============================================================
// I3: AddPlayerMidGame 테스트
// ============================================================

// TestAddPlayerMidGame_HappyPath 기본 성공 경로: DrawPile에서 14장 배분, 총합 불변.
func TestAddPlayerMidGame_HappyPath(t *testing.T) {
	drawPile := buildDrawPile(40) // 40장 드로우 파일
	state := newTestGameState("game-mid-1",
		twoPlayerState([]string{"R1a", "R2a"}, []string{"B1a", "B2a"}),
		drawPile,
	)
	totalBefore := len(state.Players[0].Rack) + len(state.Players[1].Rack) + len(state.DrawPile) // 2+2+40=44

	svc, repo := newGameSvcWithState(t, state)

	newPlayer := model.RoomPlayer{
		Seat:        2,
		UserID:      "user-new",
		DisplayName: "신규 플레이어",
		Type:        "HUMAN",
	}

	err := svc.AddPlayerMidGame("game-mid-1", newPlayer)
	require.NoError(t, err)

	saved, err := repo.GetGameState("game-mid-1")
	require.NoError(t, err)

	// Players에 추가됐는지
	require.Len(t, saved.Players, 3, "Players에 새 플레이어 추가")

	// 새 플레이어 seat 확인
	var newP *model.PlayerState
	for i := range saved.Players {
		if saved.Players[i].UserID == "user-new" {
			newP = &saved.Players[i]
			break
		}
	}
	require.NotNil(t, newP, "새 플레이어가 Players에 있어야 한다")
	assert.Equal(t, 2, newP.SeatOrder)
	assert.Len(t, newP.Rack, 14, "랙에 14장 배분")
	assert.False(t, newP.HasInitialMeld, "최초 등록 완료 여부는 false여야 한다")
	assert.Equal(t, model.PlayerStatusActive, newP.Status)

	// DrawPile 14장 감소 확인
	assert.Len(t, saved.DrawPile, 26, "DrawPile이 14장 줄어야 한다")

	// 타일 총합 불변 (D-05)
	totalAfter := len(saved.Players[0].Rack) + len(saved.Players[1].Rack) + len(newP.Rack) + len(saved.DrawPile)
	assert.Equal(t, totalBefore, totalAfter, "D-05: 타일 총합 불변")
}

// TestAddPlayerMidGame_DrawPileTooSmall DrawPile < 14장이면 에러 반환.
func TestAddPlayerMidGame_DrawPileTooSmall(t *testing.T) {
	drawPile := buildDrawPile(10) // 10장 — 부족
	state := newTestGameState("game-mid-2",
		twoPlayerState([]string{"R1a"}, []string{"B1a"}),
		drawPile,
	)
	svc, _ := newGameSvcWithState(t, state)

	err := svc.AddPlayerMidGame("game-mid-2", model.RoomPlayer{
		Seat:   2,
		UserID: "user-too-late",
		Type:   "HUMAN",
	})
	require.Error(t, err)
	se, ok := IsServiceError(err)
	require.True(t, ok)
	assert.Equal(t, "DRAW_PILE_TOO_SMALL", se.Code)
	assert.Equal(t, 409, se.Status)
}

// TestAddPlayerMidGame_GameNotFound 존재하지 않는 게임이면 NOT_FOUND.
func TestAddPlayerMidGame_GameNotFound(t *testing.T) {
	repo := repository.NewMemoryGameStateRepo()
	svc := NewGameService(repo)

	err := svc.AddPlayerMidGame("nonexistent-game", model.RoomPlayer{
		Seat:   0,
		UserID: "user-x",
		Type:   "HUMAN",
	})
	require.Error(t, err)
	se, ok := IsServiceError(err)
	require.True(t, ok)
	assert.Equal(t, "NOT_FOUND", se.Code)
}

// TestAddPlayerMidGame_GameNotPlaying PLAYING 상태가 아니면 GAME_NOT_PLAYING.
func TestAddPlayerMidGame_GameNotPlaying(t *testing.T) {
	drawPile := buildDrawPile(20)
	state := newTestGameState("game-mid-3",
		twoPlayerState([]string{"R1a"}, []string{"B1a"}),
		drawPile,
	)
	state.Status = model.GameStatusFinished // FINISHED 상태로 설정

	svc, _ := newGameSvcWithState(t, state)

	err := svc.AddPlayerMidGame("game-mid-3", model.RoomPlayer{
		Seat:   2,
		UserID: "user-y",
		Type:   "HUMAN",
	})
	require.Error(t, err)
	se, ok := IsServiceError(err)
	require.True(t, ok)
	assert.Equal(t, "GAME_NOT_PLAYING", se.Code)
}

// TestAddPlayerMidGame_DuplicateUserID 같은 UserID로 두 번 추가하면 ALREADY_IN_GAME.
func TestAddPlayerMidGame_DuplicateUserID(t *testing.T) {
	drawPile := buildDrawPile(40)
	state := newTestGameState("game-mid-4",
		twoPlayerState([]string{"R1a"}, []string{"B1a"}),
		drawPile,
	)
	svc, _ := newGameSvcWithState(t, state)

	// 첫 번째 추가 성공
	err := svc.AddPlayerMidGame("game-mid-4", model.RoomPlayer{
		Seat:   2,
		UserID: "user-dup",
		Type:   "HUMAN",
	})
	require.NoError(t, err)

	// 두 번째: 같은 UserID
	err = svc.AddPlayerMidGame("game-mid-4", model.RoomPlayer{
		Seat:   3,
		UserID: "user-dup",
		Type:   "HUMAN",
	})
	require.Error(t, err)
	se, ok := IsServiceError(err)
	require.True(t, ok)
	assert.Equal(t, "ALREADY_IN_GAME", se.Code)
}

// TestAddPlayerMidGame_DuplicateSeat 같은 seat에 두 번 추가하면 SEAT_OCCUPIED.
func TestAddPlayerMidGame_DuplicateSeat(t *testing.T) {
	drawPile := buildDrawPile(40)
	state := newTestGameState("game-mid-5",
		twoPlayerState([]string{"R1a"}, []string{"B1a"}),
		drawPile,
	)
	svc, _ := newGameSvcWithState(t, state)

	// seat 2에 첫 번째 추가
	err := svc.AddPlayerMidGame("game-mid-5", model.RoomPlayer{
		Seat:   2,
		UserID: "user-seat-a",
		Type:   "HUMAN",
	})
	require.NoError(t, err)

	// seat 2에 두 번째 추가 시도
	err = svc.AddPlayerMidGame("game-mid-5", model.RoomPlayer{
		Seat:   2,
		UserID: "user-seat-b",
		Type:   "HUMAN",
	})
	require.Error(t, err)
	se, ok := IsServiceError(err)
	require.True(t, ok)
	assert.Equal(t, "SEAT_OCCUPIED", se.Code)
}

// ============================================================
// I3: JoinRoom PLAYING 방 참가 통합 테스트
// ============================================================

// TestJoinRoom_AllowsPlayingRoomWithEmptySeat PLAYING 방에 빈 석이 있으면 참가 허용.
func TestJoinRoom_AllowsPlayingRoomWithEmptySeat(t *testing.T) {
	svc := newRoomService(t)

	// 3인 방 생성 (seat 0: 호스트, seat 1: EMPTY, seat 2: EMPTY)
	room, err := svc.CreateRoom(&CreateRoomRequest{
		Name:           "4인 대기방",
		PlayerCount:    3,
		TurnTimeoutSec: 60,
		HostUserID:     "host-playing",
	})
	require.NoError(t, err)

	// 게스트 1 참가
	err = svc.JoinRoom(room.ID, "guest-1", "게스트1")
	require.NoError(t, err)

	// 게임 시작 (host + guest-1, seat 2는 EMPTY)
	_, err = svc.StartGame(room.ID, "host-playing")
	require.NoError(t, err)

	// 방 상태 확인: PLAYING + seat 2는 EMPTY
	updatedRoom, err := svc.GetRoom(room.ID)
	require.NoError(t, err)
	assert.Equal(t, model.RoomStatusPlaying, updatedRoom.Status)

	// 신규 플레이어 mid-game 참가
	err = svc.JoinRoom(room.ID, "latecomer", "늦게온사람")
	require.NoError(t, err, "PLAYING 방에 빈 석이 있으면 참가를 허용해야 한다")

	// 방 상태 재확인: seat이 CONNECTED로 변경
	finalRoom, err := svc.GetRoom(room.ID)
	require.NoError(t, err)
	found := false
	for _, p := range finalRoom.Players {
		if p.UserID == "latecomer" {
			assert.Equal(t, model.SeatStatusConnected, p.Status)
			found = true
			break
		}
	}
	assert.True(t, found, "늦게온사람이 방 Players에 있어야 한다")
}

// TestJoinRoom_RejectsPlayingRoomWhenFull PLAYING 방에 빈 석이 없으면 ROOM_FULL.
func TestJoinRoom_RejectsPlayingRoomWhenFull(t *testing.T) {
	svc := newRoomService(t)

	// 2인 방: seat 0=호스트, seat 1=게스트
	room, err := svc.CreateRoom(&CreateRoomRequest{
		Name:           "꽉찬방",
		PlayerCount:    2,
		TurnTimeoutSec: 60,
		HostUserID:     "host-full",
	})
	require.NoError(t, err)

	err = svc.JoinRoom(room.ID, "guest-full", "게스트")
	require.NoError(t, err)

	_, err = svc.StartGame(room.ID, "host-full")
	require.NoError(t, err)

	// 이미 꽉 찬 PLAYING 방에 추가 참가 시도
	err = svc.JoinRoom(room.ID, "latecoming-loser", "늦게온사람")
	require.Error(t, err)
	se, ok := IsServiceError(err)
	require.True(t, ok)
	assert.Equal(t, "ROOM_FULL", se.Code)
}

// TestJoinRoom_RejectsFinishedRoom FINISHED 방에는 참가 불가.
func TestJoinRoom_RejectsFinishedRoom(t *testing.T) {
	svc := newRoomService(t)

	room, err := svc.CreateRoom(&CreateRoomRequest{
		Name:           "종료방",
		PlayerCount:    3,
		TurnTimeoutSec: 60,
		HostUserID:     "host-fin",
	})
	require.NoError(t, err)

	err = svc.JoinRoom(room.ID, "guest-fin", "게스트")
	require.NoError(t, err)

	_, err = svc.StartGame(room.ID, "host-fin")
	require.NoError(t, err)

	err = svc.FinishRoom(room.ID)
	require.NoError(t, err)

	err = svc.JoinRoom(room.ID, "too-late", "너무늦음")
	require.Error(t, err)
	se, ok := IsServiceError(err)
	require.True(t, ok)
	assert.Equal(t, "GAME_ALREADY_STARTED", se.Code)
}

// TestJoinRoom_PlayingRoom_DrawPileSmall DrawPile < 14이면 게임 참가 실패 + Room seat 롤백.
func TestJoinRoom_PlayingRoom_DrawPileSmall(t *testing.T) {
	// roomService 내부 gameState를 직접 조작하려면 레포를 공유해야 한다.
	// 방을 시작하고 gameRepo에서 DrawPile을 비워두는 방식으로 테스트한다.
	roomRepo := repository.NewMemoryRoomRepo()
	gameRepo := repository.NewMemoryGameStateRepo()
	svc := NewRoomService(roomRepo, gameRepo, nil)

	room, err := svc.CreateRoom(&CreateRoomRequest{
		Name:           "DrawPile 부족 방",
		PlayerCount:    3,
		TurnTimeoutSec: 60,
		HostUserID:     "host-dp",
	})
	require.NoError(t, err)

	err = svc.JoinRoom(room.ID, "guest-dp", "게스트")
	require.NoError(t, err)

	gameState, err := svc.StartGame(room.ID, "host-dp")
	require.NoError(t, err)

	// DrawPile을 5장만 남긴다 (14장 미만)
	savedGame, err := gameRepo.GetGameState(gameState.GameID)
	require.NoError(t, err)
	savedGame.DrawPile = savedGame.DrawPile[:5]
	require.NoError(t, gameRepo.SaveGameState(savedGame))

	// 참가 시도 → DRAW_PILE_TOO_SMALL
	err = svc.JoinRoom(room.ID, "late-dp", "늦게온사람")
	require.Error(t, err)
	se, ok := IsServiceError(err)
	require.True(t, ok)
	assert.Equal(t, "DRAW_PILE_TOO_SMALL", se.Code)

	// Room seat이 롤백됐는지 확인
	finalRoom, err := svc.GetRoom(room.ID)
	require.NoError(t, err)
	for _, p := range finalRoom.Players {
		assert.NotEqual(t, "late-dp", p.UserID, "참가 실패 후 seat 롤백: late-dp가 있으면 안 된다")
	}
}
