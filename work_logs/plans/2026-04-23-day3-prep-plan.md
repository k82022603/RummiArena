# Plan — Day 3 (2026-04-24) Sprint 7 Week 1+Week 2 몰아 완주

## Context

사용자 결정: **"내일 하루에 모두 끝내버리죠"** — Sprint 7 Week 1 잔여 + Week 2 대부분을 하루에 몰아 처리.

오늘 Day 2 가 architect 사전 분석(`75-*.md`, `76-*.md`) 덕에 ~1.5h 에 5 PR 완주. 동일 패턴으로 내일 대비 **저녁 세션에 architect × 5 + pm × 1 을 병렬 투입해 사전 분석 문서 6건을 방금 완성**했다. 이 plan 은 그 위에 얹는 실행 승인 요청서이다.

**적용 범위**: Day 3 (2026-04-24) 하루.
**제외**: next-auth v5 이주 (Sprint 8), DashScope API 키 발급(사용자 액션, 0 SP).

---

## Prerequisite — 오늘 밤 완성된 사전 분석 6문서

| 문서 | 대상 | 판정 | 핵심 발견 |
|------|------|------|-----------|
| `docs/04-testing/80-ci-cd-audit-jobs-impact.md` (621줄) | **A** CI/CD 감사 잡 3건 | PROCEED | `quality` 스테이지 배치, pipeline 순증 0m |
| `docs/02-design/49-v13a-v13e-refactor.md` (451줄) | **B** V-13a + **D** V-13e | PROCEED | V-13a 옵션 A (유지+호출 추가), V-13e `removeRecoveredJoker` 호출 지점 추가 |
| `docs/04-testing/79-dev-only-deps-impact.md` (458줄) | **C** dev-only deps 3건 | **D3-A PROCEED + D3-B PROCEED + D3-C HOLD** | jest-env-jsdom 30.3 이 jest 30 동반 bump 요구 → Option C2 WONTFIX + Sprint 8 이관 권장 |
| `docs/02-design/51-nestjs-v11-migration.md` (350줄) | **E** @nestjs/core v11 | PROCEED with gates | MED risk 재평가 (rxjs/WS/Microservices 미사용). Jest 599 유지 확신도 85% |
| `docs/02-design/50-d03-phase2-cutover-plan.md` (430줄) | **H** D-03 Phase 2a shadow read | **HIGH risk, Phase 2a 한정** | **DeleteRoom dual-write 누락 발견** → IS-PH2A-01 선수정 필수. Phase 2b/2c 는 48h 관찰 후 Week 2 후반 |
| `docs/01-planning/day3-execution-plan.md` (280줄) | 전체 시간표 | S/A/B 3단 기준 | A (30~35 SP) 공식 목표. 번아웃 방지선 B (20~25 SP) |

---

## Execution Order (pm day3-execution-plan.md 기반)

### 오전 09:00~13:00 — LOW risk 독립 4트랙 병렬

| 트랙 | 작업 | 담당 | 예상 |
|------|------|------|------|
| A | CI/CD 감사 잡 3건 (`sca-npm-audit` + `sca-govulncheck` + `weekly-dep-audit`) | devops + go-dev | 180m |
| B | V-13a `ErrNoRearrangePerm` 호출 경로 추가 | go-dev | 120m |
| C | dev-only deps 2건 (`@typescript-eslint` + `@nestjs/cli`) ※ jest-env-jsdom 은 HOLD | node-dev | 150m |
| D | V-13e 조커 재드래그 UX + `removeRecoveredJoker` 호출 | frontend-dev | 240m |
| I | PostgreSQL 001 마이그 staging dry-run | devops | 60m (11:00~) |

### 점심 13:00~14:00 (필수 60m 휴식)

### 오후 14:00~18:00 — MED risk + 여유분

| 트랙 | 작업 | 담당 | 예상 |
|------|------|------|------|
| E | @nestjs/core v11 + file-type transitive bump | node-dev | 150m |
| F | FORFEIT 경로 완결성 점검 (#47 후속) | go-dev | 120m |
| G | Istio DestinationRule 세밀 조정 (여유분) | devops | 60m |
| merge | 오후 PR 일괄 머지 + K8s smoke | Claude main | 60m |

### 저녁 18:30~20:00 — HIGH risk + 최종 검증

| 트랙 | 작업 | 담당 | 예상 |
|------|------|------|------|
| IS-PH2A-01 | DeleteRoom dual-write 누락 선수정 (H 선수) | go-dev | 30m |
| H | D-03 Phase 2a shadow read 구현 + ConfigMap + rollout | go-dev + devops | 75m |
| J | Playwright 전수 + 회귀 보고서 81 | qa | 60m (병렬) |

---

## Critical Files — 작업별 수정 대상

### A (CI/CD 감사 잡)
- `.gitlab-ci.yml` L659줄 파일의 `quality` 스테이지에 3 job 추가
- 기존 anchor (`*local-runner`, 캐시) 재사용

### B (V-13a)
- `src/game-server/internal/engine/validator.go` L100-131 `validateInitialMeld`
- 분기 추가: before 테이블 감소 검출 → `newValidationError(ErrNoRearrangePerm, ...)`
- 상수는 `src/game-server/internal/engine/errors.go:52,79` 이미 존재 (호출만 추가)
- 테스트 신규 2건 `validator_test.go`

### C (dev-only deps, jest-env-jsdom 제외)
- `src/ai-adapter/package.json` — `@typescript-eslint/*` 7.6+ + `@nestjs/cli` 11.1+
- `src/ai-adapter/package-lock.json` 재생성
- eslint peer ^8.57 동반 bump (79 §D3-A 발견)
- **제외**: `jest-environment-jsdom` — 사용자 결정 대기 (WONTFIX Sprint 8 권장)

### D (V-13e)
- `src/frontend/src/app/game/[roomId]/GameClient.tsx` handleDragEnd 3개 분기
- `src/frontend/src/store/gameStore.ts` — `removeRecoveredJoker` 는 이미 정의됨, 호출만 추가
- Playwright 신규 SC4/SC5 2건

### E (@nestjs/core v11)
- `src/ai-adapter/package.json` — `@nestjs/common`, `@nestjs/config`, `@nestjs/core`, `@nestjs/platform-express` 동반
- `src/ai-adapter/src/guards/rate-limit.guard.ts` `canActivate` 시그니처 재확인 (throttler v6 peer)
- Jest 599 회귀 1건이라도 발견 시 **즉시 revert**

### F (FORFEIT 경로)
- `src/game-server/internal/service/room_service.go` FORFEIT 진입 경로 감사
- `src/game-server/internal/handler/ws_handler.go` broadcastGameOver 연계
- 보고서 + (필요 시) 수정 PR

### H (D-03 Phase 2a shadow read) + IS-PH2A-01
- **선수정**: `src/game-server/internal/service/room_service.go:413-424` DeleteRoom dual-write 추가
- Shadow read: 같은 파일의 `GetRoom` 에 goroutine + 500ms timeout PostgreSQL 조회
- `helm/charts/game-server/values.yaml` + ConfigMap 에 `D03_PHASE2_SHADOW_READ=false` 기본값
- 메트릭: `rooms_shadow_read_consistency` gauge, `rooms_shadow_read_drift_total` counter
- Roll-back: env 한 줄 변경 + rollout (30s)

---

## Reused Patterns (Day 2 에서 검증됨)

- **Agent isolation=worktree**: 같은 에이전트(go-dev)를 병렬 띄울 때 worktree 격리. 머지 후 `git worktree unlock` + `remove` 정리 필수.
- **kubectl 경로**: `/mnt/c/Program Files/Docker/Docker/resources/bin/kubectl.exe`
- **Docker 이미지 태그**: `day3-2026-04-24` (latest 금지)
- **K8s set image**: `kubectl set image deployment/<svc> <container>=<image>:<tag> -n rummikub` + `rollout status --timeout=3m`
- **rooms dual-write 로그 확인**: `kubectl logs -l app=game-server | grep "rooms dual-write"` (Phase 1 회귀 방지)
- **code-modification SKILL** 4단계 + **pr-workflow SKILL** PR-then-merge
- `Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>` 커밋 라인

---

## Key Decisions Needed — 사용자 판단 필요 (AskUserQuestion)

1. **C (dev-only D3-C jest-env-jsdom)**: Option C2 **WONTFIX + Sprint 8 이관** 확정할지? (dev-only low × 4, production 안전)
2. **H (D-03 Phase 2a)**: 내일 저녁 1.25h 박스에 **진짜 착수**? 아니면 Week 2 로 이관 (더 보수적)?
3. **IS-PH2A-01 DeleteRoom dual-write 선수정**: H 착수 전 선수정으로 처리 OK? (자동 포함 권장)
4. **목표 SP**: **A (30~35 SP, 공식 목표)** vs **B (20~25 SP, 번아웃 방지선)**?

---

## Verification — 내일 종료 전 체크리스트

1. **go test** `cd src/game-server && go test ./... -count=1 -timeout 120s` — **535+ PASS** (B +2 + H +2)
2. **Jest ai-adapter** `cd src/ai-adapter && npm test` — **599/599 유지** (E 게이트)
3. **Jest frontend** `cd src/frontend && npm test` — **205+ PASS** (D +2)
4. **Playwright 전수** `cd src/frontend && npx playwright test` — 376+ PASS / 4 KNOWN FAIL, **신규 FAIL 0**
5. **govulncheck** `cd src/game-server && govulncheck -mode=source ./...` — code-called 0건 유지
6. **npm audit production** 3프로젝트 모두 `--audit-level=high --omit=dev` exit 0
7. **K8s smoke** frontend NodePort 30000 + game-server `/health` + ai-adapter `/health`
8. **rooms dual-write 로그** 확인 + **DeleteRoom** 후 PG row 삭제 확인 (IS-PH2A-01 검증)
9. **D03_PHASE2_SHADOW_READ=false** 기본 OFF 확인 (수동 on 시 drift 로그 + gauge 정상)
10. **회귀 보고서 81** 작성 (`docs/04-testing/81-day3-regression-report.md`)

---

## Rollback Plan

| 작업 | 롤백 방법 | 소요 |
|------|-----------|------|
| A CI/CD 잡 | `.gitlab-ci.yml` revert | 5m |
| B/D/F | PR revert | 5m |
| C dev-only | lockfile revert | 5m |
| E nestjs v11 | 이미지 tag `ai-adapter:day2-2026-04-23` 복귀 | 2m |
| H Phase 2a | `D03_PHASE2_SHADOW_READ=false` env + rollout | 30s |
| IS-PH2A-01 | DeleteRoom 코드 revert | 5m |

---

## Exit Conditions (내일 종료 판단)

- **GREEN (A 목표)**: Week 1 완주 + Week 2 3~4건 머지 + Phase 2a shadow read 관찰 시작. 회귀 0.
- **YELLOW (B 방어)**: Week 1 완주만. Week 2 이월. 회귀 0~1 (허용).
- **RED (revert)**: Jest/go test 회귀 2건 이상 또는 Playwright 신규 FAIL 3건 이상 → 해당 PR revert + Day 4 복구.

---

## 변경 규모 예상

- PR 머지: 6~9건 (A 기준)
- 신규 문서: 81 (회귀) + Day 3 데일리 + Day 3 마감 스탠드업 + 바이브 로그
- Critical/High 보안 잔존: **0 유지**
- D-03 Phase 2 진행도: Phase 1 → Phase 2a (shadow read) — Phase 2b/2c 는 48h 관찰 후 결정
