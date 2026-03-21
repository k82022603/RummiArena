package config

import (
	"log"
	"os"

	"github.com/spf13/viper"
)

type Config struct {
	Server ServerConfig
	DB     DBConfig
	Redis  RedisConfig
	JWT    JWTConfig
	AppEnv string // "dev" | "staging" | "production"
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
	viper.SetDefault("SERVER_MODE", "debug")
	viper.SetDefault("DB_HOST", "localhost")
	viper.SetDefault("DB_PORT", "5432")
	viper.SetDefault("DB_USER", "rummikub")
	viper.SetDefault("DB_PASSWORD", "")
	viper.SetDefault("DB_NAME", "rummikub")
	viper.SetDefault("REDIS_HOST", "localhost")
	viper.SetDefault("REDIS_PORT", "6379")
	viper.SetDefault("REDIS_PASSWORD", "")
	viper.SetDefault("JWT_SECRET", "")

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
	}

	if cfg.DB.Password == "" {
		log.Println("[WARN] DB_PASSWORD is not set — set via environment variable for production")
	}

	if cfg.JWT.Secret == "" {
		if cfg.AppEnv == "production" {
			log.Fatal("[FATAL] JWT_SECRET must be set in production environment — refusing to start")
			os.Exit(1) // log.Fatal already calls os.Exit(1); kept for explicit intent
		}
		log.Println("[WARN] JWT_SECRET is not set — set via environment variable for production")
	}

	return cfg, nil
}
