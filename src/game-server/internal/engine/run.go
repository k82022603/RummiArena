package engine

import (
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
		return newValidationError(ErrSetSize, ErrorMessages[ErrSetSize])
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
			return newValidationError(ErrRunColor, ErrorMessages[ErrRunColor], t.Code)
		}
		nonJokerNumbers = append(nonJokerNumbers, t.Number)
	}

	if len(nonJokerNumbers) == 0 {
		// 조커만으로 세트를 구성할 수 없습니다 (설계 결정 B.3 참조).
		// 조커가 대체할 구체적인 숫자와 색상을 결정할 수 없기 때문이다.
		return newValidationError(ErrRunNoNumber, "조커만으로 세트를 구성할 수 없습니다")
	}

	sort.Ints(nonJokerNumbers)

	// V-15: 런에서 같은 숫자 중복 불가 (R3a, R3b 같은 케이스).
	for i := 1; i < len(nonJokerNumbers); i++ {
		if nonJokerNumbers[i] == nonJokerNumbers[i-1] {
			return newValidationError(ErrRunDuplicate, ErrorMessages[ErrRunDuplicate])
		}
	}

	min := nonJokerNumbers[0]
	max := nonJokerNumbers[len(nonJokerNumbers)-1]

	// The run occupies positions [min, min+len(tiles)-1] or similar.
	// With jokers filling gaps, we need: (max - min) < len(tiles)
	// and all positions fit within 1–13.
	span := max - min + 1
	if span > len(tiles) {
		return newValidationError(ErrRunSequence, ErrorMessages[ErrRunSequence])
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
		return newValidationError(ErrRunRange, ErrorMessages[ErrRunRange])
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
