// Package client provides an HTTP client for communicating with the ai-adapter service.
// Reference: docs/02-design/11-ai-move-api-contract.md
package client

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"time"
)

// AIClientInterface AI 어댑터 클라이언트 인터페이스.
// E2E 테스트에서 mock으로 교체 가능하도록 인터페이스로 추상화한다.
type AIClientInterface interface {
	GenerateMove(ctx context.Context, req *MoveRequest) (*MoveResponse, error)
	HealthCheck(ctx context.Context) error
}

// AIClient game-server → ai-adapter HTTP 클라이언트.
// 계약서(11-ai-move-api-contract.md) §3의 POST /move 엔드포인트를 호출한다.
type AIClient struct {
	baseURL    string
	httpClient *http.Client
	token      string
}

// NewAIClient AIClient 생성자.
// timeout은 HTTP 전체 요청 타임아웃으로 기본 180초를 권장한다.
// LLM 개별 호출 타임아웃(timeoutMs)은 요청 DTO 필드로 ai-adapter 내부에서 처리한다.
func NewAIClient(baseURL string, token string, timeout time.Duration) *AIClient {
	return &AIClient{
		baseURL: baseURL,
		token:   token,
		httpClient: &http.Client{
			Timeout: timeout,
		},
	}
}

// --- 요청 DTO ---

// MoveRequest POST /move 요청 DTO.
// 계약서 §3.2 기준.
type MoveRequest struct {
	GameID          string         `json:"gameId"`
	PlayerID        string         `json:"playerId"`
	Model           string         `json:"model"`
	Persona         string         `json:"persona"`
	Difficulty      string         `json:"difficulty"`
	PsychologyLevel int            `json:"psychologyLevel"`
	GameState       MoveGameState  `json:"gameState"`
	MaxRetries      int            `json:"maxRetries,omitempty"`
	TimeoutMs       int            `json:"timeoutMs,omitempty"`
}

// MoveGameState 게임 상태 서브 DTO (계약서 §3.4)
type MoveGameState struct {
	TableGroups    []TileGroup    `json:"tableGroups"`
	MyTiles        []string       `json:"myTiles"`
	Opponents      []OpponentInfo `json:"opponents"`
	DrawPileCount  int            `json:"drawPileCount"`
	TurnNumber     int            `json:"turnNumber"`
	InitialMeldDone bool          `json:"initialMeldDone"`
	UnseenTiles    []string       `json:"unseenTiles,omitempty"`
}

// TileGroup 테이블 위의 타일 그룹 (계약서 §3.2 tableGroups 요소)
type TileGroup struct {
	Tiles []string `json:"tiles"`
}

// OpponentInfo 상대 플레이어 정보 (계약서 §3.4 opponents 요소)
type OpponentInfo struct {
	PlayerID       string   `json:"playerId"`
	RemainingTiles int      `json:"remainingTiles"`
	ActionHistory  []string `json:"actionHistory,omitempty"`
}

// --- 응답 DTO ---

// MoveResponse POST /move 응답 DTO.
// 계약서 §3.6 기준.
type MoveResponse struct {
	Action        string          `json:"action"` // "place" | "draw"
	TableGroups   []TileGroup     `json:"tableGroups,omitempty"`
	TilesFromRack []string        `json:"tilesFromRack,omitempty"`
	Reasoning     string          `json:"reasoning,omitempty"`
	Metadata      MoveMetadata    `json:"metadata"`
}

// MoveMetadata AI 호출 메타데이터 (계약서 §3.7 metadata 필드)
type MoveMetadata struct {
	ModelType        string `json:"modelType"`
	ModelName        string `json:"modelName"`
	LatencyMs        int    `json:"latencyMs"`
	PromptTokens     int    `json:"promptTokens"`
	CompletionTokens int    `json:"completionTokens"`
	RetryCount       int    `json:"retryCount"`
	IsFallbackDraw   bool   `json:"isFallbackDraw"`
}

// --- 메서드 ---

// GenerateMove ai-adapter의 POST /move를 호출하여 AI의 다음 수를 생성한다.
// HTTP 전체 타임아웃은 AIClient 생성 시 지정한 값을 따른다 (기본 180초).
// LLM 개별 타임아웃은 req.TimeoutMs로 ai-adapter 내부에서 처리한다.
func (c *AIClient) GenerateMove(ctx context.Context, req *MoveRequest) (*MoveResponse, error) {
	body, err := json.Marshal(req)
	if err != nil {
		return nil, fmt.Errorf("ai_client: marshal request: %w", err)
	}

	httpReq, err := http.NewRequestWithContext(ctx, http.MethodPost, c.baseURL+"/move", bytes.NewReader(body))
	if err != nil {
		return nil, fmt.Errorf("ai_client: create request: %w", err)
	}

	httpReq.Header.Set("Content-Type", "application/json")
	if c.token != "" {
		httpReq.Header.Set("X-Internal-Token", c.token)
	}

	resp, err := c.httpClient.Do(httpReq)
	if err != nil {
		return nil, fmt.Errorf("ai_client: do request: %w", err)
	}
	defer resp.Body.Close() //nolint:errcheck

	if resp.StatusCode != http.StatusOK {
		return nil, fmt.Errorf("ai_client: unexpected status %d from POST /move", resp.StatusCode)
	}

	var moveResp MoveResponse
	if err := json.NewDecoder(resp.Body).Decode(&moveResp); err != nil {
		return nil, fmt.Errorf("ai_client: decode response: %w", err)
	}

	return &moveResp, nil
}

// HealthCheck ai-adapter의 GET /health를 호출하여 서비스 생존 여부를 확인한다.
func (c *AIClient) HealthCheck(ctx context.Context) error {
	httpReq, err := http.NewRequestWithContext(ctx, http.MethodGet, c.baseURL+"/health", nil)
	if err != nil {
		return fmt.Errorf("ai_client: create health request: %w", err)
	}

	resp, err := c.httpClient.Do(httpReq)
	if err != nil {
		return fmt.Errorf("ai_client: health check request: %w", err)
	}
	defer resp.Body.Close() //nolint:errcheck

	if resp.StatusCode != http.StatusOK {
		return fmt.Errorf("ai_client: health check failed with status %d", resp.StatusCode)
	}

	return nil
}
