package engine

import "fmt"

// SetType identifies whether a set is a group or a run.
type SetType int

const (
	SetTypeUnknown SetType = iota
	SetTypeGroup
	SetTypeRun
)

// TileSet is a named collection of tiles on the table.
type TileSet struct {
	ID    string
	Tiles []*Tile
}

// ValidateTileSet determines the set type and validates accordingly.
// Returns the detected SetType or an error if the set is invalid.
func ValidateTileSet(ts *TileSet) (SetType, error) {
	if len(ts.Tiles) < 3 {
		return SetTypeUnknown, newValidationError(ErrSetSize, ErrorMessages[ErrSetSize])
	}

	groupErr := ValidateGroup(ts.Tiles)
	if groupErr == nil {
		return SetTypeGroup, nil
	}

	runErr := ValidateRun(ts.Tiles)
	if runErr == nil {
		return SetTypeRun, nil
	}

	// 그룹 유효성을 먼저 검사했으므로 groupErr를 우선 반환한다.
	// 타일이 같은 숫자를 가지면 그룹 시도로 간주하고 groupErr를 전파한다.
	if ve, ok := groupErr.(*ValidationError); ok {
		return SetTypeUnknown, ve
	}
	if ve, ok := runErr.(*ValidationError); ok {
		return SetTypeUnknown, ve
	}
	return SetTypeUnknown, newValidationError(ErrInvalidSet, ErrorMessages[ErrInvalidSet])
}

// ValidateTable validates all sets on the table.
// Returns an error listing the first invalid set found.
func ValidateTable(sets []*TileSet) error {
	for _, ts := range sets {
		if _, err := ValidateTileSet(ts); err != nil {
			return err
		}
	}
	return nil
}

// TurnConfirmRequest carries all information needed to validate a turn.
type TurnConfirmRequest struct {
	// TableBefore is the table state at the start of this turn (snapshot).
	TableBefore []*TileSet
	// TableAfter is the proposed table state after the player's moves.
	TableAfter []*TileSet
	// RackBefore lists tile codes in the player's rack before the turn.
	RackBefore []string
	// RackAfter lists tile codes remaining in the player's rack after placement.
	RackAfter []string
	// HasInitialMeld indicates whether the player has already completed their
	// initial meld in a previous turn.
	HasInitialMeld bool
	// JokerReturnedCodes lists joker codes retrieved from the table this turn
	// via tile-swap (must be immediately replayed).
	JokerReturnedCodes []string
}

// ValidateTurnConfirm performs all Engine checks for a turn:confirm action.
// Rules checked: V-01, V-02, V-03, V-04, V-05, V-06, V-07, V-14, V-15
func ValidateTurnConfirm(req TurnConfirmRequest) error {
	// V-01, V-02, V-14, V-15: all sets on table must be valid.
	if err := ValidateTable(req.TableAfter); err != nil {
		return err
	}

	// V-03: at least one tile must have moved from rack to table.
	tilesAdded := countTableTiles(req.TableAfter) - countTableTiles(req.TableBefore)
	if tilesAdded < 1 {
		return newValidationError(ErrNoRackTile, ErrorMessages[ErrNoRackTile])
	}

	// V-06: tile count on table must not decrease (tiles cannot return to rack,
	// except jokers retrieved via swap — those are already accounted for
	// because joker-swap adds the replacement tile and the joker moves elsewhere).
	if countTableTiles(req.TableAfter) < countTableTiles(req.TableBefore) {
		return newValidationError(ErrTableTileMissing, ErrorMessages[ErrTableTileMissing])
	}

	// V-05: before initial meld, only rack tiles may be used.
	// We verify by checking that the table-before tiles did not change.
	if !req.HasInitialMeld {
		if err := validateInitialMeld(req); err != nil {
			return err
		}
	}

	// V-07: any joker retrieved this turn must have been re-placed on the table.
	if err := validateJokerReturned(req); err != nil {
		return err
	}

	// V-06 강화: 코드 수준 빈도 비교 — tableBefore의 모든 타일이 tableAfter에 존재해야 한다.
	// 단순 총 수 비교만으로는 "R7a가 사라지고 B7a가 추가된" 교체를 감지하지 못한다.
	// 단, JokerReturnedCodes에 포함된 타일은 교체로 회수된 것이므로 제외한다 (V-07에서 별도 검증).
	if err := validateTileConservation(req.TableBefore, req.TableAfter, req.JokerReturnedCodes); err != nil {
		return err
	}

	return nil
}

// validateInitialMeld enforces V-04 and V-05.
func validateInitialMeld(req TurnConfirmRequest) error {
	// V-05: table-before tiles must still be intact and unmoved.
	beforeCodes := collectTileCodes(req.TableBefore)
	afterCodes := collectTileCodes(req.TableAfter)

	for code := range beforeCodes {
		if afterCodes[code] < beforeCodes[code] {
			return newValidationError(ErrInitialMeldSource, ErrorMessages[ErrInitialMeldSource])
		}
	}

	// V-04: the newly placed sets must sum to >= 30 points.
	// Jokers count as the value of the tile they replace, not a flat 30.
	// We score only the sets that contain tiles newly moved from the rack.
	addedCodes := newlyAddedTiles(req.RackBefore, req.RackAfter)
	if len(addedCodes) == 0 {
		return newValidationError(ErrInitialMeldScore, ErrorMessages[ErrInitialMeldScore])
	}
	addedSet := make(map[string]int, len(addedCodes))
	for _, c := range addedCodes {
		addedSet[c]++
	}
	score := 0
	for _, ts := range req.TableAfter {
		// Only score sets that consist entirely of newly added rack tiles.
		if !setIsSubsetOf(ts, addedSet) {
			continue
		}
		setType, _ := ValidateTileSet(ts)
		switch setType {
		case SetTypeGroup:
			score += groupScore(ts.Tiles)
		case SetTypeRun:
			score += runScore(ts.Tiles)
		}
	}
	if score < 30 {
		return newValidationError(ErrInitialMeldScore, ErrorMessages[ErrInitialMeldScore])
	}
	return nil
}

// validateJokerReturned enforces V-07.
func validateJokerReturned(req TurnConfirmRequest) error {
	if len(req.JokerReturnedCodes) == 0 {
		return nil
	}
	afterCodes := collectTileCodes(req.TableAfter)
	for _, joker := range req.JokerReturnedCodes {
		if afterCodes[joker] == 0 {
			return newValidationError(ErrJokerNotUsed, ErrorMessages[ErrJokerNotUsed], joker)
		}
	}
	return nil
}

// validateTileConservation 테이블 타일의 코드 수준 보전을 검증한다.
// tableBefore의 모든 타일 코드가 tableAfter에도 동일한 빈도 이상으로 존재해야 한다.
// jokerReturnedCodes에 포함된 타일은 교체로 회수된 것이므로 검증에서 제외한다.
func validateTileConservation(tableBefore, tableAfter []*TileSet, jokerReturnedCodes []string) error {
	beforeFreq := collectTileCodes(tableBefore)
	afterFreq := collectTileCodes(tableAfter)

	// 조커 회수 코드는 테이블에서 합법적으로 제거될 수 있으므로 beforeFreq에서 차감
	jokerFreq := make(map[string]int, len(jokerReturnedCodes))
	for _, code := range jokerReturnedCodes {
		jokerFreq[code]++
	}

	for code, count := range beforeFreq {
		required := count - jokerFreq[code]
		if required < 0 {
			required = 0
		}
		if afterFreq[code] < required {
			return newValidationError(ErrTableTileMissing,
				fmt.Sprintf("기존 테이블 타일 '%s'이(가) 유실되었습니다", code), code)
		}
	}
	return nil
}

// countTableTiles returns the total number of tiles across all sets.
func countTableTiles(sets []*TileSet) int {
	n := 0
	for _, ts := range sets {
		n += len(ts.Tiles)
	}
	return n
}

// collectTileCodes returns a frequency map of tile codes across all sets.
func collectTileCodes(sets []*TileSet) map[string]int {
	freq := make(map[string]int)
	for _, ts := range sets {
		for _, t := range ts.Tiles {
			freq[t.Code]++
		}
	}
	return freq
}

// newlyAddedTiles returns codes that are in rackBefore but not in rackAfter.
func newlyAddedTiles(rackBefore, rackAfter []string) []string {
	freq := make(map[string]int)
	for _, c := range rackAfter {
		freq[c]++
	}
	var added []string
	for _, c := range rackBefore {
		if freq[c] > 0 {
			freq[c]--
		} else {
			added = append(added, c)
		}
	}
	return added
}

// setIsSubsetOf reports whether every tile in ts appears in the provided
// frequency map (consumed without replacement). The map is not mutated.
func setIsSubsetOf(ts *TileSet, available map[string]int) bool {
	// Work on a local copy so the caller's map is not modified.
	local := make(map[string]int, len(available))
	for k, v := range available {
		local[k] = v
	}
	for _, t := range ts.Tiles {
		if local[t.Code] == 0 {
			return false
		}
		local[t.Code]--
	}
	return true
}
