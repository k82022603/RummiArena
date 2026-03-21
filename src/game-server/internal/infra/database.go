// Package infra provides infrastructure initialization helpers for
// PostgreSQL (GORM) and Redis connections.
package infra

import (
	"fmt"
	"time"

	"go.uber.org/zap"
	"gorm.io/driver/postgres"
	"gorm.io/gorm"
	gormlogger "gorm.io/gorm/logger"

	"github.com/k82022603/RummiArena/game-server/internal/config"
	"github.com/k82022603/RummiArena/game-server/internal/model"
)

// NewPostgresDB PostgreSQL 연결을 초기화하고 GORM *DB를 반환한다.
// 연결 실패 시 에러를 반환한다. 서버 시작 시 필수 의존성이므로 호출자가 Fatal 처리한다.
func NewPostgresDB(cfg config.DBConfig, logger *zap.Logger) (*gorm.DB, error) {
	dsn := fmt.Sprintf(
		"host=%s port=%s user=%s password=%s dbname=%s sslmode=disable TimeZone=Asia/Seoul",
		cfg.Host, cfg.Port, cfg.User, cfg.Password, cfg.DBName,
	)

	// 개발 환경: Info 레벨 GORM 로그, 프로덕션: Silent
	gormLog := gormlogger.Default.LogMode(gormlogger.Info)

	db, err := gorm.Open(postgres.New(postgres.Config{
		DSN:                  dsn,
		PreferSimpleProtocol: true, // pgx prepared statement 비활성화 (PgBouncer 호환)
	}), &gorm.Config{
		Logger:                                   gormLog,
		DisableForeignKeyConstraintWhenMigrating: false,
	})
	if err != nil {
		return nil, fmt.Errorf("infra: open postgres: %w", err)
	}

	// 커넥션 풀 설정 (16GB RAM 최적화)
	sqlDB, err := db.DB()
	if err != nil {
		return nil, fmt.Errorf("infra: get sql.DB: %w", err)
	}
	sqlDB.SetMaxOpenConns(10)
	sqlDB.SetMaxIdleConns(5)
	sqlDB.SetConnMaxLifetime(30 * time.Minute)
	sqlDB.SetConnMaxIdleTime(10 * time.Minute)

	// Ping으로 연결 확인
	if err := sqlDB.Ping(); err != nil {
		return nil, fmt.Errorf("infra: ping postgres: %w", err)
	}

	logger.Info("postgres connected",
		zap.String("host", cfg.Host),
		zap.String("port", cfg.Port),
		zap.String("db", cfg.DBName),
	)
	return db, nil
}

// AutoMigrate GORM AutoMigrate로 모든 테이블 스키마를 동기화한다.
// SQL 마이그레이션 파일(migrations/)과 병행하여 개발 환경에서 편의상 사용한다.
// 프로덕션에서는 SQL 마이그레이션 파일만 사용할 것.
func AutoMigrate(db *gorm.DB, logger *zap.Logger) error {
	models := []interface{}{
		&model.User{},
		&model.Room{},
		&model.Game{},
		&model.GamePlayer{},
		&model.GameEvent{},
		&model.GameSnapshot{},
		&model.AICallLog{},
		&model.EloHistory{},
		&model.PracticeProgress{},
	}

	if err := db.AutoMigrate(models...); err != nil {
		return fmt.Errorf("infra: auto migrate: %w", err)
	}

	logger.Info("database schema migrated", zap.Int("models", len(models)))
	return nil
}
