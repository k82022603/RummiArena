package handler

import (
	"testing"

	"github.com/stretchr/testify/assert"

	"github.com/k82022603/RummiArena/game-server/internal/client"
	"github.com/k82022603/RummiArena/game-server/internal/model"
)

// newTestWSHandler 테스트용 최소 WSHandler를 생성한다.
// AI 클라이언트, gameSvc 등 외부 의존성이 불필요한 순수 메서드 단위 테스트에 사용한다.
func newTestWSHandler() *WSHandler {
	return &WSHandler{}
}

// makeBoardState 지정한 타일 그룹 목록으로 GameStateRedis를 생성한다.
func makeBoardState(groups [][]string) *model.GameStateRedis {
	table := make([]*model.SetOnTable, len(groups))
	for i, codes := range groups {
		tiles := make([]*model.Tile, len(codes))
		for j, c := range codes {
			tiles[j] = &model.Tile{Code: c}
		}
		table[i] = &model.SetOnTable{ID: "set", Tiles: tiles}
	}
	return &model.GameStateRedis{Table: table}
}

// makeTileGroups client.TileGroup 슬라이스를 편리하게 생성하는 헬퍼.
func makeTileGroups(groups [][]string) []client.TileGroup {
	result := make([]client.TileGroup, len(groups))
	for i, codes := range groups {
		result[i] = client.TileGroup{Tiles: codes}
	}
	return result
}

// TestHasNewGroupVsCurrentState_NilState currentState가 nil이면 false를 반환한다.
func TestHasNewGroupVsCurrentState_NilState(t *testing.T) {
	h := newTestWSHandler()
	respGroups := makeTileGroups([][]string{{"R1a", "R2a", "R3a"}})
	assert.False(t, h.hasNewGroupVsCurrentState(respGroups, nil),
		"currentState==nil이면 false를 반환해야 한다")
}

// TestHasNewGroupVsCurrentState_EmptyBoth 보드와 응답 모두 빈 경우 false를 반환한다.
// BUG-LLAMA-FORFEIT: tilesFromRack=[], tableGroups=[] → 자발적 draw로 처리 필요.
func TestHasNewGroupVsCurrentState_EmptyBoth(t *testing.T) {
	h := newTestWSHandler()
	state := makeBoardState([][]string{})
	respGroups := makeTileGroups([][]string{})
	assert.False(t, h.hasNewGroupVsCurrentState(respGroups, state),
		"보드와 응답 모두 빈 경우 신규 그룹 없음 → false")
}

// TestHasNewGroupVsCurrentState_SameGroups 응답이 현재 보드와 동일하면 false.
// BUG-LLAMA-FORFEIT: LLaMA가 tableGroups=현재보드 그대로, tilesFromRack=[]로 반환 → 자발적 draw.
func TestHasNewGroupVsCurrentState_SameGroups(t *testing.T) {
	h := newTestWSHandler()
	groups := [][]string{{"R1a", "R2a", "R3a"}, {"B5a", "Y5a", "K5b"}}
	state := makeBoardState(groups)
	respGroups := makeTileGroups(groups)
	assert.False(t, h.hasNewGroupVsCurrentState(respGroups, state),
		"응답이 현재 보드와 동일하면 신규 그룹 없음 → false")
}

// TestHasNewGroupVsCurrentState_NewGroup 응답에 현재 보드에 없던 그룹이 있으면 true.
func TestHasNewGroupVsCurrentState_NewGroup(t *testing.T) {
	h := newTestWSHandler()
	boardGroups := [][]string{{"R1a", "R2a", "R3a"}}
	respGroups := [][]string{{"R1a", "R2a", "R3a"}, {"B5a", "Y5a", "K5b"}}
	state := makeBoardState(boardGroups)
	assert.True(t, h.hasNewGroupVsCurrentState(makeTileGroups(respGroups), state),
		"응답에 신규 그룹이 있으면 true")
}

// TestHasNewGroupVsCurrentState_CountDiff 그룹 수가 다르면 true.
func TestHasNewGroupVsCurrentState_CountDiff(t *testing.T) {
	h := newTestWSHandler()
	state := makeBoardState([][]string{{"R1a", "R2a", "R3a"}})
	// 응답 그룹 수(2) != 보드 그룹 수(1)
	respGroups := makeTileGroups([][]string{{"R1a", "R2a", "R3a"}, {"B4a", "B5a", "B6a"}})
	assert.True(t, h.hasNewGroupVsCurrentState(respGroups, state),
		"그룹 수가 다르면 true")
}

// TestTileSeqEqual_Equal 동일한 슬라이스는 true를 반환한다.
func TestTileSeqEqual_Equal(t *testing.T) {
	assert.True(t, tileSeqEqual([]string{"R1a", "R2a"}, []string{"R1a", "R2a"}))
}

// TestTileSeqEqual_DiffOrder 순서가 다르면 false를 반환한다.
func TestTileSeqEqual_DiffOrder(t *testing.T) {
	assert.False(t, tileSeqEqual([]string{"R1a", "R2a"}, []string{"R2a", "R1a"}))
}

// TestTileSeqEqual_DiffLen 길이가 다르면 false를 반환한다.
func TestTileSeqEqual_DiffLen(t *testing.T) {
	assert.False(t, tileSeqEqual([]string{"R1a"}, []string{"R1a", "R2a"}))
}
