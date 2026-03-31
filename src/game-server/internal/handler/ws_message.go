package handler

import "encoding/json"

// --- C2S (Client-to-Server) Message Types ---
const (
	C2SAuth        = "AUTH"
	C2SPlaceTiles  = "PLACE_TILES"
	C2SDrawTile    = "DRAW_TILE"
	C2SConfirmTurn = "CONFIRM_TURN"
	C2SResetTurn   = "RESET_TURN"
	C2SPing        = "PING"
	C2SLeaveGame   = "LEAVE_GAME"
	C2SChat        = "CHAT"
)

// --- S2C (Server-to-Client) Message Types ---
const (
	S2CAuthOK             = "AUTH_OK"
	S2CGameState          = "GAME_STATE"
	S2CTurnStart          = "TURN_START"
	S2CTurnEnd            = "TURN_END"
	S2CTilePlaced         = "TILE_PLACED"
	S2CTileDrawn          = "TILE_DRAWN"
	S2CInvalidMove        = "INVALID_MOVE"
	S2CGameOver           = "GAME_OVER"
	S2CPlayerJoin         = "PLAYER_JOIN"
	S2CPlayerLeave        = "PLAYER_LEAVE"
	S2CPlayerReconnect    = "PLAYER_RECONNECT"
	S2CPlayerDisconnected = "PLAYER_DISCONNECTED"
	S2CPlayerForfeited    = "PLAYER_FORFEITED"
	S2CDrawPileEmpty      = "DRAW_PILE_EMPTY"
	S2CError              = "ERROR"
	S2CPong               = "PONG"
	S2CChatBroadcast      = "CHAT_BROADCAST"
)

// --- WebSocket Close Codes ---
const (
	CloseNormal      = 1000
	CloseAuthFail    = 4001
	CloseNoRoom      = 4002
	CloseAuthTimeout = 4003
	CloseDuplicate   = 4004
)

// WSEnvelope is the incoming WebSocket message envelope.
type WSEnvelope struct {
	Type      string          `json:"type"`
	Payload   json.RawMessage `json:"payload"`
	Seq       int             `json:"seq"`
	Timestamp string          `json:"timestamp"`
}

// WSMessage is the outgoing WebSocket message envelope.
type WSMessage struct {
	Type      string      `json:"type"`
	Payload   interface{} `json:"payload"`
	Seq       int         `json:"seq"`
	Timestamp string      `json:"timestamp"`
}

// --- Common Structs ---

// FallbackInfo AI 강제 드로우(fallback) 정보
type FallbackInfo struct {
	IsFallbackDraw bool   // AI가 정상 행동 실패로 강제 드로우했는지 여부
	FallbackReason string // "AI_TIMEOUT", "INVALID_MOVE", "AI_ERROR"
}

// WSTableGroup WebSocket 메시지용 테이블 세트
type WSTableGroup struct {
	ID    string   `json:"id"`
	Tiles []string `json:"tiles"`
	Type  string   `json:"type,omitempty"`
}

// WSPlayerInfo WebSocket 메시지용 플레이어 정보
type WSPlayerInfo struct {
	Seat             int    `json:"seat"`
	UserID           string `json:"userId,omitempty"`
	DisplayName      string `json:"displayName"`
	PlayerType       string `json:"playerType"`
	TileCount        int    `json:"tileCount"`
	HasInitialMeld   bool   `json:"hasInitialMeld"`
	IsConnected      bool   `json:"isConnected"`
	ConnectionStatus string `json:"connectionStatus,omitempty"` // ACTIVE, DISCONNECTED, FORFEITED
}

// --- C2S Payload Structs ---

// AuthPayload AUTH 메시지 페이로드
type AuthPayload struct {
	Token string `json:"token"`
}

// PlaceTilesPayload PLACE_TILES 메시지 페이로드
type PlaceTilesPayload struct {
	TableGroups   []WSTableGroup `json:"tableGroups"`
	TilesFromRack []string       `json:"tilesFromRack"`
}

// ConfirmTurnPayload CONFIRM_TURN 메시지 페이로드
type ConfirmTurnPayload struct {
	TableGroups   []WSTableGroup `json:"tableGroups"`
	TilesFromRack []string       `json:"tilesFromRack"`
}

// ChatPayload CHAT 메시지 페이로드
type ChatPayload struct {
	Message string `json:"message"`
}

// --- S2C Payload Structs ---

// AuthOKPayload AUTH_OK 응답 페이로드
type AuthOKPayload struct {
	UserID      string `json:"userId"`
	Seat        int    `json:"seat"`
	DisplayName string `json:"displayName"`
}

// GameStatePayload GAME_STATE 페이로드 (1인칭 뷰)
type GameStatePayload struct {
	GameID         string         `json:"gameId"`
	Status         string         `json:"status"`
	CurrentSeat    int            `json:"currentSeat"`
	TableGroups    []WSTableGroup `json:"tableGroups"`
	MyRack         []string       `json:"myRack"`
	Players        []WSPlayerInfo `json:"players"`
	DrawPileCount  int            `json:"drawPileCount"`
	TurnTimeoutSec int            `json:"turnTimeoutSec"`
	TurnStartedAt  string         `json:"turnStartedAt,omitempty"`
}

// TurnStartPayload TURN_START 페이로드
type TurnStartPayload struct {
	Seat          int    `json:"seat"`
	TurnNumber    int    `json:"turnNumber"`
	PlayerType    string `json:"playerType"`
	DisplayName   string `json:"displayName"`
	TimeoutSec    int    `json:"timeoutSec"`
	TurnStartedAt string `json:"turnStartedAt"`
}

// TurnEndPayload TURN_END 페이로드
type TurnEndPayload struct {
	Seat             int            `json:"seat"`
	TurnNumber       int            `json:"turnNumber"`
	Action           string         `json:"action"`
	TableGroups      []WSTableGroup `json:"tableGroups"`
	TilesPlacedCount int            `json:"tilesPlacedCount"`
	PlayerTileCount  int            `json:"playerTileCount"`
	HasInitialMeld   bool           `json:"hasInitialMeld"`
	DrawPileCount    int            `json:"drawPileCount"`
	NextSeat         int            `json:"nextSeat"`
	NextTurnNumber   int            `json:"nextTurnNumber"`
	IsFallbackDraw   bool           `json:"isFallbackDraw,omitempty"`
	FallbackReason   string         `json:"fallbackReason,omitempty"` // "AI_TIMEOUT", "INVALID_MOVE", "AI_ERROR"
}

// TilePlacedPayload TILE_PLACED 페이로드 (실시간 피드백)
type TilePlacedPayload struct {
	Seat               int            `json:"seat"`
	TableGroups        []WSTableGroup `json:"tableGroups"`
	TilesFromRackCount int            `json:"tilesFromRackCount"`
}

// TileDrawnPayload TILE_DRAWN 페이로드
type TileDrawnPayload struct {
	Seat            int     `json:"seat"`
	DrawnTile       *string `json:"drawnTile"`
	DrawPileCount   int     `json:"drawPileCount"`
	PlayerTileCount int     `json:"playerTileCount"`
}

// InvalidMovePayload INVALID_MOVE 페이로드
type InvalidMovePayload struct {
	Errors []WSValidationError `json:"errors"`
}

// WSValidationError 검증 에러 상세
type WSValidationError struct {
	Code    string `json:"code"`
	Message string `json:"message"`
}

// GameOverPayload GAME_OVER 페이로드
type GameOverPayload struct {
	EndType    string           `json:"endType"`
	WinnerID   string           `json:"winnerId,omitempty"`
	WinnerSeat int              `json:"winnerSeat"`
	Results    []WSPlayerResult `json:"results"`
}

// WSPlayerResult 게임 종료 시 플레이어 결과
type WSPlayerResult struct {
	Seat           int      `json:"seat"`
	PlayerType     string   `json:"playerType"`
	RemainingTiles []string `json:"remainingTiles"`
	IsWinner       bool     `json:"isWinner"`
}

// PlayerJoinPayload PLAYER_JOIN 페이로드
type PlayerJoinPayload struct {
	Seat         int    `json:"seat"`
	UserID       string `json:"userId,omitempty"`
	DisplayName  string `json:"displayName"`
	PlayerType   string `json:"playerType"`
	TotalPlayers int    `json:"totalPlayers"`
	MaxPlayers   int    `json:"maxPlayers"`
}

// PlayerLeavePayload PLAYER_LEAVE 페이로드
type PlayerLeavePayload struct {
	Seat         int    `json:"seat"`
	DisplayName  string `json:"displayName"`
	Reason       string `json:"reason"`
	TotalPlayers int    `json:"totalPlayers"`
}

// ErrorPayload ERROR 페이로드
type ErrorPayload struct {
	Code    string      `json:"code"`
	Message string      `json:"message"`
	Details interface{} `json:"details,omitempty"`
}

// PongPayload PONG 페이로드
type PongPayload struct {
	ServerTime string `json:"serverTime"`
}

// ChatBroadcastPayload CHAT_BROADCAST 페이로드
type ChatBroadcastPayload struct {
	Seat        int    `json:"seat"`
	DisplayName string `json:"displayName"`
	Message     string `json:"message"`
	SentAt      string `json:"sentAt"`
}

// PlayerDisconnectedPayload PLAYER_DISCONNECTED 페이로드
type PlayerDisconnectedPayload struct {
	Seat        int    `json:"seat"`
	DisplayName string `json:"displayName"`
	GraceSec    int    `json:"graceSec"`
}

// PlayerForfeitedPayload PLAYER_FORFEITED 페이로드
type PlayerForfeitedPayload struct {
	Seat          int    `json:"seat"`
	DisplayName   string `json:"displayName"`
	Reason        string `json:"reason"`        // "DISCONNECT_TIMEOUT" or "LEAVE"
	ActivePlayers int    `json:"activePlayers"`
	IsGameOver    bool   `json:"isGameOver"`
}

// DrawPileEmptyPayload DRAW_PILE_EMPTY 페이로드
type DrawPileEmptyPayload struct {
	Message string `json:"message"`
}
