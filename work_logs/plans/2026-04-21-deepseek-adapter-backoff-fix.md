# DeepSeek Adapter retry backoff 누락 수정 계획

- **작성일**: 2026-04-21 Day 11 저녁
- **담당**: **node-dev** (NestJS/TypeScript ai-adapter 담당)
- **실행 시점**: pre-deploy-playbook (qa, 진행 중) 완료 후
- **우선순위**: P1 (프로덕션 안정성 — API 레이트리밋·일시 장애 대응)
- **근거**: 애벌레 실측 지적 "retry 있는데 sleep 없는 것 같다"

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

## 3. 수정안 (옵션 A, 최소 변경)

`deepseek.adapter.ts` L108-168 루프 내부에 `base.adapter.backoff()` 호출 추가:

```ts
for (let attempt = 0; attempt < request.maxRetries; attempt++) {
  if (attempt > 0) {
    this.logger.log(
      `[DeepSeek-Reasoner] 재시도 대기 (attempt=${attempt + 1})`,
    );
    await this.backoff(attempt);  // ← 신규 추가
  }
  const attemptStartTime = Date.now();
  // ... (기존 로직 그대로)
}
```

### 변경 범위

- `src/ai-adapter/src/adapter/deepseek.adapter.ts` 3~5줄 추가
- 나머지 로직 무변경

### 옵션 B (근본 리팩터) 는 Sprint 7 이관

`deepseek.adapter` 의 자체 retry 루프를 `base.adapter.execute()` 로 통합하는 리팩터는 복잡도 크고 (reasoner 특수 처리, prompt variant 선택 분기) 이번 수정 범위 밖. Sprint 7 에 별도 ADR 로.

## 4. 검증

### 4.1 단위 테스트 신규 (의무)

`src/ai-adapter/src/adapter/deepseek.adapter.spec.ts` 에 추가:

1. **backoff 호출 확인**: `attempt=0` 은 즉시, `attempt>=1` 은 `backoff(attempt)` 호출
2. **대기 시간 단언**: jest fake timer 또는 sinon 으로 1000ms, 2000ms, 4000ms 확인
3. **기존 테스트 호환**: 428개 PASS 유지

### 4.2 기존 suite

- `npm run test` — ai-adapter 전체 (428/428 현재)
- 신규 테스트 3개 추가 → 431/431 예상
- `npm run build` — exit 0

### 4.3 통합 테스트 (선택)

- 실제 DeepSeek API 호출로 429 Rate Limit 재현 → backoff 적용 후 재시도 성공 확인
- 비용 발생 우려 있어 manual smoke 로만

## 5. 역할 분담

| 단계 | 담당 | 시간 |
|------|------|------|
| 코드 수정 (3~5줄) | node-dev | 15분 |
| 단위 테스트 신규 작성 | node-dev | 30분 |
| 빌드/테스트 검증 | node-dev | 5분 |
| 커밋 + push | node-dev | 5분 |
| **합계** | **55분** |  |

## 6. 커밋 전략

```
fix(ai-adapter): deepseek retry 루프에 exponential backoff 추가

P1 버그 수정. DeepSeek 자체 retry 루프(base.execute override)에서
backoff() 호출이 누락되어 API 오류 시 즉시 재시도 → 레이트리밋 유발.
base.adapter 의 기존 backoff() (1→2→4→8s, max 10s) 호출 추가.

- deepseek.adapter.ts L108 루프에 if(attempt>0) backoff 3줄 추가
- 단위 테스트 3개 신규 (backoff 호출·시간 단언)
- openai/claude/ollama 는 base 상속이라 영향 없음

담당: node-dev
근거: 2026-04-21 Day 11 애벌레 실측 지적
상세: work_logs/plans/2026-04-21-deepseek-adapter-backoff-fix.md
```

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
