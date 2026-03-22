package config

import (
	"testing"

	"github.com/spf13/viper"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

// resetViper clears all viper keys so that each test starts from a clean slate.
// viper is a package-level singleton, so tests must reset it between runs.
func resetViper(t *testing.T) {
	t.Helper()
	viper.Reset()
}

// TestLoad_Development_EmptyJWTSecret verifies that Load() succeeds (no
// log.Fatal) when APP_ENV is a development-like value and JWT_SECRET is empty.
func TestLoad_Development_EmptyJWTSecret(t *testing.T) {
	resetViper(t)
	t.Setenv("APP_ENV", "development")
	t.Setenv("JWT_SECRET", "")

	cfg, err := Load()

	require.NoError(t, err)
	assert.Equal(t, "development", cfg.AppEnv)
	assert.Empty(t, cfg.JWT.Secret)
}

// TestLoad_Production_SecretSet verifies that Load() succeeds when APP_ENV is
// "production" and JWT_SECRET is a non-empty value.
func TestLoad_Production_SecretSet(t *testing.T) {
	resetViper(t)
	t.Setenv("APP_ENV", "production")
	t.Setenv("JWT_SECRET", "super-secret-key")

	cfg, err := Load()

	require.NoError(t, err)
	assert.Equal(t, "production", cfg.AppEnv)
	assert.Equal(t, "super-secret-key", cfg.JWT.Secret)
}

// TestLoad_Defaults verifies that Load() applies sensible defaults when no
// environment variables are set (except JWT_SECRET to avoid log.Fatal).
func TestLoad_Defaults(t *testing.T) {
	resetViper(t)
	t.Setenv("APP_ENV", "development")
	t.Setenv("JWT_SECRET", "")

	cfg, err := Load()

	require.NoError(t, err)
	assert.Equal(t, "8080", cfg.Server.Port)
	assert.Equal(t, "release", cfg.Server.Mode)
	assert.Equal(t, "localhost", cfg.DB.Host)
	assert.Equal(t, "5432", cfg.DB.Port)
	assert.Equal(t, "rummikub", cfg.DB.User)
	assert.Equal(t, "rummikub", cfg.DB.DBName)
	assert.Equal(t, "localhost", cfg.Redis.Host)
	assert.Equal(t, "6379", cfg.Redis.Port)
}

// TestLoad_AllFieldsFromEnv verifies that all Config fields are correctly
// populated from environment variables.
func TestLoad_AllFieldsFromEnv(t *testing.T) {
	resetViper(t)
	t.Setenv("APP_ENV", "staging")
	t.Setenv("SERVER_PORT", "9090")
	t.Setenv("SERVER_MODE", "release")
	t.Setenv("DB_HOST", "db.example.com")
	t.Setenv("DB_PORT", "5433")
	t.Setenv("DB_USER", "pguser")
	t.Setenv("DB_PASSWORD", "pgpass")
	t.Setenv("DB_NAME", "rummiarena")
	t.Setenv("REDIS_HOST", "redis.example.com")
	t.Setenv("REDIS_PORT", "6380")
	t.Setenv("REDIS_PASSWORD", "redispass")
	t.Setenv("JWT_SECRET", "jwt-secret-value")

	cfg, err := Load()

	require.NoError(t, err)
	assert.Equal(t, "staging", cfg.AppEnv)
	assert.Equal(t, "9090", cfg.Server.Port)
	assert.Equal(t, "release", cfg.Server.Mode)
	assert.Equal(t, "db.example.com", cfg.DB.Host)
	assert.Equal(t, "5433", cfg.DB.Port)
	assert.Equal(t, "pguser", cfg.DB.User)
	assert.Equal(t, "pgpass", cfg.DB.Password)
	assert.Equal(t, "rummiarena", cfg.DB.DBName)
	assert.Equal(t, "redis.example.com", cfg.Redis.Host)
	assert.Equal(t, "6380", cfg.Redis.Port)
	assert.Equal(t, "redispass", cfg.Redis.Password)
	assert.Equal(t, "jwt-secret-value", cfg.JWT.Secret)
}

// TestLoad_Dev_EmptyJWTSecret verifies that non-production environments with
// APP_ENV="dev" also tolerate an empty JWT_SECRET without crashing.
func TestLoad_Dev_EmptyJWTSecret(t *testing.T) {
	resetViper(t)
	t.Setenv("APP_ENV", "dev")
	t.Setenv("JWT_SECRET", "")

	cfg, err := Load()

	require.NoError(t, err)
	assert.Equal(t, "dev", cfg.AppEnv)
	assert.Empty(t, cfg.JWT.Secret)
}
