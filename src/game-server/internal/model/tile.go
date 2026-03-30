package model

// TileColor represents the color of a rummikub tile.
type TileColor string

const (
	TileColorRed    TileColor = "R"
	TileColorBlue   TileColor = "B"
	TileColorYellow TileColor = "Y"
	TileColorBlack  TileColor = "K"
)

// TileSet distinguishes duplicate tiles (each number-color pair has 2 copies).
type TileSet string

const (
	TileSetA TileSet = "a"
	TileSetB TileSet = "b"
)

// Tile represents a single rummikub tile.
// Code format: {Color}{Number}{Set} e.g. "R7a", "B13b", "JK1"
type Tile struct {
	Code    string    `json:"code"`
	Color   TileColor `json:"color,omitempty"`
	Number  int       `json:"number,omitempty"`
	Set     TileSet   `json:"set,omitempty"`
	IsJoker bool      `json:"isJoker"`
}

// SetOnTable represents a group of tiles placed on the table.
type SetOnTable struct {
	ID    string  `json:"id"`
	Tiles []*Tile `json:"tiles"`
}

// GameStateRedis is the Redis-cached game state structure.
type GameStateRedis struct {
	GameID               string        `json:"gameId"`
	Status               GameStatus    `json:"status"`
	CurrentSeat          int           `json:"currentSeat"`
	DrawPile             []string      `json:"drawPile"`
	Table                []*SetOnTable `json:"table"`
	Players              []PlayerState `json:"players"`
	TurnStartAt          int64         `json:"turnStartAt"`
	TurnCount            int           `json:"turnCount"`
	ConsecutivePassCount int           `json:"consecutivePassCount"` // 연속 드로우 횟수 (교착 판정용)
	TurnTimeoutSec       int           `json:"turnTimeoutSec"`      // 타이머 에이전트가 사용할 필드
	IsStalemate          bool          `json:"isStalemate,omitempty"`
}

// PlayerConnectionStatus 플레이어 연결 상태
type PlayerConnectionStatus string

const (
	PlayerStatusActive       PlayerConnectionStatus = "ACTIVE"
	PlayerStatusDisconnected PlayerConnectionStatus = "DISCONNECTED"
	PlayerStatusForfeited    PlayerConnectionStatus = "FORFEITED"
)

// PlayerState holds per-player in-memory state cached in Redis.
type PlayerState struct {
	SeatOrder      int                    `json:"seatOrder"`
	UserID         string                 `json:"userId,omitempty"`
	DisplayName    string                 `json:"displayName,omitempty"`
	PlayerType     string                 `json:"playerType"`
	HasInitialMeld bool                   `json:"hasInitialMeld"`
	Rack           []string               `json:"rack"`
	Status         PlayerConnectionStatus `json:"status"`         // ACTIVE, DISCONNECTED, FORFEITED
	DisconnectedAt int64                  `json:"disconnectedAt"` // Unix timestamp (ms), DISCONNECTED 전환 시각
	// AI 플레이어 설정 (PlayerType이 AI_* 인 경우에만 사용)
	AIModel      string `json:"aiModel,omitempty"`
	AIPersona    string `json:"aiPersona,omitempty"`
	AIDifficulty string `json:"aiDifficulty,omitempty"`
	AIPsychLevel int    `json:"aiPsychLevel,omitempty"`
}
