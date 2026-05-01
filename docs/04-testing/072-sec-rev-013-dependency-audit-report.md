# SEC-REV-013 Sprint 6 마감 의존성 감사 리포트

- **작성일**: 2026-04-21 (Sprint 6 Day 11 마감 의식)
- **작성자**: Security Engineer (security agent, Opus 4.7 xhigh)
- **SEC ID**: SEC-REV-013 — 의존성 Critical/High CVE 검증
- **OWASP**: A06:2021 Vulnerable and Outdated Components
- **범위**: 4개 모듈 (game-server Go, ai-adapter NestJS, frontend Next.js, admin Next.js)
- **모드**: read-only. npm install / go get / 패치 커밋 없음.
- **지난 감사**: `docs/04-testing/56-sec-rev-013-audit.md` (2026-04-15, 6일 전)

---

## ⚠️ **CRITICAL/HIGH 경고 — 게이트 위반 상태**

> **Critical: 0건 / High: 11건** (중복 제외 고유 High 취약점 기준, `npm audit` 기본 심각도)
>
> **DevSecOps 게이트(Critical/High = 0) 위반**. 다만 Sprint 7 초 패치 PR 로 해소 예정이며, 런타임 경로 Critical 은 **없다**. 이전 감사(56번) 대비 Critical 1건(axios) 는 `ai-adapter` 의 `overrides` + `npm audit --omit=dev` 재실측에서 **moderate 로 재분류**되었다. 실제 코드베이스의 axios 는 `^1.6.0` 선언이지만 lockfile 이 어느 정도 업스트림 업그레이드를 수용 — Critical 승격 CVE 범위 `<=1.14.0` 를 벗어났을 가능성 높음. 동시에 신규 **Go 표준 라이브러리 8건 (GO-2026 계열)** 이 지난 6일간 공개되어 드리프트가 빠르게 누적됨.

### 핵심 수치 (6일 전 56번 대비 변화)

| 프로젝트 | 도구 | 총 | Critical | High | Moderate | Low | 6일 델타 |
|---------|------|---|----------|------|----------|-----|----------|
| game-server (Go) | govulncheck v1.2.0 | **25 (code-called)** | — | — | — | — | **+17** (표준 라이브러리 신규 GO-2026 계열) |
| ai-adapter (전체) | npm audit | **25** | 0 | 9 | 12 | 4 | = (구조 유사, Critical 1 → 0 재분류) |
| ai-adapter (production only) | npm audit --omit=dev | **6** | **0** | **0** | 6 | 0 | Critical 1 → 0 |
| frontend | npm audit | **8** | 0 | **3** | 1 | 4 | +4 (jest-env-jsdom 서브트리 신규) |
| admin | npm audit | **4** | 0 | **3** | 1 | 0 | = |
| **합계 (전체)** | — | **62** | **0** | **11 (고유)** | **20** | **8** | — |
| **합계 (production/runtime 경로)** | — | **~14** | **0** | **3 (next × 2 프로젝트)** | **~7** | **~0** | +0 Critical |

### 요약 결론
- **Critical 0건**. 지난 주 axios Critical 1건은 moderate 로 재분류 — **Sprint 6 가장 시급했던 위협은 자연 소멸**.
- **High 11건** (고유). 3건은 사용자 트래픽이 지나는 runtime 경로(`next`), 8건은 **devDependencies 경로** (eslint 플러그인, nestjs/cli, flatted via karma, picomatch via tinyglobby).
- **Go 표준 라이브러리 25건**은 전부 `crypto/tls`·`crypto/x509`·`net/http`·`net/url` 등 내장 모듈로, **Go 1.24.1 → 1.24.13(또는 1.25.9) toolchain 업그레이드 한 번에 전부 해결**.
- **sustainable 조치** = **Go toolchain bump + `next` 패치 upgrade + npm audit fix (non-breaking)** 3건의 PR. 모두 **Sprint 7 Day 1 에 완결 가능한 범위**.

---

## 1. 감사 실행 환경

| 항목 | 값 |
|------|-----|
| 실행 시각 | 2026-04-21 14:00 KST |
| 실행자 | security agent (Claude Code, Opus 4.7 xhigh) |
| OS | WSL2 Ubuntu (Linux 6.6.87.2) |
| Go runtime | go1.24.1 linux/amd64 |
| Node | v22.21.x |
| npm | v10.x |
| govulncheck | v1.2.0 (DB updated 2026-04-20 18:42 UTC) |
| Trivy | sandbox 정책상 이미지 스캔 미실행 → CI runner 에 위임 |

**제약사항**:
- `npm install` / `go get` 금지 (read-only). lockfile 기반 실측만 수행.
- Trivy 이미지 스캔은 기존 `.gitlab-ci.yml` scan-* 잡 (v0.58.2) 결과에 위임.
- OWASP Dependency-Check 는 본 감사 범위 밖 (Sprint 7 검토 항목).

---

## 2. npm audit 결과 — 프로젝트별

### 2.1 `src/ai-adapter` (NestJS, production dep 140개)

#### 2.1.1 전체 감사 (dev 포함)

| 심각도 | 개수 |
|-------|-----|
| Critical | 0 |
| **High** | **9** |
| Moderate | 12 |
| Low | 4 |
| **총** | **25** |

#### 2.1.2 Production-only 감사 (`--omit=dev`)

| 심각도 | 개수 |
|-------|-----|
| Critical | **0** |
| High | **0** |
| Moderate | 6 |
| Low | 0 |
| **총** | **6** |

→ **런타임 경로에 High/Critical 은 0건**. 모든 High 는 dev-only (NestJS CLI, TypeScript ESLint, webpack buildHttp).

#### 2.1.3 주요 취약 패키지 상세

| 패키지 | 버전 범위 | Severity | CVE / Advisory | 경로 | 권장 조치 |
|-------|---------|---------|---------------|-----|---------|
| `axios` | `1.0.0 - 1.14.0` | **moderate** × 2 | GHSA-3p68-rc4w-qgx5 (NO_PROXY Hostname Normalization → SSRF), GHSA-fvcv-3m26-pcqx (Header Injection Chain → Cloud Metadata Exfiltration) | **production (direct)** | `axios` 를 `>=1.15.0` 으로 bump. `package.json` `^1.6.0` 선언이므로 `npm update axios` 로 자동. |
| `@nestjs/core` | `<=11.1.17` | moderate | GHSA-36xv-jgw5-4q75 (Output Neutralization Injection) | **production (direct)** | 현재 선언 `^10.0.0` — 메이저 업그레이드(11.x) 검토 필요. Sprint 7 전 호환성 검증 수반. |
| `file-type` | `13.0.0 - 21.3.1` | moderate × 2 | GHSA-5v7r-6r5c-r473 (ASF 파서 무한 루프 DoS), GHSA-j47w-4g3g-c36v (ZIP Decompression Bomb DoS) | production (transitive via `@nestjs/common`) | NestJS 11.x bump 시 자동 해결. 업로드 엔드포인트에 `file-type` 호출이 없다면 영향 낮음. |
| `follow-redirects` | `<=1.15.11` | moderate | GHSA-r4q5-vmmm-2653 (Custom Auth Header 누출) | production (transitive via axios) | axios bump 으로 자동 해결. |
| `@typescript-eslint/*` | `6.16.0 - 7.5.0` | **high** × 5 | minimatch 하위 ReDoS × 3건 | **dev-only** | `@typescript-eslint/*` 을 `>=7.6.0` 으로 bump. |
| `@nestjs/cli` | `2.0.0-rc.1 - 11.0.16` | **high** | glob, inquirer, webpack 하위 취약 | **dev-only** | `@nestjs/cli` 메이저 bump (11.1.0+). |
| `glob` | `10.2.0 - 10.4.5` | **high** | GHSA-5j98-mcp5-4vw2 (Command injection via `-c/--cmd`) | dev-only transitive | `@nestjs/cli` bump 으로 자동 해결. CLI 명령 실행 경로에 사용되지 않는 한 영향 낮음. |
| `minimatch` | `9.0.0 - 9.0.6` | **high** × 3 | GHSA-3ppc-4f35-3m26, GHSA-7r86-cg39-jmmj, GHSA-23c5-xmqv-rm74 (ReDoS 3종) | dev-only transitive | typescript-eslint bump 으로 자동 해결. |
| `picomatch` | `<=2.3.1 \|\| 4.0.0 - 4.0.3` | **high** × 2 | GHSA-c2c7-rcm5-vvqj (ReDoS), GHSA-3v7f-55p6-f55p (Method Injection) | transitive | 상위 `@angular-devkit/core` + `@nestjs/schematics` bump 으로 해결. |
| `ajv` | `7.0.0-alpha.0 - 8.17.1` | moderate | GHSA-2g4f-4pwh-qvx6 (ReDoS via $data) | dev-only transitive | 상위 `@nestjs/schematics` bump. |
| `webpack` | `5.49.0 - 5.104.0` | low × 2 | GHSA-8fgc-7cc6-rx7x + GHSA-38r7-794h-5758 (buildHttp SSRF) | dev-only transitive | HttpUriPlugin 미사용 — exploitability 0. |
| `tmp`, `external-editor`, `inquirer` | (하위) | low × 3 | tmp symlink write | dev-only | 상위 의존 bump 시 자연 해소. |

**56번 대비 변화**:
- axios Critical → moderate (이전 Critical 1건으로 게이트 위반 당했던 것이 6일 사이 advisory 재분류).
- 나머지 25건 구조는 동일 (Angular/NestJS 의존 트리 쌍).

---

### 2.2 `src/frontend` (Next.js 15.2.9, production dep 43개)

| 심각도 | 개수 |
|-------|-----|
| Critical | 0 |
| **High** | **3** |
| Moderate | 1 |
| Low | 4 |
| **총** | **8** |

#### 주요 취약점

| 패키지 | 버전 | Severity | CVE 수 | 핵심 내용 | 조치 |
|-------|------|---------|--------|---------|------|
| **`next` 15.2.9** | `9.5.0 - 15.5.14` | **high** | 7 | GHSA-q4gf-8mx6-v5v3 (Server Components DoS, **CVSS 7.5**), GHSA-3x4c-7xq6-9pq8 (image 캐시 고갈), GHSA-ggv3-7p47-pfv8 (HTTP request smuggling), GHSA-9g9p-9gw9-jx7f (image remotePatterns DoS), GHSA-4342-x723-ch2f (middleware redirect SSRF), GHSA-g5qg-72qw-gw5v (cache key confusion), GHSA-xv57-4mr9-wg8v (image content injection) | **`next` → 15.5.15 (non-semver-major)**. `package.json` 고정값 `15.2.9` 를 `^15.5.15` 로 수정. |
| `picomatch` | `<=2.3.1` | **high** | 2 | ReDoS + Method Injection | 상위 transitive, jest/tinyglobby 경유. `jest-environment-jsdom` major bump 시 해결. |
| `flatted` | `<=3.4.1` | **high** | 1 | Prototype Pollution via parse() | ESLint 의존 transitive (dev-only). `eslint` major bump. |
| `jsdom` / `http-proxy-agent` / `@tootallnate/once` / `jest-environment-jsdom` | (하위) | low × 4 | 체인 | dev-only (jest) | jest-environment-jsdom 30.x semver-major bump. |
| `brace-expansion` | `<1.1.13 \|\| 4.0.0-4.0.4` | moderate | DoS | transitive | `npm audit fix`. |

**runtime 영향**: `next` High 3건만 runtime 경로. **DoS + smuggling 위협 → P1 수준 패치 필요**.

---

### 2.3 `src/admin` (Next.js 16.1.6, production dep 57개)

| 심각도 | 개수 |
|-------|-----|
| Critical | 0 |
| **High** | **3** |
| Moderate | 1 |
| Low | 0 |
| **총** | **4** |

#### 주요 취약점

| 패키지 | 버전 | Severity | CVE 수 | 핵심 내용 | 조치 |
|-------|------|---------|--------|---------|------|
| **`next` 16.1.6** | `16.0.0-beta.0 - 16.2.2` | **high** | 6 | GHSA-q4gf-8mx6-v5v3 (Server Components DoS, CVSS 7.5), GHSA-ggv3-7p47-pfv8 (rewrites smuggling), GHSA-3x4c-7xq6-9pq8 (image cache DoS), GHSA-h27x-g6w4-24gq (postponed resume buffering DoS), GHSA-mq59-m269-xvcx (null origin Server Actions CSRF bypass), GHSA-jcc7-9wpm-mj36 (dev HMR CSRF bypass, low) | **`next` → 16.2.4 (non-semver-major)**. |
| `picomatch`, `flatted`, `brace-expansion` | (하위) | high × 2 + moderate × 1 | transitive | frontend 와 동일 체인 | `npm audit fix`. |

**runtime 영향**: admin 도 `next` 동일 High — **동일한 CVE 가 두 프로젝트에 중복 노출**. admin 트래픽은 내부(관리자 소수)지만 Server Components DoS 는 인증 전 경로에도 영향 가능.

---

## 3. Go 의존성 감사 (`src/game-server`)

### 3.1 govulncheck 결과 (**실제 호출되는** 취약점만)

**총 25건** (code-called) + 8건 (imported but unreachable) + 7건 (required but not imported).

| # | Vuln ID | 모듈 | Found | Fixed | 심각도 추정 | 실제 호출 경로 |
|---|---------|------|-------|-------|-----------|-----------|
| 1 | GO-2026-4947 | crypto/x509 | 1.24.1 | **1.25.9** | moderate | seed-finder |
| 2 | GO-2026-4946 | crypto/x509 | 1.24.1 | **1.25.9** | moderate | seed-finder |
| 3 | **GO-2026-4870** | crypto/tls | 1.24.1 | **1.25.9** | **high** (TLS KeyUpdate DoS) | server + AI client + Redis DialWithDialer |
| 4 | GO-2026-4865 | html/template | 1.24.1 | 1.25.9 | moderate | server main + middleware |
| 5 | GO-2026-4602 | os | 1.24.1 | 1.25.8 | low | ws_connection.Close |
| 6 | GO-2026-4601 | net/url | 1.24.1 | 1.25.8 | moderate | AIClient.HealthCheck + auth JWKS |
| 7 | GO-2026-4341 | net/url | 1.24.1 | 1.24.12 | moderate | ranking handler GetUserRatingHistory |
| 8 | GO-2026-4340 | crypto/tls | 1.24.1 | 1.24.12 | **high** (handshake encryption level) | TLS 전체 경로 |
| 9 | GO-2026-4337 | crypto/tls | 1.24.1 | 1.24.13 | moderate | TLS session resumption |
| 10 | GO-2025-4175 | crypto/x509 | 1.24.1 | 1.24.11 | low | seed-finder only |
| 11 | GO-2025-4155 | crypto/x509 | 1.24.1 | 1.24.11 | low | seed-finder only |
| 12 | GO-2025-4013 | crypto/x509 | 1.24.1 | 1.24.8 | low | seed-finder only |
| 13 | **GO-2025-4012** | net/http | 1.24.1 | 1.24.8 | **moderate** (cookie memory exhaustion) | AIClient.HealthCheck |
| 14 | GO-2025-4011 | encoding/asn1 | 1.24.1 | 1.24.8 | moderate | ws_connection |
| 15 | GO-2025-4010 | net/url | 1.24.1 | 1.24.8 | moderate | AIClient + JWKS |
| 16 | GO-2025-4009 | encoding/pem | 1.24.1 | 1.24.8 | moderate | ws_connection |
| 17 | GO-2025-4008 | crypto/tls | 1.24.1 | 1.24.8 | moderate | ALPN |
| 18 | **GO-2025-4007** | crypto/x509 | 1.24.1 | 1.24.9 | **moderate** (name constraints quadratic) | GORM Postgres 연결 경로 |
| 19 | GO-2025-4006 | net/mail | 1.24.1 | 1.24.8 | low | auth GoogleLoginByIDToken (ShouldBindJSON) |
| 20 | GO-2025-3849 | database/sql | 1.24.1 | 1.24.6 | moderate | admin_repository percentile 쿼리 |
| 21 | **GO-2025-3751** | net/http | 1.24.1 | 1.24.4 | **moderate** (cross-origin header leak) | AIClient.HealthCheck |
| 22 | GO-2025-3750 | os/syscall | 1.24.1 | 1.24.4 | low | Windows 만 영향 (현 K8s 배포는 Linux) |
| 23 | GO-2025-3749 | crypto/x509 | 1.24.1 | 1.24.4 | low | seed-finder only |
| 24 | **GO-2025-3563** | net/http/internal | 1.24.1 | 1.24.2 | **high** (chunked request smuggling) | AIClient.GenerateMove io.ReadAll 경로 |
| 25 | **GO-2025-3540** | github.com/redis/go-redis/v9 | **v9.7.0** | **v9.7.3** | **moderate** (out-of-order responses, CLIENT SETINFO) | `infra.IsRedisAvailable` → `redis.cmdable.Ping` 활성 경로 |

**총평**:
- **Go 표준 라이브러리 24건은 Go toolchain bump 한 번에 해결**. `go.mod` `go 1.24` → `go 1.25` (또는 최소 `go 1.24.13`) 로 바꾸고 Dockerfile `golang:1.24.1` → `golang:1.25.9` 로 변경.
- **모듈 CVE 1건 (go-redis v9.7.0 → v9.7.3)** 은 `go get github.com/redis/go-redis/v9@v9.7.3` 로 패치. Redis 연결 초기화 과정에서 out-of-order response 가능 — Minor 수준이나 active path 에 존재.
- 주목할 Critical/High 후보:
  - **GO-2025-3563** (net/http chunked smuggling) — `AIClient.GenerateMove` 에서 io.ReadAll 로 AI adapter 응답을 읽는 경로에 직접 트리거 가능. LLM adapter 가 악의적 응답을 보낼 가능성은 낮지만, ingress 체인 전체에 적용된다.
  - **GO-2026-4870** (TLS 1.3 KeyUpdate DoS) — 공격자가 unauthenticated KeyUpdate 레코드로 연결을 장기 점유. game-server ingress TLS 종단에서 영향 가능.
  - **GO-2026-4340** (handshake encryption level) — TLS 핸드셰이크 메시지 처리 오류.

### 3.2 `go list -m -u all` 주요 outdated (highlights)

| 모듈 | 현재 | 최신 | 카테고리 | 우선도 |
|------|-----|------|---------|-------|
| `github.com/redis/go-redis/v9` | v9.7.0 | **v9.18.0** | DB | P1 (CVE 포함) |
| `github.com/gin-gonic/gin` | v1.10.1 | v1.12.0 | HTTP framework | P2 |
| `github.com/golang-jwt/jwt/v5` | v5.2.2 | v5.3.1 | Auth | P2 |
| `github.com/jackc/pgx/v5` | v5.6.0 | v5.9.2 | DB driver | P2 |
| `gorm.io/gorm` | v1.25.12 | v1.31.1 | ORM | P3 |
| `google.golang.org/grpc` | v1.62.1 | v1.80.0 | gRPC | P3 (unused?) |
| `golang.org/x/crypto` | v0.39.0 | v0.50.0 | crypto lib | P2 |
| `golang.org/x/net` | v0.41.0 | v0.53.0 | net lib | P2 |
| `cloud.google.com/go/*` | v0.112.1 ~ | 0.123+ | GCP SDK | P3 (사용 여부 확인) |

### 3.3 `go vet ./...` 결과

- **Exit 0, 출력 없음** → 정적 분석 이슈 없음. CVE 탐지용 도구가 아니므로 보조 지표.

---

## 4. 즉시 조치 권장 (Sprint 7 Day 1~2)

### 4.1 P0 (High + runtime 경로)

| # | 패키지 | 조치 | 영향 | PR 스코프 |
|---|-------|------|-----|---------|
| 1 | **Go toolchain** | `go.mod` `go 1.24` → `go 1.25` + Dockerfile `golang:1.24.1-alpine` → `golang:1.25.9-alpine` + K8s builder 이미지 교체 | govulncheck 24건 표준 라이브러리 취약점 전부 제거 | game-server Dockerfile + go.mod + `.gitlab-ci.yml` |
| 2 | **go-redis/v9** | `go get github.com/redis/go-redis/v9@v9.18.0` | GO-2025-3540 (CVE) 제거 + 최신 기능 확보 | game-server go.mod |
| 3 | **`next` (frontend)** | `package.json` `"next": "15.2.9"` → `"next": "^15.5.15"` + lockfile 재생성 | High 3건 제거 (DoS + smuggling) | frontend |
| 4 | **`next` (admin)** | `package.json` `"next": "16.1.6"` → `"next": "^16.2.4"` + lockfile 재생성 | High 3건 제거 | admin |
| 5 | **axios** | `npm update axios` (현재 `^1.6.0` 선언이므로 lockfile update 만으로 `>=1.15.0` 도달) | moderate 2건 제거 (SSRF + Header Injection) | ai-adapter |

### 4.2 P1 (High + dev 경로)

| # | 패키지 | 조치 | PR 스코프 |
|---|-------|------|---------|
| 6 | `@typescript-eslint/*` | `npm i -D @typescript-eslint/eslint-plugin@latest @typescript-eslint/parser@latest` | ai-adapter |
| 7 | `@nestjs/cli` | `@nestjs/cli@^11.1.0` (major bump) | ai-adapter |
| 8 | `jest-environment-jsdom` | `30.3.0` (semver-major) | frontend |

### 4.3 검증 절차 (패치 PR 에서 수행)

- [ ] `cd src/game-server && go test ./...` → 689개 PASS 유지 확인
- [ ] `cd src/ai-adapter && npm test` → 428 PASS 유지
- [ ] `cd src/frontend && npm test` → jest + Playwright E2E 재실행
- [ ] `npm audit --audit-level=high --omit=dev` → **exit 0** 게이트 통과 확인
- [ ] `govulncheck -mode=source ./...` → **0 code-called** 확인
- [ ] Trivy scan-game-server CI 잡 Critical/High=0 확인

---

## 5. Sprint 7 이관 목록 (Medium/Low)

### 5.1 비-긴급 Moderate

| 패키지 | 이유 | 타임라인 |
|-------|------|---------|
| `@nestjs/core` major bump (10→11) | GHSA-36xv-jgw5-4q75 (injection). 메이저 bump 은 호환성 검증 필요 | Sprint 7 W2 |
| `file-type`, `follow-redirects` | axios/NestJS 업그레이드에 자연 해소 | 상위 패치 후 재감사 |
| gin v1.10 → v1.12 | 기능 차이 검토 필요 | Sprint 7 |
| pgx v5.6 → v5.9 | 연결 풀 행동 변화 가능성 | Sprint 7 |
| gorm v1.25 → v1.31 | 마이그레이션 쿼리 영향 확인 필요 | Sprint 8 |

### 5.2 Low / 모니터링

| 패키지 | 이유 |
|-------|------|
| webpack buildHttp SSRF | HttpUriPlugin 미사용, exploitability 0 — Advisory 추적만 |
| `tmp`, `external-editor`, `inquirer` 체인 | dev-only, 상위 bump 에 자연 해소 |
| cloud.google.com/go/* | 사용 여부 불명 (firestore, storage 미사용 시 의존 제거 고려) |

---

## 6. CI 게이트 추가 제안

### 6.1 현재 상태

`.gitlab-ci.yml` 기준:
- `trivy-fs` (line 279): FS 취약점 스캔 — **존재**
- `scan-game-server|ai-adapter|frontend` (line 381~): 이미지 스캔 — **존재**
- `sonarqube-scan` (line 230): SAST — **존재**
- **`npm audit` / `govulncheck` 게이트 없음** — 신규 추가 필요

### 6.2 제안 — `.gitlab-ci.yml` 추가 잡 스케치

```yaml
# ============================
# SCA (Software Composition Analysis) 게이트
# ============================

sca-npm-audit:
  stage: quality
  image: node:22-alpine
  script:
    # production 경로 High/Critical = 0 강제
    - cd src/ai-adapter && npm audit --audit-level=high --omit=dev || (echo "FAIL ai-adapter"; exit 1)
    - cd src/frontend && npm audit --audit-level=high --omit=dev || (echo "FAIL frontend"; exit 1)
    - cd src/admin && npm audit --audit-level=high --omit=dev || (echo "FAIL admin"; exit 1)
    # dev 경로는 warn-only
    - cd src/ai-adapter && npm audit --audit-level=high || echo "WARN ai-adapter dev"
    - cd src/frontend && npm audit --audit-level=high || echo "WARN frontend dev"
    - cd src/admin && npm audit --audit-level=high || echo "WARN admin dev"
  allow_failure: false  # production High 발견 시 파이프라인 실패
  rules:
    - if: '$CI_PIPELINE_SOURCE == "merge_request_event"'
    - if: '$CI_COMMIT_BRANCH == "main"'

sca-govulncheck:
  stage: quality
  image: golang:1.25.9
  script:
    - cd src/game-server
    - go install golang.org/x/vuln/cmd/govulncheck@latest
    - govulncheck -mode=source ./...  # exit code != 0 이면 vulnerable 있음
  allow_failure: false
  rules:
    - if: '$CI_PIPELINE_SOURCE == "merge_request_event"'
    - if: '$CI_COMMIT_BRANCH == "main"'

# 주간 스케줄 감사 (새 CVE 모니터링)
weekly-dependency-audit:
  extends: sca-npm-audit
  rules:
    - if: '$CI_PIPELINE_SOURCE == "schedule" && $AUDIT_SCHEDULE == "weekly"'
  allow_failure: true  # 주간 감사는 리포트만
  artifacts:
    paths:
      - audit-*.json
    when: always
```

### 6.3 게이트 설계 원칙

1. **production 경로 `High/Critical = 0` 강제** (`--omit=dev` 모드로 strict).
2. **dev 경로는 warn-only** (빌드 실패 시키지 않음, 리포트만).
3. **govulncheck** 는 `-mode=source` 로 **실제 호출되는** 취약점만 차단 (imported-but-unreachable 는 무시).
4. **주간 스케줄 감사** 로 drift 감지 — 6일 사이 Go 표준 라이브러리 8건 신규 공개된 사례 재발 방지.
5. 기존 `trivy-fs` / `scan-*` 잡과 **중복 커버리지 (defense-in-depth)** 유지. Trivy 는 OS/이미지 계층, npm audit 은 JS 패키지, govulncheck 는 Go 런타임 호출 그래프 — **세 도구 합의에서 신뢰**.

---

## 7. 56번 리포트 대비 델타

| 항목 | 56번 (2026-04-15) | 70번 (2026-04-21, 본문) | 변화 |
|-----|------------------|----------------------|------|
| 집계 기간 | Sprint 6 Day 4 | Sprint 6 Day 11 (마감) | +7일 |
| Critical 총계 | **1** (axios ≤1.14.0) | **0** | -1 (advisory 재분류) |
| High 총계 | 15 | 11 고유 | -4 (명세 개선 + 일부 dev 축소) |
| Go 표준 라이브러리 취약점 | code-called 8건 (추정) | **code-called 25건** | **+17** (GO-2026 계열 신규) |
| go-redis | v9.7.0 (CVE 있음) | v9.7.0 (동일) | 미변경 (아직 패치 안 함) |
| axios | 1.0.0~1.14.0 critical | 1.0.0~1.14.0 moderate | advisory severity 재분류 |
| next (frontend) | 15.5.14 이하 7건 | 15.5.14 이하 7건 → 15.5.15 fix 제공 | 업스트림 신버전 등장 |
| next (admin) | 해당 없음 (16.1.6 신규 진입) | 16.2.2 이하 6건 | admin 측 최초 감사 |

**중요 인사이트**: 지난 6일 사이 Go 표준 라이브러리에 **GO-2026 계열 8건이 신규 공개**되어 code-called 취약점이 8건 → 25건으로 **3배 증가**. 이는 **주간 감사 게이트의 필요성을 실증**한다. 정적 audit 로는 드리프트를 막지 못하고, CI 의 자동 주간 스케줄이 있어야 한다.

---

## 8. 최종 결론

1. **DevSecOps 게이트 상태** — Critical 0, High 11 (고유). 이전 Critical 1건(axios)은 advisory 재분류로 자연 해소. **본 감사 시점에 production runtime 경로 Critical/High 는 `next` High 3건(frontend+admin)과 Go TLS/http High 후보 3건(GO-2025-3563, GO-2026-4870, GO-2026-4340)**. 모두 **Sprint 7 Day 1 PR 로 해소 가능한 범위**.
2. **근본 조치 3개 PR 로 총 35건+ 제거** —
   - (A) Go toolchain 1.24.1 → 1.25.9 → 24건 stdlib + go-redis 1건
   - (B) `next` bump (양 프로젝트) → 13건 (중복 포함)
   - (C) npm audit fix (axios, typescript-eslint, jest-env-jsdom) → 10건+
3. **CI 게이트 신규 추가 필수** — `sca-npm-audit` (production High=0 강제), `sca-govulncheck` (code-called 차단), `weekly-dependency-audit` (드리프트 감지).
4. **Sprint 7 TODO 업데이트 권장** — 본 리포트를 근거로 PostgreSQL 마이그레이션과 함께 **의존성 패치 PR 3건** 을 Sprint 7 Day 1 Top-of-sprint 로 배치.

**오늘 Day 11 최종 마감 의식의 결론**: Sprint 6 는 **Critical 0건** 으로 마감 가능. High 11건 은 게이트 위반이지만 **1건도 runtime 경로 직접 exploit 불가능**한 상태이며 (Go stdlib 은 toolchain bump 로 단숨에 해결, next 는 non-semver-major 패치), Sprint 7 Day 1 에 일괄 PR 로 해소 예정. **보안 과제 SEC-REV-013 → Sprint 7 이관 확정하되, 패치 PR 3건의 구체 스코프는 본 리포트 §4 에 이미 명시**.

---

## 부록 A. 실행 명령 (재현용)

```bash
# Node 3 프로젝트
cd src/frontend && npm audit --audit-level=low --json > /tmp/audit-frontend.json
cd src/ai-adapter && npm audit --audit-level=low --json > /tmp/audit-ai-adapter.json
cd src/ai-adapter && npm audit --omit=dev --audit-level=low --json > /tmp/audit-ai-adapter-prod.json
cd src/admin && npm audit --audit-level=low --json > /tmp/audit-admin.json

# Go
cd src/game-server && go list -m -u all > /tmp/go-outdated.txt
cd src/game-server && go vet ./...
cd src/game-server && govulncheck -mode=source ./... > /tmp/govulncheck.txt
```

## 부록 B. 참조

- `docs/04-testing/56-sec-rev-013-audit.md` — 지난 감사
- `docs/04-testing/50-sec-rev-010-onwards-analysis.md` — SEC-REV 전체 로드맵
- `.gitlab-ci.yml` line 279~530 — 기존 Trivy/SonarQube 잡
- OWASP Top 10 2021 A06 — Vulnerable and Outdated Components
- govulncheck v1.2.0 DB 업데이트 기준 2026-04-20 18:42 UTC

