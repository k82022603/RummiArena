package config

import (
	"log"

	"github.com/spf13/viper"
)

type Config struct {
	Server      ServerConfig
	DB          DBConfig
	Redis       RedisConfig
	JWT         JWTConfig
	AIAdapter   AIAdapterConfig
	GoogleOAuth GoogleOAuthConfig
	RateLimit   RateLimitConfig
	AppEnv      string // "dev" | "staging" | "production"
}

// RateLimitConfig holds configurable rate limit thresholds.
// All policies share the same window duration (WindowSeconds).
// Defaults match the original hardcoded values for backwards compatibility.
type RateLimitConfig struct {
	HighMax       int // max requests for high-frequency endpoints (default 60)
	MediumMax     int // max requests for medium-frequency endpoints (default 30)
	LowMax        int // max requests for low-frequency endpoints (default 10)
	AdminMax      int // max requests for admin endpoints (default 30)
	WSMax         int // max WebSocket connection attempts (default 5)
	WindowSeconds int // shared window duration in seconds (default 60)
}

// GoogleOAuthConfig Google OAuth 2.0 클라이언트 설정
type GoogleOAuthConfig struct {
	ClientID     string
	ClientSecret string
	JWKSURL      string // Google JWKS 공개키 엔드포인트 (기본: https://www.googleapis.com/oauth2/v3/certs)
}

// AIAdapterConfig ai-adapter 서비스 연결 설정
type AIAdapterConfig struct {
	BaseURL    string
	Token      string
	TimeoutSec int
}

type ServerConfig struct {
	Port string
	Mode string
}

type DBConfig struct {
	Host     string
	Port     string
	User     string
	Password string
	DBName   string
}

type RedisConfig struct {
	Host     string
	Port     string
	Password string
}

type JWTConfig struct {
	Secret string
}

func Load() (*Config, error) {
	viper.SetDefault("APP_ENV", "production")
	viper.SetDefault("SERVER_PORT", "8080")
	viper.SetDefault("SERVER_MODE", "release")
	viper.SetDefault("DB_HOST", "localhost")
	viper.SetDefault("DB_PORT", "5432")
	viper.SetDefault("DB_USER", "rummikub")
	viper.SetDefault("DB_PASSWORD", "")
	viper.SetDefault("DB_NAME", "rummikub")
	viper.SetDefault("REDIS_HOST", "localhost")
	viper.SetDefault("REDIS_PORT", "6379")
	viper.SetDefault("REDIS_PASSWORD", "")
	viper.SetDefault("JWT_SECRET", "")
	viper.SetDefault("AI_ADAPTER_URL", "http://ai-adapter:3000")
	viper.SetDefault("AI_ADAPTER_INTERNAL_TOKEN", "")
	viper.SetDefault("AI_ADAPTER_TIMEOUT_SEC", 180)
	viper.SetDefault("GOOGLE_CLIENT_ID", "")
	viper.SetDefault("GOOGLE_CLIENT_SECRET", "")
	viper.SetDefault("GOOGLE_JWKS_URL", "https://www.googleapis.com/oauth2/v3/certs")

	// Rate limit defaults — identical to original hardcoded values
	viper.SetDefault("RATE_LIMIT_HIGH_MAX", 60)
	viper.SetDefault("RATE_LIMIT_MEDIUM_MAX", 30)
	viper.SetDefault("RATE_LIMIT_LOW_MAX", 10)
	viper.SetDefault("RATE_LIMIT_ADMIN_MAX", 30)
	viper.SetDefault("RATE_LIMIT_WS_MAX", 5)
	viper.SetDefault("RATE_LIMIT_WINDOW_SECONDS", 60)

	viper.AutomaticEnv()

	cfg := &Config{
		AppEnv: viper.GetString("APP_ENV"),
		Server: ServerConfig{
			Port: viper.GetString("SERVER_PORT"),
			Mode: viper.GetString("SERVER_MODE"),
		},
		DB: DBConfig{
			Host:     viper.GetString("DB_HOST"),
			Port:     viper.GetString("DB_PORT"),
			User:     viper.GetString("DB_USER"),
			Password: viper.GetString("DB_PASSWORD"),
			DBName:   viper.GetString("DB_NAME"),
		},
		Redis: RedisConfig{
			Host:     viper.GetString("REDIS_HOST"),
			Port:     viper.GetString("REDIS_PORT"),
			Password: viper.GetString("REDIS_PASSWORD"),
		},
		JWT: JWTConfig{
			Secret: viper.GetString("JWT_SECRET"),
		},
		AIAdapter: AIAdapterConfig{
			BaseURL:    viper.GetString("AI_ADAPTER_URL"),
			Token:      viper.GetString("AI_ADAPTER_INTERNAL_TOKEN"),
			TimeoutSec: viper.GetInt("AI_ADAPTER_TIMEOUT_SEC"),
		},
		GoogleOAuth: GoogleOAuthConfig{
			ClientID:     viper.GetString("GOOGLE_CLIENT_ID"),
			ClientSecret: viper.GetString("GOOGLE_CLIENT_SECRET"),
			JWKSURL:      viper.GetString("GOOGLE_JWKS_URL"),
		},
		RateLimit: RateLimitConfig{
			HighMax:       viper.GetInt("RATE_LIMIT_HIGH_MAX"),
			MediumMax:     viper.GetInt("RATE_LIMIT_MEDIUM_MAX"),
			LowMax:        viper.GetInt("RATE_LIMIT_LOW_MAX"),
			AdminMax:      viper.GetInt("RATE_LIMIT_ADMIN_MAX"),
			WSMax:         viper.GetInt("RATE_LIMIT_WS_MAX"),
			WindowSeconds: viper.GetInt("RATE_LIMIT_WINDOW_SECONDS"),
		},
	}

	if cfg.DB.Password == "" {
		log.Println("[WARN] DB_PASSWORD is not set — set via environment variable for production")
	}

	if cfg.JWT.Secret == "" {
		if cfg.AppEnv == "production" {
			log.Fatal("[FATAL] JWT_SECRET must be set in production environment — refusing to start")
		}
		log.Println("[WARN] JWT_SECRET is not set — set via environment variable for production")
	}

	return cfg, nil
}
