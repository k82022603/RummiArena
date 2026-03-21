package model

import "time"

// PracticeProgress 연습 모드 스테이지 완료 기록 (PostgreSQL)
type PracticeProgress struct {
	ID          string    `gorm:"primaryKey;type:uuid;default:gen_random_uuid()" json:"id"`
	UserID      string    `gorm:"column:user_id;type:varchar(255);not null;index" json:"userId"`
	Stage       int       `gorm:"column:stage;not null"                          json:"stage"`
	Score       int       `gorm:"column:score;not null;default:0"                json:"score"`
	CompletedAt time.Time `gorm:"column:completed_at;not null"                   json:"completedAt"`
	CreatedAt   time.Time `gorm:"column:created_at;autoCreateTime"               json:"createdAt"`
}
