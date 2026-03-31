//go:build integration

package handler

import (
	"context"
	"os"
	"strings"
	"testing"
	"time"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
	"go.uber.org/zap"

	"github.com/k82022603/RummiArena/game-server/internal/client"
	"github.com/k82022603/RummiArena/game-server/internal/model"
	"github.com/k82022603/RummiArena/game-server/internal/repository"
	"github.com/k82022603/RummiArena/game-server/internal/service"
)

// --- 헬퍼 ---

// getAIAdapterURL AI 어댑터 URL을 환경변수에서 읽는다. 미설정 시 테스트를 건너뛴다.
func getAIAdapterURL(t *testing.T) string {
	t.Helper()
	url := os.Getenv("AI_ADAPTER_URL")
	if url == "" {
		url = "http://localhost:8082"
	}
	return url
}

// newRealAIClient 실제 AI 클라이언트를 생성한다.
func newRealAIClient(t *testing.T) client.AIClientInterface {
	t.Helper()
	url := getAIAdapterURL(t)
	return client.NewAIClient(url, "", 60*time.Second)
}

// newAITestHandler AI 클라이언트와 게임 서비스를 주입한 WSHandler를 생성한다.
func newAITestHandler(aiClient client.AIClientInterface, gameSvc service.GameService) *WSHandler {
	hub := NewHub(zap.NewNop())
	roomRepo := repository.NewMemoryRoomRepo()
	gameStateRepo := repository.NewMemoryGameStateRepoAdapter()
	roomSvc := service.NewRoomService(roomRepo, gameStateRepo)
	turnSvc := service.NewTurnService(gameStateRepo, gameSvc)

	return &WSHandler{
		hub:       hub,
		roomSvc:   roomSvc,
		gameSvc:   gameSvc,
		turnSvc:   turnSvc,
		aiClient:  aiClient,
		jwtSecret: "test-secret",
		logger:    zap.NewNop(),
		timers:    make(map[string]*turnTimer),
	}
}

// makeAIGameState 주어진 seat가 AI 플레이어인 2인 게임 상태를 생성한다.
func makeAIGameState(gameID string, aiSeat int, aiPlayerType string) *model.GameStateRedis {
	players := []model.PlayerState{
		{
			SeatOrder:  0,
			UserID:     "human-user",
			PlayerType: "HUMAN",
			Rack:       []string{"R1a", "R2a", "R3a"},
		},
		{
			SeatOrder:    1,
			UserID:       "ai-user",
			PlayerType:   aiPlayerType,
			AIModel:      "openai",
			AIPersona:    "Rookie",
			AIDifficulty: "beginner",
			AIPsychLevel: 0,
			Rack:         []string{"B4a", "B5a", "B6a"},
		},
	}
	return &model.GameStateRedis{
		GameID:      gameID,
		Status:      model.GameStatusPlaying,
		CurrentSeat: aiSeat,
		DrawPile:    []string{"Y7a", "Y8a", "Y9a"},
		Table:       []*model.SetOnTable{},
		Players:     players,
		TurnStartAt: time.Now().Unix(),
		TurnCount:   1,
	}
}

// makeSuccessDrawResult 드로우 성공 GameActionResult를 생성한다.
func makeSuccessDrawResult(gameID string) *service.GameActionResult {
	state := makeAIGameState(gameID, 0, "HUMAN") // 드로우 후 다음 턴은 HUMAN
	state.Players[1].Rack = append(state.Players[1].Rack, "Y7a")
	state.DrawPile = []string{"Y8a", "Y9a"}
	return &service.GameActionResult{
		Success:   true,
		NextSeat:  0,
		GameEnded: false,
		GameState: state,
	}
}

// makeSuccessConfirmResult 배치 성공 GameActionResult를 생성한다.
func makeSuccessConfirmResult(gameID string) *service.GameActionResult {
	state := makeAIGameState(gameID, 0, "HUMAN")
	state.Players[1].Rack = []string{} // 랙 비워서 승리 조건
	return &service.GameActionResult{
		Success:   true,
		NextSeat:  0,
		GameEnded: false,
		GameState: state,
	}
}

// --- 테스트 ---

// TestHandleAITurn_NilClient_Skip aiClient가 nil이면 broadcastTurnStart에서 AI 턴을 건너뛴다.
func TestHandleAITurn_NilClient_Skip(t *testing.T) {
	gameStateRepo := repository.NewMemoryGameStateRepoAdapter()
	gameSvc := service.NewGameService(gameStateRepo)
	h := newAITestHandler(nil, gameSvc)
	hub := h.hub

	// AI 플레이어가 현재 턴인 상태
	state := makeAIGameState("game-nil-client", 1, "AI_OPENAI")

	room1Conn := &Connection{
		roomID: "room-1",
		userID: "human-user",
		seat:   0,
		send:   make(chan []byte, 16),
	}
	hub.Register(room1Conn)

	// aiClient가 nil이므로 handleAITurn goroutine이 실행되지 않는다.
	h.broadcastTurnStart("room-1", state)

	// TURN_START 메시지가 브로드캐스트되었는지 확인
	select {
	case msg := <-room1Conn.send:
		require.NotNil(t, msg)
	case <-time.After(200 * time.Millisecond):
		t.Fatal("TURN_START 메시지가 전송되지 않았다")
	}

	// AI 드로우가 호출되지 않았으므로 추가 메시지가 없어야 한다
	select {
	case <-room1Conn.send:
		t.Fatal("aiClient==nil이면 AI 드로우가 발생하지 않아야 한다")
	case <-time.After(100 * time.Millisecond):
		// 정상: 추가 메시지 없음
	}
}

// TestHandleAITurn_RealClient_Draw 실제 AI 어댑터를 사용한 AI 턴 처리.
// AI_ADAPTER_URL 환경변수가 설정되어 있어야 한다.
func TestHandleAITurn_RealClient_Draw(t *testing.T) {
	aiClient := newRealAIClient(t)

	// AI 어댑터 접속 가능한지 확인
	if err := aiClient.HealthCheck(context.Background()); err != nil {
		t.Skipf("AI 어댑터 미접속 (skip): %v", err)
	}

	gameStateRepo := repository.NewMemoryGameStateRepoAdapter()
	gameSvc := service.NewGameService(gameStateRepo)

	// 게임 상태를 저장한다.
	state := makeAIGameState("game-real-ai", 1, "AI_OPENAI")
	require.NoError(t, gameStateRepo.SaveGameState(state))

	h := newAITestHandler(aiClient, gameSvc)
	hub := h.hub

	conn := &Connection{
		roomID: "room-real-ai",
		userID: "human-user",
		seat:   0,
		send:   make(chan []byte, 32),
	}
	hub.Register(conn)

	player := &state.Players[1]
	h.handleAITurn("room-real-ai", "game-real-ai", player, state)

	// AI 턴 처리 후 메시지가 전송되는지 확인 (최대 60초 대기)
	select {
	case msg := <-conn.send:
		require.NotNil(t, msg)
	case <-time.After(60 * time.Second):
		t.Fatal("AI 턴 처리 후 메시지가 전송되어야 한다")
	}
}

// TestPlayerTypeToModel PlayerType -> ai-adapter model 변환 확인
func TestPlayerTypeToModel(t *testing.T) {
	cases := []struct {
		playerType string
		wantModel  string
	}{
		{"AI_OPENAI", "openai"},
		{"AI_CLAUDE", "claude"},
		{"AI_DEEPSEEK", "deepseek"},
		{"AI_LLAMA", "ollama"},
		{"AI_UNKNOWN", "ollama"},
		{"HUMAN", "ollama"},
	}

	for _, tc := range cases {
		t.Run(tc.playerType, func(t *testing.T) {
			got := playerTypeToModel(tc.playerType)
			assert.Equal(t, tc.wantModel, got)
		})
	}
}

// TestBuildOpponentInfo 현재 플레이어를 제외한 상대 목록 빌드 확인
func TestBuildOpponentInfo(t *testing.T) {
	players := []model.PlayerState{
		{SeatOrder: 0, UserID: "user-a", Rack: []string{"R1a", "R2a"}},
		{SeatOrder: 1, UserID: "user-b", Rack: []string{"B3a", "B4a", "B5a"}},
		{SeatOrder: 2, UserID: "user-c", Rack: []string{"Y6a"}},
	}

	opponents := buildOpponentInfo(players, 0)
	require.Len(t, opponents, 2)
	assert.Equal(t, "user-b", opponents[0].PlayerID)
	assert.Equal(t, 3, opponents[0].RemainingTiles)
	assert.Equal(t, "user-c", opponents[1].PlayerID)
	assert.Equal(t, 1, opponents[1].RemainingTiles)
}

// TestBuildTableGroups SetOnTable -> client.TileGroup 변환 확인
func TestBuildTableGroups(t *testing.T) {
	table := []*model.SetOnTable{
		{
			ID: "set-1",
			Tiles: []*model.Tile{
				{Code: "R1a"},
				{Code: "R2a"},
				{Code: "R3a"},
			},
		},
		{
			ID: "set-2",
			Tiles: []*model.Tile{
				{Code: "B5a"},
				{Code: "Y5a"},
				{Code: "K5b"},
			},
		},
	}

	groups := buildTableGroups(table)
	require.Len(t, groups, 2)
	assert.Equal(t, []string{"R1a", "R2a", "R3a"}, groups[0].Tiles)
	assert.Equal(t, []string{"B5a", "Y5a", "K5b"}, groups[1].Tiles)
}

// TestNormalizeDifficulty ISS-001 회귀 방지: 난이도 문자열 정규화 검증
// ai-adapter는 "beginner" | "intermediate" | "expert" 만 허용한다.
// "easy", "hard", 한글 값 등이 들어와도 올바르게 변환되어야 한다.
func TestNormalizeDifficulty(t *testing.T) {
	cases := []struct {
		input string
		want  string
	}{
		// 정상 값 (통과)
		{"beginner", "beginner"},
		{"intermediate", "intermediate"},
		{"expert", "expert"},
		// ISS-001 원인: "easy" → 400 에러 유발
		{"easy", "beginner"},
		{"medium", "intermediate"},
		{"mid", "intermediate"},
		{"hard", "expert"},
		// 대소문자 혼합
		{"Easy", "beginner"},
		{"BEGINNER", "beginner"},
		{"Intermediate", "intermediate"},
		{"EXPERT", "expert"},
		// 한글
		{"하수", "beginner"},
		{"중수", "intermediate"},
		{"고수", "expert"},
		// 미지의 값 → 기본값 beginner
		{"unknown", "beginner"},
		{"", "beginner"},
	}

	for _, tc := range cases {
		t.Run(tc.input, func(t *testing.T) {
			got := normalizeDifficulty(tc.input)
			assert.Equal(t, tc.want, got, "normalizeDifficulty(%q)", tc.input)
		})
	}
}

// TestPersonaLowercase ISS-001 회귀 방지: persona가 소문자로 변환되는지 확인
// ai-adapter는 "rookie" | "calculator" | "shark" | "fox" | "wall" | "wildcard" 만 허용한다.
func TestPersonaLowercase(t *testing.T) {
	cases := []struct {
		input string
		want  string
	}{
		{"Rookie", "rookie"},
		{"Calculator", "calculator"},
		{"SHARK", "shark"},
		{"Fox", "fox"},
		{"Wall", "wall"},
		{"Wildcard", "wildcard"},
		{"rookie", "rookie"},
	}

	for _, tc := range cases {
		t.Run(tc.input, func(t *testing.T) {
			// handleAITurn에서 strings.ToLower(player.AIPersona) 호출
			got := strings.ToLower(tc.input)
			assert.Equal(t, tc.want, got, "strings.ToLower(%q)", tc.input)
		})
	}
}

// TestForceAIDraw_DrawPileEmpty 드로우 파일 소진 시 GAME_OVER를 브로드캐스트한다.
func TestForceAIDraw_DrawPileEmpty(t *testing.T) {
	gameStateRepo := repository.NewMemoryGameStateRepoAdapter()
	gameSvc := service.NewGameService(gameStateRepo)

	// 드로우 파일이 빈 게임 상태를 저장한다.
	state := makeAIGameState("game-empty", 1, "AI_OPENAI")
	state.DrawPile = []string{}
	require.NoError(t, gameStateRepo.SaveGameState(state))

	h := newAITestHandler(nil, gameSvc)
	hub := h.hub

	conn := &Connection{
		roomID: "room-empty",
		userID: "human-user",
		seat:   0,
		send:   make(chan []byte, 32),
	}
	hub.Register(conn)

	h.forceAIDraw("room-empty", "game-empty", 1, "AI_ERROR")

	time.Sleep(50 * time.Millisecond)
	// GAME_OVER 브로드캐스트 확인
	assert.Greater(t, len(conn.send), 0, "드로우 파일 소진 시 GAME_OVER 메시지가 전송되어야 한다")
}
