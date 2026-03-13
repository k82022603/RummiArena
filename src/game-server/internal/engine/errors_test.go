package engine

import (
	"errors"
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

// TestValidationError_ErrorString ValidationError.Error()가 "[코드] 메시지" 형식을 반환하는지 검증한다.
func TestValidationError_ErrorString(t *testing.T) {
	ve := &ValidationError{
		Code:    ErrSetSize,
		Message: "세트는 최소 3장 이상이어야 합니다.",
		Tiles:   []string{"JK1", "JK2"},
	}
	got := ve.Error()
	assert.Equal(t, "[ERR_SET_SIZE] 세트는 최소 3장 이상이어야 합니다.", got)
}

// TestValidationError_ImplementsError *ValidationError가 error 인터페이스를 만족하는지 확인한다.
func TestValidationError_ImplementsError(t *testing.T) {
	var err error = &ValidationError{Code: ErrRunNoNumber, Message: "조커만으로 세트를 구성할 수 없습니다"}
	assert.NotNil(t, err)
	assert.Contains(t, err.Error(), ErrRunNoNumber)
}

// TestValidationError_ErrorsAs errors.As를 통해 *ValidationError 타입 단언이 가능한지 검증한다.
func TestValidationError_ErrorsAs(t *testing.T) {
	// group.go: 조커만 그룹 → *ValidationError 반환 경로 테스트
	tiles, err := ParseAll([]string{"JK1", "JK2", "JK1"})
	// JK1 중복은 파싱 레벨에서 막히지 않으므로 ParseAll은 성공한다.
	// (같은 코드 중복은 풀에서만 방지하며, 파서 자체는 허용한다.)
	require.NoError(t, err, "ParseAll은 중복 코드를 거부하지 않는다")

	valErr := ValidateGroup(tiles)
	require.Error(t, valErr, "조커 3장 그룹은 무효여야 한다")

	var ve *ValidationError
	ok := errors.As(valErr, &ve)
	assert.True(t, ok, "*ValidationError 타입 단언이 가능해야 한다")
	assert.Equal(t, ErrRunNoNumber, ve.Code, "에러 코드는 ERR_RUN_NO_NUMBER이어야 한다")
}

// ------------------------------------------------------------------
// 조커만 세트 무효 처리 테스트 (TC-E-025g, TC-E-EC-03 대응)
// ------------------------------------------------------------------

// TestValidateGroup_JokerOnly_Invalid 조커만으로 구성된 그룹은 무효다.
// 설계 결정 B.3: 조커가 대체할 구체적인 숫자를 결정할 수 없으므로 무효 처리한다.
func TestValidateGroup_JokerOnly_Invalid(t *testing.T) {
	tests := []struct {
		name  string
		codes []string
	}{
		// TC-E-025g: 조커 2장 (크기도 미달)
		{name: "TC-E-025g 조커 2장 그룹", codes: []string{"JK1", "JK2"}},
		// 조커 3장 (크기는 충족, 숫자 타일 없음)
		{name: "조커 3장만 그룹", codes: []string{"JK1", "JK2", "JK1"}},
		// 조커 4장 (최대 크기, 숫자 타일 없음)
		{name: "조커 4장만 그룹", codes: []string{"JK1", "JK2", "JK1", "JK2"}},
	}

	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			tiles, _ := ParseAll(tc.codes)
			err := ValidateGroup(tiles)
			assert.Error(t, err, "조커만 구성 그룹은 무효이어야 한다")

			// 크기가 3 이상인 경우만 ValidationError 타입 단언 검증
			if len(tiles) >= 3 {
				var ve *ValidationError
				ok := errors.As(err, &ve)
				assert.True(t, ok, "*ValidationError 타입 단언이 가능해야 한다")
				assert.Equal(t, ErrRunNoNumber, ve.Code)
				assert.Contains(t, ve.Message, "조커만으로 세트를 구성할 수 없습니다")
			}
		})
	}
}

// TestValidateRun_JokerOnly_Invalid 조커만으로 구성된 런은 무효다.
// 설계 결정 B.3과 동일한 이유. 런은 색상/숫자 기준점을 결정할 수 없다.
func TestValidateRun_JokerOnly_Invalid(t *testing.T) {
	tests := []struct {
		name  string
		codes []string
	}{
		// 조커 3장 런 (크기는 충족, 숫자 타일 없음)
		{name: "조커 3장만 런", codes: []string{"JK1", "JK2", "JK1"}},
		// 조커 4장 런
		{name: "조커 4장만 런", codes: []string{"JK1", "JK2", "JK1", "JK2"}},
	}

	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			tiles, _ := ParseAll(tc.codes)
			err := ValidateRun(tiles)
			assert.Error(t, err, "조커만 구성 런은 무효이어야 한다")

			// *ValidationError 타입 단언 검증
			var ve *ValidationError
			ok := errors.As(err, &ve)
			assert.True(t, ok, "*ValidationError 타입 단언이 가능해야 한다")
			assert.Equal(t, ErrRunNoNumber, ve.Code)
			assert.Contains(t, ve.Message, "조커만으로 세트를 구성할 수 없습니다")
		})
	}
}

// TestValidateGroup_JokerOnly_ErrorMessage 조커만 그룹 에러 메시지가 일관성 있는지 확인한다.
func TestValidateGroup_JokerOnly_ErrorMessage(t *testing.T) {
	// 조커 3장: ValidateGroup이 ErrRunNoNumber + "조커만으로 세트를 구성할 수 없습니다" 반환
	tiles, _ := ParseAll([]string{"JK1", "JK2", "JK1"})
	err := ValidateGroup(tiles)
	require.Error(t, err)
	assert.Contains(t, err.Error(), "조커만으로 세트를 구성할 수 없습니다",
		"에러 메시지에 정책 설명이 포함되어야 한다")
}

// TestValidateRun_JokerOnly_ErrorMessage 조커만 런 에러 메시지가 일관성 있는지 확인한다.
func TestValidateRun_JokerOnly_ErrorMessage(t *testing.T) {
	tiles, _ := ParseAll([]string{"JK1", "JK2", "JK1"})
	err := ValidateRun(tiles)
	require.Error(t, err)
	assert.Contains(t, err.Error(), "조커만으로 세트를 구성할 수 없습니다",
		"에러 메시지에 정책 설명이 포함되어야 한다")
}
