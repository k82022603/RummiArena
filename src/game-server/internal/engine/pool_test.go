package engine

import (
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

// TestNewTilePool_TotalCount 풀 생성 직후 전체 타일 수가 106장인지 검증한다.
func TestNewTilePool_TotalCount(t *testing.T) {
	pool := NewTilePool()
	assert.Equal(t, 106, pool.Remaining(),
		"NewTilePool 직후 남은 타일은 106장이어야 한다")
}

// TestNewTilePool_Shuffled 풀 생성 시 셔플이 수행되는지 검증한다.
// 동일한 초기 순서(GenerateDeck)와 비교하여 순서가 달라져야 한다.
// 극히 드문 확률로 동일 순서가 나올 수 있으므로 3회 시도 중 1회라도 달라지면 통과한다.
func TestNewTilePool_Shuffled(t *testing.T) {
	baseDeck := GenerateDeck()
	baseCodes := make([]string, len(baseDeck))
	for i, tile := range baseDeck {
		baseCodes[i] = tile.Code
	}

	differentFound := false
	for attempt := 0; attempt < 3; attempt++ {
		pool := NewTilePool()
		// 내부 tiles 슬라이스는 Deal로 접근한다.
		// 전체를 꺼내서 순서 비교
		all := pool.Deal(106)
		for i, tile := range all {
			if tile.Code != baseCodes[i] {
				differentFound = true
				break
			}
		}
		if differentFound {
			break
		}
	}
	assert.True(t, differentFound, "3회 시도 중 1회라도 셔플로 순서가 달라져야 한다")
}

// TestTilePool_Deal_Normal 정상 범위 Deal이 올바르게 동작하는지 검증한다.
func TestTilePool_Deal_Normal(t *testing.T) {
	pool := NewTilePool()

	dealt := pool.Deal(14)
	assert.Len(t, dealt, 14, "14장을 Deal해야 한다")
	assert.Equal(t, 92, pool.Remaining(), "Deal 후 92장이 남아야 한다")
}

// TestTilePool_Deal_MoreThanAvailable 남은 타일보다 많이 요청하면 남은 수만큼만 반환한다.
func TestTilePool_Deal_MoreThanAvailable(t *testing.T) {
	pool := NewTilePool()
	_ = pool.Deal(100) // 100장 소비

	// 6장 남은 상태에서 10장 요청
	dealt := pool.Deal(10)
	assert.Len(t, dealt, 6, "남은 6장만 반환해야 한다")
	assert.Equal(t, 0, pool.Remaining())
}

// TestTilePool_Deal_Zero 0장 요청 시 빈 슬라이스(nil)를 반환한다.
func TestTilePool_Deal_Zero(t *testing.T) {
	pool := NewTilePool()
	dealt := pool.Deal(0)
	assert.Nil(t, dealt)
	assert.Equal(t, 106, pool.Remaining(), "Deal(0) 후 타일 수는 변하지 않아야 한다")
}

// TestTilePool_DrawOne_Normal 정상 드로우에서 타일 수가 1씩 감소하는지 검증한다.
func TestTilePool_DrawOne_Normal(t *testing.T) {
	pool := NewTilePool()

	tile, err := pool.DrawOne()
	require.NoError(t, err)
	require.NotNil(t, tile)
	assert.Equal(t, 105, pool.Remaining(), "DrawOne 후 105장이 남아야 한다")
}

// TestTilePool_DrawOne_EmptyPool 빈 풀에서 DrawOne 시 에러를 반환한다.
func TestTilePool_DrawOne_EmptyPool(t *testing.T) {
	pool := NewTilePool()
	pool.Deal(106) // 전체 소진

	tile, err := pool.DrawOne()
	assert.Error(t, err, "빈 풀에서 DrawOne은 에러를 반환해야 한다")
	assert.Nil(t, tile)
}

// TestTilePool_DrawOne_Sequential 연속 드로우 시 타일 수가 순차 감소한다.
func TestTilePool_DrawOne_Sequential(t *testing.T) {
	pool := NewTilePool()

	for i := 0; i < 10; i++ {
		tile, err := pool.DrawOne()
		require.NoError(t, err)
		require.NotNil(t, tile)
	}
	assert.Equal(t, 96, pool.Remaining())
}

// TestTilePool_DealInitialHands_TwoPlayers 2인 게임 초기 분배 검증.
// 2명 × 14장 = 28장 분배, 78장 남음.
func TestTilePool_DealInitialHands_TwoPlayers(t *testing.T) {
	pool := NewTilePool()
	hands, err := pool.DealInitialHands(2)

	require.NoError(t, err)
	require.Len(t, hands, 2)
	assert.Len(t, hands[0], 14)
	assert.Len(t, hands[1], 14)
	assert.Equal(t, 78, pool.Remaining(), "2인 분배 후 78장이 남아야 한다")
}

// TestTilePool_DealInitialHands_ThreePlayers 3인 게임 초기 분배 검증.
// 3명 × 14장 = 42장 분배, 64장 남음.
func TestTilePool_DealInitialHands_ThreePlayers(t *testing.T) {
	pool := NewTilePool()
	hands, err := pool.DealInitialHands(3)

	require.NoError(t, err)
	require.Len(t, hands, 3)
	for i, hand := range hands {
		assert.Len(t, hand, 14, "플레이어 %d는 14장을 받아야 한다", i)
	}
	assert.Equal(t, 64, pool.Remaining(), "3인 분배 후 64장이 남아야 한다")
}

// TestTilePool_DealInitialHands_FourPlayers 4인 게임 초기 분배 검증.
// 4명 × 14장 = 56장 분배, 50장 남음.
func TestTilePool_DealInitialHands_FourPlayers(t *testing.T) {
	pool := NewTilePool()
	hands, err := pool.DealInitialHands(4)

	require.NoError(t, err)
	require.Len(t, hands, 4)
	for i, hand := range hands {
		assert.Len(t, hand, 14, "플레이어 %d는 14장을 받아야 한다", i)
	}
	assert.Equal(t, 50, pool.Remaining(), "4인 분배 후 50장이 남아야 한다")
}

// TestTilePool_DealInitialHands_InvalidPlayerCount 범위 밖 플레이어 수에 에러를 반환한다.
func TestTilePool_DealInitialHands_InvalidPlayerCount(t *testing.T) {
	tests := []struct {
		name        string
		playerCount int
	}{
		{name: "1인 (범위 미달)", playerCount: 1},
		{name: "5인 (범위 초과)", playerCount: 5},
		{name: "0인", playerCount: 0},
		{name: "음수", playerCount: -1},
	}

	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			pool := NewTilePool()
			hands, err := pool.DealInitialHands(tc.playerCount)
			assert.Error(t, err)
			assert.Nil(t, hands)
		})
	}
}

// TestTilePool_DealInitialHands_NoOverlap 분배된 패에 중복 타일이 없는지 검증한다.
func TestTilePool_DealInitialHands_NoOverlap(t *testing.T) {
	pool := NewTilePool()
	hands, err := pool.DealInitialHands(4)
	require.NoError(t, err)

	seen := make(map[string]bool)
	for seat, hand := range hands {
		for _, tile := range hand {
			assert.False(t, seen[tile.Code],
				"seat %d의 타일 %q가 다른 패에도 존재한다", seat, tile.Code)
			seen[tile.Code] = true
		}
	}
}

// TestTilePool_Remaining_AfterSequentialOps 여러 연산 후 Remaining이 정확한지 검증한다.
func TestTilePool_Remaining_AfterSequentialOps(t *testing.T) {
	pool := NewTilePool()
	assert.Equal(t, 106, pool.Remaining())

	pool.Deal(14)
	assert.Equal(t, 92, pool.Remaining())

	pool.DrawOne() //nolint:errcheck
	assert.Equal(t, 91, pool.Remaining())

	pool.Deal(41)
	assert.Equal(t, 50, pool.Remaining())
}
