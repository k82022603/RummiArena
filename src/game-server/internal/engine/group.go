package engine


// ValidateGroup checks whether a slice of tiles forms a valid Rummikub group.
// Rules (§3.1 of game-rules):
//   - 3 or 4 tiles
//   - All non-joker tiles share the same number
//   - All tile colors are distinct (no duplicate color)
//   - At most one tile per color (R, B, Y, K)
func ValidateGroup(tiles []*Tile) error {
	if len(tiles) < 3 || len(tiles) > 4 {
		return newValidationError(ErrSetSize, ErrorMessages[ErrSetSize])
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
			return newValidationError(ErrGroupNumberMismatch, ErrorMessages[ErrGroupNumberMismatch], t.Code)
		}
		if colorSeen[t.Color] {
			return newValidationError(ErrGroupColorDup, ErrorMessages[ErrGroupColorDup], t.Code)
		}
		colorSeen[t.Color] = true
	}

	// 조커만으로 세트를 구성할 수 없습니다 (설계 결정 B.3 참조).
	// 조커가 대체할 구체적인 숫자를 결정할 수 없기 때문이다.
	if refNumber == 0 {
		return newValidationError(ErrRunNoNumber, "조커만으로 세트를 구성할 수 없습니다")
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
