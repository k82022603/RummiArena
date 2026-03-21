package handler

import (
	"bytes"
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

// mockPracticeRepo 테스트용 인메모리 PracticeProgressRepository 구현체.
type mockPracticeRepo struct {
	records []*model.PracticeProgress
	saveErr error
	getErr  error
}

func (m *mockPracticeRepo) SaveProgress(_ context.Context, p *model.PracticeProgress) error {
	if m.saveErr != nil {
		return m.saveErr
	}
	p.ID = "mock-uuid-001"
	p.CreatedAt = time.Now().UTC()
	m.records = append(m.records, p)
	return nil
}

func (m *mockPracticeRepo) GetProgressByUserID(_ context.Context, userID string) ([]*model.PracticeProgress, error) {
	if m.getErr != nil {
		return nil, m.getErr
	}
	result := make([]*model.PracticeProgress, 0)
	for _, r := range m.records {
		if r.UserID == userID {
			result = append(result, r)
		}
	}
	return result, nil
}

// 컴파일 타임에 인터페이스 충족 여부 검증
var _ repository.PracticeProgressRepository = (*mockPracticeRepo)(nil)

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
	repo := &mockPracticeRepo{}
	r := setupPracticeRouter(repo, "user-001")

	completedAt := time.Now().UTC().Format(time.RFC3339)
	body := fmt.Sprintf(`{"stage":2,"score":150,"completedAt":%q}`, completedAt)

	req := httptest.NewRequest(http.MethodPost, "/api/practice/progress", bytes.NewBufferString(body))
	req.Header.Set("Content-Type", "application/json")
	w := httptest.NewRecorder()

	r.ServeHTTP(w, req)

	assert.Equal(t, http.StatusCreated, w.Code)

	var resp model.PracticeProgress
	require.NoError(t, json.Unmarshal(w.Body.Bytes(), &resp))
	assert.Equal(t, "user-001", resp.UserID)
	assert.Equal(t, 2, resp.Stage)
	assert.Equal(t, 150, resp.Score)
	assert.Equal(t, "mock-uuid-001", resp.ID)
}

func TestSaveProgress_InvalidJSON(t *testing.T) {
	repo := &mockPracticeRepo{}
	r := setupPracticeRouter(repo, "user-001")

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

func TestSaveProgress_DBError(t *testing.T) {
	repo := &mockPracticeRepo{saveErr: fmt.Errorf("db connection refused")}
	r := setupPracticeRouter(repo, "user-001")

	body := `{"stage":1,"score":100,"completedAt":"2026-03-21T10:00:00Z"}`
	req := httptest.NewRequest(http.MethodPost, "/api/practice/progress", bytes.NewBufferString(body))
	req.Header.Set("Content-Type", "application/json")
	w := httptest.NewRecorder()

	r.ServeHTTP(w, req)

	assert.Equal(t, http.StatusInternalServerError, w.Code)

	var resp map[string]interface{}
	require.NoError(t, json.Unmarshal(w.Body.Bytes(), &resp))

	errBody, ok := resp["error"].(map[string]interface{})
	require.True(t, ok)
	assert.Equal(t, "INTERNAL_ERROR", errBody["code"])
}

func TestSaveProgress_InvalidCompletedAt(t *testing.T) {
	repo := &mockPracticeRepo{}
	r := setupPracticeRouter(repo, "user-001")

	body := `{"stage":1,"score":100,"completedAt":"not-a-date"}`
	req := httptest.NewRequest(http.MethodPost, "/api/practice/progress", bytes.NewBufferString(body))
	req.Header.Set("Content-Type", "application/json")
	w := httptest.NewRecorder()

	r.ServeHTTP(w, req)

	assert.Equal(t, http.StatusBadRequest, w.Code)
}

// --- GetProgress 테스트 ---

func TestGetProgress_Empty(t *testing.T) {
	repo := &mockPracticeRepo{}
	r := setupPracticeRouter(repo, "user-no-records")

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
	repo := &mockPracticeRepo{}
	r := setupPracticeRouter(repo, "user-002")

	// 먼저 2개의 기록을 저장한다.
	now := time.Now().UTC()
	repo.records = []*model.PracticeProgress{
		{ID: "id-1", UserID: "user-002", Stage: 1, Score: 80, CompletedAt: now},
		{ID: "id-2", UserID: "user-002", Stage: 2, Score: 120, CompletedAt: now},
		{ID: "id-3", UserID: "other-user", Stage: 1, Score: 50, CompletedAt: now},
	}

	req := httptest.NewRequest(http.MethodGet, "/api/practice/progress", nil)
	w := httptest.NewRecorder()

	r.ServeHTTP(w, req)

	assert.Equal(t, http.StatusOK, w.Code)

	var resp map[string]interface{}
	require.NoError(t, json.Unmarshal(w.Body.Bytes(), &resp))

	// user-002의 기록만 2개 반환되어야 한다.
	assert.Equal(t, float64(2), resp["total"])
}

func TestGetProgress_StageFilter(t *testing.T) {
	repo := &mockPracticeRepo{}
	r := setupPracticeRouter(repo, "user-003")

	now := time.Now().UTC()
	repo.records = []*model.PracticeProgress{
		{ID: "id-1", UserID: "user-003", Stage: 1, Score: 80, CompletedAt: now},
		{ID: "id-2", UserID: "user-003", Stage: 2, Score: 120, CompletedAt: now},
		{ID: "id-3", UserID: "user-003", Stage: 1, Score: 90, CompletedAt: now},
	}

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
	repo := &mockPracticeRepo{}
	r := setupPracticeRouter(repo, "user-003")

	req := httptest.NewRequest(http.MethodGet, "/api/practice/progress?stage=abc", nil)
	w := httptest.NewRecorder()

	r.ServeHTTP(w, req)

	assert.Equal(t, http.StatusBadRequest, w.Code)
}

func TestGetProgress_DBError(t *testing.T) {
	repo := &mockPracticeRepo{getErr: fmt.Errorf("db timeout")}
	r := setupPracticeRouter(repo, "user-001")

	req := httptest.NewRequest(http.MethodGet, "/api/practice/progress", nil)
	w := httptest.NewRecorder()

	r.ServeHTTP(w, req)

	assert.Equal(t, http.StatusInternalServerError, w.Code)
}
