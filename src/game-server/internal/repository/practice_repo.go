package repository

import (
	"context"
	"fmt"

	"gorm.io/gorm"

	"github.com/k82022603/RummiArena/game-server/internal/model"
)

// PracticeProgressRepository 연습 모드 진행 기록 저장소 인터페이스.
type PracticeProgressRepository interface {
	SaveProgress(ctx context.Context, p *model.PracticeProgress) error
	GetProgressByUserID(ctx context.Context, userID string) ([]*model.PracticeProgress, error)
}

// postgresProgressRepo PostgreSQL 기반 PracticeProgressRepository 구현체.
type postgresProgressRepo struct {
	db *gorm.DB
}

// NewPostgresPracticeRepo PostgreSQL 기반 PracticeProgressRepository 생성자.
func NewPostgresPracticeRepo(db *gorm.DB) PracticeProgressRepository {
	return &postgresProgressRepo{db: db}
}

// SaveProgress 연습 진행 기록을 저장한다.
func (r *postgresProgressRepo) SaveProgress(ctx context.Context, p *model.PracticeProgress) error {
	if err := r.db.WithContext(ctx).Create(p).Error; err != nil {
		return fmt.Errorf("practice_repo: save progress: %w", err)
	}
	return nil
}

// GetProgressByUserID 사용자 ID로 연습 진행 기록 목록을 조회한다.
func (r *postgresProgressRepo) GetProgressByUserID(ctx context.Context, userID string) ([]*model.PracticeProgress, error) {
	var records []*model.PracticeProgress
	if err := r.db.WithContext(ctx).
		Where("user_id = ?", userID).
		Order("completed_at DESC").
		Find(&records).Error; err != nil {
		return nil, fmt.Errorf("practice_repo: get progress by user_id %q: %w", userID, err)
	}
	return records, nil
}
