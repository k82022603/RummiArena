package main

import (
	"context"
	"net/http"
	"os"
	"os/signal"
	"syscall"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/redis/go-redis/v9"
	"go.uber.org/zap"
	"gorm.io/gorm"

	"github.com/k82022603/RummiArena/game-server/internal/client"
	"github.com/k82022603/RummiArena/game-server/internal/config"
	"github.com/k82022603/RummiArena/game-server/internal/handler"
	"github.com/k82022603/RummiArena/game-server/internal/infra"
	"github.com/k82022603/RummiArena/game-server/internal/middleware"
	"github.com/k82022603/RummiArena/game-server/internal/repository"
	"github.com/k82022603/RummiArena/game-server/internal/service"
)

func main() {
	logger, err := zap.NewProduction()
	if err != nil {
		panic("failed to initialize logger: " + err.Error())
	}
	defer logger.Sync() //nolint:errcheck

	cfg, err := config.Load()
	if err != nil {
		logger.Fatal("failed to load config", zap.Error(err))
	}

	db, redisClient := initInfra(cfg, logger)

	gameStateRepo := initGameStateRepo(redisClient, logger)
	roomRepo := repository.NewMemoryRoomRepo()

	gin.SetMode(cfg.Server.Mode)

	router := buildRouter(cfg, logger, db, redisClient, gameStateRepo, roomRepo)

	srv := &http.Server{
		Addr:         ":" + cfg.Server.Port,
		Handler:      router,
		ReadTimeout:  15 * time.Second,
		WriteTimeout: 15 * time.Second,
		IdleTimeout:  60 * time.Second,
	}

	runServer(srv, cfg, logger)

	shutdownConnections(db, redisClient, logger)

	logger.Info("server stopped")
}

// initInfra PostgreSQL과 Redis 연결을 초기화한다. 각 연결 실패는 경고로 처리한다.
func initInfra(cfg *config.Config, logger *zap.Logger) (*gorm.DB, *redis.Client) {
	db, err := infra.NewPostgresDB(cfg.DB, logger)
	if err != nil {
		logger.Warn("postgres unavailable — running without DB", zap.Error(err))
	} else if err := infra.AutoMigrate(db, logger); err != nil {
		logger.Warn("auto migrate failed", zap.Error(err))
	}

	redisClient, _ := infra.NewRedisClient(cfg.Redis, logger)
	return db, redisClient
}

// initGameStateRepo Redis 가용 여부에 따라 게임 상태 레포지터리 구현체를 선택한다.
func initGameStateRepo(redisClient *redis.Client, logger *zap.Logger) repository.MemoryGameStateRepository {
	if infra.IsRedisAvailable(redisClient) {
		logger.Info("using redis game state repository")
		return repository.NewRedisGameStateMemAdapter(redisClient)
	}
	logger.Warn("using in-memory game state repository (redis unavailable)")
	return repository.NewMemoryGameStateRepoAdapter()
}

// buildRouter gin 라우터를 구성하고 반환한다.
func buildRouter(
	cfg *config.Config,
	logger *zap.Logger,
	db *gorm.DB,
	redisClient *redis.Client,
	gameStateRepo repository.MemoryGameStateRepository,
	roomRepo repository.MemoryRoomRepository,
) *gin.Engine {
	roomSvc := service.NewRoomService(roomRepo, gameStateRepo)
	gameSvc := service.NewGameService(gameStateRepo)
	turnSvc := service.NewTurnService(gameStateRepo, gameSvc)

	// AI Client: AI_ADAPTER_URL이 설정되지 않으면 nil로 두어 AI 턴을 비활성화한다.
	var aiClient client.AIClientInterface
	if cfg.AIAdapter.BaseURL != "" {
		timeout := time.Duration(cfg.AIAdapter.TimeoutSec) * time.Second
		aiClient = client.NewAIClient(cfg.AIAdapter.BaseURL, cfg.AIAdapter.Token, timeout)
		logger.Info("ai-adapter client configured", zap.String("url", cfg.AIAdapter.BaseURL))
	} else {
		logger.Warn("AI_ADAPTER_URL not set — AI turns disabled")
	}

	wsHub := handler.NewHub(logger)

	roomHandler := handler.NewRoomHandler(roomSvc)
	gameHandler := handler.NewGameHandler(gameSvc)
	wsHandler := handler.NewWSHandler(wsHub, roomSvc, gameSvc, turnSvc, aiClient, cfg.JWT.Secret, logger)
	authHandler := handler.NewAuthHandler(cfg.JWT.Secret).
		WithGoogleOAuth(cfg.GoogleOAuth.ClientID, cfg.GoogleOAuth.ClientSecret)

	// DB가 nil이면 practiceHandler, rankingHandler를 nil로 두어 라우트 등록을 건너뛴다.
	var practiceHandler *handler.PracticeHandler
	var rankingHandler *handler.RankingHandler
	if db != nil {
		practiceRepo := repository.NewPostgresPracticeRepo(db)
		practiceHandler = handler.NewPracticeHandler(practiceRepo, logger)

		eloRepo := repository.NewPostgresEloRepo(db)
		rankingHandler = handler.NewRankingHandler(eloRepo, logger)
		wsHandler.WithEloRepo(eloRepo)

		userRepo := repository.NewPostgresUserRepo(db)
		authHandler.WithUserRepo(userRepo)
	} else {
		logger.Warn("postgres unavailable — practice API disabled")
		logger.Warn("postgres unavailable — ranking API disabled")
	}

	// Redis가 가용하면 ELO Sorted Set 업데이트 활성화
	if redisClient != nil {
		wsHandler.WithRedisClient(redisClient)
	}

	router := gin.New()
	router.Use(gin.Recovery())
	router.Use(middleware.ZapLogger(logger))

	registerSystemRoutes(router, redisClient)
	registerWSRoutes(router, wsHandler)
	registerAPIRoutes(router, cfg, roomHandler, gameHandler, authHandler, practiceHandler, rankingHandler)

	return router
}

// registerSystemRoutes 헬스체크 엔드포인트를 등록한다.
func registerSystemRoutes(router *gin.Engine, redisClient *redis.Client) {
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
}

// registerWSRoutes WebSocket 엔드포인트를 등록한다.
func registerWSRoutes(router *gin.Engine, wsHandler *handler.WSHandler) {
	router.GET("/ws", wsHandler.HandleWS)
}

// registerAPIRoutes REST API 라우트 그룹을 등록한다.
// APP_ENV=dev 일 때는 /api/auth/dev-login 엔드포인트를 추가로 등록한다.
// practiceHandler/rankingHandler가 nil이면 해당 라우트는 등록하지 않는다.
func registerAPIRoutes(
	router *gin.Engine,
	cfg *config.Config,
	roomHandler *handler.RoomHandler,
	gameHandler *handler.GameHandler,
	authHandler *handler.AuthHandler,
	practiceHandler *handler.PracticeHandler,
	rankingHandler *handler.RankingHandler,
) {
	api := router.Group("/api")

	// 인증 엔드포인트: JWT 없이 접근 가능
	auth := api.Group("/auth")
	// Google OAuth (authorization code 방식): 항상 등록
	auth.POST("/google", authHandler.GoogleLogin)
	// Google OAuth (id_token 방식, next-auth SSR 연동): 항상 등록
	auth.POST("/google/token", authHandler.GoogleLoginByIDToken)
	// 개발 전용: APP_ENV=dev 일 때만 등록
	if cfg.AppEnv == "dev" {
		auth.POST("/dev-login", authHandler.DevLogin)
	}

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

	games := api.Group("/games")
	games.Use(middleware.JWTAuth(cfg.JWT.Secret))
	{
		games.GET("/:id", gameHandler.GetGameState)
		games.POST("/:id/place", gameHandler.PlaceTiles)
		games.POST("/:id/confirm", gameHandler.ConfirmTurn)
		games.POST("/:id/draw", gameHandler.DrawTile)
		games.POST("/:id/reset", gameHandler.ResetTurn)
	}

	if practiceHandler != nil {
		practice := api.Group("/practice")
		practice.Use(middleware.JWTAuth(cfg.JWT.Secret))
		{
			practice.POST("/progress", practiceHandler.SaveProgress)
			practice.GET("/progress", practiceHandler.GetProgress)
		}
	}

	if rankingHandler != nil {
		// 전체 랭킹 / 티어별 랭킹: 인증 불필요 (공개 API)
		rankings := api.Group("/rankings")
		{
			rankings.GET("", rankingHandler.ListRankings)
			rankings.GET("/tier/:tier", rankingHandler.ListRankingsByTier)
		}

		// 개인 ELO 조회: 공개, 이력 조회: 인증 필요
		users := api.Group("/users")
		{
			users.GET("/:id/rating", rankingHandler.GetUserRating)
			usersAuth := users.Group("")
			usersAuth.Use(middleware.JWTAuth(cfg.JWT.Secret))
			{
				usersAuth.GET("/:id/rating/history", rankingHandler.GetUserRatingHistory)
			}
		}
	}
}

// runServer HTTP 서버를 goroutine으로 실행하고 SIGINT/SIGTERM 수신 후 graceful shutdown을 수행한다.
func runServer(srv *http.Server, cfg *config.Config, logger *zap.Logger) {
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
}

// shutdownConnections Redis와 PostgreSQL 연결을 순서대로 해제한다.
func shutdownConnections(db *gorm.DB, redisClient *redis.Client, logger *zap.Logger) {
	if redisClient != nil {
		if err := redisClient.Close(); err != nil {
			logger.Warn("redis close error", zap.Error(err))
		}
	}
	if db != nil {
		if sqlDB, err := db.DB(); err == nil {
			if err := sqlDB.Close(); err != nil {
				logger.Warn("postgres close error", zap.Error(err))
			}
		}
	}
}
