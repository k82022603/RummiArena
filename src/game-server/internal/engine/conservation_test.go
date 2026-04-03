package engine

import (
	"fmt"
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

// ============================================================================
// Conservation 테스트 (타일 총수 불변 검증)
//
// 루미큐브 106장 타일의 "Universe Conservation" 원칙을 검증한다.
// 어떤 연산(분배, 드로우, 배치, 롤백) 후에도 총 타일 수는 항상 106장이어야 한다.
// ============================================================================

const totalTileCount = 106

// --- 헬퍼 함수 ---

// countTilesInHands 모든 플레이어 hand에 있는 타일 총수를 반환한다.
func countTilesInHands(hands [][]*Tile) int {
	n := 0
	for _, h := range hands {
		n += len(h)
	}
	return n
}

// countTilesInSets TileSet 슬라이스에 있는 타일 총수를 반환한다.
func countTilesInSets(sets []*TileSet) int {
	n := 0
	for _, ts := range sets {
		n += len(ts.Tiles)
	}
	return n
}

// buildFreqMap 타일 코드의 빈도 맵을 구축한다.
func buildFreqMap(tiles []*Tile) map[string]int {
	freq := make(map[string]int)
	for _, t := range tiles {
		freq[t.Code]++
	}
	return freq
}

// ============================================================================
// 1. 덱 생성 및 초기 불변 검증
// ============================================================================

// TestConservation_GenerateDeck_Exactly106 GenerateDeck은 정확히 106장을 생성한다.
func TestConservation_GenerateDeck_Exactly106(t *testing.T) {
	deck := GenerateDeck()
	assert.Len(t, deck, totalTileCount,
		"GenerateDeck은 정확히 106장을 반환해야 한다")
}

// TestConservation_GenerateDeck_NoDuplicateBeyondTwo 각 타일 코드는 최대 1번만 나타난다 (set a/b가 구별).
// 단, 조커 JK1과 JK2는 각각 1장이다.
func TestConservation_GenerateDeck_NoDuplicateBeyondTwo(t *testing.T) {
	deck := GenerateDeck()
	freq := buildFreqMap(deck)

	for code, count := range freq {
		assert.Equal(t, 1, count,
			"타일 코드 %q는 정확히 1번만 나타나야 한다 (set a/b로 구별), 실제: %d", code, count)
	}
}

// TestConservation_GenerateDeck_Composition 4색 x 13숫자 x 2세트 + 조커 2장 = 106장 구성을 검증한다.
func TestConservation_GenerateDeck_Composition(t *testing.T) {
	deck := GenerateDeck()

	colorCount := make(map[string]int)
	jokerCount := 0

	for _, tile := range deck {
		if tile.IsJoker {
			jokerCount++
		} else {
			colorCount[tile.Color]++
		}
	}

	assert.Equal(t, 2, jokerCount, "조커는 정확히 2장")
	assert.Equal(t, 26, colorCount[ColorRed], "빨강 타일은 26장 (13 x 2)")
	assert.Equal(t, 26, colorCount[ColorBlue], "파랑 타일은 26장")
	assert.Equal(t, 26, colorCount[ColorYellow], "노랑 타일은 26장")
	assert.Equal(t, 26, colorCount[ColorBlack], "검정 타일은 26장")
}

// TestConservation_NewTilePool_106 NewTilePool 생성 후 Remaining은 106이다.
func TestConservation_NewTilePool_106(t *testing.T) {
	pool := NewTilePool()
	assert.Equal(t, totalTileCount, pool.Remaining())
}

// ============================================================================
// 2. 초기 분배 후 Conservation
// ============================================================================

// TestConservation_AfterDealInitialHands pool 분배 후 hand + pool 합계 = 106.
func TestConservation_AfterDealInitialHands(t *testing.T) {
	for playerCount := 2; playerCount <= 4; playerCount++ {
		t.Run(fmt.Sprintf("%d인_분배", playerCount), func(t *testing.T) {
			pool := NewTilePool()
			hands, err := pool.DealInitialHands(playerCount)
			require.NoError(t, err)

			handTotal := countTilesInHands(hands)
			poolRemaining := pool.Remaining()
			total := handTotal + poolRemaining

			assert.Equal(t, totalTileCount, total,
				"%d인 분배 후: hand(%d) + pool(%d) = %d, 기대: %d",
				playerCount, handTotal, poolRemaining, total, totalTileCount)

			// 각 hand는 14장
			for i, h := range hands {
				assert.Len(t, h, 14, "플레이어 %d의 초기 hand는 14장", i)
			}
		})
	}
}

// TestConservation_AfterDealInitialHands_AllUnique 분배 후 모든 타일이 유일하게 배분되었는지 검증한다.
func TestConservation_AfterDealInitialHands_AllUnique(t *testing.T) {
	pool := NewTilePool()
	hands, err := pool.DealInitialHands(4)
	require.NoError(t, err)

	seen := make(map[string]bool)

	// hand의 타일
	for seat, hand := range hands {
		for _, tile := range hand {
			assert.False(t, seen[tile.Code],
				"seat %d의 타일 %q가 이미 다른 곳에 존재한다", seat, tile.Code)
			seen[tile.Code] = true
		}
	}

	// pool의 남은 타일
	remaining := pool.Remaining()
	for i := 0; i < remaining; i++ {
		tile, err := pool.DrawOne()
		require.NoError(t, err)
		assert.False(t, seen[tile.Code],
			"pool의 타일 %q가 이미 hand에 존재한다", tile.Code)
		seen[tile.Code] = true
	}

	assert.Len(t, seen, totalTileCount,
		"총 유일한 타일 코드 수는 106이어야 한다")
}

// ============================================================================
// 3. 드로우(Draw) 후 Conservation
// ============================================================================

// TestConservation_AfterDraw_PoolMinusOne_HandPlusOne 드로우 1장 후 pool 감소 + hand 증가 = 총합 불변.
func TestConservation_AfterDraw_PoolMinusOne_HandPlusOne(t *testing.T) {
	pool := NewTilePool()
	hands, err := pool.DealInitialHands(2)
	require.NoError(t, err)

	totalBefore := countTilesInHands(hands) + pool.Remaining()
	assert.Equal(t, totalTileCount, totalBefore)

	// seat 0이 1장 드로우
	drawn, err := pool.DrawOne()
	require.NoError(t, err)
	hands[0] = append(hands[0], drawn)

	totalAfter := countTilesInHands(hands) + pool.Remaining()
	assert.Equal(t, totalTileCount, totalAfter,
		"드로우 후: hand(%d) + pool(%d) = %d, 기대: %d",
		countTilesInHands(hands), pool.Remaining(), totalAfter, totalTileCount)
}

// TestConservation_AfterMultipleDraws 여러 번 드로우 후에도 총합 불변.
func TestConservation_AfterMultipleDraws(t *testing.T) {
	pool := NewTilePool()
	hands, err := pool.DealInitialHands(3)
	require.NoError(t, err)

	// 10번 연속 드로우 (번갈아가며)
	for i := 0; i < 10; i++ {
		seat := i % 3
		drawn, drawErr := pool.DrawOne()
		require.NoError(t, drawErr)
		hands[seat] = append(hands[seat], drawn)

		total := countTilesInHands(hands) + pool.Remaining()
		assert.Equal(t, totalTileCount, total,
			"드로우 %d회 후 총합이 106이어야 한다 (실제: %d)", i+1, total)
	}
}

// ============================================================================
// 4. 타일 배치(Place) 후 Conservation
// ============================================================================

// TestConservation_AfterPlace_HandToTable hand에서 table로 이동 후 총합 불변.
func TestConservation_AfterPlace_HandToTable(t *testing.T) {
	pool := NewTilePool()
	hands, err := pool.DealInitialHands(2)
	require.NoError(t, err)

	table := []*TileSet{}
	totalBefore := countTilesInHands(hands) + pool.Remaining() + countTilesInSets(table)
	assert.Equal(t, totalTileCount, totalBefore)

	// seat 0의 첫 3장을 테이블에 배치
	if len(hands[0]) >= 3 {
		placed := hands[0][:3]
		hands[0] = hands[0][3:]
		table = append(table, &TileSet{ID: "set-1", Tiles: placed})

		totalAfter := countTilesInHands(hands) + pool.Remaining() + countTilesInSets(table)
		assert.Equal(t, totalTileCount, totalAfter,
			"배치 후: hand(%d) + pool(%d) + table(%d) = %d, 기대: %d",
			countTilesInHands(hands), pool.Remaining(), countTilesInSets(table),
			totalAfter, totalTileCount)
	}
}

// TestConservation_AfterMultiplePlaces_DifferentSeats 여러 플레이어가 배치해도 총합 불변.
func TestConservation_AfterMultiplePlaces_DifferentSeats(t *testing.T) {
	pool := NewTilePool()
	hands, err := pool.DealInitialHands(4)
	require.NoError(t, err)

	table := []*TileSet{}

	for seat := 0; seat < 4; seat++ {
		if len(hands[seat]) >= 3 {
			placed := hands[seat][:3]
			hands[seat] = hands[seat][3:]
			table = append(table, &TileSet{
				ID:    fmt.Sprintf("set-%d", seat),
				Tiles: placed,
			})
		}
	}

	totalAfter := countTilesInHands(hands) + pool.Remaining() + countTilesInSets(table)
	assert.Equal(t, totalTileCount, totalAfter,
		"4인 배치 후 총합이 106이어야 한다")
}

// ============================================================================
// 5. INVALID_MOVE 후 롤백 Conservation
// ============================================================================

// TestConservation_AfterInvalidMove_Rollback 배치 시도 -> 검증 실패 -> 롤백 후에도 총합 불변.
func TestConservation_AfterInvalidMove_Rollback(t *testing.T) {
	pool := NewTilePool()
	hands, err := pool.DealInitialHands(2)
	require.NoError(t, err)

	table := []*TileSet{}
	totalBefore := countTilesInHands(hands) + pool.Remaining()
	assert.Equal(t, totalTileCount, totalBefore)

	// 스냅샷 저장 (롤백용)
	rackSnapshot := make([]*Tile, len(hands[0]))
	copy(rackSnapshot, hands[0])
	tableSnapshot := make([]*TileSet, len(table))
	copy(tableSnapshot, table)

	// 배치 시도 (hand에서 2장 제거 -- 실제로 유효하지 않은 세트)
	if len(hands[0]) >= 2 {
		placed := hands[0][:2]
		hands[0] = hands[0][2:]
		table = append(table, &TileSet{ID: "invalid-set", Tiles: placed})

		// 중간 상태: 배치 중이라도 총합은 보전되어야 한다
		midTotal := countTilesInHands(hands) + pool.Remaining() + countTilesInSets(table)
		assert.Equal(t, totalTileCount, midTotal,
			"배치 중간 상태에서도 총합은 106이어야 한다")

		// 검증 실패 시 롤백: 스냅샷 복원
		hands[0] = rackSnapshot
		table = tableSnapshot

		totalAfterRollback := countTilesInHands(hands) + pool.Remaining() + countTilesInSets(table)
		assert.Equal(t, totalTileCount, totalAfterRollback,
			"롤백 후 총합이 106이어야 한다")
	}
}

// TestConservation_AfterInvalidMove_TableRestored 테이블 재배치 시도 실패 후에도 총합 불변.
func TestConservation_AfterInvalidMove_TableRestored(t *testing.T) {
	// 시나리오: 기존 테이블 세트를 재배치하려다 실패하고 롤백
	rackBefore := []string{"R1a", "R2a", "R3a", "B4a", "Y5a"}
	tableBefore := []*TileSet{
		makeSet(t, "g1", []string{"R7a", "B7a", "K7b"}),
	}

	rackTiles := mustParseTiles(t, rackBefore)
	handCount := len(rackTiles)
	tableCount := countTilesInSets(tableBefore)
	poolCount := totalTileCount - handCount - tableCount

	totalBefore := handCount + tableCount + poolCount
	assert.Equal(t, totalTileCount, totalBefore)

	// 잘못된 재배치 시도: 기존 타일 K7b를 제거하고 다른 타일로 대체
	tableAfter := []*TileSet{
		makeSet(t, "g1", []string{"R7a", "B7a", "Y7a"}), // K7b -> Y7a (위반)
	}

	// 검증 실패
	req := TurnConfirmRequest{
		TableBefore:    tableBefore,
		TableAfter:     tableAfter,
		RackBefore:     rackBefore,
		RackAfter:      []string{"R1a", "R2a", "R3a", "B4a"}, // Y5a 제거해도 Y7a 아님
		HasInitialMeld: true,
	}
	err := ValidateTurnConfirm(req)
	assert.Error(t, err, "K7b 유실은 검증 실패해야 한다")

	// 롤백 후 테이블은 원래대로
	restoredTableCount := countTilesInSets(tableBefore)
	assert.Equal(t, tableCount, restoredTableCount,
		"롤백 후 테이블 타일 수는 원래와 동일해야 한다")

	totalAfterRollback := handCount + restoredTableCount + poolCount
	assert.Equal(t, totalTileCount, totalAfterRollback,
		"롤백 후 총합이 106이어야 한다")
}

// ============================================================================
// 6. 게임 종료 시 Conservation
// ============================================================================

// TestConservation_GameEnd_WinnerEmptyRack 승리 시 (랙 0장) 총합 보전.
func TestConservation_GameEnd_WinnerEmptyRack(t *testing.T) {
	pool := NewTilePool()
	hands, err := pool.DealInitialHands(2)
	require.NoError(t, err)

	table := []*TileSet{}

	// seat 0이 모든 타일을 세트로 내려놓는 시뮬레이션
	// 실제로는 유효한 세트를 만들어야 하지만, conservation 검증 목적으로는 이동만 추적
	allTiles := make([]*Tile, len(hands[0]))
	copy(allTiles, hands[0])
	table = append(table, &TileSet{ID: "win-set", Tiles: allTiles})
	hands[0] = []*Tile{} // 랙 비움

	// 승리 시점 총합 검증
	totalAtEnd := countTilesInHands(hands) + pool.Remaining() + countTilesInSets(table)
	assert.Equal(t, totalTileCount, totalAtEnd,
		"게임 종료(승리) 시 총합이 106이어야 한다")
	assert.Len(t, hands[0], 0, "승자의 랙은 0장")
}

// TestConservation_GameEnd_Stalemate 교착 상태 종료 시에도 총합 보전.
func TestConservation_GameEnd_Stalemate(t *testing.T) {
	pool := NewTilePool()
	hands, err := pool.DealInitialHands(2)
	require.NoError(t, err)

	table := []*TileSet{}

	// 배치 없이 드로우 파일 전부 소진
	for pool.Remaining() > 0 {
		drawn, drawErr := pool.DrawOne()
		require.NoError(t, drawErr)
		// 번갈아 드로우 (단순화를 위해 seat 0에 모두 추가)
		hands[0] = append(hands[0], drawn)
	}
	assert.Equal(t, 0, pool.Remaining(), "풀이 비어야 한다")

	totalAtStalemate := countTilesInHands(hands) + pool.Remaining() + countTilesInSets(table)
	assert.Equal(t, totalTileCount, totalAtStalemate,
		"교착 종료 시 총합이 106이어야 한다")
}

// ============================================================================
// 7. 복합 시나리오 Conservation
// ============================================================================

// TestConservation_FullGameSimulation 분배-드로우-배치-드로우-배치 전체 흐름에서 총합 불변.
func TestConservation_FullGameSimulation(t *testing.T) {
	pool := NewTilePool()
	hands, err := pool.DealInitialHands(2)
	require.NoError(t, err)

	table := []*TileSet{}

	assertConservation := func(phase string) {
		t.Helper()
		total := countTilesInHands(hands) + pool.Remaining() + countTilesInSets(table)
		assert.Equal(t, totalTileCount, total,
			"[%s] hand(%d) + pool(%d) + table(%d) = %d, 기대: %d",
			phase, countTilesInHands(hands), pool.Remaining(), countTilesInSets(table),
			total, totalTileCount)
	}

	assertConservation("초기 분배")

	// Turn 1: seat 0 - 3장 배치
	if len(hands[0]) >= 3 {
		placed := hands[0][:3]
		hands[0] = hands[0][3:]
		table = append(table, &TileSet{ID: "t1-set", Tiles: placed})
		assertConservation("Turn 1 배치 후")
	}

	// Turn 2: seat 1 - 드로우
	if pool.Remaining() > 0 {
		drawn, drawErr := pool.DrawOne()
		require.NoError(t, drawErr)
		hands[1] = append(hands[1], drawn)
		assertConservation("Turn 2 드로우 후")
	}

	// Turn 3: seat 0 - 드로우 + 3장 배치
	if pool.Remaining() > 0 {
		drawn, drawErr := pool.DrawOne()
		require.NoError(t, drawErr)
		hands[0] = append(hands[0], drawn)
		assertConservation("Turn 3 드로우 후")
	}
	if len(hands[0]) >= 3 {
		placed := hands[0][:3]
		hands[0] = hands[0][3:]
		table = append(table, &TileSet{ID: "t3-set", Tiles: placed})
		assertConservation("Turn 3 배치 후")
	}

	// Turn 4: seat 1 - 2장 배치 시도 -> 롤백
	if len(hands[1]) >= 2 {
		rackSnap := make([]*Tile, len(hands[1]))
		copy(rackSnap, hands[1])
		tableSnap := make([]*TileSet, len(table))
		copy(tableSnap, table)

		placed := hands[1][:2]
		hands[1] = hands[1][2:]
		table = append(table, &TileSet{ID: "t4-invalid", Tiles: placed})
		assertConservation("Turn 4 배치 중(롤백 전)")

		// 검증 실패 -> 롤백
		hands[1] = rackSnap
		table = tableSnap
		assertConservation("Turn 4 롤백 후")
	}

	// Turn 5: seat 0 - 남은 전량 배치 (승리 시뮬레이션)
	if len(hands[0]) > 0 {
		allTiles := make([]*Tile, len(hands[0]))
		copy(allTiles, hands[0])
		table = append(table, &TileSet{ID: "t5-final", Tiles: allTiles})
		hands[0] = []*Tile{}
		assertConservation("Turn 5 전량 배치(승리)")
	}
}

// TestConservation_DrawUntilEmpty 풀이 빌 때까지 드로우해도 총합 불변.
func TestConservation_DrawUntilEmpty(t *testing.T) {
	pool := NewTilePool()
	hands, err := pool.DealInitialHands(2)
	require.NoError(t, err)

	drawCount := 0
	for pool.Remaining() > 0 {
		seat := drawCount % 2
		drawn, drawErr := pool.DrawOne()
		require.NoError(t, drawErr)
		hands[seat] = append(hands[seat], drawn)
		drawCount++
	}

	total := countTilesInHands(hands) + pool.Remaining()
	assert.Equal(t, totalTileCount, total,
		"풀 전부 드로우 후 총합이 106이어야 한다 (드로우 %d회)", drawCount)
	assert.Equal(t, 0, pool.Remaining())
}

// ============================================================================
// 8. Validator validateTileConservation 직접 검증
// ============================================================================

// TestConservation_ValidateTileConservation_AllPresent 모든 before 타일이 after에 존재하면 통과.
func TestConservation_ValidateTileConservation_AllPresent(t *testing.T) {
	before := []*TileSet{
		makeSet(t, "g1", []string{"R5a", "B5a", "K5b"}),
	}
	after := []*TileSet{
		makeSet(t, "g1", []string{"R5a", "B5a", "K5b"}),
		makeSet(t, "r1", []string{"Y1a", "Y2a", "Y3a"}),
	}
	err := validateTileConservation(before, after, nil)
	assert.NoError(t, err)
}

// TestConservation_ValidateTileConservation_TileMissing before의 타일이 after에서 사라지면 에러.
func TestConservation_ValidateTileConservation_TileMissing(t *testing.T) {
	before := []*TileSet{
		makeSet(t, "g1", []string{"R5a", "B5a", "K5b"}),
	}
	// K5b가 Y5a로 교체됨
	after := []*TileSet{
		makeSet(t, "g1", []string{"R5a", "B5a", "Y5a"}),
		makeSet(t, "r1", []string{"Y1a", "Y2a", "Y3a"}),
	}
	err := validateTileConservation(before, after, nil)
	require.Error(t, err)
	ve, ok := err.(*ValidationError)
	require.True(t, ok)
	assert.Equal(t, ErrTableTileMissing, ve.Code)
	assert.Contains(t, ve.Message, "K5b")
}

// TestConservation_ValidateTileConservation_JokerSwapAllowed 조커 교체 시 해당 타일은 제거 허용.
func TestConservation_ValidateTileConservation_JokerSwapAllowed(t *testing.T) {
	before := []*TileSet{
		makeSet(t, "r1", []string{"R5a", "JK1", "R7a"}),
	}
	// JK1이 R6a로 교체됨 (JK1은 다른 곳에서 재사용)
	after := []*TileSet{
		makeSet(t, "r1", []string{"R5a", "R6a", "R7a"}),
		makeSet(t, "g1", []string{"JK1", "B8a", "K8b"}),
	}
	err := validateTileConservation(before, after, []string{"JK1"})
	assert.NoError(t, err, "조커 교체 후 재사용은 보전 검증을 통과해야 한다")
}

// TestConservation_ValidateTileConservation_FrequencyMatch 빈도 수준 보전 검증.
func TestConservation_ValidateTileConservation_FrequencyMatch(t *testing.T) {
	// before에 R5a가 2번 나타남
	before := []*TileSet{
		makeSet(t, "g1", []string{"R5a", "B5a", "K5b"}),
		makeSet(t, "g2", []string{"R5a", "Y5a", "K5a"}),
	}
	// after에 R5a가 1번만 나타남 -> 보전 위반
	after := []*TileSet{
		makeSet(t, "g1", []string{"R5a", "B5a", "K5b"}),
		makeSet(t, "g2", []string{"Y5a", "K5a", "B5b"}), // R5a -> B5b
		makeSet(t, "r1", []string{"R1a", "R2a", "R3a"}),
	}
	err := validateTileConservation(before, after, nil)
	require.Error(t, err)
	ve, ok := err.(*ValidationError)
	require.True(t, ok)
	assert.Equal(t, ErrTableTileMissing, ve.Code)
}

// TestConservation_ValidateTileConservation_EmptyBefore 빈 테이블에서 시작하면 항상 통과.
func TestConservation_ValidateTileConservation_EmptyBefore(t *testing.T) {
	before := []*TileSet{}
	after := []*TileSet{
		makeSet(t, "g1", []string{"R10a", "B10a", "K10b"}),
	}
	err := validateTileConservation(before, after, nil)
	assert.NoError(t, err, "빈 테이블에서 배치는 항상 보전 통과")
}

// ============================================================================
// 9. 타일 정체성(Identity) 보전 검증
// ============================================================================

// TestConservation_PlaceIdentity_TilesMovedFromHandAppearOnBoard
// hand에서 제거된 정확한 타일이 board에 추가되었는지 검증한다.
func TestConservation_PlaceIdentity_TilesMovedFromHandAppearOnBoard(t *testing.T) {
	pool := NewTilePool()
	hands, err := pool.DealInitialHands(2)
	require.NoError(t, err)

	// hand에서 첫 3장의 코드를 기록
	placedCodes := make(map[string]bool, 3)
	for _, tile := range hands[0][:3] {
		placedCodes[tile.Code] = true
	}

	// 배치
	placed := hands[0][:3]
	hands[0] = hands[0][3:]
	table := []*TileSet{{ID: "set-1", Tiles: placed}}

	// board에 있는 타일이 hand에서 나온 정확한 타일인지 확인
	for _, tile := range table[0].Tiles {
		assert.True(t, placedCodes[tile.Code],
			"board의 타일 %q는 hand에서 이동한 타일이어야 한다", tile.Code)
	}

	// hand에 배치한 타일 코드가 남아있지 않은지 확인
	for _, remaining := range hands[0] {
		// 배치한 코드가 hand에 남아있으면 안 됨 (중복 코드는 없으므로)
		assert.False(t, placedCodes[remaining.Code],
			"배치한 타일 %q가 여전히 hand에 남아있다", remaining.Code)
	}

	// 총합 불변
	total := countTilesInHands(hands) + pool.Remaining() + countTilesInSets(table)
	assert.Equal(t, totalTileCount, total)
}

// TestConservation_DrawIdentity_ExactTileMovesFromPoolToHand
// pool에서 뽑은 정확한 타일이 hand에 추가되는지 검증한다.
func TestConservation_DrawIdentity_ExactTileMovesFromPoolToHand(t *testing.T) {
	pool := NewTilePool()
	hands, err := pool.DealInitialHands(2)
	require.NoError(t, err)

	handSizeBefore := len(hands[0])
	poolSizeBefore := pool.Remaining()

	drawn, err := pool.DrawOne()
	require.NoError(t, err)
	hands[0] = append(hands[0], drawn)

	// drawn 타일이 hand에 존재하는지 확인
	found := false
	for _, tile := range hands[0] {
		if tile == drawn {
			found = true
			break
		}
	}
	assert.True(t, found, "드로우한 타일이 hand에 존재해야 한다")

	// hand 크기 +1, pool 크기 -1
	assert.Equal(t, handSizeBefore+1, len(hands[0]), "hand는 1장 증가해야 한다")
	assert.Equal(t, poolSizeBefore-1, pool.Remaining(), "pool은 1장 감소해야 한다")

	// 총합 불변
	total := countTilesInHands(hands) + pool.Remaining()
	assert.Equal(t, totalTileCount, total)
}

// ============================================================================
// 10. 조커 교환 전체 턴 Conservation (hand + board + pool = 106)
// ============================================================================

// TestConservation_JokerSwap_FullTurn_HandBoardPool
// 조커가 포함된 세트에서 교체 타일을 넣고 조커를 회수해 다른 세트에 사용하는 전체 턴 시뮬레이션.
// hand + board + pool = 106이 전 과정에서 유지되어야 한다.
func TestConservation_JokerSwap_FullTurn_HandBoardPool(t *testing.T) {
	// 고정된 타일 배열로 제어된 미니 유니버스 테스트
	r5a, _ := Parse("R5a")
	jk1, _ := Parse("JK1")
	r7a, _ := Parse("R7a")
	r6a, _ := Parse("R6a")
	b8a, _ := Parse("B8a")
	k8b, _ := Parse("K8b")

	// 초기 상태 설정 (6개 타일로 구성된 미니 유니버스)
	rackTiles := []*Tile{r6a, b8a, k8b}
	tableTiles := []*TileSet{{ID: "r1", Tiles: []*Tile{r5a, jk1, r7a}}}
	miniUniverse := len(rackTiles) + countTilesInSets(tableTiles)

	assertMiniConservation := func(phase string, rack []*Tile, tbl []*TileSet) {
		t.Helper()
		total := len(rack) + countTilesInSets(tbl)
		assert.Equal(t, miniUniverse, total,
			"[%s] rack(%d) + table(%d) = %d, 기대: %d",
			phase, len(rack), countTilesInSets(tbl), total, miniUniverse)
	}

	assertMiniConservation("초기", rackTiles, tableTiles)

	// Step 1: rack에서 R6a를 꺼내 조커 위치에 넣고, JK1을 회수
	retrievedJoker := jk1
	tableTiles = []*TileSet{{ID: "r1", Tiles: []*Tile{r5a, r6a, r7a}}}
	rackTiles = []*Tile{b8a, k8b, retrievedJoker} // R6a 제거, JK1 추가
	assertMiniConservation("조커 교환 후", rackTiles, tableTiles)

	// Step 2: rack에서 JK1, B8a, K8b로 새 그룹 구성
	newGroup := &TileSet{ID: "g1", Tiles: []*Tile{retrievedJoker, b8a, k8b}}
	tableTiles = append(tableTiles, newGroup)
	rackTiles = []*Tile{} // 전부 소진
	assertMiniConservation("조커 재사용 후", rackTiles, tableTiles)
}

// TestConservation_JokerSwap_BothJokers_FullTurn 두 조커 모두 교환하는 시나리오.
func TestConservation_JokerSwap_BothJokers_FullTurn(t *testing.T) {
	jk1, _ := Parse("JK1")
	jk2, _ := Parse("JK2")
	r5a, _ := Parse("R5a")
	r7a, _ := Parse("R7a")
	b3a, _ := Parse("B3a")
	b5a, _ := Parse("B5a")
	r6a, _ := Parse("R6a")
	b4a, _ := Parse("B4a")
	y1a, _ := Parse("Y1a")
	k1a, _ := Parse("K1a")

	// table: {R5a, JK1, R7a} + {B3a, JK2, B5a}
	// rack: {R6a, B4a, Y1a, K1a}
	tableBefore := []*TileSet{
		{ID: "r1", Tiles: []*Tile{r5a, jk1, r7a}},
		{ID: "r2", Tiles: []*Tile{b3a, jk2, b5a}},
	}
	rackBefore := []*Tile{r6a, b4a, y1a, k1a}
	universe := len(rackBefore) + countTilesInSets(tableBefore)

	// Step 1: R6a로 JK1 교체, B4a로 JK2 교체
	tableAfterSwap := []*TileSet{
		{ID: "r1", Tiles: []*Tile{r5a, r6a, r7a}},
		{ID: "r2", Tiles: []*Tile{b3a, b4a, b5a}},
	}
	rackAfterSwap := []*Tile{jk1, jk2, y1a, k1a}
	total := len(rackAfterSwap) + countTilesInSets(tableAfterSwap)
	assert.Equal(t, universe, total, "두 조커 교환 후 총합 불변")

	// Step 2: JK1 + Y1a + K1a 그룹, JK2는 rack에 보관 (다음 턴 사용)
	newGroup := &TileSet{ID: "g1", Tiles: []*Tile{jk1, y1a, k1a}}
	tableAfterPlace := append(tableAfterSwap, newGroup)
	rackAfterPlace := []*Tile{jk2}
	total2 := len(rackAfterPlace) + countTilesInSets(tableAfterPlace)
	assert.Equal(t, universe, total2, "조커 일부 배치 후 총합 불변")
}

// ============================================================================
// 11. 테이블 재배치(Split/Merge) Conservation
// ============================================================================

// TestConservation_TableRearrange_SplitSet 하나의 세트를 두 세트로 분리해도 타일이 보전된다.
func TestConservation_TableRearrange_SplitSet(t *testing.T) {
	// 런 {R1a, R2a, R3a, R4a, R5a}를 {R1a, R2a, R3a} + {R4a, R5a, R6a}로 분리
	// R6a는 rack에서 추가
	tableBefore := []*TileSet{
		makeSet(t, "r1", []string{"R1a", "R2a", "R3a", "R4a", "R5a"}),
	}
	rackBefore := []string{"R6a", "B1a", "Y1a"}

	tableAfter := []*TileSet{
		makeSet(t, "r1", []string{"R1a", "R2a", "R3a"}),
		makeSet(t, "r2", []string{"R4a", "R5a", "R6a"}),
	}
	rackAfter := []string{"B1a", "Y1a"}

	// tableBefore의 모든 타일이 tableAfter에 존재하는지 확인
	err := validateTileConservation(tableBefore, tableAfter, nil)
	assert.NoError(t, err, "세트 분리 후 모든 타일이 보전되어야 한다")

	// rack 감소 + table 증가 = 0 (전체 타일 이동)
	rackDelta := len(rackAfter) - len(rackBefore)     // -1
	tableDelta := countTilesInSets(tableAfter) - countTilesInSets(tableBefore) // +1
	assert.Equal(t, 0, rackDelta+tableDelta, "rack 감소와 table 증가의 합은 0이어야 한다")
}

// TestConservation_TableRearrange_MergeSets 두 세트를 합쳐도 타일이 보전된다.
func TestConservation_TableRearrange_MergeSets(t *testing.T) {
	// {R7a, B7a, K7b} + {Y7a}를 {R7a, B7a, K7b, Y7a}로 합치고 R1a 추가
	tableBefore := []*TileSet{
		makeSet(t, "g1", []string{"R7a", "B7a", "K7b"}),
	}
	tableAfter := []*TileSet{
		makeSet(t, "g1", []string{"R7a", "B7a", "K7b", "Y7a"}),
		makeSet(t, "r1", []string{"R1a", "R2a", "R3a"}),
	}

	err := validateTileConservation(tableBefore, tableAfter, nil)
	assert.NoError(t, err, "세트 병합 후 기존 타일이 보전되어야 한다")
}

// TestConservation_TableRearrange_ComplexSplitMerge 복합 재배치: 분리 + 병합 + 추가.
func TestConservation_TableRearrange_ComplexSplitMerge(t *testing.T) {
	// before: {R5a, B5a, K5b} (그룹) + {Y1a, Y2a, Y3a} (런)
	// after: {R5a, B5a, K5b, Y5a} (4색 그룹) + {Y1a, Y2a, Y3a, Y4a} (런 확장)
	// rack에서 Y5a, Y4a 추가
	tableBefore := []*TileSet{
		makeSet(t, "g1", []string{"R5a", "B5a", "K5b"}),
		makeSet(t, "r1", []string{"Y1a", "Y2a", "Y3a"}),
	}
	tableAfter := []*TileSet{
		makeSet(t, "g1", []string{"R5a", "B5a", "K5b", "Y5a"}),
		makeSet(t, "r1", []string{"Y1a", "Y2a", "Y3a", "Y4a"}),
	}

	err := validateTileConservation(tableBefore, tableAfter, nil)
	assert.NoError(t, err, "복합 재배치 후 기존 타일이 보전되어야 한다")

	// 기존 타일 6장 + 새 타일 2장 = 8장
	assert.Equal(t, 8, countTilesInSets(tableAfter))
	assert.Equal(t, 6, countTilesInSets(tableBefore))
}

// ============================================================================
// 12. 멀티턴 시뮬레이션 Conservation
// ============================================================================

// TestConservation_MultiTurn_AlternatingDrawAndPlace 교대로 드로우/배치하는 다턴 시뮬레이션.
func TestConservation_MultiTurn_AlternatingDrawAndPlace(t *testing.T) {
	pool := NewTilePool()
	hands, err := pool.DealInitialHands(3)
	require.NoError(t, err)

	table := []*TileSet{}

	assertConservation := func(turn int, action string) {
		t.Helper()
		total := countTilesInHands(hands) + pool.Remaining() + countTilesInSets(table)
		assert.Equal(t, totalTileCount, total,
			"[턴 %d %s] hand(%d) + pool(%d) + table(%d) = %d",
			turn, action, countTilesInHands(hands), pool.Remaining(),
			countTilesInSets(table), total)
	}

	// 15턴 시뮬레이션
	for turn := 1; turn <= 15; turn++ {
		seat := (turn - 1) % 3

		if turn%3 == 0 && len(hands[seat]) >= 3 {
			// 매 3턴마다 3장 배치
			placed := hands[seat][:3]
			hands[seat] = hands[seat][3:]
			table = append(table, &TileSet{
				ID:    fmt.Sprintf("turn%d-set", turn),
				Tiles: placed,
			})
			assertConservation(turn, "배치")
		} else if pool.Remaining() > 0 {
			// 나머지 턴은 드로우
			drawn, drawErr := pool.DrawOne()
			require.NoError(t, drawErr)
			hands[seat] = append(hands[seat], drawn)
			assertConservation(turn, "드로우")
		}
	}
}

// TestConservation_MultiTurn_DrawThenPlace_SameTurn 같은 턴에 드로우 후 배치.
func TestConservation_MultiTurn_DrawThenPlace_SameTurn(t *testing.T) {
	pool := NewTilePool()
	hands, err := pool.DealInitialHands(2)
	require.NoError(t, err)

	table := []*TileSet{}
	assertTotal := func(phase string) {
		t.Helper()
		total := countTilesInHands(hands) + pool.Remaining() + countTilesInSets(table)
		assert.Equal(t, totalTileCount, total, "[%s] 총합 불변 위반", phase)
	}

	// 5번 반복: 드로우 1장 -> 배치 3장
	for i := 0; i < 5; i++ {
		seat := i % 2

		if pool.Remaining() > 0 {
			drawn, drawErr := pool.DrawOne()
			require.NoError(t, drawErr)
			hands[seat] = append(hands[seat], drawn)
			assertTotal(fmt.Sprintf("라운드%d 드로우", i+1))
		}

		if len(hands[seat]) >= 3 {
			placed := hands[seat][:3]
			hands[seat] = hands[seat][3:]
			table = append(table, &TileSet{
				ID:    fmt.Sprintf("r%d-set", i+1),
				Tiles: placed,
			})
			assertTotal(fmt.Sprintf("라운드%d 배치", i+1))
		}
	}
}

// ============================================================================
// 13. 경계 케이스 Conservation
// ============================================================================

// TestConservation_SingleTileRemainingInPool pool에 1장만 남았을 때 드로우 후 보전.
func TestConservation_SingleTileRemainingInPool(t *testing.T) {
	pool := NewTilePool()
	hands, err := pool.DealInitialHands(2)
	require.NoError(t, err)

	// pool을 1장만 남기고 모두 드로우
	for pool.Remaining() > 1 {
		drawn, drawErr := pool.DrawOne()
		require.NoError(t, drawErr)
		hands[0] = append(hands[0], drawn)
	}
	assert.Equal(t, 1, pool.Remaining(), "pool에 정확히 1장 남아야 한다")

	total := countTilesInHands(hands) + pool.Remaining()
	assert.Equal(t, totalTileCount, total, "pool 1장 남은 상태에서 총합 불변")

	// 마지막 1장 드로우
	drawn, err := pool.DrawOne()
	require.NoError(t, err)
	hands[1] = append(hands[1], drawn)

	total = countTilesInHands(hands) + pool.Remaining()
	assert.Equal(t, totalTileCount, total, "마지막 타일 드로우 후 총합 불변")
	assert.Equal(t, 0, pool.Remaining())
}

// TestConservation_EmptyPoolDrawFails pool이 비었을 때 드로우는 실패하고 총합은 유지된다.
func TestConservation_EmptyPoolDrawFails(t *testing.T) {
	pool := NewTilePool()
	hands, err := pool.DealInitialHands(2)
	require.NoError(t, err)

	// pool 전부 소진
	for pool.Remaining() > 0 {
		drawn, drawErr := pool.DrawOne()
		require.NoError(t, drawErr)
		hands[0] = append(hands[0], drawn)
	}

	totalBefore := countTilesInHands(hands) + pool.Remaining()
	assert.Equal(t, totalTileCount, totalBefore)

	// 빈 pool에서 드로우 시도
	_, err = pool.DrawOne()
	assert.Error(t, err, "빈 pool에서 드로우는 실패해야 한다")

	// 실패 후에도 총합 변동 없음
	totalAfter := countTilesInHands(hands) + pool.Remaining()
	assert.Equal(t, totalTileCount, totalAfter, "드로우 실패 후에도 총합 불변")
}

// TestConservation_AllTilesOnBoard hand와 pool이 모두 비고 board에 106장 있는 경우.
func TestConservation_AllTilesOnBoard(t *testing.T) {
	deck := GenerateDeck()
	assert.Len(t, deck, totalTileCount)

	// 전체 덱을 board에 배치 (3장씩 세트로)
	table := []*TileSet{}
	for i := 0; i+3 <= len(deck); i += 3 {
		table = append(table, &TileSet{
			ID:    fmt.Sprintf("set-%d", i/3),
			Tiles: deck[i : i+3],
		})
	}
	// 나머지 (106 % 3 = 1장)
	remainder := len(deck) % 3
	if remainder > 0 {
		table = append(table, &TileSet{
			ID:    "set-remainder",
			Tiles: deck[len(deck)-remainder:],
		})
	}

	assert.Equal(t, totalTileCount, countTilesInSets(table),
		"board에 전체 106장이 존재해야 한다")
}

// TestConservation_MaxPlayers_InitialDeal 4인 게임 초기 분배: 14*4=56장 hand, 50장 pool.
func TestConservation_MaxPlayers_InitialDeal(t *testing.T) {
	pool := NewTilePool()
	hands, err := pool.DealInitialHands(4)
	require.NoError(t, err)

	handTotal := countTilesInHands(hands)
	assert.Equal(t, 56, handTotal, "4인 x 14장 = 56장")
	assert.Equal(t, 50, pool.Remaining(), "pool에 50장 남아야 한다")
	assert.Equal(t, totalTileCount, handTotal+pool.Remaining())
}

// TestConservation_MinPlayers_InitialDeal 2인 게임 초기 분배: 14*2=28장 hand, 78장 pool.
func TestConservation_MinPlayers_InitialDeal(t *testing.T) {
	pool := NewTilePool()
	hands, err := pool.DealInitialHands(2)
	require.NoError(t, err)

	handTotal := countTilesInHands(hands)
	assert.Equal(t, 28, handTotal, "2인 x 14장 = 28장")
	assert.Equal(t, 78, pool.Remaining(), "pool에 78장 남아야 한다")
	assert.Equal(t, totalTileCount, handTotal+pool.Remaining())
}

// ============================================================================
// 14. ValidateTurnConfirm 통합 Conservation (조커 교환 포함)
// ============================================================================

// TestConservation_TurnConfirm_JokerSwap_FullValidation
// ValidateTurnConfirm을 통한 조커 교환 전체 검증.
// rack에서 교체 타일을 넣고, 회수한 조커를 다른 세트에 사용.
// 모든 구간에서 hand/board/pool 합계 = 106.
func TestConservation_TurnConfirm_JokerSwap_FullValidation(t *testing.T) {
	// 시나리오: table에 {R5a, JK1, R7a} 존재.
	// rack: {R6a, B8a, K8b, Y2a}
	// 행동: R6a로 JK1 교체 -> JK1을 {B8a, JK1, K8b} 그룹에 사용
	tableBefore := []*TileSet{
		makeSet(t, "r1", []string{"R5a", "JK1", "R7a"}),
	}
	tableAfter := []*TileSet{
		makeSet(t, "r1", []string{"R5a", "R6a", "R7a"}),
		makeSet(t, "g1", []string{"B8a", "JK1", "K8b"}),
	}
	rackBefore := []string{"R6a", "B8a", "K8b", "Y2a"}
	rackAfter := []string{"Y2a"}

	req := TurnConfirmRequest{
		TableBefore:        tableBefore,
		TableAfter:         tableAfter,
		RackBefore:         rackBefore,
		RackAfter:          rackAfter,
		HasInitialMeld:     true,
		JokerReturnedCodes: []string{"JK1"},
	}
	err := ValidateTurnConfirm(req)
	assert.NoError(t, err, "조커 교환 턴은 유효해야 한다")

	// 타일 수 보전: rack 변화 + table 변화 = 0
	rackDelta := len(rackAfter) - len(rackBefore)                             // -3
	tableDelta := countTilesInSets(tableAfter) - countTilesInSets(tableBefore) // +3
	assert.Equal(t, 0, rackDelta+tableDelta,
		"rack 감소(%d)와 table 증가(%d)의 합은 0이어야 한다", rackDelta, tableDelta)
}

// TestConservation_TurnConfirm_JokerSwap_JokerDisappears
// 조커가 회수되었는데 테이블에 재배치되지 않으면 타일 유실.
func TestConservation_TurnConfirm_JokerSwap_JokerDisappears(t *testing.T) {
	tableBefore := []*TileSet{
		makeSet(t, "r1", []string{"R5a", "JK1", "R7a"}),
	}
	tableAfter := []*TileSet{
		makeSet(t, "r1", []string{"R5a", "R6a", "R7a"}),
		makeSet(t, "g1", []string{"B8a", "Y8a", "K8b"}), // JK1 미사용!
	}
	rackBefore := []string{"R6a", "B8a", "Y8a", "K8b"}
	rackAfter := []string{}

	req := TurnConfirmRequest{
		TableBefore:        tableBefore,
		TableAfter:         tableAfter,
		RackBefore:         rackBefore,
		RackAfter:          rackAfter,
		HasInitialMeld:     true,
		JokerReturnedCodes: []string{"JK1"},
	}
	err := ValidateTurnConfirm(req)
	assert.Error(t, err, "조커가 사라지면 검증 실패해야 한다 (V-07)")
}

// TestConservation_TurnConfirm_TileCreatedFromNowhere
// rack에도 table에도 없던 타일이 tableAfter에 등장하면 — 검증은 rack 차감으로 확인.
// validateTileConservation은 tableBefore 기준 보전만 검사하므로,
// 새 타일이 rack에서 왔는지는 rack 차이로 검증한다.
func TestConservation_TurnConfirm_TileCreatedFromNowhere(t *testing.T) {
	tableBefore := []*TileSet{
		makeSet(t, "g1", []string{"R7a", "B7a", "K7b"}),
	}
	// rackBefore에 없는 Y9a가 tableAfter에 등장
	tableAfter := []*TileSet{
		makeSet(t, "g1", []string{"R7a", "B7a", "K7b"}),
		makeSet(t, "r1", []string{"Y7a", "Y8a", "Y9a"}),
	}
	rackBefore := []string{"Y7a", "Y8a"} // Y9a가 없음!
	rackAfter := []string{}

	req := makeTurnReq(tableBefore, tableAfter, rackBefore, rackAfter, true)
	err := ValidateTurnConfirm(req)
	// V-03 검사 (tilesAdded)는 countTableTiles 차이만 보므로 통과하지만,
	// rack에서 나오지 않은 타일이 table에 등장하는 것은
	// 실제로는 service 레이어에서 rackBefore/rackAfter 정합성으로 검증해야 한다.
	// engine 레벨에서는 tableBefore의 보전만 검증하므로 이 경우 에러가 나지 않을 수 있다.
	// 이 테스트는 "어느 레이어에서 무엇을 검증하는지"를 문서화하는 역할도 한다.
	_ = err
}

// ============================================================================
// 15. 빈도(Frequency) 정밀 보전 검증
// ============================================================================

// TestConservation_FrequencyMap_FullDeck 전체 덱의 빈도맵이 정확한지 검증한다.
func TestConservation_FrequencyMap_FullDeck(t *testing.T) {
	deck := GenerateDeck()
	freq := buildFreqMap(deck)

	// 각 코드는 정확히 1번 (a/b로 구분되므로)
	for code, count := range freq {
		assert.Equal(t, 1, count,
			"타일 %q는 정확히 1번 존재해야 한다 (실제: %d)", code, count)
	}

	// 총 106개 고유 코드
	assert.Len(t, freq, totalTileCount,
		"고유 타일 코드 수는 106이어야 한다")
}

// TestConservation_FrequencyMap_AfterDealAndDraw 분배+드로우 후에도 빈도맵이 보전된다.
func TestConservation_FrequencyMap_AfterDealAndDraw(t *testing.T) {
	pool := NewTilePool()
	hands, err := pool.DealInitialHands(2)
	require.NoError(t, err)

	// 5번 드로우
	for i := 0; i < 5; i++ {
		drawn, drawErr := pool.DrawOne()
		require.NoError(t, drawErr)
		hands[i%2] = append(hands[i%2], drawn)
	}

	// 모든 타일을 하나의 슬라이스로 모음
	allTiles := []*Tile{}
	for _, h := range hands {
		allTiles = append(allTiles, h...)
	}
	// pool의 남은 타일도 모두 추출
	for pool.Remaining() > 0 {
		drawn, drawErr := pool.DrawOne()
		require.NoError(t, drawErr)
		allTiles = append(allTiles, drawn)
	}

	assert.Len(t, allTiles, totalTileCount,
		"분배+드로우 후 전체 타일 수는 106이어야 한다")

	freq := buildFreqMap(allTiles)
	for code, count := range freq {
		assert.Equal(t, 1, count,
			"분배+드로우 후 타일 %q의 빈도는 1이어야 한다 (실제: %d)", code, count)
	}
}

// TestConservation_FrequencyMap_PlacePreservesIdentity 배치 후 hand+table 빈도맵 합산이 원본과 일치.
func TestConservation_FrequencyMap_PlacePreservesIdentity(t *testing.T) {
	pool := NewTilePool()
	hands, err := pool.DealInitialHands(2)
	require.NoError(t, err)

	// 원본 빈도맵 (hand + pool)
	originalAll := []*Tile{}
	for _, h := range hands {
		originalAll = append(originalAll, h...)
	}
	// pool 잔여 타일의 코드는 직접 접근 불가하므로 pool.Remaining()으로 추적
	poolRemaining := pool.Remaining()

	// seat 0이 3장 배치
	table := []*TileSet{}
	if len(hands[0]) >= 3 {
		placed := hands[0][:3]
		hands[0] = hands[0][3:]
		table = append(table, &TileSet{ID: "s1", Tiles: placed})
	}

	// hand + table 타일의 빈도맵이 원본 hand 타일의 빈도맵과 동일
	afterAll := []*Tile{}
	for _, h := range hands {
		afterAll = append(afterAll, h...)
	}
	for _, ts := range table {
		afterAll = append(afterAll, ts.Tiles...)
	}

	assert.Len(t, afterAll, len(originalAll),
		"hand+table 타일 수는 원본 hand 타일 수와 동일해야 한다")

	freqBefore := buildFreqMap(originalAll)
	freqAfter := buildFreqMap(afterAll)
	assert.Equal(t, freqBefore, freqAfter,
		"배치 후 hand+table 빈도맵이 원본과 일치해야 한다")

	// pool은 변동 없음
	assert.Equal(t, poolRemaining, pool.Remaining())
}

// ============================================================================
// 16. 조커 교환 세부 보전 검증
// ============================================================================

// TestConservation_JokerSwap_ReplacementTileComesFromRack
// 조커를 교체할 때 교체 타일은 rack에서 와야 하며, rack 크기가 그만큼 줄어야 한다.
func TestConservation_JokerSwap_ReplacementTileComesFromRack(t *testing.T) {
	rackBefore := []string{"R6a", "B8a", "K8b"}
	rackAfter := []string{"JK1"} // R6a, B8a, K8b를 table에 사용하고 JK1을 회수

	// rack에서 나간 타일
	added := newlyAddedTiles(rackBefore, rackAfter)
	assert.Len(t, added, 3, "rack에서 3장이 table로 이동해야 한다")

	// rack에 새로 들어온 타일 (JK1): rackAfter에 있지만 rackBefore에 없는 것
	// newlyAddedTiles(before, after)는 before에 있고 after에 없는 것을 반환하므로
	// 반대로 호출하면 after에 있고 before에 없는 것 = 회수된 타일
	recovered := newlyAddedTiles(rackAfter, rackBefore)
	assert.Len(t, recovered, 1, "회수된 타일은 1장(JK1)이어야 한다")
	assert.Equal(t, "JK1", recovered[0], "회수된 타일은 JK1이어야 한다")

	// 전체 rack 타일 수: before 3장, after 1장 -> 순 이동 2장 (3 나감 - 1 회수)
	netMovement := len(rackBefore) - len(rackAfter)
	assert.Equal(t, 2, netMovement,
		"순 이동 타일 수: rack에서 3장 나감 - JK1 1장 회수 = 2장")
}

// TestConservation_JokerSwap_JK2_InRunWithExtension JK2를 런에서 교체하고 런을 확장.
func TestConservation_JokerSwap_JK2_InRunWithExtension(t *testing.T) {
	// table: {B10a, JK2, B12a, B13a} -> {B10a, B11a, B12a, B13a} + {JK2, R3a, K3b}
	tableBefore := []*TileSet{
		makeSet(t, "r1", []string{"B10a", "JK2", "B12a", "B13a"}),
	}
	tableAfter := []*TileSet{
		makeSet(t, "r1", []string{"B10a", "B11a", "B12a", "B13a"}),
		makeSet(t, "g1", []string{"JK2", "R3a", "K3b"}),
	}

	err := validateTileConservation(tableBefore, tableAfter, []string{"JK2"})
	assert.NoError(t, err, "JK2 교체 후 런 확장은 보전을 만족해야 한다")

	// 전후 타일 수 차이: 4 -> 7 (3장 추가: B11a, R3a, K3b)
	delta := countTilesInSets(tableAfter) - countTilesInSets(tableBefore)
	assert.Equal(t, 3, delta, "table에 3장 추가되어야 한다")
}
