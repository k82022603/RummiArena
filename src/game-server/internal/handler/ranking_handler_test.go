package handler

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"os"
	"testing"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
	"go.uber.org/zap"
	"gorm.io/driver/postgres"
	"gorm.io/gorm"
	gormlogger "gorm.io/gorm/logger"

	"github.com/k82022603/RummiArena/game-server/internal/model"
	"github.com/k82022603/RummiArena/game-server/internal/repository"
)

// --- DB 헬퍼 ---

// testDBForRanking 테스트용 PostgreSQL DB를 연결하고 EloRating 테이블을 마이그레이션한다.
func testDBForRanking(t *testing.T) *gorm.DB {
	t.Helper()
	dsn := os.Getenv("TEST_DB_URL")
	if dsn == "" {
		dsn = "host=localhost port=5432 user=rummikub password=REDACTED_DB_PASSWORD dbname=rummikub sslmode=disable"
	}
	db, err := gorm.Open(postgres.Open(dsn), &gorm.Config{
		Logger:                                   gormlogger.Default.LogMode(gormlogger.Silent),
		DisableForeignKeyConstraintWhenMigrating: true,
	})
	if err != nil {
		t.Skipf("PostgreSQL 연결 실패 (skip): %v", err)
	}
	sqlDB, err := db.DB()
	if err != nil {
		t.Skipf("sql.DB 획득 실패 (skip): %v", err)
	}
	if err := sqlDB.Ping(); err != nil {
		t.Skipf("PostgreSQL ping 실패 (skip): %v", err)
	}
	require.NoError(t, db.AutoMigrate(&model.EloRating{}, &model.EloHistory{}))
	return db
}

// cleanupRankingTestData 테스트 후 test- 접두사 데이터를 제거한다.
func cleanupRankingTestData(t *testing.T, db *gorm.DB) {
	t.Helper()
	db.Exec("DELETE FROM elo_history WHERE user_id LIKE 'test-%'")
	db.Exec("DELETE FROM elo_ratings WHERE user_id LIKE 'test-%'")
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

// seedRankingData 테스트 데이터를 DB에 삽입한다.
func seedRankingData(t *testing.T, repo repository.EloRepository) {
	t.Helper()
	now := time.Now()
	ratings := []model.EloRating{
		{UserID: "test-user1", Rating: 1600, Tier: "PLATINUM", Wins: 30, GamesPlayed: 50, LastGameAt: &now},
		{UserID: "test-user2", Rating: 1350, Tier: "GOLD", Wins: 20, GamesPlayed: 40},
		{UserID: "test-user3", Rating: 1150, Tier: "SILVER", Wins: 15, GamesPlayed: 30},
	}
	for _, r := range ratings {
		r := r
		require.NoError(t, repo.Upsert(t.Context(), &r))
	}
}

// --- 테스트 ---

func TestListRankings_OK(t *testing.T) {
	db := testDBForRanking(t)
	repo := repository.NewPostgresEloRepo(db)
	defer cleanupRankingTestData(t, db)
	seedRankingData(t, repo)

	router := newTestRankingRouter(repo)

	w := httptest.NewRecorder()
	req := httptest.NewRequest(http.MethodGet, "/api/rankings?limit=10&offset=0", nil)
	router.ServeHTTP(w, req)

	assert.Equal(t, http.StatusOK, w.Code)

	var resp map[string]interface{}
	require.NoError(t, json.Unmarshal(w.Body.Bytes(), &resp))
	data, ok := resp["data"].([]interface{})
	require.True(t, ok, "data 필드가 배열이어야 한다")
	assert.GreaterOrEqual(t, len(data), 3)
}

func TestListRankings_InvalidLimit(t *testing.T) {
	db := testDBForRanking(t)
	repo := repository.NewPostgresEloRepo(db)
	defer cleanupRankingTestData(t, db)

	router := newTestRankingRouter(repo)

	w := httptest.NewRecorder()
	req := httptest.NewRequest(http.MethodGet, "/api/rankings?limit=0", nil)
	router.ServeHTTP(w, req)

	assert.Equal(t, http.StatusBadRequest, w.Code)
}

func TestListRankingsByTier_OK(t *testing.T) {
	db := testDBForRanking(t)
	repo := repository.NewPostgresEloRepo(db)
	defer cleanupRankingTestData(t, db)
	seedRankingData(t, repo)

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
	db := testDBForRanking(t)
	repo := repository.NewPostgresEloRepo(db)
	defer cleanupRankingTestData(t, db)

	router := newTestRankingRouter(repo)

	w := httptest.NewRecorder()
	req := httptest.NewRequest(http.MethodGet, "/api/rankings/tier/INVALID_TIER", nil)
	router.ServeHTTP(w, req)

	assert.Equal(t, http.StatusBadRequest, w.Code)
}

func TestGetUserRating_OK(t *testing.T) {
	db := testDBForRanking(t)
	repo := repository.NewPostgresEloRepo(db)
	defer cleanupRankingTestData(t, db)
	seedRankingData(t, repo)

	router := newTestRankingRouter(repo)

	w := httptest.NewRecorder()
	req := httptest.NewRequest(http.MethodGet, "/api/users/test-user1/rating", nil)
	router.ServeHTTP(w, req)

	assert.Equal(t, http.StatusOK, w.Code)
	var resp map[string]interface{}
	require.NoError(t, json.Unmarshal(w.Body.Bytes(), &resp))
	assert.Equal(t, "test-user1", resp["userId"])
	assert.Equal(t, "PLATINUM", resp["tier"])
}

func TestGetUserRating_NotFound(t *testing.T) {
	db := testDBForRanking(t)
	repo := repository.NewPostgresEloRepo(db)
	defer cleanupRankingTestData(t, db)

	router := newTestRankingRouter(repo)

	w := httptest.NewRecorder()
	req := httptest.NewRequest(http.MethodGet, "/api/users/test-nonexistent/rating", nil)
	router.ServeHTTP(w, req)

	assert.Equal(t, http.StatusNotFound, w.Code)
}

func TestGetUserRatingHistory_OK(t *testing.T) {
	db := testDBForRanking(t)
	repo := repository.NewPostgresEloRepo(db)
	defer cleanupRankingTestData(t, db)
	seedRankingData(t, repo)

	// 이력 데이터 삽입
	histories := []model.EloHistory{
		{UserID: "test-user1", GameID: "test-game-1", RatingBefore: 1500, RatingAfter: 1512, RatingDelta: 12},
		{UserID: "test-user1", GameID: "test-game-2", RatingBefore: 1490, RatingAfter: 1500, RatingDelta: 10},
	}
	for _, h := range histories {
		h := h
		require.NoError(t, repo.AddHistory(t.Context(), &h))
	}

	router := newTestRankingRouter(repo)

	w := httptest.NewRecorder()
	req := httptest.NewRequest(http.MethodGet, "/api/users/test-user1/rating/history?limit=10", nil)
	router.ServeHTTP(w, req)

	assert.Equal(t, http.StatusOK, w.Code)
	var resp map[string]interface{}
	require.NoError(t, json.Unmarshal(w.Body.Bytes(), &resp))
	data := resp["data"].([]interface{})
	assert.GreaterOrEqual(t, len(data), 2)
}

func TestGetUserRatingHistory_InvalidLimit(t *testing.T) {
	db := testDBForRanking(t)
	repo := repository.NewPostgresEloRepo(db)
	defer cleanupRankingTestData(t, db)

	router := newTestRankingRouter(repo)

	w := httptest.NewRecorder()
	req := httptest.NewRequest(http.MethodGet, "/api/users/test-user1/rating/history?limit=-1", nil)
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
