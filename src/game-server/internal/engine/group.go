package engine

import "fmt"

// ValidateGroup checks whether a slice of tiles forms a valid Rummikub group.
// Rules (§3.1 of game-rules):
//   - 3 or 4 tiles
//   - All non-joker tiles share the same number
//   - All tile colors are distinct (no duplicate color)
//   - At most one tile per color (R, B, Y, K)
func ValidateGroup(tiles []*Tile) error {
	if len(tiles) < 3 || len(tiles) > 4 {
		return fmt.Errorf("group must have 3 or 4 tiles, got %d", len(tiles))
	}

	colorSeen := make(map[string]bool)
	var refNumber int

	for _, t := range tiles {
		if t.IsJoker {
			continue
		}
		if refNumber == 0 {
			refNumber = t.Number
		} else if t.Number != refNumber {
			return fmt.Errorf("group tiles must share the same number: expected %d, got %d (tile %s)",
				refNumber, t.Number, t.Code)
		}
		if colorSeen[t.Color] {
			return fmt.Errorf("duplicate color %q in group (tile %s)", t.Color, t.Code)
		}
		colorSeen[t.Color] = true
	}

	return nil
}

// groupScore returns the sum of all tile values in a group.
// Jokers take the value of the shared number.
func groupScore(tiles []*Tile) int {
	refNumber := 0
	for _, t := range tiles {
		if !t.IsJoker {
			refNumber = t.Number
			break
		}
	}

	sum := 0
	for _, t := range tiles {
		if t.IsJoker {
			sum += refNumber
		} else {
			sum += t.Number
		}
	}
	return sum
}
