package middleware

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/gin-gonic/gin"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func init() {
	gin.SetMode(gin.TestMode)
}

// setupRoleRouter builds a test router that pre-sets the given role in the
// context (simulating what JWTAuth does) and then applies RequireRole.
// roleToSet == "" means the context key is not set at all.
func setupRoleRouter(allowedRoles []string, roleToSet string, setKey bool) *gin.Engine {
	r := gin.New()
	r.GET("/protected", func(c *gin.Context) {
		if setKey {
			c.Set(ctxKeyRole, roleToSet)
		}
	}, RequireRole(allowedRoles...), func(c *gin.Context) {
		c.Status(http.StatusOK)
	})
	return r
}

// errCode extracts the nested error.code field from the response body.
func errCode(t *testing.T, body []byte) string {
	t.Helper()
	var resp struct {
		Error struct {
			Code string `json:"code"`
		} `json:"error"`
	}
	require.NoError(t, json.Unmarshal(body, &resp))
	return resp.Error.Code
}

// TestRequireRole_AllowedRole verifies that a request whose role matches the
// single allowed role passes through and receives 200 OK.
func TestRequireRole_AllowedRole(t *testing.T) {
	r := setupRoleRouter([]string{"admin"}, "admin", true)

	req := httptest.NewRequest(http.MethodGet, "/protected", nil)
	w := httptest.NewRecorder()
	r.ServeHTTP(w, req)

	assert.Equal(t, http.StatusOK, w.Code)
}

// TestRequireRole_DisallowedRole verifies that a request whose role is not in
// the allowed list is rejected with 403 Forbidden.
func TestRequireRole_DisallowedRole(t *testing.T) {
	r := setupRoleRouter([]string{"admin"}, "user", true)

	req := httptest.NewRequest(http.MethodGet, "/protected", nil)
	w := httptest.NewRecorder()
	r.ServeHTTP(w, req)

	assert.Equal(t, http.StatusForbidden, w.Code)
	assert.Equal(t, "FORBIDDEN", errCode(t, w.Body.Bytes()))
}

// TestRequireRole_NoRoleKey verifies that a request with no role context key
// (i.e. JWTAuth was not applied) is rejected with 403 Forbidden.
func TestRequireRole_NoRoleKey(t *testing.T) {
	r := setupRoleRouter([]string{"admin"}, "", false)

	req := httptest.NewRequest(http.MethodGet, "/protected", nil)
	w := httptest.NewRecorder()
	r.ServeHTTP(w, req)

	assert.Equal(t, http.StatusForbidden, w.Code)
	assert.Equal(t, "FORBIDDEN", errCode(t, w.Body.Bytes()))
}

// TestRequireRole_EmptyRoleValue verifies that a request whose role context
// value is an empty string is rejected with 403 Forbidden.
func TestRequireRole_EmptyRoleValue(t *testing.T) {
	r := setupRoleRouter([]string{"admin"}, "", true)

	req := httptest.NewRequest(http.MethodGet, "/protected", nil)
	w := httptest.NewRecorder()
	r.ServeHTTP(w, req)

	assert.Equal(t, http.StatusForbidden, w.Code)
	assert.Equal(t, "FORBIDDEN", errCode(t, w.Body.Bytes()))
}

// TestRequireRole_MultipleAllowedRoles verifies that any one of the permitted
// roles is accepted.
func TestRequireRole_MultipleAllowedRoles(t *testing.T) {
	cases := []struct {
		name     string
		role     string
		wantCode int
	}{
		{"admin role passes", "admin", http.StatusOK},
		{"moderator role passes", "moderator", http.StatusOK},
		{"guest role blocked", "guest", http.StatusForbidden},
	}

	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			r := setupRoleRouter([]string{"admin", "moderator"}, tc.role, true)

			req := httptest.NewRequest(http.MethodGet, "/protected", nil)
			w := httptest.NewRecorder()
			r.ServeHTTP(w, req)

			assert.Equal(t, tc.wantCode, w.Code)
		})
	}
}

// TestRoleFromContext_Present verifies that RoleFromContext returns the role
// and true when the context key is set.
func TestRoleFromContext_Present(t *testing.T) {
	gin.SetMode(gin.TestMode)
	w := httptest.NewRecorder()
	c, _ := gin.CreateTestContext(w)
	c.Set(ctxKeyRole, "admin")

	role, ok := RoleFromContext(c)

	assert.True(t, ok)
	assert.Equal(t, "admin", role)
}

// TestRoleFromContext_Absent verifies that RoleFromContext returns an empty
// string and false when the context key is not set.
func TestRoleFromContext_Absent(t *testing.T) {
	gin.SetMode(gin.TestMode)
	w := httptest.NewRecorder()
	c, _ := gin.CreateTestContext(w)

	role, ok := RoleFromContext(c)

	assert.False(t, ok)
	assert.Empty(t, role)
}
