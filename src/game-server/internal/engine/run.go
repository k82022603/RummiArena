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

	refColor, nonJokerNumbers, err := extractRunColorAndNumbers(tiles)
	if err != nil {
		return err
	}
	_ = refColor

	sort.Ints(nonJokerNumbers)

	if err := checkRunDuplicates(nonJokerNumbers); err != nil {
		return err
	}

	return checkRunBounds(tiles, nonJokerNumbers)
}

// extractRunColorAndNumbers non-joker 타일에서 기준 색상과 숫자 목록을 추출한다.
// 색상 불일치이거나 non-joker 타일이 없으면 에러를 반환한다.
func extractRunColorAndNumbers(tiles []*Tile) (string, []int, error) {
	var refColor string
	nonJokerNumbers := make([]int, 0, len(tiles))

	for _, t := range tiles {
		if t.IsJoker {
			continue
		}
		if refColor == "" {
			refColor = t.Color
		} else if t.Color != refColor {
			return "", nil, newValidationError(ErrRunColor, ErrorMessages[ErrRunColor], t.Code)
		}
		nonJokerNumbers = append(nonJokerNumbers, t.Number)
	}

	if len(nonJokerNumbers) == 0 {
		// 조커만으로 세트를 구성할 수 없습니다 (설계 결정 B.3 참조).
		return "", nil, newValidationError(ErrRunNoNumber, "조커만으로 세트를 구성할 수 없습니다")
	}

	return refColor, nonJokerNumbers, nil
}

// checkRunDuplicates V-15: 런에서 같은 숫자 중복 여부를 검사한다 (정렬된 슬라이스 가정).
func checkRunDuplicates(sorted []int) error {
	for i := 1; i < len(sorted); i++ {
		if sorted[i] == sorted[i-1] {
			return newValidationError(ErrRunDuplicate, ErrorMessages[ErrRunDuplicate])
		}
	}
	return nil
}

// checkRunBounds 런의 span과 범위(1–13)가 유효한지 검사한다.
func checkRunBounds(tiles []*Tile, sortedNonJokerNumbers []int) error {
	min := sortedNonJokerNumbers[0]
	max := sortedNonJokerNumbers[len(sortedNonJokerNumbers)-1]

	span := max - min + 1
	if span > len(tiles) {
		return newValidationError(ErrRunSequence, ErrorMessages[ErrRunSequence])
	}

	jokerCount := countJokers(tiles)

	runLen := len(tiles)
	possibleStart := min - (jokerCount - (span - (max - min + 1)))
	if possibleStart < 1 {
		possibleStart = 1
	}
	if possibleStart+runLen-1 > 13 {
		return newValidationError(ErrRunRange, ErrorMessages[ErrRunRange])
	}

	return nil
}

// countJokers 타일 슬라이스에서 조커 수를 반환한다.
func countJokers(tiles []*Tile) int {
	count := 0
	for _, t := range tiles {
		if t.IsJoker {
			count++
		}
	}
	return count
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
