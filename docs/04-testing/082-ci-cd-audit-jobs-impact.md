# 80. CI/CD 의존성 감사 잡 3건 영향도 분석 및 Day 3 구현 계획서

- **작성일**: 2026-04-23 (Sprint 7 Day 2 작성, Day 3 2026-04-24 구현 착수 대비)
- **작성자**: architect (Opus 4.7 xhigh)
- **목적**: GitLab CI 에 의존성 감사 잡 3건(`sca-npm-audit`, `sca-govulncheck`, `weekly-dependency-audit`) 신규 추가 전 사전 영향도 분석 + YAML 초안 확정 + 파이프라인 duration/캐시/Fail 정책 점검
- **선행 근거**:
  - `docs/04-testing/70-sec-rev-013-dependency-audit-report.md` §6 — SCA 게이트 제안 원본 (1차 초안 포함)
  - `docs/04-testing/78-sec-a-b-c-audit-delta.md` §7.2 #10 — Sprint 7 W1~W2 후속 조치로 등재
- **모드**: Read-only + write docs. `.gitlab-ci.yml` 수정 / 커밋 금지. 구현은 Day 3 devops 가 담당
- **범위**: 3잡 모두 `quality` stage (기존 초안은 `scan` 이었으나 현 CI 에는 scan 스테이지 없음 — 본 분석에서 정정)

---

## 1. Executive Summary

| ID | 잡 이름 | 스테이지 | 목적 | 판정 | 예상 duration (cold / warm) |
|----|--------|---------|------|------|-------------------------------|
| **J1** | `sca-npm-audit` | quality | 3개 Node 프로젝트 production dependency High/Critical=0 강제 | **PROCEED** | ~2m / ~45s |
| **J2** | `sca-govulncheck` | quality | game-server code-called 취약점 차단 | **PROCEED** | ~3m / ~1m |
| **J3** | `weekly-dependency-audit` | quality (schedule only) | 주 1회 prod+dev LOW 포함 드리프트 스캔 + artifact 리포트 | **PROCEED** | ~4m (전수 LOW 포함) |

**3잡 모두 Day 3 구현 착수 가능**. 주의점 3가지:

1. **스테이지 배치는 `quality`** — 70번 §6 원본 초안도 `quality` 였으나 사용자 프롬프트 배경에는 "scan (또는 quality)" 로 표기됨. 현 `.gitlab-ci.yml` 은 스테이지 5개 (`lint|test|quality|build|update-gitops`) 로 `scan` 스테이지가 **없다**. Trivy 이미지 스캔은 `build` 스테이지에서 `scan-*` 잡으로 실행된다. 따라서 **본 분석은 `quality` 로 확정**한다. `scan` 스테이지 신설은 본 PR 범위 초과.
2. **Fail 정책 이원화** — `sca-npm-audit` + `sca-govulncheck` = strict (`allow_failure: false`), `weekly-dependency-audit` = warn-only (`allow_failure: true`).
3. **파이프라인 duration 순증 최소** — 두 PR 잡은 `quality` 에 병렬 추가되므로 기존 critical path (`sonarqube` ~20m) 를 **증가시키지 않는다**. 실제 wall-clock 순증 0m (sonarqube < 20m 종료 전 완료).

---

## 2. 기존 CI/CD 구조 요약 + 추가 위치

### 2.1 현재 스테이지 + 잡 인벤토리 (`.gitlab-ci.yml` 659 lines 기준)

```
stages:
  - lint        # 5 jobs: lint-go, lint-nest, lint-frontend, lint-admin, rule-matrix-check
  - test        # 2 jobs: test-go, test-nest
  - quality     # 2 jobs: sonarqube (needs test-*), trivy-fs
  - build       # 8 jobs: build-* (4) + scan-* (4) — build-kaniko + trivy image scan
  - update-gitops  # 1 job: update-gitops (needs all builds+scans)
```

총 **17잡** (MEMORY.md 상 "Pipeline #113: 17/17 PASS" 와 일치). quality 에 J1+J2 추가 → **19잡**.

### 2.2 기존 감사/보안 커버리지

| 도구 | 잡 | 커버리지 도메인 | 본 신규 잡과의 중복 |
|-----|----|---------------|------------------|
| **Trivy FS** (`trivy-fs`) | quality | 파일시스템 OS 패키지 + lockfile | ⚠️ lockfile 커버 일부 중복. 그러나 `trivy fs` 는 lockfile-level advisory DB 기반, `npm audit` 은 npm registry advisory DB 기반 — **advisory source 상이**. Defense-in-depth 관점 유지 권장 |
| **Trivy Image** (`scan-*`) | build | 빌드된 컨테이너 이미지 | 이미지 빌드 **후** 스캔. J1/J2 는 빌드 **전** 게이트 → 시점 상이 |
| **SonarQube** (`sonarqube`) | quality | SAST (코드 품질+일부 보안 버그) | 의존성 취약점은 커버 안 함 — **중복 없음** |
| (없음) | — | npm registry advisory code-called 게이트 | J1 **신규** |
| (없음) | — | Go stdlib + module code-called 게이트 | J2 **신규** |

**결론**: J1+J2 는 Trivy 와 일부 도메인 중복이나 **advisory source 와 검사 시점이 다르므로 defense-in-depth 에 해당**. 제거 대상 아님.

### 2.3 추가 위치

```
stages:
  - lint
  - test
  - quality       ← J1 (sca-npm-audit), J2 (sca-govulncheck), J3 (weekly-dependency-audit) 추가
  - build
  - update-gitops
```

`quality` stage 는 현재 `sonarqube` + `trivy-fs` 2잡뿐이다. J1/J2 병렬 추가 시 **sonarqube 의 20m timeout 이 critical path** 이므로 wall-clock 증가 없음.

---

## 3. J1 — `sca-npm-audit` YAML 초안 + 설명

### 3.1 설계 의도

- **3개 Node 프로젝트** (`ai-adapter`, `frontend`, `admin`) 각각 `npm audit --audit-level=high --omit=dev` 실행.
- production dependency 에서 **High/Critical 1건이라도 발견되면 실패** (`allow_failure: false`).
- dev dependency 는 본 잡에서 검증하지 않음 (J3 scheduled 잡에서 warn-only 로 커버).
- `npm ci` 는 **lockfile 만 인스톨** — `.gitlab-ci.yml` 의 `npm_config_cache: /cache/npm` 덕분에 PVC 재사용.

### 3.2 YAML 초안

```yaml
# =============================================================================
# SCA (Software Composition Analysis) — Node 프로젝트 production 의존성 게이트
# =============================================================================
#
# 목적:
#   ai-adapter / frontend / admin 의 production dependency 에서 High/Critical
#   취약점을 0 으로 강제한다. 새 CVE 드리프트를 매 MR/푸시마다 차단.
#
# 근거: docs/04-testing/70-sec-rev-013-dependency-audit-report.md §6
#       docs/04-testing/78-sec-a-b-c-audit-delta.md §7.2 #10
#       docs/04-testing/80-ci-cd-audit-jobs-impact.md (본 설계서)
#
# Fail 정책:
#   --audit-level=high --omit=dev → exit 1 이면 production High+ 존재.
#   allow_failure: false 로 파이프라인 실패 게이트화.
#
# dev dependency:
#   본 잡에서는 검증 안 함 (SEC-C 머지 후에도 typescript-eslint High 잔존).
#   weekly-dependency-audit 잡에서 warn-only 로 커버.
#
# 캐시:
#   npm_config_cache=/cache/npm (전역 variables) → PVC 재사용. cold ~2m / warm ~45s.

sca-npm-audit:
  stage: quality
  <<: *local-runner
  timeout: 10m
  image: node:22-alpine
  script:
    # 3개 프로젝트 순차 실행. 하나라도 High+ 발견 시 전체 실패.
    # || (echo FAIL; exit 1) 은 script 라인별 실패를 명확히 로그에 표시.
    - cd src/ai-adapter && npm ci --prefer-offline --no-audit && npm audit --audit-level=high --omit=dev
    - cd "$CI_PROJECT_DIR/src/frontend" && npm ci --prefer-offline --no-audit && npm audit --audit-level=high --omit=dev
    - cd "$CI_PROJECT_DIR/src/admin" && npm ci --prefer-offline --no-audit && npm audit --audit-level=high --omit=dev
  allow_failure: false
  rules:
    - if: $CI_PIPELINE_SOURCE == "merge_request_event"
    - if: $CI_COMMIT_BRANCH == "main"
    - if: $CI_COMMIT_BRANCH == "develop"
  interruptible: true
```

### 3.3 설계 결정 근거

| 결정 | 값 | 근거 |
|------|----|------|
| Stage | `quality` | 70번 §6 원본 + 기존 구조 존중 |
| Image | `node:22-alpine` | 기존 `lint-nest`, `test-nest`, `lint-frontend`, `lint-admin` 와 동일 — Pod 재사용 캐시 히트 |
| Timeout | 10m | cold 예상 ~2m + 안전 margin |
| Runner | `*local-runner` | 기존 패턴. 공유 runner 금지 원칙 |
| `--prefer-offline` | 포함 | PVC 캐시 히트 시 네트워크 skip |
| `--no-audit` (ci) | 포함 | `npm ci` 자체 audit 을 생략하고 명시적 `npm audit` 으로 game-plan 분리 |
| `--omit=dev` | 포함 | 본 잡은 production 게이트. dev 는 J3 |
| `--audit-level=high` | 포함 | production High/Critical = 0 정책 (78번 §4.4 기준) |
| `allow_failure` | `false` | Fail 정책: production High 는 절대 허용 안 함 |
| `interruptible` | `true` | MR 재푸시 시 이전 파이프 cancel |

### 3.4 예상 duration

| 단계 | cold (캐시 미스) | warm (캐시 히트) |
|-----|---------------|---------------|
| image pull (node:22-alpine) | ~15s | 0s (re-use) |
| ai-adapter `npm ci` + audit | ~60s + 5s | ~20s + 3s |
| frontend `npm ci` + audit | ~45s + 4s | ~15s + 3s |
| admin `npm ci` + audit | ~30s + 3s | ~10s + 3s |
| **합계** | **~162s (2m42s)** | **~54s** |

현 `sonarqube` 잡이 20m timeout (실측 ~10~15m) critical path 이므로 wall-clock 순증 **0m**.

### 3.5 예상 실패 시나리오 (Day 3 착수 시점)

**중요**: J1 은 SEC-A/B/C 머지 전에 추가하면 현 상태 **자동 FAIL** 예정.

- ai-adapter: `axios 1.14.0` High 2건 (SEC-C 미머지 시)
- frontend: `next 15.2.9` High (SEC-B 미머지 시)
- admin: `next 16.1.6` High (SEC-B 미머지 시)

→ **SEC-A/B/C 3건 모두 머지 완료 후 본 잡 추가 권장**. Day 3 실행 시점에는 Day 2 머지 완료 전제.

---

## 4. J2 — `sca-govulncheck` YAML 초안 + 설명

### 4.1 설계 의도

- game-server Go 코드에 `govulncheck -mode=source ./...` 실행 → code-called 취약점만 실패로 간주.
- 78번 §2.8 결론: `toolchain go1.25.9` directive 포함 상태에서 code-called=0 달성.
- SEC-A 머지 전 추가하면 **19건 code-called 로 자동 FAIL**. Day 2 머지 완료 전제.

### 4.2 YAML 초안

```yaml
# =============================================================================
# SCA — game-server Go code-called 취약점 게이트
# =============================================================================
#
# 목적:
#   `govulncheck -mode=source` 는 실제 호출 그래프에 있는 취약점만 보고한다
#   (imported-but-unreachable 는 무시). 따라서 false positive 최소화 + 실 exploit
#   가능성 있는 취약점만 파이프라인 차단 게이트로 기능.
#
# 근거: docs/04-testing/78-sec-a-b-c-audit-delta.md §2.3 (stdlib 19건 code-called)
#       docs/04-testing/70-sec-rev-013-dependency-audit-report.md §6.3 #3
#
# SEC-A 머지 전제:
#   go.mod 의 `toolchain go1.25.9` directive + Docker `golang:1.25.9-alpine` pin
#   상태에서 code-called=0 달성. 본 잡은 SEC-A 머지 후 추가.
#
# 캐시:
#   GOMODCACHE=/cache/go/mod + GOCACHE=/cache/go/build (전역 variables) 재사용.

sca-govulncheck:
  stage: quality
  <<: *local-runner
  timeout: 10m
  image: golang:1.25.9-alpine   # SEC-A pin 과 일치
  variables:
    GOFLAGS: "-buildvcs=false"
    GOGC: "50"
  before_script:
    - apk add --no-cache gcc musl-dev git
  script:
    - cd src/game-server
    - go install golang.org/x/vuln/cmd/govulncheck@v1.2.0
    # -mode=source: 실 호출 그래프만. imported-but-unreachable 는 스킵.
    # exit code != 0 이면 code-called 취약점 존재 → 파이프라인 실패.
    - govulncheck -mode=source ./...
  allow_failure: false
  rules:
    - if: $CI_PIPELINE_SOURCE == "merge_request_event"
    - if: $CI_COMMIT_BRANCH == "main"
    - if: $CI_COMMIT_BRANCH == "develop"
  interruptible: true
```

### 4.3 설계 결정 근거

| 결정 | 값 | 근거 |
|------|----|------|
| Stage | `quality` | J1 과 동일 스테이지 → 병렬 실행 |
| Image | `golang:1.25.9-alpine` | 78번 §2.7 권고 pin. `lint-go`/`test-go` 의 `golang:1.25-alpine` 과 분리하지 않고 Day 2 SEC-A 머지 시 함께 pin 변경하는 것도 대안 |
| govulncheck 버전 | `@v1.2.0` | 78번 리포트 실행 버전 — 재현성 |
| `-mode=source` | 포함 | false positive 최소화. 70번 §6.3 #3 |
| `GOFLAGS=-buildvcs=false` | 포함 | CI git info 경고 억제 (기존 `lint-go` 와 동일) |
| `GOGC=50` | 포함 | 16GB RAM 제약 대응 |
| `allow_failure` | `false` | strict 게이트 |

### 4.4 예상 duration

| 단계 | cold | warm |
|-----|-----|-----|
| image pull (golang:1.25.9-alpine) | ~20s | 0s |
| apk add gcc musl-dev git | ~10s | 0s (layer) |
| `go install govulncheck` | ~45s | ~5s (GOMODCACHE hit) |
| `govulncheck -mode=source ./...` | ~120s | ~40s |
| **합계** | **~195s (3m15s)** | **~45s** |

### 4.5 SEC-A 상태 의존 — 머지 순서 중요

**반드시 다음 순서 준수**:
1. Day 2: SEC-A 머지 (`toolchain go1.25.9` + Docker pin 포함)
2. Day 3 Morning: SEC-A 머지 후 `main` 브랜치에서 로컬 `govulncheck -mode=source ./...` → code-called=0 확인
3. Day 3: 본 잡 (J1+J2) 추가 PR 생성 → 파이프라인 GREEN 확인 → 머지

**역순으로 하면** Day 2 SEC-A 미머지 상태에서 J2 추가 시 code-called 19건으로 파이프라인 즉시 RED.

---

## 5. J3 — `weekly-dependency-audit` YAML 초안 + 설명

### 5.1 설계 의도

- **주 1회 (월요일 09:00 KST)** 전체 의존성 드리프트 스캔.
- production + dev 모두 + LOW severity 포함 → **리포트 only**. 빌드 실패 안 시킴 (`allow_failure: true`).
- artifact 로 JSON 리포트 보관 → 매주 드리프트 추이 수동 분석.
- **통지**: MEMORY.md "카카오톡 API (Slack 아님)" — 본 잡 자체는 통지 미포함. 별도 notification 인프라 구축 후 추가.
- **GitLab Schedules** UI 에서 `AUDIT_SCHEDULE=weekly` variable 설정 + cron `0 0 * * 1` (월 00:00 UTC = 월 09:00 KST) 로 트리거.

### 5.2 YAML 초안

```yaml
# =============================================================================
# 주간 의존성 드리프트 스캔 — scheduled only
# =============================================================================
#
# 목적:
#   주 1회 전체 의존성 (prod + dev + LOW) 드리프트 리포트. 새 CVE 공개 감지용.
#   사례: 70번 §7 — 6일 사이 Go stdlib 에 GO-2026 계열 8건 신규 공개되어
#   code-called 취약점이 8건 → 25건으로 3배 증가. 정적 1회 audit 만으로는
#   드리프트를 막을 수 없어 주간 감사 필수.
#
# 근거: docs/04-testing/70-sec-rev-013-dependency-audit-report.md §6.3 #4
#       docs/04-testing/78-sec-a-b-c-audit-delta.md §7.2 #10
#
# 트리거:
#   GitLab UI → Build → Pipeline schedules → "Weekly dependency audit"
#   - Cron: `0 0 * * 1` (월 00:00 UTC = 월 09:00 KST)
#   - Target branch: main
#   - Variable: AUDIT_SCHEDULE=weekly
#
# Fail 정책:
#   allow_failure: true — 빌드 차단 안 함. 리포트만.
#   운영자가 매주 월요일 오전 artifact 다운로드 후 triage.
#
# 통지 (Phase 2):
#   카카오톡 API 통합 후 High+ 발견 시 자동 알림 추가 예정.

weekly-dependency-audit:
  stage: quality
  <<: *local-runner
  timeout: 15m
  image: node:22-alpine
  before_script:
    - apk add --no-cache go git
  script:
    - mkdir -p audit-reports
    # Node.js 3 프로젝트 — prod + dev + LOW 포함 JSON 리포트
    - cd src/ai-adapter && npm ci --prefer-offline --no-audit
    - npm audit --audit-level=low --json > "$CI_PROJECT_DIR/audit-reports/ai-adapter-full.json" || true
    - npm audit --audit-level=low --omit=dev --json > "$CI_PROJECT_DIR/audit-reports/ai-adapter-prod.json" || true
    - cd "$CI_PROJECT_DIR/src/frontend" && npm ci --prefer-offline --no-audit
    - npm audit --audit-level=low --json > "$CI_PROJECT_DIR/audit-reports/frontend-full.json" || true
    - npm audit --audit-level=low --omit=dev --json > "$CI_PROJECT_DIR/audit-reports/frontend-prod.json" || true
    - cd "$CI_PROJECT_DIR/src/admin" && npm ci --prefer-offline --no-audit
    - npm audit --audit-level=low --json > "$CI_PROJECT_DIR/audit-reports/admin-full.json" || true
    - npm audit --audit-level=low --omit=dev --json > "$CI_PROJECT_DIR/audit-reports/admin-prod.json" || true
    # Go — govulncheck JSON 리포트
    - cd "$CI_PROJECT_DIR/src/game-server"
    - go install golang.org/x/vuln/cmd/govulncheck@v1.2.0
    - govulncheck -mode=source -json ./... > "$CI_PROJECT_DIR/audit-reports/govulncheck.json" || true
    # 요약 출력 (파이프라인 로그 확인 용도)
    - cd "$CI_PROJECT_DIR"
    - echo "=== Summary ==="
    - for f in audit-reports/*.json; do echo "$f size=$(wc -c < $f)"; done
  artifacts:
    name: "weekly-audit-$CI_COMMIT_SHORT_SHA-$CI_PIPELINE_ID"
    paths:
      - audit-reports/
    expire_in: 90 days
    when: always
  allow_failure: true
  rules:
    - if: $CI_PIPELINE_SOURCE == "schedule" && $AUDIT_SCHEDULE == "weekly"
  interruptible: false
```

### 5.3 설계 결정 근거

| 결정 | 값 | 근거 |
|------|----|------|
| Stage | `quality` | 다른 scheduled 잡 없음. quality 배치 유지 (구조 일관) |
| Image | `node:22-alpine` + `apk add go` | Node+Go 동시 실행 위해 Node 이미지에 Go 설치 (별도 잡 분리 가능하나 artifact 일원화 위해 병합) |
| Timeout | 15m | 4단계 npm audit + govulncheck JSON dump 여유 포함 |
| `\|\| true` | 모든 audit 뒤 | High 발견해도 artifact 수집 계속 |
| `allow_failure` | `true` | 리포트 only. 빌드 차단 안 함 |
| Artifact | JSON + 90일 보존 | 주간 드리프트 추이 분석용 |
| Rules | `schedule + AUDIT_SCHEDULE=weekly` | GitLab Schedule variable 로 명시적 트리거. MR/push 에서는 실행 안 됨 |
| `interruptible` | `false` | scheduled 잡은 중단 불가 (다음 schedule 까지 1주) |

### 5.4 Scheduled Pipeline 설정 (UI 단계)

devops 담당자가 Day 3 실행 시 GitLab 웹 UI 에서 설정:

1. **Settings → CI/CD → Schedules → "New schedule"**
   - Description: `Weekly dependency audit`
   - Interval Pattern: `0 0 * * 1` (매주 월 00:00 UTC = 09:00 KST)
   - Cron Timezone: `UTC` (또는 `Seoul` — GitLab 지원)
   - Target branch: `main`
   - Variables: `AUDIT_SCHEDULE` = `weekly`
   - Activated: ✅
2. 최초 1회 수동 `Play` 로 검증 → artifact 확인.

### 5.5 예상 duration

| 단계 | 예상 |
|-----|-----|
| image pull + apk add | ~30s |
| ai-adapter ci+audit×2 | ~90s |
| frontend ci+audit×2 | ~70s |
| admin ci+audit×2 | ~50s |
| go install + govulncheck | ~80s |
| artifact 업로드 | ~10s |
| **합계** | **~330s (5m30s)** |

주간 1회 실행이므로 파이프라인 총량 기여도 무시할 수준.

---

## 6. 캐시 / Runner / 리소스 영향 분석

### 6.1 PVC `/cache` 공유 분석

현 CI 는 `/cache` PVC 2Gi 를 모든 잡이 공유한다 (`.gitlab-ci.yml` line 47~58).

| 캐시 키 | 기존 소비 | J1 추가 소비 | J2 추가 소비 | J3 추가 소비 | 합산 위험 |
|--------|---------|-----------|-----------|-----------|---------|
| `/cache/npm` | lint-nest / lint-frontend / lint-admin / test-nest 공유 | +0 (동일 lockfile, 신규 패키지 없음) | 0 | +0 | **위험 없음** |
| `/cache/go/mod` | lint-go / test-go | 0 | +`govulncheck` 모듈 ~30MB | 동일 | 미미 |
| `/cache/go/build` | test-go | 0 | +source 분석 캐시 ~100MB | 동일 | 미미 |
| `/cache/trivy` | trivy-fs / scan-* | 0 | 0 | 0 | 영향 없음 |

**결론**: 2Gi PVC 여유 있음 (현재 ~700MB 사용 추정). J2 govulncheck 추가로 ~150MB 증가 → 총 850MB, 여전히 60% 여유.

### 6.2 K8s Runner Pod 메모리 (2Gi limit)

MEMORY.md 상 "K8s Executor (cicd NS), Pod 2Gi". 동시 실행 가능성 점검:

- J1 `sca-npm-audit` peak: npm ci 시 ~400MB (Node heap + patch unpack)
- J2 `sca-govulncheck` peak: `govulncheck -mode=source` 시 ~800MB (전체 패키지 build+분석)
- J3 `weekly-dependency-audit` peak: Node + Go 동시 실행 ~1.2GB

**병렬 실행 시나리오**:
- J1 + J2 동시 실행 (quality stage 병렬) → peak ~1.2GB → **안전** (Runner 2Gi 내)
- quality stage 기존 잡: `sonarqube` peak ~800MB (JVM 384m + Node 256m + overhead). 세 잡 동시 실행 → ~2.0GB → **빠듯하나 가능** (GOGC=50 + NODE_OPTIONS=256m 설정 덕분)

**리스크**: `sonarqube` + J1 + J2 동시 peak 겹치면 OOM 가능. 완화책:
- (a) J2 `needs: []` 명시로 sonarqube 완료 후 실행 (직렬화, duration +3m)
- (b) 현 상태 유지 (병렬, 낮은 확률 OOM)

**권고**: 초기 배포는 **(b) 병렬**, 실측 후 OOM 관측 시 **(a) 직렬화** 로 후속 조정.

### 6.3 Kaniko 빌드 잡과의 충돌

Kaniko 빌드 잡 (`build-*`) 은 **build** 스테이지. J1/J2 는 **quality** 스테이지 → 직렬 실행. **충돌 없음**.

---

## 7. Fail 정책 매트릭스

| 잡 | severity 기준 | `allow_failure` | 실패 시 영향 | 해소 경로 |
|---|-------------|----------------|-----------|---------|
| J1 `sca-npm-audit` | High+ production | `false` | 머지 차단 | `npm audit fix` 또는 `npm install <pkg>@patched` + lockfile 커밋 |
| J2 `sca-govulncheck` | code-called (`-mode=source`) | `false` | 머지 차단 | `go.mod` bump (패치 버전) 또는 call path 제거 |
| J3 `weekly-dependency-audit` | LOW+ (모든 범위) | `true` | 리포트만 (운영자 triage) | 다음 주 PR 로 배치 수정 |

**원칙 (70번 §6.3 유지)**:
1. production High/Critical = 0 강제 (J1)
2. code-called = 0 강제 (J2)
3. dev + LOW drift 는 warn-only, 주간 리포트 (J3)
4. 3도구 합의 (Trivy + npm audit + govulncheck) = defense-in-depth

---

## 8. Verification Plan — Day 3 착수 시 dry-run

### 8.1 로컬 사전 검증 (브랜치 생성 전)

```bash
# 1. SEC-A 머지 완료 + toolchain directive 확인
cd src/game-server
grep -E "^go |^toolchain " go.mod
#   go 1.25
#   toolchain go1.25.9   ← 있어야 함

# 2. J1 로컬 reproduce
cd src/ai-adapter && npm ci --prefer-offline --no-audit && npm audit --audit-level=high --omit=dev
# exit 0 기대 (SEC-C 머지 후)

cd ../frontend && npm ci --prefer-offline --no-audit && npm audit --audit-level=high --omit=dev
# exit 0 기대 (SEC-B 머지 후)

cd ../admin && npm ci --prefer-offline --no-audit && npm audit --audit-level=high --omit=dev
# exit 0 기대 (SEC-B 머지 후)

# 3. J2 로컬 reproduce
cd ../game-server
go install golang.org/x/vuln/cmd/govulncheck@v1.2.0
govulncheck -mode=source ./...
# exit 0 + code-called=0 기대 (SEC-A 머지 후)

# 4. J3 드라이런 (수동 트리거 상당)
mkdir -p /tmp/audit-reports
cd src/ai-adapter && npm audit --audit-level=low --json > /tmp/audit-reports/ai-adapter-full.json || true
# (나머지 반복)
```

**모든 dry-run 통과 후** Day 3 구현 PR 생성.

### 8.2 CI dry-run (PR 단계)

1. `feature/sprint7-ci-audit-jobs` 브랜치 생성
2. `.gitlab-ci.yml` 에 J1+J2+J3 추가 (본 §3/§4/§5 YAML 그대로)
3. PR 생성 → MR pipeline 실행
4. 기대 결과:
   - J1 (`sca-npm-audit`): GREEN (~2m)
   - J2 (`sca-govulncheck`): GREEN (~3m)
   - J3 (`weekly-dependency-audit`): **실행 안 됨** (rule: schedule only)
   - 기존 17잡 모두 GREEN 유지
5. GitLab UI → Schedules → "Weekly dependency audit" 생성 → `Play` 수동 트리거 → artifact 확인
6. artifact download → JSON 리포트 구조 검증
7. Day 3 마감 직전 머지

### 8.3 Fail 시나리오 테스트 (선택)

J1/J2 의 `allow_failure: false` 정책 검증을 위해 의도적 RED PR 1건 생성 가능:
- (a) `ai-adapter/package.json` 에 `"uuid": "9.0.0"` (known High) 추가 → J1 RED 확인 → revert
- (b) game-server 에 취약 stdlib call path 추가 → J2 RED → revert

권장은 **(a)만 수행**. (b) 는 로컬 govulncheck 로 이미 검증됨.

---

## 9. Risk Budget + Rollback 절차

### 9.1 Risk 매트릭스

| Risk | Probability | Impact | 완화책 |
|-----|-----------|-------|------|
| SEC-A/B/C 미머지 상태에서 J1/J2 추가 → 즉시 RED | HIGH (순서 위반 시) | HIGH (main 차단) | 구현 순서 §4.5 엄수 + PR description 에 SEC-A/B/C 머지 확인 체크박스 |
| npm registry advisory 새 High 공개 → 갑작스런 RED | MEDIUM | MEDIUM | 머지 직전 재실행 + J3 가 월요일 드리프트 사전 감지 |
| govulncheck v1.2.0 → 신버전 결과 변화 | LOW | LOW | 버전 pin (`@v1.2.0`) 유지. 6개월마다 수동 bump |
| 2Gi Runner OOM (sonarqube + J1+J2 동시) | LOW | MEDIUM | 6.2절 완화책 (a) 직렬화 fallback |
| Scheduled 잡 설정 실수 (cron/variable 미설정) | MEDIUM | LOW | Day 3 체크리스트 §5.4 명시 + 최초 1회 수동 Play 검증 |
| J3 artifact 가 2Gi PVC 소진 | LOW | LOW | expire_in 90일 + GitLab job artifact retention 정책 |

### 9.2 Rollback 절차

J1/J2/J3 추가 이후 문제 발생 시:

**Option A — 잡 비활성화 (빠른 hotfix)**:
```yaml
# .gitlab-ci.yml 해당 잡의 rules 를 never 로 교체 (임시 차단)
sca-npm-audit:
  rules:
    - when: never   # ← 임시 비활성화
```
→ 커밋 + 푸시 → 파이프라인 skip. 원인 분석 후 복구.

**Option B — allow_failure 완화**:
```yaml
sca-npm-audit:
  allow_failure: true   # ← strict → warn-only 강등
```
→ 긴급 상황에만 사용. 보안 게이트 상실 주의.

**Option C — revert 커밋**:
```bash
git revert <sprint7-ci-audit-jobs-PR-merge-commit>
git push
```
→ 완전 원복. 후속 재도입 필요.

**권고**: 대부분의 문제는 **Option A** 로 대응. B/C 는 최후 수단.

---

## 10. Day 3 실행 시 예상 파이프라인 duration 변화

### 10.1 기존 baseline (Pipeline #113 기준 추정)

| Stage | Jobs | Wall-clock (parallel) |
|-------|------|--------------------|
| lint | 5 | ~3m (longest: lint-go 3m) |
| test | 2 | ~4m (longest: test-go 4m) |
| quality | 2 | ~15m (longest: sonarqube 15m) |
| build | 8 (4 build + 4 scan, Phase 직렬) | ~25m (cold) / ~8m (warm) |
| update-gitops | 1 | ~1m |
| **Total critical path** | — | **~48m (cold) / ~31m (warm)** |

### 10.2 J1+J2 추가 후 (PR/main pipeline)

| Stage | Jobs | Wall-clock |
|-------|------|-----------|
| lint | 5 | ~3m |
| test | 2 | ~4m |
| **quality** | **4** (sonarqube, trivy-fs, **sca-npm-audit**, **sca-govulncheck**) | **~15m (sonarqube 여전히 longest, J1/J2 병렬)** |
| build | 8 | ~25m / ~8m |
| update-gitops | 1 | ~1m |
| **Total critical path** | — | **~48m / ~31m** — **순증 0m** |

### 10.3 J3 추가 후 (scheduled pipeline only)

| Stage | Jobs | Wall-clock |
|-------|------|-----------|
| quality | 1 (weekly-dependency-audit only) | ~5m30s |
| **Total** | — | **~6m** (scheduled 전용, MR/push 와 별개) |

### 10.4 결론

- **PR/push 파이프라인**: critical path 순증 **0m** (sonarqube 가 여전히 longest).
- **Scheduled 파이프라인**: 주 1회 ~6m 신규 실행. 기존 파이프라인에 영향 없음.
- Runner 점유 시간 증가: PR 당 최대 +5m (J1+J2 병렬 wall-clock, Runner slot 관점).
- **총 CI 비용 증가 미미**. 보안 게이트 강화 이득이 훨씬 큼.

---

## 11. Day 3 실행 체크리스트 (devops 용)

- [ ] **전제**: Day 2 SEC-A/B/C 3개 PR 모두 머지 완료 + main GREEN 확인
- [ ] **전제**: `src/game-server/go.mod` 에 `toolchain go1.25.9` 라인 존재 확인
- [ ] §8.1 로컬 dry-run 4단계 모두 exit 0 확인
- [ ] 브랜치 `feature/sprint7-ci-audit-jobs` 생성
- [ ] `.gitlab-ci.yml` 에 J1 (`sca-npm-audit`) 추가 — 본 문서 §3.2 YAML
- [ ] `.gitlab-ci.yml` 에 J2 (`sca-govulncheck`) 추가 — 본 문서 §4.2 YAML
- [ ] `.gitlab-ci.yml` 에 J3 (`weekly-dependency-audit`) 추가 — 본 문서 §5.2 YAML
- [ ] PR 생성 + description 에 "근거: docs/04-testing/80" 링크
- [ ] MR pipeline → J1+J2 GREEN, J3 skip 확인 (§8.2 기대 결과)
- [ ] GitLab UI → Schedules → "Weekly dependency audit" 등록 (§5.4)
- [ ] Schedule 수동 Play 1회 → artifact 확인
- [ ] PR 리뷰 + 머지
- [ ] Sprint 7 TODO 에서 "CI 감사 잡 3건 추가" 항목 ✅ 처리
- [ ] MEMORY.md 갱신 ("Pipeline #XXX: lint(5) + test(2) + quality(**4**) + build(8) + gitops(1) = **20/20 GREEN**")

---

## 12. 후속 조치 (Sprint 7 W2+)

| # | 조치 | 담당 | 근거 |
|---|------|------|------|
| 1 | 카카오톡 API 통지 통합 (J3 High+ 발견 시 자동 알림) | devops + backend | MEMORY.md Tech Stack "카카오톡 API" |
| 2 | J3 artifact 를 GitOps repo 에 주간 커밋 (장기 추이 추적) | devops | 90일 이후 artifact 만료 대비 |
| 3 | J2 `-mode=binary` 병행 (빌드 이미지 대상) → Trivy 이미지 스캔과 삼각측량 | security | defense-in-depth 강화 |
| 4 | 4도구 합의 대시보드 (Trivy + npm audit + govulncheck + Snyk?) | security + devops | Snyk 도입 타당성 ADR 선행 |
| 5 | govulncheck DB 갱신 검증 (최소 주 1회 latest 보장) | devops | stdlib 신규 CVE 감지 지연 방지 |

---

## 13. 부록 A — 참조

- `.gitlab-ci.yml` line 35~40 (stages), line 62~65 (`*local-runner`), line 43~58 (cache variables)
- `docs/04-testing/70-sec-rev-013-dependency-audit-report.md` §6 (원본 초안)
- `docs/04-testing/78-sec-a-b-c-audit-delta.md` §7.2 #10 (Sprint 7 W1~W2 후속 조치 등재)
- `docs/04-testing/75-sec-day12-impact-and-plan.md` §2.2 (Verification 원칙)
- MEMORY.md "CI/CD 파이프라인 현황" 섹션 (Pipeline #113, 17/17)
- GitLab docs — Pipeline Schedules: https://docs.gitlab.com/ee/ci/pipelines/schedules.html
- GitLab docs — `npm audit` 예시: https://docs.gitlab.com/ee/ci/examples/authenticating-with-hashicorp-vault/
- govulncheck: https://go.dev/security/vuln/
- npm audit docs: https://docs.npmjs.com/cli/v9/commands/npm-audit

## 14. 부록 B — 판정 요약표

| 잡 | PROCEED 조건 | Day 3 즉시 추가 가능 여부 |
|----|------------|------------------------|
| J1 `sca-npm-audit` | SEC-B + SEC-C 머지 완료 | ✅ (Day 2 완료 전제) |
| J2 `sca-govulncheck` | SEC-A 머지 완료 + `toolchain go1.25.9` directive 존재 | ✅ (Day 2 완료 전제) |
| J3 `weekly-dependency-audit` | 무조건 | ✅ |

**3잡 모두 Day 3 PROCEED**. Day 2 SEC-A/B/C 3건 머지 완료가 J1/J2 의 유일한 의존성.
