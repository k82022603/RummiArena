package engine

// 검증 에러 코드 상수
// 각 코드는 V-01~V-15 규칙(game-rules.md, 09-game-engine-detail.md)에 대응한다.
const (
	// 세트 유효성 관련
	ErrInvalidSet          = "ERR_INVALID_SET"          // 그룹도 런도 아닌 세트 (V-01)
	ErrSetSize             = "ERR_SET_SIZE"              // 세트 크기 규칙 위반 (V-02)
	ErrGroupNumberMismatch = "ERR_GROUP_NUMBER"          // 그룹 내 숫자 불일치 (V-01)
	ErrGroupColorDup       = "ERR_GROUP_COLOR_DUP"       // 그룹 내 같은 색 중복 (V-14)
	ErrRunColor            = "ERR_RUN_COLOR"             // 런 내 색상 불일치 (V-01)
	ErrRunSequence         = "ERR_RUN_SEQUENCE"          // 런 숫자 비연속 / 순환 (V-15)
	ErrRunRange            = "ERR_RUN_RANGE"             // 런 숫자 범위 초과 1~13 (V-15)
	ErrRunDuplicate        = "ERR_RUN_DUPLICATE"         // 런 내 같은 숫자 중복 (V-15)
	ErrRunNoNumber         = "ERR_RUN_NO_NUMBER"         // 런에 숫자 타일 없음

	// 턴 규칙 관련
	ErrNoRackTile       = "ERR_NO_RACK_TILE"         // 랙에서 타일 미추가 (V-03)
	ErrTableTileMissing = "ERR_TABLE_TILE_MISSING"   // 테이블 타일 유실 (V-06)
	ErrJokerNotUsed     = "ERR_JOKER_NOT_USED"       // 교체한 조커 미사용 (V-07)

	// 최초 등록 관련
	ErrInitialMeldScore  = "ERR_INITIAL_MELD_SCORE"  // 30점 미달 (V-04)
	ErrInitialMeldSource = "ERR_INITIAL_MELD_SOURCE"  // 랙 외 타일 사용 (V-05)
	ErrNoRearrangePerm   = "ERR_NO_REARRANGE_PERM"   // 재배치 권한 없음 (V-13)

	// 턴 순서 관련 (service 레이어에서 주로 사용)
	ErrNotYourTurn   = "ERR_NOT_YOUR_TURN"    // 자기 턴이 아님 (V-08)
	ErrDrawPileEmpty = "ERR_DRAW_PILE_EMPTY"  // 드로우 파일 비어있음 (V-10)
	ErrTurnTimeout   = "ERR_TURN_TIMEOUT"     // 턴 타임아웃 (V-09)

	// 타일 파싱 관련
	ErrInvalidTileCode = "ERR_INVALID_TILE_CODE" // 유효하지 않은 타일 코드
)

// ErrorMessages 에러 코드 → 사용자 표시용 한글 메시지 매핑
var ErrorMessages = map[string]string{
	ErrInvalidSet:          "유효하지 않은 타일 조합입니다. 그룹 또는 런을 확인하세요.",
	ErrSetSize:             "세트는 최소 3장 이상이어야 합니다.",
	ErrGroupNumberMismatch: "그룹의 모든 타일은 같은 숫자여야 합니다.",
	ErrGroupColorDup:       "그룹에 같은 색상의 타일이 중복됩니다.",
	ErrRunColor:            "런의 모든 타일은 같은 색상이어야 합니다.",
	ErrRunSequence:         "런의 숫자가 연속적이지 않습니다.",
	ErrRunRange:            "런의 숫자가 1~13 범위를 벗어났습니다.",
	ErrRunDuplicate:        "런에 같은 숫자의 타일이 중복됩니다.",
	ErrRunNoNumber:         "런에 숫자 타일이 최소 1장 이상 필요합니다.",
	ErrNoRackTile:          "랙에서 최소 1장 이상의 타일을 내려놓아야 합니다.",
	ErrTableTileMissing:    "테이블에서 타일이 유실되었습니다.",
	ErrJokerNotUsed:        "교체한 조커를 같은 턴 내에 사용해야 합니다.",
	ErrInitialMeldScore:    "최초 등록은 합계 30점 이상이어야 합니다.",
	ErrInitialMeldSource:   "최초 등록은 자신의 랙 타일만 사용해야 합니다.",
	ErrNoRearrangePerm:     "최초 등록 전에는 테이블 재배치가 불가합니다.",
	ErrNotYourTurn:         "자신의 턴이 아닙니다.",
	ErrDrawPileEmpty:       "드로우 파일이 비어있습니다.",
	ErrTurnTimeout:         "턴 시간이 초과되었습니다.",
	ErrInvalidTileCode:     "유효하지 않은 타일 코드입니다.",
}
