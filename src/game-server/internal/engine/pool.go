package engine

import (
	"fmt"
	"math/rand"
)

// TilePool 게임에서 사용하는 전체 타일 풀(106장)을 관리한다.
// 셔플, 분배, 드로우 기능을 제공하며 외부 의존성 없이 순수하게 동작한다.
type TilePool struct {
	tiles []*Tile
}

// NewTilePool 106장의 타일로 초기화된 TilePool을 생성한다.
// 생성 직후 Fisher-Yates 셔플이 적용된다.
// 4색 × 13숫자 × 2세트(a, b) = 104장 + 조커 2장 = 106장
func NewTilePool() *TilePool {
	p := &TilePool{
		tiles: GenerateDeck(),
	}
	p.Shuffle()
	return p
}

// Shuffle math/rand.Shuffle 기반으로 타일을 무작위 섞는다.
// 동일한 시드 없이 호출할 때마다 다른 순서를 반환한다.
func (p *TilePool) Shuffle() {
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
