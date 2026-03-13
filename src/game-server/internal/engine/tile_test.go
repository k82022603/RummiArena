package engine

import (
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

// TestParse_ValidNormalTile 정상 타일 코드를 올바르게 파싱하는지 검증한다.
func TestParse_ValidNormalTile(t *testing.T) {
	tests := []struct {
		name        string
		code        string
		wantColor   string
		wantNumber  int
		wantSet     string
		wantIsJoker bool
	}{
		// 각 색상 단일 케이스
		{name: "빨강 7 세트a", code: "R7a", wantColor: ColorRed, wantNumber: 7, wantSet: "a"},
		{name: "파랑 7 세트a", code: "B7a", wantColor: ColorBlue, wantNumber: 7, wantSet: "a"},
		{name: "노랑 7 세트a", code: "Y7a", wantColor: ColorYellow, wantNumber: 7, wantSet: "a"},
		{name: "검정 7 세트a", code: "K7a", wantColor: ColorBlack, wantNumber: 7, wantSet: "a"},
		// 세트 b
		{name: "빨강 7 세트b", code: "R7b", wantColor: ColorRed, wantNumber: 7, wantSet: "b"},
		// 숫자 경계값
		{name: "최솟값 1", code: "R1a", wantColor: ColorRed, wantNumber: 1, wantSet: "a"},
		{name: "최댓값 13", code: "B13b", wantColor: ColorBlue, wantNumber: 13, wantSet: "b"},
		{name: "두 자리 숫자 10", code: "Y10a", wantColor: ColorYellow, wantNumber: 10, wantSet: "a"},
		{name: "두 자리 숫자 11", code: "K11a", wantColor: ColorBlack, wantNumber: 11, wantSet: "a"},
		{name: "두 자리 숫자 12", code: "R12b", wantColor: ColorRed, wantNumber: 12, wantSet: "b"},
	}

	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			got, err := Parse(tc.code)
			require.NoError(t, err)
			assert.Equal(t, tc.code, got.Code)
			assert.Equal(t, tc.wantColor, got.Color)
			assert.Equal(t, tc.wantNumber, got.Number)
			assert.Equal(t, tc.wantSet, got.Set)
			assert.False(t, got.IsJoker)
		})
	}
}

// TestParse_ValidJoker 조커 타일 코드를 올바르게 파싱하는지 검증한다.
func TestParse_ValidJoker(t *testing.T) {
	tests := []struct {
		name string
		code string
	}{
		{name: "조커 1번", code: "JK1"},
		{name: "조커 2번", code: "JK2"},
	}

	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			got, err := Parse(tc.code)
			require.NoError(t, err)
			assert.Equal(t, tc.code, got.Code)
			assert.True(t, got.IsJoker)
			assert.Empty(t, got.Color)
			assert.Zero(t, got.Number)
		})
	}
}

// TestParse_InvalidCode 잘못된 타일 코드에서 에러가 반환되는지 검증한다.
func TestParse_InvalidCode(t *testing.T) {
	tests := []struct {
		name string
		code string
	}{
		{name: "빈 문자열", code: ""},
		{name: "너무 짧은 코드", code: "R"},
		{name: "잘못된 색상", code: "X7a"},
		{name: "잘못된 색상 소문자", code: "r7a"},
		{name: "잘못된 세트 문자 c", code: "R7c"},
		{name: "잘못된 세트 문자 숫자", code: "R71"},
		{name: "범위 초과 숫자 0", code: "R0a"},
		{name: "범위 초과 숫자 14", code: "R14a"},
		{name: "범위 초과 숫자 99", code: "R99a"},
		{name: "숫자 없음", code: "Ra"},
		{name: "잘못된 조커 코드 JK3", code: "JK3"},
		{name: "잘못된 조커 코드 JK0", code: "JK0"},
		{name: "음수 숫자", code: "R-1a"},
	}

	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			got, err := Parse(tc.code)
			assert.Error(t, err, "코드 %q는 에러를 반환해야 한다", tc.code)
			assert.Nil(t, got)
		})
	}
}

// TestParse_RoundTrip 파싱된 타일의 Code 필드가 원본 코드와 일치하는지 검증한다.
func TestParse_RoundTrip(t *testing.T) {
	codes := []string{
		"R1a", "R13b", "B7a", "Y10b", "K3a",
		"JK1", "JK2",
	}
	for _, code := range codes {
		t.Run(code, func(t *testing.T) {
			tile, err := Parse(code)
			require.NoError(t, err)
			assert.Equal(t, code, tile.Code, "Code 필드가 원본 코드와 일치해야 한다")
		})
	}
}

// TestParseAll_Valid 슬라이스 파싱이 올바르게 동작하는지 검증한다.
func TestParseAll_Valid(t *testing.T) {
	codes := []string{"R7a", "B7a", "K7b"}
	tiles, err := ParseAll(codes)
	require.NoError(t, err)
	require.Len(t, tiles, 3)
	assert.Equal(t, "R7a", tiles[0].Code)
	assert.Equal(t, "B7a", tiles[1].Code)
	assert.Equal(t, "K7b", tiles[2].Code)
}

// TestParseAll_WithSpaces 앞뒤 공백이 포함된 코드를 트리밍하여 파싱한다.
func TestParseAll_WithSpaces(t *testing.T) {
	codes := []string{" R7a ", " JK1 "}
	tiles, err := ParseAll(codes)
	require.NoError(t, err)
	assert.Len(t, tiles, 2)
}

// TestParseAll_InvalidContained 하나라도 무효한 코드가 있으면 에러를 반환한다.
func TestParseAll_InvalidContained(t *testing.T) {
	codes := []string{"R7a", "INVALID", "K7b"}
	tiles, err := ParseAll(codes)
	assert.Error(t, err)
	assert.Nil(t, tiles)
}

// TestTile_Score 타일 점수 계산이 규칙에 맞는지 검증한다.
func TestTile_Score(t *testing.T) {
	tests := []struct {
		name      string
		code      string
		wantScore int
	}{
		{name: "숫자 타일 1점", code: "R1a", wantScore: 1},
		{name: "숫자 타일 7점", code: "B7a", wantScore: 7},
		{name: "숫자 타일 13점", code: "K13b", wantScore: 13},
		{name: "조커 30점", code: "JK1", wantScore: JokerScore},
		{name: "조커2 30점", code: "JK2", wantScore: JokerScore},
	}

	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			tile, err := Parse(tc.code)
			require.NoError(t, err)
			assert.Equal(t, tc.wantScore, tile.Score())
		})
	}
}

// TestGenerateDeck_TileCount 전체 덱이 106장인지 검증한다.
func TestGenerateDeck_TileCount(t *testing.T) {
	deck := GenerateDeck()
	assert.Len(t, deck, 106, "전체 덱은 정확히 106장이어야 한다")
}

// TestGenerateDeck_Composition 덱 구성을 검증한다 (숫자 104장 + 조커 2장).
func TestGenerateDeck_Composition(t *testing.T) {
	deck := GenerateDeck()

	jokerCount := 0
	normalCount := 0
	colorCounts := map[string]int{}
	setCounts := map[string]int{}

	for _, tile := range deck {
		if tile.IsJoker {
			jokerCount++
		} else {
			normalCount++
			colorCounts[tile.Color]++
			setCounts[tile.Set]++
		}
	}

	assert.Equal(t, 2, jokerCount, "조커는 2장이어야 한다")
	assert.Equal(t, 104, normalCount, "숫자 타일은 104장이어야 한다")

	// 각 색상당 13숫자 × 2세트 = 26장
	for _, color := range []string{ColorRed, ColorBlue, ColorYellow, ColorBlack} {
		assert.Equal(t, 26, colorCounts[color],
			"색상 %s는 26장이어야 한다", color)
	}

	// 세트 a, b 각각 52장 (4색 × 13숫자)
	assert.Equal(t, 52, setCounts["a"], "세트 a는 52장이어야 한다")
	assert.Equal(t, 52, setCounts["b"], "세트 b는 52장이어야 한다")
}

// TestGenerateDeck_AllNumbersPresent 1~13 모든 숫자가 덱에 존재하는지 검증한다.
func TestGenerateDeck_AllNumbersPresent(t *testing.T) {
	deck := GenerateDeck()
	numberCounts := map[int]int{}

	for _, tile := range deck {
		if !tile.IsJoker {
			numberCounts[tile.Number]++
		}
	}

	// 각 숫자는 4색 × 2세트 = 8장씩 존재
	for n := 1; n <= 13; n++ {
		assert.Equal(t, 8, numberCounts[n],
			"숫자 %d는 8장이어야 한다 (4색×2세트)", n)
	}
}

// TestGenerateDeck_NoDuplicateCodes 덱 내 타일 코드가 중복되지 않는지 검증한다.
func TestGenerateDeck_NoDuplicateCodes(t *testing.T) {
	deck := GenerateDeck()
	seen := make(map[string]bool)

	for _, tile := range deck {
		assert.False(t, seen[tile.Code],
			"코드 %q가 중복된다", tile.Code)
		seen[tile.Code] = true
	}
}
