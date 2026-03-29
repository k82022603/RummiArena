package engine

import (
	"errors"
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

// ============================================================================
// 1. 그룹(Group) 유효성 검증 — 전면 테스트
// ============================================================================

// TestGroup_Valid_3Colors 서로 다른 3색 그룹: 모든 색상 조합
func TestGroup_Valid_3Colors(t *testing.T) {
	tests := []struct {
		name  string
		codes []string
	}{
		{name: "R+B+Y", codes: []string{"R3a", "B3a", "Y3b"}},
		{name: "R+B+K", codes: []string{"R3a", "B3a", "K3b"}},
		{name: "R+Y+K", codes: []string{"R3a", "Y3a", "K3b"}},
		{name: "B+Y+K", codes: []string{"B3a", "Y3a", "K3b"}},
	}
	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			tiles := mustParseTiles(t, tc.codes)
			err := ValidateGroup(tiles)
			assert.NoError(t, err)
		})
	}
}

// TestGroup_Valid_4Colors 4색 그룹 (모든 색상 사용)
func TestGroup_Valid_4Colors(t *testing.T) {
	for num := 1; num <= 13; num++ {
		codes := []string{
			tilecode("R", num, "a"),
			tilecode("B", num, "a"),
			tilecode("Y", num, "a"),
			tilecode("K", num, "b"),
		}
		t.Run(codes[0], func(t *testing.T) {
			tiles := mustParseTiles(t, codes)
			err := ValidateGroup(tiles)
			assert.NoError(t, err, "4색 그룹 숫자 %d는 유효해야 한다", num)
		})
	}
}

// TestGroup_Invalid_2Tiles 2장은 그룹이 될 수 없다
func TestGroup_Invalid_2Tiles(t *testing.T) {
	tiles := mustParseTiles(t, []string{"R3a", "B3a"})
	err := ValidateGroup(tiles)
	require.Error(t, err)
	var ve *ValidationError
	assert.True(t, errors.As(err, &ve))
	assert.Equal(t, ErrSetSize, ve.Code)
}

// TestGroup_Invalid_5Tiles 5장은 그룹이 될 수 없다
func TestGroup_Invalid_5Tiles_NoJoker(t *testing.T) {
	// 실제로는 4색까지만 가능하므로 5장은 불가
	tiles := mustParseTiles(t, []string{"R3a", "B3a", "Y3a", "K3b", "R3b"})
	err := ValidateGroup(tiles)
	require.Error(t, err)
	var ve *ValidationError
	assert.True(t, errors.As(err, &ve))
	assert.Equal(t, ErrSetSize, ve.Code)
}

// TestGroup_Invalid_DuplicateColor 같은 색상 중복
func TestGroup_Invalid_DuplicateColor_SameSet(t *testing.T) {
	// R3a, R3b, B3a — 빨강이 두 개
	tiles := mustParseTiles(t, []string{"R3a", "R3b", "B3a"})
	err := ValidateGroup(tiles)
	require.Error(t, err)
	var ve *ValidationError
	assert.True(t, errors.As(err, &ve))
	assert.Equal(t, ErrGroupColorDup, ve.Code)
}

// TestGroup_Invalid_NumberMismatch 숫자가 다른 타일
func TestGroup_Invalid_NumberMismatch(t *testing.T) {
	tiles := mustParseTiles(t, []string{"R3a", "B4a", "Y3a"})
	err := ValidateGroup(tiles)
	require.Error(t, err)
	var ve *ValidationError
	assert.True(t, errors.As(err, &ve))
	assert.Equal(t, ErrGroupNumberMismatch, ve.Code)
}

// TestGroup_WithJoker_Valid 조커가 빠진 색상을 대체
func TestGroup_WithJoker_Valid(t *testing.T) {
	tests := []struct {
		name  string
		codes []string
	}{
		{name: "3장: 조커+R+B", codes: []string{"JK1", "R3a", "B3a"}},
		{name: "3장: R+조커+B", codes: []string{"R3a", "JK1", "B3a"}},
		{name: "3장: R+B+조커", codes: []string{"R3a", "B3a", "JK1"}},
		{name: "4장: 조커+R+B+Y", codes: []string{"JK1", "R3a", "B3a", "Y3a"}},
		{name: "4장: 조커2개+R+B", codes: []string{"JK1", "JK2", "R3a", "B3a"}},
	}
	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			tiles := mustParseTiles(t, tc.codes)
			err := ValidateGroup(tiles)
			assert.NoError(t, err)
		})
	}
}

// TestGroup_WithJoker_Invalid 조커가 있어도 무효인 경우
func TestGroup_WithJoker_Invalid(t *testing.T) {
	tests := []struct {
		name  string
		codes []string
	}{
		{name: "조커+같은색 중복", codes: []string{"JK1", "R3a", "R3b"}},
		{name: "조커+숫자 다름", codes: []string{"JK1", "R3a", "B4a"}},
	}
	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			tiles := mustParseTiles(t, tc.codes)
			err := ValidateGroup(tiles)
			assert.Error(t, err)
		})
	}
}

// ============================================================================
// 2. 런(Run) 유효성 검증 — 전면 테스트
// ============================================================================

// TestRun_Valid_AllLengths 3장~13장까지 모든 길이의 유효한 런
func TestRun_Valid_AllLengths(t *testing.T) {
	for length := 3; length <= 13; length++ {
		codes := make([]string, length)
		for i := 0; i < length; i++ {
			codes[i] = tilecode("R", i+1, "a")
		}
		t.Run(intToStr(length)+"장", func(t *testing.T) {
			tiles := mustParseTiles(t, codes)
			err := ValidateRun(tiles)
			assert.NoError(t, err, "%d장 런은 유효해야 한다", length)
		})
	}
}

// TestRun_Valid_HighEnd 끝이 13인 런들
func TestRun_Valid_HighEnd(t *testing.T) {
	tests := []struct {
		name  string
		codes []string
	}{
		{name: "11-12-13", codes: []string{"R11a", "R12a", "R13a"}},
		{name: "10-11-12-13", codes: []string{"R10a", "R11a", "R12a", "R13a"}},
		{name: "9-10-11-12-13", codes: []string{"R9a", "R10a", "R11a", "R12a", "R13a"}},
	}
	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			tiles := mustParseTiles(t, tc.codes)
			err := ValidateRun(tiles)
			assert.NoError(t, err)
		})
	}
}

// TestRun_Valid_EachColor 모든 색상에서 런이 유효한지
func TestRun_Valid_EachColor(t *testing.T) {
	for _, color := range []string{"R", "B", "Y", "K"} {
		codes := []string{
			tilecode(color, 5, "a"),
			tilecode(color, 6, "a"),
			tilecode(color, 7, "a"),
		}
		t.Run(color+"5-6-7", func(t *testing.T) {
			tiles := mustParseTiles(t, codes)
			err := ValidateRun(tiles)
			assert.NoError(t, err)
		})
	}
}

// TestRun_Invalid_2Tiles 2장은 런이 될 수 없다
func TestRun_Invalid_2Tiles(t *testing.T) {
	tiles := mustParseTiles(t, []string{"R1a", "R2a"})
	err := ValidateRun(tiles)
	require.Error(t, err)
	var ve *ValidationError
	assert.True(t, errors.As(err, &ve))
	assert.Equal(t, ErrSetSize, ve.Code)
}

// TestRun_Invalid_NonConsecutive 연속되지 않은 숫자
func TestRun_Invalid_NonConsecutive(t *testing.T) {
	tests := []struct {
		name  string
		codes []string
	}{
		{name: "R1-R3-R5 갭 있음", codes: []string{"R1a", "R3a", "R5a"}},
		{name: "R1-R2-R4 1갭", codes: []string{"R1a", "R2a", "R4a"}},
		{name: "R1-R4-R7 큰 갭", codes: []string{"R1a", "R4a", "R7a"}},
	}
	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			tiles := mustParseTiles(t, tc.codes)
			err := ValidateRun(tiles)
			assert.Error(t, err)
		})
	}
}

// TestRun_Invalid_MixedColor 색상이 혼합된 런
func TestRun_Invalid_MixedColor(t *testing.T) {
	tiles := mustParseTiles(t, []string{"R1a", "B2a", "R3a"})
	err := ValidateRun(tiles)
	require.Error(t, err)
	var ve *ValidationError
	assert.True(t, errors.As(err, &ve))
	assert.Equal(t, ErrRunColor, ve.Code)
}

// TestRun_Invalid_WrapAround 13-1 순환은 무효
func TestRun_Invalid_WrapAround_R12_R13_R1(t *testing.T) {
	tiles := mustParseTiles(t, []string{"R12a", "R13a", "R1a"})
	err := ValidateRun(tiles)
	assert.Error(t, err, "13에서 1로 순환하는 런은 무효")
}

// TestRun_Invalid_WrapAround_R13_R1_R2 역시 순환 무효
func TestRun_Invalid_WrapAround_R13_R1_R2(t *testing.T) {
	tiles := mustParseTiles(t, []string{"R13a", "R1a", "R2a"})
	err := ValidateRun(tiles)
	assert.Error(t, err, "13-1-2 순환은 무효")
}

// TestRun_Invalid_DuplicateNumber 런에서 같은 숫자 중복
func TestRun_Invalid_DuplicateNumber(t *testing.T) {
	tests := []struct {
		name  string
		codes []string
	}{
		{name: "R3a-R3b-R4a", codes: []string{"R3a", "R3b", "R4a"}},
		{name: "R5a-R5b-R6a-R7a", codes: []string{"R5a", "R5b", "R6a", "R7a"}},
	}
	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			tiles := mustParseTiles(t, tc.codes)
			err := ValidateRun(tiles)
			require.Error(t, err)
			var ve *ValidationError
			assert.True(t, errors.As(err, &ve))
			assert.Equal(t, ErrRunDuplicate, ve.Code)
		})
	}
}

// TestRun_WithJoker_Valid 조커가 포함된 유효한 런
func TestRun_WithJoker_Valid(t *testing.T) {
	tests := []struct {
		name  string
		codes []string
	}{
		// 조커가 앞에: JK=R1, R2, R3
		{name: "JK-R2-R3 (조커=R1)", codes: []string{"JK1", "R2a", "R3a"}},
		// 조커가 뒤에: R11, R12, JK=R13
		{name: "R11-R12-JK (조커=R13)", codes: []string{"R11a", "R12a", "JK1"}},
		// 조커가 중간: R3, JK=R4, R5
		{name: "R3-JK-R5 (조커=R4)", codes: []string{"R3a", "JK1", "R5a"}},
		// 조커 2개: R3, JK, JK, R6
		{name: "R3-JK-JK-R6", codes: []string{"R3a", "JK1", "JK2", "R6a"}},
		// 조커 2개 앞쪽: JK, JK, R3
		{name: "JK-JK-R3 (조커=R1,R2)", codes: []string{"JK1", "JK2", "R3a"}},
		// 조커 2개 뒤쪽: R11, JK, JK
		{name: "R11-JK-JK (조커=R12,R13)", codes: []string{"R11a", "JK1", "JK2"}},
		// 조커가 양쪽: JK, R5, JK
		{name: "JK-R5-JK (조커=R4,R6)", codes: []string{"JK1", "R5a", "JK2"}},
	}
	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			tiles := mustParseTiles(t, tc.codes)
			err := ValidateRun(tiles)
			assert.NoError(t, err, "조커 포함 유효 런: %s", tc.name)
		})
	}
}

// TestRun_WithJoker_Invalid 조커가 있어도 무효인 런
func TestRun_WithJoker_Invalid(t *testing.T) {
	tests := []struct {
		name  string
		codes []string
	}{
		// 색상 혼재 + 조커
		{name: "JK+R2+B3 (색 혼재)", codes: []string{"JK1", "R2a", "B3a"}},
		// 범위 초과: R13, JK, JK, JK → [R13, 14, 15, 16] 또는 [R10, R11, R12, R13] but JK3 doesn't exist
		// 실제 범위 초과 예: 조커 3개+R13 → 실제 조커는 2개뿐이므로 ParseAll로 중복 생성 가능하지만 현실적으로 불가
		// R13+JK+JK: 3장, 조커=R14,R15 or R11,R12 → [R11,R12,R13] 유효 → 다른 케이스
		// R1+R13+JK: 색상 같지만 갭이 11 → 조커 1개로 커버 불가
		{name: "R1-R13-JK (갭 너무 큼)", codes: []string{"R1a", "R13a", "JK1"}},
	}
	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			tiles := mustParseTiles(t, tc.codes)
			err := ValidateRun(tiles)
			assert.Error(t, err, "무효 런: %s", tc.name)
		})
	}
}

// TestRun_WithJoker_R12R13JKJK_Valid R12-R13-JK-JK는 [R10,R11,R12,R13]으로 유효
func TestRun_WithJoker_R12R13JKJK_Valid(t *testing.T) {
	tiles := mustParseTiles(t, []string{"R12a", "R13a", "JK1", "JK2"})
	err := ValidateRun(tiles)
	assert.NoError(t, err, "R12-R13-JK-JK → [R10,R11,R12,R13] 유효")
}

// TestRun_WithJoker_BoundaryValid 조커가 경계값에서 유효한 케이스
func TestRun_WithJoker_BoundaryValid(t *testing.T) {
	tests := []struct {
		name  string
		codes []string
	}{
		// JK=R1, R2, R3, R4
		{name: "JK-R2-R3-R4", codes: []string{"JK1", "R2a", "R3a", "R4a"}},
		// R10, R11, R12, JK=R13
		{name: "R10-R11-R12-JK", codes: []string{"R10a", "R11a", "R12a", "JK1"}},
		// JK=R1, R2a (2장은 여전히 무효)
		// JK-R12-R13: 조커=R11 유효
		{name: "JK-R12-R13 (조커=R11)", codes: []string{"JK1", "R12a", "R13a"}},
	}
	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			tiles := mustParseTiles(t, tc.codes)
			err := ValidateRun(tiles)
			assert.NoError(t, err)
		})
	}
}

// TestRun_WithJoker_BoundaryInvalid 조커가 경계값에서 무효한 케이스
func TestRun_WithJoker_BoundaryInvalid(t *testing.T) {
	tests := []struct {
		name  string
		codes []string
	}{
		// R13+JK: 2장은 크기 미달
		{name: "R13-JK (2장 미달)", codes: []string{"R13a", "JK1"}},
		// R1, JK, JK, JK, R5: 조커 3개 — 1,2,3,4,5 유효
		// 하지만 조커는 JK1, JK2 2장만 존재 (파싱은 통과하지만 풀에서 불가)
	}
	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			tiles := mustParseTiles(t, tc.codes)
			err := ValidateRun(tiles)
			assert.Error(t, err)
		})
	}
}

// ============================================================================
// 3. ValidateTileSet — 그룹/런 자동 감지
// ============================================================================

// TestTileSet_AmbiguousButValid 그룹이면서 런이 아닌 세트, 런이면서 그룹이 아닌 세트
func TestTileSet_AmbiguousButValid(t *testing.T) {
	tests := []struct {
		name     string
		codes    []string
		wantType SetType
	}{
		// 확실한 그룹
		{name: "R7+B7+Y7 = 그룹", codes: []string{"R7a", "B7a", "Y7a"}, wantType: SetTypeGroup},
		// 확실한 런
		{name: "R1+R2+R3 = 런", codes: []string{"R1a", "R2a", "R3a"}, wantType: SetTypeRun},
		// 4색 그룹
		{name: "R5+B5+Y5+K5 = 그룹", codes: []string{"R5a", "B5a", "Y5a", "K5b"}, wantType: SetTypeGroup},
		// 긴 런
		{name: "B1-B2-B3-B4-B5 = 런", codes: []string{"B1a", "B2a", "B3a", "B4a", "B5a"}, wantType: SetTypeRun},
	}
	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			ts := &TileSet{ID: "test", Tiles: mustParseTiles(t, tc.codes)}
			setType, err := ValidateTileSet(ts)
			require.NoError(t, err)
			assert.Equal(t, tc.wantType, setType)
		})
	}
}

// TestTileSet_NeitherGroupNorRun 그룹도 런도 아닌 세트
func TestTileSet_NeitherGroupNorRun(t *testing.T) {
	tests := []struct {
		name  string
		codes []string
	}{
		{name: "R1+B2+Y3 (숫자 다름, 색 다름)", codes: []string{"R1a", "B2a", "Y3a"}},
		{name: "R1+R3+R5 (연속 아님)", codes: []string{"R1a", "R3a", "R5a"}},
		{name: "R1+B1+R2 (그룹: 색 다르지만 숫자 다름)", codes: []string{"R1a", "B1a", "R2a"}},
	}
	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			ts := &TileSet{ID: "test", Tiles: mustParseTiles(t, tc.codes)}
			setType, err := ValidateTileSet(ts)
			assert.Error(t, err)
			assert.Equal(t, SetTypeUnknown, setType)
		})
	}
}

// ============================================================================
// 4. 최초 등록(Initial Meld) — 30점 규칙
// ============================================================================

// TestInitialMeld_ScoreBoundary 30점 경계값 테스트
func TestInitialMeld_ScoreBoundary(t *testing.T) {
	tests := []struct {
		name     string
		codes    []string // 테이블에 놓는 타일
		wantPass bool
	}{
		// R9+B9+Y9 = 27점 — 30점 미달
		{name: "27점 (9*3) 미달", codes: []string{"R9a", "B9a", "Y9a"}, wantPass: false},
		// R10+B10+K10 = 30점 — 정확히 경계
		{name: "30점 (10*3) 통과", codes: []string{"R10a", "B10a", "K10b"}, wantPass: true},
		// R11+B11+Y11 = 33점 — 통과
		{name: "33점 (11*3) 통과", codes: []string{"R11a", "B11a", "Y11a"}, wantPass: true},
		// R1+B1+Y1 = 3점 — 미달
		{name: "3점 (1*3) 미달", codes: []string{"R1a", "B1a", "Y1a"}, wantPass: false},
		// R13+B13+K13 = 39점 — 통과
		{name: "39점 (13*3) 통과", codes: []string{"R13a", "B13a", "K13b"}, wantPass: true},
	}
	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			req := TurnConfirmRequest{
				TableBefore:    []*TileSet{},
				TableAfter:     []*TileSet{makeTileSet(t, "g1", tc.codes)},
				RackBefore:     tc.codes,
				RackAfter:      []string{},
				HasInitialMeld: false,
			}
			err := ValidateTurnConfirm(req)
			if tc.wantPass {
				assert.NoError(t, err)
			} else {
				assert.Error(t, err)
			}
		})
	}
}

// TestInitialMeld_MultipleGroups 여러 세트로 30점 이상 달성
func TestInitialMeld_MultipleGroups(t *testing.T) {
	// R5+B5+Y5 = 15점 + R6+B6+Y6 = 18점 → 합계 33점
	codes1 := []string{"R5a", "B5a", "Y5a"}
	codes2 := []string{"R6a", "B6a", "Y6a"}
	allCodes := append(codes1, codes2...)

	req := TurnConfirmRequest{
		TableBefore: []*TileSet{},
		TableAfter: []*TileSet{
			makeTileSet(t, "g1", codes1),
			makeTileSet(t, "g2", codes2),
		},
		RackBefore:     allCodes,
		RackAfter:      []string{},
		HasInitialMeld: false,
	}
	err := ValidateTurnConfirm(req)
	assert.NoError(t, err, "여러 세트로 30점 달성 가능")
}

// TestInitialMeld_JokerScoring 조커가 포함된 최초 등록의 점수 계산
func TestInitialMeld_JokerScoring(t *testing.T) {
	// 현재 구현: 조커 Score()=30점
	// R1a + JK1 + B1a → 1+30+1 = 32점 → 통과
	codes := []string{"R1a", "JK1", "B1a"}
	req := TurnConfirmRequest{
		TableBefore:    []*TileSet{},
		TableAfter:     []*TileSet{makeTileSet(t, "g1", codes)},
		RackBefore:     codes,
		RackAfter:      []string{},
		HasInitialMeld: false,
	}
	err := ValidateTurnConfirm(req)
	assert.NoError(t, err, "조커는 30점으로 계산되어 통과")
}

// TestInitialMeld_RunScoring 런으로 최초 등록
func TestInitialMeld_RunScoring(t *testing.T) {
	// R9+R10+R11 = 30점
	codes := []string{"R9a", "R10a", "R11a"}
	req := TurnConfirmRequest{
		TableBefore:    []*TileSet{},
		TableAfter:     []*TileSet{makeTileSet(t, "r1", codes)},
		RackBefore:     codes,
		RackAfter:      []string{},
		HasInitialMeld: false,
	}
	err := ValidateTurnConfirm(req)
	assert.NoError(t, err, "런으로 최초 등록 30점 통과")
}

// TestInitialMeld_RunUnder30 런으로 30점 미달
func TestInitialMeld_RunUnder30(t *testing.T) {
	// R1+R2+R3 = 6점
	codes := []string{"R1a", "R2a", "R3a"}
	req := TurnConfirmRequest{
		TableBefore:    []*TileSet{},
		TableAfter:     []*TileSet{makeTileSet(t, "r1", codes)},
		RackBefore:     codes,
		RackAfter:      []string{},
		HasInitialMeld: false,
	}
	err := ValidateTurnConfirm(req)
	assert.Error(t, err, "런 6점은 30점 미달")
}

// ============================================================================
// 5. 턴 규칙 (V-03, V-05, V-06)
// ============================================================================

// TestTurnConfirm_V03_MustPlaceAtLeastOneTile 랙에서 최소 1장 추가 필수
func TestTurnConfirm_V03_MustPlaceAtLeastOneTile(t *testing.T) {
	// 재배치만 하고 새 타일 추가 없음
	existingSet := makeTileSet(t, "g1", []string{"R7a", "B7a", "K7b"})
	req := TurnConfirmRequest{
		TableBefore:    []*TileSet{existingSet},
		TableAfter:     []*TileSet{existingSet}, // 동일
		RackBefore:     []string{"R5a"},
		RackAfter:      []string{"R5a"}, // 동일
		HasInitialMeld: true,
	}
	err := ValidateTurnConfirm(req)
	require.Error(t, err)
	var ve *ValidationError
	assert.True(t, errors.As(err, &ve))
	assert.Equal(t, ErrNoRackTile, ve.Code)
}

// TestTurnConfirm_V05_NoRearrangeBeforeInitialMeld 최초 등록 전 테이블 조작 불가
func TestTurnConfirm_V05_NoRearrangeBeforeInitialMeld(t *testing.T) {
	// 테이블에 기존 세트가 있고, 최초 등록 전
	existingBefore := makeTileSet(t, "g0", []string{"R7a", "B7a", "K7b"})
	// 테이블 후: 기존 타일 일부 제거 (재배치 시도)
	req := TurnConfirmRequest{
		TableBefore: []*TileSet{existingBefore},
		TableAfter: []*TileSet{
			makeTileSet(t, "g1", []string{"R10a", "B10a", "K10b"}), // 기존 세트 제거됨
		},
		RackBefore:     []string{"R10a", "B10a", "K10b"},
		RackAfter:      []string{},
		HasInitialMeld: false,
	}
	err := ValidateTurnConfirm(req)
	assert.Error(t, err, "V-05: 최초 등록 전 테이블 재배치 불가")
}

// TestTurnConfirm_V05_TableBeforeIntact 최초 등록 시 기존 테이블 타일 유지 필수
func TestTurnConfirm_V05_TableBeforeIntact(t *testing.T) {
	// 테이블 전: [R7a, B7a, K7b]
	// 테이블 후: [R7a, B7a, K7b] + 새 세트 [R10a, B10a, K10b]
	// 기존 타일이 보존되고, 새 타일만 추가 → 통과해야 함
	existingBefore := makeTileSet(t, "g0", []string{"R7a", "B7a", "K7b"})
	req := TurnConfirmRequest{
		TableBefore: []*TileSet{existingBefore},
		TableAfter: []*TileSet{
			makeTileSet(t, "g0", []string{"R7a", "B7a", "K7b"}),
			makeTileSet(t, "g1", []string{"R10a", "B10a", "K10b"}),
		},
		RackBefore:     []string{"R10a", "B10a", "K10b"},
		RackAfter:      []string{},
		HasInitialMeld: false,
	}
	err := ValidateTurnConfirm(req)
	assert.NoError(t, err, "V-05: 기존 테이블 보존하면서 최초 등록 가능")
}

// TestTurnConfirm_V06_TableTileLoss 테이블 타일 감소 감지
func TestTurnConfirm_V06_TableTileLoss(t *testing.T) {
	// 테이블 전: 6장 → 후: 3장 (타일 감소)
	before := []*TileSet{
		makeTileSet(t, "g1", []string{"R7a", "B7a", "K7b"}),
		makeTileSet(t, "g2", []string{"R5a", "B5a", "Y5a"}),
	}
	after := []*TileSet{
		makeTileSet(t, "g1", []string{"R7a", "B7a", "K7b"}),
	}
	req := TurnConfirmRequest{
		TableBefore:    before,
		TableAfter:     after,
		RackBefore:     []string{"R1a"},
		RackAfter:      []string{"R1a"},
		HasInitialMeld: true,
	}
	err := ValidateTurnConfirm(req)
	assert.Error(t, err, "V-06: 테이블 타일 감소는 에러")
}

// ============================================================================
// 6. 재배열 규칙 (HasInitialMeld=true 이후)
// ============================================================================

// TestRearrange_SplitAndMerge 기존 세트를 분리하여 새 세트 구성
func TestRearrange_SplitAndMerge(t *testing.T) {
	// 테이블 전: [R7a, B7a, K7b, Y7a] (4장 그룹)
	// 플레이어가 R8a를 추가하면서 세트를 재배열:
	// 후: [R7a, B7a, K7b] (3장 그룹) + [Y7a, Y8a, Y9a] (추가 런)
	// 단, 플레이어 랙에 Y8a, Y9a도 있어야 함
	req := TurnConfirmRequest{
		TableBefore: []*TileSet{
			makeTileSet(t, "g1", []string{"R7a", "B7a", "K7b", "Y7a"}),
		},
		TableAfter: []*TileSet{
			makeTileSet(t, "g1", []string{"R7a", "B7a", "K7b"}),
			makeTileSet(t, "r1", []string{"Y7a", "Y8a", "Y9a"}),
		},
		RackBefore:     []string{"Y8a", "Y9a", "R3a"},
		RackAfter:      []string{"R3a"},
		HasInitialMeld: true,
	}
	err := ValidateTurnConfirm(req)
	assert.NoError(t, err, "재배열: 기존 세트 분리 + 새 타일 추가 유효")
}

// TestRearrange_AddToExistingSet 기존 세트에 타일 추가
func TestRearrange_AddToExistingSet(t *testing.T) {
	// 테이블 전: [R7a, B7a, K7b] (3장 그룹)
	// Y7a를 추가하여 4장 그룹으로 확장
	req := TurnConfirmRequest{
		TableBefore: []*TileSet{
			makeTileSet(t, "g1", []string{"R7a", "B7a", "K7b"}),
		},
		TableAfter: []*TileSet{
			makeTileSet(t, "g1", []string{"R7a", "B7a", "K7b", "Y7a"}),
		},
		RackBefore:     []string{"Y7a", "R3a"},
		RackAfter:      []string{"R3a"},
		HasInitialMeld: true,
	}
	err := ValidateTurnConfirm(req)
	assert.NoError(t, err, "기존 세트에 타일 추가 유효")
}

// ============================================================================
// 7. 조커 교환 규칙 (V-07)
// ============================================================================

// TestJokerSwap_Valid 조커를 교체하고 즉시 다른 세트에 사용
func TestJokerSwap_Valid(t *testing.T) {
	req := TurnConfirmRequest{
		TableBefore: []*TileSet{
			makeTileSet(t, "r1", []string{"R5a", "JK1", "R7a"}), // JK1=R6
		},
		TableAfter: []*TileSet{
			makeTileSet(t, "r1", []string{"R5a", "R6a", "R7a"}), // R6a로 교체
			makeTileSet(t, "g1", []string{"B3a", "JK1", "K3a"}), // JK1 재사용
		},
		RackBefore:         []string{"R6a", "B3a", "K3a"},
		RackAfter:          []string{},
		HasInitialMeld:     true,
		JokerReturnedCodes: []string{"JK1"},
	}
	err := ValidateTurnConfirm(req)
	assert.NoError(t, err, "V-07: 조커 교환 후 즉시 사용 유효")
}

// TestJokerSwap_NotUsed 조커를 교체했으나 테이블에 사용하지 않음
func TestJokerSwap_NotUsed(t *testing.T) {
	req := TurnConfirmRequest{
		TableBefore: []*TileSet{
			makeTileSet(t, "r1", []string{"R5a", "JK1", "R7a"}),
		},
		TableAfter: []*TileSet{
			makeTileSet(t, "r1", []string{"R5a", "R6a", "R7a"}),
			// JK1이 테이블 어디에도 없음
			makeTileSet(t, "g1", []string{"B3a", "Y3a", "K3a"}),
		},
		RackBefore:         []string{"R6a", "B3a", "Y3a", "K3a"},
		RackAfter:          []string{},
		HasInitialMeld:     true,
		JokerReturnedCodes: []string{"JK1"},
	}
	err := ValidateTurnConfirm(req)
	assert.Error(t, err, "V-07: 조커 미사용 시 에러")
}

// ============================================================================
// 8. 점수 계산 (groupScore, runScore)
// ============================================================================

// TestGroupScore_AllNumbers 모든 숫자 그룹의 점수
func TestGroupScore_AllNumbers(t *testing.T) {
	for num := 1; num <= 13; num++ {
		codes := []string{
			tilecode("R", num, "a"),
			tilecode("B", num, "a"),
			tilecode("Y", num, "a"),
		}
		t.Run(intToStr(num)+"*3", func(t *testing.T) {
			tiles := mustParseTiles(t, codes)
			score := groupScore(tiles)
			assert.Equal(t, num*3, score)
		})
	}
}

// TestRunScore_WithJoker 조커 포함 런 점수 계산
func TestRunScore_WithJoker(t *testing.T) {
	tests := []struct {
		name      string
		codes     []string
		wantScore int
	}{
		// JK+R2+R3 → joker goes after max (R4), so 2+3+4=9
		{name: "JK-R2-R3 => 2+3+4=9", codes: []string{"JK1", "R2a", "R3a"}, wantScore: 9},
		// R11+R12+JK(=13) → 11+12+13=36
		{name: "R11-R12-JK => 36", codes: []string{"R11a", "R12a", "JK1"}, wantScore: 36},
		// R3+JK(=4)+R5 → 3+4+5=12
		{name: "R3-JK-R5 => 12", codes: []string{"R3a", "JK1", "R5a"}, wantScore: 12},
		// R3+JK+JK+R6 → 3+4+5+6=18
		{name: "R3-JK-JK-R6 => 18", codes: []string{"R3a", "JK1", "JK2", "R6a"}, wantScore: 18},
	}
	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			tiles := mustParseTiles(t, tc.codes)
			score := runScore(tiles)
			assert.Equal(t, tc.wantScore, score)
		})
	}
}

// ============================================================================
// 9. TilePool 테스트 — 승리/종료 조건 관련
// ============================================================================

// TestPool_DrawPileExhaustion 드로우 파일 소진 시나리오
func TestPool_DrawPileExhaustion(t *testing.T) {
	pool := NewTilePool()
	// 모든 타일 소진
	for pool.Remaining() > 0 {
		_, err := pool.DrawOne()
		require.NoError(t, err)
	}
	assert.Equal(t, 0, pool.Remaining())
	// 빈 풀에서 DrawOne
	tile, err := pool.DrawOne()
	assert.Error(t, err)
	assert.Nil(t, tile)
}

// TestPool_DealNegativeCount 음수 count Deal
func TestPool_DealNegativeCount(t *testing.T) {
	pool := NewTilePool()
	result := pool.Deal(-5)
	assert.Nil(t, result)
	assert.Equal(t, 106, pool.Remaining())
}

// ============================================================================
// 10. 에지 케이스 — 런에서의 조커 위치 결정
// ============================================================================

// TestRun_JokerAtStart_R1Position 조커가 R1 위치를 차지하는 런
func TestRun_JokerAtStart_R1Position(t *testing.T) {
	// JK, R2, R3 — 조커가 R1을 대체
	tiles := mustParseTiles(t, []string{"JK1", "R2a", "R3a"})
	err := ValidateRun(tiles)
	assert.NoError(t, err)
}

// TestRun_JokerAtEnd_R13Position 조커가 R13 위치를 차지하는 런
func TestRun_JokerAtEnd_R13Position(t *testing.T) {
	tiles := mustParseTiles(t, []string{"R12a", "JK1", "R13a"})
	err := ValidateRun(tiles)
	// R12, JK, R13: span= 13-12+1=2, tiles=3, 갭 없음, JK는 사이에 끼어 넣을 수 없음
	// 사실 R12와 R13 사이에는 빈 곳이 없으므로 JK는 R11이어야 함
	// 이 경우 [R11(JK), R12, R13] → 유효
	assert.NoError(t, err)
}

// TestRun_UnsortedInput 입력 순서가 정렬되지 않아도 유효
func TestRun_UnsortedInput(t *testing.T) {
	// R5, R3, R4 — 정렬 안 됨
	tiles := mustParseTiles(t, []string{"R5a", "R3a", "R4a"})
	err := ValidateRun(tiles)
	assert.NoError(t, err, "정렬되지 않은 입력도 유효해야 한다")
}

// TestRun_FullRun_13Tiles 13장 전체 런 검증
func TestRun_FullRun_13Tiles(t *testing.T) {
	codes := make([]string, 13)
	for i := 0; i < 13; i++ {
		codes[i] = tilecode("B", i+1, "a")
	}
	tiles := mustParseTiles(t, codes)
	err := ValidateRun(tiles)
	assert.NoError(t, err, "13장 전체 런은 유효")
}

// ============================================================================
// 11. ValidateTurnConfirm — 복합 시나리오
// ============================================================================

// TestTurnConfirm_AfterMeld_CanRearrange 최초 등록 후 기존 세트 재배열 가능
func TestTurnConfirm_AfterMeld_CanRearrange(t *testing.T) {
	// 최초 등록 완료 상태에서 기존 테이블 타일 활용
	req := TurnConfirmRequest{
		TableBefore: []*TileSet{
			makeTileSet(t, "g1", []string{"R7a", "B7a", "K7b", "Y7a"}), // 4장 그룹
		},
		TableAfter: []*TileSet{
			makeTileSet(t, "g1", []string{"R7a", "B7a", "K7b"}),         // 3장으로 축소
			makeTileSet(t, "r1", []string{"Y7a", "Y8a", "Y9a", "Y10a"}), // Y7a를 런에 사용 + 3장 추가
		},
		RackBefore:     []string{"Y8a", "Y9a", "Y10a", "K2a"},
		RackAfter:      []string{"K2a"},
		HasInitialMeld: true,
	}
	err := ValidateTurnConfirm(req)
	assert.NoError(t, err, "최초 등록 후 재배열 유효")
}

// TestTurnConfirm_AllInvalidSetsOnTable 테이블에 모든 세트가 무효한 경우
func TestTurnConfirm_AllInvalidSetsOnTable(t *testing.T) {
	req := TurnConfirmRequest{
		TableBefore: []*TileSet{},
		TableAfter: []*TileSet{
			makeTileSet(t, "bad1", []string{"R1a", "B2a", "K3a"}), // 무효
		},
		RackBefore:     []string{"R1a", "B2a", "K3a"},
		RackAfter:      []string{},
		HasInitialMeld: true,
	}
	err := ValidateTurnConfirm(req)
	assert.Error(t, err, "무효 세트만 있는 테이블은 에러")
}

// TestTurnConfirm_WinCondition_EmptyRack 랙이 비면 승리
func TestTurnConfirm_WinCondition_EmptyRack(t *testing.T) {
	// 이 테스트는 engine 레이어가 아닌 service 레이어에서 처리되므로
	// engine 레이어에서는 유효성 검증만 테스트
	req := TurnConfirmRequest{
		TableBefore: []*TileSet{
			makeTileSet(t, "g1", []string{"R7a", "B7a", "K7b"}),
		},
		TableAfter: []*TileSet{
			makeTileSet(t, "g1", []string{"R7a", "B7a", "K7b"}),
			makeTileSet(t, "r1", []string{"Y1a", "Y2a", "Y3a"}),
		},
		RackBefore:     []string{"Y1a", "Y2a", "Y3a"}, // 3장만 남음
		RackAfter:      []string{},                      // 전부 사용 → 승리
		HasInitialMeld: true,
	}
	err := ValidateTurnConfirm(req)
	assert.NoError(t, err, "모든 타일 사용 → 유효 (승리 체크는 service에서)")
}

// ============================================================================
// 12. 조커만으로 구성된 세트 — 무효 확인
// ============================================================================

// TestJokerOnly_Group_Invalid 조커만 3장 그룹
func TestJokerOnly_Group_Invalid(t *testing.T) {
	tiles, _ := ParseAll([]string{"JK1", "JK2", "JK1"})
	err := ValidateGroup(tiles)
	require.Error(t, err)
	var ve *ValidationError
	assert.True(t, errors.As(err, &ve))
	assert.Equal(t, ErrRunNoNumber, ve.Code)
}

// TestJokerOnly_Run_Invalid 조커만 3장 런
func TestJokerOnly_Run_Invalid(t *testing.T) {
	tiles, _ := ParseAll([]string{"JK1", "JK2", "JK1"})
	err := ValidateRun(tiles)
	require.Error(t, err)
	var ve *ValidationError
	assert.True(t, errors.As(err, &ve))
	assert.Equal(t, ErrRunNoNumber, ve.Code)
}

// TestJokerOnly_TileSet_Invalid ValidateTileSet에서도 조커만 세트 무효
func TestJokerOnly_TileSet_Invalid(t *testing.T) {
	tiles, _ := ParseAll([]string{"JK1", "JK2", "JK1"})
	ts := &TileSet{ID: "test", Tiles: tiles}
	_, err := ValidateTileSet(ts)
	assert.Error(t, err, "조커만 세트는 그룹도 런도 아님")
}

// ============================================================================
// 13. runScore — 에지 케이스
// ============================================================================

// TestRunScore_FullRun 13장 전체 런 점수
func TestRunScore_FullRun(t *testing.T) {
	codes := make([]string, 13)
	for i := 0; i < 13; i++ {
		codes[i] = tilecode("R", i+1, "a")
	}
	tiles := mustParseTiles(t, codes)
	score := runScore(tiles)
	// 1+2+3+...+13 = 91
	assert.Equal(t, 91, score)
}

// ============================================================================
// 14. ValidateTable — 다양한 세트 조합
// ============================================================================

// TestValidateTable_MixedGroupsAndRuns 그룹과 런이 혼합된 테이블
func TestValidateTable_MixedGroupsAndRuns(t *testing.T) {
	sets := []*TileSet{
		makeTileSet(t, "g1", []string{"R7a", "B7a", "Y7a"}),
		makeTileSet(t, "r1", []string{"K1a", "K2a", "K3a"}),
		makeTileSet(t, "g2", []string{"R13a", "B13a", "K13b", "Y13a"}),
		makeTileSet(t, "r2", []string{"B9a", "B10a", "B11a", "B12a"}),
	}
	err := ValidateTable(sets)
	assert.NoError(t, err, "그룹+런 혼합 테이블 유효")
}

// TestValidateTable_OneInvalidAmongValid 하나라도 무효하면 전체 무효
func TestValidateTable_OneInvalidAmongValid(t *testing.T) {
	sets := []*TileSet{
		makeTileSet(t, "g1", []string{"R7a", "B7a", "Y7a"}),     // 유효
		makeTileSet(t, "bad", []string{"R1a", "R3a", "R5a"}),     // 무효 (비연속)
		makeTileSet(t, "r1", []string{"K1a", "K2a", "K3a"}),      // 유효
	}
	err := ValidateTable(sets)
	assert.Error(t, err, "무효 세트가 하나라도 있으면 전체 무효")
}

// ============================================================================
// 15. newlyAddedTiles 함수 테스트
// ============================================================================

// TestNewlyAddedTiles_Basic 기본 타일 추가 감지
func TestNewlyAddedTiles_Basic(t *testing.T) {
	before := []string{"R1a", "R2a", "R3a", "B4a", "B5a"}
	after := []string{"B4a", "B5a"}
	added := newlyAddedTiles(before, after)
	assert.ElementsMatch(t, []string{"R1a", "R2a", "R3a"}, added)
}

// TestNewlyAddedTiles_NoChange 변경 없음
func TestNewlyAddedTiles_NoChange(t *testing.T) {
	before := []string{"R1a", "R2a"}
	after := []string{"R1a", "R2a"}
	added := newlyAddedTiles(before, after)
	assert.Empty(t, added)
}

// TestNewlyAddedTiles_AllUsed 모든 타일 사용
func TestNewlyAddedTiles_AllUsed(t *testing.T) {
	before := []string{"R1a", "R2a", "R3a"}
	after := []string{}
	added := newlyAddedTiles(before, after)
	assert.ElementsMatch(t, []string{"R1a", "R2a", "R3a"}, added)
}

// TestNewlyAddedTiles_DuplicateCodes 중복 코드 처리
func TestNewlyAddedTiles_DuplicateCodes(t *testing.T) {
	// R1a가 2장 있는 경우 (a, b 세트)
	before := []string{"R1a", "R1a", "R2a"}
	after := []string{"R1a"}
	added := newlyAddedTiles(before, after)
	assert.ElementsMatch(t, []string{"R1a", "R2a"}, added)
}

// ============================================================================
// 16. collectTileCodes 함수 테스트
// ============================================================================

// TestCollectTileCodes_EmptyTable 빈 테이블
func TestCollectTileCodes_EmptyTable(t *testing.T) {
	freq := collectTileCodes([]*TileSet{})
	assert.Empty(t, freq)
}

// TestCollectTileCodes_MultipleSets 여러 세트
func TestCollectTileCodes_MultipleSets(t *testing.T) {
	sets := []*TileSet{
		makeTileSet(t, "g1", []string{"R7a", "B7a", "K7b"}),
		makeTileSet(t, "r1", []string{"R7a", "R8a", "R9a"}),
	}
	freq := collectTileCodes(sets)
	assert.Equal(t, 2, freq["R7a"]) // R7a가 두 세트에 존재 (실제로는 같은 타일이지만 코드 기반)
	assert.Equal(t, 1, freq["B7a"])
	assert.Equal(t, 1, freq["R8a"])
}

// ============================================================================
// 17. countTableTiles 함수 테스트
// ============================================================================

// TestCountTableTiles 테이블 타일 수 세기
func TestCountTableTiles(t *testing.T) {
	sets := []*TileSet{
		makeTileSet(t, "g1", []string{"R7a", "B7a", "K7b"}),
		makeTileSet(t, "r1", []string{"R1a", "R2a", "R3a", "R4a"}),
	}
	assert.Equal(t, 7, countTableTiles(sets))
}

// TestCountTableTiles_Empty 빈 테이블
func TestCountTableTiles_Empty(t *testing.T) {
	assert.Equal(t, 0, countTableTiles([]*TileSet{}))
}

// ============================================================================
// 헬퍼 함수
// ============================================================================

// tilecode 편의 함수: 색상+숫자+세트 → 타일 코드 문자열
func tilecode(color string, num int, set string) string {
	return color + intToStr(num) + set
}

// intToStr 정수를 문자열로 변환
func intToStr(n int) string {
	s := ""
	if n == 0 {
		return "0"
	}
	if n < 0 {
		s = "-"
		n = -n
	}
	digits := ""
	for n > 0 {
		digits = string(rune('0'+n%10)) + digits
		n /= 10
	}
	return s + digits
}

// makeTileSet 테스트용 TileSet을 생성하는 헬퍼 (validator_test.go의 makeSet 중복 방지)
func makeTileSet(t *testing.T, id string, codes []string) *TileSet {
	t.Helper()
	tiles, err := ParseAll(codes)
	require.NoError(t, err)
	return &TileSet{ID: id, Tiles: tiles}
}
