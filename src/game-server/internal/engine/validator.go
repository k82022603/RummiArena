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
		return SetTypeUnknown, fmt.Errorf("set %q has fewer than 3 tiles", ts.ID)
	}

	groupErr := ValidateGroup(ts.Tiles)
	if groupErr == nil {
		return SetTypeGroup, nil
	}

	runErr := ValidateRun(ts.Tiles)
	if runErr == nil {
		return SetTypeRun, nil
	}

	return SetTypeUnknown, fmt.Errorf("set %q is neither a valid group (%v) nor a valid run (%v)",
		ts.ID, groupErr, runErr)
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
		return fmt.Errorf("V-03: no rack tile was added to the table")
	}

	// V-06: tile count on table must not decrease (tiles cannot return to rack,
	// except jokers retrieved via swap — those are already accounted for
	// because joker-swap adds the replacement tile and the joker moves elsewhere).
	if countTableTiles(req.TableAfter) < countTableTiles(req.TableBefore) {
		return fmt.Errorf("V-06: table tile count decreased; tiles may not be taken back to the rack")
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

	return nil
}

// validateInitialMeld enforces V-04 and V-05.
func validateInitialMeld(req TurnConfirmRequest) error {
	// V-05: table-before tiles must still be intact and unmoved.
	beforeCodes := collectTileCodes(req.TableBefore)
	afterCodes := collectTileCodes(req.TableAfter)

	for code := range beforeCodes {
		if afterCodes[code] < beforeCodes[code] {
			return fmt.Errorf("V-05: initial meld may not rearrange existing table tiles (missing %q)", code)
		}
	}

	// V-04: the newly added tiles must sum to >= 30 points.
	addedTiles := newlyAddedTiles(req.RackBefore, req.RackAfter)
	score := 0
	for _, code := range addedTiles {
		t, err := Parse(code)
		if err != nil {
			return fmt.Errorf("V-04: cannot parse tile %q: %w", code, err)
		}
		score += t.Score()
	}
	if score < 30 {
		return fmt.Errorf("V-04: initial meld score %d is below the required 30 points", score)
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
			return fmt.Errorf("V-07: joker %q was retrieved this turn but not placed back on the table", joker)
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
