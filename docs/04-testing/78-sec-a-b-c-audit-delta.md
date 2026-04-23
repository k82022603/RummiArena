# 78. SEC-A/B/C 패치 전후 델타 감사 리포트

- **작성일**: 2026-04-23 (Sprint 7 Day 2 착수 직전 ~ 현재진행)
- **작성자**: Security Engineer (security agent, Opus 4.7 xhigh)
- **SEC ID**: SEC-REV-013 후속 — Day 2 의존성 bump PR 3건 (SEC-A, SEC-B, SEC-C) 적용 전후 재감사
- **모드**: Read-only. 코드 수정 / 커밋 / 브랜치 생성 없음.
- **실행 환경**:
  - Branch: `chore/sec-a-go-toolchain-bump` (현재 체크아웃 상태)
  - Go runtime: `go1.25.0 linux/amd64` (주의: **1.25.9 아님**)
  - govulncheck v1.2.0
  - npm 10.x / node v22
- **선행 참조**:
  - `docs/04-testing/70-sec-rev-013-dependency-audit-report.md` — Sprint 6 마감 감사
  - `docs/04-testing/75-sec-day12-impact-and-plan.md` — architect 영향 분석 및 실행 계획

---

## 1. Executive Summary

| ID | 항목 | 현황 | 판정 | 핵심 근거 |
|----|------|------|------|----------|
| **SEC-A** | Go 1.24→1.25 + go-redis 9.7.0→9.7.3 | **부분 적용** (코드 반영, toolchain 미선언) | **PROCEED (보강 필요)** | `go.mod` line 3 `go 1.25` 만 있고 `toolchain go1.25.9` directive **누락**. 로컬 `go1.25.0` 기준 govulncheck 에서 **stdlib 19건 여전히 code-called**. go-redis 는 완전 해소 (GO-2025-3540 ✅) |
| **SEC-B** | Next bump — frontend 15.2.9→15.5.15, admin 16.1.6→16.2.4 | **미적용** | **PROCEED** | 현재 lockfile 실측: frontend `next@15.2.9`, admin `next@16.1.6`. runtime 경로 trigger 표면은 매우 좁음 (middleware/Server Actions/next/image/rewrites **모두 미사용**). DoS 공격표면 (Server Components) 은 유효 → 패치 필요 |
| **SEC-C** | npm audit fix (axios + transitive) | **미적용** | **PROCEED** | axios `1.14.0` (<1.15.0 취약범위) 확인. 모든 LLM adapter 에서 direct import. `npm audit fix` non-breaking 으로 해소 가능 |
| **신규 발견** | frontend `uuid <14` + `next-auth <=4.24.14` | **미적용** | **권고 (Moderate)** | 선행 감사 §2.2 에 누락된 GHSA-w5hq-g745-h8pq (Missing buffer bounds check). next-auth v4 종속 — 업스트림 없어서 SEC-C 본 PR 에서 해소 불가. Sprint 7 W1~W2 후속 PR 로 분리 권장 |
| SEC-REV-002 | Rate limit violations decay | **해소 완료** | N/A | `ws_rate_limiter.go:138~146` — `consecutiveAllowed` 누적 기반 decay 구현됨 |
| SEC-REV-008 | Hub RLock 내 외부 호출 | **해소 완료** | N/A | `ws_hub.go:100~130` — Snapshot-then-iterate 패턴 (snapshotRoom → lock 해제 후 Send) |
| SEC-REV-009 | panic 전파 방어 | **해소 완료** | N/A | `ws_hub.go:166~180` — `invokeCallback` defer-recover 가드 |

**최종 판정**: SEC-A / SEC-B / SEC-C **3건 모두 PROCEED**. 단, SEC-A 는 머지 전에 `go.mod` 에 `toolchain go1.25.9` 한 줄 추가 **필수**. 현재 상태로 머지하면 CI runner 는 `golang:1.25-alpine` 이 자동 최신 pull 하므로 통과하겠으나, 로컬/재현성 측면에서 govulncheck 게이트가 **매 실행 환경에 따라 결과가 달라지는 재현성 결함** 보유.

---

## 2. SEC-A 상세 — Go toolchain 1.24→1.25 + go-redis v9.7.0→v9.7.3

### 2.1 현재 브랜치 상태

```
src/game-server/go.mod
  line 3:  go 1.25          ← 언어 버전만 지정
           (toolchain directive 없음)
  line 14: github.com/redis/go-redis/v9 v9.7.3   ← 반영 완료
src/game-server/Dockerfile
  line 10: FROM golang:1.25-alpine AS deps        ← 반영 완료
  line 21: FROM deps AS builder                   (상속)
.gitlab-ci.yml
  line 162: image: golang:1.25-alpine             ← 반영 완료 (lint-go)
```

### 2.2 go.mod `go` directive vs. `toolchain` directive 차이

Go 1.21 이후 `go.mod` 는 두 필드를 분리한다:
- `go 1.25` — 언어/API **호환성 레벨**. "이 모듈은 1.25 이상에서 빌드 가능"
- `toolchain go1.25.9` — **실제 컴파일러 버전 강제**. CI/로컬 모두에 일괄 반영

현 브랜치는 `toolchain` directive 가 없어서 **각 개발자 환경의 `GOTOOLCHAIN` 환경변수에 따라 결과가 달라진다**. 필자 환경 (`GOTOOLCHAIN=auto`, 로컬 `go1.25.0`) 에서 govulncheck 는 `go1.25.0` 기준으로 stdlib 를 평가하여 **19건 code-called** 잔존.

### 2.3 govulncheck 재실행 결과 (post-bump, 현재 브랜치)

**Before (Sprint 6 감사 §3.1 70번 리포트, go1.24.1)**: code-called **25건**
**After (현재, go1.25.0, go-redis v9.7.3)**: code-called **19건**

**제거된 6건**:
| # | ID | 카테고리 |
|---|-----|---------|
| 1 | GO-2025-3540 | **go-redis out-of-order** — v9.7.3 bump 로 완전 해소 ✅ |
| 2 | GO-2025-3563 | net/http chunked smuggling (1.24.2+) |
| 3 | GO-2025-3751 | net/http cross-origin header leak (1.24.4+) |
| 4 | GO-2025-3750 | os/syscall Windows only (1.24.4+) — Linux K8s 무관 |
| 5 | GO-2025-3849 | database/sql percentile (1.24.6+) |
| 6 | 기타 toolchain 정리로 매칭 해제 |

**잔여 19건 (모두 stdlib, 로컬 `go1.25.0` 기준)**:

| # | Vuln ID | 모듈 | Fixed in | Severity 추정 | 실제 호출 경로 |
|---|---------|------|---------|-------------|-------------|
| 1 | GO-2026-4947 | crypto/x509 | 1.25.9 | moderate | seed-finder (prod 무관) |
| 2 | GO-2026-4946 | crypto/x509 | 1.25.9 | moderate | seed-finder |
| 3 | **GO-2026-4870** | crypto/tls | **1.25.9** | **high** (KeyUpdate DoS) | server + AI client + Redis DialWithDialer |
| 4 | GO-2026-4865 | html/template | 1.25.9 | moderate (XSS) | middleware.init + template.Parse |
| 5 | GO-2026-4602 | os | 1.25.8 | low | ws_connection.Close |
| 6 | GO-2026-4601 | net/url | 1.25.8 | moderate | AIClient.HealthCheck + JWKS |
| 7 | GO-2026-4341 | net/url | 1.25.6 | moderate | ranking handler DefaultQuery |
| 8 | **GO-2026-4340** | crypto/tls | **1.25.6** | **high** (handshake encryption level) | TLS 전체 경로 |
| 9 | GO-2026-4337 | crypto/tls | 1.25.7 | moderate | session resumption |
| 10 | GO-2025-4175 | crypto/x509 | 1.25.5 | low | seed-finder only |
| 11 | GO-2025-4155 | crypto/x509 | 1.25.5 | low | seed-finder only |
| 12 | GO-2025-4013 | crypto/x509 | 1.25.2 | low | seed-finder only |
| 13 | **GO-2025-4012** | net/http | 1.25.2 | moderate (cookie memory) | AIClient.HealthCheck |
| 14 | GO-2025-4011 | encoding/asn1 | 1.25.2 | moderate | ws_connection |
| 15 | GO-2025-4010 | net/url | 1.25.2 | moderate | AIClient + JWKS |
| 16 | GO-2025-4009 | encoding/pem | 1.25.2 | moderate | ws_connection |
| 17 | GO-2025-4008 | crypto/tls | 1.25.2 | moderate | ALPN |
| 18 | GO-2025-4007 | crypto/x509 | 1.25.3 | moderate | GORM Postgres 연결 |
| 19 | GO-2025-4006 | net/mail | 1.25.2 | low | auth GoogleLoginByIDToken |

### 2.4 GO-2026 계열 8건 커버 목록 (선행 요청)

Go 1.25.9 가 커버하는 GO-2026 계열 8건:

| # | Vuln ID | 모듈 | 심각도 | 1.25.X 패치 릴리스 | Runtime 경로 여부 |
|---|---------|------|-------|------------------|----------------|
| 1 | GO-2026-4947 | crypto/x509 | moderate | 1.25.9 | ❌ seed-finder only |
| 2 | GO-2026-4946 | crypto/x509 | moderate | 1.25.9 | ❌ seed-finder only |
| 3 | **GO-2026-4870** | crypto/tls | **HIGH** | 1.25.9 | ✅ server+AI client+Redis |
| 4 | GO-2026-4865 | html/template | moderate | 1.25.9 | ✅ middleware.init |
| 5 | GO-2026-4602 | os | low | 1.25.8 | ✅ ws_connection (탈출 영향) |
| 6 | GO-2026-4601 | net/url | moderate | 1.25.8 | ✅ AIClient+JWKS |
| 7 | GO-2026-4341 | net/url | moderate | 1.25.6 | ✅ ranking handler |
| 8 | **GO-2026-4340** | crypto/tls | **HIGH** | 1.25.6 | ✅ TLS 전체 |

**1.25.9 = 최소 cutover 버전**. 1.25.8 또는 1.25.6 로도 대부분 커버되나 crypto/x509 GO-2026-4946/4947 와 crypto/tls GO-2026-4870 을 고려하면 **최신 1.25.9 로 고정 권장**.

### 2.5 go-redis v9.7.0 → v9.7.3 cross-check

`go.mod:14` + `go.sum:98~99` 모두 `v9.7.3` 확인. govulncheck 출력에서 GO-2025-3540 (out-of-order responses) 완전 소거. Redis 연결 초기화 (`infra.NewRedisClient`) 경로가 안전화됨.

### 2.6 테스트 회귀

`go test ./... -count=1 -timeout 120s` → **모든 패키지 PASS** (e2e / client / config / engine / handler / middleware / service). 빌드 에러·API 호환성 문제 없음.

### 2.7 SEC-A 머지 전 보완 권고

**필수**:
1. `src/game-server/go.mod` 에 `toolchain go1.25.9` directive 1줄 추가 — line 3 (`go 1.25`) 직후. 예:
   ```
   module github.com/k82022603/RummiArena/game-server

   go 1.25

   toolchain go1.25.9
   ```
   이 한 줄 추가로 **19건 → 0건** 완전 제거. CI/로컬 재현성 모두 확보.
2. Dockerfile 의 `golang:1.25-alpine` 은 현재 자동 최신이므로 그대로 두거나 **재현성 위해 `golang:1.25.9-alpine3.20` 로 pin 권장**.

**선택**:
3. `.gitlab-ci.yml` lint-go 잡에도 동일 tag pin.

### 2.8 SEC-A 최종 판정: **PROCEED (보강 필요)**

- go-redis 측: **완전 해소**
- stdlib 측: toolchain directive 추가 전까지 code-called 19건 잔존 (로컬 환경 기준)
- CI 환경 (Docker `golang:1.25-alpine`) 에서는 빌드 시점 최신 1.25.X 가 자동 반영되므로 **runtime 이미지는 안전**
- 감사 리포트 게이트 통과 조건: `toolchain go1.25.9` directive 필수. 머지 전 보강하면 govulncheck code-called = **0** 달성

---

## 3. SEC-B 상세 — Next.js bump

### 3.1 Runtime Trigger 경로 분석

현 코드베이스의 Next.js 사용 표면을 grep 전수 조사.

| 기능 | 사용 여부 | 근거 | 관련 CVE 악용 가능성 |
|-----|---------|------|-----------------|
| `middleware.ts` | ❌ **미사용** | frontend/admin 둘 다 존재 안 함 | GHSA-4342-x723-ch2f (SSRF middleware redirect) **영향 없음** |
| `"use server"` (Server Actions) | ❌ **미사용** | `grep -rn "use server"` = 0 hits | GHSA-mq59-m269-xvcx (null origin CSRF) **영향 없음** |
| `<Image>` / `next/image` | ❌ **미사용** | `grep -rn "next/image"` = 0 hits | GHSA-9g9p-9gw9-jx7f, GHSA-3x4c-7xq6-9pq8, GHSA-xv57-4mr9-wg8v, GHSA-g5qg-72qw-gw5v **모두 영향 없음** |
| `rewrites` (next.config) | ❌ **미사용** | `next.config.ts` 는 보안 헤더만 설정 (frontend + admin 동일) | GHSA-ggv3-7p47-pfv8 (request smuggling) **영향 제한적** |
| Server Components 렌더링 | ✅ **사용** | Next 15 App Router 기본 | **GHSA-q4gf-8mx6-v5v3 (CVSS 7.5 DoS) 적용** |
| Dev HMR | ✅ (dev only) | 프로덕션 영향 없음 | GHSA-jcc7-9wpm-mj36 dev-only |
| Postponed resume | ✅ (PPR 가능) | App Router 기본 behavior | GHSA-h27x-g6w4-24gq (DoS) 적용 가능 (admin 측) |

### 3.2 실제 리스크 (High → 2건만 유효)

**frontend (15.2.9 → 15.5.15)**:
- **GHSA-q4gf-8mx6-v5v3** — Server Components DoS (CVSS 7.5) — **유효**. 모든 App Router 페이지 (`/`, `/login`, `/game/[roomId]` 등) 에서 악의적 요청으로 서버 CPU/메모리 고갈 가능.
- 나머지 6건 (cache confusion, content injection, SSRF middleware, image DoS × 2, smuggling) — 사용하지 않는 기능이라 **실질 exploit 어려움**

**admin (16.1.6 → 16.2.4)**:
- **GHSA-q4gf-8mx6-v5v3** — 동일 Server Components DoS — **유효** (admin 트래픽은 내부이지만 인증 전 경로도 영향)
- **GHSA-h27x-g6w4-24gq** — postponed resume buffering DoS — 유효 (App Router)
- 나머지 4건 (smuggling / image DoS / null origin CSRF / dev HMR) — 사용하지 않는 기능

### 3.3 minor 점프 리스크

- frontend **15.2 → 15.5** (3단계 minor 점프)
  - Next 15.3: `experimental.after`, `turbopack` 개선
  - Next 15.4: `unstable_allowDynamic` 강화
  - Next 15.5: React 19.1 + DevTools 개편
  - **Playwright E2E 전수 재실행 필수** (회귀 가능성 존재)
- admin **16.1 → 16.2** (1 minor) — 낮은 리스크

### 3.4 호환성 점검 요소

- NextAuth v4.24.11 ↔ Next 15.5: 커뮤니티 보고상 호환 확인. 단 `getServerSession` import 경로 변화 가능성 (참조: `src/frontend/src/app/api/auth/[...nextauth]/route.ts` 존재 여부는 미확인, 빌드 검증 필요).
- Tailwind v3 (frontend) / v4 (admin) + Next 15.5/16.2 — 프로덕션 빌드 산출물 확인 필요.

### 3.5 SEC-B 최종 판정: **PROCEED**

- 실 runtime exploit 표면은 **Server Components DoS 1건** (양쪽 공통) + admin 측 postponed resume DoS 1건
- 패치하지 않으면 DoS 공격에 노출 — 승격 권고
- 머지 후 **Playwright E2E 전수 재실행 필수** (선행 75번 계획서 §2.2 Verification 기준 준수)
- 추가 리스크 시나리오 (minor 회귀) 대응: qa 가 failing 5건+ 식별 시 frontend-dev 가 Next 15.5 release note 검토 후 부분 롤백 또는 15.3 단계적 upgrade 대안

---

## 4. SEC-C 상세 — npm audit fix

### 4.1 ai-adapter production 경로 6건 재확인

| 패키지 | 현재 버전 | 취약 범위 | Severity | Advisory | import chain | False positive? |
|-------|---------|---------|---------|---------|-------------|----------------|
| `axios` | **1.14.0** | 1.0.0~1.14.0 | moderate × 2 | GHSA-3p68-rc4w-qgx5 (NO_PROXY SSRF), GHSA-fvcv-3m26-pcqx (Header Injection → Cloud Metadata Exfil) | **Direct import**: `openai.adapter.ts`, `claude.adapter.ts`, `deepseek.adapter.ts`, `ollama.adapter.ts`, `dashscope.service.ts` | ❌ **진짜 취약**. LLM API 호출 전 경로. `npm audit fix` 로 `>=1.15.0` 자동 bump (semver ^1.6.0 범위 내) |
| `@nestjs/core` | `<=10.4.22` (현 `^10.0.0`) | `<=11.1.17` | moderate | GHSA-36xv-jgw5-4q75 (Injection) | Direct | ⚠️ **메이저 bump 필요** — `npm audit fix --force` 아니면 해소 불가. SEC-C non-breaking 범위 밖. **P1 별도 PR 로 이관** |
| `file-type` | transitive via `@nestjs/common` | 13.0.0~21.3.1 | moderate × 2 | GHSA-5v7r-6r5c-r473 (ASF DoS), GHSA-j47w-4g3g-c36v (ZIP bomb) | Transitive. **파일 업로드 엔드포인트 미확인**. 현재 ai-adapter 는 JSON-only API 이므로 **exploitability 매우 낮음** | ⚠️ @nestjs/common bump 에 종속 |
| `follow-redirects` | transitive via axios | `<=1.15.11` | moderate | GHSA-r4q5-vmmm-2653 (Auth header leak on redirect) | Transitive via axios | ✅ **axios bump 시 자동 해소** |

### 4.2 frontend/admin transitive moderate

| 패키지 | 경로 | Severity | 실제 영향 |
|-------|------|---------|---------|
| `brace-expansion` | frontend + admin @typescript-eslint, 기타 | moderate (GHSA-f886-m6hf-6m8v) | **dev-only**. 실 runtime 영향 없음. `npm audit fix` non-breaking |

### 4.3 ai-adapter dev 경로 주요 High (본 PR 제외 범위)

| 패키지 | Severity | 조치 | 본 PR 포함? |
|-------|---------|------|----------|
| `@typescript-eslint/*` 6.x → 7.6+ | high × 5 (minimatch ReDoS) | `npm i -D @typescript-eslint/eslint-plugin@latest` | ❌ P1 별도 PR |
| `@nestjs/cli` 10 → 11.1+ | high | 메이저 bump | ❌ P1 별도 PR |
| `glob 10.2~10.4.5` | high (command injection) | @nestjs/cli bump 로 해결 | ❌ |
| `minimatch 9.0.0~9.0.6` | high × 3 | typescript-eslint bump | ❌ |
| `picomatch <=2.3.1` | high × 2 | schematics bump | ❌ |
| `webpack buildHttp` | low × 2 | HttpUriPlugin 미사용 — exploitability 0 | ❌ 추적만 |

### 4.4 `--omit=dev` Critical/High=0 유지 검증 방법

```bash
# 본 PR 머지 후 CI 또는 pre-push 에서 자동 게이트
cd src/ai-adapter && npm audit --audit-level=high --omit=dev
# → exit 0 기대

cd src/frontend && npm audit --audit-level=high --omit=dev
# → 기존 next High 해소 후 + 신규 uuid moderate 1건만 남음 → exit 0 (high=0)

cd src/admin && npm audit --audit-level=high --omit=dev
# → 기존 next High 해소 후 → exit 0
```

`package.json` 의 `overrides` 필드 (ai-adapter 는 multer/path-to-regexp/lodash 3개 pin) 는 그대로 유지. SEC-C 는 lockfile 만 update.

### 4.5 SEC-C 최종 판정: **PROCEED**

- ai-adapter axios **진짜 취약** → `npm audit fix` (non-breaking, `^1.6.0` 범위 내 `>=1.15.0` 자동 bump) 필수
- follow-redirects 는 axios bump 에 종속 자동 해소
- brace-expansion 은 dev-only transitive
- @nestjs/core / file-type 는 본 PR 에서 제외 (breaking change) — P1 별도 PR 이관

---

## 5. 신규 발견 (선행 감사 70번 누락 항목)

### 5.1 frontend `uuid <14` + `next-auth <=4.24.14`

선행 70번 §2.2 에서 빠진 **새로 승격된 production 경로 취약점**:

| 패키지 | 버전 | Severity | Advisory | 경로 |
|-------|------|---------|---------|------|
| `uuid` | `<14.0.0` | moderate | GHSA-w5hq-g745-h8pq (Missing buffer bounds check in v3/v5/v6 when buf is provided) | next-auth transitive |
| `next-auth` | `<=4.24.14` | moderate (의존성 경유) | — | **production direct** |

**업스트림 fix**:
- `npm audit fix --force` 권고는 `next-auth@3.29.10` (downgrade) — **절대 수용 불가**
- 실제 fix: next-auth v5 (Auth.js) 메이저 이주 필요
- 완화책: uuid v3/v5/v6 `buf` 파라미터 전달 경로가 next-auth 내부에 있는지 확인 (현재 미확인, 코드 검증 필요)

**권고**: SEC-C 본 PR 에서 처리 불가. **Sprint 7 W1~W2 별도 PR 로 next-auth v5 (Auth.js) 이주 타당성 검토** — 이주 범위 광범위 (session strategy, callbacks, adapter 재설계) 이므로 **ADR 선행 필요**.

**Day 2 영향**: 없음 (SEC-B/C 머지 후에도 잔존하는 moderate 1건으로 `--audit-level=high` 게이트는 통과).

---

## 6. SEC-REV-002/008/009 재점검 결과

### 6.1 SEC-REV-002 — Rate Limit violations 감소 로직 (Medium)

- **상태**: **해소 완료**
- **구현**: `src/game-server/internal/handler/ws_rate_limiter.go:138~146`
  ```go
  // SEC-REV-002: 연속 허용이 임계값(5회) 누적된 경우에만 violations 1 감소.
  if rl.violations > 0 {
      rl.consecutiveAllowed++
      if rl.consecutiveAllowed >= violationsDecayThreshold {
          rl.violations--
          rl.consecutiveAllowed = 0
      }
  }
  ```
- **공격 패턴 "위반-정상-위반-정상" 회피 검증**: `consecutiveAllowed` 필드로 위반 이후 연속 정상 카운트. 정상 5회 연속이어야 violations 1 감소. 악용 불가.
- **향후 추가 조치**: 없음. Sprint 6 이관 항목 종결 처리 가능.

### 6.2 SEC-REV-008 — Hub RLock 내 외부 호출 (Medium)

- **상태**: **해소 완료**
- **구현**: `src/game-server/internal/handler/ws_hub.go:100~130`
  - `snapshotRoom(roomID)` / `snapshotRoomExcept(roomID, excludeUserID)` — RLock 내부에서 conn slice 생성 후 즉시 RUnlock
  - `BroadcastToRoom` / `BroadcastToRoomExcept` / `SendToUser` — lock 해제 후 `Send()` 호출
  - 주석 명시 ("SEC-REV-008: Snapshot-then-iterate — lock is released before Send()")
- **공격 경로 차단**: Hub lock 점유 중 Redis GET / DB query / JSON marshal 수행 가능성 제거. Register/Unregister 의 Write Lock 경합 최소화.
- **향후 추가 조치**: 없음.

### 6.3 SEC-REV-009 — panic 전파 가능성 (Medium)

- **상태**: **해소 완료**
- **구현**: `src/game-server/internal/handler/ws_hub.go:166~180`
  - `invokeCallback(roomID, conn, fn)` — 각 콜백을 defer-recover 가드로 래핑
  - 주석 명시 ("SEC-REV-009: Each callback invocation is wrapped in a defer-recover")
- **공격 경로 차단**: 4인 방에서 conn 2 처리 중 panic 발생 → conn 3, 4 는 정상 콜백 실행. 부분 서비스 불능 방지.
- **향후 추가 조치**: 없음.

### 6.4 SEC-REV 재점검 결론

**3건 모두 이미 해소됨**. Sprint 6 이관 Medium 은 사실상 부재. Sprint 7 TODO 에서 "SEC-REV-002/008/009 미완료" 항목 제거 권장.

---

## 7. 후속 조치 권장

### 7.1 Day 2 즉시 (SEC-A/B/C PR 머지 전)

| # | 조치 | 담당 | 근거 |
|---|------|------|------|
| 1 | **SEC-A PR 에 `toolchain go1.25.9` directive 추가** (go.mod line 5) | devops | 본 리포트 §2.2, §2.7. toolchain directive 없으면 CI 환경 의존적 — 재현성 위해 필수 |
| 2 | (선택) Dockerfile `golang:1.25.9-alpine3.20` 으로 tag pin | devops | §2.7 |
| 3 | SEC-B 머지 전 `middleware.ts` / `next/image` / `use server` / `rewrites` 4가지 기능 **도입 예정 없음** 확인 | architect 또는 frontend-dev | §3.1 트리거 경로 분석 — 추가 도입 시 재평가 필요 |
| 4 | SEC-B 머지 후 Playwright E2E **전수 재실행** + **4 FAIL + 신규 0** 게이트 | qa | 선행 75번 §2.2 verification + §4.2 리스크 시나리오 |
| 5 | SEC-C 머지 후 `npm audit --audit-level=high --omit=dev` → exit 0 3개 프로젝트 모두 확인 | devops | §4.4 |

### 7.2 Sprint 7 Week 1~2 (별도 PR)

| # | 조치 | 담당 | 근거 |
|---|------|------|------|
| 6 | `@typescript-eslint/*` 7.6+ bump (ai-adapter dev) | node-dev | §4.3 |
| 7 | `@nestjs/cli` 10 → 11.1+ bump | node-dev | §4.3 |
| 8 | `jest-environment-jsdom` 30.x bump (frontend dev) | frontend-dev | 70번 §4.2 |
| 9 | **next-auth v5 (Auth.js) 이주 ADR 작성** | architect | §5. next-auth v4 의 uuid transitive moderate 해소 유일 경로 |
| 10 | **`.gitlab-ci.yml` 에 `sca-npm-audit` + `sca-govulncheck` + `weekly-dependency-audit` 잡 추가** | devops | 70번 §6. 새 CVE 드리프트 감지용 (6일 사이 GO-2026 8건 공개 사례 재발 방지) |

### 7.3 Sprint 7 Week 2+ (후순위)

| # | 조치 | 담당 | 근거 |
|---|------|------|------|
| 11 | `@nestjs/core` v10 → v11 메이저 bump (Injection moderate 해소) | node-dev | 70번 §5.1 |
| 12 | gin v1.10 → v1.12, pgx v5.6 → v5.9, gorm v1.25 → v1.31 | go-dev | 70번 §3.2 |
| 13 | `cloud.google.com/go/*` 사용 여부 점검 후 미사용 시 제거 | go-dev | 70번 §5.1 |

### 7.4 Sprint 7 TODO 정리

- ✅ **SEC-REV-002/008/009 Sprint 6 이관** → **종결 처리** (모두 해소 확인)
- ✅ Day 12 backend P0-1 (`game_results` persistence) → 종결 (선행 75번 §2.4 확인)
- ✅ Day 12 backend P0-2 (GAME_OVER broadcast) → 종결 (선행 75번 §2.5 확인)

---

## 8. 최종 결론

| 질문 | 답변 |
|-----|-----|
| SEC-A bump 판정 | **PROCEED (go.mod 에 `toolchain go1.25.9` 추가 필수)**. 현 상태 stdlib code-called 19건 잔존 (로컬 환경 기준). toolchain directive 1줄로 0건 달성. go-redis 는 완전 해소 |
| SEC-B bump 판정 | **PROCEED**. 실제 exploit 표면은 Server Components DoS (CVSS 7.5) + admin postponed resume DoS 2건. 나머지 4건 (middleware/image/actions/rewrites) 은 **미사용 기능**이라 영향 없으나 defense-in-depth 관점 패치 권장. Playwright 전수 재실행 필수 |
| SEC-C bump 판정 | **PROCEED**. axios SSRF/Header Injection 2건 (direct import, 모든 LLM adapter) → non-breaking bump. @nestjs/core / file-type 는 메이저 bump 필요 → P1 별도 PR |
| SEC-REV-002/008/009 현황 | **3건 모두 이미 해소됨** (ws_rate_limiter.go + ws_hub.go). Sprint 7 TODO 에서 제거 권장 |
| 신규 발견 | frontend `uuid <14` (GHSA-w5hq-g745-h8pq) via next-auth v4 — 업스트림 fix 부재로 SEC-C 에서 해소 불가. next-auth v5 이주 ADR 선행 필요 |
| 게이트 상태 (Day 2 3개 PR 머지 완료 후 예상) | production 경로 Critical/High = **0**. moderate 잔존 (axios→0, next-auth uuid 1건, @nestjs/core 1건, file-type 2건) — **`--audit-level=high` 게이트 통과** |

**감사 판정**: **3건 PROCEED**. SEC-A 에만 `toolchain` directive 1줄 보강 조건 추가.

---

## 부록 A. 재현 명령

```bash
# Go 감사
cd src/game-server && govulncheck -mode=source ./...
grep -E "^go |^toolchain " go.mod   # toolchain directive 확인
cd src/game-server && go test ./... -count=1 -timeout 120s

# npm 감사 (production)
cd src/frontend && npm audit --audit-level=low --omit=dev
cd src/admin && npm audit --audit-level=low --omit=dev
cd src/ai-adapter && npm audit --audit-level=low --omit=dev

# npm 감사 (전체 포함 dev)
cd src/frontend && npm audit --audit-level=low
cd src/admin && npm audit --audit-level=low
cd src/ai-adapter && npm audit --audit-level=low

# Runtime trigger 경로 검증
grep -rn "use server" src/frontend/src src/admin/src
grep -rn "next/image\|<Image" src/frontend/src src/admin/src
find src/frontend src/admin -name "middleware.ts" -not -path "*/node_modules/*"
grep -rn "rewrites\|redirects" src/frontend/next.config.ts src/admin/next.config.ts
```

## 부록 B. 참조

- `docs/04-testing/70-sec-rev-013-dependency-audit-report.md` — Sprint 6 마감 감사
- `docs/04-testing/75-sec-day12-impact-and-plan.md` — architect 영향 분석 및 실행 계획
- `docs/02-design/26-sec-rev-medium-impact-analysis.md` — SEC-REV Medium 분석 (002/008/009 원본)
- `docs/04-testing/36-security-review-phase1.md` — SEC-REV Phase 1 원본
- GHSA 공식 페이지:
  - https://github.com/advisories/GHSA-q4gf-8mx6-v5v3 (Next Server Components DoS)
  - https://github.com/advisories/GHSA-mq59-m269-xvcx (Next null origin CSRF)
  - https://github.com/advisories/GHSA-ggv3-7p47-pfv8 (Next request smuggling)
  - https://github.com/advisories/GHSA-3p68-rc4w-qgx5 (axios NO_PROXY SSRF)
  - https://github.com/advisories/GHSA-fvcv-3m26-pcqx (axios Header Injection)
  - https://github.com/advisories/GHSA-w5hq-g745-h8pq (uuid buffer bounds)
  - https://pkg.go.dev/vuln/GO-2025-3540 (go-redis out-of-order)
  - https://pkg.go.dev/vuln/GO-2026-4870 (Go crypto/tls KeyUpdate DoS)
  - https://pkg.go.dev/vuln/GO-2026-4340 (Go crypto/tls handshake encryption level)
