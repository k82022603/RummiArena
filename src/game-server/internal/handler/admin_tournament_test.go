// Package handler 관리자 대시보드 토너먼트 요약 핸들러 단위 테스트.
//
// GetTournamentSummary는 옵션 B (정적 JSON 프록시) 구현이므로 DB/서비스 의존성이
// 없다. 따라서 AdminHandler를 nil service로 생성하고, gin 라우터에 직접 등록하여
// HTTP 레이어에서만 검증한다.
//
// Sprint 6 W2 DB 집계로 교체될 때 이 테스트는 service mock 기반으로 재작성된다.
package handler

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/gin-gonic/gin"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
	"go.uber.org/zap"
)

// newTestTournamentRouter 토너먼트 엔드포인트만 등록한 테스트 라우터를 만든다.
//
// 실제 game-server 라우트는 JWTAuth + RequireRole("admin") 미들웨어로 보호되지만,
// 본 테스트는 **핸들러 로직 자체**(응답 구조, 캐싱 헤더 등)만 검증하므로 미들웨어를
// 우회한다. 인증/인가 테스트는 별도 통합 테스트에서 커버한다.
func newTestTournamentRouter() *gin.Engine {
	gin.SetMode(gin.TestMode)
	r := gin.New()
	logger := zap.NewNop()
	// service는 사용하지 않으므로 nil 주입. GetTournamentSummary는 internal/data
	// 임베디드 JSON만 참조한다.
	h := NewAdminHandler(nil, logger)
	r.GET("/admin/stats/ai/tournament", h.GetTournamentSummary)
	return r
}

// --- 1. 기본 응답 구조 ---

// TestGetTournamentSummary_Returns200 정상 호출 시 200 OK와 JSON 응답을 반환하는지 확인.
func TestGetTournamentSummary_Returns200(t *testing.T) {
	r := newTestTournamentRouter()

	req := httptest.NewRequest(http.MethodGet, "/admin/stats/ai/tournament", nil)
	w := httptest.NewRecorder()
	r.ServeHTTP(w, req)

	require.Equal(t, http.StatusOK, w.Code)
	assert.Contains(t, w.Header().Get("Content-Type"), "application/json")
}

// TestGetTournamentSummary_CacheHeaders 옵션 B 캐싱 헤더가 정확히 설정되는지 확인.
func TestGetTournamentSummary_CacheHeaders(t *testing.T) {
	r := newTestTournamentRouter()

	req := httptest.NewRequest(http.MethodGet, "/admin/stats/ai/tournament", nil)
	w := httptest.NewRecorder()
	r.ServeHTTP(w, req)

	assert.Equal(t, "public, max-age=30", w.Header().Get("Cache-Control"))
	// Sprint 6 W2에서 "db"로 교체 예정
	assert.Equal(t, "static", w.Header().Get("X-Data-Source"))
}

// --- 2. JSON 스키마 검증 (설계 33번 §6.2) ---

// tournamentResponse 테스트용 최소 구조체.
// 실제 타입은 TypeScript 사이드(admin/src/lib/types.ts)에 정의되어 있으며,
// Go 서버 사이드는 임베디드 JSON을 그대로 전달하므로 구조체 매핑이 필요 없다.
// 본 테스트는 응답이 스펙(33번)에 명시된 필드를 갖추고 있는지 스펙 관점에서 검증한다.
type tournamentResponse struct {
	Rounds         []tournamentRound         `json:"rounds"`
	ModelStats     []tournamentModelStat     `json:"modelStats"`
	CostEfficiency []tournamentCostEff       `json:"costEfficiency"`
	LastUpdated    string                    `json:"lastUpdated"`
	TotalBattles   int                       `json:"totalBattles"`
	TotalCostUsd   float64                   `json:"totalCostUsd"`
}

type tournamentRound struct {
	Round              string  `json:"round"`
	PromptVersion      string  `json:"promptVersion"`
	ModelType          string  `json:"modelType"`
	ModelName          string  `json:"modelName"`
	PlaceRate          float64 `json:"placeRate"`
	PlaceCount         int     `json:"placeCount"`
	DrawCount          int     `json:"drawCount"`
	TotalTiles         int     `json:"totalTiles"`
	TotalTurns         int     `json:"totalTurns"`
	Completed          bool    `json:"completed"`
	Status             string  `json:"status"`
	TotalCost          float64 `json:"totalCost"`
	AvgResponseTimeSec float64 `json:"avgResponseTimeSec"`
	P50ResponseTimeSec float64 `json:"p50ResponseTimeSec"`
	MinResponseTimeSec float64 `json:"minResponseTimeSec"`
	MaxResponseTimeSec float64 `json:"maxResponseTimeSec"`
	Grade              string  `json:"grade"`
}

type tournamentModelStat struct {
	ModelType          string     `json:"modelType"`
	ModelName          string     `json:"modelName"`
	LatestRound        string     `json:"latestRound"`
	LatestRate         float64    `json:"latestRate"`
	Grade              string     `json:"grade"`
	AvgResponseTimeSec float64    `json:"avgResponseTimeSec"`
	CostPerTurn        float64    `json:"costPerTurn"`
	TotalTilesPlaced   int        `json:"totalTilesPlaced"`
	Completed          bool       `json:"completed"`
	PromptVersion      string     `json:"promptVersion"`
	Sparkline          []*float64 `json:"sparkline"`
}

type tournamentCostEff struct {
	ModelType        string  `json:"modelType"`
	ModelName        string  `json:"modelName"`
	Round            string  `json:"round"`
	PromptVersion    string  `json:"promptVersion"`
	CostPerGame      float64 `json:"costPerGame"`
	PlaceRate        float64 `json:"placeRate"`
	TotalTilesPlaced int     `json:"totalTilesPlaced"`
	PlacePerDollar   float64 `json:"placePerDollar"`
}

// TestGetTournamentSummary_Schema 응답 JSON이 설계 33번 §6.2 스키마를 준수하는지 검증.
func TestGetTournamentSummary_Schema(t *testing.T) {
	r := newTestTournamentRouter()

	req := httptest.NewRequest(http.MethodGet, "/admin/stats/ai/tournament", nil)
	w := httptest.NewRecorder()
	r.ServeHTTP(w, req)

	require.Equal(t, http.StatusOK, w.Code)

	var resp tournamentResponse
	require.NoError(t, json.Unmarshal(w.Body.Bytes(), &resp))

	// 최상위 필드
	assert.NotEmpty(t, resp.Rounds, "rounds는 최소 1건 이상")
	assert.NotEmpty(t, resp.ModelStats, "modelStats는 최소 1건 이상")
	assert.NotEmpty(t, resp.CostEfficiency, "costEfficiency는 최소 1건 이상")
	assert.NotEmpty(t, resp.LastUpdated, "lastUpdated는 ISO8601 문자열")
	assert.Positive(t, resp.TotalBattles, "totalBattles는 양수")
	assert.Positive(t, resp.TotalCostUsd, "totalCostUsd는 양수")
}

// TestGetTournamentSummary_RoundFields 각 라운드 엔트리가 필수 필드를 갖추는지 검증.
func TestGetTournamentSummary_RoundFields(t *testing.T) {
	r := newTestTournamentRouter()

	req := httptest.NewRequest(http.MethodGet, "/admin/stats/ai/tournament", nil)
	w := httptest.NewRecorder()
	r.ServeHTTP(w, req)

	var resp tournamentResponse
	require.NoError(t, json.Unmarshal(w.Body.Bytes(), &resp))

	validModels := map[string]bool{"openai": true, "claude": true, "deepseek": true, "ollama": true}
	validStatuses := map[string]bool{"COMPLETED": true, "WS_TIMEOUT": true, "WS_CLOSED": true, "UNKNOWN": true}
	validGrades := map[string]bool{"A+": true, "A": true, "B": true, "C": true, "D": true, "F": true}

	for i, rnd := range resp.Rounds {
		assert.NotEmptyf(t, rnd.Round, "rounds[%d].round", i)
		assert.Truef(t, validModels[rnd.ModelType], "rounds[%d].modelType=%q", i, rnd.ModelType)
		assert.NotEmptyf(t, rnd.ModelName, "rounds[%d].modelName", i)
		assert.GreaterOrEqualf(t, rnd.PlaceRate, 0.0, "rounds[%d].placeRate >= 0", i)
		assert.LessOrEqualf(t, rnd.PlaceRate, 100.0, "rounds[%d].placeRate <= 100", i)
		assert.GreaterOrEqualf(t, rnd.TotalTurns, 0, "rounds[%d].totalTurns >= 0", i)
		assert.Truef(t, validStatuses[rnd.Status], "rounds[%d].status=%q", i, rnd.Status)
		assert.Truef(t, validGrades[rnd.Grade], "rounds[%d].grade=%q", i, rnd.Grade)
	}
}

// TestGetTournamentSummary_ModelStatsSparkline sparkline은 라운드별 시계열(null 허용).
func TestGetTournamentSummary_ModelStatsSparkline(t *testing.T) {
	r := newTestTournamentRouter()

	req := httptest.NewRequest(http.MethodGet, "/admin/stats/ai/tournament", nil)
	w := httptest.NewRecorder()
	r.ServeHTTP(w, req)

	var resp tournamentResponse
	require.NoError(t, json.Unmarshal(w.Body.Bytes(), &resp))

	for i, m := range resp.ModelStats {
		assert.NotEmptyf(t, m.ModelType, "modelStats[%d].modelType", i)
		assert.NotEmptyf(t, m.ModelName, "modelStats[%d].modelName", i)
		assert.NotEmptyf(t, m.LatestRound, "modelStats[%d].latestRound", i)
		// 스파크라인은 null을 포함할 수 있으므로 길이만 체크 (>=1)
		assert.GreaterOrEqualf(t, len(m.Sparkline), 1, "modelStats[%d].sparkline", i)
	}
}

// TestGetTournamentSummary_Round4DeepSeekIsAPlus Round 4 DeepSeek 30.8% A+ 회귀 방지.
//
// 실제 대전 결과(docs/04-testing/37, 46)의 핵심 지표가 정적 JSON에 정확히 반영되어
// 있는지 회귀 테스트. Sprint 6 W2 DB 집계로 교체 시 이 값이 흔들리면 즉시 감지 가능.
func TestGetTournamentSummary_Round4DeepSeekIsAPlus(t *testing.T) {
	r := newTestTournamentRouter()

	req := httptest.NewRequest(http.MethodGet, "/admin/stats/ai/tournament", nil)
	w := httptest.NewRecorder()
	r.ServeHTTP(w, req)

	var resp tournamentResponse
	require.NoError(t, json.Unmarshal(w.Body.Bytes(), &resp))

	var found bool
	for _, rnd := range resp.Rounds {
		if rnd.Round == "R4" && rnd.ModelType == "deepseek" {
			found = true
			assert.InDelta(t, 30.8, rnd.PlaceRate, 0.01, "R4 DeepSeek Place Rate")
			assert.Equal(t, 80, rnd.TotalTurns, "R4 DeepSeek 80턴 완주")
			assert.True(t, rnd.Completed, "R4 DeepSeek completed=true")
			assert.Equal(t, "COMPLETED", rnd.Status)
			assert.Equal(t, "A+", rnd.Grade)
			break
		}
	}
	assert.True(t, found, "R4 DeepSeek 엔트리가 존재해야 함")
}

// TestGetTournamentSummary_AllThreeModelsPresent 3개 기본 모델이 modelStats에 모두 존재.
func TestGetTournamentSummary_AllThreeModelsPresent(t *testing.T) {
	r := newTestTournamentRouter()

	req := httptest.NewRequest(http.MethodGet, "/admin/stats/ai/tournament", nil)
	w := httptest.NewRecorder()
	r.ServeHTTP(w, req)

	var resp tournamentResponse
	require.NoError(t, json.Unmarshal(w.Body.Bytes(), &resp))

	seen := map[string]bool{}
	for _, m := range resp.ModelStats {
		seen[m.ModelType] = true
	}
	assert.True(t, seen["openai"], "GPT modelStats 엔트리 필요")
	assert.True(t, seen["claude"], "Claude modelStats 엔트리 필요")
	assert.True(t, seen["deepseek"], "DeepSeek modelStats 엔트리 필요")
}

// TestGetTournamentSummary_QueryParamsIgnored 쿼리 파라미터가 현 옵션 B에서는 무시되지만
// 요청 자체는 실패하지 않아야 함. Sprint 6 W2에서 서버 사이드 필터링이 구현되면 이 테스트는
// 실제 필터링 동작을 검증하도록 교체된다.
func TestGetTournamentSummary_QueryParamsIgnored(t *testing.T) {
	r := newTestTournamentRouter()

	req := httptest.NewRequest(
		http.MethodGet,
		"/admin/stats/ai/tournament?models=openai,claude&rounds=R2-R5&prompt=v2",
		nil,
	)
	w := httptest.NewRecorder()
	r.ServeHTTP(w, req)

	require.Equal(t, http.StatusOK, w.Code)

	var resp tournamentResponse
	require.NoError(t, json.Unmarshal(w.Body.Bytes(), &resp))
	// 옵션 B: 필터링이 무시되므로 전체 라운드가 그대로 반환됨 (deepseek 포함)
	var hasDeepseek bool
	for _, rnd := range resp.Rounds {
		if rnd.ModelType == "deepseek" {
			hasDeepseek = true
			break
		}
	}
	assert.True(t, hasDeepseek, "옵션 B는 쿼리 필터를 무시하므로 deepseek 여전히 포함")
}
