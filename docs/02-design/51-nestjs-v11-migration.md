# 51. @nestjs/core v10 → v11 메이저 Bump 영향도 분석

**작성자**: architect
**작성일**: 2026-04-23 (Day 2 저녁, Day 3 사전 분석)
**대상 Sprint**: Sprint 7 Week 1 Day 3 (2026-04-24)
**종속 보고서**: `docs/04-testing/78-sec-a-b-c-audit-delta.md`
**판정**: **PROCEED with gates** (조건부 Go) — 검증 2.5h 이내 수렴 예상

---

## 0. 배경

security 보고서 78(SEC-A/B/C audit delta) 에서 `@nestjs/core` v10 계열 moderate injection 취약점은
**v11 메이저 bump 로만 해소** 된다고 결론. Day 2 Sprint 7 의 SEC-A(Go/go-redis) + SEC-B(Next) +
SEC-C(admin) 마일스톤에 이어 Day 3 에 **ai-adapter Nest 생태계 v11 동반 bump** 를 수행한다.

ai-adapter 는 LLM 어댑터 런타임 핵심 (Claude/OpenAI/DeepSeek/Ollama) 이며 game-server 의 모든 AI 턴
요청 경로에 있다. 메이저 버전 bump 는 Pipe/Guard/Filter 동작과 DI 규칙을 바꿀 수 있으므로
**MED-HIGH risk** 로 분류한다.

---

## 1. Executive Summary

| 항목 | 값 |
|---|---|
| 판정 | **PROCEED with gates** |
| 위험도 | MED-HIGH → 실제 **MED** (rxjs 직사용 0건, websocket 미사용, microservices 미사용으로 재평가) |
| 코드 수정 예상 LOC | 0 ~ 20 (Guard 시그니처 확인 필요) |
| 예상 wall-clock | 2.5h (수정 30m + Jest 15m + 재배포 10m + Playwright 25m + 버퍼 60m) |
| Jest 599/599 유지 확신도 | **85%** (ThrottlerGuard canActivate 시그니처 + TypeScript 5 엄격화 리스크) |
| Playwright 전수 회귀 예상 | **0건** (ai-adapter 는 game-server HTTP 피호출만, API 형상 유지) |
| Rollback | 이미지 tag 롤백 (feature flag 없음) |

### 판정 근거 3줄

1. ai-adapter 는 Nest 기능 중 **Module/Controller/Service/Global Guard/Global Filter/Global Pipe**
   최소 집합만 사용. WebSocket/Microservices/GraphQL/CacheModule/@nestjs/axios 등
   **breaking 영향 큰 기능은 전무**.
2. **rxjs 직접 사용 0건** (`grep "from 'rxjs" src = 0 hits`). rxjs 7→8 peer dep 변경도 영향 없음.
3. 유일한 리스크는 `RateLimitGuard extends ThrottlerGuard` 의 `canActivate` 시그니처 —
   @nestjs/throttler v6 (현재) 가 **v11 Nest 를 peer dep 로 허용** 하므로 병행 bump 불필요.

---

## 2. 현재 ai-adapter Nest 의존성 목록

### 2.1 package.json (src/ai-adapter/package.json)

```json
"dependencies": {
  "@nestjs/common":           "^10.0.0",
  "@nestjs/config":           "^3.0.0",
  "@nestjs/core":             "^10.0.0",
  "@nestjs/platform-express": "^10.0.0",
  "@nestjs/throttler":        "^6.5.0",
  "axios":                    "^1.6.0",
  "class-transformer":        "^0.5.1",
  "class-validator":          "^0.14.0",
  "ioredis":                  "^5.10.1",
  "reflect-metadata":         "^0.1.13",
  "rxjs":                     "^7.8.1"
},
"devDependencies": {
  "@nestjs/cli":        "^10.0.0",
  "@nestjs/schematics": "^10.0.0",
  "@nestjs/testing":    "^10.0.0",
  "@types/express":     "^4.17.17",
  "@types/node":        "^20.3.1",
  "typescript":         "^5.1.3"
}
```

### 2.2 import 전수 (grep 결과 요약)

| Nest 모듈 | import 심볼 | 사용처 파일 수 |
|---|---|---|
| `@nestjs/common` | Module, Global, Controller, Injectable, Inject, Optional, Logger, Get, Query, ValidationPipe, BadRequestException, HttpException, HttpStatus, ExecutionContext, ExceptionFilter, Catch, ArgumentsHost, OnModuleInit, OnModuleDestroy | 34 |
| `@nestjs/core` | NestFactory, APP_GUARD | 2 (main + app.module) |
| `@nestjs/config` | ConfigModule, ConfigService | 8 |
| `@nestjs/platform-express` | (직접 import 없음; NestFactory가 내부 사용) | 0 |
| `@nestjs/throttler` | ThrottlerModule, ThrottlerGuard, ThrottlerException, Throttle | 6 |
| `@nestjs/testing` | Test, TestingModule | 28 (spec files) |

### 2.3 Nest 확장 인터페이스 구현

| 파일 | 인터페이스 | 메서드 시그니처 |
|---|---|---|
| `common/filters/http-exception.filter.ts` | `ExceptionFilter` | `catch(exception, host)` |
| `common/guards/internal-token.guard.ts` | `CanActivate` | `canActivate(context)` |
| `common/guards/rate-limit.guard.ts` | `extends ThrottlerGuard` | `async canActivate(context): Promise<boolean>` |
| `cost/cost-limit.guard.ts` | `CanActivate` | `canActivate(context)` |
| `prompt/registry/prompt-registry.service.ts` | `OnModuleInit` | `onModuleInit()` |
| `redis/redis.module.ts` | `OnModuleDestroy` (provider) | `onModuleDestroy()` |

### 2.4 사용하지 **않는** Nest 기능 (리스크 배제)

- `@nestjs/axios` — 0 import. 어댑터는 axios 직접 사용
- `@nestjs/websockets` — 0 import. game-server 가 WS 소유
- `@nestjs/microservices` — 0 import
- `@nestjs/graphql` — 0 import
- `@nestjs/cache-manager` — 0 import (Redis 직접 사용)
- `@nestjs/schedule` — 0 import
- `@nestjs/event-emitter` — 0 import
- `rxjs` 직접 import — **0 hits** (`grep "from 'rxjs" src`)

---

## 3. Nest v11 Breaking Change 매핑 (ai-adapter 사용 기능 중심)

Nest v11 공식 마이그레이션 가이드 (https://docs.nestjs.com/migration-guide) 를 기준으로
**우리가 실제 사용하는 기능에 한해** 영향을 매핑한다.

### 3.1 영향 **있음** (검증 필수)

#### (a) `@nestjs/throttler` ↔ `@nestjs/common` v11 peer dep

- **변경점**: ThrottlerGuard v6 의 `canActivate` 내부가 `ExecutionContext` 외에 `@Throttle()`
  metadata 를 reflector 로 읽는 로직. v11 에서 reflector API 는 안정(유지).
- **우리 코드**: `rate-limit.guard.ts:28` `async canActivate(context: ExecutionContext): Promise<boolean>`
  — `super.canActivate(context)` 호출. 시그니처 호환.
- **리스크**: `@nestjs/throttler@^6.5.0` 가 v11 peer dep 허용해야 함. 공식 매트릭스 확인 필요 —
  **v6 는 Nest v10/v11 both 허용** (throttler v6 changelog 확인).
- **액션**: throttler v6 유지. 만약 peer 충돌 시 **v6 최신 patch** 또는 v7 병행 bump.
- **검증**: `rate-limit.guard.spec.ts`, `rate-limit-config.spec.ts` 통과 확인.

#### (b) `ValidationPipe` 동작 (main.ts:13-22)

- **변경점**: v11 에서 `class-validator` / `class-transformer` peer 정합성 유지. v10 과 동작 동일.
- **우리 코드**: `whitelist: true, forbidNonWhitelisted: true, transform: true,
  transformOptions: { enableImplicitConversion: true }` — 모두 v11 유지 옵션.
- **리스크**: `class-validator@^0.14.0` (현재) — v11 Nest 가 최소 `0.14.x` 를 peer 로 요구.
  우리는 이미 `0.14.0`. **영향 없음**.
- **검증**: `move.controller.spec.ts` 의 DTO 검증 경로 통과.

#### (c) `ExceptionFilter` 글로벌 필터 (http-exception.filter.ts)

- **변경점**: `@Catch()` 빈 괄호 전역 catch 는 v11 에서도 유효. `ArgumentsHost.switchToHttp()` API
  변경 없음.
- **리스크**: 없음.

#### (d) `Logger` 인스턴스 생성

- **변경점**: v11 에서 `Logger` 는 기본 `context` 파라미터를 우선. `new Logger(ClassName.name)`
  패턴 우리 전부 사용 — v11 에서도 권장 패턴.
- **리스크**: 없음.

#### (e) `@nestjs/testing` Test API

- **변경점**: v11 에서 `Test.createTestingModule()` 시그니처는 v10 과 동일. `overrideProvider`,
  `compile()` 모두 유지.
- **우리 코드**: 28 개 spec 파일에서 사용.
- **리스크**: 없음. 단 ts-jest 가 TypeScript 5.x 유지하면 무풍.

#### (f) `OnModuleInit` / `OnModuleDestroy` 라이프사이클

- **변경점**: v11 에서 동일. provider 단위 destroy 훅 호출 순서 유지.
- **리스크**: 없음.

### 3.2 영향 **없음** (비사용 기능)

- rxjs 8 요구 → 우리는 rxjs 직접 사용 0. peer 경고만 발생 가능 (peer 충족 여부).
- Fastify adapter 변경 → 우리는 express adapter 사용. `@nestjs/platform-express` v11 동반 bump.
- CacheModule 분리 (`@nestjs/cache-manager` 별도 패키지화) → 우리 미사용.
- Microservices / GraphQL / WebSocket gateway 변경 → 우리 미사용.
- `@nestjs/event-emitter` 메이저 변경 → 우리 미사용.

### 3.3 TypeScript 버전 요구

- Nest v11 은 **TypeScript 5.2+** 권장 (5.1 에서 4가지 strict 경고).
- 우리 현재: `typescript: ^5.1.3` → **5.3+ 병행 bump 권장** (작업 범위 1줄).
- tsconfig 기존 strict 옵션 유지: `strict: true`, `strictNullChecks: true`.

### 3.4 Node 버전 요구

- Nest v11: **Node 20+** (공식 LTS), Node 18 drop.
- 우리 K8s 이미지 base: `node:20-alpine` (Dockerfile 확인 전제) — 호환.

---

## 4. 변경 범위 산출

### 4.1 package.json diff 예상 (ai-adapter only)

```diff
-"@nestjs/common":           "^10.0.0",
+"@nestjs/common":           "^11.1.0",
-"@nestjs/config":           "^3.0.0",
+"@nestjs/config":           "^4.0.0",
-"@nestjs/core":             "^10.0.0",
+"@nestjs/core":             "^11.1.0",
-"@nestjs/platform-express": "^10.0.0",
+"@nestjs/platform-express": "^11.1.0",
-"@nestjs/throttler":        "^6.5.0",
+"@nestjs/throttler":        "^6.5.0",   // 유지 (v11 peer 허용 확인 후)

 // devDependencies
-"@nestjs/cli":        "^10.0.0",
+"@nestjs/cli":        "^11.0.0",
-"@nestjs/schematics": "^10.0.0",
+"@nestjs/schematics": "^11.0.0",
-"@nestjs/testing":    "^10.0.0",
+"@nestjs/testing":    "^11.1.0",
-"typescript":         "^5.1.3"
+"typescript":         "^5.3.3"
```

- **총 8 패키지 bump** (dep 5 + devDep 4 - throttler 유지 + ts bump 1 = 9, 실질 bump 7~8).
- `@nestjs/config` 는 v10→v11 Nest core 와 함께 v3→v4 동반 bump 필요 (peer dep).

### 4.2 package-lock.json 예상 diff

- Nest 패키지 트리 전체 재생성 → **수천 라인** (~3000~5000 lines).
- `npm install --package-lock-only` 로 lock 만 재생성 후 review.
- 의존성 그래프 내 `class-validator`, `class-transformer`, `reflect-metadata` 는 v10 수준 유지.

### 4.3 소스 코드 수정 예상 LOC

| 파일 | 예상 LOC | 이유 |
|---|---|---|
| `src/main.ts` | **0** | ValidationPipe/CORS/Filter 모두 v11 호환 |
| `src/app.module.ts` | **0** | Module decorator, APP_GUARD 유지 |
| `src/common/guards/rate-limit.guard.ts` | **0~5** | throttler v6 + Nest v11 조합이 OK 면 0. 시그니처 strict 경고 시 5 |
| `src/common/filters/http-exception.filter.ts` | **0** | ExceptionFilter 인터페이스 유지 |
| `src/common/guards/internal-token.guard.ts` | **0** | CanActivate 시그니처 유지 |
| `src/cost/cost-limit.guard.ts` | **0** | CanActivate 시그니처 유지 |
| spec 파일 28개 | **0** | TestingModule API 유지 |
| **합계** | **0 ~ 20 LOC** | |

---

## 5. 검증 전략

### 5.1 로컬 Jest 전수 (필수 게이트)

```bash
cd src/ai-adapter
npm install          # lockfile 재생성
npm test             # 현재 599/599 PASS → 599/599 유지 목표
```

- 실패 시 즉시 stacktrace 분석. 대부분은 class-validator peer 또는 throttler canActivate 시그니처.
- 수정 범위 초과 (20 LOC 이상) 시 **HOLD** 판정 후 재분석.

### 5.2 로컬 build smoke

```bash
cd src/ai-adapter
npm run build        # tsc --project tsconfig.build.json
node dist/main.js &  # 포트 8081 기동 확인
curl http://localhost:8081/health        # 200 OK
curl http://localhost:8081/health/adapters  # openai/claude/deepseek/ollama 상태
```

### 5.3 K8s 배포 smoke (4 LLM 각 1턴)

```bash
# Build & push
docker build -t ai-adapter:day3-nestjs-v11-<sha> src/ai-adapter/
# Helm upgrade (ai-adapter only, game-server 무변경)
helm upgrade ai-adapter helm/charts/ai-adapter --set image.tag=day3-nestjs-v11-<sha>
kubectl -n rummikub rollout status deploy/ai-adapter --timeout=120s

# Smoke: 각 모델 1회 AI_MOVE
python scripts/ai-battle-3model-r4.py --models openai --max-turns 3
python scripts/ai-battle-3model-r4.py --models claude --max-turns 3
python scripts/ai-battle-3model-r4.py --models deepseek --max-turns 3
python scripts/ai-battle-3model-r4.py --models ollama --max-turns 3
```

- **기준**: 4 모델 각각 **AI_MOVE 1턴 이상 place 또는 draw 성공**. fallback/timeout 0건.
- Redis `quota:daily:{YYYY-MM-DD}` hash 증가 확인 (비용 집계 정상).

### 5.4 Playwright 전수 (회귀 확인)

```bash
cd src/frontend
npx playwright test --reporter=line
```

- **기준**: 기존 PASS 유지 (376/390 기준). **신규 FAIL 0건**.
- ai-adapter 는 game-server HTTP 피호출 경로에서 블랙박스 — API contract 유지 시 회귀 0 기대.

### 5.5 에러 코드 파싱 정상 확인

- `http-exception.filter.ts` 의 `error.code` 응답 포맷 (HttpException 기반) 회귀 확인.
- Smoke: 400 (ValidationPipe), 429 (RateLimitGuard), 500 (unhandled) 각 1회 유발.
- `docs/02-design/29-error-code-registry.md` 의 `AI_*` 코드 정합.

---

## 6. Rollback 계획

### 6.1 트리거 조건

- Jest 599/599 유지 실패 (수정 범위 20 LOC 이상 or 원인 불명)
- K8s smoke 에서 4 모델 중 1개라도 신규 fallback/timeout
- Playwright 신규 FAIL 발생
- health/adapters 엔드포인트가 401/403 반환 (Internal-token guard 회귀)

### 6.2 롤백 절차

```bash
# 1. 이미지 tag 롤백
helm upgrade ai-adapter helm/charts/ai-adapter \
  --set image.tag=day2-2026-04-23
kubectl -n rummikub rollout status deploy/ai-adapter --timeout=60s

# 2. package.json / lockfile 롤백
cd src/ai-adapter
git checkout HEAD -- package.json package-lock.json
npm ci

# 3. 커밋 revert (PR 머지 전이면 drop, 머지 후면 revert commit)
git revert <nestjs-v11-bump-sha>
```

### 6.3 롤백 후 대응

- SEC-78 의 Nest core moderate 이슈는 **일시 유지** (Medium, 7일 이내 재시도 목표).
- 원인 분석 보고서 추가: `docs/04-testing/79-nestjs-v11-rollback-analysis.md`.

---

## 7. Go/No-Go 게이트

Day 3 실행 중 각 게이트에서 **통과 시 다음 단계, 실패 시 Rollback** 결정.

| # | 게이트 | 통과 기준 | 실패 시 |
|---|---|---|---|
| G1 | `npm install` 성공 | peer dep 경고만 허용, error 0 | HOLD — peer 매트릭스 재분석 |
| G2 | `npm run build` 성공 | tsc 0 error | 시그니처 패치 (최대 20 LOC) 후 재시도 |
| G3 | **Jest 599/599** | PASS 유지 | 원인 분석 ≤ 30m, 초과 시 Rollback |
| G4 | K8s deploy ready | rollout status OK, readinessProbe PASS | Pod log 확인, 10m 내 미해결 시 Rollback |
| G5 | **4 LLM smoke** | 각 모델 1턴 이상 정상 turn | 어댑터별 격리 분석, Rollback 판정 |
| G6 | **Playwright 전수** | 신규 FAIL 0 | 회귀 격리, Rollback |
| G7 | **에러 코드 파싱** | 400/429/500 각 1회 정상 포맷 | 필터 수정 or Rollback |

---

## 8. Day 3 실행 예산 + 의존성

### 8.1 시간 예산 (wall-clock)

| 단계 | 예산 | 누적 |
|---|---|---|
| package.json + lockfile bump | 15m | 0h15m |
| 코드 수정 (Guard 시그니처 if any) | 15m | 0h30m |
| 로컬 Jest 전수 | 15m | 0h45m |
| 로컬 build + smoke | 15m | 1h00m |
| Docker build + K8s 재배포 | 10m | 1h10m |
| 4 LLM smoke (3턴씩) | 20m | 1h30m |
| Playwright 전수 | 25m | 1h55m |
| 트러블슈팅 여유 | 60m | 2h55m |
| **합계** | **~2.5h~3h** | |

### 8.2 의존성 / 병렬성

- **독립 가능**: ai-adapter 단일 서비스 변경. game-server / frontend / helm 기타 chart 영향 없음.
- **Day 3 병렬 가능 작업**:
  - SEC-A (Go 1.25.9 + go-redis v9.7.3) — go-dev + devops 담당, 충돌 없음
  - SEC-BC (Next 15.5.15 + admin) — frontend-dev 담당, 충돌 없음
  - Issue #47 (LeaveRoom PLAYING guard) — go-dev 담당, 충돌 없음
- **선행 조건**: Day 2 저녁 Playwright baseline 녹음 (최근 PR 머지 직후 상태 기준).
- **후속 블록**: Day 4 ~ Day 5 의 ai-adapter 관련 E2E 배치 (v4 prompt pilot 등) 는 Day 3 검증
  통과 후 착수.

### 8.3 담당 / 역할

| 단계 | 담당 |
|---|---|
| 본 분석 문서 (이 문서) | architect (Day 2 저녁 완료) |
| bump + 코드 수정 | node-dev |
| Jest + build 검증 | node-dev |
| K8s 재배포 | devops |
| 4 LLM smoke | qa |
| Playwright 전수 | qa |
| 게이트 판정 | architect (최종) |

---

## 9. 의사결정 요약 (ADR-style)

### Status
**Accepted (조건부)** — 게이트 G1~G7 전수 통과 시 머지.

### Context
`@nestjs/core@^10.0.0` 는 moderate injection 취약점 존재 (SEC-78). v11 메이저 bump 가 유일한 해소 경로.
ai-adapter 는 runtime 핵심이지만 Nest 최소 집합만 사용.

### Decision
Day 3 (2026-04-24) 에 Nest 생태계 8개 패키지 동반 bump 를 수행한다. 세부 게이트 7개 + Rollback 절차 +
이미지 tag 기반 즉시 복구 계약을 준수한다.

### Consequences
- **긍정**: SEC-78 moderate 해소, Nest 생태계 lifecycle 유지, Node 20+ 정렬
- **부정**: 2.5~3h wall-clock, lockfile 수천 줄 diff, throttler v6 peer 매트릭스 상시 모니터
- **리스크 전가**: `@nestjs/throttler` 가 v11 peer 미지원 시 **v7 병행 bump** 필요 (추가 30m)

### Alternatives Considered
1. **HOLD** (v10 유지) — SEC-78 moderate 장기 방치, 불수용
2. **부분 bump** (throttler/config 만) — Nest core peer dep 위반, 불가
3. **이미지만 scan ignore** — 감사 기록 악화, DevSecOps 원칙 위배

---

## 10. 체크리스트 (Day 3 실행용)

### 사전 (Day 2 저녁, 현재)
- [x] 본 문서 작성
- [ ] Playwright baseline 녹음 (`npx playwright test --reporter=json > baseline.json`)
- [ ] 현재 이미지 tag 기록 (`kubectl -n rummikub get deploy ai-adapter -o=jsonpath='{.spec.template.spec.containers[0].image}'`)

### Day 3 당일
- [ ] G1: `npm install` 성공
- [ ] G2: `npm run build` 성공
- [ ] G3: Jest 599/599
- [ ] G4: K8s rollout ready
- [ ] G5: 4 LLM smoke OK
- [ ] G6: Playwright 신규 FAIL 0
- [ ] G7: 에러 코드 파싱 정상
- [ ] 커밋 PR 작성 (`security(ai-adapter): @nestjs/* v10 → v11 bump — SEC-78 moderate 해소`)
- [ ] 머지 후 Redis quota 증가 확인 (smoke 비용 집계)

### 사후
- [ ] 데일리 로그에 소요 시간 기록
- [ ] 실패 게이트 있었다면 `docs/04-testing/79-*.md` 로 별도 보고
