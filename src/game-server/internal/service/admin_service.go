package service

import (
	"context"
	"math"

	"go.uber.org/zap"

	"github.com/k82022603/RummiArena/game-server/internal/repository"
)

// AdminDashboard 관리자 종합 통계 DTO.
type AdminDashboard struct {
	TotalGames      int64   `json:"totalGames"`
	ActiveGames     int64   `json:"activeGames"`
	TotalUsers      int64   `json:"totalUsers"`
	AIGames         int64   `json:"aiGames"`
	AvgGameDuration float64 `json:"avgGameDuration"`
}

// AdminGameItem 관리자 게임 목록 항목 DTO.
type AdminGameItem struct {
	ID          string `json:"id"`
	Status      string `json:"status"`
	PlayerCount int    `json:"playerCount"`
	AICount     int64  `json:"aiCount"`
	CreatedAt   string `json:"createdAt"`
	Duration    *int64 `json:"duration"`
}

// AdminUserItem 관리자 사용자 목록 항목 DTO.
type AdminUserItem struct {
	ID          string  `json:"id"`
	Username    string  `json:"username"`
	Email       string  `json:"email"`
	GamesPlayed int     `json:"gamesPlayed"`
	WinRate     float64 `json:"winRate"`
	CreatedAt   string  `json:"createdAt"`
}

// AdminAIStats AI 통계 DTO.
// 실제 AI 호출 이력이 아직 DB에 저장되지 않으므로 기본값을 반환한다.
type AdminAIStats struct {
	TotalAICalls    int64            `json:"totalAiCalls"`
	AvgResponseTime int64            `json:"avgResponseTime"`
	SuccessRate     float64          `json:"successRate"`
	ModelStats      []AdminModelStat `json:"modelStats"`
}

// AdminModelStat 모델별 AI 통계 DTO.
type AdminModelStat struct {
	Model       string  `json:"model"`
	Calls       int64   `json:"calls"`
	AvgTime     int64   `json:"avgTime"`
	SuccessRate float64 `json:"successRate"`
}

// AdminEloStats ELO 분포 통계 DTO.
type AdminEloStats struct {
	Distribution []repository.EloTierCount     `json:"distribution"`
	AvgRating    int                           `json:"avgRating"`
	TopPlayers   []*repository.AdminTopPlayer  `json:"topPlayers"`
}

// AdminPerformanceStats 성능 통계 DTO.
type AdminPerformanceStats struct {
	AvgGameDuration float64 `json:"avgGameDuration"`
	P50             float64 `json:"p50"`
	P95             float64 `json:"p95"`
	GamesPerHour    float64 `json:"gamesPerHour"`
}

// AdminGameDetail 게임 상세 DTO.
type AdminGameDetail struct {
	ID      string        `json:"id"`
	Status  string        `json:"status"`
	Players []interface{} `json:"players"`
	Events  []interface{} `json:"events"`
}

// AdminService 관리자 대시보드 비즈니스 로직 인터페이스.
type AdminService interface {
	GetDashboard(ctx context.Context) (*AdminDashboard, error)
	ListGames(ctx context.Context, limit int) ([]AdminGameItem, error)
	ListUsers(ctx context.Context) ([]AdminUserItem, error)
	GetAIStats(ctx context.Context) (*AdminAIStats, error)
	GetEloStats(ctx context.Context) (*AdminEloStats, error)
	GetGameDetail(ctx context.Context, id string) (*AdminGameDetail, error)
	GetPerformanceStats(ctx context.Context) (*AdminPerformanceStats, error)
}

// adminService AdminService 구현체.
type adminService struct {
	adminRepo repository.AdminRepository
	logger    *zap.Logger
}

// NewAdminService AdminService 생성자.
func NewAdminService(adminRepo repository.AdminRepository, logger *zap.Logger) AdminService {
	return &adminService{
		adminRepo: adminRepo,
		logger:    logger,
	}
}

func (s *adminService) GetDashboard(ctx context.Context) (*AdminDashboard, error) {
	totalGames, err := s.adminRepo.CountGames(ctx)
	if err != nil {
		s.logger.Warn("admin: count games failed", zap.Error(err))
	}

	activeGames, err := s.adminRepo.CountActiveGames(ctx)
	if err != nil {
		s.logger.Warn("admin: count active games failed", zap.Error(err))
	}

	totalUsers, err := s.adminRepo.CountUsers(ctx)
	if err != nil {
		s.logger.Warn("admin: count users failed", zap.Error(err))
	}

	aiGames, err := s.adminRepo.CountAIGames(ctx)
	if err != nil {
		s.logger.Warn("admin: count ai games failed", zap.Error(err))
	}

	avgDuration, err := s.adminRepo.AvgGameDurationSeconds(ctx)
	if err != nil {
		s.logger.Warn("admin: avg game duration failed", zap.Error(err))
	}

	return &AdminDashboard{
		TotalGames:      totalGames,
		ActiveGames:     activeGames,
		TotalUsers:      totalUsers,
		AIGames:         aiGames,
		AvgGameDuration: avgDuration,
	}, nil
}

func (s *adminService) ListGames(ctx context.Context, limit int) ([]AdminGameItem, error) {
	rows, err := s.adminRepo.ListRecentGames(ctx, limit)
	if err != nil {
		s.logger.Warn("admin: list recent games failed", zap.Error(err))
		return []AdminGameItem{}, nil
	}

	items := make([]AdminGameItem, 0, len(rows))
	for _, row := range rows {
		items = append(items, AdminGameItem{
			ID:          row.ID,
			Status:      string(row.Status),
			PlayerCount: row.PlayerCount,
			AICount:     row.AICount,
			CreatedAt:   row.CreatedAt.UTC().Format("2006-01-02T15:04:05Z"),
			Duration:    row.DurationSec,
		})
	}
	return items, nil
}

func (s *adminService) ListUsers(ctx context.Context) ([]AdminUserItem, error) {
	rows, err := s.adminRepo.ListUsers(ctx)
	if err != nil {
		s.logger.Warn("admin: list users failed", zap.Error(err))
		return []AdminUserItem{}, nil
	}

	items := make([]AdminUserItem, 0, len(rows))
	for _, row := range rows {
		items = append(items, AdminUserItem{
			ID:          row.ID,
			Username:    row.Username,
			Email:       row.Email,
			GamesPlayed: row.GamesPlayed,
			WinRate:     row.WinRate,
			CreatedAt:   row.CreatedAt.UTC().Format("2006-01-02T15:04:05Z"),
		})
	}
	return items, nil
}

// GetAIStats AI 호출 통계를 반환한다.
// AI 호출 이력 테이블이 아직 구현되지 않았으므로 게임 DB에서 집계한 간소화된 통계를 반환한다.
func (s *adminService) GetAIStats(ctx context.Context) (*AdminAIStats, error) {
	aiGames, err := s.adminRepo.CountAIGames(ctx)
	if err != nil {
		s.logger.Warn("admin: ai stats count failed", zap.Error(err))
	}
	return &AdminAIStats{
		TotalAICalls:    aiGames,
		AvgResponseTime: 0,
		SuccessRate:     0,
		ModelStats:      []AdminModelStat{},
	}, nil
}

func (s *adminService) GetEloStats(ctx context.Context) (*AdminEloStats, error) {
	dist, err := s.adminRepo.GetEloDistribution(ctx)
	if err != nil {
		s.logger.Warn("admin: elo distribution failed", zap.Error(err))
		dist = []repository.EloTierCount{}
	}

	avgRaw, err := s.adminRepo.AvgEloRating(ctx)
	if err != nil {
		s.logger.Warn("admin: avg elo failed", zap.Error(err))
	}

	topPlayers, err := s.adminRepo.GetTopPlayers(ctx, 10)
	if err != nil {
		s.logger.Warn("admin: top players failed", zap.Error(err))
		topPlayers = []*repository.AdminTopPlayer{}
	}

	return &AdminEloStats{
		Distribution: dist,
		AvgRating:    int(math.Round(avgRaw)),
		TopPlayers:   topPlayers,
	}, nil
}

func (s *adminService) GetGameDetail(ctx context.Context, id string) (*AdminGameDetail, error) {
	game, err := s.adminRepo.GetGameByID(ctx, id)
	if err != nil {
		return nil, err
	}

	players, err := s.adminRepo.GetGamePlayersByGameID(ctx, id)
	if err != nil {
		s.logger.Warn("admin: get game players failed", zap.String("gameID", id), zap.Error(err))
		players = nil
	}

	playerList := make([]interface{}, 0, len(players))
	for _, p := range players {
		playerList = append(playerList, p)
	}

	return &AdminGameDetail{
		ID:      game.ID,
		Status:  string(game.Status),
		Players: playerList,
		Events:  []interface{}{},
	}, nil
}

func (s *adminService) GetPerformanceStats(ctx context.Context) (*AdminPerformanceStats, error) {
	avg, err := s.adminRepo.AvgGameDurationSeconds(ctx)
	if err != nil {
		s.logger.Warn("admin: perf avg duration failed", zap.Error(err))
	}

	p50, p95, err := s.adminRepo.GetGameDurationPercentiles(ctx)
	if err != nil {
		s.logger.Warn("admin: perf percentiles failed", zap.Error(err))
	}

	countLastHour, err := s.adminRepo.CountGamesLastHour(ctx)
	if err != nil {
		s.logger.Warn("admin: perf games last hour failed", zap.Error(err))
	}

	return &AdminPerformanceStats{
		AvgGameDuration: avg,
		P50:             p50,
		P95:             p95,
		GamesPerHour:    float64(countLastHour),
	}, nil
}
