package repository

import (
	"context"
	"fmt"
	"time"

	"gorm.io/gorm"

	"github.com/k82022603/RummiArena/game-server/internal/model"
)

// AdminRepository 관리자 대시보드용 집계 쿼리 인터페이스.
type AdminRepository interface {
	// CountGames 전체 게임 수를 반환한다.
	CountGames(ctx context.Context) (int64, error)
	// CountActiveGames PLAYING 상태 게임 수를 반환한다.
	CountActiveGames(ctx context.Context) (int64, error)
	// CountUsers 전체 사용자 수를 반환한다.
	CountUsers(ctx context.Context) (int64, error)
	// CountAIGames AI 플레이어가 포함된 게임 수를 반환한다.
	CountAIGames(ctx context.Context) (int64, error)
	// AvgGameDurationSeconds 완료된 게임의 평균 소요 시간(초)을 반환한다.
	AvgGameDurationSeconds(ctx context.Context) (float64, error)
	// ListRecentGames 최근 게임을 최대 limit개 반환한다.
	ListRecentGames(ctx context.Context, limit int) ([]*AdminGameRow, error)
	// GetGameByID 게임 상세를 반환한다. 없으면 ErrNotFound.
	GetGameByID(ctx context.Context, id string) (*model.Game, error)
	// GetGamePlayersByGameID 게임 참가자 목록을 반환한다.
	GetGamePlayersByGameID(ctx context.Context, gameID string) ([]*model.GamePlayer, error)
	// ListUsers 전체 사용자 목록을 반환한다.
	ListUsers(ctx context.Context) ([]*AdminUserRow, error)
	// GetEloDistribution 티어별 인원 분포를 반환한다.
	GetEloDistribution(ctx context.Context) ([]EloTierCount, error)
	// AvgEloRating 전체 평균 ELO 레이팅을 반환한다.
	AvgEloRating(ctx context.Context) (float64, error)
	// GetTopPlayers 상위 N명의 ELO 레이팅을 반환한다.
	GetTopPlayers(ctx context.Context, n int) ([]*AdminTopPlayer, error)
	// GetGameDurationPercentiles 게임 소요 시간의 p50/p95를 반환한다.
	GetGameDurationPercentiles(ctx context.Context) (p50, p95 float64, err error)
	// CountGamesLastHour 최근 1시간 이내에 완료된 게임 수를 반환한다.
	CountGamesLastHour(ctx context.Context) (int64, error)
}

// AdminGameRow 관리자 게임 목록 응답에 사용하는 집계 로우.
type AdminGameRow struct {
	ID          string           `json:"id"`
	Status      model.GameStatus `json:"status"`
	PlayerCount int              `json:"playerCount"`
	AICount     int64            `json:"aiCount"`
	CreatedAt   time.Time        `json:"createdAt"`
	DurationSec *int64           `json:"duration"` // 완료 게임만: EndedAt - StartedAt (초)
}

// AdminUserRow 관리자 사용자 목록 응답에 사용하는 집계 로우.
type AdminUserRow struct {
	ID          string    `json:"id"`
	Username    string    `json:"username"`
	Email       string    `json:"email"`
	GamesPlayed int       `json:"gamesPlayed"`
	WinRate     float64   `json:"winRate"`
	CreatedAt   time.Time `json:"createdAt"`
}

// EloTierCount 티어별 인원 수 집계.
type EloTierCount struct {
	Tier  string `json:"tier"`
	Count int64  `json:"count"`
}

// AdminTopPlayer 상위 플레이어 요약.
type AdminTopPlayer struct {
	UserID   string `json:"userId"`
	Username string `json:"username"`
	Rating   int    `json:"rating"`
}

// postgresAdminRepo PostgreSQL 기반 AdminRepository 구현체.
type postgresAdminRepo struct {
	db *gorm.DB
}

// NewPostgresAdminRepo PostgreSQL 기반 AdminRepository 생성자.
func NewPostgresAdminRepo(db *gorm.DB) AdminRepository {
	return &postgresAdminRepo{db: db}
}

func (r *postgresAdminRepo) CountGames(ctx context.Context) (int64, error) {
	var count int64
	if err := r.db.WithContext(ctx).Model(&model.Game{}).Count(&count).Error; err != nil {
		return 0, fmt.Errorf("admin_repo: count games: %w", err)
	}
	return count, nil
}

func (r *postgresAdminRepo) CountActiveGames(ctx context.Context) (int64, error) {
	var count int64
	if err := r.db.WithContext(ctx).Model(&model.Game{}).
		Where("status = ?", model.GameStatusPlaying).
		Count(&count).Error; err != nil {
		return 0, fmt.Errorf("admin_repo: count active games: %w", err)
	}
	return count, nil
}

func (r *postgresAdminRepo) CountUsers(ctx context.Context) (int64, error) {
	var count int64
	if err := r.db.WithContext(ctx).Model(&model.User{}).Count(&count).Error; err != nil {
		return 0, fmt.Errorf("admin_repo: count users: %w", err)
	}
	return count, nil
}

func (r *postgresAdminRepo) CountAIGames(ctx context.Context) (int64, error) {
	// AI 플레이어가 한 명 이상 포함된 고유 game_id 수를 센다.
	var count int64
	if err := r.db.WithContext(ctx).Model(&model.GamePlayer{}).
		Where("player_type != ?", model.PlayerTypeHuman).
		Distinct("game_id").
		Count(&count).Error; err != nil {
		return 0, fmt.Errorf("admin_repo: count ai games: %w", err)
	}
	return count, nil
}

func (r *postgresAdminRepo) AvgGameDurationSeconds(ctx context.Context) (float64, error) {
	var avg float64
	err := r.db.WithContext(ctx).
		Model(&model.Game{}).
		Where("status = ? AND started_at IS NOT NULL AND ended_at IS NOT NULL", model.GameStatusFinished).
		Select("COALESCE(AVG(EXTRACT(EPOCH FROM (ended_at - started_at))), 0)").
		Scan(&avg).Error
	if err != nil {
		return 0, fmt.Errorf("admin_repo: avg game duration: %w", err)
	}
	return avg, nil
}

func (r *postgresAdminRepo) ListRecentGames(ctx context.Context, limit int) ([]*AdminGameRow, error) {
	// games + game_players AI 수 집계를 JOIN 없이 처리한다.
	var games []model.Game
	if err := r.db.WithContext(ctx).
		Order("created_at DESC").
		Limit(limit).
		Find(&games).Error; err != nil {
		return nil, fmt.Errorf("admin_repo: list recent games: %w", err)
	}

	rows := make([]*AdminGameRow, 0, len(games))
	for i := range games {
		g := games[i]
		// AI 플레이어 수 집계
		var aiCount int64
		r.db.WithContext(ctx).Model(&model.GamePlayer{}).
			Where("game_id = ? AND player_type != ?", g.ID, model.PlayerTypeHuman).
			Count(&aiCount) //nolint:errcheck

		row := &AdminGameRow{
			ID:          g.ID,
			Status:      g.Status,
			PlayerCount: g.PlayerCount,
			AICount:     aiCount,
			CreatedAt:   g.CreatedAt,
		}
		if g.StartedAt != nil && g.EndedAt != nil {
			dur := int64(g.EndedAt.Sub(*g.StartedAt).Seconds())
			row.DurationSec = &dur
		}
		rows = append(rows, row)
	}
	return rows, nil
}

func (r *postgresAdminRepo) GetGameByID(ctx context.Context, id string) (*model.Game, error) {
	var game model.Game
	if err := r.db.WithContext(ctx).
		Preload("Players").
		First(&game, "id = ?", id).Error; err != nil {
		return nil, fmt.Errorf("admin_repo: get game %q: %w", id, err)
	}
	return &game, nil
}

func (r *postgresAdminRepo) GetGamePlayersByGameID(ctx context.Context, gameID string) ([]*model.GamePlayer, error) {
	var players []*model.GamePlayer
	if err := r.db.WithContext(ctx).
		Where("game_id = ?", gameID).
		Find(&players).Error; err != nil {
		return nil, fmt.Errorf("admin_repo: get game players game %q: %w", gameID, err)
	}
	return players, nil
}

func (r *postgresAdminRepo) ListUsers(ctx context.Context) ([]*AdminUserRow, error) {
	var users []model.User
	if err := r.db.WithContext(ctx).
		Order("created_at DESC").
		Find(&users).Error; err != nil {
		return nil, fmt.Errorf("admin_repo: list users: %w", err)
	}

	rows := make([]*AdminUserRow, 0, len(users))
	for i := range users {
		u := users[i]
		// 개인 ELO 통계 조회 (없을 수 있으므로 에러 무시)
		var elo model.EloRating
		var gamesPlayed int
		var winRate float64
		if err := r.db.WithContext(ctx).
			Where("user_id = ?", u.ID).
			First(&elo).Error; err == nil {
			gamesPlayed = elo.GamesPlayed
			if elo.GamesPlayed > 0 {
				winRate = float64(elo.Wins) / float64(elo.GamesPlayed)
			}
		}
		rows = append(rows, &AdminUserRow{
			ID:          u.ID,
			Username:    u.DisplayName,
			Email:       u.Email,
			GamesPlayed: gamesPlayed,
			WinRate:     winRate,
			CreatedAt:   u.CreatedAt,
		})
	}
	return rows, nil
}

func (r *postgresAdminRepo) GetEloDistribution(ctx context.Context) ([]EloTierCount, error) {
	type result struct {
		Tier  string
		Count int64
	}
	var results []result
	if err := r.db.WithContext(ctx).
		Model(&model.EloRating{}).
		Select("tier, COUNT(*) as count").
		Group("tier").
		Order("count DESC").
		Scan(&results).Error; err != nil {
		return nil, fmt.Errorf("admin_repo: elo distribution: %w", err)
	}

	out := make([]EloTierCount, 0, len(results))
	for _, res := range results {
		out = append(out, EloTierCount{Tier: res.Tier, Count: res.Count})
	}
	return out, nil
}

func (r *postgresAdminRepo) AvgEloRating(ctx context.Context) (float64, error) {
	var avg float64
	if err := r.db.WithContext(ctx).
		Model(&model.EloRating{}).
		Select("COALESCE(AVG(rating), 0)").
		Scan(&avg).Error; err != nil {
		return 0, fmt.Errorf("admin_repo: avg elo rating: %w", err)
	}
	return avg, nil
}

func (r *postgresAdminRepo) GetTopPlayers(ctx context.Context, n int) ([]*AdminTopPlayer, error) {
	type topRow struct {
		UserID      string
		DisplayName string
		Rating      int
	}
	var rows []topRow
	if err := r.db.WithContext(ctx).
		Table("elo_ratings er").
		Select("er.user_id, u.display_name, er.rating").
		Joins("LEFT JOIN users u ON u.id = er.user_id AND u.deleted_at IS NULL").
		Order("er.rating DESC").
		Limit(n).
		Scan(&rows).Error; err != nil {
		return nil, fmt.Errorf("admin_repo: top players: %w", err)
	}

	out := make([]*AdminTopPlayer, 0, len(rows))
	for _, row := range rows {
		out = append(out, &AdminTopPlayer{
			UserID:   row.UserID,
			Username: row.DisplayName,
			Rating:   row.Rating,
		})
	}
	return out, nil
}

func (r *postgresAdminRepo) GetGameDurationPercentiles(ctx context.Context) (p50, p95 float64, err error) {
	type percentileResult struct {
		P50 float64
		P95 float64
	}
	var res percentileResult
	queryErr := r.db.WithContext(ctx).
		Raw(`SELECT
			COALESCE(PERCENTILE_CONT(0.50) WITHIN GROUP (ORDER BY EXTRACT(EPOCH FROM (ended_at - started_at))), 0) AS p50,
			COALESCE(PERCENTILE_CONT(0.95) WITHIN GROUP (ORDER BY EXTRACT(EPOCH FROM (ended_at - started_at))), 0) AS p95
		FROM games
		WHERE status = ? AND started_at IS NOT NULL AND ended_at IS NOT NULL`,
			model.GameStatusFinished).
		Scan(&res).Error
	if queryErr != nil {
		return 0, 0, fmt.Errorf("admin_repo: game duration percentiles: %w", queryErr)
	}
	return res.P50, res.P95, nil
}

func (r *postgresAdminRepo) CountGamesLastHour(ctx context.Context) (int64, error) {
	var count int64
	since := time.Now().Add(-time.Hour)
	if err := r.db.WithContext(ctx).Model(&model.Game{}).
		Where("status = ? AND ended_at >= ?", model.GameStatusFinished, since).
		Count(&count).Error; err != nil {
		return 0, fmt.Errorf("admin_repo: count games last hour: %w", err)
	}
	return count, nil
}
