# 테스트 전략 (Test Strategy)

이 문서는 RummiArena 프로젝트의 전체 테스트 전략을 정의한다.
게임 엔진 규칙 검증(V-01~V-15), AI Adapter 실패 시나리오, WebSocket 실시간 통신,
CI/CD 파이프라인 연동까지 모든 테스트 활동의 기준 문서이다.

---

## 1. 테스트 전략 개요

### 1.1 품질 목표

| 항목 | 목표 | 비고 |
|------|------|------|
| 코드 커버리지 | 80% 이상 | SonarQube Quality Gate 기준 |
| SonarQube 최소 커버리지 | 60% 이상 | 파이프라인 중단 기준 |
| 버그 | 신규 코드 0건 | SonarQube |
| 취약점 | 신규 코드 0건 | SonarQube |
| 코드 스멜 | A등급 | SonarQube |
| 게임 규칙 검증 (V-01~V-15) | 100% 테스트 커버 | Game Engine 최우선 |
| AI Adapter 실패 시나리오 | 100% 커버 | 타임아웃, 파싱 실패, 무효 수 |
| E2E 게임 시나리오 | 핵심 5개 이상 | 정상 승리, 교착 상태, 재연결 등 |

### 1.2 테스트 피라미드

```mermaid
graph TB
    subgraph Pyramid["테스트 피라미드"]
        direction TB
        E2E["E2E 테스트\n(Playwright / k6)\n10%"]
        INT["통합 테스트\n(httptest / supertest)\n20%"]
        UNIT["단위 테스트\n(testify / jest)\n70%"]
    end

    E2E ~~~ INT
    INT ~~~ UNIT

    style E2E fill:#ff6b6b,color:#fff
    style INT fill:#ffd93d,color:#333
    style UNIT fill:#6bcb77,color:#fff
```

| 계층 | 비율 | 도구 | 대상 |
|------|------|------|------|
| 단위 테스트 (Unit) | 70% | Go: `testify` / NestJS: `jest` / Frontend: `jest` + RTL | 게임 엔진, 서비스 로직, 컴포넌트 |
| 통합 테스트 (Integration) | 20% | Go: `httptest` / NestJS: `supertest` | REST API, WebSocket, DB, AI Adapter |
| E2E 테스트 | 10% | Playwright, k6 | 게임 전체 시나리오, 성능 |

### 1.3 테스트 원칙

1. **"테스트 없으면 기능 없음"** -- 모든 기능은 테스트가 수반되어야 머지 가능
2. **엣지 케이스 우선** -- 정상 케이스보다 경계/실패 케이스를 먼저 설계
3. **Game Engine 테스트 최우선** -- 규칙 검증(V-01~V-15)은 100% 커버리지 필수
4. **AI 실패 시나리오 필수 테스트** -- 타임아웃, 잘못된 JSON, 무효 수 응답
5. **TDD Red-Green-Refactor 권장** -- 테스트 먼저, 구현 나중
6. **결정론적 테스트** -- 랜덤 요소(셔플 등)는 시드 고정 또는 목(mock) 처리

---

## 2. 단위 테스트 (Unit Test)

### 2.1 game-server (Go: testify)

Game Engine은 프로젝트의 핵심이므로 단위 테스트 커버리지 **90% 이상**을 목표로 한다.

#### 2.1.1 테스트 대상 및 파일 구조

```
src/game-server/
├── internal/
│   ├── engine/
│   │   ├── validator.go          → validator_test.go
│   │   ├── tile.go               → tile_test.go
│   │   ├── group.go              → group_test.go
│   │   ├── run.go                → run_test.go
│   │   ├── score.go              → score_test.go
│   │   └── stalemate.go          → stalemate_test.go
│   ├── service/
│   │   ├── room_service.go       → room_service_test.go
│   │   ├── game_service.go       → game_service_test.go
│   │   └── turn_service.go       → turn_service_test.go
│   ├── handler/
│   │   ├── room_handler.go       → room_handler_test.go
│   │   ├── game_handler.go       → game_handler_test.go
│   │   └── ws_handler.go         → ws_handler_test.go
│   ├── model/
│   │   ├── tile.go               → tile_test.go
│   │   └── game.go               → game_test.go
│   └── middleware/
│       └── auth.go               → auth_test.go
```

#### 2.1.2 Game Engine 테스트 상세

```go
// 예시: group_test.go
func TestValidGroup_ThreeTilesDifferentColors(t *testing.T) {
    tiles := []Tile{
        {Color: "R", Number: 7, Set: "a"},
        {Color: "B", Number: 7, Set: "a"},
        {Color: "K", Number: 7, Set: "b"},
    }
    assert := assert.New(t)
    assert.True(IsValidGroup(tiles))
}

func TestInvalidGroup_DuplicateColor(t *testing.T) {
    tiles := []Tile{
        {Color: "R", Number: 7, Set: "a"},
        {Color: "R", Number: 7, Set: "b"},
        {Color: "B", Number: 7, Set: "a"},
    }
    assert := assert.New(t)
    assert.False(IsValidGroup(tiles))
}
```

**테스트 테이블 (Table-Driven Tests)**:

Go의 테이블 기반 테스트 패턴을 적극 활용한다.

```go
func TestIsValidRun(t *testing.T) {
    tests := []struct {
        name     string
        tiles    []Tile
        expected bool
    }{
        {"연속 3장 런", parseTiles("Y3a", "Y4a", "Y5a"), true},
        {"연속 4장 런", parseTiles("B9a", "B10b", "B11a", "B12a"), true},
        {"비연속 (4 건너뜀)", parseTiles("Y3a", "Y5a", "Y6a"), false},
        {"순환 불가 (12-13-1)", parseTiles("R12a", "R13a", "R1a"), false},
        {"색상 불일치", parseTiles("R3a", "B4a", "Y5a"), false},
        {"2장 미달", parseTiles("K7a", "K8a"), false},
        {"조커 포함 런", parseTiles("K11a", "K12b", "JK1"), true},
    }

    for _, tt := range tests {
        t.Run(tt.name, func(t *testing.T) {
            assert.Equal(t, tt.expected, IsValidRun(tt.tiles))
        })
    }
}
```

#### 2.1.3 핸들러/서비스 테스트

- Repository는 인터페이스로 추상화하여 목(mock) 주입
- Redis/PostgreSQL 의존성 제거
- `testify/mock` 패키지 활용

```go
// mock repository
type MockGameRepo struct {
    mock.Mock
}

func (m *MockGameRepo) GetGameState(gameId string) (*GameState, error) {
    args := m.Called(gameId)
    return args.Get(0).(*GameState), args.Error(1)
}
```

### 2.2 ai-adapter (NestJS: jest)

#### 2.2.1 테스트 대상 및 파일 구조

```
src/ai-adapter/src/
├── adapter/
│   ├── openai.adapter.ts        → openai.adapter.spec.ts
│   ├── claude.adapter.ts        → claude.adapter.spec.ts
│   ├── deepseek.adapter.ts      → deepseek.adapter.spec.ts
│   └── ollama.adapter.ts        → ollama.adapter.spec.ts
├── prompt/
│   ├── prompt.builder.ts        → prompt.builder.spec.ts
│   └── persona.templates.ts     → persona.templates.spec.ts
├── parser/
│   └── response.parser.ts       → response.parser.spec.ts
├── dto/
│   ├── move-request.dto.ts      → move-request.dto.spec.ts
│   └── move-response.dto.ts     → move-response.dto.spec.ts
└── health/
    └── health.controller.ts     → health.controller.spec.ts
```

#### 2.2.2 ResponseParser 테스트 예시

```typescript
describe('ResponseParser', () => {
  describe('parseMoveResponse', () => {
    it('유효한 place 응답을 파싱한다', () => {
      const raw = JSON.stringify({
        action: 'place',
        tableGroups: [{ id: 'g1', tiles: ['R7a', 'B7a', 'K7b'], type: 'group' }],
        tilesFromRack: ['R7a'],
        reasoning: '그룹 배치',
      });
      const result = parser.parseMoveResponse(raw);
      expect(result.action).toBe('place');
      expect(result.tableGroups).toHaveLength(1);
    });

    it('잘못된 JSON은 ParseError를 던진다', () => {
      expect(() => parser.parseMoveResponse('not json')).toThrow(ParseError);
    });

    it('action 필드 누락 시 ValidationError를 던진다', () => {
      const raw = JSON.stringify({ tableGroups: [] });
      expect(() => parser.parseMoveResponse(raw)).toThrow(ValidationError);
    });

    it('빈 tilesFromRack은 draw 액션으로 처리한다', () => {
      const raw = JSON.stringify({
        action: 'place',
        tableGroups: [{ id: 'g1', tiles: ['R7a', 'B7a', 'K7b'], type: 'group' }],
        tilesFromRack: [],
      });
      expect(() => parser.parseMoveResponse(raw)).toThrow(ValidationError);
    });
  });
});
```

#### 2.2.3 PromptBuilder 테스트 예시

```typescript
describe('PromptBuilder', () => {
  it('shark/expert 캐릭터에 맞는 프롬프트를 생성한다', () => {
    const prompt = builder.build({
      persona: 'shark',
      difficulty: 'expert',
      psychologyLevel: 3,
      gameState: mockGameState,
    });
    expect(prompt).toContain('공격적으로');
    expect(prompt).toContain('상대를 압박');
    expect(prompt).toContain('행동 히스토리');
  });

  it('beginner 난이도는 상대 정보를 제외한다', () => {
    const prompt = builder.build({
      persona: 'rookie',
      difficulty: 'beginner',
      psychologyLevel: 0,
      gameState: mockGameState,
    });
    expect(prompt).not.toContain('상대 행동 히스토리');
    expect(prompt).not.toContain('미출현 타일');
  });

  it('프롬프트 토큰이 2000 이하인지 검증한다', () => {
    const prompt = builder.build({
      persona: 'fox',
      difficulty: 'expert',
      psychologyLevel: 3,
      gameState: largeGameState,
    });
    const tokenCount = estimateTokens(prompt);
    expect(tokenCount).toBeLessThanOrEqual(2000);
  });
});
```

### 2.3 Frontend (React Testing Library + jest)

#### 2.3.1 테스트 대상

| 컴포넌트 | 테스트 항목 |
|----------|------------|
| TileComponent | 타일 렌더링 (색상, 숫자, 조커 표시) |
| RackComponent | 드래그 앤 드롭, 타일 순서 변경 |
| TableComponent | 세트 배치, 재배치 시각화 |
| TimerComponent | 카운트다운, 타임아웃 경고 |
| GameBoardComponent | 전체 게임 화면 통합 |
| ScoreBoard | 점수 표시, 승자 하이라이트 |

#### 2.3.2 테스트 예시

```typescript
describe('TileComponent', () => {
  it('빨강 7 타일을 올바르게 렌더링한다', () => {
    render(<TileComponent tile={{ code: 'R7a', color: 'R', number: 7 }} />);
    expect(screen.getByText('7')).toBeInTheDocument();
    expect(screen.getByTestId('tile-R7a')).toHaveClass('tile-red');
  });

  it('조커 타일은 특수 스타일로 렌더링한다', () => {
    render(<TileComponent tile={{ code: 'JK1', isJoker: true }} />);
    expect(screen.getByTestId('tile-JK1')).toHaveClass('tile-joker');
  });
});
```

---

## 3. 통합 테스트 (Integration Test)

### 3.1 REST API 통합 테스트 (game-server)

Go의 `net/http/httptest` 패키지를 사용하여 실제 HTTP 요청/응답을 검증한다.

#### 3.1.1 Room API 테스트

```go
func TestCreateRoom_Success(t *testing.T) {
    router := setupTestRouter()
    body := `{"playerCount":4,"turnTimeoutSec":60,"aiPlayers":[]}`

    w := httptest.NewRecorder()
    req, _ := http.NewRequest("POST", "/api/rooms", strings.NewReader(body))
    req.Header.Set("Authorization", "Bearer "+testJWT)
    router.ServeHTTP(w, req)

    assert.Equal(t, http.StatusCreated, w.Code)
    var resp RoomResponse
    json.Unmarshal(w.Body.Bytes(), &resp)
    assert.Equal(t, "WAITING", resp.Status)
    assert.Len(t, resp.RoomCode, 4)
}

func TestCreateRoom_InvalidTurnTimeout(t *testing.T) {
    router := setupTestRouter()
    body := `{"playerCount":4,"turnTimeoutSec":10}` // 30 미만

    w := httptest.NewRecorder()
    req, _ := http.NewRequest("POST", "/api/rooms", strings.NewReader(body))
    req.Header.Set("Authorization", "Bearer "+testJWT)
    router.ServeHTTP(w, req)

    assert.Equal(t, http.StatusBadRequest, w.Code)
}
```

#### 3.1.2 테스트 대상 API 목록

| API | 정상 케이스 | 에러 케이스 |
|-----|-----------|-----------|
| POST /api/rooms | Room 생성 성공 | 잘못된 playerCount, turnTimeout 범위 초과 |
| POST /api/rooms/:id/join | 참가 성공 | Room 가득참 (ROOM_FULL), 게임 이미 시작 |
| POST /api/rooms/:id/start | 게임 시작 성공 | 2명 미만, 호스트 아닌 사용자 시작 시도 |
| POST /api/rooms/:id/add-ai | AI 추가 성공 | Room 가득참, 잘못된 AI 타입 |
| GET /api/rooms/:id | Room 조회 성공 | 존재하지 않는 Room |
| GET /api/auth/me | 사용자 정보 조회 | JWT 만료/무효 |
| POST /api/practice/start | 연습 세션 시작 | 잘못된 스테이지 번호 |
| GET /api/games/:id | 게임 기록 조회 | 존재하지 않는 게임 |
| DELETE /api/admin/rooms/:id | 강제 종료 | ADMIN 아닌 사용자 |

### 3.2 WebSocket 통합 테스트

#### 3.2.1 테스트 시나리오

```mermaid
sequenceDiagram
    participant TC as 테스트 클라이언트
    participant GS as Game Server
    participant Redis as Redis

    Note over TC, GS: 시나리오: 정상 턴 흐름
    TC->>GS: WebSocket 연결 (ws://host/ws?roomId=xxx)
    TC->>GS: auth 이벤트 (JWT)
    GS-->>TC: game:state (전체 상태)
    GS-->>TC: turn:start (내 턴)
    TC->>GS: turn:place (타일 배치)
    TC->>GS: turn:confirm (턴 확정)
    GS-->>TC: turn:action (배치 결과)
    GS-->>TC: turn:start (다음 플레이어 턴)
```

#### 3.2.2 WebSocket 테스트 케이스

| 시나리오 | 검증 항목 |
|----------|----------|
| 연결 및 인증 | auth 이벤트 후 game:state 수신 확인 |
| 인증 없이 5초 대기 | 서버가 연결을 종료하는지 확인 |
| 타일 배치 (유효) | turn:action에 배치 결과 포함 |
| 타일 배치 (무효) | error 이벤트 수신, 테이블 롤백 |
| 드로우 | 랙에 1장 추가, 턴 종료 |
| 타임아웃 | turn:timeout 이벤트 + 자동 드로우 |
| 재연결 (30초 이내) | game:state로 전체 동기화 |
| 재연결 (30초 초과) | 해당 턴 자동 드로우 처리 |
| 멀티 클라이언트 브로드캐스트 | 모든 연결된 클라이언트에게 이벤트 전달 |
| 자기 턴 아닐 때 행동 | NOT_YOUR_TURN 에러 |

#### 3.2.3 Go WebSocket 테스트 구현

```go
func TestWebSocket_TurnPlaceAndConfirm(t *testing.T) {
    server := httptest.NewServer(setupWSHandler())
    defer server.Close()

    wsURL := "ws" + strings.TrimPrefix(server.URL, "http") + "/ws?roomId=" + testRoomId
    conn, _, err := websocket.DefaultDialer.Dial(wsURL, nil)
    require.NoError(t, err)
    defer conn.Close()

    // 인증
    conn.WriteJSON(WSMessage{Event: "auth", Data: map[string]string{"token": testJWT}})

    // game:state 수신 대기
    var stateMsg WSMessage
    conn.ReadJSON(&stateMsg)
    assert.Equal(t, "game:state", stateMsg.Event)

    // 타일 배치
    conn.WriteJSON(WSMessage{
        Event: "turn:place",
        Data: map[string]interface{}{
            "tableGroups": []map[string]interface{}{
                {"id": "g1", "tiles": []string{"R7a", "B7a", "K7b"}, "type": "group"},
            },
            "tilesFromRack": []string{"R7a"},
        },
    })

    // 턴 확정
    conn.WriteJSON(WSMessage{Event: "turn:confirm"})

    // 결과 수신
    var resultMsg WSMessage
    conn.ReadJSON(&resultMsg)
    assert.Equal(t, "turn:action", resultMsg.Event)
}
```

### 3.3 DB 통합 테스트

#### 3.3.1 PostgreSQL 통합 테스트

테스트 전용 데이터베이스를 사용하며, 각 테스트 전후로 트랜잭션 롤백한다.

| 테스트 대상 | 검증 항목 |
|------------|----------|
| users CRUD | 생성, 조회, ELO 업데이트, 차단 |
| games 생성 | 게임 생성, 상태 전이 (WAITING -> PLAYING -> FINISHED) |
| game_players | 참가자 등록, 점수 기록, 승자 판정 |
| ai_call_logs | AI 호출 로그 저장, 모델별 집계 |
| elo_history | ELO 변동 기록, K-factor 적용 |
| game_snapshots | 턴 스냅샷 저장, 복기 조회 |
| practice_sessions | 연습 세션 생성, 스테이지 완료 |

#### 3.3.2 Redis 통합 테스트

```go
func TestRedis_GameStateLifecycle(t *testing.T) {
    rdb := setupTestRedis()
    defer rdb.FlushDB(ctx)

    gameId := "test-game-1"

    // 게임 상태 저장
    err := rdb.HSet(ctx, "game:"+gameId+":state", map[string]interface{}{
        "status":        "PLAYING",
        "currentTurn":   1,
        "currentPlayer": 0,
    }).Err()
    require.NoError(t, err)

    // TTL 설정 (7200초)
    rdb.Expire(ctx, "game:"+gameId+":state", 7200*time.Second)

    // 상태 조회
    status, err := rdb.HGet(ctx, "game:"+gameId+":state", "status").Result()
    require.NoError(t, err)
    assert.Equal(t, "PLAYING", status)

    // 게임 종료 후 TTL 단축 (600초)
    rdb.Expire(ctx, "game:"+gameId+":state", 600*time.Second)
    ttl := rdb.TTL(ctx, "game:"+gameId+":state").Val()
    assert.LessOrEqual(t, ttl.Seconds(), float64(600))
}
```

### 3.4 AI Adapter 통합 테스트

NestJS `supertest`를 사용하여 AI Adapter의 REST API를 통합 테스트한다.
외부 LLM API는 목(mock) 서버로 대체한다.

```typescript
describe('POST /ai/generate-move (Integration)', () => {
  let app: INestApplication;

  beforeAll(async () => {
    const module = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideProvider(OpenAIAdapter)
      .useValue(mockOpenAIAdapter)
      .compile();

    app = module.createNestApplication();
    await app.init();
  });

  it('유효한 place 응답을 반환한다', () => {
    return request(app.getHttpServer())
      .post('/ai/generate-move')
      .send(validMoveRequest)
      .expect(200)
      .expect((res) => {
        expect(res.body.action).toBe('place');
        expect(res.body.metadata.modelType).toBeDefined();
        expect(res.body.metadata.latencyMs).toBeGreaterThan(0);
      });
  });

  it('타임아웃 시 draw 로 fallback 한다', () => {
    mockOpenAIAdapter.generateMove.mockRejectedValue(new TimeoutError());
    return request(app.getHttpServer())
      .post('/ai/generate-move')
      .send(validMoveRequest)
      .expect(200)
      .expect((res) => {
        expect(res.body.action).toBe('draw');
        expect(res.body.metadata.retryCount).toBe(3);
      });
  });
});
```

---

## 4. E2E 테스트

### 4.1 도구 선정

| 도구 | 용도 | 선정 이유 |
|------|------|----------|
| Playwright | UI 기능 E2E | 크로스 브라우저 지원, WebSocket 테스트 내장 |
| k6 | 성능/부하 테스트 | 가볍고 스크립트 기반, WebSocket 지원 |

### 4.2 E2E 시나리오 목록

```mermaid
flowchart TB
    subgraph scenarios["E2E 테스트 시나리오"]
        S1["S-01: 정상 게임 플로우\n(Room 생성 -> 게임 시작 -> 타일 배치 -> 승리)"]
        S2["S-02: 교착 상태 게임\n(드로우 파일 소진 -> 점수 비교)"]
        S3["S-03: 재연결 시나리오\n(연결 끊김 -> 30초 내 재연결)"]
        S4["S-04: AI 혼합 게임\n(Human 1 + AI 3 대전)"]
        S5["S-05: 연습 모드 전체 플로우\n(Stage 1~6 순차 클리어)"]
        S6["S-06: 관리자 강제 종료\n(ADMIN이 게임 CANCELLED 처리)"]
        S7["S-07: 동시 접속 부하\n(k6: WebSocket 동시 접속)"]
    end
```

### 4.3 S-01 정상 게임 플로우 (Playwright)

```typescript
test('정상 게임: Room 생성부터 승리까지', async ({ browser }) => {
  // 1. 두 명의 플레이어 브라우저 생성
  const player1 = await browser.newPage();
  const player2 = await browser.newPage();

  // 2. Player 1: Room 생성
  await player1.goto('/');
  await player1.click('[data-testid="create-room"]');
  await player1.fill('[data-testid="player-count"]', '2');
  await player1.click('[data-testid="confirm-create"]');
  const roomCode = await player1.textContent('[data-testid="room-code"]');

  // 3. Player 2: Room 참가
  await player2.goto('/');
  await player2.fill('[data-testid="room-code-input"]', roomCode);
  await player2.click('[data-testid="join-room"]');

  // 4. Player 1: 게임 시작
  await player1.click('[data-testid="start-game"]');

  // 5. 양쪽 모두 game:started 이벤트 확인
  await expect(player1.locator('[data-testid="game-board"]')).toBeVisible();
  await expect(player2.locator('[data-testid="game-board"]')).toBeVisible();

  // 6. 턴 진행 (타일 배치 또는 드로우)
  // ... 게임 진행 로직 ...

  // 7. 게임 종료 확인
  await expect(player1.locator('[data-testid="game-result"]')).toBeVisible();
});
```

### 4.4 S-07 동시 접속 부하 테스트 (k6)

```javascript
import ws from 'k6/ws';
import { check } from 'k6';

export const options = {
  stages: [
    { duration: '30s', target: 50 },   // 50 동시 접속까지 증가
    { duration: '1m',  target: 50 },   // 50 유지
    { duration: '30s', target: 0 },    // 감소
  ],
};

export default function () {
  const url = 'ws://localhost:8080/ws?roomId=load-test-room';
  const res = ws.connect(url, {}, function (socket) {
    socket.on('open', function () {
      socket.send(JSON.stringify({ event: 'auth', data: { token: testJWT } }));
    });

    socket.on('message', function (data) {
      const msg = JSON.parse(data);
      check(msg, {
        'game:state 수신': (m) => m.event === 'game:state',
      });
    });

    socket.setTimeout(function () {
      socket.close();
    }, 30000);
  });

  check(res, { 'WebSocket 연결 성공': (r) => r && r.status === 101 });
}
```

---

## 5. 게임 규칙 테스트 매트릭스 (V-01 ~ V-15)

Game Engine이 검증해야 할 15개 규칙 각각에 대해 정상/경계/실패 케이스를 정의한다.

### V-01: 세트가 유효한 그룹 또는 런인가

| # | 케이스 | 입력 | 기대 결과 | 유형 |
|---|--------|------|----------|------|
| 1 | 유효한 3장 그룹 | `[R7a, B7a, K7b]` | 통과 | 정상 |
| 2 | 유효한 4장 그룹 | `[R5a, B5a, Y5a, K5b]` | 통과 | 정상 |
| 3 | 유효한 3장 런 | `[Y3a, Y4a, Y5a]` | 통과 | 정상 |
| 4 | 유효한 4장 런 | `[B9a, B10b, B11a, B12a]` | 통과 | 정상 |
| 5 | 그룹도 런도 아닌 조합 | `[R3a, B5a, K7b]` | 실패 | 실패 |
| 6 | 빈 세트 | `[]` | 실패 | 경계 |
| 7 | 단일 타일 | `[R7a]` | 실패 | 경계 |
| 8 | 조커만 3장 | `[JK1, JK2, JK1]` | 실패 (JK1 중복, 조커는 2장만 존재) | 경계 |

### V-02: 세트가 3장 이상인가

| # | 케이스 | 입력 | 기대 결과 | 유형 |
|---|--------|------|----------|------|
| 1 | 3장 세트 | `[R7a, B7a, K7b]` | 통과 | 정상 |
| 2 | 13장 런 (최대) | `[R1a, R2a, ..., R13a]` | 통과 | 경계 |
| 3 | 2장 세트 | `[R7a, B7a]` | 실패 | 실패 |
| 4 | 1장 세트 | `[R7a]` | 실패 | 실패 |
| 5 | 0장 세트 | `[]` | 실패 | 경계 |
| 6 | 5장 그룹 (불가) | `[R5a, B5a, Y5a, K5b, R5b]` | 실패 (같은 색 중복) | 경계 |

### V-03: 랙에서 최소 1장 추가했는가

| # | 케이스 | 상황 | 기대 결과 | 유형 |
|---|--------|------|----------|------|
| 1 | 랙에서 2장 배치 | tilesFromRack: 2장 | 통과 | 정상 |
| 2 | 랙에서 1장 배치 | tilesFromRack: 1장 | 통과 | 경계 |
| 3 | 랙에서 0장 (재배치만) | tilesFromRack: 0장 | 실패 | 실패 |
| 4 | 테이블 타일만 재배치 | 랙 변화 없음 | 실패 | 실패 |

### V-04: 최초 등록 30점 이상인가

| # | 케이스 | 배치 | 점수 합계 | 기대 결과 | 유형 |
|---|--------|------|----------|----------|------|
| 1 | 정확히 30점 | `[R10a, B10a, K10b]` | 30 | 통과 | 경계 |
| 2 | 30점 초과 | `[R10a, B10a, K10b]` + `[Y1a, Y2a, Y3a]` | 36 | 통과 | 정상 |
| 3 | 29점 (1점 부족) | `[R9a, B10a, K10b]` | 29 | 실패 | 경계 |
| 4 | 6점 (크게 부족) | `[Y1a, Y2a, Y3a]` | 6 | 실패 | 실패 |
| 5 | 조커 포함 30점 미만 | `[R8a, JK1, R10a]` (JK1=R9, 27점) | 27 | 실패 | 경계 |
| 6 | 조커 포함 30점 이상 | `[R11a, JK1, R13a]` (JK1=R12, 36점) | 36 | 통과 | 정상 |
| 7 | 복수 세트 합산 30점 | `[R5a, R6a, R7a]` (18) + `[B4a, B5a, B6a]` (15) | 33 | 통과 | 정상 |

### V-05: 최초 등록 시 랙 타일만 사용했는가

| # | 케이스 | 상황 | 기대 결과 | 유형 |
|---|--------|------|----------|------|
| 1 | 랙 타일만 사용 | 테이블 타일 재배치 없음 | 통과 | 정상 |
| 2 | 테이블 타일 재배치 시도 | hasInitialMeld=false인데 테이블 타일 이동 | 실패 | 실패 |
| 3 | 테이블 타일 + 랙 타일 혼합 | hasInitialMeld=false인데 기존 세트 수정 | 실패 | 실패 |

### V-06: 테이블 타일이 유실되지 않았는가

| # | 케이스 | 상황 | 기대 결과 | 유형 |
|---|--------|------|----------|------|
| 1 | 타일 보존 | 턴 전후 테이블 타일 수 동일 + 랙 추가분 | 통과 | 정상 |
| 2 | 타일 1장 유실 | 테이블 타일이 줄어듦 | 실패 | 실패 |
| 3 | 타일을 랙으로 회수 시도 | 테이블 타일을 랙에 넣으려는 시도 | 실패 | 실패 |
| 4 | 조커 교체 후 회수 (허용) | 조커를 교체하고 같은 턴에 사용 | 통과 | 경계 |

### V-07: 조커 교체 후 즉시 사용했는가

| # | 케이스 | 상황 | 기대 결과 | 유형 |
|---|--------|------|----------|------|
| 1 | 교체 후 즉시 사용 | JK1 교체 -> 같은 턴에 다른 세트에 배치 | 통과 | 정상 |
| 2 | 교체 후 미사용 | JK1 교체 -> 랙에 보관 시도 | 실패 | 실패 |
| 3 | 교체 후 교체한 세트가 무효 | 교체 후 원래 세트가 3장 미만 | 실패 | 경계 |
| 4 | 조커 2장 동시 교체 | JK1, JK2 모두 교체 -> 모두 즉시 사용 | 통과 | 경계 |

### V-08: 자기 턴인가 (currentPlayerSeat 확인)

| # | 케이스 | 상황 | 기대 결과 | 유형 |
|---|--------|------|----------|------|
| 1 | 자기 턴에 행동 | currentPlayerSeat == 요청자 seat | 통과 | 정상 |
| 2 | 다른 사람 턴에 행동 | currentPlayerSeat != 요청자 seat | NOT_YOUR_TURN | 실패 |
| 3 | seat 범위 초과 | seat=5 (유효 범위: 0~3) | 에러 | 경계 |

### V-09: 턴 타임아웃 초과인가

| # | 케이스 | 상황 | 기대 결과 | 유형 |
|---|--------|------|----------|------|
| 1 | 시간 내 행동 | 60초 중 30초에 confirm | 통과 | 정상 |
| 2 | 정확히 타임아웃 | 60초 만료 | 자동 드로우 | 경계 |
| 3 | 타임아웃 직전 (1초 전) | 59초에 confirm | 통과 | 경계 |
| 4 | 타임아웃 후 행동 시도 | 61초에 confirm | 거부 (이미 자동 드로우 처리됨) | 실패 |
| 5 | 타이머 최소값 (30초) | turnTimeoutSec=30 | 30초 후 자동 드로우 | 경계 |
| 6 | 타이머 최대값 (120초) | turnTimeoutSec=120 | 120초 후 자동 드로우 | 경계 |

### V-10: 드로우 파일이 비어있는가

| # | 케이스 | 상황 | 기대 결과 | 유형 |
|---|--------|------|----------|------|
| 1 | 타일 남아있음 | drawPileCount > 0 | 1장 드로우 | 정상 |
| 2 | 타일 1장 남음 | drawPileCount = 1 | 마지막 1장 드로우 | 경계 |
| 3 | 타일 없음 | drawPileCount = 0 | 패스 (턴 종료만) | 경계 |

### V-11: 교착 상태인가

| # | 케이스 | 상황 | 기대 결과 | 유형 |
|---|--------|------|----------|------|
| 1 | 드로우 파일 있음 | drawPileCount > 0 | 교착 아님, 게임 계속 | 정상 |
| 2 | 소진 후 배치 성공 | 드로우 파일 소진, 누군가 배치 | 교착 아님, 게임 계속 | 정상 |
| 3 | 소진 + 전원 패스 1라운드 | 2인 게임, 2턴 연속 패스 | 교착 확정, 점수 비교 | 경계 |
| 4 | 소진 + 전원 패스 (4인) | 4인 게임, 4턴 연속 패스 | 교착 확정 | 경계 |
| 5 | 교착 시 동점 | 남은 타일 합산 동일 | 타일 수 적은 쪽 승리 | 경계 |
| 6 | 교착 시 타일 수도 동점 | 합산 동일 + 타일 수 동일 | 무승부 | 경계 |

### V-12: 승리 조건 달성인가 (랙 타일 0장)

| # | 케이스 | 상황 | 기대 결과 | 유형 |
|---|--------|------|----------|------|
| 1 | 타일 전부 배치 | 랙 0장 + 모든 세트 유효 | 승리, FINISHED | 정상 |
| 2 | 타일 1장 남음 | 랙 1장 | 게임 계속 | 정상 |
| 3 | 마지막 타일이 무효 세트 | 랙 0장이지만 세트 무효 | 롤백, 게임 계속 | 경계 |
| 4 | 조커가 마지막 타일 | JK1 1장으로 세트 완성 | 유효하면 승리 | 경계 |

### V-13: 재배치 권한이 있는가 (hasInitialMeld)

| # | 케이스 | 상황 | 기대 결과 | 유형 |
|---|--------|------|----------|------|
| 1 | 최초 등록 완료 후 재배치 | hasInitialMeld=true | 통과 | 정상 |
| 2 | 최초 등록 미완료 시 재배치 시도 | hasInitialMeld=false | 재배치 거부 | 실패 |
| 3 | 최초 등록과 동시에 재배치 | 같은 턴에 최초 등록 + 재배치 | 실패 (등록 후 다음 턴부터 가능) | 경계 |

### V-14: 그룹에서 같은 색상이 중복되지 않는가

| # | 케이스 | 입력 | 기대 결과 | 유형 |
|---|--------|------|----------|------|
| 1 | 3색 모두 다름 | `[R7a, B7a, K7b]` | 통과 | 정상 |
| 2 | 4색 모두 다름 | `[R5a, B5a, Y5a, K5b]` | 통과 | 정상 |
| 3 | 같은 색 2장 (세트a, 세트b) | `[R7a, R7b, B7a]` | 실패 | 실패 |
| 4 | 조커로 색상 대체 | `[R7a, JK1, K7b]` (JK1=B7 또는 Y7) | 통과 | 정상 |
| 5 | 조커 2장 + 숫자 1장 | `[R7a, JK1, JK2]` | 통과 (3장, 조커가 B7/Y7/K7 대체) | 경계 |

### V-15: 런에서 숫자가 연속인가 (13-1 순환 불가)

| # | 케이스 | 입력 | 기대 결과 | 유형 |
|---|--------|------|----------|------|
| 1 | 1-2-3 연속 | `[R1a, R2a, R3a]` | 통과 | 정상 |
| 2 | 11-12-13 연속 | `[R11a, R12a, R13a]` | 통과 | 경계 |
| 3 | 12-13-1 순환 시도 | `[R12a, R13a, R1a]` | 실패 | 실패 |
| 4 | 13-1-2 순환 시도 | `[R13a, R1a, R2a]` | 실패 | 실패 |
| 5 | 1-2-3-...-13 전체 런 | `[R1a, R2a, ..., R13a]` | 통과 | 경계 |
| 6 | 조커로 빈 자리 대체 | `[R5a, JK1, R7a]` (JK1=R6) | 통과 | 정상 |
| 7 | 조커 2장 연속 | `[R5a, JK1, JK2, R8a]` | 통과 (6-7 대체) | 경계 |
| 8 | 비연속 (4 건너뜀) | `[Y3a, Y5a, Y6a]` | 실패 | 실패 |

### 규칙 테스트 커버리지 요약

| 규칙 ID | 규칙 명 | 정상 | 경계 | 실패 | 합계 |
|---------|---------|------|------|------|------|
| V-01 | 유효한 그룹/런 | 4 | 4 | 1 | 8 이상 |
| V-02 | 3장 이상 | 1 | 2 | 2 | 6 이상 |
| V-03 | 랙 1장 이상 추가 | 1 | 1 | 2 | 4 이상 |
| V-04 | 최초 등록 30점 | 3 | 3 | 1 | 7 이상 |
| V-05 | 랙 타일만 사용 | 1 | 0 | 2 | 3 이상 |
| V-06 | 타일 유실 없음 | 1 | 1 | 2 | 4 이상 |
| V-07 | 조커 즉시 사용 | 1 | 2 | 1 | 4 이상 |
| V-08 | 자기 턴 확인 | 1 | 1 | 1 | 3 이상 |
| V-09 | 턴 타임아웃 | 1 | 4 | 1 | 6 이상 |
| V-10 | 드로우 파일 확인 | 1 | 2 | 0 | 3 이상 |
| V-11 | 교착 상태 | 2 | 4 | 0 | 6 이상 |
| V-12 | 승리 조건 | 2 | 2 | 0 | 4 이상 |
| V-13 | 재배치 권한 | 1 | 1 | 1 | 3 이상 |
| V-14 | 그룹 색상 중복 | 2 | 1 | 1 | 5 이상 |
| V-15 | 런 숫자 연속 | 2 | 3 | 3 | 8 이상 |
| **합계** | | **24** | **31** | **18** | **74 이상** |

---

## 6. AI Adapter 테스트 전략

### 6.1 LLM 목(Mock) 서버 설계

외부 LLM API 호출을 테스트 환경에서 격리하기 위해 목 서버를 운영한다.

```mermaid
flowchart LR
    subgraph TestEnv["테스트 환경"]
        AIA["AI Adapter\n(테스트 대상)"]
        Mock["LLM Mock Server\n(Nock / msw)"]
    end
    subgraph ProdEnv["운영 환경"]
        AIA2["AI Adapter"]
        LLM["실제 LLM API\n(OpenAI, Claude 등)"]
    end

    AIA -->|HTTP| Mock
    AIA2 -->|HTTPS| LLM
```

#### 6.1.1 목 서버 응답 시나리오

| 시나리오 | 목 서버 응답 | 테스트 목적 |
|----------|------------|-----------|
| 정상 place 응답 | 유효한 JSON (action: place) | 정상 동작 확인 |
| 정상 draw 응답 | 유효한 JSON (action: draw) | 드로우 처리 |
| 잘못된 JSON | `{"invalid json...` | JSON 파싱 실패 처리 |
| action 필드 누락 | `{"tableGroups":[]}` | 필수 필드 검증 |
| 존재하지 않는 타일 코드 | `{"action":"place","tilesFromRack":["X99z"]}` | 타일 유효성 검증 |
| 응답 지연 (10초+) | 10초 후 응답 | 타임아웃 처리 |
| HTTP 500 에러 | 서버 에러 응답 | 에러 복구 |
| HTTP 429 Rate Limit | Too Many Requests | 재시도 로직 |
| 빈 응답 | `""` | 빈 응답 처리 |
| 매우 긴 reasoning | 10,000자 reasoning | 응답 크기 제한 |

#### 6.1.2 모델별 응답 포맷 차이 테스트

```typescript
describe('모델별 응답 파싱', () => {
  it('OpenAI JSON mode 응답을 파싱한다', () => {
    // OpenAI는 choices[0].message.content에 JSON
    const raw = { choices: [{ message: { content: '{"action":"place",...}' } }] };
    expect(openaiAdapter.parseResponse(raw)).toBeDefined();
  });

  it('Claude tool_use 응답을 파싱한다', () => {
    // Claude는 content[].type="tool_use"에 input JSON
    const raw = { content: [{ type: 'tool_use', input: { action: 'place' } }] };
    expect(claudeAdapter.parseResponse(raw)).toBeDefined();
  });

  it('Ollama 로컬 응답을 파싱한다', () => {
    // Ollama는 response 필드에 텍스트
    const raw = { response: '{"action":"draw","reasoning":"드로우합니다"}' };
    expect(ollamaAdapter.parseResponse(raw)).toBeDefined();
  });
});
```

### 6.2 재시도/Fallback 로직 테스트

```mermaid
flowchart TB
    Start["테스트 시작"] --> T1["시도 1: 파싱 실패\n(잘못된 JSON)"]
    T1 --> R1["재시도 1\n(에러 메시지 포함)"]
    R1 --> T2["시도 2: 무효 수\n(V-01 위반)"]
    T2 --> R2["재시도 2\n(무효 수 정보 포함)"]
    R2 --> T3["시도 3: 타임아웃"]
    T3 --> FB["3회 실패\n강제 드로우 (draw)"]
```

| 테스트 케이스 | 시도 1 | 시도 2 | 시도 3 | 최종 결과 |
|-------------|--------|--------|--------|----------|
| 1회째 성공 | 유효 응답 | - | - | place 적용 |
| 2회째 성공 | 파싱 실패 | 유효 응답 | - | place 적용, retryCount=1 |
| 3회째 성공 | 타임아웃 | 무효 수 | 유효 응답 | place 적용, retryCount=2 |
| 전부 실패 | 파싱 실패 | 무효 수 | 타임아웃 | 강제 드로우, retryCount=3 |
| 5턴 연속 강제 드로우 | 5턴 모두 실패 | - | - | AI 비활성화 + 관리자 알림 |

### 6.3 응답 파싱 테스트

| 테스트 항목 | 입력 | 기대 결과 |
|------------|------|----------|
| 유효한 place JSON | 정상 JSON | MoveResponse 객체 반환 |
| 유효한 draw JSON | `{"action":"draw"}` | action=draw |
| action 필드 누락 | `{"tableGroups":[]}` | ValidationError |
| 잘못된 action 값 | `{"action":"attack"}` | ValidationError |
| tilesFromRack에 중복 타일 | `["R7a","R7a"]` | ValidationError |
| 존재하지 않는 타일 코드 | `["Z99z"]` | ValidationError |
| 조커 코드 형식 | `["JK1","JK2"]` | 정상 파싱 |
| reasoning 최대 길이 초과 | 10,000자 이상 | 잘림 처리 (truncate) |
| 마크다운 포함 응답 | JSON 외 텍스트 포함 | JSON 추출 후 파싱 |
| 중첩 JSON | JSON 안에 JSON 문자열 | 최외곽 JSON만 파싱 |

### 6.4 Quota/비용 제한 테스트

```typescript
describe('Quota 제한', () => {
  it('일일 호출 한도 초과 시 요청을 거부한다', async () => {
    // Redis quota 카운터를 한도 직전으로 설정
    await redis.hset('quota:daily:2026-03-12', 'totalCalls', '499');

    // 500번째 호출은 성공
    await expect(adapter.generateMove(request)).resolves.toBeDefined();

    // 501번째 호출은 거부
    await expect(adapter.generateMove(request)).rejects.toThrow(QuotaExceededError);
  });

  it('비용 한도 초과 시 외부 API를 비활성화하고 Ollama만 허용한다', async () => {
    await redis.hset('quota:daily:2026-03-12', 'totalCost', '10.01');

    // OpenAI 호출 거부
    await expect(openaiAdapter.generateMove(request)).rejects.toThrow(QuotaExceededError);

    // Ollama는 허용
    await expect(ollamaAdapter.generateMove(request)).resolves.toBeDefined();
  });
});
```

---

## 7. 성능 테스트

### 7.1 성능 목표

| 항목 | 목표 | 측정 도구 |
|------|------|----------|
| WebSocket 동시 접속 | 100 연결 이상 | k6 |
| REST API 응답 시간 (p95) | 200ms 이내 | k6 |
| 게임 엔진 턴 검증 시간 | 50ms 이내 | Go benchmark |
| AI Adapter 응답 시간 (LLM 제외) | 100ms 이내 | jest |
| 메모리 사용량 (game-server) | 100MB 이내 | prometheus |
| Redis 명령 지연 | 1ms 이내 | redis-benchmark |

### 7.2 Go Benchmark 테스트

```go
func BenchmarkValidateGroup(b *testing.B) {
    tiles := parseTiles("R7a", "B7a", "Y7a", "K7b")
    b.ResetTimer()
    for i := 0; i < b.N; i++ {
        IsValidGroup(tiles)
    }
}

func BenchmarkValidateComplexRearrangement(b *testing.B) {
    // 복잡한 재배치 시나리오: 테이블에 10개 세트, 랙에서 3장 추가
    tableState := generateComplexTable(10)
    rackTiles := parseTiles("R4b", "B7b", "Y7b")
    b.ResetTimer()
    for i := 0; i < b.N; i++ {
        ValidateTurnConfirm(tableState, rackTiles)
    }
}

func BenchmarkTilePoolShuffle(b *testing.B) {
    b.ResetTimer()
    for i := 0; i < b.N; i++ {
        pool := NewTilePool()
        pool.Shuffle()
    }
}
```

### 7.3 k6 부하 테스트 시나리오

| 시나리오 | VU (가상 사용자) | 지속 시간 | 목표 |
|----------|-----------------|----------|------|
| API 기본 부하 | 20 VU | 2분 | p95 < 200ms |
| WebSocket 동시 접속 | 50 VU | 3분 | 연결 성공률 99% |
| 피크 부하 | 100 VU | 1분 | 에러율 1% 미만 |
| 지속 부하 | 30 VU | 10분 | 메모리 누수 없음 |

### 7.4 성능 테스트 실행 환경

```mermaid
flowchart LR
    K6["k6\n(부하 생성)"] --> GS["game-server\n(테스트 대상)"]
    GS --> Redis["Redis\n(테스트용)"]
    GS --> PG["PostgreSQL\n(테스트용)"]
    K6 -->|결과| Grafana["Grafana\n(대시보드)"]
    GS -->|메트릭| Prometheus["Prometheus\n(메트릭 수집)"]
    Prometheus --> Grafana
```

---

## 8. 보안 테스트

### 8.1 정적 보안 분석 (SAST)

| 도구 | 대상 | 검사 항목 |
|------|------|----------|
| SonarQube | 전체 코드 | 취약점, 하드코딩 시크릿, SQL 인젝션 패턴 |
| golangci-lint (gosec) | Go 코드 | Go 보안 규칙 (SQL 인젝션, 경로 탐색 등) |
| eslint-plugin-security | NestJS 코드 | Node.js 보안 규칙 |

### 8.2 동적 보안 분석 (DAST)

```mermaid
flowchart LR
    ZAP["OWASP ZAP\n(DAST 스캐너)"] --> Target["배포된 서비스\n(스테이징 환경)"]
    Target --> Report["보안 리포트\n(HTML/JSON)"]
    Report --> Review["수동 리뷰\n(Critical/High 수정)"]
```

| 도구 | 실행 시점 | 검사 항목 | 실패 기준 |
|------|----------|----------|----------|
| OWASP ZAP | 스테이징 배포 후 (Phase 5) | XSS, CSRF, 인젝션, 인증 우회 | Critical/High 발견 시 경고 |
| Trivy | Docker 빌드 후 | CVE 취약점 (이미지) | Critical/High 발견 시 파이프라인 중단 |

### 8.3 인증/인가 테스트

| 테스트 항목 | 검증 내용 |
|------------|----------|
| JWT 만료 | 만료된 JWT로 API 호출 시 401 |
| JWT 위조 | 서명이 잘못된 JWT로 호출 시 401 |
| RBAC: USER | ADMIN 전용 API 호출 시 403 |
| RBAC: ADMIN | 관리자 API 정상 접근 |
| WebSocket 미인증 | auth 이벤트 없이 5초 대기 시 연결 종료 |
| OAuth 콜백 조작 | 잘못된 state 파라미터로 콜백 시 거부 |
| Rate Limiting | 한도 초과 시 429 응답 |

### 8.4 게임 보안 테스트

| 테스트 항목 | 검증 내용 |
|------------|----------|
| 타인의 타일 조회 시도 | 다른 플레이어의 패를 API로 조회 불가 |
| 드로우 파일 조회 시도 | 남은 타일 목록(drawPile) 조회 불가 |
| 턴 순서 조작 | 자기 턴이 아닌데 행동 시도 시 거부 |
| 타일 코드 위조 | 보유하지 않은 타일 배치 시도 시 거부 |
| 게임 상태 직접 수정 시도 | Redis 키에 직접 접근 불가 (네트워크 격리) |

---

## 9. CI/CD 연동

### 9.1 GitLab CI 파이프라인 테스트 단계

```mermaid
flowchart LR
    subgraph GoPipeline["game-server 파이프라인"]
        GL["golangci-lint\n(Lint)"] --> GT["go test -cover\n(Unit + Integration)"]
        GT --> GS["SonarQube Scanner\n(Quality Gate)"]
        GS --> GB["Docker Build"]
        GB --> GTr["Trivy Scan\n(Image CVE)"]
    end
    subgraph NodePipeline["ai-adapter 파이프라인"]
        NL["eslint + prettier\n(Lint)"] --> NT["jest --coverage\n(Unit + Integration)"]
        NT --> NS["SonarQube Scanner\n(Quality Gate)"]
        NS --> NB["Docker Build"]
        NB --> NTr["Trivy Scan\n(Image CVE)"]
    end
    subgraph FEPipeline["frontend 파이프라인"]
        FL["eslint\n(Lint)"] --> FT["jest + RTL\n(Unit)"]
        FT --> FS["SonarQube Scanner\n(Quality Gate)"]
        FS --> FB["Docker Build"]
    end

    GTr --> E2E["E2E 테스트\n(Playwright)"]
    NTr --> E2E
    FB --> E2E
    E2E --> Deploy["배포\n(ArgoCD Sync)"]
```

### 9.2 `.gitlab-ci.yml` 테스트 스테이지

```yaml
# game-server 테스트 (Go)
test:game-server:
  stage: test
  image: golang:1.22-alpine
  services:
    - redis:7-alpine
    - postgres:16-alpine
  variables:
    REDIS_URL: "redis://redis:6379"
    DATABASE_URL: "postgres://test:test@postgres:5432/test_db?sslmode=disable"
  script:
    - cd src/game-server
    - go test -v -race -coverprofile=coverage.out ./...
    - go tool cover -func=coverage.out
  artifacts:
    reports:
      coverage_report:
        coverage_format: cobertura
        path: src/game-server/coverage.xml

# ai-adapter 테스트 (NestJS)
test:ai-adapter:
  stage: test
  image: node:20-alpine
  script:
    - cd src/ai-adapter
    - npm ci
    - npm run test -- --coverage --watchAll=false
    - npm run test:e2e
  artifacts:
    reports:
      coverage_report:
        coverage_format: cobertura
        path: src/ai-adapter/coverage/cobertura-coverage.xml

# SonarQube 분석
sonarqube:
  stage: quality
  image: sonarsource/sonar-scanner-cli
  script:
    - sonar-scanner
      -Dsonar.projectKey=rummiarena
      -Dsonar.sources=src/
      -Dsonar.go.coverage.reportPaths=src/game-server/coverage.out
      -Dsonar.javascript.lcov.reportPaths=src/ai-adapter/coverage/lcov.info
      -Dsonar.qualitygate.wait=true
```

### 9.3 SonarQube Quality Gate 설정

| 조건 | 기준 | 실패 시 |
|------|------|---------|
| 신규 코드 버그 | 0건 | 파이프라인 중단 |
| 신규 코드 취약점 | 0건 | 파이프라인 중단 |
| 신규 코드 코드 스멜 | A등급 | 파이프라인 중단 |
| 신규 코드 커버리지 | 80% 이상 | 파이프라인 중단 |
| 신규 코드 중복 | 3% 이하 | 파이프라인 중단 |

### 9.4 테스트 실행 타이밍

| 트리거 | 실행 테스트 |
|--------|-----------|
| Push (feature 브랜치) | Lint + Unit Test |
| Merge Request | Lint + Unit + Integration + SonarQube |
| Merge to main | Lint + Unit + Integration + SonarQube + Docker Build + Trivy |
| 일일 스케줄 (야간) | E2E + 성능 테스트 (k6) |
| 릴리스 태그 | 전체 테스트 스위트 + OWASP ZAP (Phase 5) |

---

## 10. 테스트 환경

### 10.1 환경 구성

```mermaid
flowchart TB
    subgraph Local["로컬 개발 환경"]
        LU["단위 테스트\n(go test / jest)"]
        LI["통합 테스트\n(Docker Compose 의존성)"]
    end
    subgraph CI["GitLab CI 환경"]
        CU["단위 테스트"]
        CIT["통합 테스트\n(CI services: redis, postgres)"]
        CS["SonarQube 분석"]
        CT["Trivy 스캔"]
    end
    subgraph Staging["스테이징 환경 (K8s)"]
        SE["E2E 테스트\n(Playwright)"]
        SP["성능 테스트\n(k6)"]
        SZ["보안 테스트\n(OWASP ZAP, Phase 5)"]
    end

    Local --> CI
    CI --> Staging
```

### 10.2 환경별 의존성

| 환경 | PostgreSQL | Redis | LLM API | 비고 |
|------|-----------|-------|---------|------|
| 로컬 (Unit) | 목(mock) | 목(mock) | 불필요 | 외부 의존성 없음 |
| 로컬 (Integration) | Docker 컨테이너 | Docker 컨테이너 | 목 서버 | docker compose up |
| CI (Unit) | 목(mock) | 목(mock) | 불필요 | 빠른 피드백 |
| CI (Integration) | CI service | CI service | 목 서버 | GitLab services |
| 스테이징 (E2E) | K8s Pod | K8s Pod | 목 서버 / Ollama | 실제 인프라 |

### 10.3 Docker Compose (로컬 통합 테스트용)

```yaml
# docker-compose.test.yml
services:
  test-postgres:
    image: postgres:16-alpine
    environment:
      POSTGRES_DB: rummikub_test
      POSTGRES_USER: test
      POSTGRES_PASSWORD: test
    ports:
      - "5433:5432"
    tmpfs:
      - /var/lib/postgresql/data  # 메모리 디스크 (빠른 테스트)

  test-redis:
    image: redis:7-alpine
    ports:
      - "6380:6379"
    command: redis-server --save ""  # 영속성 비활성화

  llm-mock:
    image: node:20-alpine
    volumes:
      - ./test/mock-server:/app
    working_dir: /app
    command: node server.js
    ports:
      - "8090:8090"
```

---

## 11. 테스트 데이터 관리

### 11.1 Fixture (고정 데이터)

게임 규칙 검증에 필요한 고정 타일 조합을 fixture로 관리한다.

```
src/game-server/testdata/
├── fixtures/
│   ├── valid_groups.json         # 유효한 그룹 조합 모음
│   ├── invalid_groups.json       # 무효한 그룹 조합 모음
│   ├── valid_runs.json           # 유효한 런 조합 모음
│   ├── invalid_runs.json         # 무효한 런 조합 모음
│   ├── initial_meld_cases.json   # 최초 등록 테스트 케이스
│   ├── joker_cases.json          # 조커 관련 테스트 케이스
│   ├── rearrangement_cases.json  # 재배치 테스트 케이스
│   └── stalemate_cases.json      # 교착 상태 테스트 케이스
├── seeds/
│   ├── users.sql                 # 테스트 사용자 데이터
│   └── games.sql                 # 테스트 게임 기록 데이터
└── scenarios/
    ├── normal_game.json          # 정상 게임 전체 흐름
    └── stalemate_game.json       # 교착 상태 게임 흐름
```

#### 11.1.1 Fixture 예시

```json
// valid_groups.json
{
  "cases": [
    {
      "name": "3장 그룹 (R-B-K)",
      "tiles": ["R7a", "B7a", "K7b"],
      "expected": true
    },
    {
      "name": "4장 그룹 (전색)",
      "tiles": ["R5a", "B5a", "Y5a", "K5b"],
      "expected": true
    },
    {
      "name": "조커 포함 그룹",
      "tiles": ["R3a", "JK1", "Y3a"],
      "expected": true,
      "note": "JK1이 B3 또는 K3 대체"
    }
  ]
}
```

### 11.2 Factory (동적 데이터 생성)

테스트별로 필요한 게임 상태를 동적으로 생성하는 팩토리 함수.

```go
// Go Factory
func NewTestGameState(opts ...GameStateOption) *GameState {
    gs := &GameState{
        Status:       "PLAYING",
        CurrentTurn:  1,
        CurrentSeat:  0,
        PlayerCount:  2,
        DrawPileCount: 78,
        Players: []Player{
            {Seat: 0, Type: "HUMAN", Tiles: generateRandomTiles(14)},
            {Seat: 1, Type: "AI_OPENAI", Tiles: generateRandomTiles(14)},
        },
        TableGroups: []TileGroup{},
    }
    for _, opt := range opts {
        opt(gs)
    }
    return gs
}

// Option 패턴
func WithPlayerCount(n int) GameStateOption {
    return func(gs *GameState) { gs.PlayerCount = n }
}

func WithInitialMeld(seat int) GameStateOption {
    return func(gs *GameState) { gs.Players[seat].HasInitialMeld = true }
}

func WithTableGroups(groups []TileGroup) GameStateOption {
    return func(gs *GameState) { gs.TableGroups = groups }
}

func WithEmptyDrawPile() GameStateOption {
    return func(gs *GameState) { gs.DrawPileCount = 0 }
}
```

```typescript
// NestJS Factory
function createMoveRequest(overrides?: Partial<MoveRequest>): MoveRequest {
  return {
    gameId: 'test-game-1',
    playerType: 'AI_OPENAI',
    modelName: 'gpt-4o',
    persona: 'shark',
    difficulty: 'expert',
    psychologyLevel: 3,
    gameState: createGameState(),
    ...overrides,
  };
}

function createGameState(overrides?: Partial<GameState>): GameState {
  return {
    tableGroups: [],
    myTiles: ['R1a', 'B5b', 'Y7a', 'K2b'],
    otherPlayers: [{ seat: 1, tileCount: 8 }],
    drawPileCount: 30,
    turnNumber: 1,
    hasInitialMeld: false,
    ...overrides,
  };
}
```

### 11.3 Seed (초기 데이터)

```sql
-- seeds/users.sql
INSERT INTO users (id, email, display_name, role, elo_rating)
VALUES
  ('11111111-1111-1111-1111-111111111111', 'test@test.com', '테스트유저', 'ROLE_USER', 1200),
  ('22222222-2222-2222-2222-222222222222', 'admin@test.com', '관리자', 'ROLE_ADMIN', 1500);

-- seeds/games.sql
INSERT INTO games (id, room_code, status, game_mode, player_count)
VALUES
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'TEST', 'FINISHED', 'NORMAL', 2);
```

### 11.4 테스트 데이터 격리 전략

| 전략 | 적용 대상 | 설명 |
|------|----------|------|
| 트랜잭션 롤백 | PostgreSQL 통합 테스트 | 각 테스트를 트랜잭션으로 감싸고 롤백 |
| FlushDB | Redis 통합 테스트 | 각 테스트 전후 Redis 데이터 삭제 |
| 독립 DB | CI 환경 | CI service로 격리된 DB 인스턴스 사용 |
| 테스트별 게임 ID | 게임 엔진 테스트 | UUID 기반 고유 게임 ID로 충돌 방지 |

---

## 12. 테스트 커버리지 모니터링

### 12.1 커버리지 리포트 구조

```mermaid
flowchart LR
    GoTest["go test -coverprofile"] --> GoCov["coverage.out\n(Go 커버리지)"]
    Jest["jest --coverage"] --> JestCov["lcov.info\n(JS 커버리지)"]
    GoCov --> Sonar["SonarQube"]
    JestCov --> Sonar
    Sonar --> Dashboard["Quality Dashboard\n(커버리지 추적)"]
```

### 12.2 모듈별 커버리지 목표

| 모듈 | 목표 커버리지 | 우선순위 |
|------|-------------|---------|
| game-server/engine | 90% 이상 | 최우선 |
| game-server/service | 80% 이상 | 높음 |
| game-server/handler | 70% 이상 | 보통 |
| ai-adapter/parser | 90% 이상 | 최우선 |
| ai-adapter/adapter | 80% 이상 | 높음 |
| ai-adapter/prompt | 80% 이상 | 높음 |
| frontend/components | 70% 이상 | 보통 |
| **전체 평균** | **80% 이상** | - |

### 12.3 커버리지 실행 명령

```bash
# Go 커버리지
cd src/game-server
go test -v -race -coverprofile=coverage.out ./...
go tool cover -html=coverage.out -o coverage.html   # HTML 리포트
go tool cover -func=coverage.out                     # 함수별 커버리지

# NestJS 커버리지
cd src/ai-adapter
npm run test -- --coverage --watchAll=false

# Frontend 커버리지
cd src/frontend
npm run test -- --coverage --watchAll=false
```

---

## 13. 부록

### 13.1 타일 코드 치트시트

테스트 작성 시 타일 코드 참조용.

| 색상 코드 | 색상 | 숫자 범위 | 세트 | 조합 예시 |
|-----------|------|----------|------|----------|
| R | 빨강 (Red) | 1~13 | a, b | R1a, R1b, ..., R13a, R13b |
| B | 파랑 (Blue) | 1~13 | a, b | B1a, B1b, ..., B13a, B13b |
| Y | 노랑 (Yellow) | 1~13 | a, b | Y1a, Y1b, ..., Y13a, Y13b |
| K | 검정 (Black) | 1~13 | a, b | K1a, K1b, ..., K13a, K13b |
| JK | 조커 | - | 1, 2 | JK1, JK2 |

전체 타일 수: 4색 x 13숫자 x 2세트 + 조커 2장 = **106장**

### 13.2 에러 코드 참조표

테스트에서 검증할 주요 에러 코드.

| 에러 코드 | HTTP | 발생 조건 |
|----------|------|----------|
| UNAUTHORIZED | 401 | JWT 만료/무효 |
| FORBIDDEN | 403 | 권한 부족 (ROLE_USER가 ADMIN API 접근) |
| NOT_FOUND | 404 | 존재하지 않는 Room/Game |
| ROOM_FULL | 409 | Room 인원 초과 |
| GAME_ALREADY_STARTED | 409 | 이미 시작된 게임에 참가/시작 시도 |
| INVALID_MOVE | 422 | 유효하지 않은 수 (V-01~V-15 위반) |
| NOT_YOUR_TURN | 422 | 자신의 턴이 아닌데 행동 |
| RATE_LIMITED | 429 | 요청 빈도 초과 |
| INTERNAL_ERROR | 500 | 서버 내부 오류 |

### 13.3 참조 문서

| 문서 | 경로 | 관계 |
|------|------|------|
| 게임 규칙 설계 | `docs/02-design/06-game-rules.md` | V-01~V-15 규칙 원본 |
| 시스템 아키텍처 | `docs/02-design/01-architecture.md` | 서비스 구성, 통신 구조 |
| API 설계 | `docs/02-design/03-api-design.md` | REST/WebSocket API 명세 |
| AI Adapter 설계 | `docs/02-design/04-ai-adapter-design.md` | 재시도/fallback 로직 |
| 게임 세션 관리 | `docs/02-design/05-game-session-design.md` | 세션 생명주기 |
| DB 설계 | `docs/02-design/02-database-design.md` | 테이블/Redis 구조 |
