package main

import (
	"context"
	"net/http"
	"os"
	"os/signal"
	"syscall"
	"time"

	"github.com/gin-gonic/gin"
	"go.uber.org/zap"

	"github.com/k82022603/RummiArena/game-server/internal/config"
	"github.com/k82022603/RummiArena/game-server/internal/handler"
	"github.com/k82022603/RummiArena/game-server/internal/infra"
	"github.com/k82022603/RummiArena/game-server/internal/middleware"
	"github.com/k82022603/RummiArena/game-server/internal/repository"
	"github.com/k82022603/RummiArena/game-server/internal/service"
)

func main() {
	// --- 로거 초기화 ---
	logger, err := zap.NewProduction()
	if err != nil {
		panic("failed to initialize logger: " + err.Error())
	}
	defer logger.Sync() //nolint:errcheck

	// --- 설정 로딩 ---
	cfg, err := config.Load()
	if err != nil {
		logger.Fatal("failed to load config", zap.Error(err))
	}

	// --- PostgreSQL 연결 (선택적: 실패해도 서버 시작) ---
	db, err := infra.NewPostgresDB(cfg.DB, logger)
	if err != nil {
		logger.Warn("postgres unavailable — running without DB", zap.Error(err))
	} else {
		// AutoMigrate (개발 환경 편의. 프로덕션은 migrations/ SQL 파일 사용)
		if err := infra.AutoMigrate(db, logger); err != nil {
			logger.Warn("auto migrate failed", zap.Error(err))
		}
	}

	// --- Redis 연결 (선택적: 실패해도 서버 시작) ---
	redisClient, _ := infra.NewRedisClient(cfg.Redis, logger)

	// --- 게임 상태 레포지터리 초기화 ---
	// Redis 가용 여부에 따라 구현체를 선택한다 (어댑터 패턴).
	var gameStateRepo repository.MemoryGameStateRepository
	if infra.IsRedisAvailable(redisClient) {
		gameStateRepo = repository.NewRedisGameStateMemAdapter(redisClient)
		logger.Info("using redis game state repository")
	} else {
		logger.Warn("using in-memory game state repository (redis unavailable)")
		gameStateRepo = repository.NewMemoryGameStateRepoAdapter()
	}

	// 인메모리 방 레포지터리 (MVP 단계)
	roomRepo := repository.NewMemoryRoomRepo()

	// --- gin 모드 설정 ---
	gin.SetMode(cfg.Server.Mode)

	// --- 서비스 초기화 (DI 수동 와이어링) ---
	roomSvc := service.NewRoomService(roomRepo, gameStateRepo)
	gameSvc := service.NewGameService(gameStateRepo)
	turnSvc := service.NewTurnService(gameStateRepo, gameSvc)
	_ = turnSvc // WebSocket 핸들러에서 사용 예정

	// --- 핸들러 초기화 ---
	roomHandler := handler.NewRoomHandler(roomSvc)
	gameHandler := handler.NewGameHandler(gameSvc)
	wsHandler := handler.NewWSHandler()

	// --- 라우터 설정 ---
	router := gin.New()
	router.Use(gin.Recovery())
	router.Use(middleware.ZapLogger(logger))

	// 시스템 헬스체크 (인증 불필요)
	router.GET("/health", func(c *gin.Context) {
		c.JSON(http.StatusOK, gin.H{
			"status":    "ok",
			"timestamp": time.Now().UTC().Format(time.RFC3339),
			"redis":     infra.IsRedisAvailable(redisClient),
		})
	})
	router.GET("/ready", func(c *gin.Context) {
		c.JSON(http.StatusOK, gin.H{"status": "ready"})
	})

	// WebSocket (인증은 WS 핸들러 내부에서 처리)
	router.GET("/ws", wsHandler.HandleWS)

	// --- API 라우트 그룹 ---
	api := router.Group("/api")

	// Room 라우트 (JWT 인증 필요)
	rooms := api.Group("/rooms")
	rooms.Use(middleware.JWTAuth(cfg.JWT.Secret))
	{
		rooms.POST("", roomHandler.CreateRoom)
		rooms.GET("", roomHandler.ListRooms)
		rooms.GET("/:id", roomHandler.GetRoom)
		rooms.POST("/:id/join", roomHandler.JoinRoom)
		rooms.POST("/:id/leave", roomHandler.LeaveRoom)
		rooms.POST("/:id/start", roomHandler.StartGame)
		rooms.DELETE("/:id", roomHandler.DeleteRoom)
	}

	// Game 라우트 (JWT 인증 필요)
	games := api.Group("/games")
	games.Use(middleware.JWTAuth(cfg.JWT.Secret))
	{
		games.GET("/:id", gameHandler.GetGameState)
		games.POST("/:id/place", gameHandler.PlaceTiles)
		games.POST("/:id/confirm", gameHandler.ConfirmTurn)
		games.POST("/:id/draw", gameHandler.DrawTile)
		games.POST("/:id/reset", gameHandler.ResetTurn)
	}

	// --- HTTP 서버 ---
	srv := &http.Server{
		Addr:         ":" + cfg.Server.Port,
		Handler:      router,
		ReadTimeout:  15 * time.Second,
		WriteTimeout: 15 * time.Second,
		IdleTimeout:  60 * time.Second,
	}

	// --- Graceful Shutdown ---
	quit := make(chan os.Signal, 1)
	signal.Notify(quit, syscall.SIGINT, syscall.SIGTERM)

	go func() {
		logger.Info("server starting", zap.String("port", cfg.Server.Port))
		if err := srv.ListenAndServe(); err != nil && err != http.ErrServerClosed {
			logger.Fatal("server error", zap.Error(err))
		}
	}()

	<-quit
	logger.Info("shutting down server...")

	shutdownCtx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()

	if err := srv.Shutdown(shutdownCtx); err != nil {
		logger.Error("server shutdown error", zap.Error(err))
	}

	// Redis 연결 해제
	if redisClient != nil {
		if err := redisClient.Close(); err != nil {
			logger.Warn("redis close error", zap.Error(err))
		}
	}
	// PostgreSQL 연결 해제
	if db != nil {
		if sqlDB, err := db.DB(); err == nil {
			if err := sqlDB.Close(); err != nil {
				logger.Warn("postgres close error", zap.Error(err))
			}
		}
	}

	logger.Info("server stopped")
}
