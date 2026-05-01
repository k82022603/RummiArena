# 13. WebSocket AI Turn E2E Test Report

**작성일**: 2026-03-23
**작성자**: QA Engineer
**테스트 대상**: game-server AI Turn Orchestrator (WS Level)
**서버**: http://localhost:30080 (K8s NodePort)

---

## 1. 테스트 목표

REST 레벨 테스트(방 생성, 게임 시작 5/5 PASS)는 이미 확인됨.
이번 테스트는 **실제 WebSocket 연결을 통해 AI 플레이어가 턴을 자동 처리**하는지 E2E 검증한다.

## 2. 테스트 이력

| 회차 | 일시 | 목적 | 결과 |
|------|------|------|------|
| 1차 | 2026-03-23 AM | AI Turn Orchestrator E2E 초회 검증 | 4/4 PASS (ISS-001 발견) |
| 2차 | 2026-03-23 AM | **ISS-001 수정 후 재테스트** | **ISS-001 FIXED** |

---

## 3. ISS-001 수정 내용

### 원인 분석

ai-adapter NestJS ValidationPipe가 다음 값만 허용한다:
- `persona`: `rookie | calculator | shark | fox | wall | wildcard` (소문자)
- `difficulty`: `beginner | intermediate | expert`

수정 전 game-server는 `RoomPlayer.Persona` ("Rookie"), `RoomPlayer.Difficulty` ("easy")를 그대로 전송하여 HTTP 400이 발생했다.

### 수정 코드 (`ws_handler.go` handleAITurn)

```go
// 수정 전 (ISS-001 원인)
Persona:    player.AIPersona,      // "Rookie" → 400
Difficulty: player.AIDifficulty,   // "easy"   → 400

// 수정 후
Persona:    strings.ToLower(player.AIPersona),     // "Rookie" → "rookie"
Difficulty: normalizeDifficulty(player.AIDifficulty), // "easy" → "beginner"
```

`normalizeDifficulty` 매핑:

| 입력 | 출력 |
|------|------|
| beginner, easy, 하수 | beginner |
| intermediate, medium, mid, 중수 | intermediate |
| expert, hard, 고수 | expert |
| (기타/빈값) | beginner (기본값) |

## 4. ISS-001 재테스트 결과

### 4.1 직접 ai-adapter 호출 검증 (결정적 증거)

```bash
# 수정 후 값 (정규화 적용)
curl -X POST http://localhost:30081/move \
  -d '{"persona":"rookie","difficulty":"beginner",...}'
# → HTTP 200, action=draw (Ollama timeout으로 fallback draw)

# 수정 전 값 (정규화 미적용)
curl -X POST http://localhost:30081/move \
  -d '{"persona":"Rookie","difficulty":"easy",...}'
# → HTTP 400, "persona must be one of the following values",
#              "difficulty must be one of the following values"
```

| 테스트 | persona | difficulty | HTTP Status | 결과 |
|--------|---------|-----------|-------------|------|
| 수정 전 값 | "Rookie" | "easy" | **400** | FAIL (ISS-001 재현) |
| 수정 후 값 | "rookie" | "beginner" | **200** | PASS |

### 4.2 E2E WebSocket 테스트

**시나리오**: Human(seat 0) + AI_LLAMA(seat 1, Rookie/easy) 2인 게임

```
방 생성: persona="Rookie", difficulty="easy" (ISS-001 재현 조건)
게임 시작 → WS 연결 → AUTH_OK → GAME_STATE
Human DRAW_TILE → TURN_END → TURN_START(AI, seat 1)
```

### 4.3 ai-adapter 로그 스냅샷 (ISS-001 FIXED 확인)

```
[MoveController] POST /move gameId=492e4119... model=ollama persona=rookie
[MoveService] gameId=492e4119... persona=rookie difficulty=beginner psychologyLevel=0
[OllamaAdapter] maxRetries 3 → 5 (4B 모델 JSON 오류율 대응)
[OllamaAdapter] attempt=1/5 temperature=0.9
[OllamaAdapter] attempt=1 LLM 호출 오류: timeout of 30000ms exceeded
...
[ResponseParser] 최대 재시도(5) 초과. 강제 드로우 반환.
[MoveService] 완료 gameId=492e4119... action=draw retryCount=5 latencyMs=150136
```

핵심 확인사항:
- `persona=rookie` (소문자로 정규화됨)
- `difficulty=beginner` ("easy" -> "beginner" 변환됨)
- **HTTP 400 에러 없음** (이전: "persona must be one of the following values")
- ai-adapter가 요청을 정상 수신하고 Ollama에 LLM 호출 시도

### 4.4 game-server 로그 스냅샷

```
ws: authenticated user=ee403547... seat=0 room=5a866d90...
ws: AI turn start gameId=492e4119... playerId=ai-2fad7d7e... seat=1 model=ollama
ws: turn timer expired gameId=492e4119... seat=1
ws: elo updated userID=ee403547... oldRating=1000 newRating=1039 delta=19
```

핵심 확인사항:
- **"AI move failed" 로그 없음** (이전: `ai_client: unexpected status 400 from POST /move`)
- AI turn이 정상 시작됨 (`ws: AI turn start`)
- 턴 타이머 만료로 게임 종료됨 (Ollama 타임아웃 150s > 턴 타임아웃 60s)

## 5. 검증 포인트 결과 (4개 항목)

| # | 검증 항목 | 결과 | 상세 |
|---|----------|------|------|
| V-1 | ai-adapter POST /move -> HTTP 200 | **PASS** | 이전 400 -> 현재 200 |
| V-2 | game-server "AI move failed" 없음 | **PASS** | 로그에서 미확인 |
| V-3 | forceAIDraw가 아닌 LLM 호출 시도 | **PASS** | 5회 Ollama 호출 시도됨 (타임아웃) |
| V-4 | AI turn latency 측정 | **N/A** | Ollama 미응답으로 150s (인프라 이슈) |

## 6. ISS-001 판정

```
+------------------------------------------+
|       ISS-001: FIXED                     |
|                                          |
|  persona/difficulty 정규화 수정으로       |
|  ai-adapter 400 에러 완전 해소           |
+------------------------------------------+
```

## 7. 단위 테스트 추가 (회귀 방지)

`ws_handler_ai_test.go`에 2개 테스트 추가:

### TestNormalizeDifficulty (16 cases)

| 입력 | 기대 출력 | 결과 |
|------|----------|------|
| beginner | beginner | PASS |
| intermediate | intermediate | PASS |
| expert | expert | PASS |
| **easy** | **beginner** | **PASS** (ISS-001 핵심) |
| medium | intermediate | PASS |
| hard | expert | PASS |
| Easy | beginner | PASS |
| BEGINNER | beginner | PASS |
| 하수 | beginner | PASS |
| 중수 | intermediate | PASS |
| 고수 | expert | PASS |
| unknown | beginner | PASS |
| (빈값) | beginner | PASS |

### TestPersonaLowercase (7 cases)

| 입력 | 기대 출력 | 결과 |
|------|----------|------|
| **Rookie** | **rookie** | **PASS** (ISS-001 핵심) |
| Calculator | calculator | PASS |
| SHARK | shark | PASS |
| Fox | fox | PASS |
| Wall | wall | PASS |
| Wildcard | wildcard | PASS |
| rookie | rookie | PASS |

**총 23/23 PASS**

## 8. 별도 발견 이슈

### ISS-003: Ollama 네트워크 접근 불가 → **FIXED (2026-03-23)**

- **심각도**: Medium → **해소**
- **원인**: Windows Ollama 삭제로 `172.21.32.1:11434` 접근 불가
- **해결**: Ollama를 K8s Pod로 배포 (`helm/charts/ollama`)
  - `ollama/ollama:latest` 이미지, ClusterIP 서비스 `ollama:11434`
  - initContainer로 gemma3:1b 자동 pull, PVC 영속 저장
  - ai-adapter `OLLAMA_BASE_URL: http://ollama:11434` 으로 변경
- **검증**: `POST /move` → `isFallbackDraw: false`, latency 25s, 한국어 reasoning 포함

### ISS-002: ELO user_id UUID 타입 불일치 (기존)

- **심각도**: Low
- **증상**: AI userID `ai-2fad7d7e-...`가 UUID 형식이나 접두사 `ai-` 포함으로 PostgreSQL UUID 타입 불일치
- **영향**: elo_ratings/elo_history INSERT 실패 (게임 진행에는 무관)
- **후속 조치**: AI userID 생성 시 순수 UUID 사용 검토

## 9. 결론

| 항목 | 판정 |
|------|------|
| ISS-001 persona/difficulty 정규화 | **FIXED** |
| ISS-003 Ollama K8s Pod 배포 | **FIXED** |
| WS 연결 + AUTH 인증 | PASS |
| GAME_STATE(PLAYING) 수신 | PASS |
| Human DRAW_TILE 처리 | PASS |
| AI Turn 자동 처리 (handleAITurn goroutine) | PASS |
| ai-adapter POST /move 200 응답 | PASS |
| LLM 실 응답 (isFallbackDraw: false) | **PASS** (25s, 한국어 reasoning) |
| normalizeDifficulty 단위 테스트 | 16/16 PASS |
| PersonaLowercase 단위 테스트 | 7/7 PASS |

**ISS-001 FIXED, ISS-003 FIXED**

잔여 이슈: ISS-002 (AI userID `ai-{uuid}` PostgreSQL UUID 타입 불일치 — 게임 진행 무관)
