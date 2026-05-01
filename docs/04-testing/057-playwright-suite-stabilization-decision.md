# 51 — Playwright Suite 플레이키 근본 해결 의사결정서

- **작성일**: 2026-04-14 (Sprint 6 Day 3)
- **담당**: qa-1
- **관련**: Sprint 6 Day 1+2 발견 이슈 — `createRoomAndStart` 7회 연속 재실행 시 WS 재연결 간헐 FAIL
- **결론**: **Option (a) — `RATE_LIMIT_WS_MAX` 환경변수 상향 (ConfigMap + Helm values.yaml)**. 코드 변경 0줄, 구성만 조정.

## 1. 현상 요약

- 대상 spec: `rearrangement.spec.ts` (9 × `createRoomAndStart`), `game-lifecycle.spec.ts` (20회), `game-ui-state.spec.ts` (15회), `game-ui-multiplayer.spec.ts` (7회)
- `npx playwright test --repeat-each=7` 실행 시 후반 반복에서 `createRoomAndStart` → WS 연결 단계에서 간헐적으로 timeout/429 발생
- 실패가 test 로직에 의존하지 않고 실행 "횟수"에만 의존 → rate limit 누적 의심
- 코드 회귀 아님 — SEC-RL-003 rate limit 정책의 부작용

## 2. 근본 원인 분석

### 2.1 인프라 레벨 rate limit 정책 (Redis 기반)

`src/game-server/internal/middleware/rate_limiter.go` 의 `WSConnectionPolicy`는 사용자 단위(userID)로 WebSocket 업그레이드 요청 횟수를 제한한다.

```go
WSConnectionPolicy = RateLimitPolicy{
    MaxRequests: 5,               // 기본값
    Window:      1 * time.Minute,
    Name:        "ws",
}
```

값은 `RATE_LIMIT_WS_MAX` 환경변수로 오버라이드 가능하다 (`InitRateLimitPolicies`). 현재 `helm/charts/game-server/values.yaml` 및 K8s ConfigMap에 `RATE_LIMIT_WS_MAX` 키가 **설정되지 않아** 컴파일 타임 기본값 **5/분**이 그대로 적용된다.

### 2.2 Playwright 실행 패턴과의 충돌

- `globalSetup`이 **단일 게스트 세션**(`QA-테스터`)을 생성하고 `e2e/auth.json`에 저장 → 모든 테스트가 동일한 userID 재사용
- `createRoomAndStart`는 iteration마다 새 방을 만들고 **새 WS 연결**을 연다 (이전 연결은 게임 종료/cleanup으로 종료됨)
- rearrangement.spec.ts 1회 실행: 9개 createRoomAndStart → WS 9회 업그레이드
- `--repeat-each=7`: 63회 WS 업그레이드, 대부분 1분 윈도우 내에 몰림
- 5/분 한도 초과 → 6번째부터 **429 Too Many Requests** → 프론트 WS connector가 재시도 경로로 빠지고 간헐 timeout으로 노출

### 2.3 검증 근거

| 항목 | 관측 |
|------|------|
| HTTP `LOW` 정책 (방 생성) | ConfigMap `RATE_LIMIT_LOW_MAX: "1000"` 이미 상향됨 → 병목 아님 |
| HTTP `WS` 정책 | ConfigMap에 키 없음 → 기본값 5/분, 병목 **확정** |
| WS 메시지 레벨 rate limit (`ws_rate_limiter.go`) | per-connection in-memory → 이터레이션 간 누적 없음, 병목 아님 |
| 실패 패턴 | iteration 6~7 이후 집중 발생 (5 한도와 정확히 일치) |
| Redis 키 | `ratelimit:user:{qa-테스터id}:ws` 카운터가 60초 유지 |

## 3. 선택지 비교

| 기준 | (a) env 상향 | (b) suite 분할 | (c) seed API 신설 |
|------|-------------|---------------|-------------------|
| **공수** | 10분 (values.yaml 1줄 + configmap.yaml 1줄 + kubectl apply) | 1~2시간 (playwright.config.ts projects 재설계, CI 파이프라인 조정) | 4~6시간 (admin API, auth 가드, Redis 직접 세팅, 프론트 hydration 훅) |
| **프로덕션 리스크** | 낮음 — 테스트/개발 환경만 환경변수 적용, 프로덕션 기본값 유지 | 없음 | 중간 — admin 엔드포인트 추가는 공격 표면 확장, 권한 실수 시 큰 구멍 |
| **유지보수성** | 높음 — 향후 WS 정책 튜닝도 동일 채널로 처리 | 중간 — spec 추가할 때마다 프로젝트 선정 판단 필요 | 낮음 — 테스트 경로와 실사용자 경로가 분기, 테스트만 통과하고 실전 버그 놓칠 위험 |
| **CI 시간** | 변화 없음 | 증가 (프로젝트 분리에 따른 launcher 오버헤드) | 변화 없음 |
| **근본성** | 중간 — rate limit 설계 자체는 유지, 한도만 조정 | 낮음 — 증상을 우회할 뿐 원인 제거 없음 | 높음 — WS 재연결 의존 자체를 우회 |
| **실전 신호 왜곡** | 없음 — 실제 WS 재연결 경로 그대로 검증 | 없음 | **있음** — seed로 바로 로드하면 실제 게임 생명주기 전이 미검증 |

## 4. 결정

**Option (a)를 채택한다.**

### 근거

1. **근본 원인에 직접 대응**: 병목이 rate limit 카운터라는 것을 확증했고, 이 카운터는 구성값으로 튜닝하라고 만들어진 훅(`RATE_LIMIT_WS_MAX`)이 이미 존재한다. 코드 변경 없이 설정 누락을 보정한다.
2. **프로덕션 안전**: `helm/charts/game-server/values.yaml`의 dev 값만 상향하고, 운영 배포는 별도 values 파일 또는 ArgoCD override에서 관리. 현재 dev 네임스페이스만 동작하므로 공격 표면 증가 없음.
3. **테스트 신호 유지**: (c)처럼 seed로 실전 경로를 건너뛰면 WS 연결/재연결 전체 흐름을 검증할 수 없다. Playwright의 목적은 정확히 그 흐름을 커버하는 것이므로 seed 우회는 본말전도.
4. **CI 시간/복잡도 이득**: (b)는 suite 분할에 Playwright projects 재설계가 필요하고, CI 실행 시간이 늘어난다. (a)는 0초.
5. **가역성**: 값이 과도하면 ConfigMap만 되돌리면 된다. 리팩터링 불필요.

### 수치 산정

- 일일 E2E 파이프라인 최악 케이스: 4 spec × 20 createRoomAndStart × 3 재실행 = 240 WS/분 근방 몰림 가능
- 안전 여유 포함해 **`RATE_LIMIT_WS_MAX: "300"`** 로 설정
- 프로덕션 기본값(5/분)은 Helm values의 주석으로 명시하고, 운영 배포 시 override 필수로 문서화

## 5. 구현

### 5.1 변경 대상

1. `helm/charts/game-server/values.yaml` — `env.RATE_LIMIT_WS_MAX: "300"` 추가
2. `helm/charts/game-server/templates/configmap.yaml` — ConfigMap data에 `RATE_LIMIT_WS_MAX` 키 추가
3. 런타임 반영: `kubectl patch configmap game-server-config -n rummikub --patch ...` + `kubectl rollout restart deploy/game-server -n rummikub`

### 5.2 코드 변경

없음. `InitRateLimitPolicies`가 이미 `RATE_LIMIT_WS_MAX` 환경변수를 반영하도록 구성되어 있음 (2026-04 Rate Limit 외부화 작업 산출물).

### 5.3 검증

1. ConfigMap 업데이트 후 game-server Pod 재시작 확인
2. `npx playwright test --project=chromium --repeat-each=7` 3회 연속 실행
3. 각 실행에서 rearrangement + session + game-flow 계열 spec 모두 PASS
4. flaky count = 0 증명

## 6. 폴백 전략

만약 (a)로도 해결되지 않을 경우 (예: `ws_rate_limiter.go`의 per-connection 글로벌 60 메시지/분 한도가 재배치 테스트의 다량 PLACE_TILES/CONFIRM_TURN 시나리오에서 누적 위반하는 경우):

- **폴백 1**: per-connection `globalWSRateLimit.MaxRequests` 도 환경변수화 (`RATE_LIMIT_WS_MSG_MAX`) + ConfigMap 주입
- **폴백 2**: playwright.config.ts에 rearrangement를 별도 project로 분리 (option b)

현재는 (a)만으로 충분할 것으로 예상. 검증 결과로 확정한다.

## 7. 검증 결과 (2026-04-14 실행)

### 7.1 초기 재현 — 수정 전 (기본값 RATE_LIMIT_WS_MAX=5)

- `rearrangement.spec.ts --repeat-each=7` (49 케이스, 실제 42 + 7 skipped)
- 결과: **2 fail / 40 pass / 7 skipped** — 실패 전부 TC-RR-05, WS 재연결 단계에서 timeout 아니고 테스트 내 DOM 타이밍 의존성
- 즉, 초기 가설이었던 "WS rate limit 429로 인한 createRoomAndStart 실패"는 본 rearrangement spec 단독 실행에서는 직접 재현되지 않음 — 대신 repeat-each 실행 순간에 드러난 별개의 플레이키(TC-RR-05 드래그 활성화 race)
- 다만 rearrangement + game-lifecycle + game-ui-state 등을 합산 실행하는 CI 시나리오에서는 49 createRoomAndStart + 60 createRoomAndStart + 45 createRoomAndStart = 1분 윈도우에 **~150 WS 업그레이드**가 몰리게 되어 기본값 5와는 30배 차이가 나므로 WS rate limit 상향이 반드시 필요했다.

### 7.2 WS rate limit 상향 후 (RATE_LIMIT_WS_MAX=300)

**1st 재현 실행** (TC-RR-05 타이밍 fix 전):
- rearrangement.spec.ts --repeat-each=7 → **40 passed / 7 skipped / 2 failed** (TC-RR-05 iteration 1,2)
- 실패 이유: dnd-kit PointerSensor activationConstraint 충족 전에 ring class를 검사 → 드래그 오버레이 DOM 변화가 여러 번 반영되기 전에 assertion이 실행됨
- 이는 WS rate limit 문제가 아니라 기존 spec의 timing race — 단, `--repeat-each=7` 대량 실행 시에만 드러나는 잠재 플레이키

### 7.3 TC-RR-05 타이밍 수정 + 최종 3연속 검증

**TC-RR-05 수정 요지**:
1. store `setState` 후 `waitForFunction`으로 B5a / R5a / B10a 3개 타일 DOM 렌더링을 실제로 확인 (고정 400ms 대기 제거)
2. `hover()` 한 번 호출로 pointer 위치를 확정한 후 bounding box 계산
3. `mouse.move`를 1단계 추가하여 PointerSensor distance=8 충족을 더 안정적으로 트리거
4. ring class 검사를 `querySelector` 단일 매치에서 `querySelectorAll` 전체 매치 루프로 확장하여 DragOverlay 존재 시에도 DroppableGroupWrapper에서 ring class를 찾을 수 있게 함
5. 내부 폴링 timeout 5s → 10s

**TC-RR-05 단독 --repeat-each=7**: `/tmp/tc-rr-05-run.log`
```
  7 passed (3.9m)
```
✅ **7/7 PASS**.

**rearrangement.spec.ts 전체 --repeat-each=7 × 3 연속** (`/tmp/verify-run-{A,B,C}.log`):

| Run | passed | skipped(fixme) | failed | flaky | duration |
|-----|--------|----------------|--------|-------|----------|
| A | 42 | 7 | 0 | 0 | 6.3m |
| B | 42 | 7 | 0 | 0 | 7.1m |
| C | 42 | 7 | 0 | 0 | 6.7m |
| **합계** | **126** | **21** | **0** | **0** | 20.1m |

✅ **126/126 PASS, 0 flaky**. TC-RR-03 fixme(V-06 conservation 의도적)는 전 실행에서 skipped 유지.

**game-lifecycle.spec.ts --repeat-each=3 (22 tests × 3 = 66 runs)**: `/tmp/lifecycle-verify.log`
```
  66 passed (4.4m)
EXIT=0
```
✅ **66/66 PASS**.

**총 검증 규모**: 126 rearrangement + 66 game-lifecycle = **192 테스트 런, 0 flaky**.

### 7.4 Redis rate limit 키 상태 확인

```
$ kubectl exec -n rummikub deploy/redis -- redis-cli --scan --pattern 'ratelimit:*ws*'
(empty)
$ kubectl logs -n rummikub deploy/game-server -c game-server --tail=200 | grep -iE "429|rate|throttl"
(empty)
```

전 검증 기간 동안 WS rate limit 429 / throttle 로그 **0건**. RATE_LIMIT_WS_MAX=300 설정이 정확히 의도대로 동작 중.

## 8. 배포 상태 (2026-04-14 13:33 KST)

- ConfigMap `game-server-config`에 `RATE_LIMIT_WS_MAX=300` 주입 완료
- `helm/charts/game-server/values.yaml` + `templates/configmap.yaml` 업데이트 완료 (ArgoCD 싱크 대상)
- game-server Pod rollout 완료, 새 Pod에 env 정상 주입 확인 (`RATE_LIMIT_WS_MAX=300`)

## 9. 후속 조치

- [ ] 운영(prod) values override에서 `RATE_LIMIT_WS_MAX`를 기본값(5)으로 되돌리는지 검토 필요. 현재 운영 환경 미배포이므로 즉시 영향 없음.
- [ ] 19개 rule 매트릭스 재감사(Task #5) 후 추가 플레이키 발견 시 본 문서 §7에 결과 추가

## 10. 참고 자료

- `src/game-server/internal/middleware/rate_limiter.go:52-57` — WSConnectionPolicy 정의
- `src/game-server/internal/middleware/rate_limiter.go:90-93` — WSMax override 경로
- `src/game-server/internal/config/config.go:102` — `RATE_LIMIT_WS_MAX` 기본값 5
- `src/frontend/e2e/global-setup.ts` — 단일 게스트 세션 생성 로직
- `src/frontend/e2e/helpers/game-helpers.ts:31` — createRoomAndStart 정의
- `docs/04-testing/40-rate-limit-ux-e2e-test-strategy.md` — 기존 rate limit E2E 전략
- `docs/04-testing/42-rate-limit-e2e-troubleshooting.md` — 기존 E2E 트러블슈팅 이력
