package engine

import "math"

// --- ELO 계산 타입 정의 ---

// PlayerResult 게임 결과 내 플레이어 순위 정보.
type PlayerResult struct {
	UserID      string
	Rank        int // 1=1위, 2=2위, ...
	GamesPlayed int // 현재까지 플레이한 총 게임 수 (K-Factor 결정용)
}

// EloChange 단일 플레이어의 ELO 변동 결과.
type EloChange struct {
	UserID    string
	OldRating int
	NewRating int
	Delta     int
	OldTier   string
	NewTier   string
}

// --- 티어 상수 ---

const (
	TierUnranked  = "UNRANKED"
	TierBronze    = "BRONZE"
	TierSilver    = "SILVER"
	TierGold      = "GOLD"
	TierPlatinum  = "PLATINUM"
	TierDiamond   = "DIAMOND"

	// 배치 게임 완료 기준 (10판)
	placementGames = 10
	// 최소 레이팅 바닥값
	minRating = 100
)

// --- 공개 함수 ---

// CalcElo N명 다자 게임 결과를 기반으로 쌍대 비교 합산(Pairwise Comparison) ELO 변동을 계산한다.
// players: 게임 결과 (UserID, Rank, GamesPlayed 포함)
// currentRatings: 게임 시작 전 각 플레이어의 레이팅 (UserID → rating)
// 반환값: 각 플레이어의 ELO 변동 목록 (입력 순서와 동일)
func CalcElo(players []PlayerResult, currentRatings map[string]int) []EloChange {
	n := len(players)
	if n < 2 {
		return nil
	}

	changes := make([]EloChange, n)
	for i, p := range players {
		ratingA := currentRatings[p.UserID]
		k := getKFactor(ratingA, p.GamesPlayed)

		var sumDelta float64
		for j, q := range players {
			if i == j {
				continue
			}
			ratingB := currentRatings[q.UserID]
			e := expectedScore(ratingA, ratingB)
			s := actualScore(p.Rank, q.Rank)
			sumDelta += s - e
		}

		// K / (N-1) * SUM(S_ij - E_ij)
		delta := (k / float64(n-1)) * sumDelta
		newRating := ratingA + int(math.Round(delta))
		if newRating < minRating {
			newRating = minRating
		}

		newGamesPlayed := p.GamesPlayed + 1
		changes[i] = EloChange{
			UserID:    p.UserID,
			OldRating: ratingA,
			NewRating: newRating,
			Delta:     newRating - ratingA,
			OldTier:   GetTier(ratingA, p.GamesPlayed),
			NewTier:   GetTier(newRating, newGamesPlayed),
		}
	}

	return changes
}

// GetTier 레이팅과 플레이 게임 수를 기반으로 티어 문자열을 반환한다.
// 배치 게임(10판) 미완료 시 UNRANKED를 반환한다.
// 참조: docs/01-planning/10-phase4-elo-design.md §6.1
func GetTier(rating int, gamesPlayed int) string {
	if gamesPlayed < placementGames {
		return TierUnranked
	}
	switch {
	case rating >= 1900:
		return TierDiamond
	case rating >= 1600:
		return TierPlatinum
	case rating >= 1300:
		return TierGold
	case rating >= 1100:
		return TierSilver
	default:
		return TierBronze
	}
}

// --- 비공개 헬퍼 함수 ---

// getKFactor 플레이어의 K-Factor를 결정한다.
// GamesPlayed < 30: K=40 (신규, 빠른 수렴)
// Rating >= 2000: K=24 (상위, 안정화)
// 나머지: K=32 (기본)
func getKFactor(rating int, gamesPlayed int) float64 {
	if gamesPlayed < 30 {
		return 40
	}
	if rating >= 2000 {
		return 24
	}
	return 32
}

// expectedScore 플레이어 A가 플레이어 B를 이길 기대 확률을 계산한다.
// 표준 ELO 수식: 1 / (1 + 10^((R_B - R_A) / 400))
func expectedScore(ratingA, ratingB int) float64 {
	return 1.0 / (1.0 + math.Pow(10, float64(ratingB-ratingA)/400.0))
}

// actualScore 순위 기반 실제 점수를 반환한다.
// rankI가 rankJ보다 작으면(상위 순위) 1.0, 같으면 0.5, 크면(하위) 0.0
func actualScore(rankI, rankJ int) float64 {
	switch {
	case rankI < rankJ:
		return 1.0
	case rankI == rankJ:
		return 0.5
	default:
		return 0.0
	}
}
