package handler

import (
	"bytes"
	"encoding/json"
	"fmt"
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

// testDBForPractice 테스트용 PostgreSQL DB를 연결하고 PracticeProgress 테이블을 마이그레이션한다.
func testDBForPractice(t *testing.T) *gorm.DB {
	t.Helper()
	dsn := os.Getenv("TEST_DB_URL")
	if dsn == "" {
		dsn = "host=localhost port=5432 user=rummikub password=rummikub123 dbname=rummikub sslmode=disable"
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
	require.NoError(t, db.AutoMigrate(&model.PracticeProgress{}))
	return db
}

// cleanupPracticeTestData 테스트 후 test- 접두사 데이터를 제거한다.
func cleanupPracticeTestData(t *testing.T, db *gorm.DB) {
	t.Helper()
	db.Exec("DELETE FROM practice_progresses WHERE user_id LIKE 'test-%'")
}

// setupPracticeRouter 테스트용 gin 라우터를 구성한다.
// userID는 JWTAuth를 우회하여 컨텍스트에 직접 주입한다.
func setupPracticeRouter(repo repository.PracticeProgressRepository, userID string) *gin.Engine {
	gin.SetMode(gin.TestMode)
	r := gin.New()

	h := NewPracticeHandler(repo, zap.NewNop())

	// JWT 미들웨어 대신 userID를 직접 주입하는 미들웨어로 대체
	r.Use(func(c *gin.Context) {
		c.Set("userID", userID)
		c.Next()
	})

	r.POST("/api/practice/progress", h.SaveProgress)
	r.GET("/api/practice/progress", h.GetProgress)
	return r
}

// --- SaveProgress 테스트 ---

func TestSaveProgress_Success(t *testing.T) {
	db := testDBForPractice(t)
	repo := repository.NewPostgresPracticeRepo(db)
	defer cleanupPracticeTestData(t, db)

	r := setupPracticeRouter(repo, "test-user-001")

	completedAt := time.Now().UTC().Format(time.RFC3339)
	body := fmt.Sprintf(`{"stage":2,"score":150,"completedAt":%q}`, completedAt)

	req := httptest.NewRequest(http.MethodPost, "/api/practice/progress", bytes.NewBufferString(body))
	req.Header.Set("Content-Type", "application/json")
	w := httptest.NewRecorder()

	r.ServeHTTP(w, req)

	assert.Equal(t, http.StatusCreated, w.Code)

	var resp model.PracticeProgress
	require.NoError(t, json.Unmarshal(w.Body.Bytes(), &resp))
	assert.Equal(t, "test-user-001", resp.UserID)
	assert.Equal(t, 2, resp.Stage)
	assert.Equal(t, 150, resp.Score)
	assert.NotEmpty(t, resp.ID, "DB에서 UUID가 자동 생성되어야 한다")
}

func TestSaveProgress_InvalidJSON(t *testing.T) {
	db := testDBForPractice(t)
	repo := repository.NewPostgresPracticeRepo(db)
	defer cleanupPracticeTestData(t, db)

	r := setupPracticeRouter(repo, "test-user-001")

	req := httptest.NewRequest(http.MethodPost, "/api/practice/progress", bytes.NewBufferString("not-json"))
	req.Header.Set("Content-Type", "application/json")
	w := httptest.NewRecorder()

	r.ServeHTTP(w, req)

	assert.Equal(t, http.StatusBadRequest, w.Code)

	var resp map[string]interface{}
	require.NoError(t, json.Unmarshal(w.Body.Bytes(), &resp))

	errBody, ok := resp["error"].(map[string]interface{})
	require.True(t, ok)
	assert.Equal(t, "INVALID_REQUEST", errBody["code"])
}

func TestSaveProgress_InvalidCompletedAt(t *testing.T) {
	db := testDBForPractice(t)
	repo := repository.NewPostgresPracticeRepo(db)
	defer cleanupPracticeTestData(t, db)

	r := setupPracticeRouter(repo, "test-user-001")

	body := `{"stage":1,"score":100,"completedAt":"not-a-date"}`
	req := httptest.NewRequest(http.MethodPost, "/api/practice/progress", bytes.NewBufferString(body))
	req.Header.Set("Content-Type", "application/json")
	w := httptest.NewRecorder()

	r.ServeHTTP(w, req)

	assert.Equal(t, http.StatusBadRequest, w.Code)
}

// --- GetProgress 테스트 ---

func TestGetProgress_Empty(t *testing.T) {
	db := testDBForPractice(t)
	repo := repository.NewPostgresPracticeRepo(db)
	defer cleanupPracticeTestData(t, db)

	r := setupPracticeRouter(repo, "test-user-no-records")

	req := httptest.NewRequest(http.MethodGet, "/api/practice/progress", nil)
	w := httptest.NewRecorder()

	r.ServeHTTP(w, req)

	assert.Equal(t, http.StatusOK, w.Code)

	var resp map[string]interface{}
	require.NoError(t, json.Unmarshal(w.Body.Bytes(), &resp))

	assert.Equal(t, float64(0), resp["total"])
	progressList, ok := resp["progress"].([]interface{})
	require.True(t, ok)
	assert.Empty(t, progressList)
}

func TestGetProgress_WithRecords(t *testing.T) {
	db := testDBForPractice(t)
	repo := repository.NewPostgresPracticeRepo(db)
	defer cleanupPracticeTestData(t, db)

	// 테스트 데이터 삽입
	now := time.Now().UTC()
	records := []*model.PracticeProgress{
		{UserID: "test-user-002", Stage: 1, Score: 80, CompletedAt: now},
		{UserID: "test-user-002", Stage: 2, Score: 120, CompletedAt: now},
		{UserID: "test-other-user", Stage: 1, Score: 50, CompletedAt: now},
	}
	for _, rec := range records {
		require.NoError(t, repo.SaveProgress(t.Context(), rec))
	}

	r := setupPracticeRouter(repo, "test-user-002")

	req := httptest.NewRequest(http.MethodGet, "/api/practice/progress", nil)
	w := httptest.NewRecorder()

	r.ServeHTTP(w, req)

	assert.Equal(t, http.StatusOK, w.Code)

	var resp map[string]interface{}
	require.NoError(t, json.Unmarshal(w.Body.Bytes(), &resp))

	// test-user-002의 기록만 2개 반환되어야 한다.
	assert.Equal(t, float64(2), resp["total"])
}

func TestGetProgress_StageFilter(t *testing.T) {
	db := testDBForPractice(t)
	repo := repository.NewPostgresPracticeRepo(db)
	defer cleanupPracticeTestData(t, db)

	now := time.Now().UTC()
	records := []*model.PracticeProgress{
		{UserID: "test-user-003", Stage: 1, Score: 80, CompletedAt: now},
		{UserID: "test-user-003", Stage: 2, Score: 120, CompletedAt: now},
		{UserID: "test-user-003", Stage: 1, Score: 90, CompletedAt: now},
	}
	for _, rec := range records {
		require.NoError(t, repo.SaveProgress(t.Context(), rec))
	}

	r := setupPracticeRouter(repo, "test-user-003")

	req := httptest.NewRequest(http.MethodGet, "/api/practice/progress?stage=1", nil)
	w := httptest.NewRecorder()

	r.ServeHTTP(w, req)

	assert.Equal(t, http.StatusOK, w.Code)

	var resp map[string]interface{}
	require.NoError(t, json.Unmarshal(w.Body.Bytes(), &resp))

	// stage=1 기록만 2개 반환되어야 한다.
	assert.Equal(t, float64(2), resp["total"])
}

func TestGetProgress_InvalidStageFilter(t *testing.T) {
	db := testDBForPractice(t)
	repo := repository.NewPostgresPracticeRepo(db)
	defer cleanupPracticeTestData(t, db)

	r := setupPracticeRouter(repo, "test-user-003")

	req := httptest.NewRequest(http.MethodGet, "/api/practice/progress?stage=abc", nil)
	w := httptest.NewRecorder()

	r.ServeHTTP(w, req)

	assert.Equal(t, http.StatusBadRequest, w.Code)
}
