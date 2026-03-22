package engine

import (
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

// --- GetTier 테스트 ---

func TestGetTier_Unranked_BelowPlacementGames(t *testing.T) {
	// 배치 게임(10판) 미만이면 레이팅과 무관하게 UNRANKED
	assert.Equal(t, TierUnranked, GetTier(2000, 0))
	assert.Equal(t, TierUnranked, GetTier(1500, 5))
	assert.Equal(t, TierUnranked, GetTier(800, 9))
}

func TestGetTier_Bronze_AfterPlacement(t *testing.T) {
	// 배치 완료 후 1099 이하는 BRONZE
	assert.Equal(t, TierBronze, GetTier(1000, 10))
	assert.Equal(t, TierBronze, GetTier(100, 20))
	assert.Equal(t, TierBronze, GetTier(1099, 15))
}

func TestGetTier_Silver(t *testing.T) {
	assert.Equal(t, TierSilver, GetTier(1100, 10))
	assert.Equal(t, TierSilver, GetTier(1299, 30))
}

func TestGetTier_Gold(t *testing.T) {
	assert.Equal(t, TierGold, GetTier(1300, 10))
	assert.Equal(t, TierGold, GetTier(1599, 50))
}

func TestGetTier_Platinum(t *testing.T) {
	assert.Equal(t, TierPlatinum, GetTier(1600, 10))
	assert.Equal(t, TierPlatinum, GetTier(1899, 40))
}

func TestGetTier_Diamond(t *testing.T) {
	assert.Equal(t, TierDiamond, GetTier(1900, 10))
	assert.Equal(t, TierDiamond, GetTier(2500, 100))
}

// --- getKFactor 테스트 ---

func TestGetKFactor_Newbie(t *testing.T) {
	// gamesPlayed < 30이면 K=40
	assert.Equal(t, 40.0, getKFactor(1500, 0))
	assert.Equal(t, 40.0, getKFactor(2100, 29))
}

func TestGetKFactor_HighRated(t *testing.T) {
	// gamesPlayed >= 30 && rating >= 2000이면 K=24
	assert.Equal(t, 24.0, getKFactor(2000, 30))
	assert.Equal(t, 24.0, getKFactor(2500, 100))
}

func TestGetKFactor_Default(t *testing.T) {
	// gamesPlayed >= 30 && rating < 2000이면 K=32
	assert.Equal(t, 32.0, getKFactor(1500, 30))
	assert.Equal(t, 32.0, getKFactor(999, 50))
	assert.Equal(t, 32.0, getKFactor(1999, 100))
}

// --- expectedScore 테스트 ---

func TestExpectedScore_EqualRating(t *testing.T) {
	// 레이팅이 같으면 기대 승률 0.5
	e := expectedScore(1000, 1000)
	assert.InDelta(t, 0.5, e, 0.001)
}

func TestExpectedScore_HigherRating(t *testing.T) {
	// A가 높으면 기대 승률 > 0.5
	e := expectedScore(1200, 1000)
	assert.Greater(t, e, 0.5)
}

func TestExpectedScore_LowerRating(t *testing.T) {
	// A가 낮으면 기대 승률 < 0.5
	e := expectedScore(800, 1200)
	assert.Less(t, e, 0.5)
}

// --- CalcElo 테스트 ---

func TestCalcElo_TwoPlayers_WinnerGainsLoserLoses(t *testing.T) {
	players := []PlayerResult{
		{UserID: "userA", Rank: 1, GamesPlayed: 30},
		{UserID: "userB", Rank: 2, GamesPlayed: 30},
	}
	ratings := map[string]int{
		"userA": 1000,
		"userB": 1000,
	}

	changes := CalcElo(players, ratings)
	require.Len(t, changes, 2)

	// 동일 레이팅 2인 게임: 1위는 +16, 2위는 -16
	assert.Equal(t, "userA", changes[0].UserID)
	assert.Greater(t, changes[0].Delta, 0, "1위는 레이팅이 올라야 한다")
	assert.Less(t, changes[1].Delta, 0, "2위는 레이팅이 내려야 한다")
	// 합계는 0 (또는 반올림으로 ±1)
	sum := changes[0].Delta + changes[1].Delta
	assert.InDelta(t, 0, sum, 1)
}

func TestCalcElo_FourPlayers_ZeroSumApprox(t *testing.T) {
	// 설계 문서 §2.4 예시에 준하는 4인 게임
	players := []PlayerResult{
		{UserID: "A", Rank: 1, GamesPlayed: 30},
		{UserID: "C", Rank: 2, GamesPlayed: 30},
		{UserID: "B", Rank: 3, GamesPlayed: 30},
		{UserID: "D", Rank: 4, GamesPlayed: 30},
	}
	ratings := map[string]int{
		"A": 1200,
		"B": 1000,
		"C": 1100,
		"D": 900,
	}

	changes := CalcElo(players, ratings)
	require.Len(t, changes, 4)

	// 1위(A)는 상승, 4위(D)는 하락
	assert.Greater(t, changes[0].Delta, 0, "1위 A는 레이팅이 올라야 한다")
	assert.Less(t, changes[3].Delta, 0, "4위 D는 레이팅이 내려야 한다")

	// 전체 합계는 반올림 오차 범위(±N/2)
	var totalDelta int
	for _, c := range changes {
		totalDelta += c.Delta
	}
	assert.InDelta(t, 0, totalDelta, float64(len(players)/2+1))
}

func TestCalcElo_MinRatingFloor(t *testing.T) {
	// 레이팅이 매우 낮아도 minRating(100) 이하로 내려가지 않는다
	players := []PlayerResult{
		{UserID: "winner", Rank: 1, GamesPlayed: 30},
		{UserID: "loser", Rank: 2, GamesPlayed: 30},
	}
	ratings := map[string]int{
		"winner": 1500,
		"loser":  101,
	}

	changes := CalcElo(players, ratings)
	require.Len(t, changes, 2)

	// loser의 신규 레이팅은 100 이상이어야 한다
	assert.GreaterOrEqual(t, changes[1].NewRating, minRating)
}

func TestCalcElo_HighRatingKFactor(t *testing.T) {
	// 상위 레이팅(2000+) + gamesPlayed>=30: K=24 적용
	players := []PlayerResult{
		{UserID: "expert", Rank: 1, GamesPlayed: 50},
		{UserID: "novice", Rank: 2, GamesPlayed: 50},
	}
	ratings := map[string]int{
		"expert": 2100,
		"novice": 1000,
	}

	changes := CalcElo(players, ratings)
	require.Len(t, changes, 2)

	// expert의 변동은 K=24 기반: K*(1-E) < K=32 시보다 작다
	// 2인 게임에서 expert(2100) vs novice(1000): E ≈ 0.9996 → 변동 ≈ +0.01
	assert.GreaterOrEqual(t, changes[0].Delta, 0)
}

func TestCalcElo_NewbieKFactor(t *testing.T) {
	// 신규 플레이어(gamesPlayed<30): K=40
	players := []PlayerResult{
		{UserID: "newbie", Rank: 1, GamesPlayed: 5},
		{UserID: "veteran", Rank: 2, GamesPlayed: 100},
	}
	ratings := map[string]int{
		"newbie":  1000,
		"veteran": 1000,
	}

	changes := CalcElo(players, ratings)
	require.Len(t, changes, 2)

	// 동일 레이팅, 2인: newbie K=40 → delta = 40/1 * (1-0.5) = +20
	assert.Equal(t, 20, changes[0].Delta)
}

func TestCalcElo_SinglePlayer_ReturnsNil(t *testing.T) {
	// 플레이어 1명이면 nil 반환
	players := []PlayerResult{
		{UserID: "solo", Rank: 1, GamesPlayed: 10},
	}
	ratings := map[string]int{"solo": 1000}
	changes := CalcElo(players, ratings)
	assert.Nil(t, changes)
}

func TestCalcElo_NewRatingSet(t *testing.T) {
	// NewRating = OldRating + Delta 검증
	players := []PlayerResult{
		{UserID: "p1", Rank: 1, GamesPlayed: 30},
		{UserID: "p2", Rank: 2, GamesPlayed: 30},
	}
	ratings := map[string]int{"p1": 1200, "p2": 1000}
	changes := CalcElo(players, ratings)
	for _, c := range changes {
		assert.Equal(t, c.OldRating+c.Delta, c.NewRating,
			"NewRating은 OldRating + Delta여야 한다")
	}
}

func TestCalcElo_TierAssignedAfterChange(t *testing.T) {
	// 배치 완료(10판) 이후 변동 후 티어 할당 확인
	players := []PlayerResult{
		{UserID: "p1", Rank: 1, GamesPlayed: 9}, // 10판째가 됨
		{UserID: "p2", Rank: 2, GamesPlayed: 9},
	}
	ratings := map[string]int{"p1": 1090, "p2": 1090}
	changes := CalcElo(players, ratings)
	require.Len(t, changes, 2)
	// gamesPlayed+1 = 10 → 배치 완료 → BRONZE 또는 SILVER
	assert.NotEqual(t, TierUnranked, changes[0].NewTier, "배치 완료 후 UNRANKED가 아니어야 한다")
}

func TestActualScore_AllCases(t *testing.T) {
	assert.Equal(t, 1.0, actualScore(1, 2), "상위 순위: 1.0")
	assert.Equal(t, 0.5, actualScore(2, 2), "동일 순위: 0.5")
	assert.Equal(t, 0.0, actualScore(3, 1), "하위 순위: 0.0")
}
