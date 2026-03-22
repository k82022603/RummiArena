package model

import "time"

// RoomStatus 방 상태
type RoomStatus string

const (
	RoomStatusWaiting   RoomStatus = "WAITING"
	RoomStatusPlaying   RoomStatus = "PLAYING"
	RoomStatusFinished  RoomStatus = "FINISHED"
	RoomStatusCancelled RoomStatus = "CANCELLED"
)

// SeatStatus 좌석 상태
type SeatStatus string

const (
	SeatStatusEmpty     SeatStatus = "EMPTY"
	SeatStatusConnected SeatStatus = "CONNECTED"
	SeatStatusReady     SeatStatus = "READY"
)

// RoomPlayer 방 안의 플레이어 정보 (응답용)
type RoomPlayer struct {
	Seat              int        `json:"seat"`
	UserID            string     `json:"userId,omitempty"`
	DisplayName       string     `json:"displayName,omitempty"`
	Type              string     `json:"type"` // HUMAN | AI_OPENAI | AI_CLAUDE | AI_LLAMA | AI_DEEPSEEK
	Status            SeatStatus `json:"status"`
	Persona           string     `json:"persona,omitempty"`
	Difficulty        string     `json:"difficulty,omitempty"`
	AIModel           string     `json:"aiModel,omitempty"`
	AIPsychologyLevel int        `json:"aiPsychologyLevel,omitempty"`
}

// RoomSettings 방 설정
type RoomSettings struct {
	PlayerCount          int `json:"playerCount"`
	TurnTimeoutSec       int `json:"turnTimeoutSec"`
	InitialMeldThreshold int `json:"initialMeldThreshold"`
}

// RoomDetail Room 상세 응답 DTO
// API 설계(03-api-design.md §1.2)의 GET /api/rooms/:id 응답 포맷에 대응한다.
type RoomDetail struct {
	ID          string       `json:"id"`
	RoomCode    string       `json:"roomCode"`
	Name        string       `json:"name"`
	Status      RoomStatus   `json:"status"`
	HostUserID  string       `json:"hostUserId"`
	PlayerCount int          `json:"playerCount"`
	Settings    RoomSettings `json:"settings"`
	Players     []RoomPlayer `json:"players"`
	GameID      *string      `json:"gameId,omitempty"`
	CreatedAt   time.Time    `json:"createdAt"`
}

// RoomState 인메모리 방 상태 (DB + 런타임 혼합)
// Room 모델(model.Room)은 GORM 영속 레이어용이지만, MVP 단계에서는
// 인메모리에 RoomState 하나로 모든 정보를 관리한다.
type RoomState struct {
	ID             string
	RoomCode       string
	Name           string
	HostID         string
	Status         RoomStatus
	MaxPlayers     int
	TurnTimeoutSec int
	Players        []RoomPlayer // 인덱스 = seat 번호
	GameID         *string
	CreatedAt      time.Time
	UpdatedAt      time.Time
}
