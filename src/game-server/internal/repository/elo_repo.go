package repository

import (
	"context"
	"errors"
	"fmt"

	"gorm.io/gorm"
	"gorm.io/gorm/clause"

	"github.com/k82022603/RummiArena/game-server/internal/model"
)

// EloRepository ELO 랭킹 데이터 접근 인터페이스.
type EloRepository interface {
	// GetByUserID 사용자 ID로 ELO 현황을 조회한다. 없으면 ErrNotFound.
	GetByUserID(ctx context.Context, userID string) (*model.EloRating, error)
	// Upsert ELO 레이팅을 삽입 또는 갱신한다 (UserID UniqueIndex 기반).
	Upsert(ctx context.Context, rating *model.EloRating) error
	// AddHistory ELO 변동 이력을 추가한다.
	AddHistory(ctx context.Context, history *model.EloHistory) error
	// GetTopN 전체 랭킹을 rating DESC 순으로 limit/offset 페이지네이션하여 반환한다.
	GetTopN(ctx context.Context, limit int, offset int) ([]model.EloRating, error)
	// GetByTier 티어별 랭킹을 rating DESC 순으로 반환한다.
	GetByTier(ctx context.Context, tier string, limit int, offset int) ([]model.EloRating, error)
	// GetHistoryByUserID 사용자의 ELO 변동 이력을 최신순으로 반환한다.
	GetHistoryByUserID(ctx context.Context, userID string, limit int) ([]model.EloHistory, error)
	// CountAll 전체 랭킹 등록 인원 수를 반환한다.
	CountAll(ctx context.Context) (int64, error)
	// CountByTier 티어별 인원 수를 반환한다.
	CountByTier(ctx context.Context, tier string) (int64, error)
}

// postgresEloRepo PostgreSQL 기반 EloRepository 구현체.
type postgresEloRepo struct {
	db *gorm.DB
}

// NewPostgresEloRepo PostgreSQL 기반 EloRepository 생성자.
func NewPostgresEloRepo(db *gorm.DB) EloRepository {
	return &postgresEloRepo{db: db}
}

// GetByUserID 사용자 ID로 ELO 현황을 조회한다.
func (r *postgresEloRepo) GetByUserID(ctx context.Context, userID string) (*model.EloRating, error) {
	var rating model.EloRating
	err := r.db.WithContext(ctx).
		Where("user_id = ?", userID).
		First(&rating).Error
	if err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return nil, fmt.Errorf("elo_repo: user %q not found: %w", userID, ErrNotFound)
		}
		return nil, fmt.Errorf("elo_repo: get by user_id %q: %w", userID, err)
	}
	return &rating, nil
}

// Upsert ELO 레이팅을 삽입하거나 user_id 충돌 시 지정 컬럼을 갱신한다.
func (r *postgresEloRepo) Upsert(ctx context.Context, rating *model.EloRating) error {
	err := r.db.WithContext(ctx).
		Clauses(clause.OnConflict{
			Columns: []clause.Column{{Name: "user_id"}},
			DoUpdates: clause.AssignmentColumns([]string{
				"rating", "tier", "wins", "losses", "draws",
				"games_played", "win_streak", "best_streak",
				"peak_rating", "last_game_at", "updated_at",
			}),
		}).
		Create(rating).Error
	if err != nil {
		return fmt.Errorf("elo_repo: upsert user_id %q: %w", rating.UserID, err)
	}
	return nil
}

// AddHistory ELO 변동 이력 레코드를 삽입한다.
func (r *postgresEloRepo) AddHistory(ctx context.Context, history *model.EloHistory) error {
	if err := r.db.WithContext(ctx).Create(history).Error; err != nil {
		return fmt.Errorf("elo_repo: add history user_id %q game_id %q: %w",
			history.UserID, history.GameID, err)
	}
	return nil
}

// GetTopN 전체 랭킹을 rating DESC로 반환한다.
func (r *postgresEloRepo) GetTopN(ctx context.Context, limit int, offset int) ([]model.EloRating, error) {
	var ratings []model.EloRating
	err := r.db.WithContext(ctx).
		Order("rating DESC").
		Limit(limit).
		Offset(offset).
		Find(&ratings).Error
	if err != nil {
		return nil, fmt.Errorf("elo_repo: get top %d (offset %d): %w", limit, offset, err)
	}
	return ratings, nil
}

// GetByTier 티어별 랭킹을 rating DESC로 반환한다.
func (r *postgresEloRepo) GetByTier(ctx context.Context, tier string, limit int, offset int) ([]model.EloRating, error) {
	var ratings []model.EloRating
	err := r.db.WithContext(ctx).
		Where("tier = ?", tier).
		Order("rating DESC").
		Limit(limit).
		Offset(offset).
		Find(&ratings).Error
	if err != nil {
		return nil, fmt.Errorf("elo_repo: get by tier %q (limit %d offset %d): %w", tier, limit, offset, err)
	}
	return ratings, nil
}

// GetHistoryByUserID 사용자의 ELO 변동 이력을 최신순으로 반환한다.
func (r *postgresEloRepo) GetHistoryByUserID(ctx context.Context, userID string, limit int) ([]model.EloHistory, error) {
	var histories []model.EloHistory
	err := r.db.WithContext(ctx).
		Where("user_id = ?", userID).
		Order("created_at DESC").
		Limit(limit).
		Find(&histories).Error
	if err != nil {
		return nil, fmt.Errorf("elo_repo: get history user_id %q: %w", userID, err)
	}
	return histories, nil
}

// CountAll 전체 랭킹 등록 인원 수를 반환한다.
func (r *postgresEloRepo) CountAll(ctx context.Context) (int64, error) {
	var count int64
	if err := r.db.WithContext(ctx).Model(&model.EloRating{}).Count(&count).Error; err != nil {
		return 0, fmt.Errorf("elo_repo: count all: %w", err)
	}
	return count, nil
}

// CountByTier 티어별 인원 수를 반환한다.
func (r *postgresEloRepo) CountByTier(ctx context.Context, tier string) (int64, error) {
	var count int64
	if err := r.db.WithContext(ctx).Model(&model.EloRating{}).
		Where("tier = ?", tier).
		Count(&count).Error; err != nil {
		return 0, fmt.Errorf("elo_repo: count by tier %q: %w", tier, err)
	}
	return count, nil
}

// ErrNotFound 리포지터리 레코드 없음 센티널 에러.
var ErrNotFound = errors.New("not found")
