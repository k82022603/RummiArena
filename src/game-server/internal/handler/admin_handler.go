package handler

import (
	"errors"
	"net/http"

	"github.com/gin-gonic/gin"
	"go.uber.org/zap"
	"gorm.io/gorm"

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
