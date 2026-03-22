package handler

import (
	"context"
	"encoding/base64"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"strings"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/golang-jwt/jwt/v5"
	"github.com/k82022603/RummiArena/game-server/internal/middleware"
	"github.com/k82022603/RummiArena/game-server/internal/model"
	"github.com/k82022603/RummiArena/game-server/internal/repository"
	"gorm.io/gorm"
)

// AuthHandler 인증 관련 HTTP 핸들러
type AuthHandler struct {
	jwtSecret          string
	googleClientID     string
	googleClientSecret string
	userRepo           repository.UserRepository // nil-safe: DB 없으면 nil
}

// NewAuthHandler AuthHandler 생성자
func NewAuthHandler(jwtSecret string) *AuthHandler {
	return &AuthHandler{jwtSecret: jwtSecret}
}

// WithGoogleOAuth Google OAuth 설정을 주입한다.
func (h *AuthHandler) WithGoogleOAuth(clientID, clientSecret string) *AuthHandler {
	h.googleClientID = clientID
	h.googleClientSecret = clientSecret
	return h
}

// WithUserRepo UserRepository를 주입한다. (DB 가용 시에만 호출)
func (h *AuthHandler) WithUserRepo(repo repository.UserRepository) *AuthHandler {
	h.userRepo = repo
	return h
}

// devLoginRequest POST /api/auth/dev-login 요청 바디
type devLoginRequest struct {
	UserID      string `json:"userId"      binding:"required"`
	DisplayName string `json:"displayName" binding:"required"`
}

// DevLogin 개발/테스트 전용 JWT 발급 엔드포인트.
// 프로덕션에서는 Google OAuth를 사용한다.
// 이 엔드포인트는 APP_ENV=dev 일 때만 라우터에 등록된다.
func (h *AuthHandler) DevLogin(c *gin.Context) {
	var req devLoginRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		respondError(c, http.StatusBadRequest, "INVALID_REQUEST", "요청 형식이 올바르지 않습니다.")
		return
	}

	now := time.Now()
	// UserID 필드의 JSON 태그가 "sub"이므로 RegisteredClaims.Subject와 중복 설정하지 않는다.
	// ParseWithClaims 시 claims.UserID에 sub 값이 담기며, claims.Subject는 비어있다.
	claims := &middleware.Claims{
		UserID: req.UserID,
		Email:  req.UserID + "@dev.local",
		RegisteredClaims: jwt.RegisteredClaims{
			ExpiresAt: jwt.NewNumericDate(now.Add(24 * time.Hour)),
			IssuedAt:  jwt.NewNumericDate(now),
		},
	}

	token := jwt.NewWithClaims(jwt.SigningMethodHS256, claims)
	tokenStr, err := token.SignedString([]byte(h.jwtSecret))
	if err != nil {
		respondError(c, http.StatusInternalServerError, "INTERNAL_ERROR", "토큰 발급 실패")
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"token":       tokenStr,
		"userId":      req.UserID,
		"displayName": req.DisplayName,
		"expiresIn":   86400,
	})
}

// googleLoginRequest POST /api/auth/google 요청 바디
type googleLoginRequest struct {
	Code        string `json:"code"        binding:"required"`
	RedirectURI string `json:"redirectUri" binding:"required"`
}

// googleTokenResponse Google Token Endpoint 응답
type googleTokenResponse struct {
	IDToken     string `json:"id_token"`
	AccessToken string `json:"access_token"`
}

// googleIDTokenClaims Google id_token의 페이로드 (검증 없이 파싱)
type googleIDTokenClaims struct {
	Sub   string `json:"sub"`
	Email string `json:"email"`
	Name  string `json:"name"`
}

// GoogleLogin POST /api/auth/google — Google OAuth authorization code를 게임 서버 JWT로 교환한다.
// GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET 환경변수 미설정 시 503을 반환한다.
func (h *AuthHandler) GoogleLogin(c *gin.Context) {
	if h.googleClientID == "" || h.googleClientSecret == "" {
		respondError(c, http.StatusServiceUnavailable, "OAUTH_DISABLED", "Google OAuth가 설정되지 않았습니다.")
		return
	}

	var req googleLoginRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		respondError(c, http.StatusBadRequest, "INVALID_REQUEST", "요청 형식이 올바르지 않습니다.")
		return
	}

	// 1. Google Token Endpoint에서 id_token 교환
	googleClaims, err := exchangeGoogleCode(c.Request.Context(), h.googleClientID, h.googleClientSecret, req.Code, req.RedirectURI)
	if err != nil {
		respondError(c, http.StatusBadRequest, "OAUTH_CODE_INVALID", fmt.Sprintf("Google 코드 교환 실패: %s", err.Error()))
		return
	}

	// 2. User Upsert (UserRepo가 없으면 GoogleSub를 UserID로 직접 사용)
	userID, displayName, email := h.upsertUser(c.Request.Context(), googleClaims)

	// 3. 게임 서버 자체 JWT 발급
	now := time.Now()
	jwtClaims := &middleware.Claims{
		UserID: userID,
		Email:  email,
		RegisteredClaims: jwt.RegisteredClaims{
			ExpiresAt: jwt.NewNumericDate(now.Add(24 * time.Hour)),
			IssuedAt:  jwt.NewNumericDate(now),
		},
	}

	token := jwt.NewWithClaims(jwt.SigningMethodHS256, jwtClaims)
	tokenStr, err := token.SignedString([]byte(h.jwtSecret))
	if err != nil {
		respondError(c, http.StatusInternalServerError, "INTERNAL_ERROR", "토큰 발급 실패")
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"token":       tokenStr,
		"userId":      userID,
		"displayName": displayName,
		"expiresIn":   86400,
	})
}

// googleIDTokenRequest POST /api/auth/google/token 요청 바디
// next-auth Google Provider가 이미 code 교환 완료 후 id_token을 전달한다.
type googleIDTokenRequest struct {
	IDToken string `json:"idToken" binding:"required"`
}

// GoogleLoginByIDToken POST /api/auth/google/token — next-auth가 전달한 Google id_token을 게임 서버 JWT로 교환한다.
// next-auth Google Provider는 SSR에서 code 교환을 완료한 후 id_token을 JWT callback에 노출한다.
// GOOGLE_CLIENT_ID 미설정 시 503을 반환한다.
func (h *AuthHandler) GoogleLoginByIDToken(c *gin.Context) {
	if h.googleClientID == "" {
		respondError(c, http.StatusServiceUnavailable, "OAUTH_DISABLED", "Google OAuth가 설정되지 않았습니다.")
		return
	}

	var req googleIDTokenRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		respondError(c, http.StatusBadRequest, "INVALID_REQUEST", "요청 형식이 올바르지 않습니다.")
		return
	}

	// id_token 페이로드 파싱 (서명 검증 없이 — Google Token Endpoint를 통과한 토큰임)
	googleClaims, err := parseIDTokenPayload(req.IDToken)
	if err != nil {
		respondError(c, http.StatusBadRequest, "INVALID_ID_TOKEN", fmt.Sprintf("id_token 파싱 실패: %s", err.Error()))
		return
	}

	// User Upsert
	userID, displayName, email := h.upsertUser(c.Request.Context(), googleClaims)

	// 게임 서버 자체 JWT 발급
	now := time.Now()
	jwtClaims := &middleware.Claims{
		UserID: userID,
		Email:  email,
		RegisteredClaims: jwt.RegisteredClaims{
			ExpiresAt: jwt.NewNumericDate(now.Add(24 * time.Hour)),
			IssuedAt:  jwt.NewNumericDate(now),
		},
	}

	token := jwt.NewWithClaims(jwt.SigningMethodHS256, jwtClaims)
	tokenStr, err := token.SignedString([]byte(h.jwtSecret))
	if err != nil {
		respondError(c, http.StatusInternalServerError, "INTERNAL_ERROR", "토큰 발급 실패")
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"token":       tokenStr,
		"userId":      userID,
		"displayName": displayName,
		"expiresIn":   86400,
	})
}

// googleTokenEndpoint Google Token Endpoint URL. 테스트에서 오버라이드 가능하도록 변수로 선언한다.
var googleTokenEndpoint = "https://oauth2.googleapis.com/token"

// exchangeGoogleCode Google OAuth authorization code를 id_token으로 교환한다.
// 내부적으로 googleTokenEndpoint 변수를 사용한다.
func exchangeGoogleCode(ctx context.Context, clientID, clientSecret, code, redirectURI string) (*googleIDTokenClaims, error) {
	return exchangeGoogleCodeWithEndpoint(ctx, googleTokenEndpoint, clientID, clientSecret, code, redirectURI)
}

// exchangeGoogleCodeWithEndpoint endpoint URL을 직접 받는 내부 함수 (테스트 주입용).
func exchangeGoogleCodeWithEndpoint(ctx context.Context, endpoint, clientID, clientSecret, code, redirectURI string) (*googleIDTokenClaims, error) {
	formData := url.Values{
		"code":          {code},
		"client_id":     {clientID},
		"client_secret": {clientSecret},
		"redirect_uri":  {redirectURI},
		"grant_type":    {"authorization_code"},
	}

	reqHTTP, err := http.NewRequestWithContext(ctx, http.MethodPost,
		endpoint,
		strings.NewReader(formData.Encode()),
	)
	if err != nil {
		return nil, fmt.Errorf("request build: %w", err)
	}
	reqHTTP.Header.Set("Content-Type", "application/x-www-form-urlencoded")

	httpClient := &http.Client{Timeout: 10 * time.Second}
	resp, err := httpClient.Do(reqHTTP)
	if err != nil {
		return nil, fmt.Errorf("google token endpoint: %w", err)
	}
	defer resp.Body.Close() //nolint:errcheck

	body, err := io.ReadAll(resp.Body)
	if err != nil {
		return nil, fmt.Errorf("read response body: %w", err)
	}

	if resp.StatusCode != http.StatusOK {
		return nil, fmt.Errorf("google token endpoint returned %d: %s", resp.StatusCode, string(body))
	}

	var tokenResp googleTokenResponse
	if err := json.Unmarshal(body, &tokenResp); err != nil {
		return nil, fmt.Errorf("parse google token response: %w", err)
	}

	if tokenResp.IDToken == "" {
		return nil, errors.New("id_token not found in google response")
	}

	// id_token은 JWT이지만, Google Token Endpoint 인증 완료 후이므로 페이로드만 파싱한다.
	// (JWKS 서명 검증은 Phase 5 이후 적용 예정)
	claims, err := parseIDTokenPayload(tokenResp.IDToken)
	if err != nil {
		return nil, fmt.Errorf("parse id_token payload: %w", err)
	}

	return claims, nil
}

// parseIDTokenPayload JWT id_token의 페이로드(2번 세그먼트)를 Base64 디코딩하여 클레임을 추출한다.
func parseIDTokenPayload(idToken string) (*googleIDTokenClaims, error) {
	parts := strings.Split(idToken, ".")
	if len(parts) != 3 {
		return nil, errors.New("invalid id_token format: expected 3 segments")
	}

	// JWT Base64url(패딩 없음) → 표준 Base64 변환
	payload := parts[1]
	switch len(payload) % 4 {
	case 2:
		payload += "=="
	case 3:
		payload += "="
	}
	payload = strings.ReplaceAll(payload, "-", "+")
	payload = strings.ReplaceAll(payload, "_", "/")

	decoded, err := base64.StdEncoding.DecodeString(payload)
	if err != nil {
		return nil, fmt.Errorf("base64 decode id_token payload: %w", err)
	}

	var claims googleIDTokenClaims
	if err := json.Unmarshal(decoded, &claims); err != nil {
		return nil, fmt.Errorf("unmarshal id_token claims: %w", err)
	}

	if claims.Sub == "" {
		return nil, errors.New("sub field missing in id_token")
	}

	return &claims, nil
}

// upsertUser Google 클레임으로 User를 조회하거나 생성한다.
// UserRepo가 nil이면 GoogleSub를 UserID로 사용하는 폴백을 반환한다.
func (h *AuthHandler) upsertUser(ctx context.Context, gc *googleIDTokenClaims) (userID, displayName, email string) {
	displayName = gc.Name
	if displayName == "" {
		displayName = strings.Split(gc.Email, "@")[0]
	}

	if h.userRepo == nil {
		// DB 없음: GoogleSub를 UserID로 직접 사용 (개발 환경 폴백)
		return gc.Sub, displayName, gc.Email
	}

	existing, err := h.userRepo.GetUserByGoogleID(ctx, gc.Sub)
	if err == nil {
		// 기존 사용자: 프로필 변경분 반영 (에러 무시 — 로그인 자체를 막지 않는다)
		if gc.Name != "" && existing.DisplayName != gc.Name {
			existing.DisplayName = gc.Name
		}
		if gc.Email != "" && existing.Email != gc.Email {
			existing.Email = gc.Email
		}
		_ = h.userRepo.UpdateUser(ctx, existing)
		return existing.ID, existing.DisplayName, existing.Email
	}

	if !errors.Is(err, gorm.ErrRecordNotFound) {
		// DB 조회 오류지만 로그인을 막지 않음 — sub를 임시 ID로 사용
		return gc.Sub, displayName, gc.Email
	}

	// 신규 사용자 생성
	newUser := &model.User{
		GoogleID:    gc.Sub,
		Email:       gc.Email,
		DisplayName: displayName,
		Role:        model.UserRoleUser,
		EloRating:   1000,
	}
	if createErr := h.userRepo.CreateUser(ctx, newUser); createErr != nil {
		// 생성 실패 시 sub를 임시 ID로 사용
		return gc.Sub, displayName, gc.Email
	}
	return newUser.ID, newUser.DisplayName, newUser.Email
}
