package engine

import (
	"fmt"
	"sort"
)

// ValidateRun checks whether a slice of tiles forms a valid Rummikub run.
// Rules (§3.2 of game-rules):
//   - 3 or more tiles
//   - All non-joker tiles share the same color
//   - Numbers are consecutive (jokers fill gaps)
//   - No wrap-around: 13 → 1 is not allowed
//   - Numbers must be in range 1–13
func ValidateRun(tiles []*Tile) error {
	if len(tiles) < 3 {
		return fmt.Errorf("run must have at least 3 tiles, got %d", len(tiles))
	}

	var refColor string
	nonJokerNumbers := make([]int, 0, len(tiles))

	for _, t := range tiles {
		if t.IsJoker {
			continue
		}
		if refColor == "" {
			refColor = t.Color
		} else if t.Color != refColor {
			return fmt.Errorf("run tiles must share the same color: expected %q, got %q (tile %s)",
				refColor, t.Color, t.Code)
		}
		nonJokerNumbers = append(nonJokerNumbers, t.Number)
	}

	if len(nonJokerNumbers) == 0 {
		// All jokers — technically can form any run; accept.
		return nil
	}

	sort.Ints(nonJokerNumbers)

	min := nonJokerNumbers[0]
	max := nonJokerNumbers[len(nonJokerNumbers)-1]

	// The run occupies positions [min, min+len(tiles)-1] or similar.
	// With jokers filling gaps, we need: (max - min) < len(tiles)
	// and all positions fit within 1–13.
	span := max - min + 1
	if span > len(tiles) {
		return fmt.Errorf("run has too many gaps for available jokers (span %d, tiles %d)", span, len(tiles))
	}

	// Determine actual run bounds including jokers at edges.
	jokerCount := 0
	for _, t := range tiles {
		if t.IsJoker {
			jokerCount++
		}
	}

	// Total length is len(tiles). Non-joker numbers must all fit within a
	// window of size len(tiles) somewhere in [1, 13].
	runLen := len(tiles)
	possibleStart := min - (jokerCount - (span - (max - min + 1)))
	if possibleStart < 1 {
		possibleStart = 1
	}
	possibleEnd := possibleStart + runLen - 1
	if possibleEnd > 13 {
		return fmt.Errorf("run exceeds maximum tile number 13")
	}

	return nil
}

// runScore returns the sum of effective tile values in a run.
// Jokers take the value of the position they fill; we compute based on
// sequential position assuming sorted non-joker tiles define the window.
func runScore(tiles []*Tile) int {
	nonJokerNums := make([]int, 0, len(tiles))
	for _, t := range tiles {
		if !t.IsJoker {
			nonJokerNums = append(nonJokerNums, t.Number)
		}
	}
	sort.Ints(nonJokerNums)

	min := nonJokerNums[0]
	sum := 0
	for i := 0; i < len(tiles); i++ {
		sum += min + i
	}
	return sum
}
