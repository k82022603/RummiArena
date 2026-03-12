package model

import (
	"time"

	"gorm.io/gorm"
)

type PlayerType string

const (
	PlayerTypeHuman PlayerType = "HUMAN"
	PlayerTypeAI    PlayerType = "AI"
)

type User struct {
	ID        string         `gorm:"primaryKey;type:uuid;default:gen_random_uuid()" json:"id"`
	GoogleID  string         `gorm:"type:varchar(255);uniqueIndex;not null"          json:"googleId"`
	Email     string         `gorm:"type:varchar(255);uniqueIndex;not null"          json:"email"`
	Nickname  string         `gorm:"type:varchar(100);not null"                     json:"nickname"`
	AvatarURL string         `gorm:"type:varchar(500)"                              json:"avatarUrl"`
	EloRating int            `gorm:"not null;default:1000"                          json:"eloRating"`
	CreatedAt time.Time      `json:"createdAt"`
	UpdatedAt time.Time      `json:"updatedAt"`
	DeletedAt gorm.DeletedAt `gorm:"index"                                           json:"-"`
}

type GamePlayer struct {
	ID              string     `gorm:"primaryKey;type:uuid;default:gen_random_uuid()" json:"id"`
	GameID          string     `gorm:"type:uuid;not null;index"                       json:"gameId"`
	UserID          *string    `gorm:"type:uuid"                                      json:"userId,omitempty"`
	SeatOrder       int        `gorm:"not null"                                       json:"seatOrder"`
	PlayerType      PlayerType `gorm:"type:varchar(10);not null"                      json:"playerType"`
	AIModel         string     `gorm:"type:varchar(50)"                               json:"aiModel,omitempty"`
	HasInitialMeld  bool       `gorm:"not null;default:false"                         json:"hasInitialMeld"`
	RackTileCount   int        `gorm:"not null;default:14"                            json:"rackTileCount"`
	FinalScore      *int       `json:"finalScore,omitempty"`
	IsWinner        bool       `gorm:"not null;default:false"                         json:"isWinner"`
	ConsecForceDraw int        `gorm:"not null;default:0"                             json:"consecForceDraw"`
	CreatedAt       time.Time  `json:"createdAt"`
	UpdatedAt       time.Time  `json:"updatedAt"`
}
