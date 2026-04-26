---
name: code-modification
description: Dev 에이전트 코드 수정 표준. 영향 분석(Phase 1)→수정(Phase 2)→검증(Phase 3)→티어링 판단(Phase 4). 타임아웃 체인/프롬프트 variant/게임룰 등 SSOT 특수 케이스 포함.
---

# Code Modification Standard (코드 수정 표준 절차)

> "생각 없이 고치면, 고친 것이 아니라 옮긴 것이다."

## Purpose

코드 수정 시 **분석 → 계획 → 구현 → 검증** 4단계를 반드시 거치게 하여,
맥락 없는 복붙 코딩을 방지하고 수정의 품질을 보장한다.

**적용 대상**: 모든 Dev 에이전트 (go-dev, node-dev, frontend-dev, ai-engineer, devops)

---

## Phase 1: 분석 (Analyze)

코드를 한 줄이라도 수정하기 **전에** 반드시 수행한다.

### 1.1 수정 대상 파악
- 수정할 파일과 함수를 **Read**로 전체 읽기 (해당 라인만 보지 말 것)
- 파일의 전체 구조와 수정 대상의 역할을 이해

### 1.2 파급 영향 분석
- 수정 대상을 **호출하는 쪽(caller)** 을 Grep으로 전수 검색
- 수정 대상이 **호출하는 쪽(callee)** 도 확인
- 인터페이스/타입 변경 시 구현체와 소비자 모두 확인
- 설정값 변경 시 환경변수, ConfigMap, Helm values까지 추적

### 1.3 기존 테스트 확인
- 수정 대상에 대한 기존 테스트가 있는지 Glob/Grep으로 탐색
- 테스트가 있으면 먼저 실행하여 현재 통과 상태 확인
- 테스트가 없으면 **반드시** 최소 1개 (happy path + 1개 엣지) 를 Phase 3 구현과 함께 추가한다.
  Phase 4 에서 새 테스트가 실제로 수정 대상을 커버하는지 `go test -run <이름>` / `jest -t "<이름>"` 등으로
  이름 지정 실행하여 확인한다. SonarQube 연결: 새 함수 커버리지가 60% 미만이면 Phase 4 FAIL.
- 신규 기능(= 기존 테스트가 전혀 없음)은 "추가 여부" 가 아니라 **추가 필수** — 테스트 없이 Phase 3 를 끝내지 않는다.

### 분석 결과 형식 (내부 정리용)
```
[수정 대상] 파일:함수 — 현재 동작
[호출자] N개소 — 파일:라인 목록
[피호출] 의존하는 함수/타입
[기존 테스트] 있음/없음 (파일명)
[파급 영향] 변경 시 영향받는 범위 요약
```

---

## Phase 2: 계획 (Plan)

분석 결과를 바탕으로 **수정 계획을 먼저 정리**한다. 코드 작성 전에 방향을 확정.

### 2.1 수정 계획 작성
- **무엇을** 변경하는가 (구체적 변경 내용)
- **왜** 변경하는가 (근본 원인, 요구사항)
- **어디까지** 변경하는가 (파급 범위 내 수정 목록)
- **어디는 건드리지 않는가** (의도적으로 변경하지 않는 것과 그 이유)

### 2.2 위험 체크
- [ ] 이 변경이 기존 API 계약을 깨는가?
- [ ] 이 변경이 다른 서비스(game-server ↔ ai-adapter ↔ frontend)에 영향을 주는가?
- [ ] 이 변경이 데이터 마이그레이션을 필요로 하는가?
- [ ] 이 변경이 환경변수/설정 변경을 동반하는가?

위험이 있으면 수정 범위에 포함하거나, 명시적으로 "이건 별도 처리 필요"라고 표기.

---

## Phase 3: 구현 (Implement)

계획에 따라 코드를 수정한다.

### 3.1 구현 원칙
- **계획에 있는 것만 수정** — 범위 밖 개선은 하지 않는다
- **한 파일씩 순서대로** — 의존 관계 순서를 따른다 (피호출 → 호출자)
- **타입/인터페이스 변경 시** — 구현체와 소비자를 반드시 동시에 수정
- **import 정리** — 추가한 import가 정확한지, 불필요한 import는 없는지 확인

### 3.2 동반 수정 체크
- 에러 코드/상태 코드 변경 → 프론트엔드 핸들러도 확인
- DTO/응답 형식 변경 → 소비자(caller) 파싱 로직도 확인
- 환경변수 추가/변경 → Helm values, ConfigMap, .env.example 동시 수정
- 테스트 spec에서 mock/assertion이 변경 내용과 불일치하면 수정

---

## Phase 4: 검증 (Verify)

구현 완료 후 반드시 수행한다. **빌드 통과만으로는 부족하다.**

### 4.1 빌드 확인
```bash
# Go
cd src/game-server && go build ./... && go vet ./...

# NestJS
cd src/ai-adapter && npm run build

# Frontend
cd src/frontend && npm run build
```

### 4.2 관련 테스트 실행

**테스트 범위 3단계 분류**

| 단계 | 범위 | 담당 | 언제 |
|------|------|------|------|
| ① 수정 파일 단위 | 변경한 함수/파일 직접 커버 테스트 | Dev (본 Phase 2/4 안) | **필수** — 매 수정마다 |
| ② 연결 경계 패키지 | caller/callee 가 속한 패키지 전체 | Dev (본 Phase 4) | **필수** — 아키텍트가 Phase 1 계획서에 지정 |
| ③ 전체 suite | 서비스 전체 테스트 + CI | QA (code-fix Phase 3) | 최종 회귀 |

- Go 는 전체 suite 가 30초 내에 끝나므로 code-fix Phase 3 에서 **항상 전체 실행** 한다.
- NestJS 는 80초 내에 끝나므로 동일하게 **항상 전체 실행** 한다.
- Frontend Playwright E2E 는 시간이 오래 걸리므로 `--grep` 으로 영향 범위만 먼저, 전체는 CI 위임.

- 수정한 파일의 테스트를 **반드시** 실행
- 테스트 실행 명령 예시:
```bash
# Go — 특정 패키지
cd src/game-server && go test ./internal/service/... -v -count=1

# NestJS — 특정 파일
cd src/ai-adapter && npx jest --testPathPattern="cost-limit" --no-cache

# Frontend — 특정 파일
cd src/frontend && npx jest --testPathPattern="api" --no-cache
```
- **테스트 실패 시 구현으로 돌아가서 수정** — 실패를 무시하고 넘어가지 않는다

### 4.3 셀프 리뷰
- 변경된 파일 목록 확인: `git diff --stat`
- 의도하지 않은 변경이 포함되지 않았는지 확인
- Phase 2의 계획과 실제 변경이 일치하는지 대조

### 4.4 롤백 준비

**적용 대상**: 설정/배포/DB 마이그레이션 변경. 단순 코드 수정은 `git revert <commit>` 한 줄만 명시하면 충분.

모든 수정 계획서(code-fix Phase 1 산출물) 및 구현 결과에는 다음 3가지가 명시되어야 한다:

1. **이전 상태 스냅샷 명령** — 변경 직전의 상태를 복구 가능하도록 저장
   ```bash
   # 예: ConfigMap
   kubectl get cm game-server-config -n rummikub -o yaml > /tmp/pre-change-game-server-config.yaml

   # 예: Helm values
   helm get values game-server -n rummikub > /tmp/pre-change-game-server-values.yaml

   # 예: DB 스키마
   pg_dump -s -t games rummikub > /tmp/pre-change-games-schema.sql
   ```

2. **원복 명령** — 문제가 발생했을 때 즉시 이전 상태로 되돌리는 명령
   ```bash
   # 예: ConfigMap 원복
   kubectl apply -f /tmp/pre-change-game-server-config.yaml

   # 예: 코드 원복
   git revert <commit-sha>

   # 예: Helm 롤백
   helm rollback game-server <previous-revision> -n rummikub
   ```

3. **롤백 실행 기준** — 어떤 지표/상황에서 롤백을 발동하는지 명시
   ```
   예: "대전 smoke test (30턴 N=1) 에서 fallback > 0 이면 즉시 원복"
   예: "배포 5분 내 P99 latency > 2x 이면 즉시 원복"
   예: "OAuth 로그인 실패율 > 1% 면 즉시 원복"
   ```

### Phase 4 티어링 (긴급도별 검증 범위)

상황에 따라 Phase 4 범위를 다음 3 티어로 조절할 수 있다:

| 티어 | 범위 | 언제 |
|------|------|------|
| **핫픽스 최소** | 수정 파일 빌드 + 수정 함수 단위 테스트 1개 + `git diff --stat` | 프로덕션 긴급 장애 (§예외 "긴급 핫픽스") |
| **표준** | 위 + 수정 패키지 전체 테스트 (§4.2 ② 연결 경계) | 기본값 — 모든 일반 수정 |
| **릴리스** | 위 + 전체 suite + CI 통과 + SonarQube + Trivy | 스프린트 마감, production 릴리스, 스키마 변경 |

"긴급 핫픽스" 로 핫픽스 최소 티어를 적용한 경우에도 **사후 24시간 내에 표준 티어로 재검증** 해야 한다.

---

## 위반 시 처리

이 절차를 건너뛰면 다음 문제가 발생한다:
- **분석 건너뛰기** → 참조자를 놓쳐 다른 곳에서 런타임 에러
- **계획 건너뛰기** → 범위를 넘는 불필요한 수정, 또는 범위 부족
- **검증 건너뛰기** → 빌드는 되지만 테스트 실패, 프로덕션 장애
- **롤백 준비 건너뛰기** → 사고 발생 시 원복 명령을 즉흥 작성 → 2차 장애

---

## 예외

다음 경우에는 절차를 축약할 수 있다 ("간소화" 의 정확한 정의는 `code-fix/SKILL.md` §스킵 가능 조건 참조):
- **오타/주석 수정**: Phase 1의 파급 영향 분석 생략 가능. 단, 주석이 API 계약/공개 문서라면 생략 금지.
- **설정값 변경**: Phase 1 **필수**. 단일 값처럼 보여도 SSOT 지점인지 먼저 확인
  (code-fix/SKILL.md §SSOT 매핑 참조). 타임아웃/프롬프트/모델/에이전트 모델은 전용 체크리스트로 즉시 라우팅.
  위 4종에 해당하지 않을 때에 한해 Phase 2 를 "수정 내용 + 이유 + 롤백 명령 3 줄" 로 축약 가능.
- **긴급 핫픽스**: Phase 1~2를 구두로 축약하되 SSOT 매핑은 생략 금지.
  Phase 4(검증)는 §Phase 4 티어링 "핫픽스 최소" 티어 적용, 사후 24h 내 표준 재검증.

### 특수 케이스: 메타 설정 변경 (4-Phase 와 별도 절차)

코드가 아닌 **에이전트 메타 설정** 을 바꾸는 경우, 본 SKILL 의 4-Phase 가 아닌
해당 영역 전용 체크리스트를 따른다. 해당 체크리스트는 소스코드 수정이 아니라
**SSOT 동기화** 에 초점을 둔다.

| 변경 대상 | 전용 체크리스트 |
|----------|----------------|
| 에이전트 모델 (`.claude/agents/*-agent.md` `model:` + `CLAUDE.md` §Agent Model Policy) | [`agent-model-change-checklist.md`](./agent-model-change-checklist.md) |
| 타임아웃 체인 (10개 지점) | `docs/02-design/41-timeout-chain-breakdown.md` §5 체크리스트 |
| 프롬프트 variant 환경변수 | `docs/02-design/42-prompt-variant-standard.md` §5 체크리스트 |
| 프롬프트 텍스트 (variant 내용) | `docs/02-design/42-prompt-variant-standard.md` 표 B + **empirical A/B smoke test ≥ 30턴 N=1 선행** |
| 게임 룰/엔진 로직 | `docs/02-design/31-game-rule-traceability.md` 추적성 매트릭스 |
| 에러 코드/메시지 | `docs/02-design/30-error-management-policy.md` |

> **프롬프트 텍스트 행 배경 (2026-04-16 Day 5 근거)**: v4 prompt 변경이 reasoning_tokens 을 −25% 감소시키는 설계였으나
> 실제로는 tiles_placed 까지 동반 감소하는 regression 이 발생. 설계 시점에 예측 불가능한 행동 변화를
> A/B smoke (30턴 N=1) 로 조기 감지한다.

---

## 개정 이력

- **2026-04-17**: P0/P1/P2 15건 일괄 개정 (리뷰어: architect + qa, 반영: architect).
  SSOT 매핑 / 롤백 준비 / SKILL 진화 트리거 / 테스트 3단계 / 설정값 스킵 제거 /
  재수정 루프 상한 / Mermaid 분기 확장 / Sonnet Dev 자기이해도 / 계획서 승인 체크 /
  신규 기능 테스트 / 프롬프트 텍스트 변경 / batch-battle 교차 / CI 경계 / QA 피드백 경로 / Phase 4 티어링.
  본 파일에는 이 중 §1.3 (신규 기능 테스트), §4.2 (테스트 3단계), §4.4 (롤백 준비),
  §Phase 4 티어링, §예외 (설정값 스킵 제거, 프롬프트 텍스트 행 추가, 게임룰/에러코드 행 추가),
  §위반 시 처리 (롤백 건너뛰기 추가) 가 반영됐다. 나머지 프로세스 항목은 `code-fix/SKILL.md` 에 있음.
