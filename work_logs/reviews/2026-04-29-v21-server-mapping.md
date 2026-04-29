# B-1 검증 보고서 — V-21 재정의 후 서버 코드 매핑

- **작성일**: 2026-04-29
- **검증 대상**: `src/game-server/internal/service/room_service.go` + `room_service_test.go`
- **V-21 SSOT**: `docs/02-design/55-game-rules-enumeration.md` §2.25 (v1.2)
- **관련 커밋**: `08c9810` (롤백) / `ec337da` (프론트 롤백) / `1f53481` (빈 슬롯 차단) / `40a1f4c` (SSOT 정리)

---

## 1. V-21 정의 (재정의 후)

> "게임 시작은 방의 모든 좌석이 채워졌을 때만 허용한다. `len(activePlayers) === MaxPlayers` 인 경우에만 StartGame 진행. 빈 슬롯이 1개라도 남아 있으면 `EMPTY_SLOTS_REMAINING (400)` 으로 거부. PLAYING 상태 mid-game join 은 미지원."

---

## 2. 함수별 PASS/MISMATCH 표

### 2.1 StartGame() — 빈 슬롯 차단 invariant

| 검증 항목 | 위치 | 코드 내용 | 결과 |
|----------|------|----------|------|
| 빈 슬롯 거부 에러 코드 | `room_service.go:394` | `Code: "EMPTY_SLOTS_REMAINING"` | **PASS** |
| HTTP 상태 코드 400 | `room_service.go:397` | `Status: 400` | **PASS** |
| `len(activePlayers) < room.MaxPlayers` 조건식 | `room_service.go:392` | `if len(activePlayers) < room.MaxPlayers` | **PASS** |
| 메시지 형식 (`N/MaxPlayers`) | `room_service.go:395` | `fmt.Sprintf("빈 슬롯이 있어 시작할 수 없습니다 (%d/%d)", ...)` | **PASS** |
| WAITING 상태 전제 조건 | `room_service.go:376` | `if room.Status != model.RoomStatusWaiting` → 409 거부 선행 | **PASS** |

activePlayers는 `p.Status != model.SeatStatusEmpty` 조건으로 필터링됩니다. V-21의 `len(activePlayers) === MaxPlayers` invariant와 정확히 대응합니다.

### 2.2 JoinRoom() — WAITING-only 정책

| 검증 항목 | 위치 | 코드 내용 | 결과 |
|----------|------|----------|------|
| PLAYING 상태 참가 거부 | `room_service.go:250` | `if room.Status != model.RoomStatusWaiting` → `GAME_ALREADY_STARTED (409)` | **PASS** |
| WAITING 상태에서만 참가 허용 | `room_service.go:244~298` | WAITING 체크 통과 후에만 seat 배정 진행 | **PASS** |
| PLAYING 방 참가 불가 에러 코드 | `room_service.go:251` | `Code: "GAME_ALREADY_STARTED"` | **PASS** |

V-21 명세 "PLAYING 상태 mid-game join 은 미지원"과 완전히 일치합니다.

### 2.3 AddPlayerMidGame 잔존 코드 확인

| 검증 항목 | 결과 |
|----------|------|
| `AddPlayerMidGame` 함수 존재 여부 | **없음 (완전 제거)** |
| `MidGame` / `MID_GAME` / `mid_game` 패턴 전체 grep | `game_service_test.go:1866~1898` 에 `TestForfeitPlayer_MidGame_TurnLimitNotTriggered` 1건 존재 — **기권(forfeit) 로직 테스트로, AddPlayerMidGame과 무관** |
| I3 롤백 완전성 | **PASS** — 커밋 `08c9810` 으로 제거, 잔존 없음 |

---

## 3. 테스트 매핑 검증

### 3.1 V-21 룰 ID 명시 여부 (커밋 메시지 룰 ID 매핑 의무화 정책)

| 위치 | V-21 룰 ID 명시 여부 | 비고 |
|------|---------------------|------|
| `room_service_test.go:789~844` 테스트 블록 주석 | **미명시** — "A-2: StartGame 빈 슬롯 차단 테스트" 만 기재 | MISMATCH |
| `room_service_test.go:794` 함수 docstring | **미명시** — V-21 언급 없음 | MISMATCH |
| `room_service_test.go:822` 함수 docstring | **미명시** — V-21 언급 없음 | MISMATCH |
| `room_service.go:391` 빈 슬롯 차단 주석 | **미명시** — "A-2 방어 코드" 만 기재, V-21 없음 | MISMATCH |
| 커밋 `1f53481` 메시지 | "feat: A-2단계 빈 슬롯 시 게임 시작 차단 (방어 코드)" — **V-21 미명시** | MISMATCH |
| 커밋 `40a1f4c` 메시지 | "docs(rules): A-3단계 V-21 재정의 + UR-39 폐기 (룰 SSOT 정리)" — **V-21 명시** | PASS |

### 3.2 SSOT 지정 테스트 2건 존재 여부

V-21 SSOT (`55-game-rules-enumeration.md §2.25`) 에 지정된 테스트 함수명:
- `TestStartGame_RejectIfEmptySlotsRemain` → `room_service_test.go:794` **존재 + PASS**
- `TestStartGame_SucceedWhenAllSlotsFilled` → `room_service_test.go:822` **존재 + PASS**

### 3.3 JoinRoom PLAYING 거부 전용 테스트

| 테스트명 | 존재 여부 | 비고 |
|---------|---------|------|
| `TestJoinRoom_RejectPlayingStatus` 또는 이에 상응하는 테스트 | **없음** | MISMATCH |

현재 `JoinRoom()`의 `if room.Status != model.RoomStatusWaiting` 거부 경로를 직접 검증하는 단위 테스트가 존재하지 않습니다.  
`TestCreateRoom_DuplicateBlocked_PlayingState` 에서 JoinRoom → StartGame 후 CreateRoom 거부를 간접 검증하나, JoinRoom 자체의 PLAYING 거부(`GAME_ALREADY_STARTED 409`)는 별도 테스트가 없습니다.

---

## 4. 요약

| 영역 | PASS | MISMATCH |
|------|:---:|:---:|
| StartGame() 빈 슬롯 거부 로직 | 5 | 0 |
| JoinRoom() WAITING-only 로직 | 3 | 0 |
| AddPlayerMidGame 잔존 코드 없음 | 1 | 0 |
| SSOT 지정 테스트 2건 존재 + PASS | 2 | 0 |
| V-21 룰 ID 코드 주석 명시 | 0 | 4 |
| JoinRoom PLAYING 거부 전용 테스트 | 0 | 1 |

---

## 5. Mismatch 상세 및 권장 수정안

### MISMATCH-1: V-21 룰 ID 코드 주석 미명시 (4건)

**정책 위반**: `55-game-rules-enumeration.md §1` — "이 행동은 룰 V-X / UR-Y / D-Z 에 의해 차단" 형태로 commit message 가 룰 ID 매핑 가능해야 PR 머지 허용.

**영향 위치**:
1. `room_service.go:391` — 빈 슬롯 차단 주석
2. `room_service_test.go:789` — 테스트 블록 주석 (`// A-2: ...`)
3. `room_service_test.go:793~794` — `TestStartGame_RejectIfEmptySlotsRemain` docstring
4. `room_service_test.go:820~821` — `TestStartGame_SucceedWhenAllSlotsFilled` docstring

**권장 수정안 (코드 변경 없이 주석만)**:
```go
// room_service.go:391 — 현재:
// 빈 슬롯 차단: 모든 슬롯이 채워져야만 게임을 시작할 수 있다 (A-2 방어 코드)
// 변경 후:
// V-21: 방 정원 충족 후 게임 시작 invariant — 빈 슬롯이 1개라도 남으면 EMPTY_SLOTS_REMAINING(400) 거부

// room_service_test.go:789 — 현재:
// A-2: StartGame 빈 슬롯 차단 테스트
// 변경 후:
// V-21: StartGame 빈 슬롯 차단 테스트 (방 정원 충족 후 게임 시작 invariant)
```

### MISMATCH-2: JoinRoom PLAYING 거부 전용 테스트 미존재

**내용**: `JoinRoom()` 함수 내 `if room.Status != model.RoomStatusWaiting` 분기 (line 250)가 `GAME_ALREADY_STARTED (409)` 를 반환하는 경로에 대한 직접 단위 테스트가 없습니다. V-21 명세의 "PLAYING 방 참가 금지" invariant 를 테스트로 보증하지 않습니다.

**권장 테스트 함수**:
```go
// TestJoinRoom_RejectIfGameAlreadyStarted
// V-21: PLAYING 상태 방에 JoinRoom 시도하면 GAME_ALREADY_STARTED(409)를 반환한다.
func TestJoinRoom_RejectIfGameAlreadyStarted(t *testing.T) {
    // 2인 방 생성 + 풀방 → StartGame → PLAYING 상태
    // 제3자가 JoinRoom 시도 → GAME_ALREADY_STARTED 409 확인
}
```

---

## 6. 결론

V-21 재정의의 핵심 invariant ("정원 충족 시에만 게임 시작", "PLAYING 방 참가 금지")는 **코드 로직 수준에서 완전히 구현**되어 있고, SSOT 지정 테스트 2건도 실행 통과합니다. AddPlayerMidGame 잔존 코드는 없습니다.

다만 룰 ID 매핑 정책(커밋/주석에 V-21 명시) 4건 불이행과, JoinRoom PLAYING 거부 전용 테스트 1건 미존재가 확인되었습니다. 코드 로직 자체의 버그는 없으나, 정책 준수 및 테스트 커버리지 보강이 필요합니다.
