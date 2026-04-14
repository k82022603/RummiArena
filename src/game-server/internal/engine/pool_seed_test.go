package engine

import (
	"os"
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

// TestNewTilePoolWithSeed_Determinism 같은 시드로 생성한 두 풀은 완전히 동일한
// 타일 순서를 가져야 한다. B3 결정론 프레임워크의 핵심 불변식.
func TestNewTilePoolWithSeed_Determinism(t *testing.T) {
	const seed uint64 = 0x1A2B3C4D

	p1 := NewTilePoolWithSeed(seed)
	p2 := NewTilePoolWithSeed(seed)

	require.Equal(t, 106, p1.Remaining())
	require.Equal(t, 106, p2.Remaining())

	all1 := p1.Deal(106)
	all2 := p2.Deal(106)

	for i := range all1 {
		assert.Equal(t, all1[i].Code, all2[i].Code,
			"인덱스 %d에서 순서가 달라졌다 — 결정론 실패", i)
	}
}

// TestNewTilePoolWithSeed_Determinism100x 같은 시드로 100회 생성해도
// 매번 동일한 결과가 나와야 한다. 플레이키 검출 목적.
func TestNewTilePoolWithSeed_Determinism100x(t *testing.T) {
	const seed uint64 = 0xDEADBEEF

	reference := NewTilePoolWithSeed(seed).Deal(106)
	refCodes := make([]string, len(reference))
	for i, tile := range reference {
		refCodes[i] = tile.Code
	}

	for trial := 0; trial < 100; trial++ {
		pool := NewTilePoolWithSeed(seed)
		all := pool.Deal(106)
		for i, tile := range all {
			if tile.Code != refCodes[i] {
				t.Fatalf("trial %d 인덱스 %d에서 순서가 달라졌다: %s vs %s",
					trial, i, tile.Code, refCodes[i])
			}
		}
	}
}

// TestNewTilePoolWithSeed_DifferentSeeds 다른 시드는 다른 순서를 만들어야 한다.
// 전체 106장 중 최소 절반은 다른 인덱스에 있어야 한다 (충돌 확률 보호).
func TestNewTilePoolWithSeed_DifferentSeeds(t *testing.T) {
	p1 := NewTilePoolWithSeed(0x1111111111111111)
	p2 := NewTilePoolWithSeed(0x2222222222222222)

	all1 := p1.Deal(106)
	all2 := p2.Deal(106)

	diffs := 0
	for i := range all1 {
		if all1[i].Code != all2[i].Code {
			diffs++
		}
	}
	assert.Greater(t, diffs, 53,
		"서로 다른 시드는 106장 중 최소 절반 이상 다른 인덱스여야 한다 (실제: %d)", diffs)
}

// TestNewTilePoolWithSeed_InitialHandsDeterministic 초기 분배도 결정론적이어야 한다.
func TestNewTilePoolWithSeed_InitialHandsDeterministic(t *testing.T) {
	const seed uint64 = 0xCAFEBABE

	p1 := NewTilePoolWithSeed(seed)
	p2 := NewTilePoolWithSeed(seed)

	hands1, err := p1.DealInitialHands(4)
	require.NoError(t, err)
	hands2, err := p2.DealInitialHands(4)
	require.NoError(t, err)

	for seat := 0; seat < 4; seat++ {
		require.Len(t, hands1[seat], 14)
		require.Len(t, hands2[seat], 14)
		for i := 0; i < 14; i++ {
			assert.Equal(t, hands1[seat][i].Code, hands2[seat][i].Code,
				"seat %d index %d에서 분배 순서가 달라졌다", seat, i)
		}
	}
}

// TestNewTilePoolWithSeed_TotalCount 시드 생성 후에도 타일 수는 106장이어야 한다.
func TestNewTilePoolWithSeed_TotalCount(t *testing.T) {
	pool := NewTilePoolWithSeed(12345)
	assert.Equal(t, 106, pool.Remaining())
}

// TestNewTilePool_EnvSeedBypass RUMMIKUB_TEST_SEED 환경변수가 설정되면
// NewTilePool()이 NewTilePoolWithSeed()로 우회되어 결정론적이어야 한다.
func TestNewTilePool_EnvSeedBypass(t *testing.T) {
	const seedHex = "0x1A2B3C4D"
	oldVal, wasSet := os.LookupEnv(EnvTestSeed)
	t.Cleanup(func() {
		if wasSet {
			_ = os.Setenv(EnvTestSeed, oldVal)
		} else {
			_ = os.Unsetenv(EnvTestSeed)
		}
	})

	require.NoError(t, os.Setenv(EnvTestSeed, seedHex))

	p1 := NewTilePool()
	p2 := NewTilePool()

	all1 := p1.Deal(106)
	all2 := p2.Deal(106)

	for i := range all1 {
		require.Equal(t, all1[i].Code, all2[i].Code,
			"env seed 설정 시에도 결정론이 보장되어야 한다")
	}
}

// TestNewTilePool_EnvSeedBypass_DecimalAndHex 10진수와 16진수 모두 파싱 지원.
func TestNewTilePool_EnvSeedBypass_DecimalAndHex(t *testing.T) {
	oldVal, wasSet := os.LookupEnv(EnvTestSeed)
	t.Cleanup(func() {
		if wasSet {
			_ = os.Setenv(EnvTestSeed, oldVal)
		} else {
			_ = os.Unsetenv(EnvTestSeed)
		}
	})

	// 16진수: 0xFF = 255
	_ = os.Setenv(EnvTestSeed, "0xFF")
	poolHex := NewTilePool()
	// 10진수: 255
	_ = os.Setenv(EnvTestSeed, "255")
	poolDec := NewTilePool()

	allHex := poolHex.Deal(106)
	allDec := poolDec.Deal(106)
	for i := range allHex {
		require.Equal(t, allHex[i].Code, allDec[i].Code,
			"0xFF와 255는 동일한 시드여야 한다")
	}
}

// TestNewTilePool_EnvSeedBypass_InvalidFallback 잘못된 env 값은 조용히 기존
// 비결정론 경로로 폴백해야 한다 (프로덕션 안전).
func TestNewTilePool_EnvSeedBypass_InvalidFallback(t *testing.T) {
	oldVal, wasSet := os.LookupEnv(EnvTestSeed)
	t.Cleanup(func() {
		if wasSet {
			_ = os.Setenv(EnvTestSeed, oldVal)
		} else {
			_ = os.Unsetenv(EnvTestSeed)
		}
	})

	_ = os.Setenv(EnvTestSeed, "not-a-number")
	pool := NewTilePool()
	assert.Equal(t, 106, pool.Remaining(),
		"잘못된 env seed는 정상 NewTilePool로 폴백해야 한다")
}
