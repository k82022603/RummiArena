package service

// v17_uuid_issuance_test.go — PR-D-S01 RED spec
//
// V-17: 모든 테이블 그룹 ID는 서버에서 발급(UUID v4).
//       클라이언트 pending- prefix 또는 빈 ID → convertToSetOnTable 에서 UUID 교체.
//       기존 서버 UUID(36자) → 보존.
// D-12: pending→server ID 매핑. pending- prefix 가 DB에 적재되어서는 안 된다.
// D-01: 발급된 모든 ID는 유일해야 한다.
//
// 참조 SSOT:
//   - docs/02-design/55-game-rules-enumeration.md §2.21 (V-17)
//   - docs/02-design/55-game-rules-enumeration.md §4 (D-01, D-12)
//   - docs/04-testing/87-server-rule-audit.md §2 (위반 라인 분석)
//   - docs/04-testing/88-test-strategy-rebuild.md §2.3 (V-17 5 케이스)
//   - work_logs/plans/2026-04-25-phase-c-implementation-dispatch.md §3.2 결단 #2
//
// RED→GREEN 정책 (G3 게이트):
//   이 파일은 RED commit 이다. convertToSetOnTable 이 UUID 발급 로직을 갖지 않는 현재 구현에서
//   TestConvertToSetOnTable_EmptyID_GetsUUID,
//   TestConvertToSetOnTable_PendingPrefix_GetsNewUUID,
//   TestConvertToSetOnTable_Mixed_AllocationIsSelective,
//   TestConvertToSetOnTable_AllIDs_AreUnique,
//   TestConfirmTurn_BoardGroupIDs_AreAllUUIDs 는 FAIL 해야 한다.
//   TestConvertToSetOnTable_ServerUUID_Preserved 는 처음부터 PASS(회귀 방지).

import (
	"regexp"
	"testing"

	"github.com/k82022603/RummiArena/game-server/internal/model"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

// uuidV4RE UUID v4 형식 검증용 정규식
var uuidV4RE = regexp.MustCompile(`^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$`)

// isUUIDv4 문자열이 UUID v4 형식인지 확인한다.
func isUUIDv4(s string) bool {
	return uuidV4RE.MatchString(s)
}

// --- V-17 Case 1: 빈 ID → UUID v4 발급 ---
//
// [RED] 현재 convertToSetOnTable 은 p.ID 를 그대로 통과시킨다.
//       빈 ID("") 가 model.SetOnTable.ID = "" 로 적재된다 → isUUIDv4("") == false → FAIL.
// [GREEN after fix] convertToSetOnTable 이 빈 ID 를 UUID v4 로 교체한다.
func TestConvertToSetOnTable_EmptyID_GetsUUID(t *testing.T) {
	// [V-17] 빈 ID 를 가진 TilePlacement 는 UUID v4 가 발급되어야 한다.
	placements := []TilePlacement{
		{ID: "", Tiles: []string{"R5a", "R6a", "R7a"}},
	}

	result := convertToSetOnTable(placements)

	require.Len(t, result, 1, "V-17: 입력 1개 → 결과 1개")
	// [RED assertion] 현재 구현: result[0].ID == "" → FAIL
	assert.True(t, isUUIDv4(result[0].ID),
		"V-17: 빈 ID 는 UUID v4 로 교체되어야 한다. got=%q", result[0].ID)
	assert.Equal(t, 3, len(result[0].Tiles), "V-17: 타일 수는 보존되어야 한다")
}

// --- V-17 Case 2: pending- prefix → UUID v4 교체 (D-12) ---
//
// [RED] 현재 convertToSetOnTable 은 pending- prefix ID 를 그대로 통과시킨다.
//       D-12: pending- prefix 가 DB 에 적재되어서는 안 된다.
// [GREEN after fix] pending- prefix 를 탐지하여 새 UUID v4 로 교체한다.
func TestConvertToSetOnTable_PendingPrefix_GetsNewUUID(t *testing.T) {
	// [D-12] pending- prefix ID 는 서버에서 UUID v4 로 교체되어야 한다.
	placements := []TilePlacement{
		{ID: "pending-abc123", Tiles: []string{"B3a", "B4a", "B5a"}},
	}

	result := convertToSetOnTable(placements)

	require.Len(t, result, 1, "D-12: 입력 1개 → 결과 1개")
	// [RED assertion] 현재 구현: result[0].ID == "pending-abc123" → isUUIDv4 FAIL
	assert.True(t, isUUIDv4(result[0].ID),
		"D-12: pending- prefix ID 는 UUID v4 로 교체되어야 한다. got=%q", result[0].ID)
	assert.NotContains(t, result[0].ID, "pending-",
		"D-12: 결과 ID 에 pending- prefix 가 있으면 안 된다")
}

// --- V-17 Case 3: 기존 서버 UUID → 보존 ---
//
// [GREEN from the start] 현재 구현도 기존 UUID 는 통과시키므로 이 테스트는 처음부터 PASS.
// fix 후에도 보존 동작이 유지되는지 회귀 방지 역할.
func TestConvertToSetOnTable_ServerUUID_Preserved(t *testing.T) {
	// [V-17] 이미 서버가 발급한 UUID v4 는 변경하지 않는다.
	serverID := "a1b2c3d4-e5f6-4a7b-8c9d-e0f1a2b3c4d5"
	placements := []TilePlacement{
		{ID: serverID, Tiles: []string{"K7a", "K8a", "K9a"}},
	}

	result := convertToSetOnTable(placements)

	require.Len(t, result, 1, "V-17: 입력 1개 → 결과 1개")
	assert.Equal(t, serverID, result[0].ID,
		"V-17: 기존 서버 UUID 는 변경되어서는 안 된다")
}

// --- V-17 Case 4: mixed (빈 + pending + 서버) → 선택적 발급 ---
//
// [RED] 현재 구현: 빈/pending- ID 가 그대로 통과 → isUUIDv4 FAIL.
// [GREEN after fix] 빈/pending- 만 UUID 로 교체, 서버 UUID 는 보존.
func TestConvertToSetOnTable_Mixed_AllocationIsSelective(t *testing.T) {
	// [V-17] [D-12] 혼합 케이스: 각 그룹별 처리 방식이 올바른지 검증한다.
	serverID := "11111111-2222-4333-8444-555555555555"
	placements := []TilePlacement{
		{ID: "", Tiles: []string{"R1a", "R2a", "R3a"}},            // 빈 ID → 신규 UUID
		{ID: "pending-xyz", Tiles: []string{"B4a", "B5a", "B6a"}}, // pending → 신규 UUID
		{ID: serverID, Tiles: []string{"Y7a", "Y8a", "Y9a"}},      // 서버 UUID → 보존
	}

	result := convertToSetOnTable(placements)

	require.Len(t, result, 3, "V-17: 입력 3개 → 결과 3개")

	// 빈 ID 그룹 (result[0])
	// [RED assertion] 현재 구현: result[0].ID == "" → isUUIDv4 FAIL
	assert.True(t, isUUIDv4(result[0].ID),
		"V-17: 빈 ID 그룹은 UUID v4 를 받아야 한다. got=%q", result[0].ID)

	// pending- 그룹 (result[1])
	// [RED assertion] 현재 구현: result[1].ID == "pending-xyz" → isUUIDv4 FAIL
	assert.True(t, isUUIDv4(result[1].ID),
		"D-12: pending- 그룹은 UUID v4 를 받아야 한다. got=%q", result[1].ID)
	assert.NotContains(t, result[1].ID, "pending-",
		"D-12: 결과 ID 에 pending- prefix 가 없어야 한다")

	// 서버 UUID 그룹 (result[2])
	assert.Equal(t, serverID, result[2].ID,
		"V-17: 서버 UUID 는 변경되면 안 된다")
}

// --- V-17 / D-01 Case 5: 복수 빈 ID 동시 발급 → 모두 유니크 ---
//
// [RED] 현재 구현: 모든 그룹의 ID 가 "" → idSet 에 "" 1개 → len(idSet)=1 ≠ 4 → FAIL.
// [GREEN after fix] 각 그룹에 별도 UUID 가 발급되어 모두 유일.
func TestConvertToSetOnTable_AllIDs_AreUnique(t *testing.T) {
	// [D-01] 복수의 그룹이 동시 발급될 때 모든 ID 가 유일해야 한다.
	placements := []TilePlacement{
		{ID: "", Tiles: []string{"R1a", "R2a", "R3a"}},
		{ID: "", Tiles: []string{"B1a", "B2a", "B3a"}},
		{ID: "", Tiles: []string{"Y1a", "Y2a", "Y3a"}},
		{ID: "pending-a", Tiles: []string{"K1a", "K2a", "K3a"}},
	}

	result := convertToSetOnTable(placements)

	require.Len(t, result, 4, "D-01: 입력 4개 → 결과 4개")

	idSet := make(map[string]struct{}, len(result))
	for _, s := range result {
		// [RED assertion] 현재 구현: 빈 ID "" 가 여러 개 → idSet 크기 부족 → FAIL
		assert.True(t, isUUIDv4(s.ID),
			"D-01/V-17: 모든 발급 ID 는 UUID v4 여야 한다. got=%q", s.ID)
		idSet[s.ID] = struct{}{}
	}
	// [RED assertion] 현재 구현: len(idSet) < 4 → FAIL
	assert.Len(t, idSet, 4,
		"D-01: 발급된 모든 ID 는 서로 달라야 한다 (유니크)")
}

// --- 통합: ConfirmTurn 성공 후 보드 그룹 ID 가 모두 UUID v4 인지 검증 ---
//
// [RED] 현재 구현: pending- prefix ID 가 그대로 convertToSetOnTable → DB 적재 → FAIL.
// [GREEN after fix] convertToSetOnTable 이 UUID 발급 → 보드에 UUID v4 ID 만 존재.
func TestConfirmTurn_BoardGroupIDs_AreAllUUIDs(t *testing.T) {
	// [V-17] ConfirmTurn 이 성공한 뒤 state.Table 의 모든 그룹 ID 가 UUID v4 여야 한다.
	rack0 := []string{"R8a", "R9a", "R10a", "K2a"}
	existingServerID := "aaaabbbb-cccc-4ddd-8eee-ffffffffffff"
	existingSet := buildSetOnTable(existingServerID, []string{"B5a", "B6a", "B7a"})

	svc, repo := seedWithInitialMeld(t,
		"game-v17-board-ids",
		rack0,
		[]*model.SetOnTable{existingSet},
		[]string{"Y1a", "Y2a"},
	)

	// 클라이언트: 기존 서버 UUID 보존 + pending- prefix 새 그룹 전송
	req := &ConfirmRequest{
		Seat: 0,
		TableGroups: []TilePlacement{
			{ID: existingServerID, Tiles: []string{"B5a", "B6a", "B7a"}},  // 기존 서버 UUID 보존
			{ID: "pending-new-run", Tiles: []string{"R8a", "R9a", "R10a"}}, // pending → UUID 교체
		},
		TilesFromRack: []string{"R8a", "R9a", "R10a"},
	}

	result, err := svc.ConfirmTurn("game-v17-board-ids", req)
	require.NoError(t, err, "V-17: 유효 배치는 에러 없이 성공해야 한다")
	assert.True(t, result.Success, "V-17: Success=true 여야 한다")

	saved, err := repo.GetGameState("game-v17-board-ids")
	require.NoError(t, err)
	require.Len(t, saved.Table, 2, "V-17: 보드에 2개 그룹이 있어야 한다")

	for _, grp := range saved.Table {
		// [RED assertion] pending- prefix ID 가 그대로 저장되면 isUUIDv4 FAIL
		assert.True(t, isUUIDv4(grp.ID),
			"V-17: 보드 그룹 ID 는 모두 UUID v4 여야 한다. got=%q", grp.ID)
		assert.NotContains(t, grp.ID, "pending-",
			"D-12: 보드 그룹 ID 에 pending- prefix 가 있으면 안 된다")
	}

	// 기존 서버 UUID 보존 확인
	assert.Equal(t, existingServerID, saved.Table[0].ID,
		"V-17: 기존 서버 UUID 는 변경되지 않아야 한다")
}

// --- 헬퍼 ---

// buildSetOnTable 테스트용 SetOnTable 을 만든다.
func buildSetOnTable(id string, codes []string) *model.SetOnTable {
	tiles := make([]*model.Tile, len(codes))
	for i, c := range codes {
		tiles[i] = &model.Tile{Code: c}
	}
	return &model.SetOnTable{ID: id, Tiles: tiles}
}
