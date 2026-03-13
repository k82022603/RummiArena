package model

import (
	"time"

	"gorm.io/gorm"
)

// GameStatus 게임 진행 상태
type GameStatus string

const (
	GameStatusWaiting   GameStatus = "WAITING"
	GameStatusPlaying   GameStatus = "PLAYING"
	GameStatusFinished  GameStatus = "FINISHED"
	GameStatusCancelled GameStatus = "CANCELLED"
)

// GameMode 게임 모드
type GameMode string

const (
	GameModeNormal   GameMode = "NORMAL"
	GameModePractice GameMode = "PRACTICE"
)

// Game 게임 기록 영속 모델 (PostgreSQL)
// 참조: docs/02-design/02-database-design.md §2.2
type Game struct {
	ID          string         `gorm:"primaryKey;type:uuid;default:gen_random_uuid()"   json:"id"`
	RoomID      *string        `gorm:"column:room_id;type:uuid"                         json:"roomId,omitempty"`
	RoomCode    string         `gorm:"column:room_code;type:varchar(10);not null"       json:"roomCode"`
	Status      GameStatus     `gorm:"type:varchar(20);not null;default:'WAITING'"      json:"status"`
	GameMode    GameMode       `gorm:"column:game_mode;type:varchar(20);not null;default:'NORMAL'" json:"gameMode"`
	PlayerCount int            `gorm:"column:player_count;not null"                     json:"playerCount"`
	WinnerID    *string        `gorm:"column:winner_id;type:uuid"                       json:"winnerId,omitempty"`
	WinnerSeat  *int           `gorm:"column:winner_seat"                               json:"winnerSeat,omitempty"`
	TurnCount   int            `gorm:"column:turn_count;not null;default:0"             json:"turnCount"`
	Settings    string         `gorm:"column:settings;type:jsonb;not null;default:'{}'" json:"settings"`
	StartedAt   *time.Time     `gorm:"column:started_at"                                json:"startedAt,omitempty"`
	EndedAt     *time.Time     `gorm:"column:ended_at"                                  json:"endedAt,omitempty"`
	CreatedAt   time.Time      `gorm:"column:created_at"                                json:"createdAt"`

	// Relations
	Room        *Room         `gorm:"foreignKey:RoomID"   json:"-"`
	Winner      *User         `gorm:"foreignKey:WinnerID" json:"-"`
	Players     []GamePlayer  `gorm:"foreignKey:GameID"   json:"players,omitempty"`
}

// Room 방 영속 모델 (PostgreSQL)
// 참조: docs/02-design/02-database-design.md §2 (방 생성 → 게임 시작 흐름)
type Room struct {
	ID          string         `gorm:"primaryKey;type:uuid;default:gen_random_uuid()"   json:"id"`
	RoomCode    string         `gorm:"column:room_code;type:varchar(10);uniqueIndex;not null" json:"roomCode"`
	Name        string         `gorm:"type:varchar(100);not null"                       json:"name"`
	HostUserID  string         `gorm:"column:host_user_id;type:uuid;not null"           json:"hostUserId"`
	MaxPlayers  int            `gorm:"column:max_players;not null;default:4"            json:"maxPlayers"`
	TurnTimeout int            `gorm:"column:turn_timeout;not null;default:60"          json:"turnTimeout"`
	Status      RoomStatus     `gorm:"type:varchar(20);not null;default:'WAITING'"      json:"status"`
	GameID      *string        `gorm:"column:game_id;type:uuid"                         json:"gameId,omitempty"`
	CreatedAt   time.Time      `gorm:"column:created_at"                                json:"createdAt"`
	UpdatedAt   time.Time      `gorm:"column:updated_at"                                json:"updatedAt"`
	DeletedAt   gorm.DeletedAt `gorm:"index"                                            json:"-"`

	// Relations
	Host        User  `gorm:"foreignKey:HostUserID" json:"-"`
	Game        *Game `gorm:"foreignKey:GameID"     json:"-"`
}
