# ADR: AI Move API 인터페이스 확정

| 항목 | 내용 |
|------|------|
| **날짜** | 2026-03-21 |
| **상태** | 확정 |
| **결정자** | 아키텍트(진행), Go 개발자, Node 개발자 |
| **관련 문서** | `docs/02-design/11-ai-move-api-contract.md` |

---

## 맥락

Sprint 2 개발 시작을 앞두고, game-server(Go)와 ai-adapter(NestJS) 사이의 HTTP API 인터페이스를 확정해야 한다.
Sprint 1에서 ai-adapter 쪽 DTO(MoveRequestDto, MoveResponseDto)와 컨트롤러(MoveController)는 구현되었으나,
game-server 쪽 AI 호출 클라이언트는 아직 미구현 상태이다.

양쪽 서비스가 독립적으로 개발을 진행하려면 요청/응답 형식, 에러 처리 전략, 타임아웃 정책, 인증 방식이 사전에 합의되어야 한다.

핵심 제약사항:
- 16GB RAM 환경에서 Ollama gemma3:4b 모델의 응답 시간이 최대 30초에 달한다
- LLM 응답은 절대 신뢰하지 않는다(CLAUDE.md 핵심 원칙)
- Istio mTLS는 Phase 5에서 도입 예정이므로 Phase 1~4에서는 간단한 인증이 필요하다
- game-server는 AI 호출 실패로 게임을 중단시키면 안 된다

---

## 결정 내용

### 1. 엔드포인트 3개만 사용 (Sprint 2)

- `POST /move` -- AI 수 생성 (핵심)
- `GET /health` -- liveness probe
- `GET /health/adapters` -- readiness probe + 모델 가용 확인

추가 엔드포인트(`GET /models`, `POST /ai/analyze`)는 Sprint 3+에서 필요 시 도입한다.

### 2. 엔드포인트 경로: `/move` (기존 ai-adapter 구현 유지)

기존 설계 문서(03-api-design.md 3.1절)에서는 `/ai/generate-move`로 정의되었으나,
실제 ai-adapter 구현은 `@Controller('move')`로 `/move` 경로를 사용한다.
**실 구현 기준으로 `/move`를 확정한다.** 설계 문서의 경로명은 구현에 맞추어 갱신한다.

### 3. LLM 실패 시 HTTP 200 + 강제 드로우 반환

ai-adapter 내부에서 maxRetries를 모두 소진해도 HTTP 200으로 응답하고,
`isFallbackDraw: true`인 draw 응답을 반환한다.
HTTP 에러(4xx/5xx)는 요청 자체의 오류나 서비스 장애에만 사용한다.

이로써 game-server는 ai-adapter가 항상 유효한 MoveResponse를 반환한다고 가정할 수 있다.

### 4. 이중 검증 체계

- **ai-adapter**: 타일 코드 형식 검증 (정규식), 응답 JSON 구조 검증
- **game-server**: Game Engine으로 게임 규칙 유효성 검증 (ValidateTurnConfirm)

ai-adapter가 타일 코드를 통과시켜도 game-server에서 무효 판정하면 강제 드로우로 처리한다.

### 5. 내부 서비스 인증: X-Internal-Token

환경변수 `AI_ADAPTER_INTERNAL_TOKEN`으로 공유 비밀키를 양쪽 서비스에 주입한다.
`POST /move`에만 적용하고, Health 엔드포인트는 인증 제외한다.
Phase 5에서 Istio mTLS 도입 시 이 방식은 optional로 전환한다.

### 6. 타임아웃 계층 구조

- LLM 개별 호출: `timeoutMs` (기본 30초, 요청 시 지정 가능)
- ai-adapter 내부 재시도: `maxRetries` (기본 3회, Ollama는 내부 최소 5회 override)
- game-server HTTP client: `maxRetries * timeoutMs + 5초` (기본 95초, Ollama 고려 시 최대 180초)

### 7. 난이도별 정보 필터링은 game-server 책임

game-server가 GameStateRedis를 AIMoveRequest로 변환할 때 난이도에 따라 정보를 필터링한다.
beginner에서는 opponents를 빈 배열로, unseenTiles를 생략한다.
ai-adapter는 전달받은 정보를 그대로 프롬프트에 반영하며, 추가 필터링을 하지 않는다.

### 8. model 필드 매핑 규칙

game-server의 PlayerType(`AI_OPENAI`, `AI_CLAUDE`, `AI_DEEPSEEK`, `AI_LLAMA`)을
ai-adapter의 model 필드(`openai`, `claude`, `deepseek`, `ollama`)로 변환한다.
`AI_LLAMA` -> `ollama` 매핑에 주의한다 (PlayerType은 모델 이름, model 필드는 어댑터 이름).

---

## 대안 검토

### 기각: gRPC 사용

gRPC는 타입 안전성과 성능이 좋지만, 양쪽 모두 HTTP/JSON으로 이미 구현되어 있고,
LLM 호출 지연(수초~수십초)이 프로토콜 오버헤드(수ms)를 압도하므로 전환 이점이 없다.
또한 디버깅 시 JSON 요청/응답을 curl로 직접 테스트할 수 있는 이점이 크다.

### 기각: 메시지 큐(Redis Pub/Sub) 기반 비동기 통신

game-server가 Redis에 요청을 발행하고 ai-adapter가 구독하는 방식도 검토했다.
비동기 특성상 "AI 사고 중" UX에 적합하나, 구현 복잡도가 증가하고
요청-응답 매칭 로직이 필요하다. Sprint 2의 스코프를 넘어서므로 기각.
향후 동시 게임 수가 증가하면 재검토 가능.

### 기각: JWT 기반 내부 인증

내부 서비스 간에 JWT를 발급/검증하는 방식은 오버엔지니어링이다.
키 로테이션, 만료 관리 등 추가 복잡도가 발생하며,
Phase 5의 Istio mTLS가 이 문제를 근본적으로 해결한다.
그 전까지는 공유 비밀키로 충분하다.

### 기각: action에 "pass" 추가

루미큐브 규칙상 턴에서 할 수 있는 행동은 "타일 배치" 또는 "드로우" 두 가지뿐이다.
패스(아무 행동 없이 턴 넘기기)는 규칙에 없으므로 action enum에 추가하지 않는다.
드로우가 사실상 패스 역할을 한다.

### 기각: game-server에서 Game Engine 검증 실패 시 ai-adapter에 재호출

검증 실패를 ai-adapter에 알려서 다시 시도하면 더 좋은 수를 받을 수 있으나,
이미 ai-adapter 내부에서 maxRetries만큼 재시도한 결과이므로 추가 재시도의 성공 가능성이 낮다.
지연 시간만 증가시키므로 즉시 강제 드로우로 처리하는 것이 사용자 경험에 유리하다.

---

## 결과 (이 결정이 미치는 영향)

### game-server (Go) 팀

1. `internal/client/ai_client.go` 신규 생성 -- HTTP 클라이언트 구현
2. `internal/config/config.go`에 `AIAdapterConfig` 추가 -- BaseURL, InternalToken, TimeoutMs
3. `internal/service/game_service.go` 수정 -- AI 플레이어 턴 처리 시 AIClient 호출
4. PlayerType -> model 매핑 유틸 함수 구현
5. GameStateRedis -> AIGameStateDTO 변환 함수 구현 (난이도별 필터링 포함)
6. Helm chart에 `AI_ADAPTER_INTERNAL_TOKEN` 환경변수 추가

### ai-adapter (NestJS) 팀

1. `InternalTokenGuard` 신규 구현 -- `POST /move`에 적용
2. `X-Request-Id` 전파 Interceptor 구현
3. `.env`에 `AI_ADAPTER_INTERNAL_TOKEN` 추가
4. 기존 구현은 변경 없음 -- DTO, Controller, Service, Adapter 모두 현재 코드 유지

### Helm/인프라

1. `helm/ai-adapter/values.yaml`에 `AI_ADAPTER_INTERNAL_TOKEN` secret 추가
2. `helm/game-server/values.yaml`에 AI Adapter 연결 설정 추가 (BASE_URL, INTERNAL_TOKEN)

---

## 부록: 기존 설계 문서와의 차이

| 항목 | 기존 문서 (03-api-design.md 3.1) | 이번 확정 |
|------|----------------------------------|----------|
| 엔드포인트 경로 | `POST /ai/generate-move` | `POST /move` (실제 구현 기준) |
| 요청 필드명: 상대정보 | `otherPlayers[].tileCount` | `opponents[].remainingTiles` |
| 요청 필드명: 모델 | `playerType` + `modelName` 분리 | `model` 단일 필드 (어댑터 선택용) |
| 응답 필드 | `latencyMs`, `tokensUsed` 플랫 | `metadata` 객체로 그룹화 |
| 에러 처리 | 명시 안 됨 | HTTP 200 강제 드로우 + 4xx/5xx 에러 분리 |

> 03-api-design.md 3.1절은 초기 설계안이며, 실제 구현 기준으로 이 문서(11-ai-move-api-contract.md)가 최신 정규 계약서이다.
