package handler

import (
	"errors"
	"net/http"
	"strconv"

	"github.com/gin-gonic/gin"
	"go.uber.org/zap"

	"github.com/k82022603/RummiArena/game-server/internal/model"
	"github.com/k82022603/RummiArena/game-server/internal/repository"
)

// RankingHandler ELO 랭킹 조회 HTTP 핸들러.
type RankingHandler struct {
	eloRepo repository.EloRepository
	logger  *zap.Logger
}

// NewRankingHandler RankingHandler 생성자.
func NewRankingHandler(eloRepo repository.EloRepository, logger *zap.Logger) *RankingHandler {
	return &RankingHandler{eloRepo: eloRepo, logger: logger}
}

// ListRankings GET /api/rankings?limit=20&offset=0
// 전체 리더보드를 rating DESC 순으로 반환한다.
func (h *RankingHandler) ListRankings(c *gin.Context) {
	limit, offset, ok := parsePagination(c, 20, 100)
	if !ok {
		return
	}

	ctx := c.Request.Context()
	ratings, err := h.eloRepo.GetTopN(ctx, limit, offset)
	if err != nil {
		h.logger.Error("ranking: list rankings: db error", zap.Error(err))
		respondError(c, http.StatusInternalServerError, "INTERNAL_ERROR", "서버 내부 오류가 발생했습니다.")
		return
	}

	total, err := h.eloRepo.CountAll(ctx)
	if err != nil {
		h.logger.Warn("ranking: count all failed", zap.Error(err))
	}

	items := make([]rankingItem, len(ratings))
	for i, r := range ratings {
		items[i] = modelToRankingItem(offset+i+1, r)
	}

	c.JSON(http.StatusOK, gin.H{
		"data": items,
		"pagination": gin.H{
			"limit":  limit,
			"offset": offset,
			"total":  total,
		},
	})
}

// ListRankingsByTier GET /api/rankings/tier/:tier
// 티어별 랭킹을 반환한다.
func (h *RankingHandler) ListRankingsByTier(c *gin.Context) {
	tier := c.Param("tier")
	if tier == "" {
		respondError(c, http.StatusBadRequest, "INVALID_REQUEST", "tier 파라미터가 필요합니다.")
		return
	}

	if !isValidTier(tier) {
		respondError(c, http.StatusBadRequest, "INVALID_TIER",
			"유효하지 않은 티어입니다. (UNRANKED, BRONZE, SILVER, GOLD, PLATINUM, DIAMOND)")
		return
	}

	limit, offset, ok := parsePagination(c, 20, 100)
	if !ok {
		return
	}

	ctx := c.Request.Context()
	ratings, err := h.eloRepo.GetByTier(ctx, tier, limit, offset)
	if err != nil {
		h.logger.Error("ranking: list by tier: db error",
			zap.String("tier", tier), zap.Error(err))
		respondError(c, http.StatusInternalServerError, "INTERNAL_ERROR", "서버 내부 오류가 발생했습니다.")
		return
	}

	total, err := h.eloRepo.CountByTier(ctx, tier)
	if err != nil {
		h.logger.Warn("ranking: count by tier failed",
			zap.String("tier", tier), zap.Error(err))
	}

	items := make([]rankingItem, len(ratings))
	for i, r := range ratings {
		items[i] = modelToRankingItem(offset+i+1, r)
	}

	c.JSON(http.StatusOK, gin.H{
		"data": items,
		"tier": tier,
		"pagination": gin.H{
			"limit":  limit,
			"offset": offset,
			"total":  total,
		},
	})
}

// GetUserRating GET /api/users/:id/rating
// 개인 ELO 현황을 반환한다.
func (h *RankingHandler) GetUserRating(c *gin.Context) {
	userID := c.Param("id")
	if userID == "" {
		respondError(c, http.StatusBadRequest, "INVALID_REQUEST", "user ID가 필요합니다.")
		return
	}

	rating, err := h.eloRepo.GetByUserID(c.Request.Context(), userID)
	if err != nil {
		if errors.Is(err, repository.ErrNotFound) {
			respondError(c, http.StatusNotFound, "NOT_FOUND", "해당 사용자의 랭킹 정보가 없습니다.")
			return
		}
		h.logger.Error("ranking: get user rating: db error",
			zap.String("userID", userID), zap.Error(err))
		respondError(c, http.StatusInternalServerError, "INTERNAL_ERROR", "서버 내부 오류가 발생했습니다.")
		return
	}

	c.JSON(http.StatusOK, modelToUserRatingDetail(*rating))
}

// GetUserRatingHistory GET /api/users/:id/rating/history?limit=30
// 개인 ELO 변동 이력을 반환한다.
func (h *RankingHandler) GetUserRatingHistory(c *gin.Context) {
	userID := c.Param("id")
	if userID == "" {
		respondError(c, http.StatusBadRequest, "INVALID_REQUEST", "user ID가 필요합니다.")
		return
	}

	limitStr := c.DefaultQuery("limit", "30")
	limit, err := strconv.Atoi(limitStr)
	if err != nil || limit < 1 {
		respondError(c, http.StatusBadRequest, "INVALID_REQUEST", "limit은 1 이상의 정수여야 합니다.")
		return
	}
	if limit > 100 {
		limit = 100
	}

	histories, err := h.eloRepo.GetHistoryByUserID(c.Request.Context(), userID, limit)
	if err != nil {
		h.logger.Error("ranking: get user history: db error",
			zap.String("userID", userID), zap.Error(err))
		respondError(c, http.StatusInternalServerError, "INTERNAL_ERROR", "서버 내부 오류가 발생했습니다.")
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"userId": userID,
		"data":   histories,
		"total":  len(histories),
	})
}

// --- 내부 DTO ---

// rankingItem 리더보드 항목 응답 DTO.
type rankingItem struct {
	Rank        int     `json:"rank"`
	UserID      string  `json:"userId"`
	Rating      int     `json:"rating"`
	Tier        string  `json:"tier"`
	Wins        int     `json:"wins"`
	Losses      int     `json:"losses"`
	Draws       int     `json:"draws"`
	GamesPlayed int     `json:"gamesPlayed"`
	WinRate     float64 `json:"winRate"`
	WinStreak   int     `json:"winStreak"`
}

// userRatingDetail 개인 ELO 상세 응답 DTO.
type userRatingDetail struct {
	UserID           string  `json:"userId"`
	Rating           int     `json:"rating"`
	Tier             string  `json:"tier"`
	TierProgress     int     `json:"tierProgress"`
	NextTier         string  `json:"nextTier,omitempty"`
	RatingToNextTier int     `json:"ratingToNextTier,omitempty"`
	Wins             int     `json:"wins"`
	Losses           int     `json:"losses"`
	Draws            int     `json:"draws"`
	GamesPlayed      int     `json:"gamesPlayed"`
	WinRate          float64 `json:"winRate"`
	WinStreak        int     `json:"winStreak"`
	BestStreak       int     `json:"bestStreak"`
	PeakRating       int     `json:"peakRating"`
}

// --- 변환 헬퍼 ---

// modelToRankingItem model.EloRating을 rankingItem DTO로 변환한다.
func modelToRankingItem(rank int, r model.EloRating) rankingItem {
	return rankingItem{
		Rank:        rank,
		UserID:      r.UserID,
		Rating:      r.Rating,
		Tier:        r.Tier,
		Wins:        r.Wins,
		Losses:      r.Losses,
		Draws:       r.Draws,
		GamesPlayed: r.GamesPlayed,
		WinRate:     calcWinRate(r.Wins, r.GamesPlayed),
		WinStreak:   r.WinStreak,
	}
}

// modelToUserRatingDetail model.EloRating을 userRatingDetail DTO로 변환한다.
func modelToUserRatingDetail(r model.EloRating) userRatingDetail {
	progress, next, toNext := tierProgress(r.Rating, r.Tier)
	return userRatingDetail{
		UserID:           r.UserID,
		Rating:           r.Rating,
		Tier:             r.Tier,
		TierProgress:     progress,
		NextTier:         next,
		RatingToNextTier: toNext,
		Wins:             r.Wins,
		Losses:           r.Losses,
		Draws:            r.Draws,
		GamesPlayed:      r.GamesPlayed,
		WinRate:          calcWinRate(r.Wins, r.GamesPlayed),
		WinStreak:        r.WinStreak,
		BestStreak:       r.BestStreak,
		PeakRating:       r.PeakRating,
	}
}

// --- 공통 유틸 ---

// parsePagination limit/offset 쿼리 파라미터를 파싱한다.
// 파싱 실패 시 HTTP 400을 응답하고 false를 반환한다.
func parsePagination(c *gin.Context, defaultLimit, maxLimit int) (limit, offset int, ok bool) {
	limitStr := c.DefaultQuery("limit", strconv.Itoa(defaultLimit))
	offsetStr := c.DefaultQuery("offset", "0")

	var err error
	limit, err = strconv.Atoi(limitStr)
	if err != nil || limit < 1 {
		respondError(c, http.StatusBadRequest, "INVALID_REQUEST", "limit은 1 이상의 정수여야 합니다.")
		return 0, 0, false
	}
	if limit > maxLimit {
		limit = maxLimit
	}

	offset, err = strconv.Atoi(offsetStr)
	if err != nil || offset < 0 {
		respondError(c, http.StatusBadRequest, "INVALID_REQUEST", "offset은 0 이상의 정수여야 합니다.")
		return 0, 0, false
	}

	return limit, offset, true
}

// isValidTier 허용된 티어 문자열인지 검증한다.
func isValidTier(tier string) bool {
	switch tier {
	case "UNRANKED", "BRONZE", "SILVER", "GOLD", "PLATINUM", "DIAMOND":
		return true
	}
	return false
}

// calcWinRate 승률을 계산한다. 게임이 없으면 0을 반환한다.
func calcWinRate(wins, gamesPlayed int) float64 {
	if gamesPlayed == 0 {
		return 0
	}
	return float64(wins) / float64(gamesPlayed) * 100
}

// tierProgress 현재 티어 내 진행도(%)와 다음 티어 정보를 반환한다.
func tierProgress(rating int, tier string) (progress int, nextTier string, toNext int) {
	type tierRange struct {
		min  int
		max  int
		next string
	}
	ranges := map[string]tierRange{
		"BRONZE":   {100, 1100, "SILVER"},
		"SILVER":   {1100, 1300, "GOLD"},
		"GOLD":     {1300, 1600, "PLATINUM"},
		"PLATINUM": {1600, 1900, "DIAMOND"},
		"DIAMOND":  {1900, 1900, ""},
	}
	r, found := ranges[tier]
	if !found {
		return 0, "", 0
	}
	if tier == "DIAMOND" {
		return 100, "", 0
	}
	span := r.max - r.min
	if span <= 0 {
		return 0, r.next, 0
	}
	progress = (rating - r.min) * 100 / span
	if progress < 0 {
		progress = 0
	}
	if progress > 100 {
		progress = 100
	}
	return progress, r.next, r.max - rating
}
