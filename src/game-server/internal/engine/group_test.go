package engine

import (
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

// mustParseTiles 테스트 헬퍼: 파싱 실패 시 테스트를 즉시 중단한다.
func mustParseTiles(t *testing.T, codes []string) []*Tile {
	t.Helper()
	tiles, err := ParseAll(codes)
	require.NoError(t, err, "타일 파싱 실패: %v", codes)
	return tiles
}

// TestValidateGroup_ValidCases 유효한 그룹에 대해 nil 에러를 반환하는지 검증한다 (V-01, V-14).
func TestValidateGroup_ValidCases(t *testing.T) {
	tests := []struct {
		name  string
		codes []string
	}{
		// G-01: 3색 3장 기본 그룹
		{name: "G-01 빨강/파랑/검정 7", codes: []string{"R7a", "B7a", "K7b"}},
		// G-02: 4색 4장 그룹
		{name: "G-02 4색 5 그룹", codes: []string{"R5a", "B5a", "Y5a", "K5b"}},
		// G-09: 숫자 10 그룹
		{name: "G-09 10 그룹 3장", codes: []string{"R10a", "B10a", "K10b"}},
		// 경계값: 숫자 1
		{name: "숫자 1 그룹", codes: []string{"R1a", "B1a", "Y1b"}},
		// 경계값: 숫자 13
		{name: "숫자 13 그룹", codes: []string{"R13a", "B13b", "K13a"}},
		// 세트 a/b 혼합
		{name: "세트 a와 b 혼합", codes: []string{"Y3a", "B3b", "R3a"}},
	}

	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			tiles := mustParseTiles(t, tc.codes)
			err := ValidateGroup(tiles)
			assert.NoError(t, err, "유효한 그룹은 에러 없이 통과해야 한다")
		})
	}
}

// TestValidateGroup_TwoTiles 2장 그룹은 무효다 (V-02: 세트 크기 3~4장).
func TestValidateGroup_TwoTiles(t *testing.T) {
	tiles := mustParseTiles(t, []string{"R7a", "B7a"})
	err := ValidateGroup(tiles)
	assert.Error(t, err, "2장 그룹은 무효이어야 한다")
}

// TestValidateGroup_FiveTiles 5장 이상 그룹은 무효다 (V-14: 최대 4장).
func TestValidateGroup_FiveTiles(t *testing.T) {
	// G-07: 5장 그룹 (조커 포함)
	tiles := mustParseTiles(t, []string{"R7a", "B7a", "Y7a", "K7b", "JK1"})
	err := ValidateGroup(tiles)
	assert.Error(t, err, "5장 그룹은 무효이어야 한다")
}

// TestValidateGroup_DuplicateColor 같은 색상이 중복된 그룹은 무효다 (V-14).
func TestValidateGroup_DuplicateColor(t *testing.T) {
	tests := []struct {
		name  string
		codes []string
	}{
		// G-05: 빨강 중복
		{name: "G-05 빨강 중복", codes: []string{"R7a", "R7b", "B7a"}},
		// 파랑 중복 4장
		{name: "파랑 중복 4장", codes: []string{"R8a", "B8a", "B8b", "K8a"}},
	}

	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			tiles := mustParseTiles(t, tc.codes)
			err := ValidateGroup(tiles)
			assert.Error(t, err, "같은 색상 중복 그룹은 무효이어야 한다")
		})
	}
}

// TestValidateGroup_NumberMismatch 숫자가 다른 타일이 포함된 그룹은 무효다 (V-01).
func TestValidateGroup_NumberMismatch(t *testing.T) {
	tests := []struct {
		name  string
		codes []string
	}{
		// G-06: 숫자 불일치 (7, 8)
		{name: "G-06 7과 8 혼합", codes: []string{"R7a", "B8a", "K7b"}},
		// 세 가지 숫자 혼합
		{name: "세 숫자 혼합", codes: []string{"R1a", "B2a", "Y3a"}},
	}

	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			tiles := mustParseTiles(t, tc.codes)
			err := ValidateGroup(tiles)
			assert.Error(t, err, "숫자가 다른 그룹은 무효이어야 한다")
		})
	}
}

// TestValidateGroup_WithJoker 조커가 포함된 그룹 검증 (V-12: 조커는 빠진 색상을 대체).
func TestValidateGroup_WithJoker(t *testing.T) {
	tests := []struct {
		name    string
		codes   []string
		wantErr bool
	}{
		// G-03: 3장 그룹에 조커 1개 (유효)
		{name: "G-03 조커 포함 3장", codes: []string{"R3a", "JK1", "Y3a"}, wantErr: false},
		// G-10: 조커 2개 + 숫자 1장 (유효)
		{name: "G-10 조커 2개 + 숫자 1장", codes: []string{"JK1", "R7a", "JK2"}, wantErr: false},
		// 4장 그룹 조커 1개 (유효)
		{name: "4장 그룹 조커 1개", codes: []string{"R5a", "B5b", "Y5a", "JK1"}, wantErr: false},
		// 조커 2개 숫자 2장 (유효, 4장 그룹)
		{name: "조커2 + 숫자2 (4장)", codes: []string{"JK1", "JK2", "R9a", "B9b"}, wantErr: false},
	}

	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			tiles := mustParseTiles(t, tc.codes)
			err := ValidateGroup(tiles)
			if tc.wantErr {
				assert.Error(t, err)
			} else {
				assert.NoError(t, err)
			}
		})
	}
}

// TestValidateGroup_OneTile 1장 그룹은 무효다.
func TestValidateGroup_OneTile(t *testing.T) {
	tiles := mustParseTiles(t, []string{"R7a"})
	err := ValidateGroup(tiles)
	assert.Error(t, err)
}

// TestValidateGroup_EmptySlice 빈 슬라이스는 무효다.
func TestValidateGroup_EmptySlice(t *testing.T) {
	err := ValidateGroup([]*Tile{})
	assert.Error(t, err)
}

// TestGroupScore 그룹 점수 계산이 올바른지 검증한다 (appendix A.1 기준).
func TestGroupScore(t *testing.T) {
	tests := []struct {
		name      string
		codes     []string
		wantScore int
	}{
		// G-01: R7a + B7a + K7b = 7+7+7 = 21
		{name: "G-01 7 그룹 3장 점수 21", codes: []string{"R7a", "B7a", "K7b"}, wantScore: 21},
		// G-02: R5a + B5a + Y5a + K5b = 5×4 = 20
		{name: "G-02 5 그룹 4장 점수 20", codes: []string{"R5a", "B5a", "Y5a", "K5b"}, wantScore: 20},
		// G-09: 10 × 3 = 30
		{name: "G-09 10 그룹 3장 점수 30", codes: []string{"R10a", "B10a", "K10b"}, wantScore: 30},
		// 조커 포함: R3a + JK1 + Y3a = 3+3+3 = 9 (조커는 그룹 기준 숫자로 계산)
		{name: "G-03 조커 포함 3 그룹 점수 9", codes: []string{"R3a", "JK1", "Y3a"}, wantScore: 9},
		// G-10: JK1 + R7a + JK2 = 7+7+7 = 21
		{name: "G-10 조커2 + R7a 점수 21", codes: []string{"JK1", "R7a", "JK2"}, wantScore: 21},
	}

	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			tiles := mustParseTiles(t, tc.codes)
			got := groupScore(tiles)
			assert.Equal(t, tc.wantScore, got)
		})
	}
}
