package handler

import (
	"net/http"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/golang-jwt/jwt/v5"
	"github.com/k82022603/RummiArena/game-server/internal/middleware"
)

// AuthHandler 인증 관련 HTTP 핸들러
type AuthHandler struct {
	jwtSecret string
}

// NewAuthHandler AuthHandler 생성자
func NewAuthHandler(jwtSecret string) *AuthHandler {
	return &AuthHandler{jwtSecret: jwtSecret}
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
