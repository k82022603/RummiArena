// Package e2e contains end-to-end integration tests for the game-server.
// Tests use httptest.NewServer with a real gin router and in-memory repositories.
// AI 클라이언트 의존 테스트는 AI_ADAPTER_URL 환경변수가 설정되어 있을 때만 실행한다.
package e2e

import (
	"bytes"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"os"
	"testing"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/golang-jwt/jwt/v5"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
	"go.uber.org/zap"

	"github.com/k82022603/RummiArena/game-server/internal/client"
	"github.com/k82022603/RummiArena/game-server/internal/handler"
	"github.com/k82022603/RummiArena/game-server/internal/middleware"
	"github.com/k82022603/RummiArena/game-server/internal/repository"
	"github.com/k82022603/RummiArena/game-server/internal/service"
)

const (
	e2eJWTSecret = "e2e-test-jwt-secret-2026"
	hostUserID   = "host-user-e2e-001"
	guestUserID  = "guest-user-e2e-002"
)

// buildTestRouter E2E 테스트용 gin 라우터를 구성한다.
// 인메모리 레포지터리를 사용하며 DB/Redis 의존성이 없다.
// AI_ADAPTER_URL이 설정되어 있으면 실제 AI 클라이언트를, 아니면 nil을 사용한다.
// APP_ENV=dev 조건을 직접 제어하여 dev-login 엔드포인트를 노출한다.
func buildTestRouter(t *testing.T, appEnv string) *gin.Engine {
	t.Helper()

	gin.SetMode(gin.TestMode)
	logger := zap.NewNop()

	gameStateRepo := repository.NewMemoryGameStateRepoAdapter()
	roomRepo := repository.NewMemoryRoomRepo()

	roomSvc := service.NewRoomService(roomRepo, gameStateRepo)
	gameSvc := service.NewGameService(gameStateRepo)
	turnSvc := service.NewTurnService(gameStateRepo, gameSvc)

	// AI 클라이언트: AI_ADAPTER_URL이 설정되어 있으면 실제 클라이언트를 사용한다.
	var aiClient client.AIClientInterface
	if aiURL := os.Getenv("AI_ADAPTER_URL"); aiURL != "" {
		aiClient = client.NewAIClient(aiURL, "", 60*time.Second)
	}

	wsHub := handler.NewHub(logger)

	roomHandler := handler.NewRoomHandler(roomSvc)
	gameHandler := handler.NewGameHandler(gameSvc)
	wsHandler := handler.NewWSHandler(wsHub, roomSvc, gameSvc, turnSvc, aiClient, e2eJWTSecret, logger, 240)
	authHandler := handler.NewAuthHandler(e2eJWTSecret)

	router := gin.New()
	router.Use(gin.Recovery())

	router.GET("/health", func(c *gin.Context) {
		c.JSON(http.StatusOK, gin.H{"status": "ok"})
	})
	router.GET("/ws", wsHandler.HandleWS)

	api := router.Group("/api")

	if appEnv == "dev" {
		auth := api.Group("/auth")
		auth.POST("/dev-login", authHandler.DevLogin)
	}

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
		games.POST("/:id/reset", gameHandler.ResetTurn)
	}

	return router
}

// issueDevToken dev-login 없이 테스트용 JWT를 직접 발급한다.
func issueDevToken(t *testing.T, userID string) string {
	t.Helper()
	now := time.Now()
	claims := &middleware.Claims{
		UserID: userID,
		Email:  userID + "@dev.local",
		RegisteredClaims: jwt.RegisteredClaims{
			ExpiresAt: jwt.NewNumericDate(now.Add(24 * time.Hour)),
			IssuedAt:  jwt.NewNumericDate(now),
		},
	}
	token := jwt.NewWithClaims(jwt.SigningMethodHS256, claims)
	tokenStr, err := token.SignedString([]byte(e2eJWTSecret))
	require.NoError(t, err)
	return tokenStr
}

// doRequest HTTP 요청을 전송하고 응답을 반환하는 헬퍼 함수
func doRequest(t *testing.T, srv *httptest.Server, method, path, token string, body interface{}) *http.Response {
	t.Helper()

	var bodyBuf *bytes.Buffer
	if body != nil {
		b, err := json.Marshal(body)
		require.NoError(t, err)
		bodyBuf = bytes.NewBuffer(b)
	} else {
		bodyBuf = bytes.NewBuffer(nil)
	}

	req, err := http.NewRequest(method, srv.URL+path, bodyBuf)
	require.NoError(t, err)
	req.Header.Set("Content-Type", "application/json")
	if token != "" {
		req.Header.Set("Authorization", "Bearer "+token)
	}

	resp, err := http.DefaultClient.Do(req)
	require.NoError(t, err)
	return resp
}

// decodeJSON 응답 바디를 map으로 디코딩하는 헬퍼 함수
func decodeJSON(t *testing.T, resp *http.Response) map[string]interface{} {
	t.Helper()
	defer resp.Body.Close() //nolint:errcheck
	var result map[string]interface{}
	require.NoError(t, json.NewDecoder(resp.Body).Decode(&result))
	return result
}

// TestMain E2E 테스트 환경 초기화
func TestMain(m *testing.M) {
	gin.SetMode(gin.TestMode)
	os.Exit(m.Run())
}

// TestFullGameFlow 전체 게임 흐름 E2E 테스트
//
// 1. dev-login -> JWT 발급
// 2. POST /api/rooms -> 방 생성 (playerCount=2, turnTimeoutSec=60)
// 3. POST /api/rooms/:id/join -> 두 번째 플레이어 참여
// 4. POST /api/rooms/:id/start -> 게임 시작
// 5. GET /api/rooms/:id -> 게임 상태 확인 (status=PLAYING)
func TestFullGameFlow(t *testing.T) {
	router := buildTestRouter(t, "dev")
	srv := httptest.NewServer(router)
	defer srv.Close()

	// Step 1: dev-login으로 호스트 JWT 발급
	loginResp := doRequest(t, srv, http.MethodPost, "/api/auth/dev-login", "", map[string]string{
		"userId":      hostUserID,
		"displayName": "호스트플레이어",
	})
	require.Equal(t, http.StatusOK, loginResp.StatusCode, "dev-login이 성공해야 한다")
	loginBody := decodeJSON(t, loginResp)
	hostToken, ok := loginBody["token"].(string)
	require.True(t, ok, "token 필드가 string이어야 한다")
	require.NotEmpty(t, hostToken, "JWT 토큰이 비어있지 않아야 한다")
	assert.Equal(t, hostUserID, loginBody["userId"])

	// Step 2: 방 생성
	createRoomResp := doRequest(t, srv, http.MethodPost, "/api/rooms", hostToken, map[string]interface{}{
		"name":           "E2E 테스트 방",
		"playerCount":    2,
		"turnTimeoutSec": 60,
	})
	require.Equal(t, http.StatusCreated, createRoomResp.StatusCode, "방 생성이 성공해야 한다")
	roomBody := decodeJSON(t, createRoomResp)
	roomID, ok := roomBody["id"].(string)
	require.True(t, ok, "room id가 string이어야 한다")
	require.NotEmpty(t, roomID)
	assert.Equal(t, "WAITING", roomBody["status"])
	assert.Equal(t, hostUserID, roomBody["hostUserId"])
	// playerCount는 현재 참가 중인 플레이어 수(호스트 1명)를 반환한다.
	// 최대 플레이어 수는 settings.playerCount 에서 확인한다.
	assert.Equal(t, float64(1), roomBody["playerCount"])
	settings, ok := roomBody["settings"].(map[string]interface{})
	require.True(t, ok, "settings 필드가 존재해야 한다")
	assert.Equal(t, float64(2), settings["playerCount"], "설정된 최대 플레이어 수는 2여야 한다")

	// Step 3: 두 번째 플레이어 참여
	guestToken := issueDevToken(t, guestUserID)
	joinResp := doRequest(t, srv, http.MethodPost, "/api/rooms/"+roomID+"/join", guestToken, nil)
	require.Equal(t, http.StatusOK, joinResp.StatusCode, "참가가 성공해야 한다")
	joinBody := decodeJSON(t, joinResp)
	assert.Equal(t, "WAITING", joinBody["status"])
	// players 배열에서 게스트가 포함되었는지 확인
	players, ok := joinBody["players"].([]interface{})
	require.True(t, ok)
	connectedCount := 0
	for _, p := range players {
		pm := p.(map[string]interface{})
		if pm["status"] == "CONNECTED" {
			connectedCount++
		}
	}
	assert.Equal(t, 2, connectedCount, "CONNECTED 플레이어가 2명이어야 한다")

	// Step 4: 게임 시작 (호스트만 가능)
	startResp := doRequest(t, srv, http.MethodPost, "/api/rooms/"+roomID+"/start", hostToken, nil)
	require.Equal(t, http.StatusOK, startResp.StatusCode, "게임 시작이 성공해야 한다")
	startBody := decodeJSON(t, startResp)
	gameID, ok := startBody["gameId"].(string)
	require.True(t, ok, "gameId가 string이어야 한다")
	require.NotEmpty(t, gameID)
	assert.Equal(t, "PLAYING", startBody["status"])

	// Step 5: 방 상태 확인 (status=PLAYING)
	getRoomResp := doRequest(t, srv, http.MethodGet, "/api/rooms/"+roomID, hostToken, nil)
	require.Equal(t, http.StatusOK, getRoomResp.StatusCode)
	getRoomBody := decodeJSON(t, getRoomResp)
	assert.Equal(t, "PLAYING", getRoomBody["status"], "게임 시작 후 방 상태는 PLAYING이어야 한다")
	assert.NotNil(t, getRoomBody["gameId"], "gameId가 방 정보에 포함되어야 한다")
}

// TestDevLoginRequired dev-login은 APP_ENV=dev에서만 동작한다
func TestDevLoginRequired(t *testing.T) {
	// production 환경 라우터: dev-login 미등록
	router := buildTestRouter(t, "production")
	srv := httptest.NewServer(router)
	defer srv.Close()

	resp := doRequest(t, srv, http.MethodPost, "/api/auth/dev-login", "", map[string]string{
		"userId":      "user-001",
		"displayName": "테스터",
	})
	defer resp.Body.Close() //nolint:errcheck

	assert.Equal(t, http.StatusNotFound, resp.StatusCode, "production 환경에서는 dev-login이 404여야 한다")
}

// TestRoomCreationValidation 필수 필드 누락 시 400 반환 테스트
func TestRoomCreationValidation(t *testing.T) {
	router := buildTestRouter(t, "dev")
	srv := httptest.NewServer(router)
	defer srv.Close()

	hostToken := issueDevToken(t, hostUserID)

	tests := []struct {
		name     string
		body     map[string]interface{}
		wantCode int
	}{
		{
			name:     "playerCount 누락",
			body:     map[string]interface{}{"turnTimeoutSec": 60},
			wantCode: http.StatusBadRequest,
		},
		{
			name:     "turnTimeoutSec 누락",
			body:     map[string]interface{}{"playerCount": 2},
			wantCode: http.StatusBadRequest,
		},
		{
			name:     "playerCount 범위 초과 (5)",
			body:     map[string]interface{}{"playerCount": 5, "turnTimeoutSec": 60},
			wantCode: http.StatusBadRequest,
		},
		{
			name:     "playerCount 범위 미만 (1)",
			body:     map[string]interface{}{"playerCount": 1, "turnTimeoutSec": 60},
			wantCode: http.StatusBadRequest,
		},
		{
			name:     "turnTimeoutSec 범위 초과 (700)",
			body:     map[string]interface{}{"playerCount": 2, "turnTimeoutSec": 700},
			wantCode: http.StatusBadRequest,
		},
	}

	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			resp := doRequest(t, srv, http.MethodPost, "/api/rooms", hostToken, tc.body)
			defer resp.Body.Close() //nolint:errcheck
			assert.Equal(t, tc.wantCode, resp.StatusCode)
		})
	}
}

// TestJoinRoomNotFound 없는 방 참여 시 404 반환 테스트
func TestJoinRoomNotFound(t *testing.T) {
	router := buildTestRouter(t, "dev")
	srv := httptest.NewServer(router)
	defer srv.Close()

	guestToken := issueDevToken(t, guestUserID)
	resp := doRequest(t, srv, http.MethodPost, "/api/rooms/non-existent-room-id/join", guestToken, nil)
	defer resp.Body.Close() //nolint:errcheck

	assert.Equal(t, http.StatusNotFound, resp.StatusCode, "없는 방 참여 시 404가 반환되어야 한다")

	body := make(map[string]interface{})
	require.NoError(t, json.NewDecoder(resp.Body).Decode(&body))
	errBody, ok := body["error"].(map[string]interface{})
	require.True(t, ok)
	assert.Equal(t, "NOT_FOUND", errBody["code"])
}

// TestStartGame_NotEnoughPlayers 플레이어 1명으로 게임 시작 시 400 반환 테스트
func TestStartGame_NotEnoughPlayers(t *testing.T) {
	router := buildTestRouter(t, "dev")
	srv := httptest.NewServer(router)
	defer srv.Close()

	hostToken := issueDevToken(t, hostUserID)

	// 방 생성 (호스트 혼자)
	createResp := doRequest(t, srv, http.MethodPost, "/api/rooms", hostToken, map[string]interface{}{
		"playerCount":    2,
		"turnTimeoutSec": 60,
	})
	require.Equal(t, http.StatusCreated, createResp.StatusCode)
	createBody := decodeJSON(t, createResp)
	roomID := createBody["id"].(string)

	// 게스트 없이 게임 시작 시도
	startResp := doRequest(t, srv, http.MethodPost, "/api/rooms/"+roomID+"/start", hostToken, nil)
	defer startResp.Body.Close() //nolint:errcheck

	assert.Equal(t, http.StatusBadRequest, startResp.StatusCode, "플레이어 부족 시 400이 반환되어야 한다")
}

// TestStartGame_OnlyHostCanStart 호스트가 아닌 플레이어가 게임 시작 시도 시 403 반환 테스트
func TestStartGame_OnlyHostCanStart(t *testing.T) {
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
	createBody := decodeJSON(t, createResp)
	roomID := createBody["id"].(string)

	// 게스트 참가
	joinResp := doRequest(t, srv, http.MethodPost, "/api/rooms/"+roomID+"/join", guestToken, nil)
	require.Equal(t, http.StatusOK, joinResp.StatusCode)
	joinResp.Body.Close() //nolint:errcheck

	// 게스트가 시작 시도 -> 403
	startResp := doRequest(t, srv, http.MethodPost, "/api/rooms/"+roomID+"/start", guestToken, nil)
	defer startResp.Body.Close() //nolint:errcheck

	assert.Equal(t, http.StatusForbidden, startResp.StatusCode, "호스트가 아닌 플레이어는 게임을 시작할 수 없다")
}

// TestGetRoom_AfterStart 게임 시작 후 방 상태가 PLAYING으로 변경되는지 확인
func TestGetRoom_AfterStart(t *testing.T) {
	router := buildTestRouter(t, "dev")
	srv := httptest.NewServer(router)
	defer srv.Close()

	hostToken := issueDevToken(t, hostUserID)
	guestToken := issueDevToken(t, guestUserID)

	// 방 생성 -> 참가 -> 시작
	createResp := doRequest(t, srv, http.MethodPost, "/api/rooms", hostToken, map[string]interface{}{
		"playerCount":    2,
		"turnTimeoutSec": 60,
	})
	require.Equal(t, http.StatusCreated, createResp.StatusCode)
	roomBody := decodeJSON(t, createResp)
	roomID := roomBody["id"].(string)

	joinResp := doRequest(t, srv, http.MethodPost, "/api/rooms/"+roomID+"/join", guestToken, nil)
	require.Equal(t, http.StatusOK, joinResp.StatusCode)
	joinResp.Body.Close() //nolint:errcheck

	startResp := doRequest(t, srv, http.MethodPost, "/api/rooms/"+roomID+"/start", hostToken, nil)
	require.Equal(t, http.StatusOK, startResp.StatusCode)
	startBody := decodeJSON(t, startResp)
	gameID := startBody["gameId"].(string)

	// 방 상태 GET
	getRoomResp := doRequest(t, srv, http.MethodGet, "/api/rooms/"+roomID, hostToken, nil)
	require.Equal(t, http.StatusOK, getRoomResp.StatusCode)
	getBody := decodeJSON(t, getRoomResp)
	assert.Equal(t, "PLAYING", getBody["status"])

	// 게임 상태 GET (seat 0 기준)
	getGameResp := doRequest(t, srv, http.MethodGet, "/api/games/"+gameID+"?seat=0", hostToken, nil)
	require.Equal(t, http.StatusOK, getGameResp.StatusCode)
	gameStateBody := decodeJSON(t, getGameResp)
	assert.Equal(t, "PLAYING", gameStateBody["status"])
	assert.NotNil(t, gameStateBody["myRack"], "myRack 필드가 포함되어야 한다")

	myRack, ok := gameStateBody["myRack"].([]interface{})
	require.True(t, ok)
	assert.Equal(t, 14, len(myRack), "초기 랙은 14장이어야 한다")
}

// TestUnauthorizedAccess JWT 없이 보호된 엔드포인트 접근 시 401 반환 테스트
func TestUnauthorizedAccess(t *testing.T) {
	router := buildTestRouter(t, "dev")
	srv := httptest.NewServer(router)
	defer srv.Close()

	tests := []struct {
		name   string
		method string
		path   string
	}{
		{"방 목록 조회 (토큰 없음)", http.MethodGet, "/api/rooms"},
		{"방 생성 (토큰 없음)", http.MethodPost, "/api/rooms"},
	}

	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			resp := doRequest(t, srv, tc.method, tc.path, "", nil)
			defer resp.Body.Close() //nolint:errcheck
			assert.Equal(t, http.StatusUnauthorized, resp.StatusCode)
		})
	}
}
