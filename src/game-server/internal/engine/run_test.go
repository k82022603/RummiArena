package engine

import (
	"testing"

	"github.com/stretchr/testify/assert"
)

// TestValidateRun_ValidCases 유효한 런에 대해 nil 에러를 반환하는지 검증한다 (V-01, V-15).
func TestValidateRun_ValidCases(t *testing.T) {
	tests := []struct {
		name  string
		codes []string
	}{
		// R-01: 노랑 3-4-5
		{name: "R-01 Y3-Y4-Y5", codes: []string{"Y3a", "Y4a", "Y5a"}},
		// R-02: 파랑 9-10-11-12 (4장)
		{name: "R-02 B9-B10-B11-B12", codes: []string{"B9a", "B10b", "B11a", "B12a"}},
		// R-03: 빨강 1-2-3 (최소 경계값)
		{name: "R-03 R1-R2-R3", codes: []string{"R1a", "R2a", "R3a"}},
		// 경계값: 11-12-13 (최대 경계값)
		{name: "K11-K12-K13 (최댓값 경계)", codes: []string{"K11a", "K12b", "K13a"}},
		// 더 긴 런 5장
		{name: "Y5-Y6-Y7-Y8-Y9 (5장)", codes: []string{"Y5a", "Y6a", "Y7a", "Y8a", "Y9b"}},
		// 세트 a/b 혼합
		{name: "R세트 혼합 a/b", codes: []string{"R4a", "R5b", "R6a"}},
	}

	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			tiles := mustParseTiles(t, tc.codes)
			err := ValidateRun(tiles)
			assert.NoError(t, err, "유효한 런은 에러 없이 통과해야 한다")
		})
	}
}

// TestValidateRun_TwoTiles 2장 런은 무효다 (V-02: 최소 3장).
func TestValidateRun_TwoTiles(t *testing.T) {
	// R-09: K7a, K8a 두 장
	tiles := mustParseTiles(t, []string{"K7a", "K8a"})
	err := ValidateRun(tiles)
	assert.Error(t, err, "2장 런은 무효이어야 한다")
}

// TestValidateRun_OneTile 1장 런은 무효다.
func TestValidateRun_OneTile(t *testing.T) {
	tiles := mustParseTiles(t, []string{"R5a"})
	err := ValidateRun(tiles)
	assert.Error(t, err)
}

// TestValidateRun_WrapAround 13-1 순환 런은 무효다 (V-15: 순환 불가).
func TestValidateRun_WrapAround(t *testing.T) {
	// R-07: R12a, R13a, R1a — 13에서 1로 순환
	tiles := mustParseTiles(t, []string{"R12a", "R13a", "R1a"})
	err := ValidateRun(tiles)
	assert.Error(t, err, "13-1 순환 런은 무효이어야 한다")
}

// TestValidateRun_MixedColor 색상이 혼합된 런은 무효다 (V-01).
func TestValidateRun_MixedColor(t *testing.T) {
	tests := []struct {
		name  string
		codes []string
	}{
		// R-08: R3a, B4a, Y5a
		{name: "R-08 세 가지 색상 혼합", codes: []string{"R3a", "B4a", "Y5a"}},
		// 두 가지 색상 혼합
		{name: "두 색상 혼합 R/B", codes: []string{"R5a", "B6a", "R7a"}},
	}

	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			tiles := mustParseTiles(t, tc.codes)
			err := ValidateRun(tiles)
			assert.Error(t, err, "색상 혼합 런은 무효이어야 한다")
		})
	}
}

// TestValidateRun_WithJoker 조커 포함 런 검증 (V-12).
func TestValidateRun_WithJoker(t *testing.T) {
	tests := []struct {
		name    string
		codes   []string
		wantErr bool
	}{
		// R-04: K11a, K12b, JK1 — 조커가 13 위치를 채움
		{name: "R-04 K11-K12-JK(13)", codes: []string{"K11a", "K12b", "JK1"}, wantErr: false},
		// R-05: R3a, JK1, R5a — 조커가 중간(4) 위치를 채움
		{name: "R-05 R3-JK(4)-R5", codes: []string{"R3a", "JK1", "R5a"}, wantErr: false},
		// 조커가 앞에 위치: JK1, R1a, R2a
		{name: "JK(앞)-R1-R2", codes: []string{"JK1", "R1a", "R2a"}, wantErr: false},
		// 조커 2개 갭: R3a, JK1, JK2, R6a
		{name: "R3-JK-JK-R6 (두 갭)", codes: []string{"R3a", "JK1", "JK2", "R6a"}, wantErr: false},
		// 뒤쪽 조커가 불가한 경우 앞으로: K12a, K13b, JK1, JK2 → 앞으로 [10,11,12,13]
		{name: "K12-K13-JK-JK (앞쪽 배치)", codes: []string{"K12a", "K13b", "JK1", "JK2"}, wantErr: false},
	}

	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			tiles := mustParseTiles(t, tc.codes)
			err := ValidateRun(tiles)
			if tc.wantErr {
				assert.Error(t, err)
			} else {
				assert.NoError(t, err, "조커 포함 유효한 런은 에러 없이 통과해야 한다")
			}
		})
	}
}

// TestValidateRun_DuplicateNumber 런에서 같은 숫자가 중복되면 무효다 (V-15).
func TestValidateRun_DuplicateNumber(t *testing.T) {
	// R-11: R3a, R3b, R4a — 같은 숫자 3이 중복
	tiles := mustParseTiles(t, []string{"R3a", "R3b", "R4a"})
	err := ValidateRun(tiles)
	assert.Error(t, err, "같은 숫자 중복 런은 무효이어야 한다")
}

// TestValidateRun_LongRun 긴 런(3~13장) 검증.
func TestValidateRun_LongRun(t *testing.T) {
	tests := []struct {
		name  string
		codes []string
	}{
		{name: "3장 런", codes: []string{"R1a", "R2a", "R3a"}},
		{name: "6장 런", codes: []string{"B3a", "B4a", "B5a", "B6a", "B7a", "B8a"}},
		{name: "10장 런", codes: []string{
			"Y1a", "Y2a", "Y3a", "Y4a", "Y5a",
			"Y6a", "Y7a", "Y8a", "Y9a", "Y10a",
		}},
	}

	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			tiles := mustParseTiles(t, tc.codes)
			err := ValidateRun(tiles)
			assert.NoError(t, err)
		})
	}
}

// TestValidateRun_FullRun 13장 전체 런은 유효하다 (R-10).
func TestValidateRun_FullRun(t *testing.T) {
	// R-10: R1a ~ R13a, 총 13장
	codes := make([]string, 13)
	sets := []string{"a", "b"}
	for i := 1; i <= 13; i++ {
		codes[i-1] = "R" + string(rune('0'+i/10)) + string(rune('0'+i%10))
		if i < 10 {
			codes[i-1] = "R" + string(rune('0'+i)) + sets[(i-1)%2]
		} else {
			// 10, 11, 12, 13
			tens := i / 10
			ones := i % 10
			codes[i-1] = "R" + string(rune('0'+tens)) + string(rune('0'+ones)) + sets[(i-1)%2]
		}
	}

	// 직접 코드 생성
	fullRunCodes := []string{
		"R1a", "R2a", "R3a", "R4a", "R5a", "R6a", "R7a",
		"R8a", "R9a", "R10a", "R11a", "R12a", "R13a",
	}
	tiles := mustParseTiles(t, fullRunCodes)
	err := ValidateRun(tiles)
	assert.NoError(t, err, "13장 전체 런은 유효해야 한다")
}

// TestValidateRun_NonConsecutive 비연속 런은 무효다 (V-15).
func TestValidateRun_NonConsecutive(t *testing.T) {
	tests := []struct {
		name  string
		codes []string
	}{
		// R-06: Y3a, Y5a, Y6a — 3과 5 사이 갭이 있고 조커 없음
		{name: "R-06 Y3-Y5-Y6 (갭 있음)", codes: []string{"Y3a", "Y5a", "Y6a"}},
		// 큰 갭: R1a, R5a, R9a
		{name: "큰 갭 R1-R5-R9", codes: []string{"R1a", "R5a", "R9a"}},
	}

	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			tiles := mustParseTiles(t, tc.codes)
			err := ValidateRun(tiles)
			assert.Error(t, err, "비연속 런은 무효이어야 한다")
		})
	}
}

// TestValidateRun_EmptySlice 빈 슬라이스는 무효다.
func TestValidateRun_EmptySlice(t *testing.T) {
	err := ValidateRun([]*Tile{})
	assert.Error(t, err)
}

// TestRunScore 런 점수 계산이 올바른지 검증한다 (appendix A.2 기준).
func TestRunScore(t *testing.T) {
	tests := []struct {
		name      string
		codes     []string
		wantScore int
	}{
		// R-01: Y3+Y4+Y5 = 12
		{name: "R-01 Y3-Y4-Y5 점수 12", codes: []string{"Y3a", "Y4a", "Y5a"}, wantScore: 12},
		// R-02: B9+B10+B11+B12 = 42
		{name: "R-02 B9-B12 점수 42", codes: []string{"B9a", "B10b", "B11a", "B12a"}, wantScore: 42},
		// R-03: R1+R2+R3 = 6
		{name: "R-03 R1-R2-R3 점수 6", codes: []string{"R1a", "R2a", "R3a"}, wantScore: 6},
		// R-04: K11+K12+JK(13) = 36
		{name: "R-04 K11-K12-JK(13) 점수 36", codes: []string{"K11a", "K12b", "JK1"}, wantScore: 36},
		// R-05: R3+JK(4)+R5 = 12
		{name: "R-05 R3-JK(4)-R5 점수 12", codes: []string{"R3a", "JK1", "R5a"}, wantScore: 12},
	}

	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			tiles := mustParseTiles(t, tc.codes)
			got := runScore(tiles)
			assert.Equal(t, tc.wantScore, got)
		})
	}
}
