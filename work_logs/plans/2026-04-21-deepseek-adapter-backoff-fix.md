# DeepSeek Adapter retry backoff 누락 + 전체 어댑터 backoff 강화 수정 계획

- **작성일**: 2026-04-21 Day 11 저녁 (v1.1 — A안 반영)
- **담당**: **node-dev** (NestJS/TypeScript ai-adapter) + **go-dev** (game-server MaxRetries 상수)
- **실행 시점**: pre-deploy-playbook (qa, 진행 중) 완료 + 애벌레 네트워크 교체 이후
- **우선순위**: P1 (프로덕션 안정성 — API 레이트리밋·wifi 전환 대응)
- **근거**:
  - 애벌레 실측 지적 v1: "retry 있는데 sleep 없는 것 같다"
  - 애벌레 실측 지적 v2: "wifi 교체가 생각보다 쉽지 않다 — 30~60초 버틸 수 있게"

## 선택된 안: A (보수)

- MaxRetries 3 → 5 (game-server)
- backoff max 10s → 60s (ai-adapter)
- 결과 대기: attempt 1~4 = 2s + 4s + 8s + 16s = **30s** (wifi 전환 경계선)

## 1. 문제 요약

`deepseek.adapter.ts` 가 **`base.adapter.execute()`** 를 override 해서 **자체 retry 루프**를 돌리는데, 그 과정에서 **`backoff()` 호출이 누락**됨. 즉 API 오류/파싱 실패 시 **즉시 재시도** → API 레이트리밋 유발 가능 + 일시 장애 복구 기회 상실.

## 2. 상세 조사 결과

### 2.1 base.adapter.ts — 정상 구현

```ts
// L94-96: exponential backoff
protected async backoff(attempt: number): Promise<void> {
  const backoffMs = Math.min(1000 * Math.pow(2, attempt), 10000);
  await new Promise((resolve) => setTimeout(resolve, backoffMs));
}

// L119-125: retry 루프에서 호출
for (let attempt = 0; attempt < request.maxRetries; attempt++) {
  if (attempt > 0) {
    this.logger.log(`[${modelInfo.modelType}] 재시도 대기 (attempt=${attempt + 1})`);
    await this.backoff(attempt);
  }
  // ... LLM 호출
}
```

- 첫 시도는 즉시, 재시도부터 **1s → 2s → 4s → 8s → 10s 상한** exponential
- openai / claude / ollama 3개 어댑터는 **`base.execute()` 상속** → 정상 작동

### 2.2 deepseek.adapter.ts — 버그

```ts
// L108-168: 자체 retry 루프 (override)
for (let attempt = 0; attempt < request.maxRetries; attempt++) {
  const attemptStartTime = Date.now();
  const userPrompt = variant ? ... : ...;
  this.logger.log(`[DeepSeek-Reasoner] ... attempt=${attempt + 1}/...`);

  try {
    // LLM 호출
  } catch (err) {
    lastErrorReason = (err as Error).message;
    this.logger.error(`... attempt=${attempt + 1} LLM 호출 오류: ...`);
  }
  // ← 여기에 await this.backoff(attempt) 필요 — 누락됨
}
```

grep 결과: `deepseek.adapter.ts` 에 `backoff` 매치 **0건**.

### 2.3 영향 범위

- **레이트리밋 리스크**: DeepSeek API 가 초당 요청 수 제한을 엄격하게 관리. 즉시 재시도 3회면 1초 내 3회 요청 → 429 Too Many Requests 유발
- **일시 네트워크 장애 복구 실패**: 1초 이내 3회 실패면 같은 네트워크 이벤트에 세 번 모두 걸려 실패 확정
- **Round 4/5 실측 영향**: 오늘 세션에 이 버그가 DeepSeek 대전 결과에 영향 줬을 가능성은 낮음 (대부분 성공). 하지만 프로덕션 안정성 관점 P1

## 3. 수정안 (A안 — 3개 파일 수정)

### 3.1 ai-adapter `base.adapter.ts` — backoff max 10s → 60s

```ts
// L94-96 수정
protected async backoff(attempt: number): Promise<void> {
  const backoffMs = Math.min(1000 * Math.pow(2, attempt), 60000);  // 10000 → 60000
  await new Promise((resolve) => setTimeout(resolve, backoffMs));
}
```

### 3.2 ai-adapter `deepseek.adapter.ts` — backoff 호출 추가

```ts
// L108 루프 진입 직후 추가
for (let attempt = 0; attempt < request.maxRetries; attempt++) {
  if (attempt > 0) {
    this.logger.log(
      `[DeepSeek-Reasoner] 재시도 대기 (attempt=${attempt + 1})`,
    );
    await this.backoff(attempt);  // ← 신규 3줄
  }
  const attemptStartTime = Date.now();
  // ... (기존 로직 그대로)
}
```

### 3.3 game-server `ws_handler.go` — MaxRetries 3 → 5

```go
// L902 수정
MaxRetries: 5,  // 3 → 5. wifi 전환(30s) 대응
```

### 변경 범위 (총 3 파일, 약 10줄)

| 파일 | 변경 | 담당 |
|------|------|------|
| `src/ai-adapter/src/adapter/base.adapter.ts` L95 | `10000` → `60000` | node-dev |
| `src/ai-adapter/src/adapter/deepseek.adapter.ts` L108 직후 | if/await 3줄 추가 | node-dev |
| `src/game-server/internal/handler/ws_handler.go` L902 | `3` → `5` | go-dev |

### 계수는 현재 유지 (`2^attempt`)

- `2^attempt` 계수로 충분 (attempt 1~4 = 2s, 4s, 8s, 16s). 60s cap 은 attempt ≥6 에서만 걸림 (maxRetries 5 이므로 실질 도달 안 함)
- 공격적 계수 변경(B안 `2^(attempt+2)`) 은 보류

### 옵션 B/C 는 이번 수정 범위 밖

- **B안 (공격적 계수 증가)**: 116s 버티지만 한 번 타임아웃 길어 사용자 체감 나쁨. 보류
- **C안 (max 단독 변경)**: 실효 없음 (maxRetries=3 에선 max 도달 안 함)
- **근본 리팩터 (deepseek 를 base.execute() 로 통합)**: 복잡도 크고 이번 범위 밖. Sprint 7 ADR

## 4. 검증

### 4.1 ai-adapter 단위 테스트 신규 (의무)

**`base.adapter.spec.ts`** (max 60s 반영):
- attempt 1~6 각각 대기 시간 단언 (2s, 4s, 8s, 16s, 32s, 60s capped)
- Math.min 경계값 (attempt=6 에서 exactly 60000ms)

**`deepseek.adapter.spec.ts`**:
- backoff 호출 확인 (attempt=0 즉시, attempt>=1 backoff 호출)
- 전체 retry 흐름 (maxRetries=5 시 4회 backoff)
- jest fake timer 또는 sinon 사용

### 4.2 기존 suite

- `npm run test` — ai-adapter 전체 (428/428 현재)
- 신규 테스트 ~6개 추가 → 434/434 예상
- `npm run build` — exit 0

### 4.3 game-server 단위 테스트

- `go test ./internal/handler/...` — MaxRetries=5 반영 후 회귀 없는지
- ai_client_test.go 의 `MaxRetries: 3` 값도 업데이트 검토

### 4.4 통합 테스트 (선택, Sprint 7)

- 실제 wifi 전환 시나리오 재현 → 30s 안에 재연결되면 retry 성공 확인
- 비용 발생 우려로 manual smoke

## 5. 역할 분담

| 단계 | 담당 | 시간 |
|------|------|------|
| `base.adapter.ts` max 10s→60s (L95, 한 숫자) | node-dev | 5분 |
| `deepseek.adapter.ts` backoff 호출 추가 (3줄) | node-dev | 10분 |
| `ws_handler.go` MaxRetries 3→5 (L902) + ai_client_test.go 동기화 | go-dev | 10분 |
| ai-adapter 단위 테스트 신규 | node-dev | 40분 |
| game-server 회귀 테스트 실행 | go-dev | 10분 |
| 커밋 + push | 각자 | 10분 |
| **합계** | **85분** (병렬 약 50분) |  |

node-dev 와 go-dev 가 병렬로 각 서비스 수정 가능.

## 6. 커밋 전략 (2개 커밋, 서비스별 분리)

### 커밋 1 (node-dev): ai-adapter
```
fix(ai-adapter): retry backoff 강화 — max 10s→60s + deepseek 누락 수정

P1 버그 2건 + wifi 전환(30s) 대응:

1. deepseek.adapter retry 루프에 backoff 호출 누락 — exponential
   적용 (이전 대기 0s → 2s, 4s, 8s, 16s)
2. base.adapter backoff max 10s → 60s — wifi 전환 시 attempt 5~6
   에서 최대 60s 버팀

- base.adapter.ts L95: 10000 → 60000
- deepseek.adapter.ts L108 루프에 if(attempt>0) backoff 3줄 추가
- openai/claude/ollama 는 base 상속이라 자동 반영

테스트: 신규 ~5개 (base backoff 시간, deepseek retry 흐름)
```

### 커밋 2 (go-dev): game-server
```
feat(game-server): AI 호출 MaxRetries 3 → 5 (wifi 전환 30s 대응)

ai-adapter backoff 강화(base.adapter max 60s)와 동반 수정.
maxRetries 3 으로는 backoff 상한에 도달 못해 실효 없음.
5 회로 늘려 attempt 1~4 에서 2+4+8+16=30s 버팀.

- ws_handler.go L902: 3 → 5
- DTO 상한 @Max(5) 가 이미 ai-adapter 에 있어 범위 내
- ai_client_test.go MaxRetries 기댓값 동기화

ai-adapter 커밋과 순서 무관하게 적용 가능.
```

### Co-Authored-By

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>

## 7. 롤백

```bash
git revert <commit>
```
단순 3줄 추가라 롤백 영향 최소.

## 8. 실행 타이밍

- **지금 금지**: pre-deploy-playbook (qa 에이전트) 진행 중. 수정 시 충돌 위험
- **진행 시점**: playbook 완료 알림 수신 직후 node-dev 스폰
- **timebox**: 1시간 초과 시 수정만 완료하고 테스트는 Sprint 7 첫날 보강

## 9. 관련 문서

- `docs/02-design/41-timeout-chain-breakdown.md` — 전체 타임아웃 체인
- `src/ai-adapter/src/adapter/base.adapter.ts` L94-96 — backoff 구현
- `src/ai-adapter/src/adapter/deepseek.adapter.ts` L108-168 — 수정 대상 루프
