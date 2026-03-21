package middleware

import (
	"net/http"

	"github.com/gin-gonic/gin"
)

// RequireRole returns a gin middleware that allows only requests whose JWT role
// claim matches one of the given roles.
//
// This middleware must be placed after JWTAuth, which sets the "role" context
// key parsed from the token's Claims.Role field.
//
// Usage example in router setup:
//
//	adminGroup := router.Group("/admin")
//	adminGroup.Use(middleware.JWTAuth(cfg.JWT.Secret))
//	adminGroup.Use(middleware.RequireRole("admin"))
//	{
//	    adminGroup.GET("/users", handler.ListUsers)
//	    adminGroup.DELETE("/games/:id", handler.ForceEndGame)
//	}
func RequireRole(roles ...string) gin.HandlerFunc {
	allowed := make(map[string]struct{}, len(roles))
	for _, r := range roles {
		allowed[r] = struct{}{}
	}

	return func(c *gin.Context) {
		roleVal, exists := c.Get(ctxKeyRole)
		if !exists {
			c.AbortWithStatusJSON(http.StatusForbidden, gin.H{
				"error": gin.H{
					"code":    "FORBIDDEN",
					"message": "권한 정보가 없습니다. 먼저 인증을 완료하세요.",
				},
			})
			return
		}

		role, ok := roleVal.(string)
		if !ok || role == "" {
			c.AbortWithStatusJSON(http.StatusForbidden, gin.H{
				"error": gin.H{
					"code":    "FORBIDDEN",
					"message": "토큰에 role 클레임이 없습니다.",
				},
			})
			return
		}

		if _, permitted := allowed[role]; !permitted {
			c.AbortWithStatusJSON(http.StatusForbidden, gin.H{
				"error": gin.H{
					"code":    "FORBIDDEN",
					"message": "해당 리소스에 접근할 권한이 없습니다.",
				},
			})
			return
		}

		c.Next()
	}
}

// RoleFromContext extracts the authenticated user's role from the gin context.
// Returns an empty string and false if the role is not set.
func RoleFromContext(c *gin.Context) (string, bool) {
	v, exists := c.Get(ctxKeyRole)
	if !exists {
		return "", false
	}
	role, ok := v.(string)
	return role, ok
}
