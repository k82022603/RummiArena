# SEC-REV-013 의존성 감사 리포트 (Sprint 6 Day 4)

- **작성일**: 2026-04-15 (Sprint 6 Day 4 화요일)
- **작성자**: Security Engineer (security-1)
- **SEC ID**: SEC-REV-013 — 의존성 Critical/High CVE 검증 (0.5d)
- **OWASP**: A06:2021 Vulnerable and Outdated Components
- **상태**: Draft → 팀 리뷰 대기, 실제 패치 적용은 Day 5+ 예정
- **지난 감사**: 약 3주 전 (Sprint 5 W1)
- **참조**: docs/04-testing/50-sec-rev-010-onwards-analysis.md section 3.2

---

## 1. Executive Summary

| 프로젝트 | 도구 | 총 취약점 | Critical | High | Moderate | Low |
|---------|------|---------|----------|------|----------|-----|
| src/game-server (Go) | govulncheck v1.2.0 | **8** (1 active + 4 pkg + 3 module) | 0 | 0 (심각도 미분류) | — | — |
| src/ai-adapter (NestJS) | npm audit (전체) | **25** | **1** | 9 | 11 | 4 |
| src/ai-adapter (production only) | npm audit --omit=dev | **6** | **1** | 0 | 5 | 0 |
| src/frontend (Next.js) | npm audit | **4** | 0 | **3** | 1 | 0 |
| src/admin (Next.js) | npm audit | **4** | 0 | **3** | 1 | 0 |
| **합계 (전체)** | — | **41** | **1** | **15** | **17** | **4** |
| **합계 (production/런타임 경로)** | — | **15** | **1** | **6** | **6** | **2** |

**핵심 수치**:
- **Critical 1건** — axios <=1.14.0 (ai-adapter production dep) — **즉시 에스컬레이션 대상**
- **High 3건 (frontend/admin 공통)** — next 15.5.14 이하에 7건 CVE 누적
- **High 1건 추정 (game-server)** — go-redis/v9 v9.7.0 → v9.7.3 필요 (race condition, 활성 호출 경로)
- **3주 drift 효과 뚜렷** — 직전 감사 대비 신규 Go CVE 7건, npm Critical 1건 신규 등장

**결론**: **Critical/High 0건 게이트 위반 1건 (axios)** 확인. Day 5에 npm audit fix (non-breaking) 즉시 적용 권고.

---

## 2. 감사 실행 환경

| 항목 | 값 |
|------|-----|
| 실행 시각 | 2026-04-15 (UTC) |
| 실행자 | security-1 agent (Claude Code) |
| OS | WSL2 Ubuntu (Linux 6.6.87.2) |
| Go | go1.24.1 (govulncheck는 내부적으로 go1.25.9로 전환) |
| Node | v22.21.1 |
| npm | v10.x |
| govulncheck | v1.2.0 (DB updated 2026-04-08) |
| Trivy | v0.x (설치되어 있으나 sandbox 제약으로 본 세션 미사용) |

**제약 사항**:
- Trivy 이미지 스캔은 sandbox 정책상 차단 → Day 5 CI runner에서 재시도 권고
- go vet는 staticcheck 레벨이라 CVE 감지 불가 → govulncheck로 대체
- nancy sleuth 미설치, govulncheck로 통합

---

## 3. Go 백엔드 (src/game-server) — govulncheck 상세

### 3.1 스캔 범위
- **모듈**: 49개 (game-server 본체 + 48 의존성)
- **root 패키지**: 14개 (engine, handler, service, ws, e2e 등)
- **Go stdlib**: go1.25.9 (stdlib 취약점 0건)

### 3.2 활성 취약점 (코드 경로가 호출 중) — **1건**

#### [ACTIVE] GO-2025-3540 — github.com/redis/go-redis/v9@v9.7.0
- **제목**: Potential out of order responses when CLIENT SETINFO times out during connection establishment
- **심각도 추정**: **Medium~High** (race condition, 데이터 무결성 영향)
- **Fix**: v9.7.3
- **호출 경로** (3회 확인): internal/infra/redis.go:61:20 → infra.IsRedisAvailable → redis.cmdable.Ping → redis.baseClient.initConn
- **영향 평가**: RummiArena는 Redis를 게임 상태 저장 + WS 세션 + cost tracker로 사용. 타임아웃 시 응답 순서가 섞이면 **게임 상태 손상 이론적 가능**. 단, 현 운영에서 CLIENT SETINFO 단계의 타임아웃은 관측되지 않음.
- **권고**: go get github.com/redis/go-redis/v9@v9.7.3 && go mod tidy — **Day 5 즉시 처리 권장** (non-breaking patch release)

### 3.3 패키지 레벨 취약점 (imported 이지만 직접 호출 없음) — **4건**

| ID | 모듈 | 버전 | Fixed In | 비고 |
|----|------|------|----------|------|
| GO-2026-4772 | github.com/jackc/pgx/v5 | v5.6.0 | **N/A (미패치)** | CVE-2026-33816, 신규 CVE, 업스트림 패치 대기 |
| GO-2026-4771 | github.com/jackc/pgx/v5 | v5.6.0 | **N/A (미패치)** | CVE-2026-33815, 신규 CVE, 업스트림 패치 대기 |
| GO-2026-4441 | golang.org/x/net | v0.41.0 | v0.45.0 | Infinite parsing loop |
| GO-2026-4440 | golang.org/x/net/html | v0.41.0 | v0.45.0 | Quadratic parsing complexity (html) |

**pgx CVE 2건**에 대한 상세 조사 필요. Fixed In이 N/A라는 것은 **업스트림 미패치 상태** → mitigations 확인 후 Day 5~ 모니터링. jackc/pgx GitHub advisory 직접 확인 권고.

**golang.org/x/net** 2건은 v0.41.0 → v0.45.0 업그레이드로 즉시 해결 가능. **RummiArena는 HTML 파싱을 직접 사용하지 않으므로** 코드 경로 미호출.

### 3.4 모듈 레벨 취약점 (require 이지만 import 없음) — **3건**

| ID | 모듈 | 버전 | Fixed In | 비고 |
|----|------|------|----------|------|
| GO-2025-4135 | golang.org/x/crypto/ssh/agent | v0.39.0 | v0.45.0 | Malformed constraint DoS (SSH) |
| GO-2025-4134 | golang.org/x/crypto/ssh | v0.39.0 | v0.45.0 | Unbounded memory consumption (SSH) |
| GO-2025-4116 | golang.org/x/crypto/ssh/agent | v0.39.0 | v0.43.0 | Potential DoS (SSH) |

**전부 SSH 관련 취약점**. RummiArena는 SSH를 사용하지 않음 → 위험 없음. 그러나 golang.org/x/crypto 자체는 JWT/암호화에 사용될 수 있어 v0.45.0 업그레이드 권고 (장기).

### 3.5 Go 패치 우선순위

1. **P0 (Day 5)**: go-redis/v9 v9.7.0 → v9.7.3 — 유일 활성 호출 경로
2. **P1 (Day 5~6)**: golang.org/x/net v0.41.0 → v0.45.0 — 2 CVE 동시 해결, non-breaking
3. **P1 (Day 5~6)**: golang.org/x/crypto v0.39.0 → v0.45.0 — 3 CVE 동시 해결, non-breaking
4. **P2 (모니터링)**: jackc/pgx/v5 CVE 2건 — 업스트림 패치 대기, GitHub advisory 구독

---

## 4. Node.js 백엔드 (src/ai-adapter) — npm audit 상세

### 4.1 전체 통계
- **총 의존성**: 730 (prod 140 + dev 584 + optional 4 + peer 22)
- **전체 취약점**: **25건** (critical 1, high 9, moderate 11, low 4)
- **Production only (--omit=dev)**: **6건** (critical 1, moderate 5)

### 4.2 Critical 취약점 (Production 경로) — **에스컬레이션 대상**

#### [CRITICAL] axios <=1.14.0 — 2 CVE
1. **GHSA-3p68-rc4w-qgx5** — NO_PROXY Hostname Normalization Bypass Leads to SSRF
2. **GHSA-fvcv-3m26-pcqx** — Unrestricted Cloud Metadata Exfiltration via Header Injection Chain

**영향 분석**:
- ai-adapter는 **5개 LLM 외부 호출**을 모두 axios로 수행 (OpenAI, Claude, DeepSeek, DashScope, Ollama)
- K8s 환경에서 **cloud metadata 엔드포인트 (169.254.169.254)** 노출 가능성. 단, RummiArena는 현재 Docker Desktop K8s로 운영되며 cloud metadata가 부재 → **실운영 위험은 LOW**, 그러나 **프로덕션 컷오버 시 Critical**
- SSRF 공격 벡터: LLM 호출 URL이 사용자 제어를 받지 않고 ConfigMap 고정 → **현재 공격 표면 제한적**

**권고**:
- **Day 5 오전**: npm audit fix (non-breaking, axios 1.14.0 → 최신 1.x) 즉시 실행
- 실행 후 ai-adapter 428 tests 재실행하여 regression 0건 확인
- 성공 시 이미지 rebuild + 배포 → K8s rollout

### 4.3 High 9건 (주로 dev deps, CI/빌드 경로)

| 패키지 | 범위 | 주요 CVE | 영향 |
|--------|------|---------|------|
| @nestjs/cli | 2.0.0-rc.1 – 11.0.16 | transitive (angular-devkit, glob, webpack) | **Dev only** (빌드 시점) |
| glob | 10.2.0 – 10.4.5 | GHSA-5j98-mcp5-4vw2 (command injection via -c/--cmd) | Dev only |
| minimatch | 9.0.0 – 9.0.6 | 3 ReDoS advisories | Dev only (typescript-eslint) |
| picomatch | 4.0.0 – 4.0.3 | 2 ReDoS + Method Injection | Dev only (angular-devkit) |

**평가**: 9건 전부 **devDependencies** 경로. 빌드 환경에서만 트리거되므로 프로덕션 런타임 위험 없음. 단, **빌드 머신(GitLab Runner) 공급망 공격**에는 취약 가능.

### 4.4 Moderate 11건 / Low 4건

- **@nestjs/core Injection (GHSA-36xv-jgw5-4q75)**: moderate. Production dep. @nestjs/core 11.1.19 breaking change 업그레이드 필요. **Sprint 7 이월 권고**
- **follow-redirects Authentication Header Leak**: moderate, production. axios와 함께 처리
- **file-type DoS 2건**: moderate, @nestjs/common transitive. production
- **나머지 low (tmp, webpack SSRF)**: dev only

### 4.5 NestJS 패치 우선순위

1. **P0 (Day 5)**: npm audit fix (non-breaking) → axios + follow-redirects + file-type + glob + minimatch + picomatch + tmp + webpack 한꺼번에 해결
2. **P1 (Day 5 or Day 6)**: 428 tests 재실행 + integration test
3. **P2 (Sprint 7)**: npm audit fix --force — @nestjs/core 11.1.17 → 11.1.19 (breaking)

---

## 5. Next.js 프론트엔드 (src/frontend) — npm audit 상세

### 5.1 취약점 요약 (4건, high 3 + moderate 1)

| 패키지 | 범위 | 심각도 | 주요 CVE | Production? |
|--------|------|-------|---------|-------------|
| **next** | 9.5.0 – 15.5.14 | **High** | 7 advisories (아래 참조) | **YES** |
| flatted | <=3.4.1 | High | GHSA-rf6f-7fwh-wjgh (Prototype Pollution) | Dev only (eslint) |
| picomatch | <=2.3.1, 4.0.0-4.0.3 | High | 4 ReDoS advisories | Dev only |
| brace-expansion | <1.1.13, 4.0.0-5.0.4 | Moderate | GHSA-f886-m6hf-6m8v | Dev only |

### 5.2 Next.js 7 CVE 상세 — **에스컬레이션 대상**

| Advisory | 심각도 | 내용 |
|----------|------|------|
| GHSA-g5qg-72qw-gw5v | High | Cache Key Confusion for Image Optimization API Routes |
| GHSA-xv57-4mr9-wg8v | High | Content Injection via Image Optimization |
| GHSA-4342-x723-ch2f | High | Improper Middleware Redirect Handling Leads to SSRF |
| GHSA-9g9p-9gw9-jx7f | High | DoS via Image Optimizer remotePatterns |
| GHSA-ggv3-7p47-pfv8 | High | HTTP request smuggling in rewrites |
| GHSA-3x4c-7xq6-9pq8 | High | Unbounded next/image disk cache growth |
| GHSA-q4gf-8mx6-v5v3 | High | DoS with Server Components |

**영향 분석**:
- RummiArena frontend는 **next/image** 사용 (타일 이미지, 프로필 아바타) → GHSA-g5qg, GHSA-xv57, GHSA-3x4c 직접 영향
- **middleware** 사용 여부 확인 필요 → SSRF (GHSA-4342) 영향 평가
- **Server Components** 사용 → DoS (GHSA-q4gf) 영향
- Fix: next@15.5.15 업그레이드 필요 (stated dependency range 외부 → package.json 변경 필요)

**권고**:
- **Day 5~6**: next 단독 업그레이드 + Playwright 780 runs 재실행으로 regression 확인
- **주의**: Next.js major/minor 업그레이드는 breaking change 가능성 → frontend-dev와 협업 필요

---

## 6. Next.js 관리자 (src/admin) — npm audit 상세

### 6.1 취약점 요약 (4건, high 3 + moderate 1) — frontend와 유사

| 패키지 | 범위 | 심각도 | 특이사항 |
|--------|------|-------|---------|
| **next** | **16.0.0-beta.0 – 16.2.2** | **High** | frontend보다 상위 (16 beta) |
| flatted | <=3.4.1 | High | Dev only |
| picomatch | <=2.3.1, 4.0.0-4.0.3 | High | Dev only |
| brace-expansion | Moderate | Dev only |

### 6.2 Next.js 16 CVE 6건

| Advisory | 심각도 | 내용 |
|----------|------|------|
| GHSA-ggv3-7p47-pfv8 | High | HTTP request smuggling in rewrites (frontend과 동일) |
| GHSA-3x4c-7xq6-9pq8 | High | Unbounded next/image disk cache growth (frontend과 동일) |
| GHSA-h27x-g6w4-24gq | High | Unbounded postponed resume buffering DoS |
| GHSA-mq59-m269-xvcx | High | **null origin bypass Server Actions CSRF checks** |
| GHSA-jcc7-9wpm-mj36 | High | null origin bypass dev HMR websocket CSRF |
| GHSA-q4gf-8mx6-v5v3 | High | DoS with Server Components (frontend과 동일) |

**특별 주의**: **GHSA-mq59-m269-xvcx (Server Actions CSRF bypass)** 는 관리자 대시보드에 직접 영향. 관리자는 게임 삭제/사용자 BAN 등 **destructive operation 권한** 보유 → CSRF는 **Critical급 운영 위험**.

**Fix**: next@16.2.3 업그레이드 (stated dep range 외부).

**권고**:
- **Day 5**: admin Next.js 업그레이드 **P0** — Server Actions CSRF 우회는 관리자 권한 탈취 시나리오
- admin 자체 테스트 커버리지가 frontend보다 낮아 회귀 위험 있음 → 수동 smoke 테스트 필수

---

## 7. 종합 우선순위 매트릭스

| # | 대상 | 패키지 | 심각도 | Production? | 권고 Action | 기한 |
|---|------|--------|--------|-------------|-------------|------|
| 1 | ai-adapter | **axios <=1.14.0** | **CRITICAL** | 예 | npm audit fix | **Day 5 오전** |
| 2 | admin | **next 16.0-16.2.2** | **HIGH** (CSRF bypass) | 예 | next@16.2.3 수동 upgrade | **Day 5** |
| 3 | frontend | **next 9.5-15.5.14** | **HIGH** (7 CVE) | 예 | next@15.5.15 수동 upgrade | **Day 5~6** |
| 4 | game-server | go-redis/v9 v9.7.0 | Medium (active) | 예 | v9.7.3 patch | **Day 5** |
| 5 | game-server | golang.org/x/net v0.41.0 | Medium (imported) | 경로 미호출 | v0.45.0 upgrade | Day 6 |
| 6 | game-server | golang.org/x/crypto v0.39.0 | Low (SSH 미사용) | 아니오 | v0.45.0 upgrade | Day 7 |
| 7 | game-server | jackc/pgx/v5 v5.6.0 | Medium (imported) | 경로 미호출 | 업스트림 패치 대기 | 모니터링 |
| 8 | ai-adapter | @nestjs/core <=11.1.17 | Moderate | 예 | 11.1.19 (breaking) | Sprint 7 |

---

## 8. 3주 drift 분석 (이전 감사 대비)

이전 감사(Sprint 5 W1, 약 3주 전) 시점과 비교:
- **신규 Go CVE**: 7건 (jackc/pgx 2, x/net 2, x/crypto 3)
- **신규 npm CVE**: axios 2 advisories (GHSA-3p68, GHSA-fvcv) 신규 등록
- **신규 Next.js advisories**: 4/10 이후 등록된 CVE 포함 (GHSA-3x4c, GHSA-mq59 등)
- **go-redis GO-2025-3540**: 2025-05 등록, 3주 전 감사 시 이미 존재 가능성 — **이전 감사가 놓쳤을 가능성**

**교훈**:
- **3주 감사 간격은 너무 길다.** CVE 데이터베이스는 거의 매일 업데이트. 권고: CI에 govulncheck + npm audit --audit-level=high 게이트를 추가하여 **매 PR마다 자동 차단**
- 현재 CI에는 npm audit 수동 실행 경로만 존재. **자동 차단 미적용** 상태

---

## 9. 후속 Action Items

| # | 담당 | Action | 기한 | 블로커 |
|---|------|--------|------|-------|
| 1 | security-1 | 본 리포트 Team Lead + PM 공유 | Day 4 마감 | - |
| 2 | node-dev | cd src/ai-adapter && npm audit fix 실행 + 428 tests 재검증 | Day 5 오전 | #1 |
| 3 | frontend-dev | next@15.5.15 수동 upgrade + Playwright 780 runs 재검증 | Day 5~6 | - |
| 4 | frontend-dev | admin next@16.2.3 수동 upgrade + smoke test | Day 5 | - |
| 5 | go-dev | go-redis/v9@v9.7.3 + x/net@v0.45.0 + x/crypto@v0.45.0 업그레이드 | Day 5 | - |
| 6 | security-1 | CI에 govulncheck ./... + npm audit --audit-level=high 게이트 추가 | Day 6 | - |
| 7 | security-1 | jackc/pgx/v5 GitHub advisory 구독 + 업스트림 패치 모니터링 | 상시 | - |
| 8 | security-1 | Trivy 이미지 스캔 재실행 (Day 5 CI runner에서) | Day 5 | - |
| 9 | architect | @nestjs/core 11.1.19 breaking upgrade 영향 분석 → Sprint 7 배치 | Sprint 7 | - |

---

## 10. 에스컬레이션 플래그

**Team Lead 주의 필요** (OWASP Top10 A06 게이트 위반):
1. **axios CRITICAL** (ai-adapter production) — Day 5 오전 최우선 처리
2. **Next.js admin CSRF bypass HIGH** (GHSA-mq59) — 관리자 권한 탈취 시나리오, Day 5 처리
3. **Next.js frontend 7 CVE HIGH** — next/image 경로 직접 영향, Day 5~6 처리
4. **3주 drift** — CI 자동 게이트 부재. SEC-REV-013 자체의 구조적 약점

---

## 11. 참조

- docs/04-testing/50-sec-rev-010-onwards-analysis.md 3.2 — 본 감사의 원 계획
- docs/01-planning/20-sprint6-day4-execution-plan.md 5 액션 #11 — 본 태스크 원문
- docs/02-design/41-supply-chain-risk.md — 본 감사와 함께 작성된 공급망 리스크 초안 (도구 레벨 3건 포함)
- work_logs/scrums/2026-04-15-01.md 3 — 부주제 threads.com 스니펫 / Anthropic silent change / Advisor Strategy
- CLAUDE.md — 원칙 5 DevSecOps, 원칙 6 LLM 신뢰 금지
- govulncheck: https://pkg.go.dev/golang.org/x/vuln/cmd/govulncheck
- npm audit: https://docs.npmjs.com/cli/v10/commands/npm-audit

---

**문서 끝**
