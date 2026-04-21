package client_test

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"
	"time"

	"github.com/k82022603/RummiArena/game-server/internal/client"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

// buildMoveRequest 테스트용 기본 MoveRequest를 생성한다.
func buildMoveRequest() *client.MoveRequest {
	return &client.MoveRequest{
		GameID:          "test-game-001",
		PlayerID:        "ai-player-seat-1",
		Model:           "ollama",
		Persona:         "shark",
		Difficulty:      "intermediate",
		PsychologyLevel: 1,
		GameState: client.MoveGameState{
			TableGroups:     []client.TileGroup{{Tiles: []string{"R7a", "B7a", "K7b"}}},
			MyTiles:         []string{"R1a", "R5b", "B3a"},
			Opponents:       []client.OpponentInfo{{PlayerID: "user-abc", RemainingTiles: 8}},
			DrawPileCount:   28,
			TurnNumber:      5,
			InitialMeldDone: false,
		},
		MaxRetries: 5, // ws_handler.go MaxRetries 기본값과 동기화
		TimeoutMs:  30000,
	}
}

// TestGenerateMove_PlaceAction PLACE 행동 정상 응답 테스트
func TestGenerateMove_PlaceAction(t *testing.T) {
	expectedResp := client.MoveResponse{
		Action: "place",
		TableGroups: []client.TileGroup{
			{Tiles: []string{"R7a", "B7a", "K7b"}},
			{Tiles: []string{"R1a", "B1a", "K1b"}},
		},
		TilesFromRack: []string{"R1a", "B1a"},
		Reasoning:     "새 그룹 생성 가능",
		Metadata: client.MoveMetadata{
			ModelType:        "ollama",
			ModelName:        "gemma3:4b",
			LatencyMs:        2450,
			PromptTokens:     850,
			CompletionTokens: 120,
			RetryCount:       0,
			IsFallbackDraw:   false,
		},
	}

	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		assert.Equal(t, http.MethodPost, r.Method)
		assert.Equal(t, "/move", r.URL.Path)

		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusOK)
		require.NoError(t, json.NewEncoder(w).Encode(expectedResp))
	}))
	defer srv.Close()

	c := client.NewAIClient(srv.URL, "test-token", 10*time.Second)
	resp, err := c.GenerateMove(context.Background(), buildMoveRequest())

	require.NoError(t, err)
	assert.Equal(t, "place", resp.Action)
	assert.Equal(t, []string{"R1a", "B1a"}, resp.TilesFromRack)
	assert.Equal(t, 2, len(resp.TableGroups))
	assert.False(t, resp.Metadata.IsFallbackDraw)
}

// TestGenerateMove_FallbackDraw 강제 드로우 응답 테스트 (isFallbackDraw=true)
func TestGenerateMove_FallbackDraw(t *testing.T) {
	fallbackResp := client.MoveResponse{
		Action:    "draw",
		Reasoning: "유효한 수를 생성하지 못하여 강제 드로우를 선택합니다.",
		Metadata: client.MoveMetadata{
			ModelType:        "ollama",
			ModelName:        "gemma3:4b",
			LatencyMs:        15200,
			PromptTokens:     0,
			CompletionTokens: 0,
			RetryCount:       3,
			IsFallbackDraw:   true,
		},
	}

	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusOK)
		require.NoError(t, json.NewEncoder(w).Encode(fallbackResp))
	}))
	defer srv.Close()

	c := client.NewAIClient(srv.URL, "", 10*time.Second)
	resp, err := c.GenerateMove(context.Background(), buildMoveRequest())

	require.NoError(t, err)
	assert.Equal(t, "draw", resp.Action)
	assert.True(t, resp.Metadata.IsFallbackDraw)
	assert.Equal(t, 3, resp.Metadata.RetryCount)
	assert.Empty(t, resp.TableGroups)
}

// TestGenerateMove_Timeout 타임아웃 시 에러 반환 테스트
func TestGenerateMove_Timeout(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		// 클라이언트 타임아웃(50ms)보다 길게 대기
		time.Sleep(200 * time.Millisecond)
		w.WriteHeader(http.StatusOK)
	}))
	defer srv.Close()

	c := client.NewAIClient(srv.URL, "token", 50*time.Millisecond)
	_, err := c.GenerateMove(context.Background(), buildMoveRequest())

	require.Error(t, err, "타임아웃 발생 시 에러가 반환되어야 한다")
}

// TestGenerateMove_AuthHeader X-Internal-Token 헤더 전송 검증 테스트
func TestGenerateMove_AuthHeader(t *testing.T) {
	const expectedToken = "my-secret-internal-token"
	var receivedToken string

	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		receivedToken = r.Header.Get("X-Internal-Token")

		resp := client.MoveResponse{
			Action: "draw",
			Metadata: client.MoveMetadata{
				ModelType: "openai",
				ModelName: "gpt-4o",
			},
		}
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusOK)
		require.NoError(t, json.NewEncoder(w).Encode(resp))
	}))
	defer srv.Close()

	c := client.NewAIClient(srv.URL, expectedToken, 10*time.Second)
	_, err := c.GenerateMove(context.Background(), buildMoveRequest())

	require.NoError(t, err)
	assert.Equal(t, expectedToken, receivedToken, "X-Internal-Token 헤더가 올바르게 전송되어야 한다")
}

// TestGenerateMove_NoAuthHeader 토큰 미설정 시 헤더 미전송 검증
func TestGenerateMove_NoAuthHeader(t *testing.T) {
	var receivedToken string

	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		receivedToken = r.Header.Get("X-Internal-Token")

		resp := client.MoveResponse{
			Action:   "draw",
			Metadata: client.MoveMetadata{ModelType: "ollama", ModelName: "gemma3:4b"},
		}
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusOK)
		require.NoError(t, json.NewEncoder(w).Encode(resp))
	}))
	defer srv.Close()

	c := client.NewAIClient(srv.URL, "", 10*time.Second)
	_, err := c.GenerateMove(context.Background(), buildMoveRequest())

	require.NoError(t, err)
	assert.Empty(t, receivedToken, "토큰 미설정 시 X-Internal-Token 헤더를 전송하지 않아야 한다")
}

// TestGenerateMove_NonOKStatus 비정상 HTTP 상태 코드 에러 처리 테스트
func TestGenerateMove_NonOKStatus(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusServiceUnavailable)
	}))
	defer srv.Close()

	c := client.NewAIClient(srv.URL, "", 10*time.Second)
	_, err := c.GenerateMove(context.Background(), buildMoveRequest())

	require.Error(t, err)
	assert.Contains(t, err.Error(), "503")
}

// TestHealthCheck_OK 정상 헬스체크 테스트
func TestHealthCheck_OK(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		assert.Equal(t, http.MethodGet, r.Method)
		assert.Equal(t, "/health", r.URL.Path)
		w.WriteHeader(http.StatusOK)
	}))
	defer srv.Close()

	c := client.NewAIClient(srv.URL, "", 10*time.Second)
	err := c.HealthCheck(context.Background())

	require.NoError(t, err)
}

// TestHealthCheck_ServiceDown 서비스 다운 시 에러 반환 테스트
func TestHealthCheck_ServiceDown(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusServiceUnavailable)
	}))
	defer srv.Close()

	c := client.NewAIClient(srv.URL, "", 10*time.Second)
	err := c.HealthCheck(context.Background())

	require.Error(t, err)
}

// TestGenerateMove_ContextCancel context 취소 시 즉시 종료 테스트
func TestGenerateMove_ContextCancel(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		time.Sleep(500 * time.Millisecond)
		w.WriteHeader(http.StatusOK)
	}))
	defer srv.Close()

	ctx, cancel := context.WithCancel(context.Background())
	go func() {
		time.Sleep(20 * time.Millisecond)
		cancel()
	}()

	c := client.NewAIClient(srv.URL, "", 10*time.Second)
	_, err := c.GenerateMove(ctx, buildMoveRequest())

	require.Error(t, err, "context 취소 시 에러가 반환되어야 한다")
}
