package service

// process_ai_place_id_test.go — PR-D-S02 RED spec
//
// INC-T11-IDDUP 사고 회귀 방지:
//   processAIPlace (ws_handler.go:1061) 에서 service.TilePlacement{Tiles: g.Tiles} 로 ID 미할당.
//   → ConfirmTurn → convertToSetOnTable → model.SetOnTable.ID = "" → DB 적재.
//   → 클라이언트에서 빈 ID 그룹 합병 시 D-01(ID 중복) 위반.
//
// 해결 경로 (결단 #2):
//   processAIPlace 에서 handler 레벨 UUID 발급 금지 → service.convertToSetOnTable SSOT.
//   convertToSetOnTable 이 빈 ID 를 UUID v4 로 교체하면 processAIPlace 는 수정 없이 동작.
//
// 본 RED spec 의 역할:
//   processAIPlace 가 전송하는 빈 ID TilePlacement 를 직접 ConfirmTurn 에 전달할 때
//   보드에 적재된 그룹의 ID 가 UUID v4 인지 검증한다.
//   현재 구현 (convertToSetOnTable 이 ID 를 그대로 통과) 에서는 FAIL 이어야 한다.
//
// 참조 SSOT:
//   - docs/02-design/55-game-rules-enumeration.md §2.21 (V-17), §4 (D-01, D-12)
//   - docs/04-testing/86 §3.1 (INC-T11-IDDUP 사고)
//   - docs/04-testing/87 §2 (processAIPlace L:1061 위반 분석)
//   - docs/04-testing/88 §4.2 (서버 단위 3건)
//   - work_logs/plans/2026-04-25-phase-c-implementation-dispatch.md §3.2
//
// RED→GREEN 정책 (G3 게이트):
//   이 파일 3건 모두 현재 구현에서 FAIL 해야 한다.
//   PR-D-S01 GREEN (convertToSetOnTable UUID 발급) 적용 후 모두 GREEN 이어야 한다.

import (
	"regexp"
	"testing"

	"github.com/k82022603/RummiArena/game-server/internal/model"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

// uuidV4REai UUID v4 검증 정규식 (이 파일 전용 — v17 파일과 충돌 방지)
var uuidV4REai = regexp.MustCompile(`^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$`)

func isUUIDv4AI(s string) bool {
	return uuidV4REai.MatchString(s)
}

// --- INC-T11-IDDUP 서버 단위 (a): processAIPlace 호출 시뮬레이션 → 모든 그룹 id != "" ---
//
// processAIPlace 는 service.TilePlacement{Tiles: g.Tiles} (ID 없음) 로 ConfirmTurn 을 호출한다.
// [RED] 현재 convertToSetOnTable 은 빈 ID 를 그대로 통과 → 보드에 "" 적재 → id != "" 실패.
// [GREEN after fix] convertToSetOnTable 이 빈 ID 를 UUID v4 로 교체.
//
// SSOT refs: V-17, D-12, INC-T11-IDDUP
func TestProcessAIPlace_Simulation_AllGroupIDsNonEmpty(t *testing.T) {
	// AI 초기 멜드 완료 상태, 랙에 배치할 타일 보유
	rack0 := []string{"R5a", "R6a", "R7a", "K2a"}
	svc, repo := seedWithInitialMeld(t,
		"game-ai-place-nonemp",
		rack0,
		[]*model.SetOnTable{},
		[]string{"Y1a", "Y2a"},
	)

	// processAIPlace 에서 전송하는 것과 동일한 빈 ID TilePlacement
	// (ws_handler.go:1061: service.TilePlacement{Tiles: g.Tiles})
	req := &ConfirmRequest{
		Seat: 0,
		TableGroups: []TilePlacement{
			{ID: "", Tiles: []string{"R5a", "R6a", "R7a"}}, // ID 없음 — processAIPlace 재현
		},
		TilesFromRack: []string{"R5a", "R6a", "R7a"},
	}

	result, err := svc.ConfirmTurn("game-ai-place-nonemp", req)
	require.NoError(t, err, "INC-T11-IDDUP: 유효 배치는 에러 없어야 한다")
	require.True(t, result.Success, "INC-T11-IDDUP: Success=true")

	saved, err := repo.GetGameState("game-ai-place-nonemp")
	require.NoError(t, err)
	require.Len(t, saved.Table, 1, "INC-T11-IDDUP: 보드에 1개 그룹")

	// [RED assertion] 현재 구현: saved.Table[0].ID == "" → FAIL
	assert.NotEmpty(t, saved.Table[0].ID,
		"V-17: processAIPlace 경로에서도 그룹 ID 는 비어있으면 안 된다")
}

// --- INC-T11-IDDUP 서버 단위 (b): processAIPlace 경로 그룹 ID 가 UUID v4 형식인지 ---
//
// [RED] 현재 구현: ID = "" → isUUIDv4AI("") == false → FAIL.
// [GREEN after fix] UUID v4 형식 발급.
//
// SSOT refs: V-17 "UUID v4 형식", D-01
func TestProcessAIPlace_Simulation_GroupIDIsUUIDv4(t *testing.T) {
	rack0 := []string{"B4a", "B5a", "B6a", "K3a"}
	svc, repo := seedWithInitialMeld(t,
		"game-ai-place-uuid",
		rack0,
		[]*model.SetOnTable{},
		[]string{"Y1a"},
	)

	// processAIPlace 재현: 빈 ID + Tiles 만 포함
	req := &ConfirmRequest{
		Seat: 0,
		TableGroups: []TilePlacement{
			{ID: "", Tiles: []string{"B4a", "B5a", "B6a"}},
		},
		TilesFromRack: []string{"B4a", "B5a", "B6a"},
	}

	_, err := svc.ConfirmTurn("game-ai-place-uuid", req)
	require.NoError(t, err, "INC-T11-IDDUP: 유효 배치는 에러 없어야 한다")

	saved, err := repo.GetGameState("game-ai-place-uuid")
	require.NoError(t, err)
	require.Len(t, saved.Table, 1)

	// [RED assertion] 현재 구현: saved.Table[0].ID == "" → isUUIDv4AI FAIL
	assert.True(t, isUUIDv4AI(saved.Table[0].ID),
		"V-17: processAIPlace 경로의 그룹 ID 는 UUID v4 형식이어야 한다. got=%q",
		saved.Table[0].ID)
}

// --- INC-T11-IDDUP 서버 단위 (c): 연속 게임에서 다른 UUID 발급 ---
//
// 동일 빈 ID 입력으로 두 개의 다른 게임을 처리할 때 서로 다른 UUID 가 발급되어야 한다.
// [RED] 현재 구현: 두 게임 모두 ID = "" → 실질적으로 같음 → assert.NotEqual FAIL.
// [GREEN after fix] 각 호출마다 새 UUID v4 생성 → 서로 다름.
//
// SSOT refs: V-17, D-01 (유니크)
func TestProcessAIPlace_TwoCalls_GetDifferentUUIDs(t *testing.T) {
	rack0 := []string{"Y7a", "Y8a", "Y9a", "K4a"}

	// 첫 번째 게임
	svc1, repo1 := seedWithInitialMeld(t,
		"game-ai-two-calls-1",
		rack0,
		[]*model.SetOnTable{},
		[]string{"R1a"},
	)
	req1 := &ConfirmRequest{
		Seat: 0,
		TableGroups: []TilePlacement{
			{ID: "", Tiles: []string{"Y7a", "Y8a", "Y9a"}},
		},
		TilesFromRack: []string{"Y7a", "Y8a", "Y9a"},
	}
	_, err := svc1.ConfirmTurn("game-ai-two-calls-1", req1)
	require.NoError(t, err)
	saved1, err := repo1.GetGameState("game-ai-two-calls-1")
	require.NoError(t, err)

	// 두 번째 게임 (동일 타일 구성)
	svc2, repo2 := seedWithInitialMeld(t,
		"game-ai-two-calls-2",
		rack0,
		[]*model.SetOnTable{},
		[]string{"R1a"},
	)
	req2 := &ConfirmRequest{
		Seat: 0,
		TableGroups: []TilePlacement{
			{ID: "", Tiles: []string{"Y7a", "Y8a", "Y9a"}},
		},
		TilesFromRack: []string{"Y7a", "Y8a", "Y9a"},
	}
	_, err = svc2.ConfirmTurn("game-ai-two-calls-2", req2)
	require.NoError(t, err)
	saved2, err := repo2.GetGameState("game-ai-two-calls-2")
	require.NoError(t, err)

	require.Len(t, saved1.Table, 1)
	require.Len(t, saved2.Table, 1)

	id1 := saved1.Table[0].ID
	id2 := saved2.Table[0].ID

	// [RED assertion] 현재 구현: id1 == "" && id2 == "" → assert.NotEqual("", "") FAIL
	assert.NotEmpty(t, id1, "V-17: 첫 번째 호출 ID 는 비어있으면 안 된다")
	assert.NotEmpty(t, id2, "V-17: 두 번째 호출 ID 는 비어있으면 안 된다")
	assert.NotEqual(t, id1, id2,
		"D-01: 독립 호출은 서로 다른 UUID 를 발급받아야 한다. got id1=%q id2=%q",
		id1, id2)
}
