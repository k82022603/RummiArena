package engine

import (
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

// ─── 헬퍼 함수 ─────────────────────────────────────────────────────────────────

// makeSet 테스트용 TileSet을 생성하는 헬퍼.
func makeSet(t *testing.T, id string, codes []string) *TileSet {
	t.Helper()
	tiles, err := ParseAll(codes)
	require.NoError(t, err)
	return &TileSet{ID: id, Tiles: tiles}
}

// makeTurnReq 기본 TurnConfirmRequest를 빌드하는 헬퍼.
func makeTurnReq(
	tableBefore, tableAfter []*TileSet,
	rackBefore, rackAfter []string,
	hasInitialMeld bool,
) TurnConfirmRequest {
	return TurnConfirmRequest{
		TableBefore:    tableBefore,
		TableAfter:     tableAfter,
		RackBefore:     rackBefore,
		RackAfter:      rackAfter,
		HasInitialMeld: hasInitialMeld,
	}
}

// ─── ValidateTileSet 테스트 ────────────────────────────────────────────────────

// TestValidateTileSet_DetectsGroup 그룹을 올바르게 감지하는지 검증한다.
func TestValidateTileSet_DetectsGroup(t *testing.T) {
	ts := makeSet(t, "g1", []string{"R7a", "B7a", "K7b"})
	setType, err := ValidateTileSet(ts)
	require.NoError(t, err)
	assert.Equal(t, SetTypeGroup, setType)
}

// TestValidateTileSet_DetectsRun 런을 올바르게 감지하는지 검증한다.
func TestValidateTileSet_DetectsRun(t *testing.T) {
	ts := makeSet(t, "r1", []string{"Y3a", "Y4a", "Y5a"})
	setType, err := ValidateTileSet(ts)
	require.NoError(t, err)
	assert.Equal(t, SetTypeRun, setType)
}

// TestValidateTileSet_InvalidSet 그룹도 런도 아닌 세트는 에러를 반환한다.
func TestValidateTileSet_InvalidSet(t *testing.T) {
	// R7a, B8a, K9a — 색상도 다르고 숫자도 다르고 런도 아닌 혼합
	ts := makeSet(t, "invalid", []string{"R7a", "B8a", "K9a"})
	setType, err := ValidateTileSet(ts)
	assert.Error(t, err)
	assert.Equal(t, SetTypeUnknown, setType)
}

// TestValidateTileSet_TwoTiles 2장 세트는 어떤 타입으로도 유효하지 않다 (V-02).
func TestValidateTileSet_TwoTiles(t *testing.T) {
	ts := makeSet(t, "tiny", []string{"R7a", "B7a"})
	_, err := ValidateTileSet(ts)
	assert.Error(t, err)
}

// ─── ValidateTable 테스트 ─────────────────────────────────────────────────────

// TestValidateTable_AllValidSets 모든 세트가 유효하면 nil 에러를 반환한다.
func TestValidateTable_AllValidSets(t *testing.T) {
	sets := []*TileSet{
		makeSet(t, "g1", []string{"R7a", "B7a", "K7b"}),
		makeSet(t, "r1", []string{"Y3a", "Y4a", "Y5a"}),
	}
	err := ValidateTable(sets)
	assert.NoError(t, err)
}

// TestValidateTable_EmptyTable 빈 테이블은 유효하다.
func TestValidateTable_EmptyTable(t *testing.T) {
	err := ValidateTable([]*TileSet{})
	assert.NoError(t, err)
}

// TestValidateTable_ContainsInvalidSet 하나라도 무효한 세트가 있으면 에러를 반환한다 (V-01).
func TestValidateTable_ContainsInvalidSet(t *testing.T) {
	sets := []*TileSet{
		makeSet(t, "g1", []string{"R7a", "B7a", "K7b"}), // 유효
		makeSet(t, "bad", []string{"R1a", "B2a", "Y3a"}), // 무효 (색상 다르고 숫자 다름)
	}
	err := ValidateTable(sets)
	assert.Error(t, err)
}

// ─── ValidateTurnConfirm — 기본 성공 시나리오 ────────────────────────────────

// TestValidateTurnConfirm_FirstMeld_Success 최초 등록 성공 시나리오 (T-01, V-03, V-04, V-05).
// 빈 테이블에 30점 이상 랙 타일만으로 그룹을 구성한다.
func TestValidateTurnConfirm_FirstMeld_Success(t *testing.T) {
	// R10a+B10a+K10b = 30점 (정확히 30점 경계)
	req := makeTurnReq(
		[]*TileSet{}, // 빈 테이블
		[]*TileSet{makeSet(t, "g1", []string{"R10a", "B10a", "K10b"})},
		[]string{"R10a", "B10a", "K10b", "R7a"}, // rackBefore
		[]string{"R7a"},                           // rackAfter (R7a는 사용 안 함)
		false,                                     // 최초 등록 전
	)
	err := ValidateTurnConfirm(req)
	assert.NoError(t, err, "30점 최초 등록은 성공해야 한다")
}

// TestValidateTurnConfirm_AfterMeld_Rearrange 최초 등록 이후 재배치 + 랙 추가 성공 (T-03).
func TestValidateTurnConfirm_AfterMeld_Rearrange(t *testing.T) {
	// 테이블 전: [R7a, B7a, K7b]
	// 테이블 후: [R7a, B7a, K7b] + [Y8a, Y9a, Y10a] (랙에서 추가)
	req := makeTurnReq(
		[]*TileSet{makeSet(t, "g1", []string{"R7a", "B7a", "K7b"})},
		[]*TileSet{
			makeSet(t, "g1", []string{"R7a", "B7a", "K7b"}),
			makeSet(t, "r1", []string{"Y8a", "Y9a", "Y10a"}),
		},
		[]string{"Y8a", "Y9a", "Y10a", "R2a"},
		[]string{"R2a"},
		true, // 최초 등록 완료
	)
	err := ValidateTurnConfirm(req)
	assert.NoError(t, err)
}

// ─── V-01: 세트 유효성 ────────────────────────────────────────────────────────

// TestValidateTurnConfirm_V01_InvalidSet 무효한 세트가 포함된 턴은 실패한다 (T-10).
func TestValidateTurnConfirm_V01_InvalidSet(t *testing.T) {
	req := makeTurnReq(
		[]*TileSet{},
		// 색상이 다르고 숫자도 다른 무효 세트
		[]*TileSet{makeSet(t, "bad", []string{"R1a", "B2a", "Y3a"})},
		[]string{"R1a", "B2a", "Y3a"},
		[]string{},
		true,
	)
	err := ValidateTurnConfirm(req)
	assert.Error(t, err, "V-01: 무효한 세트 포함 턴은 실패해야 한다")
}

// ─── V-03: 랙에서 최소 1장 추가 ────────────────────────────────────────────

// TestValidateTurnConfirm_V03_NoTileAdded 랙에서 타일을 추가하지 않으면 실패한다 (T-04).
func TestValidateTurnConfirm_V03_NoTileAdded(t *testing.T) {
	// 테이블 전후 동일, 랙도 동일 → 타일 추가 없음
	req := makeTurnReq(
		[]*TileSet{makeSet(t, "g1", []string{"R7a", "B7a", "K7b"})},
		[]*TileSet{makeSet(t, "g1", []string{"R7a", "B7a", "K7b"})},
		[]string{"R5a", "B5a"},
		[]string{"R5a", "B5a"},
		true,
	)
	err := ValidateTurnConfirm(req)
	assert.Error(t, err, "V-03: 랙 타일 미추가 턴은 실패해야 한다")
}

// ─── V-04: 최초 등록 30점 미달 ───────────────────────────────────────────────

// TestValidateTurnConfirm_V04_BelowThirty 최초 등록 점수가 30점 미만이면 실패한다 (T-02).
func TestValidateTurnConfirm_V04_BelowThirty(t *testing.T) {
	// R3a+B3a+K3b = 9점 (30점 미달)
	req := makeTurnReq(
		[]*TileSet{},
		[]*TileSet{makeSet(t, "g1", []string{"R3a", "B3a", "K3b"})},
		[]string{"R3a", "B3a", "K3b"},
		[]string{},
		false,
	)
	err := ValidateTurnConfirm(req)
	assert.Error(t, err, "V-04: 30점 미달 최초 등록은 실패해야 한다")
}

// TestValidateTurnConfirm_V04_ExactThirty 30점 정확히는 통과한다.
func TestValidateTurnConfirm_V04_ExactThirty(t *testing.T) {
	// R10a+B10a+K10b = 30점
	req := makeTurnReq(
		[]*TileSet{},
		[]*TileSet{makeSet(t, "g1", []string{"R10a", "B10a", "K10b"})},
		[]string{"R10a", "B10a", "K10b"},
		[]string{},
		false,
	)
	err := ValidateTurnConfirm(req)
	assert.NoError(t, err, "V-04: 정확히 30점 최초 등록은 통과해야 한다")
}

// TestValidateTurnConfirm_V04_AboveThirty 30점 초과도 통과한다.
func TestValidateTurnConfirm_V04_AboveThirty(t *testing.T) {
	// R13a+B13a+K13b = 39점
	req := makeTurnReq(
		[]*TileSet{},
		[]*TileSet{makeSet(t, "g1", []string{"R13a", "B13a", "K13b"})},
		[]string{"R13a", "B13a", "K13b"},
		[]string{},
		false,
	)
	err := ValidateTurnConfirm(req)
	assert.NoError(t, err)
}

// ─── V-05: 최초 등록 시 랙 타일만 사용 ────────────────────────────────────

// TestValidateTurnConfirm_V05_RearrangeBeforeMeld 최초 등록 전 테이블 재배치 시도는 실패한다 (T-06).
func TestValidateTurnConfirm_V05_RearrangeBeforeMeld(t *testing.T) {
	// 테이블에 기존 타일 R7a가 있는데, 최초 등록 전에 그것을 재배치
	existingSet := makeSet(t, "g0", []string{"R7a", "B7a", "K7b"})

	// 제출 테이블에서 기존 타일이 사라졌음 (재배치 시도)
	req := TurnConfirmRequest{
		TableBefore: []*TileSet{existingSet},
		TableAfter: []*TileSet{
			// R7a 가 B7a 로 분리된 새 구성 — R7a 타일 수 감소
			makeSet(t, "g1", []string{"R10a", "B10a", "K10b"}),
		},
		RackBefore:     []string{"R10a", "B10a", "K10b"},
		RackAfter:      []string{},
		HasInitialMeld: false,
	}
	err := ValidateTurnConfirm(req)
	assert.Error(t, err, "V-05: 최초 등록 전 테이블 재배치는 실패해야 한다")
}

// ─── V-06: 테이블 타일 유실 없음 ─────────────────────────────────────────────

// TestValidateTurnConfirm_V06_TileMissing 테이블에서 타일이 유실되면 실패한다 (T-05).
func TestValidateTurnConfirm_V06_TileMissing(t *testing.T) {
	// 테이블 전: R7a + B7a + K7b
	// 테이블 후: R7a + B7a (K7b 유실)
	req := makeTurnReq(
		[]*TileSet{makeSet(t, "g1", []string{"R7a", "B7a", "K7b"})},
		// K7b가 없는 세트는 2장이라 유효하지 않고, 타일 수도 줄었음
		[]*TileSet{
			// 유효한 다른 세트를 만들되 K7b를 포함하지 않음
			makeSet(t, "g2", []string{"R7a", "B7a", "Y7a"}),
		},
		[]string{"Y7a", "K5a"},
		[]string{"K5a"},
		true,
	)
	err := ValidateTurnConfirm(req)
	assert.Error(t, err, "V-06: 테이블 타일 유실은 실패해야 한다")
}

// ─── V-07: 조커 교체 후 즉시 사용 ────────────────────────────────────────────

// TestValidateTurnConfirm_V07_JokerReturnedAndUsed 조커를 교체하고 즉시 다른 세트에 사용하면 성공한다 (T-07).
func TestValidateTurnConfirm_V07_JokerReturnedAndUsed(t *testing.T) {
	// 테이블 전: [R5a, JK1, R7a] (조커가 6을 대체)
	// 조커를 회수하고 R6a로 교체, JK1은 다른 세트에 사용
	req := TurnConfirmRequest{
		TableBefore: []*TileSet{
			makeSet(t, "r1", []string{"R5a", "JK1", "R7a"}),
		},
		TableAfter: []*TileSet{
			makeSet(t, "r1", []string{"R5a", "R6a", "R7a"}), // JK1 교체됨
			makeSet(t, "g1", []string{"B8a", "JK1", "K8b"}), // JK1 재사용
		},
		RackBefore:         []string{"R6a", "B8a", "K8b"},
		RackAfter:          []string{},
		HasInitialMeld:     true,
		JokerReturnedCodes: []string{"JK1"},
	}
	err := ValidateTurnConfirm(req)
	assert.NoError(t, err, "V-07: 조커 교체 후 즉시 사용은 성공해야 한다")
}

// TestValidateTurnConfirm_V07_JokerReturnedNotUsed 조커를 교체했지만 테이블에 사용하지 않으면 실패한다 (T-08).
func TestValidateTurnConfirm_V07_JokerReturnedNotUsed(t *testing.T) {
	req := TurnConfirmRequest{
		TableBefore: []*TileSet{
			makeSet(t, "r1", []string{"R5a", "JK1", "R7a"}),
		},
		TableAfter: []*TileSet{
			makeSet(t, "r1", []string{"R5a", "R6a", "R7a"}), // JK1은 교체됐지만 테이블에 없음
			makeSet(t, "g1", []string{"B8a", "Y8a", "K8b"}), // JK1 미사용
		},
		RackBefore:         []string{"R6a", "B8a", "Y8a", "K8b"},
		RackAfter:          []string{},
		HasInitialMeld:     true,
		JokerReturnedCodes: []string{"JK1"},
	}
	err := ValidateTurnConfirm(req)
	assert.Error(t, err, "V-07: 조커 교체 후 미사용은 실패해야 한다")
}

// ─── 복합 시나리오 ────────────────────────────────────────────────────────────

// TestValidateTurnConfirm_MultipleValidSets 여러 유효한 세트를 동시에 배치하는 복합 시나리오.
func TestValidateTurnConfirm_MultipleValidSets(t *testing.T) {
	// 그룹 + 런 동시 배치, 최초 등록 30점 이상
	// R10a+B10a+K10b = 30점 (그룹)
	// Y11a+Y12a+Y13a = 36점 (런)
	// 합계 66점
	req := makeTurnReq(
		[]*TileSet{},
		[]*TileSet{
			makeSet(t, "g1", []string{"R10a", "B10a", "K10b"}),
			makeSet(t, "r1", []string{"Y11a", "Y12a", "Y13a"}),
		},
		[]string{"R10a", "B10a", "K10b", "Y11a", "Y12a", "Y13a"},
		[]string{},
		false,
	)
	err := ValidateTurnConfirm(req)
	assert.NoError(t, err, "여러 세트 동시 배치는 성공해야 한다")
}

// TestValidateTurnConfirm_JokerInFirstMeld_BelowThirty 조커 포함 최초 등록 시나리오 — 30점 미달.
// R7a + JK1 + B7a 그룹에서 조커는 7을 대체하므로 7+7+7 = 21점 < 30점 → 실패.
func TestValidateTurnConfirm_JokerInFirstMeld_BelowThirty(t *testing.T) {
	req := makeTurnReq(
		[]*TileSet{},
		[]*TileSet{makeSet(t, "g1", []string{"R7a", "JK1", "B7a"})},
		[]string{"R7a", "JK1", "B7a"},
		[]string{},
		false,
	)
	err := ValidateTurnConfirm(req)
	assert.Error(t, err, "조커가 7을 대체하면 21점으로 30점 미달 — 실패해야 한다")
}

// TestValidateTurnConfirm_JokerInFirstMeld_MeetsThirty 조커 포함 최초 등록 — 30점 충족.
// R10a + JK1 + B10a 그룹에서 조커는 10을 대체하므로 10+10+10 = 30점 → 성공.
func TestValidateTurnConfirm_JokerInFirstMeld_MeetsThirty(t *testing.T) {
	req := makeTurnReq(
		[]*TileSet{},
		[]*TileSet{makeSet(t, "g1", []string{"R10a", "JK1", "B10a"})},
		[]string{"R10a", "JK1", "B10a"},
		[]string{},
		false,
	)
	err := ValidateTurnConfirm(req)
	assert.NoError(t, err, "조커가 10을 대체하면 30점으로 최초 등록 충족 — 성공해야 한다")
}

// TestValidateTurnConfirm_JokerRunInFirstMeld 조커 포함 런 최초 등록 — 조커 위치 값으로 계산.
// R8a + JK1 + R10a 런에서 조커는 9를 대체하므로 8+9+10 = 27점 < 30점 → 실패.
func TestValidateTurnConfirm_JokerRunInFirstMeld_BelowThirty(t *testing.T) {
	req := makeTurnReq(
		[]*TileSet{},
		[]*TileSet{makeSet(t, "r1", []string{"R8a", "JK1", "R10a"})},
		[]string{"R8a", "JK1", "R10a"},
		[]string{},
		false,
	)
	err := ValidateTurnConfirm(req)
	assert.Error(t, err, "조커가 9를 대체하는 런은 27점으로 30점 미달 — 실패해야 한다")
}

// TestValidateTurnConfirm_JokerRunInFirstMeld_MeetsThirty 조커 포함 런 최초 등록 — 30점 충족.
// R11a + JK1 + R13a 런에서 조커는 12를 대체하므로 11+12+13 = 36점 ≥ 30점 → 성공.
func TestValidateTurnConfirm_JokerRunInFirstMeld_MeetsThirty(t *testing.T) {
	req := makeTurnReq(
		[]*TileSet{},
		[]*TileSet{makeSet(t, "r1", []string{"R11a", "JK1", "R13a"})},
		[]string{"R11a", "JK1", "R13a"},
		[]string{},
		false,
	)
	err := ValidateTurnConfirm(req)
	assert.NoError(t, err, "조커가 12를 대체하는 런은 36점으로 최초 등록 충족 — 성공해야 한다")
}

// TestValidateTurnConfirm_TableTileCountPreserved 턴 전후 테이블 타일 총 수가 증가해야 한다 (V-07 타일 보존).
func TestValidateTurnConfirm_TableTileCountPreserved(t *testing.T) {
	// 테이블 전: 3장, 후: 6장 (3장 추가) → 유효
	req := makeTurnReq(
		[]*TileSet{makeSet(t, "g1", []string{"R7a", "B7a", "K7b"})},
		[]*TileSet{
			makeSet(t, "g1", []string{"R7a", "B7a", "K7b"}),
			makeSet(t, "r1", []string{"Y1a", "Y2a", "Y3a"}),
		},
		[]string{"Y1a", "Y2a", "Y3a"},
		[]string{},
		true,
	)
	err := ValidateTurnConfirm(req)
	assert.NoError(t, err)
}

// TestValidateTurnConfirm_TableTileDecreased 테이블 타일 수가 감소하면 실패한다 (V-06).
func TestValidateTurnConfirm_TableTileDecreased(t *testing.T) {
	// 테이블 전: 6장, 후: 3장 → 타일 감소 실패
	req := makeTurnReq(
		[]*TileSet{
			makeSet(t, "g1", []string{"R7a", "B7a", "K7b"}),
			makeSet(t, "r1", []string{"Y1a", "Y2a", "Y3a"}),
		},
		[]*TileSet{
			makeSet(t, "g1", []string{"R7a", "B7a", "K7b"}),
			// r1 세트가 사라짐
		},
		[]string{"R5a"},
		[]string{"R5a"},
		true,
	)
	err := ValidateTurnConfirm(req)
	assert.Error(t, err, "V-06: 테이블 타일 감소는 실패해야 한다")
}

// TestValidateTable_ComplexValid 복수 세트(그룹2 + 런1) 동시 검증.
func TestValidateTable_ComplexValid(t *testing.T) {
	sets := []*TileSet{
		makeSet(t, "g1", []string{"R7a", "B7a", "K7b"}),          // 그룹
		makeSet(t, "g2", []string{"R5a", "B5a", "Y5a", "K5b"}),   // 4장 그룹
		makeSet(t, "r1", []string{"Y3a", "Y4a", "Y5a", "Y6a"}),   // 런
	}
	err := ValidateTable(sets)
	assert.NoError(t, err, "여러 유효한 세트의 테이블 검증은 통과해야 한다")
}

// TestValidateTurnConfirm_EmptyRackAfterFirstMeld 최초 등록 시 랙을 모두 소진하는 케이스.
func TestValidateTurnConfirm_EmptyRackAfterFirstMeld(t *testing.T) {
	req := makeTurnReq(
		[]*TileSet{},
		[]*TileSet{makeSet(t, "g1", []string{"R13a", "B13b", "K13a"})},
		[]string{"R13a", "B13b", "K13a"},
		[]string{}, // 랙 소진
		false,
	)
	err := ValidateTurnConfirm(req)
	assert.NoError(t, err, "랙 완전 소진 최초 등록은 성공해야 한다")
}

// ─── V-06 강화: 타일 코드 수준 보전 (Universe Conservation) ────────────────────

// TestValidateTurnConfirm_TileConservation_CodeLevelMissing
// tableBefore의 특정 타일 코드가 tableAfter에서 사라지면 ERR_TABLE_TILE_MISSING 에러를 반환한다.
// 총 타일 수는 증가하지만 코드 수준에서 보전이 깨진 케이스.
func TestValidateTurnConfirm_TileConservation_CodeLevelMissing(t *testing.T) {
	// tableBefore: {R7a, B7a, K7b} (3타일)
	// tableAfter:  {R7a, B7a, Y7a} + {R1a, R2a, R3a} (6타일)
	// K7b가 tableBefore에 있었는데 tableAfter에서 사라짐 (Y7a로 대체)
	// 총 수 증가(3->6)이므로 단순 카운트는 통과하지만 코드 보전 위반
	req := makeTurnReq(
		[]*TileSet{makeSet(t, "g1", []string{"R7a", "B7a", "K7b"})},
		[]*TileSet{
			makeSet(t, "g1", []string{"R7a", "B7a", "Y7a"}), // K7b -> Y7a 교체
			makeSet(t, "r1", []string{"R1a", "R2a", "R3a"}), // 새 세트 추가
		},
		[]string{"Y7a", "R1a", "R2a", "R3a"},
		[]string{},
		true, // 최초 등록 완료 상태
	)
	err := ValidateTurnConfirm(req)
	require.Error(t, err, "코드 수준 타일 보전 위반은 실패해야 한다")
	ve, ok := err.(*ValidationError)
	require.True(t, ok, "ValidationError 타입이어야 한다")
	assert.Equal(t, ErrTableTileMissing, ve.Code)
	assert.Contains(t, ve.Message, "K7b")
}

// TestValidateTurnConfirm_TileConservation_ValidRearrangement
// tableBefore의 모든 타일이 tableAfter에 존재하면서 재배치 + 추가가 이루어진 정상 케이스.
func TestValidateTurnConfirm_TileConservation_ValidRearrangement(t *testing.T) {
	// tableBefore: {R7a, B7a, K7b} (3타일)
	// tableAfter:  {R7a, K7b, Y7a} + {B7a, R8a, R9a} (6타일)
	// R7a, B7a, K7b 모두 보전 + 추가 타일(Y7a, R8a, R9a)
	req := makeTurnReq(
		[]*TileSet{makeSet(t, "g1", []string{"R7a", "B7a", "K7b"})},
		[]*TileSet{
			makeSet(t, "g1", []string{"R7a", "K7b", "Y7a"}), // 재배치 + Y7a 추가
			makeSet(t, "r1", []string{"B7a", "B8a", "B9a"}), // B7a 이동 + 새 타일 추가
		},
		[]string{"Y7a", "B8a", "B9a"},
		[]string{},
		true,
	)
	err := ValidateTurnConfirm(req)
	assert.NoError(t, err, "정상 재배치 + 추가는 통과해야 한다")
}

// TestValidateTurnConfirm_TileConservation_DuplicateCodeMissing
// tableBefore에 같은 코드가 2번 있을 때, tableAfter에 1번만 있으면 실패한다.
func TestValidateTurnConfirm_TileConservation_DuplicateCodeMissing(t *testing.T) {
	// tableBefore: {R5a, B5a, K5b} + {R5a, Y5a, K5a} (R5a가 2번, 총 6타일)
	// tableAfter:  {R5a, B5a, K5b} + {Y5a, K5a, B5b} + {R1a, R2a, R3a} (R5a가 1번, 총 9타일)
	// 총 수는 증가(6->9)하지만 R5a의 빈도가 2->1로 감소 = 보전 위반
	req := makeTurnReq(
		[]*TileSet{
			makeSet(t, "g1", []string{"R5a", "B5a", "K5b"}),
			makeSet(t, "g2", []string{"R5a", "Y5a", "K5a"}),
		},
		[]*TileSet{
			makeSet(t, "g1", []string{"R5a", "B5a", "K5b"}),
			makeSet(t, "g2", []string{"Y5a", "K5a", "B5b"}),  // R5a -> B5b 교체
			makeSet(t, "r1", []string{"R1a", "R2a", "R3a"}),   // 새 세트 추가 (V-03 통과)
		},
		[]string{"B5b", "R1a", "R2a", "R3a"},
		[]string{},
		true,
	)
	err := ValidateTurnConfirm(req)
	require.Error(t, err, "동일 코드 빈도 감소는 실패해야 한다")
	ve, ok := err.(*ValidationError)
	require.True(t, ok)
	assert.Equal(t, ErrTableTileMissing, ve.Code)
}

// TestValidateTurnConfirm_TileConservation_JokerSwapExcluded
// JokerReturnedCodes에 포함된 타일은 테이블에서 합법적으로 제거되므로 보전 검증에서 제외된다.
func TestValidateTurnConfirm_TileConservation_JokerSwapExcluded(t *testing.T) {
	// tableBefore: {R5a, JK1, R7a}
	// tableAfter:  {R5a, R6a, R7a} + {B8a, JK1, K8b} (JK1 재사용)
	// JK1은 jokerReturnedCodes에 포함 -> 테이블에서 제거 허용
	req := TurnConfirmRequest{
		TableBefore: []*TileSet{
			makeSet(t, "r1", []string{"R5a", "JK1", "R7a"}),
		},
		TableAfter: []*TileSet{
			makeSet(t, "r1", []string{"R5a", "R6a", "R7a"}),
			makeSet(t, "g1", []string{"B8a", "JK1", "K8b"}),
		},
		RackBefore:         []string{"R6a", "B8a", "K8b"},
		RackAfter:          []string{},
		HasInitialMeld:     true,
		JokerReturnedCodes: []string{"JK1"},
	}
	err := ValidateTurnConfirm(req)
	assert.NoError(t, err, "조커 교체 후 재사용은 보전 검증을 통과해야 한다")
}
