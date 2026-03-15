package handler

import (
	"bytes"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/gin-gonic/gin"
	"github.com/golang-jwt/jwt/v5"
	"github.com/k82022603/RummiArena/game-server/internal/middleware"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

const testJWTSecret = "test-secret-for-unit-tests"

func setupAuthRouter(secret string) *gin.Engine {
	gin.SetMode(gin.TestMode)
	r := gin.New()
	h := NewAuthHandler(secret)
	r.POST("/api/auth/dev-login", h.DevLogin)
	return r
}

func TestDevLogin_Success(t *testing.T) {
	r := setupAuthRouter(testJWTSecret)

	body := `{"userId":"user-001","displayName":"테스터"}`
	req := httptest.NewRequest(http.MethodPost, "/api/auth/dev-login", bytes.NewBufferString(body))
	req.Header.Set("Content-Type", "application/json")
	w := httptest.NewRecorder()

	r.ServeHTTP(w, req)

	assert.Equal(t, http.StatusOK, w.Code)

	var resp map[string]interface{}
	require.NoError(t, json.Unmarshal(w.Body.Bytes(), &resp))

	assert.Equal(t, "user-001", resp["userId"])
	assert.Equal(t, "테스터", resp["displayName"])
	assert.Equal(t, float64(86400), resp["expiresIn"])
	assert.NotEmpty(t, resp["token"])
}

func TestDevLogin_TokenIsVerifiable(t *testing.T) {
	r := setupAuthRouter(testJWTSecret)

	body := `{"userId":"user-007","displayName":"본드"}`
	req := httptest.NewRequest(http.MethodPost, "/api/auth/dev-login", bytes.NewBufferString(body))
	req.Header.Set("Content-Type", "application/json")
	w := httptest.NewRecorder()

	r.ServeHTTP(w, req)
	require.Equal(t, http.StatusOK, w.Code)

	var resp map[string]interface{}
	require.NoError(t, json.Unmarshal(w.Body.Bytes(), &resp))

	tokenStr, ok := resp["token"].(string)
	require.True(t, ok)

	// 발급된 토큰이 middleware.JWTAuth와 동일한 시크릿으로 검증 가능한지 확인
	claims := &middleware.Claims{}
	token, err := jwt.ParseWithClaims(tokenStr, claims, func(t *jwt.Token) (interface{}, error) {
		return []byte(testJWTSecret), nil
	})

	require.NoError(t, err)
	assert.True(t, token.Valid)
	// UserID 필드의 JSON 태그가 "sub"이므로 claims.UserID에 값이 담긴다.
	assert.Equal(t, "user-007", claims.UserID)
	assert.Equal(t, "user-007@dev.local", claims.Email)
}

func TestDevLogin_MissingUserID(t *testing.T) {
	r := setupAuthRouter(testJWTSecret)

	body := `{"displayName":"테스터"}`
	req := httptest.NewRequest(http.MethodPost, "/api/auth/dev-login", bytes.NewBufferString(body))
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

func TestDevLogin_MissingDisplayName(t *testing.T) {
	r := setupAuthRouter(testJWTSecret)

	body := `{"userId":"user-001"}`
	req := httptest.NewRequest(http.MethodPost, "/api/auth/dev-login", bytes.NewBufferString(body))
	req.Header.Set("Content-Type", "application/json")
	w := httptest.NewRecorder()

	r.ServeHTTP(w, req)

	assert.Equal(t, http.StatusBadRequest, w.Code)
}

func TestDevLogin_EmptyBody(t *testing.T) {
	r := setupAuthRouter(testJWTSecret)

	req := httptest.NewRequest(http.MethodPost, "/api/auth/dev-login", bytes.NewBufferString(""))
	req.Header.Set("Content-Type", "application/json")
	w := httptest.NewRecorder()

	r.ServeHTTP(w, req)

	assert.Equal(t, http.StatusBadRequest, w.Code)
}

func TestDevLogin_EmailFormat(t *testing.T) {
	r := setupAuthRouter(testJWTSecret)

	body := `{"userId":"alice","displayName":"앨리스"}`
	req := httptest.NewRequest(http.MethodPost, "/api/auth/dev-login", bytes.NewBufferString(body))
	req.Header.Set("Content-Type", "application/json")
	w := httptest.NewRecorder()

	r.ServeHTTP(w, req)

	require.Equal(t, http.StatusOK, w.Code)

	var resp map[string]interface{}
	require.NoError(t, json.Unmarshal(w.Body.Bytes(), &resp))

	tokenStr := resp["token"].(string)
	claims := &middleware.Claims{}
	_, err := jwt.ParseWithClaims(tokenStr, claims, func(t *jwt.Token) (interface{}, error) {
		return []byte(testJWTSecret), nil
	})
	require.NoError(t, err)
	assert.Equal(t, "alice@dev.local", claims.Email)
}
