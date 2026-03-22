package middleware

import (
	"net/http"
	"strings"

	"github.com/gin-gonic/gin"
	"github.com/golang-jwt/jwt/v5"
)

const (
	ctxKeyUserID = "userID"
	ctxKeyRole   = "role"
)

// Claims is the JWT payload structure.
type Claims struct {
	UserID string `json:"sub"`
	Email  string `json:"email"`
	Role   string `json:"role"` // e.g. "user", "admin"
	jwt.RegisteredClaims
}

// JWTAuth returns a gin middleware that validates Bearer JWT tokens.
// The JWT secret is injected at construction time.
func JWTAuth(secret string) gin.HandlerFunc {
	return func(c *gin.Context) {
		authHeader := c.GetHeader("Authorization")
		if authHeader == "" {
			c.AbortWithStatusJSON(http.StatusUnauthorized, gin.H{
				"error": gin.H{"code": "UNAUTHORIZED", "message": "인증 토큰이 없습니다."},
			})
			return
		}

		parts := strings.SplitN(authHeader, " ", 2)
		if len(parts) != 2 || strings.ToLower(parts[0]) != "bearer" {
			c.AbortWithStatusJSON(http.StatusUnauthorized, gin.H{
				"error": gin.H{"code": "UNAUTHORIZED", "message": "Bearer 토큰 형식이 올바르지 않습니다."},
			})
			return
		}

		tokenStr := parts[1]
		claims := &Claims{}

		token, err := jwt.ParseWithClaims(tokenStr, claims, func(t *jwt.Token) (any, error) {
			if _, ok := t.Method.(*jwt.SigningMethodHMAC); !ok {
				return nil, jwt.ErrSignatureInvalid
			}
			return []byte(secret), nil
		})

		if err != nil || !token.Valid {
			c.AbortWithStatusJSON(http.StatusUnauthorized, gin.H{
				"error": gin.H{"code": "UNAUTHORIZED", "message": "유효하지 않거나 만료된 토큰입니다."},
			})
			return
		}

		c.Set(ctxKeyUserID, claims.UserID)
		c.Set(ctxKeyRole, claims.Role)
		c.Next()
	}
}

// UserIDFromContext extracts the authenticated user ID from the gin context.
func UserIDFromContext(c *gin.Context) (string, bool) {
	v, exists := c.Get(ctxKeyUserID)
	if !exists {
		return "", false
	}
	id, ok := v.(string)
	return id, ok
}

