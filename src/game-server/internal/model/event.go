package model

import "time"

// EventType 게임 이벤트 유형
type EventType string

const (
	EventTypePlaceTiles EventType = "PLACE_TILES"
	EventTypeDrawTile   EventType = "DRAW_TILE"
	EventTypeRearrange  EventType = "REARRANGE"
	EventTypeTimeout    EventType = "TIMEOUT"
	EventTypeGameStart  EventType = "GAME_START"
	EventTypeGameEnd    EventType = "GAME_END"
)

// GameEvent 게임 이벤트 로그 영속 모델 (PostgreSQL)
// 참조: docs/02-design/02-database-design.md §2.5
type GameEvent struct {
	ID         string    `gorm:"primaryKey;type:uuid;default:gen_random_uuid()"   json:"id"`
	GameID     string    `gorm:"column:game_id;type:uuid;not null;index"          json:"gameId"`
	PlayerID   string    `gorm:"column:player_id;type:uuid;not null"              json:"playerId"`
	TurnNumber int       `gorm:"column:turn_number;not null"                      json:"turnNumber"`
	Seat       int       `gorm:"column:seat;not null"                             json:"seat"`
	EventType  EventType `gorm:"column:event_type;type:varchar(30);not null"      json:"eventType"`
	Payload    string    `gorm:"column:payload;type:jsonb;not null;default:'{}'"  json:"payload"`
	CreatedAt  time.Time `gorm:"column:created_at"                                json:"createdAt"`

	// Relations
	Game   Game       `gorm:"foreignKey:GameID"   json:"-"`
	Player GamePlayer `gorm:"foreignKey:PlayerID" json:"-"`
}

// GameSnapshot 복기용 턴 스냅샷 영속 모델 (PostgreSQL)
// 참조: docs/02-design/02-database-design.md §2.9
// 매 턴 완료 시 비동기 저장. 90일 보관.
type GameSnapshot struct {
	ID            string    `gorm:"primaryKey;type:uuid;default:gen_random_uuid()"   json:"id"`
	GameID        string    `gorm:"column:game_id;type:uuid;not null;index"          json:"gameId"`
	TurnNumber    int       `gorm:"column:turn_number;not null"                      json:"turnNumber"`
	ActingSeat    int       `gorm:"column:acting_seat;not null"                      json:"actingSeat"`
	ActionType    string    `gorm:"column:action_type;type:varchar(30);not null"     json:"actionType"`
	ActionDetail  string    `gorm:"column:action_detail;type:jsonb;not null;default:'{}'" json:"actionDetail"`
	PlayerHands   string    `gorm:"column:player_hands;type:jsonb;not null;default:'{}'"  json:"playerHands"`
	TableState    string    `gorm:"column:table_state;type:jsonb;not null;default:'{}'"   json:"tableState"`
	DrawPileCount int       `gorm:"column:draw_pile_count;not null;default:0"        json:"drawPileCount"`
	AIDecisionLog string    `gorm:"column:ai_decision_log;type:text"                 json:"aiDecisionLog,omitempty"`
	CreatedAt     time.Time `gorm:"column:created_at"                                json:"createdAt"`

	// Relations
	Game Game `gorm:"foreignKey:GameID" json:"-"`
}

// AICallLog AI 모델 호출 기록 영속 모델 (PostgreSQL)
// 참조: docs/02-design/02-database-design.md §2.4
type AICallLog struct {
	ID                 string    `gorm:"primaryKey;type:uuid;default:gen_random_uuid()"   json:"id"`
	GameID             string    `gorm:"column:game_id;type:uuid;not null;index"          json:"gameId"`
	PlayerID           string    `gorm:"column:player_id;type:uuid;not null"              json:"playerId"`
	PlayerType         string    `gorm:"column:player_type;type:varchar(20);not null"     json:"playerType"`
	ModelName          string    `gorm:"column:model_name;type:varchar(100)"              json:"modelName,omitempty"`
	AIPersona          string    `gorm:"column:ai_persona;type:varchar(30)"               json:"aiPersona,omitempty"`
	AIDifficulty       string    `gorm:"column:ai_difficulty;type:varchar(20)"            json:"aiDifficulty,omitempty"`
	AIPsychologyLevel  *int      `gorm:"column:ai_psychology_level"                       json:"aiPsychologyLevel,omitempty"`
	TurnNumber         int       `gorm:"column:turn_number;not null"                      json:"turnNumber"`
	PromptTokens       *int      `gorm:"column:prompt_tokens"                             json:"promptTokens,omitempty"`
	CompletionTokens   *int      `gorm:"column:completion_tokens"                         json:"completionTokens,omitempty"`
	LatencyMs          *int      `gorm:"column:latency_ms"                                json:"latencyMs,omitempty"`
	IsValidMove        *bool     `gorm:"column:is_valid_move"                             json:"isValidMove,omitempty"`
	RetryCount         int       `gorm:"column:retry_count;not null;default:0"            json:"retryCount"`
	ErrorMessage       string    `gorm:"column:error_message;type:text"                   json:"errorMessage,omitempty"`
	CreatedAt          time.Time `gorm:"column:created_at"                                json:"createdAt"`
}

// EloHistory ELO 레이팅 변경 이력 영속 모델 (PostgreSQL)
// 참조: docs/02-design/02-database-design.md §2.7
type EloHistory struct {
	ID                 string    `gorm:"primaryKey;type:uuid;default:gen_random_uuid()"   json:"id"`
	UserID             string    `gorm:"column:user_id;type:uuid;not null;index"          json:"userId"`
	GameID             string    `gorm:"column:game_id;type:uuid;not null"                json:"gameId"`
	RatingBefore       int       `gorm:"column:rating_before;not null"                    json:"ratingBefore"`
	RatingAfter        int       `gorm:"column:rating_after;not null"                     json:"ratingAfter"`
	RatingDelta        int       `gorm:"column:rating_delta;not null"                     json:"ratingDelta"`
	KFactor            int       `gorm:"column:k_factor;not null;default:32"              json:"kFactor"`
	OpponentAvgRating  *int      `gorm:"column:opponent_avg_rating"                       json:"opponentAvgRating,omitempty"`
	CreatedAt          time.Time `gorm:"column:created_at"                                json:"createdAt"`
}
