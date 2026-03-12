package model

import (
	"time"

	"gorm.io/gorm"
)

type GameStatus string

const (
	GameStatusWaiting   GameStatus = "WAITING"
	GameStatusPlaying   GameStatus = "PLAYING"
	GameStatusFinished  GameStatus = "FINISHED"
	GameStatusCancelled GameStatus = "CANCELLED"
)

type Game struct {
	ID              string         `gorm:"primaryKey;type:uuid;default:gen_random_uuid()" json:"id"`
	Status          GameStatus     `gorm:"type:varchar(20);not null;default:'WAITING'"     json:"status"`
	MaxPlayers      int            `gorm:"not null;default:4"                              json:"maxPlayers"`
	CurrentSeat     int            `gorm:"not null;default:0"                              json:"currentSeat"`
	TurnTimeoutSecs int            `gorm:"not null;default:60"                             json:"turnTimeoutSecs"`
	DrawPileCount   int            `gorm:"not null;default:0"                              json:"drawPileCount"`
	WinnerID        *string        `gorm:"type:uuid"                                       json:"winnerId,omitempty"`
	CreatedAt       time.Time      `json:"createdAt"`
	UpdatedAt       time.Time      `json:"updatedAt"`
	DeletedAt       gorm.DeletedAt `gorm:"index"                                           json:"-"`
}

type Room struct {
	ID        string         `gorm:"primaryKey;type:uuid;default:gen_random_uuid()" json:"id"`
	Name      string         `gorm:"type:varchar(100);not null"                     json:"name"`
	HostID    string         `gorm:"type:uuid;not null"                             json:"hostId"`
	GameID    *string        `gorm:"type:uuid"                                      json:"gameId,omitempty"`
	IsPrivate bool           `gorm:"not null;default:false"                         json:"isPrivate"`
	Password  string         `gorm:"type:varchar(255)"                              json:"-"`
	CreatedAt time.Time      `json:"createdAt"`
	UpdatedAt time.Time      `json:"updatedAt"`
	DeletedAt gorm.DeletedAt `gorm:"index"                                           json:"-"`
}
