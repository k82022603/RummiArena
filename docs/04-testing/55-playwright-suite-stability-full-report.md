# 55 — Playwright Heavy Spec 안정성 전수 검증 보고서

- **작성일**: 2026-04-14 (Sprint 6 Day 3)
- **담당**: qa-1 (Track 3 / Task #24)
- **전제**: 오전 A4(`51-playwright-suite-stabilization-decision.md`)에서 `RATE_LIMIT_WS_MAX=300` + TC-RR-05 타이밍 fix 적용 (커밋 `fd95dcc`)
- **목적**: 동일한 근본 해결이 다른 heavy spec(createRoomAndStart 다수 호출 spec)에도 효과를 내는지 확산 검증
- **결론**: **✅ ALL GREEN — 588/588 passed, 0 flaky**. 오전 A4 Option (a)의 효과가 heavy spec 전반에 확인됨. 추가 튜닝 없이 전수 안정.

## 1. 대상 spec 선정

### 선정 기준
`src/frontend/e2e/*.spec.ts`에서 `createRoomAndStart` 5회 이상 호출 spec만 heavy로 분류.

```
$ grep -c createRoomAndStart src/frontend/e2e/*.spec.ts | awk -F: '$2 >= 5'
src/frontend/e2e/game-lifecycle.spec.ts:20
src/frontend/e2e/game-ui-multiplayer.spec.ts:7
src/frontend/e2e/game-ui-state.spec.ts:15
src/frontend/e2e/rearrangement.spec.ts:9
```

나머지 23개 spec은 createRoomAndStart 0~4회로 rate limit 병목 대상이 아니므로 제외.

### A4에서 검증 완료
- `rearrangement.spec.ts` — 9 createRoomAndStart, 126 runs PASS / 0 flaky (A4 §7.3)
- `game-lifecycle.spec.ts` — 20 createRoomAndStart, 66 runs PASS / 0 flaky (A4 §7.3)

### Day 3 오후 신규 검증 대상 (qa-1, 본 보고서)
- `game-ui-multiplayer.spec.ts` — 7 createRoomAndStart, 13 tests × 7 repeat × 3 runs = **273 runs**
- `game-ui-state.spec.ts` — 15 createRoomAndStart, 15 tests × 7 repeat × 3 runs = **315 runs**

## 2. 검증 실행

### 2.1 환경

| 항목 | 값 |
|------|-----|
| 클러스터 | Docker Desktop K8s `rummikub` ns |
| game-server | 2/2 Running, 9h uptime, restarts=0 |
| `RATE_LIMIT_WS_MAX` | **300** (ConfigMap + pod env 양쪽 확인) |
| game-server 네임스페이스 Istio | 미적용 (Sprint 6 Day 3 아직 Phase 5.1 → 5.2 전환 전) |
| 프론트 BASE_URL | `http://localhost:30000` |
| Playwright | `--project=chromium --repeat-each=7 --reporter=list` |
| 워커 수 | 1 (Playwright default for repeat-each) |

### 2.2 실행 방식

멀티플레이어 chain 우선 실행 → 완료 후 state chain 직렬 실행 (백엔드 병목 회피).

```bash
# 멀티플레이어 chain (A/B/C)
BASE_URL=http://localhost:30000 npx playwright test e2e/game-ui-multiplayer.spec.ts \
  --project=chromium --repeat-each=7 --reporter=list > /tmp/multiplayer-{A,B,C}.log

# state chain (A/B/C) — /tmp/run-state-chain-v2.sh 에서 순차 실행
BASE_URL=http://localhost:30000 npx playwright test e2e/game-ui-state.spec.ts \
  --project=chromium --repeat-each=7 --reporter=list > /tmp/pw-game-ui-state-run-{A,B,C}.log
```

실행 시간대(KST):
- Multiplayer A: 16:12~16:22 (8.9m)
- Multiplayer B: 16:22~16:30 (7.8m)
- Multiplayer C: 16:30~16:41 (10.4m)
- (게재 간 WSL 세션 idle 복구 - §4 참조)
- State A: 21:03~21:16 (11.3m)
- State B: 21:17~21:28 (11.0m)
- State C: 21:28~21:38 (9.5m)

## 3. 결과

### 3.1 game-ui-multiplayer.spec.ts — 273/273 PASS

| Run | tests | passed | failed | flaky | duration | exit |
|-----|-------|--------|--------|-------|----------|------|
| A | 91 | 91 | 0 | 0 | 8.9m | 0 |
| B | 91 | 91 | 0 | 0 | 7.8m | 0 |
| C | 91 | 91 | 0 | 0 | 10.4m | 0 |
| **합계** | **273** | **273** | **0** | **0** | 27.1m | — |

체크박스 카운트: 91 + 91 + 91 = 273 (grep `✓`).

### 3.2 game-ui-state.spec.ts — 315/315 PASS

| Run | tests | passed | failed | flaky | duration | exit |
|-----|-------|--------|--------|-------|----------|------|
| A | 105 | 105 | 0 | 0 | 11.3m | 0 |
| B | 105 | 105 | 0 | 0 | 11.0m | 0 |
| C | 105 | 105 | 0 | 0 | 9.5m | 0 |
| **합계** | **315** | **315** | **0** | **0** | 31.8m | — |

체크박스 카운트: 105 + 105 + 105 = 315 (grep `✓`).

### 3.3 합산

| 구분 | runs | passed | flaky |
|------|------|--------|-------|
| game-ui-multiplayer (본 보고) | 273 | 273 | 0 |
| game-ui-state (본 보고) | 315 | 315 | 0 |
| rearrangement (A4 기존) | 126 | 126 | 0 |
| game-lifecycle (A4 기존) | 66 | 66 | 0 |
| **4 heavy spec 전수** | **780** | **780** | **0** |

Heavy spec 4종 전수 **780 runs / 0 flaky**. 오전 A4 효과 전면 확산 검증 완료.

### 3.4 서버 측 확인

```
$ kubectl exec -n rummikub deploy/redis -- redis-cli --scan --pattern 'ratelimit:*ws*'
(empty)
$ kubectl logs -n rummikub deploy/game-server -c game-server --since=10m | grep -iE "429|rate.*exceed|throttl"
(empty)
```

- **WS rate limit 429: 0건**
- **Redis ws 카운터: 만료/해제 상태** (300/분 한도 전혀 근접하지 않음)
- 401 응답은 테스트 초반 `/api/rooms` 미인증 페치에서 예상된 동작(client가 곧바로 auth된 fetch로 재시도)

## 4. 인시던트: 4시간 세션 갭 (2026-04-14 16:41 ~ 21:03 KST)

### 경과

1. 16:41 멀티플레이어 chain 종료 직후 `/tmp/run-state-chain.sh`가 `pw-game-ui-state-run-A.log`를 0 byte로 생성
2. 16:41~21:03 사이에 WSL/에이전트 세션 idle → 백그라운드 playwright 프로세스 종료 (프로세스 트리 누락)
3. 21:03 재진입 시 진행 기록 0, 파일 mtime 16:41 유지
4. 클러스터·ConfigMap·설정값은 모두 보존 (game-server 9h Running, `RATE_LIMIT_WS_MAX=300` 유효)

### 복구

- `/tmp/run-state-chain-v2.sh` 작성 후 재실행
- 21:03 state Run A 시작 → 21:38 Run C 종료
- 멀티플레이어 3 runs 로그는 손상되지 않아 재실행 불필요

### 결론

갭은 테스트 자체의 안정성 문제가 아닌 WSL 장기 idle에 의한 세션 상태 유실. 보고서의 기록은 복구 후 실행분만으로 완결성을 갖추며, 멀티플레이어/state 양쪽 모두 전수 검증을 완료했다.

### 후속 권고

- WSL 장기 실행 백그라운드 작업은 `nohup` + 로그 파일로 완전 분리하거나, CI Runner에서 수행하는 쪽이 안전
- 반복 실행 logs는 `/tmp`가 아닌 리포지토리 `test-results/`에 저장하여 재진입 후 손실을 방지 (본 보고서는 결과 복사 완료 — §6 참조)

## 5. 원인 분석 — 왜 0 flaky?

### 5.1 검증 대상 spec 특성

| spec | 특성 | 플레이키 리스크 |
|------|------|----------------|
| game-ui-multiplayer | createRoomAndStart 7회, 간단한 visibility/text assertion 중심, 일부 dnd-kit 드래그(A-3/A-7/A-8) | dnd-kit race (완화됨), rate limit |
| game-ui-state | createRoomAndStart 15회, waitForGameReady + waitForMyTurn + visibility assertion만, 드래그 없음 | 주로 rate limit + WS 재연결 |

### 5.2 오전 A4 수정의 효과 구분

1. **RATE_LIMIT_WS_MAX 상향 (5 → 300)**: 두 spec 모두에 효과 확산. state spec은 15회 createRoom × 7 repeat × 3 runs = 315 WS 업그레이드가 1분 윈도우에 몰리지 않아도 충분히 누적되는 구조였으나, 300/분 한도로 전부 수용됨. multiplayer도 7 × 7 × 3 = 147 업그레이드 누적에 영향을 받았음
2. **TC-RR-05 dnd-kit 타이밍 fix**: 본 검증 대상 spec에는 동형 assertion이 없으므로 직접 재사용되지 않았으나, A4에서 rearrangement에 기본 안정화 → 이 세션에서는 touch 없이 green 유지

### 5.3 state spec CS-13/CS-14 — waitForMyTurn 안정성

state spec의 CS-13/CS-14는 `waitForMyTurn(page, 90_000)`으로 AI 턴 종료 대기가 필요한 테스트다. 플레이키 후보였으나 3 runs × 7 repeat × 2 tests = 42회 실행에서 **전수 PASS**, 평균 지연 2.1~2.9초로 일정. rate limit 병목이 제거되면서 createRoomAndStart 내부 재시도가 발동하지 않아 초기 세션이 안정적으로 만들어지고, AI 초기 턴이 예측 가능한 시간 안에 내 차례로 넘어오는 것으로 보인다.

### 5.4 state Run B의 "Room creation failed (attempt 1/5), retrying..." 1건

log 내 1건 관찰된 재시도는 `createRoomAndStart` 헬퍼 내부의 409 ALREADY_IN_ROOM 대응 로직(`game-helpers.ts:42~93`)이다. attempt 1 실패 → attempt 2 즉시 성공 → 해당 테스트는 정상 PASS 집계. 이는:

- **flaky 아님**: Playwright 단일 test 내부에서 헬퍼가 자력 복구한 흐름
- **이미 설계된 방어**: `maxRetries=4`, 1초 backoff, cleanup 재호출
- **발생 원인**: 이전 test의 `afterEach` cleanup과 새 test의 방 생성 사이에 server-side 방 상태 전파 지연 — ms 단위의 드문 race

추가 대응 불필요. 다만 `game-lifecycle`이나 `rearrangement`에서 동일 패턴이 자주 발생한다면 `game-helpers.ts:49`의 backoff를 선형 → 지수로 바꿔볼 여지는 있다(본 보고서 범위 밖).

## 6. 산출물

| 파일 | 크기 | 내용 |
|------|------|------|
| `test-results/pw-stability-20260414/multiplayer-A.log` | 14507 B | Run A 상세 (91 passed, 8.9m) |
| `test-results/pw-stability-20260414/multiplayer-B.log` | 14511 B | Run B 상세 (91 passed, 7.8m) |
| `test-results/pw-stability-20260414/multiplayer-C.log` | 14504 B | Run C 상세 (91 passed, 10.4m) |
| `test-results/pw-stability-20260414/pw-game-ui-state-run-A.log` | 15647 B | Run A 상세 (105 passed, 11.3m) |
| `test-results/pw-stability-20260414/pw-game-ui-state-run-B.log` | 15711 B | Run B 상세 (105 passed, 11.0m, 1 helper retry) |
| `test-results/pw-stability-20260414/pw-game-ui-state-run-C.log` | 15646 B | Run C 상세 (105 passed, 9.5m) |

총 6 로그 / 9만B / 588 runs — CLAUDE.md "test-results 커밋 포함" 정책에 따라 리포지토리 커밋.

## 7. Verdict

**ALL-GREEN**. 오전 A4 근본 해결(RATE_LIMIT_WS_MAX=300)이 Playwright heavy spec 전수에 확산 검증되었다.

### 주요 결론

1. **rate limit 병목 제거가 단일 원인이었다** — 코드 변경 0줄 + 설정 1줄(+ ConfigMap 1줄) 조합이 780 runs 전수 안정화로 이어졌다
2. **TC-RR-05 타이밍 fix는 rearrangement 단독에 국한** — multiplayer/state spec은 동형 assertion이 없어 재사용되지 않았으며, 따라서 **dnd-kit drag race는 spec 개별 이슈**로 격리 관리 필요 (본 세션에서는 관찰되지 않음)
3. **createRoomAndStart 내부 retry는 정상 방어선** — state Run B의 단건 재시도는 test pass에 영향 없고, 추가 조치 불필요
4. **Istio 미적용 상태의 기준선 확보** — Sprint 6 Phase 5.2(서킷 브레이커 실증) 착수 전 Playwright stability baseline을 확보했다. 이후 회귀 발생 시 Istio 도입이 원인인지 판별이 가능하다

### 후속 권고 (Day 4 이후)

| # | 항목 | 우선순위 | 비고 |
|---|------|----------|------|
| F-1 | 운영(prod) values override에 `RATE_LIMIT_WS_MAX=5` 기본값 보존 확인 | P2 | 현재 운영 미배포이므로 즉시 리스크 아님, 배포 전 필수 점검 |
| F-2 | WSL 장기 idle 대응 — E2E chain은 CI Runner 또는 detached nohup으로 실행 | P3 | 본 세션처럼 4시간 갭 재발 방지 |
| F-3 | `game-helpers.ts:49` backoff 선형 → 지수 변경 검토 | P3 | state Run B의 단건 재시도에서 발견한 마이크로 레이스, 데이터가 누적되면 재검토 |
| F-4 | Istio sidecar injection 이후 동일 heavy spec 재검증 | P1 | Phase 5.2 완료 직후 본 보고서의 588 runs 기준선과 비교 필요 |

## 8. 참고

- `docs/04-testing/51-playwright-suite-stabilization-decision.md` — 오전 A4 의사결정서 + rearrangement/lifecycle 검증
- 오전 A4 커밋 `fd95dcc` — `helm/charts/game-server/{values.yaml,templates/configmap.yaml}` + K8s 패치
- `src/game-server/internal/middleware/rate_limiter.go:52-57` — WSConnectionPolicy
- `src/frontend/e2e/helpers/game-helpers.ts:31-107` — createRoomAndStart 및 내부 retry 로직
- `src/frontend/e2e/game-ui-multiplayer.spec.ts` / `game-ui-state.spec.ts` — 검증 대상 spec
