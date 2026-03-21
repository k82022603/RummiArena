package handler

import (
	"net/http"
	"strconv"
	"time"

	"github.com/gin-gonic/gin"
	"go.uber.org/zap"

	"github.com/k82022603/RummiArena/game-server/internal/middleware"
	"github.com/k82022603/RummiArena/game-server/internal/model"
	"github.com/k82022603/RummiArena/game-server/internal/repository"
)

// PracticeHandler 연습 모드 진행 기록 관련 HTTP 핸들러.
type PracticeHandler struct {
	repo   repository.PracticeProgressRepository
	logger *zap.Logger
}

// NewPracticeHandler PracticeHandler 생성자.
func NewPracticeHandler(repo repository.PracticeProgressRepository, logger *zap.Logger) *PracticeHandler {
	return &PracticeHandler{repo: repo, logger: logger}
}

// saveProgressRequest POST /api/practice/progress 요청 바디.
type saveProgressRequest struct {
	Stage       int    `json:"stage"`
	Score       int    `json:"score"`
	CompletedAt string `json:"completedAt"` // RFC3339
}

// SaveProgress POST /api/practice/progress
// JWT에서 userID를 추출하여 연습 모드 스테이지 완료 기록을 저장한다.
func (h *PracticeHandler) SaveProgress(c *gin.Context) {
	userID, ok := middleware.UserIDFromContext(c)
	if !ok {
		respondError(c, http.StatusUnauthorized, "UNAUTHORIZED", errMsgUnauthorized)
		return
	}

	var req saveProgressRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		h.logger.Warn("practice: save progress: invalid json", zap.Error(err))
		respondError(c, http.StatusBadRequest, "INVALID_REQUEST", errMsgInvalidRequest)
		return
	}

	completedAt := time.Now().UTC()
	if req.CompletedAt != "" {
		parsed, err := time.Parse(time.RFC3339, req.CompletedAt)
		if err != nil {
			h.logger.Warn("practice: save progress: invalid completedAt format", zap.String("value", req.CompletedAt))
			respondError(c, http.StatusBadRequest, "INVALID_REQUEST", "completedAt 형식이 올바르지 않습니다. RFC3339 형식을 사용하세요.")
			return
		}
		completedAt = parsed
	}

	record := &model.PracticeProgress{
		UserID:      userID,
		Stage:       req.Stage,
		Score:       req.Score,
		CompletedAt: completedAt,
	}

	if err := h.repo.SaveProgress(c.Request.Context(), record); err != nil {
		h.logger.Error("practice: save progress: db error", zap.Error(err))
		respondError(c, http.StatusInternalServerError, "INTERNAL_ERROR", "서버 내부 오류가 발생했습니다.")
		return
	}

	c.JSON(http.StatusCreated, record)
}

// GetProgress GET /api/practice/progress
// JWT에서 userID를 추출하여 해당 사용자의 연습 모드 진행 기록을 반환한다.
// ?stage=N 쿼리로 특정 스테이지만 필터링할 수 있다.
func (h *PracticeHandler) GetProgress(c *gin.Context) {
	userID, ok := middleware.UserIDFromContext(c)
	if !ok {
		respondError(c, http.StatusUnauthorized, "UNAUTHORIZED", errMsgUnauthorized)
		return
	}

	records, err := h.repo.GetProgressByUserID(c.Request.Context(), userID)
	if err != nil {
		h.logger.Error("practice: get progress: db error", zap.Error(err))
		respondError(c, http.StatusInternalServerError, "INTERNAL_ERROR", "서버 내부 오류가 발생했습니다.")
		return
	}

	// ?stage=N 쿼리 파라미터가 있으면 해당 스테이지만 필터링한다.
	if stageStr := c.Query("stage"); stageStr != "" {
		stageNum, err := strconv.Atoi(stageStr)
		if err != nil {
			respondError(c, http.StatusBadRequest, "INVALID_REQUEST", "stage 파라미터는 정수여야 합니다.")
			return
		}
		filtered := make([]*model.PracticeProgress, 0, len(records))
		for _, r := range records {
			if r.Stage == stageNum {
				filtered = append(filtered, r)
			}
		}
		records = filtered
	}

	c.JSON(http.StatusOK, gin.H{
		"progress": records,
		"total":    len(records),
	})
}
