package handler

import (
	"context"
	"errors"
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

// --- 테스트용 Mock ---

// mockAIClientHandler 핸들러 패키지용 AI 클라이언트 목업
type mockAIClientHandler struct {
	generateMoveFunc func(ctx context.Context, req *client.MoveRequest) (*client.MoveResponse, error)
	healthCheckFunc  func(ctx context.Context) error
}

func (m *mockAIClientHandler) GenerateMove(ctx context.Context, req *client.MoveRequest) (*client.MoveResponse, error) {
	if m.generateMoveFunc != nil {
		return m.generateMoveFunc(ctx, req)
	}
	return &client.MoveResponse{
		Action: "draw",
		Metadata: client.MoveMetadata{
			ModelType: "mock",
			ModelName: "mock-model",
		},
	}, nil
}

func (m *mockAIClientHandler) HealthCheck(ctx context.Context) error {
	if m.healthCheckFunc != nil {
		return m.healthCheckFunc(ctx)
	}
	return nil
}

// mockGameService GameService 목업
type mockGameService struct {
	confirmTurnFunc func(gameID string, req *service.ConfirmRequest) (*service.GameActionResult, error)
	drawTileFunc    func(gameID string, seat int) (*service.GameActionResult, error)
	placeTilesFunc  func(gameID string, req *service.PlaceRequest) (*service.GameActionResult, error)
	resetTurnFunc   func(gameID string, seat int) (*service.GameActionResult, error)
	getStateFunc    func(gameID string, seat int) (*service.GameStateView, error)
}

func (m *mockGameService) ConfirmTurn(gameID string, req *service.ConfirmRequest) (*service.GameActionResult, error) {
	if m.confirmTurnFunc != nil {
		return m.confirmTurnFunc(gameID, req)
	}
	return nil, errors.New("not implemented")
}

func (m *mockGameService) DrawTile(gameID string, seat int) (*service.GameActionResult, error) {
	if m.drawTileFunc != nil {
		return m.drawTileFunc(gameID, seat)
	}
	return nil, errors.New("not implemented")
}

func (m *mockGameService) PlaceTiles(gameID string, req *service.PlaceRequest) (*service.GameActionResult, error) {
	if m.placeTilesFunc != nil {
		return m.placeTilesFunc(gameID, req)
	}
	return nil, errors.New("not implemented")
}

func (m *mockGameService) ResetTurn(gameID string, seat int) (*service.GameActionResult, error) {
	if m.resetTurnFunc != nil {
		return m.resetTurnFunc(gameID, seat)
	}
	return nil, errors.New("not implemented")
}

func (m *mockGameService) GetGameState(gameID string, seat int) (*service.GameStateView, error) {
	if m.getStateFunc != nil {
		return m.getStateFunc(gameID, seat)
	}
	return nil, errors.New("not implemented")
}

// --- 헬퍼 ---

// newAITestHandler AI 클라이언트와 mock 게임 서비스를 주입한 WSHandler를 생성한다.
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
	h := newAITestHandler(nil, &mockGameService{})
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

// TestHandleAITurn_ClientError_FallbackDraw AI 클라이언트 에러 시 강제 드로우로 폴백한다.
func TestHandleAITurn_ClientError_FallbackDraw(t *testing.T) {
	drawCalled := make(chan struct{}, 1)

	mockSvc := &mockGameService{
		drawTileFunc: func(gameID string, seat int) (*service.GameActionResult, error) {
			assert.Equal(t, "game-ai-err", gameID)
			assert.Equal(t, 1, seat)
			drawCalled <- struct{}{}
			return makeSuccessDrawResult(gameID), nil
		},
	}

	mockClient := &mockAIClientHandler{
		generateMoveFunc: func(_ context.Context, _ *client.MoveRequest) (*client.MoveResponse, error) {
			return nil, errors.New("ai-adapter connection refused")
		},
	}

	h := newAITestHandler(mockClient, mockSvc)
	hub := h.hub

	conn := &Connection{
		roomID: "room-err",
		userID: "human-user",
		seat:   0,
		send:   make(chan []byte, 32),
	}
	hub.Register(conn)

	state := makeAIGameState("game-ai-err", 1, "AI_OPENAI")
	player := &state.Players[1]

	h.handleAITurn("room-err", "game-ai-err", player, state)

	select {
	case <-drawCalled:
		// 정상: DrawTile이 호출됨
	case <-time.After(2 * time.Second):
		t.Fatal("AI 에러 시 DrawTile이 호출되어야 한다")
	}
}

// TestHandleAITurn_PlaceSuccess AI가 유효한 place 응답 반환 시 TURN_END + TURN_START 브로드캐스트.
func TestHandleAITurn_PlaceSuccess(t *testing.T) {
	confirmCalled := make(chan *service.ConfirmRequest, 1)

	mockSvc := &mockGameService{
		confirmTurnFunc: func(gameID string, req *service.ConfirmRequest) (*service.GameActionResult, error) {
			confirmCalled <- req
			return makeSuccessConfirmResult(gameID), nil
		},
	}

	mockClient := &mockAIClientHandler{
		generateMoveFunc: func(_ context.Context, _ *client.MoveRequest) (*client.MoveResponse, error) {
			return &client.MoveResponse{
				Action:        "place",
				TilesFromRack: []string{"B4a", "B5a", "B6a"},
				TableGroups: []client.TileGroup{
					{Tiles: []string{"B4a", "B5a", "B6a"}},
				},
			}, nil
		},
	}

	h := newAITestHandler(mockClient, mockSvc)
	hub := h.hub

	conn := &Connection{
		roomID: "room-place",
		userID: "human-user",
		seat:   0,
		send:   make(chan []byte, 32),
	}
	hub.Register(conn)

	state := makeAIGameState("game-place", 1, "AI_OPENAI")
	player := &state.Players[1]

	h.handleAITurn("room-place", "game-place", player, state)

	select {
	case req := <-confirmCalled:
		assert.Equal(t, 1, req.Seat)
		assert.Equal(t, []string{"B4a", "B5a", "B6a"}, req.TilesFromRack)
		assert.Len(t, req.TableGroups, 1)
	case <-time.After(2 * time.Second):
		t.Fatal("AI place 성공 시 ConfirmTurn이 호출되어야 한다")
	}
}

// TestHandleAITurn_PlaceFail_FallbackDraw AI 배치 검증 실패 시 DrawTile로 폴백한다.
func TestHandleAITurn_PlaceFail_FallbackDraw(t *testing.T) {
	drawCalled := make(chan struct{}, 1)

	mockSvc := &mockGameService{
		confirmTurnFunc: func(gameID string, req *service.ConfirmRequest) (*service.GameActionResult, error) {
			// 검증 실패 반환
			return &service.GameActionResult{
				Success:   false,
				ErrorCode: "INVALID_SET",
				GameState: makeAIGameState(gameID, 1, "AI_OPENAI"),
			}, errors.New("invalid set")
		},
		drawTileFunc: func(gameID string, seat int) (*service.GameActionResult, error) {
			assert.Equal(t, 1, seat)
			drawCalled <- struct{}{}
			return makeSuccessDrawResult(gameID), nil
		},
	}

	mockClient := &mockAIClientHandler{
		generateMoveFunc: func(_ context.Context, _ *client.MoveRequest) (*client.MoveResponse, error) {
			return &client.MoveResponse{
				Action:        "place",
				TilesFromRack: []string{"B4a"},
				TableGroups:   []client.TileGroup{{Tiles: []string{"B4a"}}},
			}, nil
		},
	}

	h := newAITestHandler(mockClient, mockSvc)
	hub := h.hub

	conn := &Connection{
		roomID: "room-fail",
		userID: "human-user",
		seat:   0,
		send:   make(chan []byte, 32),
	}
	hub.Register(conn)

	state := makeAIGameState("game-fail", 1, "AI_OPENAI")
	player := &state.Players[1]

	h.handleAITurn("room-fail", "game-fail", player, state)

	select {
	case <-drawCalled:
		// 정상: 배치 실패 후 DrawTile 폴백
	case <-time.After(2 * time.Second):
		t.Fatal("AI place 실패 시 DrawTile 폴백이 호출되어야 한다")
	}
}

// TestHandleAITurn_GameOver AI 턴에서 게임 종료 시 GAME_OVER 브로드캐스트.
func TestHandleAITurn_GameOver(t *testing.T) {
	confirmCalled := make(chan struct{}, 1)

	mockSvc := &mockGameService{
		confirmTurnFunc: func(gameID string, req *service.ConfirmRequest) (*service.GameActionResult, error) {
			confirmCalled <- struct{}{}
			// 게임 종료 결과
			state := makeAIGameState(gameID, 1, "AI_OPENAI")
			state.Players[1].Rack = []string{} // AI가 승리
			return &service.GameActionResult{
				Success:   true,
				GameEnded: true,
				WinnerID:  "ai-user",
				GameState: state,
			}, nil
		},
	}

	mockClient := &mockAIClientHandler{
		generateMoveFunc: func(_ context.Context, _ *client.MoveRequest) (*client.MoveResponse, error) {
			return &client.MoveResponse{
				Action:        "place",
				TilesFromRack: []string{"B4a", "B5a", "B6a"},
				TableGroups:   []client.TileGroup{{Tiles: []string{"B4a", "B5a", "B6a"}}},
			}, nil
		},
	}

	h := newAITestHandler(mockClient, mockSvc)
	hub := h.hub

	conn := &Connection{
		roomID: "room-gameover",
		userID: "human-user",
		seat:   0,
		send:   make(chan []byte, 32),
	}
	hub.Register(conn)

	state := makeAIGameState("game-gameover", 1, "AI_OPENAI")
	player := &state.Players[1]

	h.handleAITurn("room-gameover", "game-gameover", player, state)

	select {
	case <-confirmCalled:
		// 정상: ConfirmTurn 호출됨
	case <-time.After(2 * time.Second):
		t.Fatal("게임 종료 시 ConfirmTurn이 호출되어야 한다")
	}

	// GAME_OVER 메시지가 브로드캐스트되었는지 확인
	time.Sleep(50 * time.Millisecond)
	received := len(conn.send) > 0
	assert.True(t, received, "GAME_OVER 메시지가 브로드캐스트되어야 한다")
}

// TestPlayerTypeToModel PlayerType → ai-adapter model 변환 확인
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

// TestBuildTableGroups SetOnTable → client.TileGroup 변환 확인
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

// TestForceAIDraw_DrawPileEmpty 드로우 파일 소진 시 GAME_OVER를 브로드캐스트한다.
func TestForceAIDraw_DrawPileEmpty(t *testing.T) {
	mockSvc := &mockGameService{
		drawTileFunc: func(gameID string, seat int) (*service.GameActionResult, error) {
			// 드로우 파일 소진 시 게임 종료
			state := makeAIGameState(gameID, 1, "AI_OPENAI")
			state.DrawPile = []string{}
			return &service.GameActionResult{
				Success:   false,
				GameEnded: true,
				GameState: state,
			}, nil
		},
	}

	h := newAITestHandler(nil, mockSvc)
	hub := h.hub

	conn := &Connection{
		roomID: "room-empty",
		userID: "human-user",
		seat:   0,
		send:   make(chan []byte, 32),
	}
	hub.Register(conn)

	h.forceAIDraw("room-empty", "game-empty", 1)

	time.Sleep(50 * time.Millisecond)
	// GAME_OVER 브로드캐스트 확인
	assert.Greater(t, len(conn.send), 0, "드로우 파일 소진 시 GAME_OVER 메시지가 전송되어야 한다")
}
