package model

import (
	"time"

	"gorm.io/gorm"
)

// PlayerType 플레이어 유형 (GORM + 도메인 공용)
type PlayerType string

const (
	PlayerTypeHuman      PlayerType = "HUMAN"
	PlayerTypeAIOpenAI   PlayerType = "AI_OPENAI"
	PlayerTypeClaude     PlayerType = "AI_CLAUDE"
	PlayerTypeDeepSeek   PlayerType = "AI_DEEPSEEK"
	PlayerTypeLLaMA      PlayerType = "AI_LLAMA"
)

// UserRole 사용자 권한
type UserRole string

const (
	UserRoleUser  UserRole = "ROLE_USER"
	UserRoleAdmin UserRole = "ROLE_ADMIN"
)

// User 사용자 영속 모델 (PostgreSQL)
// 참조: docs/02-design/02-database-design.md §2.1
type User struct {
	ID          string         `gorm:"primaryKey;type:uuid;default:gen_random_uuid()"   json:"id"`
	GoogleID    string         `gorm:"column:google_id;type:varchar(255);uniqueIndex;not null" json:"googleId"`
	Email       string         `gorm:"type:varchar(255);uniqueIndex;not null"           json:"email"`
	DisplayName string         `gorm:"column:display_name;type:varchar(100);not null"   json:"displayName"`
	AvatarURL   string         `gorm:"column:avatar_url;type:text"                      json:"avatarUrl,omitempty"`
	Role        UserRole       `gorm:"type:varchar(20);not null;default:'ROLE_USER'"    json:"role"`
	EloRating   int            `gorm:"column:elo_rating;not null;default:1000"          json:"eloRating"`
	IsBlocked   bool           `gorm:"column:is_blocked;not null;default:false"         json:"isBlocked"`
	CreatedAt   time.Time      `gorm:"column:created_at"                                json:"createdAt"`
	UpdatedAt   time.Time      `gorm:"column:updated_at"                                json:"updatedAt"`
	DeletedAt   gorm.DeletedAt `gorm:"index"                                            json:"-"`
}

// GamePlayer 게임 참가자 영속 모델 (PostgreSQL)
// 참조: docs/02-design/02-database-design.md §2.3
type GamePlayer struct {
	ID                 string         `gorm:"primaryKey;type:uuid;default:gen_random_uuid()"   json:"id"`
	GameID             string         `gorm:"column:game_id;type:uuid;not null;index"          json:"gameId"`
	UserID             *string        `gorm:"column:user_id;type:uuid"                         json:"userId,omitempty"`
	PlayerType         PlayerType     `gorm:"column:player_type;type:varchar(20);not null"     json:"playerType"`
	AIModel            string         `gorm:"column:ai_model;type:varchar(100)"                json:"aiModel,omitempty"`
	AIPersona          string         `gorm:"column:ai_persona;type:varchar(30)"               json:"aiPersona,omitempty"`
	AIDifficulty       string         `gorm:"column:ai_difficulty;type:varchar(20)"            json:"aiDifficulty,omitempty"`
	AIPsychologyLevel  *int           `gorm:"column:ai_psychology_level"                       json:"aiPsychologyLevel,omitempty"`
	SeatOrder          int            `gorm:"column:seat_order;not null"                       json:"seatOrder"`
	InitialTiles       int            `gorm:"column:initial_tiles;not null;default:14"         json:"initialTiles"`
	FinalTiles         *int           `gorm:"column:final_tiles"                               json:"finalTiles,omitempty"`
	Score              *int           `gorm:"column:score"                                     json:"score,omitempty"`
	IsWinner           bool           `gorm:"column:is_winner;not null;default:false"          json:"isWinner"`
	CreatedAt          time.Time      `gorm:"column:created_at"                                json:"createdAt"`
	UpdatedAt          time.Time      `gorm:"column:updated_at"                                json:"updatedAt"`

	// Relations
	Game Game  `gorm:"foreignKey:GameID" json:"-"`
	User *User `gorm:"foreignKey:UserID" json:"-"`
}
