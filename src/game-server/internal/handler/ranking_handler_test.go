package handler

import (
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"net/http/httptest"
	"testing"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
	"go.uber.org/zap"

	"github.com/k82022603/RummiArena/game-server/internal/model"
	"github.com/k82022603/RummiArena/game-server/internal/repository"
)

// --- Mock Repository ---

// mockEloRepo EloRepository 메모리 기반 테스트 구현체.
type mockEloRepo struct {
	ratings   []model.EloRating
	histories []model.EloHistory
	findErr   error
}

func (m *mockEloRepo) GetByUserID(_ context.Context, userID string) (*model.EloRating, error) {
	if m.findErr != nil {
		return nil, m.findErr
	}
	for _, r := range m.ratings {
		if r.UserID == userID {
			cp := r
			return &cp, nil
		}
	}
	return nil, fmt.Errorf("elo_repo: user %q not found: %w", userID, repository.ErrNotFound)
}

func (m *mockEloRepo) Upsert(_ context.Context, rating *model.EloRating) error {
	m.ratings = append(m.ratings, *rating)
	return nil
}

func (m *mockEloRepo) AddHistory(_ context.Context, history *model.EloHistory) error {
	m.histories = append(m.histories, *history)
	return nil
}

func (m *mockEloRepo) GetTopN(_ context.Context, limit, offset int) ([]model.EloRating, error) {
	if m.findErr != nil {
		return nil, m.findErr
	}
	end := offset + limit
	if end > len(m.ratings) {
		end = len(m.ratings)
	}
	if offset >= len(m.ratings) {
		return []model.EloRating{}, nil
	}
	return m.ratings[offset:end], nil
}

func (m *mockEloRepo) GetByTier(_ context.Context, tier string, limit, offset int) ([]model.EloRating, error) {
	if m.findErr != nil {
		return nil, m.findErr
	}
	var filtered []model.EloRating
	for _, r := range m.ratings {
		if r.Tier == tier {
			filtered = append(filtered, r)
		}
	}
	end := offset + limit
	if end > len(filtered) {
		end = len(filtered)
	}
	if offset >= len(filtered) {
		return []model.EloRating{}, nil
	}
	return filtered[offset:end], nil
}

func (m *mockEloRepo) GetHistoryByUserID(_ context.Context, userID string, limit int) ([]model.EloHistory, error) {
	if m.findErr != nil {
		return nil, m.findErr
	}
	var result []model.EloHistory
	for _, h := range m.histories {
		if h.UserID == userID {
			result = append(result, h)
		}
	}
	if len(result) > limit {
		result = result[:limit]
	}
	return result, nil
}

func (m *mockEloRepo) CountAll(_ context.Context) (int64, error) {
	return int64(len(m.ratings)), nil
}

func (m *mockEloRepo) CountByTier(_ context.Context, tier string) (int64, error) {
	var count int64
	for _, r := range m.ratings {
		if r.Tier == tier {
			count++
		}
	}
	return count, nil
}

// --- 테스트 헬퍼 ---

func newTestRankingRouter(repo repository.EloRepository) *gin.Engine {
	gin.SetMode(gin.TestMode)
	r := gin.New()
	logger := zap.NewNop()
	h := NewRankingHandler(repo, logger)

	r.GET("/api/rankings", h.ListRankings)
	r.GET("/api/rankings/tier/:tier", h.ListRankingsByTier)
	r.GET("/api/users/:id/rating", h.GetUserRating)
	r.GET("/api/users/:id/rating/history", h.GetUserRatingHistory)
	return r
}

func sampleRatings() []model.EloRating {
	now := time.Now()
	return []model.EloRating{
		{ID: "id1", UserID: "user1", Rating: 1600, Tier: "PLATINUM", Wins: 30, GamesPlayed: 50, LastGameAt: &now},
		{ID: "id2", UserID: "user2", Rating: 1350, Tier: "GOLD", Wins: 20, GamesPlayed: 40},
		{ID: "id3", UserID: "user3", Rating: 1150, Tier: "SILVER", Wins: 15, GamesPlayed: 30},
	}
}

// --- 테스트 ---

func TestListRankings_OK(t *testing.T) {
	repo := &mockEloRepo{ratings: sampleRatings()}
	router := newTestRankingRouter(repo)

	w := httptest.NewRecorder()
	req := httptest.NewRequest(http.MethodGet, "/api/rankings?limit=10&offset=0", nil)
	router.ServeHTTP(w, req)

	assert.Equal(t, http.StatusOK, w.Code)

	var resp map[string]interface{}
	require.NoError(t, json.Unmarshal(w.Body.Bytes(), &resp))
	data, ok := resp["data"].([]interface{})
	require.True(t, ok, "data 필드가 배열이어야 한다")
	assert.Len(t, data, 3)
}

func TestListRankings_InvalidLimit(t *testing.T) {
	repo := &mockEloRepo{ratings: sampleRatings()}
	router := newTestRankingRouter(repo)

	w := httptest.NewRecorder()
	req := httptest.NewRequest(http.MethodGet, "/api/rankings?limit=0", nil)
	router.ServeHTTP(w, req)

	assert.Equal(t, http.StatusBadRequest, w.Code)
}

func TestListRankings_DBError(t *testing.T) {
	repo := &mockEloRepo{findErr: fmt.Errorf("db connection failed")}
	router := newTestRankingRouter(repo)

	w := httptest.NewRecorder()
	req := httptest.NewRequest(http.MethodGet, "/api/rankings", nil)
	router.ServeHTTP(w, req)

	assert.Equal(t, http.StatusInternalServerError, w.Code)
}

func TestListRankingsByTier_OK(t *testing.T) {
	repo := &mockEloRepo{ratings: sampleRatings()}
	router := newTestRankingRouter(repo)

	w := httptest.NewRecorder()
	req := httptest.NewRequest(http.MethodGet, "/api/rankings/tier/GOLD", nil)
	router.ServeHTTP(w, req)

	assert.Equal(t, http.StatusOK, w.Code)
	var resp map[string]interface{}
	require.NoError(t, json.Unmarshal(w.Body.Bytes(), &resp))
	assert.Equal(t, "GOLD", resp["tier"])
}

func TestListRankingsByTier_InvalidTier(t *testing.T) {
	repo := &mockEloRepo{ratings: sampleRatings()}
	router := newTestRankingRouter(repo)

	w := httptest.NewRecorder()
	req := httptest.NewRequest(http.MethodGet, "/api/rankings/tier/INVALID_TIER", nil)
	router.ServeHTTP(w, req)

	assert.Equal(t, http.StatusBadRequest, w.Code)
}

func TestGetUserRating_OK(t *testing.T) {
	repo := &mockEloRepo{ratings: sampleRatings()}
	router := newTestRankingRouter(repo)

	w := httptest.NewRecorder()
	req := httptest.NewRequest(http.MethodGet, "/api/users/user1/rating", nil)
	router.ServeHTTP(w, req)

	assert.Equal(t, http.StatusOK, w.Code)
	var resp map[string]interface{}
	require.NoError(t, json.Unmarshal(w.Body.Bytes(), &resp))
	assert.Equal(t, "user1", resp["userId"])
	assert.Equal(t, "PLATINUM", resp["tier"])
}

func TestGetUserRating_NotFound(t *testing.T) {
	repo := &mockEloRepo{ratings: sampleRatings()}
	router := newTestRankingRouter(repo)

	w := httptest.NewRecorder()
	req := httptest.NewRequest(http.MethodGet, "/api/users/nonexistent/rating", nil)
	router.ServeHTTP(w, req)

	assert.Equal(t, http.StatusNotFound, w.Code)
}

func TestGetUserRatingHistory_OK(t *testing.T) {
	histories := []model.EloHistory{
		{ID: "h1", UserID: "user1", GameID: "g1", RatingBefore: 1500, RatingAfter: 1512, RatingDelta: 12},
		{ID: "h2", UserID: "user1", GameID: "g2", RatingBefore: 1490, RatingAfter: 1500, RatingDelta: 10},
	}
	repo := &mockEloRepo{ratings: sampleRatings(), histories: histories}
	router := newTestRankingRouter(repo)

	w := httptest.NewRecorder()
	req := httptest.NewRequest(http.MethodGet, "/api/users/user1/rating/history?limit=10", nil)
	router.ServeHTTP(w, req)

	assert.Equal(t, http.StatusOK, w.Code)
	var resp map[string]interface{}
	require.NoError(t, json.Unmarshal(w.Body.Bytes(), &resp))
	data := resp["data"].([]interface{})
	assert.Len(t, data, 2)
}

func TestGetUserRatingHistory_InvalidLimit(t *testing.T) {
	repo := &mockEloRepo{}
	router := newTestRankingRouter(repo)

	w := httptest.NewRecorder()
	req := httptest.NewRequest(http.MethodGet, "/api/users/user1/rating/history?limit=-1", nil)
	router.ServeHTTP(w, req)

	assert.Equal(t, http.StatusBadRequest, w.Code)
}

// --- 유틸 함수 단위 테스트 ---

func TestCalcWinRate(t *testing.T) {
	assert.Equal(t, 0.0, calcWinRate(0, 0))
	assert.InDelta(t, 50.0, calcWinRate(5, 10), 0.001)
	assert.InDelta(t, 100.0, calcWinRate(10, 10), 0.001)
}

func TestTierProgress_Bronze(t *testing.T) {
	progress, next, toNext := tierProgress(1050, "BRONZE")
	assert.Equal(t, "SILVER", next)
	assert.Greater(t, progress, 0)
	assert.Equal(t, 1100-1050, toNext)
}

func TestTierProgress_Diamond(t *testing.T) {
	progress, next, toNext := tierProgress(2000, "DIAMOND")
	assert.Equal(t, 100, progress)
	assert.Equal(t, "", next)
	assert.Equal(t, 0, toNext)
}

func TestIsValidTier(t *testing.T) {
	validTiers := []string{"UNRANKED", "BRONZE", "SILVER", "GOLD", "PLATINUM", "DIAMOND"}
	for _, tier := range validTiers {
		assert.True(t, isValidTier(tier), "유효한 티어여야 한다: %s", tier)
	}
	assert.False(t, isValidTier("MASTER"))
	assert.False(t, isValidTier(""))
	assert.False(t, isValidTier("bronze")) // 소문자
}
