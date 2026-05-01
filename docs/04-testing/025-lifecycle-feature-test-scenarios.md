# 21. 플레이어 생명주기 기능 테스트 시나리오 + 회귀 분석

> 작성일: 2026-03-30
> 작성자: 애벌레 (QA Engineer)
> 설계 기반: `docs/02-design/12-player-lifecycle-design.md`
> 목적: 신규 4개 기능(퇴장/기권, 중복 방 제한, 교착 처리 개선, beforeunload 경고)의 테스트 시나리오 + 코드 변경 14건 회귀 분석

---

## 0. 테스트 범위 및 ID 체계

| 접두사 | 대상 기능 | 설계 GAP | 검증 규칙 |
|--------|-----------|----------|-----------|
| TC-LF | 퇴장/기권 (Leave/Forfeit) | GAP 1 | V-16, V-17 |
| TC-DR | 중복 방 참가 제한 (Duplicate Room) | GAP 2 | V-19 |
| TC-DL | 교착 처리 개선 (Deadlock) | GAP 3 | V-18 |
| TC-BU | 브라우저 이탈 경고 (BeforeUnload) | GAP 4 | - |
| TC-REG | 회귀 테스트 (Regression) | - | 기존 V-01~V-15 |

### 테스트 계층 배분 (70/20/10 원칙)

| 계층 | TC 수 | 커버 대상 |
|------|-------|-----------|
| Unit (Go testify) | 28개 | advanceTurn, countActivePlayers, DrawTile 패스 모드, 역인덱스, ELO 기권 처리 |
| Integration (httptest/supertest + WS) | 12개 | Grace Timer 시퀀스, 방 참가 API 409, WS PLAYER_FORFEITED 메시지 |
| E2E (Playwright) | 5개 | beforeunload 경고, 드로우 버튼 -> 패스 전환, 기권 알림 토스트 |
| **합계** | **45개** | |

---

## 1. 퇴장/기권 테스트 시나리오 (TC-LF)

> 설계 참조: `12-player-lifecycle-design.md` 1절
> 핵심: Grace Period 60초, FORFEITED 상태, advanceTurn 건너뛰기, 자동 승리

### 1.1 정상 시나리오

| ID | 시나리오 | 전제조건 | 테스트 절차 | 검증 포인트 | 계층 | 우선순위 |
|----|----------|----------|-------------|-------------|------|----------|
| TC-LF-001 | WS 연결 끊김 -> 60초 Grace -> FORFEITED | 2인 게임 PLAYING | 1. Player2 WS 연결 끊기 2. PLAYER_LEAVE 브로드캐스트 확인 3. 60초 대기 4. PLAYER_FORFEITED 브로드캐스트 확인 | player2.status == FORFEITED, reason == "DISCONNECT_TIMEOUT", activePlayers == 1 | Integration (WS) | P1 |
| TC-LF-002 | Grace 내 재연결 -> 상태 복구 | 2인 게임, Player2 DISCONNECTED | 1. Player2 WS 연결 끊기 2. 30초 대기 (Grace 내) 3. Player2 WS 재연결 + AUTH 4. GAME_STATE 수신 확인 5. PLAYER_RECONNECT 브로드캐스트 확인 | player2.status == ACTIVE, disconnectedAt == 0, 기존 랙/보드 상태 보존 | Integration (WS) | P1 |
| TC-LF-003 | 2인 게임 1명 기권 -> 나머지 자동 승리 | 2인 게임 PLAYING | 1. Player2 LEAVE_GAME 전송 2. PLAYER_FORFEITED 확인 (reason: "LEAVE") 3. GAME_OVER 확인 | endType == "FORFEIT", winner == Player1, isGameOver == true | Integration (WS) | P1 |
| TC-LF-004 | 4인 게임 3명 순차 기권 -> 마지막 1명 승리 | 4인 게임 PLAYING | 1. Player2 LEAVE_GAME 2. activePlayers == 3 확인 3. Player3 WS 끊김 + 60초 대기 4. activePlayers == 2 확인 5. Player4 LEAVE_GAME 6. GAME_OVER 확인 | endType == "FORFEIT", winner == Player1, activePlayers == 1 | Integration (WS) | P2 |
| TC-LF-005 | 기권 플레이어 턴 건너뛰기 | 3인 게임, Player2 FORFEITED | 1. Player1 턴에서 DRAW_TILE 2. TURN_END.nextSeat 확인 3. Player2 건너뛰고 Player3에게 TURN_START | nextSeat == Player3.seat (Player2 건너뜀) | Unit (advanceTurn) | P1 |

### 1.2 엣지 케이스

| ID | 시나리오 | 전제조건 | 테스트 절차 | 검증 포인트 | 계층 | 우선순위 |
|----|----------|----------|-------------|-------------|------|----------|
| TC-LF-006 | 자기 턴에서 연결 끊김 | 2인 게임, Player1 턴 | 1. Player1 턴 진행 중 WS 끊김 2. Grace Timer 시작 확인 3. 60초 대기 4. FORFEITED 확인 5. 즉시 advanceTurn -> Player2 턴 전환 | 기권 즉시 턴 전환, TURN_START(Player2) 브로드캐스트 | Integration (WS) | P1 |
| TC-LF-007 | 동시에 2명 연결 끊김 (4인 게임) | 4인 게임 PLAYING | 1. Player2, Player3 동시 WS 끊김 2. 각각 Grace Timer 독립 시작 확인 3. 60초 후 Player2, Player3 모두 FORFEITED 4. activePlayers == 2 확인 (Player1, Player4) | 독립적인 Grace Timer, 동시 기권 시 게임 계속(활성 >= 2) | Integration (WS) | P2 |
| TC-LF-008 | Grace 만료 직전 재연결 (59초) | 2인 게임, Player2 DISCONNECTED | 1. Player2 WS 끊김 2. 59초 대기 (만료 직전) 3. Player2 WS 재연결 + AUTH 4. Grace Timer 취소 확인 5. PLAYER_RECONNECT 확인 | player2.status == ACTIVE, Grace Timer 정상 취소, FORFEITED 미발생 | Integration (WS) | P1 |
| TC-LF-009 | 명시적 LEAVE_GAME -> 즉시 기권 (Grace 없음) | 2인 게임 PLAYING | 1. Player2가 LEAVE_GAME 메시지 전송 2. 즉시 PLAYER_FORFEITED 확인 (Grace Period 없이) | reason == "LEAVE", Grace Timer 미시작, 즉시 처리 | Unit + Integration | P1 |
| TC-LF-010 | DISCONNECTED 상태에서 LEAVE_GAME | Player2 DISCONNECTED (Grace 진행 중) | 1. Player2 WS 끊김 2. 별도 연결로 LEAVE_GAME 전송 | Grace Timer 즉시 취소, 즉시 FORFEITED 전환 | Integration (WS) | P3 |
| TC-LF-011 | 전원 기권 (2인 모두 끊김) | 2인 게임 PLAYING | 1. Player1 WS 끊김 2. Player2 WS 끊김 3. 60초 후 양쪽 모두 FORFEITED | endType == "CANCELLED", ELO 미적용 | Unit + Integration | P2 |
| TC-LF-012 | 기권 후 같은 유저가 새 게임 참가 | Player FORFEITED 처리 완료 | 1. 기권 처리 완료 2. 같은 유저가 로비로 이동 3. 새 방 생성/참가 | active_room 키 삭제 확인, 새 방 정상 생성 | Integration (API) | P2 |

### 1.3 advanceTurn 단위 테스트

| ID | 시나리오 | 입력 상태 | 기대 결과 | 계층 |
|----|----------|-----------|-----------|------|
| TC-LF-U01 | 모든 플레이어 ACTIVE (정상) | 3인, 현재 seat=0, 전원 ACTIVE | nextSeat == 1 | Unit |
| TC-LF-U02 | 다음 플레이어 FORFEITED | 3인, 현재 seat=0, seat1=FORFEITED | nextSeat == 2 (seat1 건너뜀) | Unit |
| TC-LF-U03 | 연속 2명 FORFEITED | 4인, 현재 seat=0, seat1,seat2=FORFEITED | nextSeat == 3 | Unit |
| TC-LF-U04 | 마지막 좌석에서 순환 + 건너뛰기 | 3인, 현재 seat=2, seat0=FORFEITED | nextSeat == 1 (0 건너뜀, 순환) | Unit |
| TC-LF-U05 | 전원 FORFEITED (방어 코드) | 3인, 전원 FORFEITED | fallback: 현재 seat 반환 | Unit |
| TC-LF-U06 | DISCONNECTED는 건너뛰지 않음 | 3인, seat1=DISCONNECTED | nextSeat == 1 (DISCONNECTED != FORFEITED) | Unit |

### 1.4 ELO 기권 처리 단위 테스트

| ID | 시나리오 | 기대 결과 | 계층 |
|----|----------|-----------|------|
| TC-LF-U07 | 기권자 최하위 ELO 순위 | 4인 중 1명 기권: 기권자 4위, 나머지 잔여 타일 점수로 1~3위 결정 | Unit |
| TC-LF-U08 | 2인 게임 기권: 승자 ELO 상승 | 기권자 ELO 하락, 남은 1인 ELO 상승 | Unit |
| TC-LF-U09 | 전원 기권 시 ELO 미적용 | endType == "CANCELLED", 전원 ELO 변동 없음 | Unit |

---

## 2. 중복 방 참가 제한 테스트 시나리오 (TC-DR)

> 설계 참조: `12-player-lifecycle-design.md` 2절
> 핵심: Redis 키 `user:{userId}:active_room`, CreateRoom/JoinRoom 양쪽 검증

### 2.1 정상 시나리오

| ID | 시나리오 | 전제조건 | 테스트 절차 | 검증 포인트 | 계층 | 우선순위 |
|----|----------|----------|-------------|-------------|------|----------|
| TC-DR-001 | 이미 방에 있는 유저 -> 새 방 생성 시도 거부 | UserA가 Room1에 참가 중 (WAITING) | 1. UserA가 POST /api/rooms 요청 | 409 Conflict, error == "ALREADY_IN_ROOM" | Integration (API) | P1 |
| TC-DR-002 | 이미 방에 있는 유저 -> 다른 방 참가 시도 거부 | UserA가 Room1에 참가 중 (WAITING) | 1. UserB가 Room2 생성 2. UserA가 POST /api/rooms/:room2Id/join | 409 Conflict, error == "ALREADY_IN_ROOM" | Integration (API) | P1 |
| TC-DR-003 | 방 나간 후 다른 방 참가 성공 | UserA가 Room1에서 퇴장 | 1. UserA가 Room1 퇴장 (LeaveRoom) 2. active_room 키 삭제 확인 3. UserA가 Room2 참가 | 200 OK, 정상 참가 | Integration (API) | P1 |
| TC-DR-004 | 게임 종료 후 새 방 생성 성공 | UserA의 기존 게임 FINISHED | 1. 게임 종료 확인 (FINISHED) 2. active_room 키 삭제 확인 3. UserA가 POST /api/rooms | 201 Created, 정상 생성 | Integration (API) | P1 |

### 2.2 엣지 케이스

| ID | 시나리오 | 전제조건 | 테스트 절차 | 검증 포인트 | 계층 | 우선순위 |
|----|----------|----------|-------------|-------------|------|----------|
| TC-DR-005 | PLAYING 상태 방 유저 -> 다른 방 참가 거부 | UserA가 Room1에서 게임 중 (PLAYING) | 1. UserA가 POST /api/rooms/:room2Id/join | 409 Conflict | Integration (API) | P1 |
| TC-DR-006 | CANCELLED 방 유저 -> 다른 방 참가 허용 | UserA의 Room1이 CANCELLED | 1. UserA가 POST /api/rooms 2. active_room stale 키 자동 정리 확인 | 201 Created (stale 키 정리 후 허용) | Integration (API) | P2 |
| TC-DR-007 | Redis TTL 만료 후 재참가 | active_room 키 TTL 만료 | 1. active_room 키 TTL(7200초) 만료 2. UserA가 새 방 생성 | 201 Created (키 부재 = 참가 가능) | Unit | P3 |
| TC-DR-008 | 동시 요청: 같은 유저가 2개 방 동시 참가 | UserA 미참가 상태 | 1. UserA가 Room1 참가 + Room2 참가 동시 요청 2. Race condition 검증 | 1개만 성공, 다른 1개는 409 (Redis SETNX 또는 mutex) | Integration (API) | P2 |
| TC-DR-009 | 기권(FORFEITED) 후 active_room 키 삭제 | UserA가 게임 중 기권 | 1. UserA LEAVE_GAME 2. FORFEITED 처리 3. active_room 키 삭제 확인 4. 새 방 참가 | 키 삭제 확인, 새 방 정상 참가 | Integration (API) | P2 |

### 2.3 역인덱스 단위 테스트 (MemoryRoomRepository)

| ID | 시나리오 | 기대 결과 | 계층 |
|----|----------|-----------|------|
| TC-DR-U01 | SetActiveRoomForUser + GetActiveRoomForUser | roomId 반환 | Unit |
| TC-DR-U02 | ClearActiveRoomForUser 후 조회 | "" 반환 (빈 문자열) | Unit |
| TC-DR-U03 | 존재하지 않는 유저 조회 | "" 반환, 에러 없음 | Unit |
| TC-DR-U04 | 같은 유저 SetActive 2회 호출 -> 덮어쓰기 | 마지막 roomId 반환 | Unit |

---

## 3. 교착 처리 개선 테스트 시나리오 (TC-DL)

> 설계 참조: `12-player-lifecycle-design.md` 3절
> 핵심: 드로우 파일 소진 -> "배치 또는 패스" 모드, 전원 연속 패스 시 종료

### 3.1 정상 시나리오

| ID | 시나리오 | 전제조건 | 테스트 절차 | 검증 포인트 | 계층 | 우선순위 |
|----|----------|----------|-------------|-------------|------|----------|
| TC-DL-001 | 드로우 파일 소진 -> 패스 모드 전환 | drawPile 1장 남음, 2인 게임 | 1. Player1 DRAW_TILE (마지막 1장 뽑기) 2. drawPileCount == 0 확인 3. Player2 DRAW_TILE 전송 | TILE_DRAWN.drawnTile == null (드로우 아닌 패스), consecutivePassCount == 1, Player2 턴 종료 | Integration (WS) | P1 |
| TC-DL-002 | 전원 패스 -> 게임 종료 + 점수 기반 승자 | drawPileCount == 0, 2인 게임 | 1. Player1 DRAW_TILE (패스) 2. Player2 DRAW_TILE (패스) 3. consecutivePassCount >= 2 | GAME_OVER, endType == "STALEMATE", winner == 잔여 타일 점수 최소 플레이어 | Integration (WS) | P1 |
| TC-DL-003 | 패스 모드에서 배치 가능 플레이어는 배치 가능 | drawPileCount == 0 | 1. Player1이 유효한 세트 CONFIRM_TURN 2. 배치 성공 확인 3. consecutivePassCount == 0 리셋 확인 | TURN_END, 배치 정상 성공, 교착 카운터 리셋 | Integration (WS) | P1 |
| TC-DL-004 | 1명 배치 후 나머지 패스 -> 카운터 리셋 | drawPileCount == 0, 3인 게임 | 1. Player1 CONFIRM_TURN (배치 성공) 2. consecutivePassCount == 0 확인 3. Player2 DRAW_TILE (패스) 4. Player3 DRAW_TILE (패스) 5. Player1 DRAW_TILE (패스) 6. 전원 패스 -> GAME_OVER | 배치로 카운터 리셋, 이후 전원 패스 시에만 교착 종료 | Integration (WS) | P2 |

### 3.2 엣지 케이스

| ID | 시나리오 | 전제조건 | 테스트 절차 | 검증 포인트 | 계층 | 우선순위 |
|----|----------|----------|-------------|-------------|------|----------|
| TC-DL-005 | 드로우 파일 소진 직전 드로우 -> 정상 타일 뽑기 | drawPile 1장 | 1. DRAW_TILE 전송 2. 정상 타일 수신 3. drawPileCount == 0 | 마지막 1장은 정상 드로우, 이후부터 패스 모드 | Unit + Integration | P1 |
| TC-DL-006 | 패스 모드에서 INVALID_MOVE -> 카운터 미증가 | drawPileCount == 0 | 1. Player1 무효 배치 CONFIRM_TURN 2. INVALID_MOVE 수신 3. consecutivePassCount 미변경 | 무효 배치는 패스로 간주하지 않음, 카운터 유지 | Unit | P2 |
| TC-DL-007 | 기권자 포함 교착 판정 | 3인, Player3 FORFEITED, drawPileCount == 0 | 1. Player1 패스 2. Player2 패스 3. activePlayerCount == 2, consecutivePassCount >= 2 | 기권자 제외하고 활성 플레이어 수만으로 교착 판정 | Unit | P1 |
| TC-DL-008 | 턴 타임아웃 -> 자동 패스 (드로우 파일 소진 시) | drawPileCount == 0, Player1 턴 | 1. Player1 턴 타임아웃 (아무 행동 안함) | 자동 패스 처리 (기존 자동 드로우 대신), consecutivePassCount++ | Unit | P2 |
| TC-DL-009 | 패스 모드에서 RESET_TURN -> 정상 동작 | drawPileCount == 0, 배치 중 | 1. Player1이 타일 배치 후 RESET_TURN 2. 랙 복원 확인 3. Player1 추가 행동 가능 | 되돌리기 정상, 패스 모드 유지 | Unit | P3 |

### 3.3 DrawTile 패스 모드 단위 테스트

| ID | 시나리오 | 기대 결과 | 계층 |
|----|----------|-----------|------|
| TC-DL-U01 | DrawTile(drawPile 비어있음) -> 패스 처리 | drawnTile == nil, consecutivePassCount++, 턴 전환 | Unit |
| TC-DL-U02 | DrawTile(drawPile 있음) -> 정상 드로우 | drawnTile != nil, consecutivePassCount++ | Unit |
| TC-DL-U03 | 패스 후 교착 미도달 (2/3) | consecutivePassCount == 2, playerCount == 3, 게임 계속 | Unit |
| TC-DL-U04 | 패스 후 교착 도달 (3/3) | consecutivePassCount == 3, STALEMATE 종료 | Unit |
| TC-DL-U05 | countActivePlayers: 기권자 제외 | 3인 중 1명 FORFEITED -> return 2 | Unit |

### 3.4 프론트엔드 UI 테스트

| ID | 시나리오 | 테스트 절차 | 검증 포인트 | 계층 |
|----|----------|-------------|-------------|------|
| TC-DL-E01 | 드로우 버튼 -> 패스 버튼 전환 | drawPileCount == 0 상태에서 ActionBar 렌더링 | 버튼 텍스트 "패스", 드로우 비활성화 | E2E (Playwright) |
| TC-DL-E02 | 드로우 파일 소진 안내 메시지 | drawPileCount == 0 | "배치하거나 패스하세요" 안내 표시 | E2E (Playwright) |

---

## 4. 브라우저 이탈 경고 테스트 시나리오 (TC-BU)

> 설계 참조: `12-player-lifecycle-design.md` 4절
> 핵심: useGameLeaveGuard 훅, PLAYING 상태에서만 활성

### 4.1 정상 시나리오

| ID | 시나리오 | 전제조건 | 테스트 절차 | 검증 포인트 | 계층 | 우선순위 |
|----|----------|----------|-------------|-------------|------|----------|
| TC-BU-001 | 게임 중 브라우저 탭 닫기 -> 경고 표시 | 게임 PLAYING 상태, GameClient 페이지 | 1. `window.dispatchEvent(new Event('beforeunload'))` 2. event.defaultPrevented 확인 | beforeunload 이벤트 preventDefault 호출됨, returnValue 설정됨 | E2E (Playwright) | P1 |
| TC-BU-002 | 로비에서 브라우저 닫기 -> 경고 없음 | 로비 페이지 | 1. `window.dispatchEvent(new Event('beforeunload'))` 2. event.defaultPrevented 확인 | 경고 미발생 (beforeunload 리스너 미등록) | E2E (Playwright) | P1 |
| TC-BU-003 | 게임 중 뒤로가기 -> 확인 모달 | 게임 PLAYING 상태 | 1. `window.history.back()` 시뮬레이션 2. popstate 이벤트 트리거 3. confirm 다이얼로그 확인 | "게임이 진행 중입니다. 나가시겠습니까?" 메시지 표시 | E2E (Playwright) | P1 |

### 4.2 엣지 케이스

| ID | 시나리오 | 전제조건 | 테스트 절차 | 검증 포인트 | 계층 | 우선순위 |
|----|----------|----------|-------------|-------------|------|----------|
| TC-BU-004 | 게임 종료 후 이동 -> 경고 없음 | 게임 FINISHED 상태 | 1. GAME_OVER 수신 확인 2. 뒤로가기 또는 로비 버튼 클릭 | 경고 없이 정상 이동 | E2E (Playwright) | P2 |
| TC-BU-005 | 대기실(WAITING)에서 이동 -> 경고 없음 | WaitingRoom 페이지 | 1. 뒤로가기 2. 로비로 이동 | 경고 없이 정상 이동 | E2E (Playwright) | P2 |
| TC-BU-006 | 확인 모달에서 "취소" -> 페이지 유지 | 게임 PLAYING, 뒤로가기 시도 | 1. 뒤로가기 시도 2. confirm 다이얼로그에서 "취소" | 현재 페이지 유지, 게임 계속 | E2E (Playwright) | P2 |
| TC-BU-007 | 확인 모달에서 "확인" -> LEAVE_GAME + 로비 이동 | 게임 PLAYING, 뒤로가기 시도 | 1. 뒤로가기 시도 2. confirm 다이얼로그에서 "확인" | LEAVE_GAME 메시지 전송, 로비로 이동 | E2E (Playwright) | P2 |
| TC-BU-008 | 연습 모드에서 이탈 -> 경고 없음 | /practice 페이지 | 1. 브라우저 뒤로가기 | 경고 없이 정상 이동 (1인 연습 = 영향 없음) | E2E (Playwright) | P3 |

---

## 5. 코드 변경 14건 회귀 영향 분석 (TC-REG)

### 5.1 변경 사항 요약 (git diff HEAD~3..HEAD)

최근 3개 커밋에서 13개 파일, +182/-45 라인 변경이 발생했다.

| # | 파일 | 변경 요약 | 변경 규모 |
|---|------|-----------|-----------|
| 1 | `cmd/server/main.go` | Admin 라우트에 JWTAuth + RequireRole("admin") 미들웨어 추가 | +5/-3 |
| 2 | `engine/game_rules_comprehensive_test.go` | 조커 점수 테스트 수정: Score()=30 -> setScore(위치값) 기반으로 변경. 신규 TC 추가 | +18/-5 |
| 3 | `engine/validator.go` | validateInitialMeld: 조커 점수 계산을 Tile.Score()(고정 30) -> groupScore/runScore(위치값) 기반으로 변경. setIsSubsetOf 헬퍼 추가 | +35/-13 |
| 4 | `engine/validator_test.go` | 조커 최초 등록 TC 3건 추가, 기존 TC 수정 (JokerInFirstMeld 실패로 변경) | +42/-12 |
| 5 | `handler/ws_handler.go` | broadcastTurnStart에 TurnNumber 필드 추가 | +1 |
| 6 | `service/game_service.go` | snapshotMu sync.Mutex 추가 (동시성 보호). PlaceTiles/ConfirmTurn/DrawTile/ResetTurn에 Lock/Unlock 적용 | +20/-4 |
| 7 | `frontend/e2e/auth.json` | 세션 토큰 갱신 (정상 운영) | +4/-4 |
| 8 | `frontend/GameClient.tsx` | effectiveMySeat 우선순위 변경 (gameStore.mySeat 우선). 게임 종료 시 reset() 호출. ActionBar에 drawPileCount prop 추가 | +6/-5 |
| 9 | `frontend/LobbyClient.tsx` | joinRoom 에러 핸들링 개선. joinError 상태 + 에러 UI 추가. 성공 시에만 라우터 이동 | +30/-2 |
| 10 | `frontend/WaitingRoomClient.tsx` | isHost 판별: mySeat==0 조건 제거 (초기값 0 오판 방지) | +2/-4 |
| 11 | `frontend/ActionBar.tsx` | drawPileCount prop 추가, drawPileCount==0일 때 드로우 버튼 비활성화 | +3/-1 |
| 12 | `frontend/useWebSocket.ts` | TURN_START 수신 시 resetPending() 호출 추가. TurnNumber 핸들링 | +6 |
| 13 | `frontend/gameStore.ts` | mySeat 초기값 0 -> -1 변경 | +1/-1 |

### 5.2 회귀 리스크 매트릭스

| 변경 # | 영향 범위 | 리스크 | 관련 기존 테스트 | 예상 영향 | 회귀 TC |
|--------|-----------|--------|----------------|-----------|---------|
| 1 | Admin API 인증 | **Medium** | Admin API 수동 테스트 (인증 없이 호출하던 스크립트 깨짐) | Admin API 호출 시 JWT 필요. 기존 E2E/WS 테스트에는 영향 없음 (admin 미사용) | TC-REG-001 |
| 2,3,4 | 조커 최초 등록 점수 | **High** | Go 338개 중 직접 관련: TestInitialMeld_JokerScoring, TestValidateTurnConfirm_JokerInFirstMeld + 파생 TC | **동작 변경**: 조커 Score()=30 -> 위치값으로 점수 계산. JK1+R7a+B7a = 44점(기존) -> 21점(변경). 기존 "통과" TC가 "실패"로 변경됨. 테스트 코드도 함께 수정됨 | TC-REG-002 |
| 5 | TurnNumber 브로드캐스트 | **Low** | WS 멀티플레이 TC-GM-042 (턴 전환) | 기존 TC에서 TurnNumber 검증하지 않았으므로 영향 없음. 프론트엔드 turnNumber 표시 개선 | TC-REG-003 |
| 6 | snapshot Mutex | **Low** | PlaceTiles/ConfirmTurn/DrawTile/ResetTurn 관련 TC 전체 | 동시성 보호 추가. 기존 단일 스레드 테스트에서는 동작 변경 없음. Race condition 방지 목적 | TC-REG-004 |
| 7 | auth.json 갱신 | **None** | Playwright E2E 131개 전체 | 세션 만료 시 전체 E2E 실패 가능. 현재 토큰 유효기간 내 -> 영향 없음 | - |
| 8 | effectiveMySeat 우선순위 | **Medium** | game-ui-multiplayer.spec.ts, game-ui-state.spec.ts | mySeat 초기값 -1 + 우선순위 변경으로 AUTH_OK 수신 전 isMyTurn 판별 변경 가능. E2E는 AUTH_OK 후 테스트하므로 영향 낮음 | TC-REG-005 |
| 8 | reset() 호출 (게임 종료) | **Medium** | game-ui-state.spec.ts (게임 종료 시나리오) | 기존 setGameEnded(false) -> reset() 전체 초기화. 로비 이동 시 store 잔여 상태 문제 해소. 기존 TC에서 게임 종료 후 상태 검증하는 항목 확인 필요 | TC-REG-006 |
| 9 | joinRoom 에러 핸들링 | **Medium** | game-ui-multiplayer.spec.ts (방 참가 시나리오) | 기존: 실패해도 라우터 이동. 변경: 실패 시 로비 유지 + 에러 표시. 기존 E2E에서 joinRoom 실패 후 대기실 도달 테스트가 있다면 깨질 수 있음 | TC-REG-007 |
| 10 | isHost 판별 변경 | **Low** | WaitingRoomClient 관련 E2E | mySeat==0 조건 제거. hostUserId 비교만 사용. Google OAuth 세션에서 user.id가 있으면 정상. dev-login에서 id 필드 확인 필요 | TC-REG-008 |
| 11 | 드로우 버튼 비활성화 | **Low** | game-ui-bug-fixes.spec.ts, game-ui-practice-rules.spec.ts | drawPileCount==0 조건 추가. 일반 게임에서 drawPileCount > 0이므로 기존 테스트 영향 없음. Practice 모드는 ActionBar 미사용 | TC-REG-009 |
| 12 | TURN_START resetPending | **Medium** | game-ui-state.spec.ts (턴 전환 시나리오) | TURN_START 수신 시 pending 상태 초기화. 기존에 수동 resetPending 호출하던 경로와 중복될 수 있으나, 정상적으로 더 안정적. 오히려 기존 "되돌리기 후 상태 불일치" 버그 방지 효과 | TC-REG-010 |
| 13 | mySeat 초기값 -1 | **Medium** | gameStore 의존 전체 | 기존 초기값 0은 seat 0번 플레이어로 오인될 가능성. -1로 변경하여 "미할당" 명확화. effectiveMySeat 로직과 결합하여 AUTH_OK 전 isMyTurn=false 보장 | TC-REG-011 |

### 5.3 영향받는 기존 테스트 식별

#### 5.3.1 Go 유닛 테스트 (338개)

| 영향 구분 | 테스트 수 | 상세 |
|-----------|-----------|------|
| **직접 영향** (validator.go 변경) | 5개 | TestInitialMeld_JokerScoring (수정됨), TestValidateTurnConfirm_JokerInFirstMeld (수정됨 + 분리), 신규 3개 추가 |
| **간접 영향** (game_service.go mutex) | 15+개 | PlaceTiles/ConfirmTurn/DrawTile/ResetTurn TC - 동작 변경 없으나 mutex 경유. 통과 예상 |
| **영향 없음** | 318개 | engine 순수 로직, ELO, pool, tile 파싱 등 |

#### 5.3.2 Playwright E2E 테스트 (131개)

| 영향 구분 | 테스트 수 | 상세 |
|-----------|-----------|------|
| **직접 영향** (UI 변경) | 0개 | 현재 E2E는 practice 모드 위주. GameClient 변경은 멀티플레이 E2E에만 영향 |
| **간접 영향** (auth.json) | 131개 | 세션 만료 시 전체 실패. 현재 유효기간 내 |
| **영향 없음** (practice) | 44개 | practice.spec.ts, stage1~6 - ActionBar 미사용, gameStore 미사용 |

#### 5.3.3 WS 통합 테스트 (21개)

| 영향 구분 | 테스트 수 | 상세 |
|-----------|-----------|------|
| **직접 영향** | 0개 | WS 테스트 스크립트는 dev-login 사용, admin API 미사용, 조커 초기 등록 미테스트 |
| **간접 영향** (mutex) | 16개 | TC-GM-xxx - 서비스 레이어 mutex 경유. 단일 연결 테스트이므로 동작 변경 없음 |
| **영향 없음** | 5개 | TC-WS-xxx 기본 연결 테스트 |

### 5.4 회귀 테스트 시나리오

| ID | 대상 변경 | 시나리오 | 검증 방법 | 우선순위 |
|----|-----------|----------|-----------|----------|
| TC-REG-001 | Admin JWT 미들웨어 | Admin API 인증 없이 호출 시 401 반환 | `curl localhost:30080/admin/dashboard` -> 401 Unauthorized | P2 |
| TC-REG-002 | 조커 점수 계산 변경 | JK1+R7a+B7a 최초 등록 = 21점 미달 거부 | `go test -run TestValidateTurnConfirm_JokerInFirstMeld_BelowThirty` | P1 |
| TC-REG-003 | TurnNumber 브로드캐스트 | TURN_START에 turnNumber 필드 포함 확인 | WS 테스트 TC-GM-042 재실행 + turnNumber 검증 추가 | P3 |
| TC-REG-004 | snapshot Mutex 안전성 | 동시 PlaceTiles 요청 시 race condition 없음 | `go test -race ./internal/service/...` | P1 |
| TC-REG-005 | effectiveMySeat 우선순위 | AUTH_OK 수신 전 isMyTurn == false | 게임 접속 후 AUTH_OK 전 UI 상태 확인 (수동 검증) | P2 |
| TC-REG-006 | reset() 전체 초기화 | 게임 종료 -> 로비 이동 -> store 상태 초기화 확인 | 게임 종료 후 gameStore.mySeat == -1, gameState == null 확인 | P2 |
| TC-REG-007 | joinRoom 에러 핸들링 | 존재하지 않는 방 참가 시 로비 유지 + 에러 메시지 | 잘못된 roomId로 참가 시도, 에러 토스트 확인 | P2 |
| TC-REG-008 | isHost 판별 | 호스트가 아닌 플레이어가 시작 버튼 미표시 | 비호스트로 대기실 접속, "게임 시작" 버튼 미노출 확인 | P3 |
| TC-REG-009 | 드로우 비활성화 | drawPileCount==0일 때 드로우 버튼 disabled | ActionBar 컴포넌트 단위 테스트 | P3 |
| TC-REG-010 | TURN_START resetPending | 턴 전환 시 pending 상태 자동 초기화 | 턴 종료 -> 다음 턴 시작 -> pendingTableGroups == null 확인 | P2 |
| TC-REG-011 | mySeat 초기값 -1 | gameStore 초기 상태에서 mySeat == -1 | Store 초기화 후 mySeat 값 확인 | P2 |

### 5.5 회귀 리스크 종합 평가

```
전체 리스크 등급: MEDIUM

Critical (즉시 실행 필수): 0건
 - 기존 테스트 코드도 함께 수정되어 깨지는 TC 없음

High (우선 실행 권장): 2건
 - TC-REG-002: 조커 점수 계산 동작 변경 (기존 로직과 비호환)
 - TC-REG-004: snapshot Mutex race condition 검증

Medium (점검 필요): 5건
 - TC-REG-005~007, TC-REG-010~011: 프론트엔드 상태 관리 변경

Low (모니터링): 4건
 - TC-REG-001, 003, 008, 009: 부가 기능, 기존 테스트 비영향
```

---

## 6. 종합 테스트 매트릭스

### 6.1 신규 기능 TC 요약

| 기능 | Unit TC | Integration TC | E2E TC | 합계 |
|------|---------|----------------|--------|------|
| 퇴장/기권 (TC-LF) | 9 | 9 | 0 | **18** |
| 중복 방 제한 (TC-DR) | 4 | 5 | 0 | **9** |
| 교착 처리 (TC-DL) | 5 | 4 | 2 | **11** |
| 이탈 경고 (TC-BU) | 0 | 0 | 8 | **8** |
| **소계** | **18** | **18** | **10** | **46** |

### 6.2 회귀 TC 요약

| 범위 | TC 수 |
|------|-------|
| 회귀 (TC-REG) | **11** |

### 6.3 전체 TC 합계

| 구분 | 신규 | 회귀 | 합계 |
|------|------|------|------|
| **합계** | 46 | 11 | **57** |

### 6.4 실행 우선순위

```
P1 (구현 완료 즉시):
  TC-LF-001~003, TC-LF-005~006, TC-LF-008~009, TC-LF-U01~U06
  TC-DR-001~004, TC-DR-005
  TC-DL-001~003, TC-DL-005, TC-DL-007
  TC-BU-001~003
  TC-REG-002, TC-REG-004
  → 총 28건

P2 (Sprint 내 완료):
  TC-LF-004, TC-LF-007, TC-LF-011~012, TC-LF-U07~U09
  TC-DR-006, TC-DR-008~009
  TC-DL-004, TC-DL-006, TC-DL-008
  TC-BU-004~007
  TC-REG-001, TC-REG-005~007, TC-REG-010~011
  → 총 22건

P3 (여유 시 실행):
  TC-LF-010
  TC-DR-007, TC-DR-U01~U04
  TC-DL-009
  TC-BU-008
  TC-REG-003, TC-REG-008~009
  → 총 7건
```

---

## 7. 검증 규칙 매핑 (V-16 ~ V-19)

설계 문서 `12-player-lifecycle-design.md` 9절에서 추가된 검증 규칙과 TC 매핑.

| 규칙 ID | 검증 항목 | 매핑 TC |
|---------|----------|---------|
| V-16 | 기권 플레이어 턴 건너뛰기 | TC-LF-005, TC-LF-U01~U06 |
| V-17 | 활성 1명 시 자동 승리 | TC-LF-003, TC-LF-004, TC-LF-011 |
| V-18 | 드로우 파일 소진 후 패스 동작 | TC-DL-001, TC-DL-U01~U05 |
| V-19 | 중복 방 참가 차단 | TC-DR-001~009, TC-DR-U01~U04 |

### 기존 규칙 회귀 매핑

| 규칙 ID | 검증 항목 | 회귀 TC |
|---------|----------|---------|
| V-04 | 최초 등록 30점 (조커 점수 변경) | TC-REG-002 |
| V-01~V-15 | 기존 전체 규칙 | TC-REG-004 (race condition) |

---

## 8. 구현 시 테스트 코드 작성 가이드

### 8.1 Go 단위 테스트 구조

```go
// advanceTurn 테스트 예시 (TC-LF-U01~U06)
func TestAdvanceTurn_SkipForfeited(t *testing.T) {
    tests := []struct {
        name        string
        players     []PlayerState // Status 포함
        currentSeat int
        wantSeat    int
    }{
        // TC-LF-U01 ~ TC-LF-U06 케이스
    }
    for _, tt := range tests {
        t.Run(tt.name, func(t *testing.T) {
            // ...
        })
    }
}
```

### 8.2 WS 통합 테스트 구조

```go
// Grace Period 테스트 예시 (TC-LF-001)
func TestGracePeriod_DisconnectAndForfeit(t *testing.T) {
    // 1. 2인 게임 시작
    // 2. Player2 WS 연결 끊기
    // 3. PLAYER_LEAVE 브로드캐스트 확인
    // 4. time.Sleep(61 * time.Second) -- 또는 mock timer
    // 5. PLAYER_FORFEITED 브로드캐스트 확인
}
```

### 8.3 Playwright E2E 구조

```typescript
// beforeunload 테스트 예시 (TC-BU-001)
test('게임 중 beforeunload 경고', async ({ page }) => {
  // 1. 게임 페이지 접속 + PLAYING 상태 진입
  // 2. beforeunload 이벤트 리스너 등록 확인
  const dialogPromise = page.waitForEvent('dialog');
  await page.evaluate(() => window.dispatchEvent(new Event('beforeunload')));
  // 3. 경고 다이얼로그 확인
});
```

---

## 9. 주의 사항

### 9.1 조커 점수 계산 동작 변경 (BREAKING CHANGE)

validator.go의 `validateInitialMeld` 조커 점수 계산이 변경되었다.

| 항목 | 변경 전 | 변경 후 |
|------|---------|---------|
| 조커 점수 | `Parse(code).Score()` = 고정 30점 | `groupScore()`/`runScore()` = 위치 기반 |
| JK1+R7a+B7a | 30+7+7 = 44점 (통과) | 7+7+7 = 21점 (거부) |
| JK1+R10a+B10a | 30+10+10 = 50점 (통과) | 10+10+10 = 30점 (통과) |

이 변경은 게임 규칙의 정확성을 높이는 것이지만, 기존 AI Adapter의 전략 계산이 "조커 = 30점"으로 가정하고 있다면 AI의 초기 등록 판단에 영향을 줄 수 있다. AI Adapter 팀에 공유 필요.

### 9.2 Grace Timer 테스트 시 시간 의존성

60초 대기가 필요한 TC-LF-001, TC-LF-006, TC-LF-007, TC-LF-008은 실제 시간에 의존한다.

**권장 접근**:
- Unit 테스트: `time.AfterFunc` 대신 인터페이스 기반 Timer 추상화 (mock timer 주입)
- Integration 테스트: Grace Period를 5초로 줄이는 테스트 전용 설정 또는 환경변수 `GRACE_PERIOD_SEC=5`

### 9.3 동시성 테스트 (TC-DR-008, TC-REG-004)

- `go test -race` 플래그로 race condition 탐지
- 동시 요청 시나리오는 goroutine 여러 개로 시뮬레이션

---

*문서 관리: 기능 구현 완료 시 각 TC의 "결과" 칸을 업데이트한다. 판정: PASS / FAIL / SKIP / BLOCKED*
