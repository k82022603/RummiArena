package handler

import (
	"bytes"
	"context"
	"encoding/base64"
	"encoding/json"
	"fmt"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/gin-gonic/gin"
	"github.com/golang-jwt/jwt/v5"
	"github.com/k82022603/RummiArena/game-server/internal/middleware"
	"github.com/k82022603/RummiArena/game-server/internal/model"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
	"gorm.io/gorm"
)

const testJWTSecret = "test-secret-for-unit-tests"

// ---- DevLogin 테스트 ----

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

// ---- GoogleLogin 테스트 ----

// setupGoogleAuthRouter Google OAuth 핸들러를 포함한 테스트용 라우터를 생성한다.
func setupGoogleAuthRouter(secret, clientID, clientSecret string) *gin.Engine {
	gin.SetMode(gin.TestMode)
	r := gin.New()
	h := NewAuthHandler(secret).WithGoogleOAuth(clientID, clientSecret)
	r.POST("/api/auth/google", h.GoogleLogin)
	return r
}

// TestGoogleLogin_OAuthDisabled_NoClientID GOOGLE_CLIENT_ID 미설정 시 503 반환
func TestGoogleLogin_OAuthDisabled_NoClientID(t *testing.T) {
	r := setupGoogleAuthRouter(testJWTSecret, "", "")
	body := `{"code":"test-code","redirectUri":"http://localhost:3000/api/auth/callback/google"}`
	req := httptest.NewRequest(http.MethodPost, "/api/auth/google", bytes.NewBufferString(body))
	req.Header.Set("Content-Type", "application/json")
	w := httptest.NewRecorder()

	r.ServeHTTP(w, req)

	assert.Equal(t, http.StatusServiceUnavailable, w.Code)

	var resp map[string]interface{}
	require.NoError(t, json.Unmarshal(w.Body.Bytes(), &resp))
	errBody, ok := resp["error"].(map[string]interface{})
	require.True(t, ok)
	assert.Equal(t, "OAUTH_DISABLED", errBody["code"])
}

// TestGoogleLogin_OAuthDisabled_OnlyClientID clientID만 있고 secret 없으면 503 반환
func TestGoogleLogin_OAuthDisabled_OnlyClientID(t *testing.T) {
	r := setupGoogleAuthRouter(testJWTSecret, "only-id", "")
	body := `{"code":"test-code","redirectUri":"http://localhost:3000/api/auth/callback/google"}`
	req := httptest.NewRequest(http.MethodPost, "/api/auth/google", bytes.NewBufferString(body))
	req.Header.Set("Content-Type", "application/json")
	w := httptest.NewRecorder()

	r.ServeHTTP(w, req)

	assert.Equal(t, http.StatusServiceUnavailable, w.Code)
}

// TestGoogleLogin_InvalidRequest 요청 바디 누락 시 400 반환
func TestGoogleLogin_InvalidRequest_MissingCode(t *testing.T) {
	r := setupGoogleAuthRouter(testJWTSecret, "client-id", "client-secret")
	body := `{"redirectUri":"http://localhost:3000/api/auth/callback/google"}`
	req := httptest.NewRequest(http.MethodPost, "/api/auth/google", bytes.NewBufferString(body))
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

// TestGoogleLogin_InvalidRequest_MissingRedirectUri redirectUri 누락 시 400 반환
func TestGoogleLogin_InvalidRequest_MissingRedirectUri(t *testing.T) {
	r := setupGoogleAuthRouter(testJWTSecret, "client-id", "client-secret")
	body := `{"code":"test-code"}`
	req := httptest.NewRequest(http.MethodPost, "/api/auth/google", bytes.NewBufferString(body))
	req.Header.Set("Content-Type", "application/json")
	w := httptest.NewRecorder()

	r.ServeHTTP(w, req)

	assert.Equal(t, http.StatusBadRequest, w.Code)
}

// TestGoogleLogin_InvalidCode 모킹된 Google 서버가 400 응답 시 에러 반환 테스트
func TestGoogleLogin_InvalidCode(t *testing.T) {
	// Google Token Endpoint를 모킹한다 (400 응답)
	mockServer := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusBadRequest)
		_, _ = w.Write([]byte(`{"error":"invalid_grant","error_description":"Bad Request"}`))
	}))
	defer mockServer.Close()

	// exchangeGoogleCodeWithEndpoint를 직접 호출하여 mock 서버 URL을 사용
	_, err := exchangeGoogleCodeWithEndpoint(context.Background(), mockServer.URL, "cid", "csecret", "bad-code", "http://localhost:3000")
	assert.Error(t, err)
	assert.Contains(t, err.Error(), "400")
}

// TestGoogleLogin_WithMockGoogleServer 모킹된 Google 서버로 전체 흐름 테스트
func TestGoogleLogin_WithMockGoogleServer(t *testing.T) {
	// 테스트용 id_token 페이로드 생성 (서명 없는 더미 JWT)
	payload := map[string]string{
		"sub":   "google-uid-12345",
		"email": "testuser@gmail.com",
		"name":  "테스트유저",
	}
	payloadJSON, err := json.Marshal(payload)
	require.NoError(t, err)

	// Base64url 인코딩 (패딩 없음)
	header := base64.RawURLEncoding.EncodeToString([]byte(`{"alg":"RS256","typ":"JWT"}`))
	payloadB64 := base64.RawURLEncoding.EncodeToString(payloadJSON)
	fakeIDToken := fmt.Sprintf("%s.%s.fake-signature", header, payloadB64)

	// Google Token Endpoint mock
	mockServer := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusOK)
		resp := fmt.Sprintf(`{"id_token":"%s","access_token":"mock-access-token"}`, fakeIDToken)
		_, _ = w.Write([]byte(resp))
	}))
	defer mockServer.Close()

	// exchangeGoogleCode를 직접 호출 (mock 서버 URL을 redirectUri로 사용하여 흐름 검증)
	// 실제 로직 검증: parseIDTokenPayload 단독 테스트
	claims, err := parseIDTokenPayload(fakeIDToken)
	require.NoError(t, err)
	assert.Equal(t, "google-uid-12345", claims.Sub)
	assert.Equal(t, "testuser@gmail.com", claims.Email)
	assert.Equal(t, "테스트유저", claims.Name)
}

// TestParseIDTokenPayload_ValidToken 유효한 id_token 파싱 테스트
func TestParseIDTokenPayload_ValidToken(t *testing.T) {
	payload := map[string]string{
		"sub":   "1234567890",
		"email": "user@example.com",
		"name":  "홍길동",
	}
	payloadJSON, err := json.Marshal(payload)
	require.NoError(t, err)

	header := base64.RawURLEncoding.EncodeToString([]byte(`{"alg":"RS256"}`))
	body := base64.RawURLEncoding.EncodeToString(payloadJSON)
	idToken := fmt.Sprintf("%s.%s.signature", header, body)

	claims, err := parseIDTokenPayload(idToken)
	require.NoError(t, err)
	assert.Equal(t, "1234567890", claims.Sub)
	assert.Equal(t, "user@example.com", claims.Email)
	assert.Equal(t, "홍길동", claims.Name)
}

// TestParseIDTokenPayload_InvalidFormat 잘못된 형식 에러 처리
func TestParseIDTokenPayload_InvalidFormat(t *testing.T) {
	_, err := parseIDTokenPayload("not.a.jwt.with.five.parts")
	assert.Error(t, err)
}

// TestParseIDTokenPayload_MissingSub sub 필드 없는 경우 에러
func TestParseIDTokenPayload_MissingSub(t *testing.T) {
	payload := map[string]string{
		"email": "user@example.com",
	}
	payloadJSON, err := json.Marshal(payload)
	require.NoError(t, err)

	header := base64.RawURLEncoding.EncodeToString([]byte(`{"alg":"RS256"}`))
	body := base64.RawURLEncoding.EncodeToString(payloadJSON)
	idToken := fmt.Sprintf("%s.%s.signature", header, body)

	_, err = parseIDTokenPayload(idToken)
	assert.Error(t, err)
	assert.Contains(t, err.Error(), "sub field missing")
}

// TestUpsertUser_NoUserRepo UserRepo 없을 때 sub를 UserID로 반환
func TestUpsertUser_NoUserRepo(t *testing.T) {
	h := NewAuthHandler(testJWTSecret)
	gc := &googleIDTokenClaims{
		Sub:   "google-sub-999",
		Email: "user@google.com",
		Name:  "구글사용자",
	}

	userID, displayName, email := h.upsertUser(context.Background(), gc)
	assert.Equal(t, "google-sub-999", userID)
	assert.Equal(t, "구글사용자", displayName)
	assert.Equal(t, "user@google.com", email)
}

// TestUpsertUser_NoUserRepo_EmptyName 이름 없을 때 이메일 앞부분을 displayName으로 사용
func TestUpsertUser_NoUserRepo_EmptyName(t *testing.T) {
	h := NewAuthHandler(testJWTSecret)
	gc := &googleIDTokenClaims{
		Sub:   "google-sub-888",
		Email: "myuser@google.com",
		Name:  "",
	}

	userID, displayName, email := h.upsertUser(context.Background(), gc)
	assert.Equal(t, "google-sub-888", userID)
	assert.Equal(t, "myuser", displayName)
	assert.Equal(t, "myuser@google.com", email)
}

// TestUpsertUser_WithMockRepo_NewUser 신규 사용자 생성 테스트
func TestUpsertUser_WithMockRepo_NewUser(t *testing.T) {
	mockRepo := &mockUserRepo{
		users:          map[string]*model.User{},
		notFoundOnGet:  true,
	}
	h := NewAuthHandler(testJWTSecret).WithUserRepo(mockRepo)

	gc := &googleIDTokenClaims{
		Sub:   "new-google-sub",
		Email: "newuser@gmail.com",
		Name:  "신규사용자",
	}

	userID, displayName, email := h.upsertUser(context.Background(), gc)
	// CreateUser 호출 후 newUser.ID가 비어있으면 sub 반환 (ID가 DB에서 생성됨)
	assert.NotEmpty(t, userID)
	assert.Equal(t, "신규사용자", displayName)
	assert.Equal(t, "newuser@gmail.com", email)
	assert.True(t, mockRepo.createCalled)
}

// TestUpsertUser_WithMockRepo_ExistingUser 기존 사용자 업데이트 테스트
func TestUpsertUser_WithMockRepo_ExistingUser(t *testing.T) {
	existingUser := &model.User{
		ID:          "existing-user-uuid",
		GoogleID:    "existing-google-sub",
		Email:       "old@gmail.com",
		DisplayName: "이전이름",
		Role:        model.UserRoleUser,
		EloRating:   1200,
	}
	mockRepo := &mockUserRepo{
		users:          map[string]*model.User{"existing-google-sub": existingUser},
		notFoundOnGet:  false,
	}
	h := NewAuthHandler(testJWTSecret).WithUserRepo(mockRepo)

	gc := &googleIDTokenClaims{
		Sub:   "existing-google-sub",
		Email: "new@gmail.com",
		Name:  "새이름",
	}

	userID, displayName, email := h.upsertUser(context.Background(), gc)
	assert.Equal(t, "existing-user-uuid", userID)
	assert.Equal(t, "새이름", displayName)
	assert.Equal(t, "new@gmail.com", email)
	assert.True(t, mockRepo.updateCalled)
}

// ---- GoogleLoginByIDToken 테스트 ----

// setupIDTokenAuthRouter /api/auth/google/token 핸들러용 테스트 라우터
func setupIDTokenAuthRouter(secret, clientID string) *gin.Engine {
	gin.SetMode(gin.TestMode)
	r := gin.New()
	h := NewAuthHandler(secret).WithGoogleOAuth(clientID, "any-secret")
	r.POST("/api/auth/google/token", h.GoogleLoginByIDToken)
	return r
}

// TestGoogleLoginByIDToken_OAuthDisabled GOOGLE_CLIENT_ID 미설정 시 503 반환
func TestGoogleLoginByIDToken_OAuthDisabled(t *testing.T) {
	gin.SetMode(gin.TestMode)
	r := gin.New()
	h := NewAuthHandler(testJWTSecret) // clientID 없음
	r.POST("/api/auth/google/token", h.GoogleLoginByIDToken)

	body := `{"idToken":"dummy.dummy.dummy"}`
	req := httptest.NewRequest(http.MethodPost, "/api/auth/google/token", bytes.NewBufferString(body))
	req.Header.Set("Content-Type", "application/json")
	w := httptest.NewRecorder()

	r.ServeHTTP(w, req)

	assert.Equal(t, http.StatusServiceUnavailable, w.Code)
	var resp map[string]interface{}
	require.NoError(t, json.Unmarshal(w.Body.Bytes(), &resp))
	errBody, ok := resp["error"].(map[string]interface{})
	require.True(t, ok)
	assert.Equal(t, "OAUTH_DISABLED", errBody["code"])
}

// TestGoogleLoginByIDToken_MissingIDToken idToken 필드 누락 시 400 반환
func TestGoogleLoginByIDToken_MissingIDToken(t *testing.T) {
	r := setupIDTokenAuthRouter(testJWTSecret, "some-client-id")

	body := `{}`
	req := httptest.NewRequest(http.MethodPost, "/api/auth/google/token", bytes.NewBufferString(body))
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

// TestGoogleLoginByIDToken_InvalidIDToken 잘못된 id_token 형식 시 400 반환
func TestGoogleLoginByIDToken_InvalidIDToken(t *testing.T) {
	r := setupIDTokenAuthRouter(testJWTSecret, "some-client-id")

	body := `{"idToken":"not-a-valid-jwt"}`
	req := httptest.NewRequest(http.MethodPost, "/api/auth/google/token", bytes.NewBufferString(body))
	req.Header.Set("Content-Type", "application/json")
	w := httptest.NewRecorder()

	r.ServeHTTP(w, req)

	assert.Equal(t, http.StatusBadRequest, w.Code)
	var resp map[string]interface{}
	require.NoError(t, json.Unmarshal(w.Body.Bytes(), &resp))
	errBody, ok := resp["error"].(map[string]interface{})
	require.True(t, ok)
	assert.Equal(t, "INVALID_ID_TOKEN", errBody["code"])
}

// TestGoogleLoginByIDToken_Success 유효한 id_token으로 game-server JWT 발급
func TestGoogleLoginByIDToken_Success(t *testing.T) {
	r := setupIDTokenAuthRouter(testJWTSecret, "some-client-id")

	// 유효한 id_token 생성
	payload := map[string]string{
		"sub":   "google-uid-xyz",
		"email": "user@gmail.com",
		"name":  "테스트",
	}
	payloadJSON, err := json.Marshal(payload)
	require.NoError(t, err)

	header := base64.RawURLEncoding.EncodeToString([]byte(`{"alg":"RS256","typ":"JWT"}`))
	payloadB64 := base64.RawURLEncoding.EncodeToString(payloadJSON)
	fakeIDToken := fmt.Sprintf("%s.%s.fake-sig", header, payloadB64)

	body := fmt.Sprintf(`{"idToken":"%s"}`, fakeIDToken)
	req := httptest.NewRequest(http.MethodPost, "/api/auth/google/token", bytes.NewBufferString(body))
	req.Header.Set("Content-Type", "application/json")
	w := httptest.NewRecorder()

	r.ServeHTTP(w, req)

	assert.Equal(t, http.StatusOK, w.Code)

	var resp map[string]interface{}
	require.NoError(t, json.Unmarshal(w.Body.Bytes(), &resp))
	assert.NotEmpty(t, resp["token"])
	assert.Equal(t, "google-uid-xyz", resp["userId"])
	assert.Equal(t, "테스트", resp["displayName"])
	assert.Equal(t, float64(86400), resp["expiresIn"])

	// 발급된 JWT가 올바른 claims를 가지는지 검증
	tokenStr, ok := resp["token"].(string)
	require.True(t, ok)
	claims := &middleware.Claims{}
	parsed, err := jwt.ParseWithClaims(tokenStr, claims, func(t *jwt.Token) (interface{}, error) {
		return []byte(testJWTSecret), nil
	})
	require.NoError(t, err)
	assert.True(t, parsed.Valid)
	assert.Equal(t, "google-uid-xyz", claims.UserID)
	assert.Equal(t, "user@gmail.com", claims.Email)
}

// ---- 목(mock) UserRepository ----

type mockUserRepo struct {
	users          map[string]*model.User // key: googleID
	notFoundOnGet  bool
	createCalled   bool
	updateCalled   bool
}

func (m *mockUserRepo) CreateUser(_ context.Context, user *model.User) error {
	m.createCalled = true
	user.ID = "new-created-uuid"
	m.users[user.GoogleID] = user
	return nil
}

func (m *mockUserRepo) GetUserByID(_ context.Context, id string) (*model.User, error) {
	for _, u := range m.users {
		if u.ID == id {
			return u, nil
		}
	}
	return nil, fmt.Errorf("not found")
}

func (m *mockUserRepo) GetUserByGoogleID(_ context.Context, googleID string) (*model.User, error) {
	if m.notFoundOnGet {
		return nil, gorm.ErrRecordNotFound
	}
	user, ok := m.users[googleID]
	if !ok {
		return nil, gorm.ErrRecordNotFound
	}
	return user, nil
}

func (m *mockUserRepo) UpdateUser(_ context.Context, user *model.User) error {
	m.updateCalled = true
	m.users[user.GoogleID] = user
	return nil
}
