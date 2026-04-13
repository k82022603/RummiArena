package handler

import (
	"encoding/json"
	"errors"
	"net/http"

	"github.com/gin-gonic/gin"
	"go.uber.org/zap"
	"gorm.io/gorm"

	"github.com/k82022603/RummiArena/game-server/internal/data"
	"github.com/k82022603/RummiArena/game-server/internal/service"
)

// AdminHandler 관리자 대시보드 HTTP 핸들러.
type AdminHandler struct {
	adminSvc service.AdminService
	logger   *zap.Logger
}

// NewAdminHandler AdminHandler 생성자.
func NewAdminHandler(adminSvc service.AdminService, logger *zap.Logger) *AdminHandler {
	return &AdminHandler{adminSvc: adminSvc, logger: logger}
}

// GetDashboard GET /admin/dashboard
// 종합 통계를 반환한다.
func (h *AdminHandler) GetDashboard(c *gin.Context) {
	ctx := c.Request.Context()

	dashboard, err := h.adminSvc.GetDashboard(ctx)
	if err != nil {
		h.logger.Error("admin: get dashboard failed", zap.Error(err))
		respondError(c, http.StatusInternalServerError, "INTERNAL_ERROR", "서버 내부 오류가 발생했습니다.")
		return
	}

	c.JSON(http.StatusOK, dashboard)
}

// ListGames GET /admin/games
// 최근 게임 목록(최대 50개)을 반환한다.
func (h *AdminHandler) ListGames(c *gin.Context) {
	ctx := c.Request.Context()

	items, err := h.adminSvc.ListGames(ctx, 50)
	if err != nil {
		h.logger.Error("admin: list games failed", zap.Error(err))
		c.JSON(http.StatusOK, []interface{}{})
		return
	}

	c.JSON(http.StatusOK, items)
}

// ListUsers GET /admin/users
// 사용자 목록을 반환한다.
func (h *AdminHandler) ListUsers(c *gin.Context) {
	ctx := c.Request.Context()

	items, err := h.adminSvc.ListUsers(ctx)
	if err != nil {
		h.logger.Error("admin: list users failed", zap.Error(err))
		c.JSON(http.StatusOK, []interface{}{})
		return
	}

	c.JSON(http.StatusOK, items)
}

// GetAIStats GET /admin/stats/ai
// AI 호출 통계를 반환한다.
func (h *AdminHandler) GetAIStats(c *gin.Context) {
	ctx := c.Request.Context()

	stats, err := h.adminSvc.GetAIStats(ctx)
	if err != nil {
		h.logger.Error("admin: get ai stats failed", zap.Error(err))
		respondError(c, http.StatusInternalServerError, "INTERNAL_ERROR", "서버 내부 오류가 발생했습니다.")
		return
	}

	c.JSON(http.StatusOK, stats)
}

// GetEloStats GET /admin/stats/elo
// ELO 분포 통계를 반환한다.
func (h *AdminHandler) GetEloStats(c *gin.Context) {
	ctx := c.Request.Context()

	stats, err := h.adminSvc.GetEloStats(ctx)
	if err != nil {
		h.logger.Error("admin: get elo stats failed", zap.Error(err))
		respondError(c, http.StatusInternalServerError, "INTERNAL_ERROR", "서버 내부 오류가 발생했습니다.")
		return
	}

	c.JSON(http.StatusOK, stats)
}

// GetGameDetail GET /admin/games/:id
// 게임 상세 정보를 반환한다.
func (h *AdminHandler) GetGameDetail(c *gin.Context) {
	id := c.Param("id")
	if id == "" {
		respondError(c, http.StatusBadRequest, "INVALID_REQUEST", errMsgGameIDRequired)
		return
	}

	ctx := c.Request.Context()

	detail, err := h.adminSvc.GetGameDetail(ctx, id)
	if err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			respondError(c, http.StatusNotFound, "NOT_FOUND", "해당 게임을 찾을 수 없습니다.")
			return
		}
		h.logger.Error("admin: get game detail failed", zap.String("gameID", id), zap.Error(err))
		respondError(c, http.StatusInternalServerError, "INTERNAL_ERROR", "서버 내부 오류가 발생했습니다.")
		return
	}

	c.JSON(http.StatusOK, detail)
}

// GetPerformanceStats GET /admin/stats/performance
// 성능 통계를 반환한다.
func (h *AdminHandler) GetPerformanceStats(c *gin.Context) {
	ctx := c.Request.Context()

	stats, err := h.adminSvc.GetPerformanceStats(ctx)
	if err != nil {
		h.logger.Error("admin: get performance stats failed", zap.Error(err))
		respondError(c, http.StatusInternalServerError, "INTERNAL_ERROR", "서버 내부 오류가 발생했습니다.")
		return
	}

	c.JSON(http.StatusOK, stats)
}

// GetTournamentSummary GET /admin/stats/ai/tournament
//
// AI 토너먼트 대시보드 요약을 반환한다.
//
// Sprint 6 W1 선행 구현 — **옵션 B 정적 JSON 프록시 방식**.
// DB 집계 없이 `internal/data/tournament-summary.json` 임베디드 바이트를
// 그대로 반환한다. 실제 DB 집계 교체는 Sprint 6 W2에서 수행한다.
//
// 응답 스키마: docs/02-design/33-ai-tournament-dashboard-component-spec.md §6.2
//
// Query params (현 옵션 B에서는 **무시**, Sprint 6 W2에서 서버 사이드 필터링 구현):
//   - models=openai,claude,deepseek
//   - rounds=R2-R4v2
//   - prompt=all|v1|v2
//
// 응답 헤더:
//   - Cache-Control: public, max-age=30 (ISR 캐싱 정렬)
//   - X-Data-Source: static (Sprint 6 W2에서 "db" 로 교체)
func (h *AdminHandler) GetTournamentSummary(c *gin.Context) {
	// 임베디드 JSON 유효성 검증 (빌드 타임에 이미 검증되지만 방어적으로 확인)
	if len(data.TournamentSummaryJSON) == 0 {
		h.logger.Error("admin: tournament summary JSON is empty")
		respondError(c, http.StatusInternalServerError, "INTERNAL_ERROR", "토너먼트 데이터를 불러올 수 없습니다.")
		return
	}

	// JSON 구조 검증 (malformed JSON 방지).
	// 성능 고려 시 매 요청마다 파싱할 필요는 없으나, 옵션 B는 개발 편의성을 우선하여
	// 검증 후 반환한다. Sprint 6 W2 DB 집계로 교체되면 이 로직은 제거된다.
	var payload map[string]interface{}
	if err := json.Unmarshal(data.TournamentSummaryJSON, &payload); err != nil {
		h.logger.Error("admin: tournament summary JSON unmarshal failed", zap.Error(err))
		respondError(c, http.StatusInternalServerError, "INTERNAL_ERROR", "토너먼트 데이터 형식이 잘못되었습니다.")
		return
	}

	c.Header("Cache-Control", "public, max-age=30")
	c.Header("X-Data-Source", "static") // Sprint 6 W2에서 "db" 로 교체
	c.Data(http.StatusOK, "application/json; charset=utf-8", data.TournamentSummaryJSON)
}
