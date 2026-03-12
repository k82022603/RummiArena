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
	Code   string    `json:"code"`
	Color  TileColor `json:"color,omitempty"`
	Number int       `json:"number,omitempty"`
	Set    TileSet   `json:"set,omitempty"`
	IsJoker bool     `json:"isJoker"`
}

// SetOnTable represents a group of tiles placed on the table.
type SetOnTable struct {
	ID    string  `json:"id"`
	Tiles []*Tile `json:"tiles"`
}

// GameStateRedis is the Redis-cached game state structure.
type GameStateRedis struct {
	GameID      string        `json:"gameId"`
	Status      GameStatus    `json:"status"`
	CurrentSeat int           `json:"currentSeat"`
	DrawPile    []string      `json:"drawPile"`
	Table       []*SetOnTable `json:"table"`
	Players     []PlayerState `json:"players"`
	TurnStartAt int64         `json:"turnStartAt"`
}

// PlayerState holds per-player in-memory state cached in Redis.
type PlayerState struct {
	SeatOrder      int      `json:"seatOrder"`
	UserID         string   `json:"userId,omitempty"`
	PlayerType     string   `json:"playerType"`
	HasInitialMeld bool     `json:"hasInitialMeld"`
	Rack           []string `json:"rack"`
}
