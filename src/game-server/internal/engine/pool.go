package engine

import (
	"fmt"
	"math/rand"
	"os"
	"strconv"
)

// EnvTestSeed 테스트 전용 고정 시드 환경변수 이름.
// 설정되면 NewTilePool()이 NewTilePoolWithSeed(seed)로 우회된다.
// 프로덕션 코드에서는 설정하지 말 것. 결정론적 Playtest/회귀 전용.
const EnvTestSeed = "RUMMIKUB_TEST_SEED"

// TilePool 게임에서 사용하는 전체 타일 풀(106장)을 관리한다.
// 셔플, 분배, 드로우 기능을 제공하며 외부 의존성 없이 순수하게 동작한다.
type TilePool struct {
	tiles []*Tile
	rng   *rand.Rand // nil이면 global rand 사용 (기존 동작)
}

// NewTilePool 106장의 타일로 초기화된 TilePool을 생성한다.
// 생성 직후 Fisher-Yates 셔플이 적용된다.
// 4색 × 13숫자 × 2세트(a, b) = 104장 + 조커 2장 = 106장
//
// RUMMIKUB_TEST_SEED 환경변수가 설정되어 있으면 NewTilePoolWithSeed로 우회한다.
// 이는 결정론적 E2E/Playtest/회귀 테스트 전용이다.
func NewTilePool() *TilePool {
	if seedStr := os.Getenv(EnvTestSeed); seedStr != "" {
		if seed, err := strconv.ParseUint(seedStr, 0, 64); err == nil {
			return NewTilePoolWithSeed(seed)
		}
	}
	p := &TilePool{
		tiles: GenerateDeck(),
	}
	p.Shuffle()
	return p
}

// NewTilePoolWithSeed 고정 시드로 결정론적 TilePool을 생성한다.
// 같은 seed → 같은 셔플 결과 → 같은 초기 랙/드로우 파일 순서.
// B3 결정론적 Playtest 프레임워크(Task #7)에서 사용된다.
func NewTilePoolWithSeed(seed uint64) *TilePool {
	// #nosec G404 — 결정론 재현이 목적, 암호학적 난수 불필요
	r := rand.New(rand.NewSource(int64(seed)))
	p := &TilePool{
		tiles: GenerateDeck(),
		rng:   r,
	}
	p.Shuffle()
	return p
}

// Shuffle math/rand.Shuffle 기반으로 타일을 무작위 섞는다.
// rng 필드가 설정되어 있으면 해당 rng를 사용하여 결정론적으로 셔플한다.
// 그렇지 않으면 글로벌 rand를 사용 (기존 동작).
func (p *TilePool) Shuffle() {
	if p.rng != nil {
		p.rng.Shuffle(len(p.tiles), func(i, j int) {
			p.tiles[i], p.tiles[j] = p.tiles[j], p.tiles[i]
		})
		return
	}
	rand.Shuffle(len(p.tiles), func(i, j int) {
		p.tiles[i], p.tiles[j] = p.tiles[j], p.tiles[i]
	})
}

// Deal count 장만큼 타일을 풀에서 꺼내 반환한다.
// 풀에 남은 타일이 count보다 적으면 남은 만큼만 반환한다.
func (p *TilePool) Deal(count int) []*Tile {
	if count <= 0 {
		return nil
	}
	if count > len(p.tiles) {
		count = len(p.tiles)
	}
	dealt := make([]*Tile, count)
	copy(dealt, p.tiles[:count])
	p.tiles = p.tiles[count:]
	return dealt
}

// DrawOne 풀에서 타일 1장을 꺼낸다.
// 풀이 비어있으면 nil, ErrDrawPileEmpty를 반환한다.
func (p *TilePool) DrawOne() (*Tile, error) {
	if len(p.tiles) == 0 {
		return nil, fmt.Errorf("%s: draw pile is empty", ErrDrawPileEmpty)
	}
	t := p.tiles[0]
	p.tiles = p.tiles[1:]
	return t, nil
}

// Remaining 현재 풀에 남아있는 타일 수를 반환한다.
func (p *TilePool) Remaining() int {
	return len(p.tiles)
}

// DealInitialHands playerCount명에게 각 14장씩 초기 패를 분배한다.
// 반환값은 seat 인덱스 기준 2차원 슬라이스다.
// playerCount가 2~4 범위를 벗어나면 error를 반환한다.
func (p *TilePool) DealInitialHands(playerCount int) ([][]*Tile, error) {
	if playerCount < 2 || playerCount > 4 {
		return nil, fmt.Errorf("playerCount must be between 2 and 4, got %d", playerCount)
	}
	const tilesPerPlayer = 14
	if p.Remaining() < playerCount*tilesPerPlayer {
		return nil, fmt.Errorf("not enough tiles: need %d, have %d",
			playerCount*tilesPerPlayer, p.Remaining())
	}

	hands := make([][]*Tile, playerCount)
	for i := 0; i < playerCount; i++ {
		hands[i] = p.Deal(tilesPerPlayer)
	}
	return hands, nil
}
