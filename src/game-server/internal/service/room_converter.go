package service

import (
	"github.com/google/uuid"
	"github.com/k82022603/RummiArena/game-server/internal/model"
)

// roomStateToModel RoomState(인메모리) → model.Room(GORM 영속) 변환.
// HostID가 유효 UUID가 아닌 경우(게스트, QA 테스터 등) nil을 반환한다.
// 반환값이 nil이면 호출자는 DB 쓰기를 스킵해야 한다.
//
// Phase 1 미매핑 필드:
//   - Players/SeatStatus: Phase 2에서 JSONB 컬럼으로 추가 검토
func roomStateToModel(state *model.RoomState) *model.Room {
	// FK 방어: HostUserID → users.id 참조. 유효 UUID 아니면 DB 쓰기 스킵.
	if !isValidUUIDStr(state.HostID) {
		return nil
	}
	return &model.Room{
		ID:          state.ID,
		RoomCode:    state.RoomCode,
		Name:        state.Name,
		HostUserID:  state.HostID,
		MaxPlayers:  state.MaxPlayers,
		TurnTimeout: state.TurnTimeoutSec,
		Status:      state.Status,
		GameID:      state.GameID,
		CreatedAt:   state.CreatedAt,
		UpdatedAt:   state.UpdatedAt,
	}
}

// isValidUUIDStr 문자열이 유효한 UUID v4 형식인지 확인한다.
// handler.isValidUUID 와 동일한 로직이지만 service 패키지 내부에서 사용하기 위해 별도 정의한다.
// (handler → service 단방향 의존 계층을 깨지 않기 위해 복사)
func isValidUUIDStr(s string) bool {
	if s == "" {
		return false
	}
	_, err := uuid.Parse(s)
	return err == nil
}
