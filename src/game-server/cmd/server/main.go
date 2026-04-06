package main

import (
	"context"
	"net/http"
	"os"
	"os/signal"
	"strings"
	"syscall"
	"time"

	"github.com/gin-contrib/cors"
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
		Addr:        ":" + cfg.Server.Port,
		Handler:     router,
		ReadTimeout: 15 * time.Second,
		// WriteTimeout은 의도적으로 설정하지 않는다 (0 = 무제한).
		// WebSocket 연결은 gorilla/websocket이 hijack 후 자체 SetWriteDeadline
		// (writeWait=10s)으로 관리한다. WriteTimeout을 설정하면 게임 진행 중
		// 15초 경과 시 TCP 소켓 deadline이 만료되어 GAME_OVER 등 대형 메시지가
		// 절단될 수 있다. REST API의 쓰기 지연은 gin Recovery 미들웨어로 대응한다.
		WriteTimeout: 0,
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
	// SEC-RL-002: Redis가 가용하면 AI 게임 생성 쿨다운 활성화
	if infra.IsRedisAvailable(redisClient) {
		service.SetCooldownChecker(roomSvc, service.NewRedisCooldownChecker(redisClient))
		logger.Info("ai game cooldown enabled (5min per user)")
	}
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
	// BUG-WS-001: 게임 시작 시 WS 클라이언트에 TURN_START 전송
	roomHandler.WithGameStartNotifier(wsHandler)
	authHandler := handler.NewAuthHandler(cfg.JWT.Secret).
		WithGoogleOAuth(cfg.GoogleOAuth.ClientID, cfg.GoogleOAuth.ClientSecret)

	// DB가 nil이면 practiceHandler, rankingHandler, adminHandler를 nil로 두어 라우트 등록을 건너뛴다.
	var practiceHandler *handler.PracticeHandler
	var rankingHandler *handler.RankingHandler
	var adminHandler *handler.AdminHandler
	if db != nil {
		practiceRepo := repository.NewPostgresPracticeRepo(db)
		practiceHandler = handler.NewPracticeHandler(practiceRepo, logger)

		eloRepo := repository.NewPostgresEloRepo(db)
		rankingHandler = handler.NewRankingHandler(eloRepo, logger)
		wsHandler.WithEloRepo(eloRepo)

		userRepo := repository.NewPostgresUserRepo(db)
		authHandler.WithUserRepo(userRepo)

		adminRepo := repository.NewPostgresAdminRepo(db)
		adminSvc := service.NewAdminService(adminRepo, logger)
		adminHandler = handler.NewAdminHandler(adminSvc, logger)
	} else {
		logger.Warn("postgres unavailable — practice API disabled")
		logger.Warn("postgres unavailable — ranking API disabled")
		logger.Warn("postgres unavailable — admin API disabled")
	}

	// Redis가 가용하면 ELO Sorted Set 업데이트 활성화
	if redisClient != nil {
		wsHandler.WithRedisClient(redisClient)
	}

	router := gin.New()
	router.Use(gin.Recovery())
	router.Use(middleware.ZapLogger(logger))
	// CORS 허용 Origin 목록: CORS_ALLOWED_ORIGINS 환경변수에서 읽음 (쉼표 구분)
	// 미설정 시 기본값: localhost:3000, localhost:30000 (로컬 개발용)
	allowedOrigins := []string{"http://localhost:3000", "http://localhost:30000"}
	if envOrigins := os.Getenv("CORS_ALLOWED_ORIGINS"); envOrigins != "" {
		parts := strings.Split(envOrigins, ",")
		trimmed := make([]string, 0, len(parts))
		for _, p := range parts {
			if t := strings.TrimSpace(p); t != "" {
				trimmed = append(trimmed, t)
			}
		}
		if len(trimmed) > 0 {
			allowedOrigins = trimmed
		}
	}
	router.Use(cors.New(cors.Config{
		AllowOrigins:     allowedOrigins,
		AllowMethods:     []string{"GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"},
		AllowHeaders:     []string{"Origin", "Content-Type", "Authorization"},
		ExposeHeaders:    []string{"Content-Length"},
		AllowCredentials: true,
	}))

	// Rate limiter: *redis.Client satisfies middleware.RedisClientInterface.
	// When redisClient is nil, the limiter is fail-open (no rate limiting).
	var rl middleware.RedisClientInterface
	if redisClient != nil {
		rl = redisClient
	}

	registerSystemRoutes(router, redisClient)
	registerWSRoutes(router, wsHandler, rl)
	registerAPIRoutes(router, cfg, rl, roomHandler, gameHandler, authHandler, practiceHandler, rankingHandler)
	registerAdminRoutes(router, cfg, rl, adminHandler)

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
// WebSocket 연결 시도에 대해 WSConnectionPolicy를 적용한다.
func registerWSRoutes(router *gin.Engine, wsHandler *handler.WSHandler, rl middleware.RedisClientInterface) {
	ws := router.Group("")
	ws.Use(middleware.RateLimiter(rl, middleware.WSConnectionPolicy))
	ws.GET("/ws", wsHandler.HandleWS)
}

// registerAPIRoutes REST API 라우트 그룹을 등록한다.
// APP_ENV=dev 일 때는 /api/auth/dev-login 엔드포인트를 추가로 등록한다.
// practiceHandler/rankingHandler가 nil이면 해당 라우트는 등록하지 않는다.
//
// Rate limit 정책:
//   - auth: LowFrequencyPolicy (10 req/min) — 인증 시도 제한
//   - rooms: LowFrequencyPolicy (10 req/min) — 방 생성/참가 빈도 제한
//   - games: MediumFrequencyPolicy (30 req/min) — 게임 액션 제한
//   - practice: MediumFrequencyPolicy (30 req/min)
//   - rankings/users: HighFrequencyPolicy (60 req/min) — 공개 조회
func registerAPIRoutes(
	router *gin.Engine,
	cfg *config.Config,
	rl middleware.RedisClientInterface,
	roomHandler *handler.RoomHandler,
	gameHandler *handler.GameHandler,
	authHandler *handler.AuthHandler,
	practiceHandler *handler.PracticeHandler,
	rankingHandler *handler.RankingHandler,
) {
	api := router.Group("/api")

	// 인증 엔드포인트: JWT 없이 접근 가능, LowFrequencyPolicy로 브루트포스 방어
	auth := api.Group("/auth")
	auth.Use(middleware.RateLimiter(rl, middleware.LowFrequencyPolicy))
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
	rooms.Use(middleware.RateLimiter(rl, middleware.LowFrequencyPolicy))
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
	games.Use(middleware.RateLimiter(rl, middleware.MediumFrequencyPolicy))
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
		practice.Use(middleware.RateLimiter(rl, middleware.MediumFrequencyPolicy))
		{
			practice.POST("/progress", practiceHandler.SaveProgress)
			practice.GET("/progress", practiceHandler.GetProgress)
		}
	}

	if rankingHandler != nil {
		// 전체 랭킹 / 티어별 랭킹: 인증 불필요 (공개 API), HighFrequencyPolicy
		rankings := api.Group("/rankings")
		rankings.Use(middleware.RateLimiter(rl, middleware.HighFrequencyPolicy))
		{
			rankings.GET("", rankingHandler.ListRankings)
			rankings.GET("/tier/:tier", rankingHandler.ListRankingsByTier)
		}

		// 개인 ELO 조회: 공개, 이력 조회: 인증 필요
		users := api.Group("/users")
		users.Use(middleware.RateLimiter(rl, middleware.HighFrequencyPolicy))
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

// registerAdminRoutes 관리자 대시보드 라우트 그룹을 등록한다.
// adminHandler가 nil이면 (DB 없음) 등록을 건너뛴다.
// JWTAuth → RequireRole("admin") 순서로 미들웨어를 적용하여
// 유효한 JWT를 가진 admin role 사용자만 접근할 수 있다.
// AdminPolicy 적용 (30 req/min). admin role은 RateLimiter 내부에서 자동 bypass 된다.
func registerAdminRoutes(router *gin.Engine, cfg *config.Config, rl middleware.RedisClientInterface, adminHandler *handler.AdminHandler) {
	if adminHandler == nil {
		return
	}
	admin := router.Group("/admin")
	admin.Use(middleware.JWTAuth(cfg.JWT.Secret))
	admin.Use(middleware.RequireRole("admin"))
	admin.Use(middleware.RateLimiter(rl, middleware.AdminPolicy))
	{
		admin.GET("/dashboard", adminHandler.GetDashboard)
		admin.GET("/games", adminHandler.ListGames)
		admin.GET("/games/:id", adminHandler.GetGameDetail)
		admin.GET("/users", adminHandler.ListUsers)
		admin.GET("/stats/ai", adminHandler.GetAIStats)
		admin.GET("/stats/elo", adminHandler.GetEloStats)
		admin.GET("/stats/performance", adminHandler.GetPerformanceStats)
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
