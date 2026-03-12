package engine

import (
	"fmt"
	"strconv"
	"strings"
)

// Color constants matching the tile encoding spec.
const (
	ColorRed    = "R"
	ColorBlue   = "B"
	ColorYellow = "Y"
	ColorBlack  = "K"
)

// JokerScore is the penalty score of a joker tile.
const JokerScore = 30

// Tile is the engine's internal representation of a rummikub tile.
type Tile struct {
	Code    string
	Color   string
	Number  int
	Set     string
	IsJoker bool
}

// Parse decodes a tile code string into a Tile.
// Valid formats: "R7a", "B13b", "JK1", "JK2"
func Parse(code string) (*Tile, error) {
	if code == "JK1" || code == "JK2" {
		return &Tile{Code: code, IsJoker: true}, nil
	}

	if len(code) < 3 {
		return nil, fmt.Errorf("invalid tile code: %q", code)
	}

	color := string(code[0])
	switch color {
	case ColorRed, ColorBlue, ColorYellow, ColorBlack:
	default:
		return nil, fmt.Errorf("invalid tile color %q in code %q", color, code)
	}

	set := string(code[len(code)-1])
	if set != "a" && set != "b" {
		return nil, fmt.Errorf("invalid tile set %q in code %q", set, code)
	}

	numStr := code[1 : len(code)-1]
	num, err := strconv.Atoi(numStr)
	if err != nil || num < 1 || num > 13 {
		return nil, fmt.Errorf("invalid tile number %q in code %q", numStr, code)
	}

	return &Tile{
		Code:   code,
		Color:  color,
		Number: num,
		Set:    set,
	}, nil
}

// Score returns the point value of a tile.
// For jokers used inside a set, the caller should pass the effective number.
func (t *Tile) Score() int {
	if t.IsJoker {
		return JokerScore
	}
	return t.Number
}

// ParseAll decodes a slice of tile code strings.
func ParseAll(codes []string) ([]*Tile, error) {
	tiles := make([]*Tile, 0, len(codes))
	for _, c := range codes {
		t, err := Parse(strings.TrimSpace(c))
		if err != nil {
			return nil, err
		}
		tiles = append(tiles, t)
	}
	return tiles, nil
}

// GenerateDeck creates the full 106-tile deck.
func GenerateDeck() []*Tile {
	colors := []string{ColorRed, ColorBlue, ColorYellow, ColorBlack}
	sets := []string{"a", "b"}
	tiles := make([]*Tile, 0, 106)

	for _, set := range sets {
		for _, color := range colors {
			for n := 1; n <= 13; n++ {
				code := fmt.Sprintf("%s%d%s", color, n, set)
				tiles = append(tiles, &Tile{
					Code:   code,
					Color:  color,
					Number: n,
					Set:    set,
				})
			}
		}
	}

	tiles = append(tiles, &Tile{Code: "JK1", IsJoker: true})
	tiles = append(tiles, &Tile{Code: "JK2", IsJoker: true})

	return tiles
}
