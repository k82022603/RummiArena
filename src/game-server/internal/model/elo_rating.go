package model

import "time"

// EloRating 플레이어 랭킹 통계 영속 모델 (PostgreSQL)
// 참조: docs/01-planning/10-phase4-elo-design.md §4.2
type EloRating struct {
	ID          string     `gorm:"primaryKey;type:uuid;default:gen_random_uuid()" json:"id"`
	UserID      string     `gorm:"column:user_id;type:uuid;not null;uniqueIndex"   json:"userId"`
	Rating      int        `gorm:"column:rating;not null;default:1000"             json:"rating"`
	Tier        string     `gorm:"column:tier;type:varchar(20);not null;default:'UNRANKED'" json:"tier"`
	Wins        int        `gorm:"column:wins;not null;default:0"                  json:"wins"`
	Losses      int        `gorm:"column:losses;not null;default:0"                json:"losses"`
	Draws       int        `gorm:"column:draws;not null;default:0"                 json:"draws"`
	GamesPlayed int        `gorm:"column:games_played;not null;default:0"          json:"gamesPlayed"`
	WinStreak   int        `gorm:"column:win_streak;not null;default:0"            json:"winStreak"`
	BestStreak  int        `gorm:"column:best_streak;not null;default:0"           json:"bestStreak"`
	PeakRating  int        `gorm:"column:peak_rating;not null;default:1000"        json:"peakRating"`
	LastGameAt  *time.Time `gorm:"column:last_game_at"                             json:"lastGameAt,omitempty"`
	CreatedAt   time.Time  `gorm:"column:created_at;autoCreateTime"                json:"createdAt"`
	UpdatedAt   time.Time  `gorm:"column:updated_at;autoUpdateTime"                json:"updatedAt"`
}
